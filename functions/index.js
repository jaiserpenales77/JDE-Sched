// LineUp's sign-in check (a Firebase Authentication "blocking function",
// which needs Identity Platform): a sign-in is refused unless it comes from
// one of the allowed networks - the company's and home.
//
// The allowed networks are NOT in this (public) repository. They're in the
// Firestore document jde-sched-access/network, which only the Firebase
// console can change (no app can read or write it):
//   enabled:  true / false        - false (or no document) = no check at all
//   allowed:  ["203.0.113.7", "198.51.100.0/24", "2001:db8:1234::/48"]
//             (IPv4 or IPv6 addresses, or ranges in CIDR form)
//   hub:      true / false        - also the Packaging Lead Hub's accounts
//                                   (username@pk030.local); default false
// Changes apply to the next sign-in, with no redeploy.
const { beforeUserSignedIn, HttpsError } = require("firebase-functions/v2/identity");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { isAllowed } = require("./allowed");

initializeApp();

const LINEUP = /@jde-sched\.local$/i;
const HUB = /@pk030\.local$/i;
const REFUSED = "LineUp can only be opened from the company's network or home.";

exports.allowedNetworksOnly = beforeUserSignedIn(async (event) => {
  const email = event.data?.email ?? "";
  const isLineUp = LINEUP.test(email);
  const isHub = HUB.test(email);
  if (!isLineUp && !isHub) return;
  const snap = await getFirestore().doc("jde-sched-access/network").get();
  const settings = snap.exists ? snap.data() : null;
  if (!settings || settings.enabled !== true) return;
  if (isHub && settings.hub !== true) return;
  if (isAllowed(event.ipAddress, settings.allowed)) return;
  console.warn(`Sign-in refused for ${email} from ${event.ipAddress}`);
  throw new HttpsError("permission-denied", REFUSED);
});
