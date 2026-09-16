import { useState } from "react";
import type { DragEvent } from "react";

// The drag payload's MIME type - namespaced so dropping something else
// (a browser tab, a file, plain text) onto a line box is safely ignored.
const DRAG_MIME = "application/x-jde-employee";

interface Props {
  value: string; // comma-separated names, same storage format as before
  onChange: (next: string) => void;
  options: string[]; // employee names to pick from (already cleaned)
  // Identifies which line this select belongs to, so a name dragged onto
  // another line's box knows where it came from - both are optional so
  // NameMultiSelect still works anywhere drag-between-lines doesn't apply.
  slotId?: string;
  onDropEmployee?: (name: string, fromSlotId: string) => void;
}

function parseNames(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function NameMultiSelect({ value, onChange, options, slotId, onDropEmployee }: Props) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const selected = parseNames(value);
  const available = options.filter((name) => !selected.includes(name));

  function addName(name: string) {
    const trimmed = name.trim();
    if (!trimmed || selected.includes(trimmed)) return;
    onChange([...selected, trimmed].join(", "));
  }
  function removeName(name: string) {
    onChange(selected.filter((n) => n !== name).join(", "));
  }
  function commitCustom() {
    addName(customText);
    setCustomText("");
    setCustomOpen(false);
  }

  function handleChipDragStart(e: DragEvent<HTMLSpanElement>, name: string) {
    if (!slotId) return;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ name, fromSlotId: slotId }));
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    if (!onDropEmployee || !e.dataTransfer.types.includes(DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(true);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    setDragOver(false);
    if (!onDropEmployee) return;
    const raw = e.dataTransfer.getData(DRAG_MIME);
    if (!raw) return;
    e.preventDefault();
    try {
      const { name, fromSlotId } = JSON.parse(raw) as { name: string; fromSlotId: string };
      if (name && fromSlotId) onDropEmployee(name, fromSlotId);
    } catch {
      // Malformed drag payload - ignore rather than crash the drop.
    }
  }

  return (
    <div
      className={`name-multiselect ${dragOver ? "name-multiselect-drag-over" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <div className="name-chips">
        {selected.length === 0 && <span className="name-chips-empty">No one assigned</span>}
        {selected.map((name) => (
          <span
            className="name-chip"
            key={name}
            draggable={!!slotId}
            onDragStart={(e) => handleChipDragStart(e, name)}
            title={slotId ? "Drag to another line to move this person" : undefined}
          >
            {name}
            <button type="button" onClick={() => removeName(name)} title={`Remove ${name}`}>
              ✕
            </button>
          </span>
        ))}
      </div>
      <div className="name-add-row">
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) addName(e.target.value);
          }}
        >
          <option value="">+ Add employee…</option>
          {available.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        {!customOpen && (
          <button type="button" className="btn small" onClick={() => setCustomOpen(true)}>
            + Other
          </button>
        )}
      </div>
      {customOpen && (
        <div className="name-add-row">
          <input
            type="text"
            placeholder="Type a name"
            value={customText}
            autoFocus
            onChange={(e) => setCustomText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitCustom();
              } else if (e.key === "Escape") {
                setCustomOpen(false);
                setCustomText("");
              }
            }}
          />
          <button type="button" className="btn small" onClick={commitCustom}>
            Add
          </button>
          <button
            type="button"
            className="btn small"
            onClick={() => {
              setCustomOpen(false);
              setCustomText("");
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
