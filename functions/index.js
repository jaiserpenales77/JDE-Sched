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
//   temporary: [{ ip, label, by, until, listed? }] - networks allowed from
//              the Hub (lineupNetwork, below), each until its date: an
//              Owner's own (home), or with `listed` one added from the
//              Activity Log or the Admin list for a number of days
//   labels:    { "<entry in allowed>": { label, by, at } } - the names of the
//              networks Owners added to `allowed` from the Hub's Activity Log
//   logSignIns: true / false - false stops the sign-in log (below); default on
// Changes apply to the next sign-in, with no redeploy.
//
// Every sign-in to the database's apps - LineUp, Cremer Recipes and the
// Packaging Lead Hub - also goes in the Hub's Activity Log (pk030-activity),
// with the app, the account and the network's IP address, whether the check
// is on or off: "Signed in", or "Sign-in refused (network)" when the check
// turned it away. Only the Hub's Admins and Owners can read that log.
const { beforeUserSignedIn, HttpsError: AuthError } = require("firebase-functions/v2/identity");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { isAllowed, plainIp } = require("./allowed");
const net = require("node:net");

initializeApp();

const LINEUP = /@jde-sched\.local$/i;
const HUB = /@pk030\.local$/i;
const NETWORK_DOC = "jde-sched-access/network";
// How long a network allowed from the Hub stays allowed.
const TEMPORARY_DAYS = 30;

// An entry for the allowed networks: an IP address, or a range like
// 198.51.100.0/24 (IPv4 or IPv6).
function validEntry(entry) {
  const [address, prefix, extra] = entry.split("/");
  if (extra !== undefined) return false;
  if (prefix === undefined) return net.isIP(address) !== 0;
  const max = net.isIPv6(address) ? 128 : net.isIPv4(address) ? 32 : 0;
  return max > 0 && /^\d{1,3}$/.test(prefix) && Number(prefix) <= max;
}

// The networks allowed now: the console's list, and the Hub's that haven't
// run out.
function allowedNow(settings, now = Date.now()) {
  const temporary = (Array.isArray(settings?.temporary) ? settings.temporary : [])
    .filter((t) => t && typeof t.ip === "string" && t.until?.toMillis?.() > now)
    .map((t) => t.ip);
  return [...(Array.isArray(settings?.allowed) ? settings.allowed : []), ...temporary];
}

const ACTIVITY = "pk030-activity";
// How long a sign-in waits for its log entry before going ahead without it.
const LOG_WAIT_MS = 2000;

// Which app an account belongs to, by its email.
function appOf(email) {
  const name = email.split("@")[0];
  if (HUB.test(email)) return "Packaging Lead Hub";
  if (LINEUP.test(email)) return name.startsWith("cremer-") ? "Cremer Recipes" : "LineUp";
  return "Other";
}

// Adds the sign-in to the Activity Log. Never holds a sign-in up for more
// than LOG_WAIT_MS, and never refuses one because the log couldn't be written.
async function logSignIn(event, action, detail = "") {
  try {
    const email = String(event.data?.email ?? "").toLowerCase();
    const entry = {
      uid: String(event.data?.uid ?? ""),
      username: email.split("@")[0] || email,
      action,
      detail,
      app: appOf(email),
      ip: plainIp(event.ipAddress),
      at: FieldValue.serverTimestamp(),
    };
    await Promise.race([
      getFirestore().collection(ACTIVITY).add(entry),
      new Promise((resolve) => setTimeout(resolve, LOG_WAIT_MS)),
    ]);
  } catch (err) {
    console.warn("Couldn't log the sign-in.", err);
  }
}

