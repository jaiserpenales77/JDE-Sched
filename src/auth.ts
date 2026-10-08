import { useEffect, useState } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "./firebase";
import type { ShiftKey } from "./types";
import { SHIFT_KEYS } from "./types";

// Each shift has one shared password: it's the password of that shift's
// Firebase account, "<shift>@jde-sched.local" (created in the Firebase
// console). The database rules only let each account open its own shift's
// data, so a shift's password opens that shift and nothing else.
const ACCOUNT_DOMAIN = "jde-sched.local";

export function shiftAccountEmail(shift: ShiftKey): string {
  return `${shift}@${ACCOUNT_DOMAIN}`;
}

function shiftOfEmail(email: string | null | undefined): ShiftKey | null {
  const [name, domain] = (email ?? "").toLowerCase().split("@");
  return domain === ACCOUNT_DOMAIN && (SHIFT_KEYS as readonly string[]).includes(name) ? (name as ShiftKey) : null;
}

// The sign-in lasts until the app is closed (see firebase.ts). But browsers
// that reopen closed tabs ("Continue where you left off", Ctrl+Shift+T)
// bring the tab's sign-in back with it. So the tab notes the moment it is
// left - closed, refreshed or navigated away - and if it comes back later
// than a refresh would take, it was closed, and it starts locked.
const LEFT_AT_KEY = "jde-sched-left-at";
const REFRESH_GRACE_MS = 30_000;

window.addEventListener("pagehide", () => {
  try {
    sessionStorage.setItem(LEFT_AT_KEY, String(Date.now()));
  } catch {
    // Storage blocked: nothing is kept between page loads anyway.
  }
});

function leftAt(): number {
  try {
    return Number(sessionStorage.getItem(LEFT_AT_KEY)) || 0;
  } catch {
    return 0;
  }
}

const reopenedAfterClose = Date.now() - leftAt() > REFRESH_GRACE_MS;
// Settles once the sign-in this tab came back with has been checked.
const startup: Promise<void> = auth
  .authStateReady()
  .then(() => (reopenedAfterClose && auth.currentUser ? signOut(auth) : undefined))
  .catch((err) => console.error("Couldn't check the saved sign-in.", err));

export type ShiftAuth =
  | { status: "loading"; shift: null }
  | { status: "locked"; shift: null }
  | { status: "unlocked"; shift: ShiftKey };

// Which shift this tab is unlocked for. It stays unlocked through
// refreshes, until the app is closed or someone clicks Lock.
export function useShiftAuth(): ShiftAuth {
  const [state, setState] = useState<ShiftAuth>({ status: "loading", shift: null });
  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | undefined;
    void startup.then(() => {
      if (cancelled) return;
      stop = onAuthStateChanged(auth, (user) => {
        const shift = shiftOfEmail(user?.email);
        // Signed in with something that isn't a shift account: treat as locked.
        setState(shift ? { status: "unlocked", shift } : { status: "locked", shift: null });
      });
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);
  return state;
}

// Plain-language reason a password didn't work.
export function unlockErrorMessage(err: unknown, shiftLabel: string): string {
  const code = (err as { code?: string })?.code ?? "";
  if (code === "auth/too-many-requests") {
    return "Too many tries. Wait a few minutes, then try again.";
  }
  if (code === "auth/network-request-failed") {
    return "Can't reach the internet. Check this computer's connection and try again.";
  }
  if (code === "auth/user-disabled") {
    return `The ${shiftLabel} login has been turned off.`;
  }
  return `That password isn't right for ${shiftLabel}. Check it and try again.`;
}

export async function unlockShift(shift: ShiftKey, password: string): Promise<void> {
  if (auth.currentUser) await signOut(auth);
  await signInWithEmailAndPassword(auth, shiftAccountEmail(shift), password);
}

export async function lockApp(): Promise<void> {
  await signOut(auth);
}
