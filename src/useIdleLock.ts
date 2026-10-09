import { useEffect, useRef, useState } from "react";

// Locks the app after this long with no click, key press, scroll or tap.
export const IDLE_LOCK_MINUTES = 60;
const IDLE_LOCK_MS = IDLE_LOCK_MINUTES * 60 * 1000;
// "Still there?" shows for this long before it locks.
const WARNING_MS = 60 * 1000;
// If it couldn't lock (a change hasn't reached the cloud), it tries again
// this often.
const RETRY_MS = 60 * 1000;
// Shared by every tab on this computer, so someone using one tab keeps
// the others unlocked too.
const LAST_ACTIVE_KEY = "jde-sched-last-active";
const SHARE_EVERY_MS = 10 * 1000;
// Moving the mouse alone doesn't count: a bumped mouse shouldn't keep it open.
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

export type IdleState =
  | { kind: "active" }
  | { kind: "warning"; secondsLeft: number }
  | { kind: "couldNotLock" };

function readShared(): number {
  try {
    return Number(localStorage.getItem(LAST_ACTIVE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeShared(at: number) {
  try {
    localStorage.setItem(LAST_ACTIVE_KEY, String(at));
  } catch {
    // Storage blocked: each tab keeps its own time.
  }
}

// tryLock saves and locks, and resolves false if it couldn't (the last
// change hasn't reached the cloud), so nothing is thrown away.
export function useIdleLock(enabled: boolean, tryLock: () => Promise<boolean>) {
  const [state, setState] = useState<IdleState>({ kind: "active" });
  const lastActive = useRef(0);
  const lastShared = useRef(0);
  const nextTryAt = useRef(0);
  const trying = useRef(false);
  const tryLockRef = useRef(tryLock);
  useEffect(() => {
    tryLockRef.current = tryLock;
  });

  function markActive() {
    const now = Date.now();
    lastActive.current = now;
    nextTryAt.current = 0;
    if (now - lastShared.current > SHARE_EVERY_MS) {
      lastShared.current = now;
      writeShared(now);
    }
    setState((s) => (s.kind === "active" ? s : { kind: "active" }));
  }
  const markActiveRef = useRef(markActive);
  useEffect(() => {
    markActiveRef.current = markActive;
  });

  useEffect(() => {
    if (!enabled) return;
    // Unlocking counts as using it.
    lastShared.current = 0;
    markActiveRef.current();

    // Clicks inside the "Still there?" box don't count by themselves: its
    // buttons say what to do (Lock now mustn't close it first). Its buttons
    // don't take the keyboard, so a key press anywhere still counts.
    const onActivity = (e: Event) => {
      if ((e.target as Element | null)?.closest?.(".idle-dialog")) return;
      markActiveRef.current();
    };
    for (const type of ACTIVITY_EVENTS) window.addEventListener(type, onActivity, { capture: true, passive: true });

    // Works from the clock, not the timer, so a sleeping computer or a
    // background tab still locks on time.
    const timer = window.setInterval(() => {
      const now = Date.now();
      const idle = now - Math.max(lastActive.current, readShared());
      if (idle < IDLE_LOCK_MS - WARNING_MS) {
        setState((s) => (s.kind === "active" ? s : { kind: "active" }));
        return;
      }
      if (idle < IDLE_LOCK_MS) {
        setState({ kind: "warning", secondsLeft: Math.ceil((IDLE_LOCK_MS - idle) / 1000) });
        return;
      }
      if (trying.current || now < nextTryAt.current) return;
      trying.current = true;
      void tryLockRef.current().then((locked) => {
        trying.current = false;
        if (!locked) {
          nextTryAt.current = Date.now() + RETRY_MS;
          setState({ kind: "couldNotLock" });
        }
      });
    }, 1000);

    return () => {
      for (const type of ACTIVITY_EVENTS) window.removeEventListener(type, onActivity, { capture: true });
      window.clearInterval(timer);
      setState({ kind: "active" });
    };
  }, [enabled]);

  return { idle: state, stayUnlocked: markActive };
}
