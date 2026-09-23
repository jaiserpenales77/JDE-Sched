import { useState } from "react";
import type { DragEvent } from "react";
import { sortByRole } from "../printLayout";
import { cleanEmployeeName, DRAG_MIME, parseNames, readDragPayload } from "../assignmentLogic";

export interface NameStatus {
  status: "free" | "elsewhere" | "out";
  note?: string; // e.g. "also on Line 3" or "PTO / Absences"
}

export interface ChipWarning {
  text: string;
  // Informational only - e.g. an MLL/Line Lead covering two lines, which
  // is allowed - rather than a problem to fix.
  soft?: boolean;
}

interface Props {
  value: string; // comma-separated names, same storage format as before
  onChange: (next: string) => void;
  options: string[]; // employee names to pick from (already cleaned)
  // Identifies which line this select belongs to, so a name dragged onto
  // another line's box knows where it came from - both are optional so
  // NameMultiSelect still works anywhere drag-between-lines doesn't apply.
  slotId?: string;
  onDropEmployee?: (name: string, fromSlotId: string) => void;
  // When given, displays chips MLL > Line Leader > MLT > everyone else,
  // matching the same order the print report uses.
  roleMap?: Map<string, string>;
  // Where each option already is today - groups the "+ Add employee"
  // list so people already on another line or out today are set apart.
  describe?: (name: string) => NameStatus;
  // A problem with someone already in this box (double-booked, out today).
  chipWarning?: (name: string) => ChipWarning | undefined;
  // Search text - chips that match get highlighted.
  isMatch?: (name: string) => boolean;
}

export default function NameMultiSelect({
  value,
  onChange,
  options,
  slotId,
  onDropEmployee,
  roleMap,
  describe,
  chipWarning,
  isMatch,
}: Props) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const selected = parseNames(value);
  const displayed = roleMap ? sortByRole(selected, roleMap) : selected;
  const available = options.filter((name) => !selected.includes(name));

  const groups: Record<NameStatus["status"], { name: string; note?: string }[]> = { free: [], elsewhere: [], out: [] };
  for (const name of available) {
    const info = describe?.(name) ?? { status: "free" };
    groups[info.status].push({ name, note: info.note });
  }

  function addName(name: string) {
    const trimmed = name.trim();
    if (!trimmed || selected.includes(trimmed)) return;
    onChange([...selected, trimmed].join(", "));
  }
  function removeName(name: string) {
    onChange(selected.filter((n) => n !== name).join(", "));
  }
  function commitCustom() {
    addName(cleanEmployeeName(customText));
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
    const payload = readDragPayload(e.dataTransfer);
    if (!payload) return;
    e.preventDefault();
    onDropEmployee(payload.name, payload.fromSlotId);
  }

  return (
    <div
      className={`name-multiselect ${dragOver ? "name-multiselect-drag-over" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <div className="name-chips">
        {selected.length === 0 && <span className="name-chips-empty">No one assigned — drag someone here</span>}
        {displayed.map((name) => {
          const warning = chipWarning?.(name);
          const classes = ["name-chip"];
          if (warning) classes.push(warning.soft ? "name-chip-soft" : "name-chip-warn");
          if (isMatch?.(name)) classes.push("name-chip-match");
          return (
            <span
              className={classes.join(" ")}
              key={name}
              draggable={!!slotId}
              onDragStart={(e) => handleChipDragStart(e, name)}
              title={[warning?.text, slotId ? "Drag to another line to move this person" : ""].filter(Boolean).join(" — ")}
            >
              {warning && <span aria-hidden="true">{warning.soft ? "ℹ" : "⚠"}</span>}
              {name}
              <button type="button" onClick={() => removeName(name)} title={`Remove ${name}`}>
                ✕
              </button>
            </span>
          );
        })}
      </div>
      <div className="name-add-row">
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) addName(e.target.value);
          }}
        >
          <option value="">+ Add employee…</option>
          {describe ? (
            <>
              {groups.free.length > 0 && (
                <optgroup label={`Not assigned yet (${groups.free.length})`}>
                  {groups.free.map(({ name }) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </optgroup>
              )}
              {groups.elsewhere.length > 0 && (
                <optgroup label="Already placed elsewhere">
                  {groups.elsewhere.map(({ name, note }) => (
                    <option key={name} value={name}>
                      {name} — {note}
                    </option>
                  ))}
                </optgroup>
              )}
              {groups.out.length > 0 && (
                <optgroup label="Out today">
                  {groups.out.map(({ name, note }) => (
                    <option key={name} value={name}>
                      {name} — {note}
                    </option>
                  ))}
                </optgroup>
              )}
            </>
          ) : (
            available.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))
          )}
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
