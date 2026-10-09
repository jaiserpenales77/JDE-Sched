import { useRef, useState } from "react";
import type { FormEvent } from "react";
import type { ShiftKey } from "../types";
import { SHIFT_KEYS, SHIFT_LABELS } from "../types";
import { unlockErrorMessage, unlockShift } from "../auth";
import { REMEMBER_HOURS } from "../rememberDevice";

interface Props {
  // The shift this computer used last, picked to start with.
  lastShift: ShiftKey | null;
  onUnlocked: (shift: ShiftKey) => void;
}

// Shown whenever the app is locked: pick your shift, type its password.
export default function UnlockScreen({ lastShift, onUnlocked }: Props) {
  const [shift, setShift] = useState<ShiftKey | null>(lastShift);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  function pick(next: ShiftKey) {
    setShift(next);
    setError(null);
    passwordRef.current?.focus();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!shift || !password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await unlockShift(shift, password, remember);
      onUnlocked(shift);
    } catch (err) {
      setError(unlockErrorMessage(err, SHIFT_LABELS[shift]));
      setPassword("");
      passwordRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shift-chooser">
      <form className="shift-chooser-card unlock-card" onSubmit={submit}>
        <div className="app-title">
          JDE Sched
          <small>Production Line Schedule &amp; Crew Board</small>
        </div>
        <h1>🔒 Unlock JDE Sched</h1>

        <p className="unlock-step">1. Pick your shift</p>
        <div className="shift-chooser-options" role="radiogroup" aria-label="Shift">
          {SHIFT_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={shift === key}
              className={`btn unlock-shift ${shift === key ? "primary" : ""}`}
              onClick={() => pick(key)}
            >
              {SHIFT_LABELS[key]}
            </button>
          ))}
        </div>

        <label className="unlock-step" htmlFor="unlock-password">
          2. Type {shift ? `${SHIFT_LABELS[shift]}'s` : "your shift's"} password
        </label>
        <div className="unlock-password-row">
          <input
            id="unlock-password"
            ref={passwordRef}
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            disabled={!shift}
            placeholder={shift ? "Password" : "Pick your shift first"}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            className="btn"
            onClick={() => setShowPassword((s) => !s)}
            aria-pressed={showPassword}
            disabled={!shift}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>

        <label className="unlock-remember">
          <input
            type="checkbox"
            checked={remember}
            disabled={!shift}
            onChange={(e) => setRemember(e.target.checked)}
          />
          Remember this computer for {REMEMBER_HOURS} hours
        </label>

        {error && (
          <p className="unlock-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn primary unlock-submit" disabled={!shift || !password || busy}>
          {busy ? "Unlocking…" : "Unlock"}
        </button>

        <p className="shift-chooser-hint">
          Each shift has its own password, and it only opens that shift's Production Schedule, Line Assignments,
          Skills &amp; Roles and Time Off. You'll need it every time you open the app, unless you tick Remember this
          computer. Refreshing the page doesn't lock it, and 🔒 Lock always does.
        </p>
      </form>
    </div>
  );
}