exports.allowedNetworksOnly = beforeUserSignedIn(async (event) => {
  const email = event.data?.email ?? "";
  const isLineUp = LINEUP.test(email);
  const isHub = HUB.test(email);
  // The settings decide the check for LineUp and Hub accounts (a failed read
  // fails their sign-in, as before) and whether sign-ins are logged.
  let settings = null;
  try {
    const snap = await getFirestore().doc(NETWORK_DOC).get();
    settings = snap.exists ? snap.data() : null;
  } catch (err) {
    if (isLineUp || isHub) throw err;
  }
  const refused = (isLineUp || isHub)
    && settings?.enabled === true
    && !(isHub && settings.hub !== true)
    && !isAllowed(event.ipAddress, allowedNow(settings));
  if (settings?.logSignIns !== false) {
    await logSignIn(event, refused ? "Sign-in refused (network)" : "Signed in", refused ? "Not an approved network" : "");
  }
  if (!refused) return;
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

// For the Hub, Owners only: see the network check, and allow the network
// they're on now (home) for TEMPORARY_DAYS, or take theirs off; add an IP
// address from the Activity Log to the allowed networks (until removed), or
// take an entry off them.
//   { action: "status", checkIps?: [ip, ...] }  (which of those are allowed)
//   { action: "allow" | "remove" }               (this network, 30 days)
//   { action: "allowIp", ip, label?, days? }     (an address or range: until
//                                                 removed, or for `days` days)
//   { action: "removeIp", ip }                   (that entry, wherever it is)
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
      // Keep the others' entries that haven't run out; this Owner has one
      // (their home network; not the ones they listed with allowIp).
      const temporary = (snap.data()?.temporary ?? [])
        .filter((t) => (t?.by !== username || t?.listed) && t?.until?.toMillis?.() > now);
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
  if (action === "allowIp" || action === "removeIp") {
    const raw = String(request.data?.ip ?? "").trim();
    const entry = raw.includes("/") ? raw : plainIp(raw);
    if (action === "allowIp" && !validEntry(entry)) throw new HttpsError("invalid-argument", "That isn't an IP address or range.");
    if (!entry) throw new HttpsError("invalid-argument", "Which network?");
    const days = request.data?.days == null ? 0 : Number(request.data.days);
    if (action === "allowIp" && days && !(Number.isInteger(days) && days >= 1 && days <= 365)) {
      throw new HttpsError("invalid-argument", "Days must be a whole number from 1 to 365.");
    }
    await db.runTransaction(async (tx) => {
      const data = (await tx.get(ref)).data() ?? {};
      const now = Date.now();
      // The entry comes off wherever it is (the list, its name, the temporary
      // ones), so it's in one place at a time: until removed, or for `days`.
      const allowed = (Array.isArray(data.allowed) ? data.allowed : []).filter((a) => String(a).trim() !== entry);
      const labels = { ...(data.labels ?? {}) };
      delete labels[entry];
      const temporary = (Array.isArray(data.temporary) ? data.temporary : [])
        .filter((t) => t?.until?.toMillis?.() > now && String(t?.ip ?? "").trim() !== entry);
      if (action === "allowIp") {
        const label = String(request.data?.label ?? "").trim().slice(0, 60) || `Added by ${username}`;
        if (days) {
          temporary.push({ ip: entry, label, by: username, until: Timestamp.fromMillis(now + days * 86_400_000), listed: true });
        } else {
          allowed.push(entry);
          labels[entry] = { label, by: username, at: Timestamp.now() };
        }
      }
      // All three replaced whole (a merge would keep a removed label).
      tx.set(ref, { allowed, labels, temporary }, { mergeFields: ["allowed", "labels", "temporary"] });
    });
  }
  const settings = (await ref.get()).data() ?? {};
  const now = Date.now();
  const checkIps = (Array.isArray(request.data?.checkIps) ? request.data.checkIps : [])
    .slice(0, 500).map((c) => plainIp(c)).filter((c) => net.isIP(c));
  return {
    ip,
    enabled: settings.enabled === true,
    hub: settings.hub === true,
    permanent: Array.isArray(settings.allowed) ? settings.allowed.length : 0,
    // The allowed list itself, with the names of entries added from the Hub
    // (entries typed in the console have none).
    permanentList: (Array.isArray(settings.allowed) ? settings.allowed : []).map((a) => {
      const named = settings.labels?.[String(a).trim()];
      return { ip: String(a).trim(), label: named?.label ?? "", by: named?.by ?? "", at: named?.at?.toMillis?.() ?? null };
    }),
    allowedIps: checkIps.filter((c) => isAllowed(c, allowedNow(settings, now))),
    allowedNow: !!ip && isAllowed(ip, allowedNow(settings, now)),
    temporary: (settings.temporary ?? [])
      .filter((t) => t?.until?.toMillis?.() > now)
      .map((t) => ({ ip: t.ip, label: t.label, by: t.by, until: t.until.toMillis(), listed: t.listed === true,
        mine: t.by === username && !t.listed })),
    days: TEMPORARY_DAYS,
  };
});
