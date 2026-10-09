import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";

const CONFIRM_WORD = "WIPE";

interface Props {
  title: string;
  children: ReactNode;
  // Label of the red button that does it.
  actionLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

// For actions that erase a whole shift's data: the red button only works
// once WIPE is typed, so it can't happen from a stray click.
export default function TypeToConfirmDialog({ title, children, actionLabel, onConfirm, onCancel }: Props) {
  const [typed, setTyped] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const ready = typed.trim().toUpperCase() === CONFIRM_WORD;

  useEffect(() => inputRef.current?.focus(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (ready) onConfirm();
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form className="modal confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" onSubmit={submit}>
        <h2 id="confirm-title">⚠ {title}</h2>
        <div className="confirm-body">{children}</div>
        <label className="confirm-label" htmlFor="confirm-word">
          Type <strong>{CONFIRM_WORD}</strong> to confirm
        </label>
        <input
          id="confirm-word"
          ref={inputRef}
          className="confirm-input"
          value={typed}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setTyped(e.target.value)}
        />
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn danger-solid" disabled={!ready}>
            {actionLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
