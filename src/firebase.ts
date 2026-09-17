import { initializeApp } from "firebase/app";
import { initializeFirestore } from "firebase/firestore";

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
