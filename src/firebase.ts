import { initializeApp } from "firebase/app";
import { browserSessionPersistence, connectAuthEmulator, initializeAuth } from "firebase/auth";
import { connectFirestoreEmulator, initializeFirestore } from "firebase/firestore";

// This apiKey is meant to be public - Firebase's actual access control
// comes from the Firestore security rules (see project README/setup
// notes), not from keeping this config secret.
const firebaseConfig = {
  apiKey: "AIzaSyANgwpQIp6SybjkZgpVtvusTc9SEdkTFeg",
  authDomain: "jde-schedule-database.firebaseapp.com",
  projectId: "jde-schedule-database",
  storageBucket: "jde-schedule-database.firebasestorage.app",
  messagingSenderId: "200523177124",
  appId: "1:200523177124:web:9459478521f146e28d9a31",
};

export const firebaseApp = initializeApp(firebaseConfig);
// Firestore's default transport streams over WebSockets/gRPC-Web, which
// some networks (corporate proxies, restrictive factory-floor firewalls)
// block outright. Auto-detecting long-polling falls back to plain
// repeated HTTPS requests on those networks instead of failing silently.
export const db = initializeFirestore(firebaseApp, { experimentalAutoDetectLongPolling: true });
// Each shift unlocks the app with its own password - see auth.ts. The
// sign-in is kept only for this browser tab: refreshing keeps it, closing
// the app throws it away, so the password is needed every time it's opened.
export const auth = initializeAuth(firebaseApp, { persistence: browserSessionPersistence });

// Local testing only: a build made with VITE_FIREBASE_EMULATORS=1 talks to
// the Firebase emulators on this computer instead of the live database.
if (import.meta.env.VITE_FIREBASE_EMULATORS === "1") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}
