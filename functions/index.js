// LineUp's sign-in check (a Firebase Authentication "blocking function",
// which needs Identity Platform): a sign-in is refused unless it comes from
// one of the allowed networks - the company's and home.
//
// The allowed networks are NOT in this (public) repository. They're in the
// Firestore document jde-sched-access/network, which no app can read or
// write directly:
//   enabled:   true / false   - false (or no document) = no check at all
//   allowed:   ["203.0.113.7", "198.51.100.0/24", "2001:db8:1234::/48"]
//              (IPv4 or IPv6 addresses, or CIDR ranges; set in the console)
//   hub:       true / false   - also the Packaging Lead Hub's accounts
//                               (username@pk030.local); default false
//   temporary: [{ ip, label, by, until }] - networks an Owner allowed from
//              the Hub (lineupNetwork, below), each until its date
// Changes apply to the next sign-in, with no redeploy.
const { beforeUserSignedIn, HttpsError: AuthError } = require("firebase-functions/v2/identity");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const { isAllowed, plainIp } = require("./allowed");
const net = require("node:net");

initializeApp();

const LINEUP = /@jde-sched\.local$/i;
const HUB = /@pk030\.local$/i;
const NETWORK_DOC = "jde-sched-access/network";
// How long a network allowed from the Hub stays allowed.
const TEMPORARY_DAYS = 30;

// The networks allowed now: the console's list, and the Hub's that haven't
// run out.
function allowedNow(settings, now = Date.now()) {
  const temporary = (Array.isArray(settings?.temporary) ? settings.temporary : [])
    .filter((t) => t && typeof t.ip === "string" && t.until?.toMillis?.() > now)
    .map((t) => t.ip);
  return [...(Array.isArray(settings?.allowed) ? settings.allowed : []), ...temporary];
}

exports.allowedNetworksOnly = beforeUserSignedIn(async (event) => {
  const email = event.data?.email ?? "";
  const isLineUp = LINEUP.test(email);
  const isHub = HUB.test(email);
  if (!isLineUp && !isHub) return;
  const snap = await getFirestore().doc(NETWORK_DOC).get();
  const settings = snap.exists ? snap.data() : null;
  if (!settings || settings.enabled !== true) return;
  if (isHub && settings.hub !== true) return;
  if (isAllowed(event.ipAddress, allowedNow(settings))) return;
  console.warn(`Sign-in refused for ${email} from ${event.ipAddress}`);
  throw new AuthError(
    "permission-denied",
    `LineUp can only be opened from the company's network or home. (This network: ${plainIp(event.ipAddress)})`,
  );
});

// The address a request comes from: the first valid one in X-Forwarded-For
// (set by Google's front end), else the connection's. The Hub shows it
// before it's added, to compare with "what is my IP".
function requestIp(req) {
  const forwarded = String(req.headers?.["x-forwarded-for"] ?? "")
    .split(",")
    .map((part) => plainIp(part))
    .find((part) => net.isIP(part));
  return forwarded || plainIp(req.ip || req.socket?.remoteAddress || "");
}

// For the Hub's Admin tab, Owners only: see the network check, and allow the
// network they're on now (home) for TEMPORARY_DAYS, or take theirs off.
//   { action: "status" | "allow" | "remove" }
exports.lineupNetwork = onCall(async (request) => {
  const email = request.auth?.token?.email ?? "";
  if (!HUB.test(email)) throw new HttpsError("permission-denied", "Sign in to the Packaging Lead Hub first.");
  const username = email.split("@")[0].toLowerCase();
  const db = getFirestore();
  const admins = await db.doc("pk030/admins").get();
  const owners = Array.isArray(admins.data()?.owners) ? admins.data().owners.map((o) => String(o).toLowerCase()) : [];
  if (!owners.includes(username)) throw new HttpsError("permission-denied", "Only an Owner can do this.");

  const ip = requestIp(request.rawRequest);
  const ref = db.doc(NETWORK_DOC);
  const action = request.data?.action ?? "status";
  if (action === "allow" || action === "remove") {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const now = Date.now();
      // Keep the others' entries that haven't run out; this Owner has one.
      const temporary = (snap.data()?.temporary ?? []).filter((t) => t?.by !== username && t?.until?.toMillis?.() > now);
      if (action === "allow") {
        if (!ip) throw new HttpsError("failed-precondition", "Couldn't tell which network this is.");
        temporary.push({
          ip,
          label: String(request.data?.label ?? "").slice(0, 60) || `${username} (home)`,
          by: username,
          until: Timestamp.fromMillis(now + TEMPORARY_DAYS * 86_400_000),
        });
      }
      tx.set(ref, { temporary }, { merge: true });
    });
  }
  const settings = (await ref.get()).data() ?? {};
  const now = Date.now();
  return {
    ip,
    enabled: settings.enabled === true,
    hub: settings.hub === true,
    permanent: Array.isArray(settings.allowed) ? settings.allowed.length : 0,
    allowedNow: !!ip && isAllowed(ip, allowedNow(settings, now)),
    temporary: (settings.temporary ?? [])
      .filter((t) => t?.until?.toMillis?.() > now)
      .map((t) => ({ ip: t.ip, label: t.label, by: t.by, until: t.until.toMillis(), mine: t.by === username })),
    days: TEMPORARY_DAYS,
  };
});
