// "Remember this computer" on the unlock screen: the shift's sign-in is kept
// on this computer for REMEMBER_HOURS, even when the app is closed. Lock, or
// the time running out, forgets it again.
const REMEMBERED_UNTIL_KEY = "jde-sched-remembered-until";
export const REMEMBER_HOURS = 12;

// When this computer stops being remembered (ms), or 0 if it isn't.
export function rememberedUntil(): number {
  try {
    return Number(localStorage.getItem(REMEMBERED_UNTIL_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function rememberDevice(): void {
  try {
    localStorage.setItem(REMEMBERED_UNTIL_KEY, String(Date.now() + REMEMBER_HOURS * 60 * 60 * 1000));
  } catch {
    // Storage blocked: works like an unticked box.
  }
}

export function forgetDevice(): void {
  try {
    localStorage.removeItem(REMEMBERED_UNTIL_KEY);
  } catch {
    // Storage blocked: nothing was saved.
  }
}

// "7:30 PM", or "Fri 7:30 AM" when it isn't today.
export function rememberedUntilLabel(until: number): string {
  const d = new Date(until);
  const today = d.toDateString() === new Date().toDateString();
  return d.toLocaleString([], today ? { hour: "numeric", minute: "2-digit" } : { weekday: "short", hour: "numeric", minute: "2-digit" });
}
