import { useState } from "react";
import type { DragEvent } from "react";
import type { Employee } from "../types";
import { nameKey, roleCategory, roleOf } from "../printLayout";
import type { RoleCategory } from "../printLayout";
import { cleanEmployeeName, DRAG_MIME, readDragPayload, UNASSIGNED_SOURCE } from "../assignmentLogic";
import type { Placement } from "../assignmentLogic";

interface Props {
  employees: Employee[];
  placements: Map<string, Placement[]>;
  out: Map<string, string>;
  roleMap: Map<string, string>;
  doubleBooked: { name: string; places: string[] }[];
  isMatch: (name: string) => boolean;
  // A chip dragged off a line (or duty) and dropped here - take them off it.
  onUnassign: (name: string, fromSlotId: string) => void;
}

const GROUPS: { category: RoleCategory; label: string }[] = [
  { category: "mll", label: "MLL" },
  { category: "leader", label: "Line Lead" },
  { category: "mlt", label: "MLT" },
  { category: "other", label: "Everyone else" },
];

interface Person {
  name: string;
  primaryLine: string;
}

export default function UnassignedPanel({ employees, placements, out, roleMap, doubleBooked, isMatch, onUnassign }: Props) {
  const [dragOver, setDragOver] = useState(false);

  const seen = new Set<string>();
  const unassigned: Record<RoleCategory, Person[]> = { mll: [], leader: [], mlt: [], other: [] };
  const outToday: (Person & { reason: string })[] = [];
  for (const e of employees) {
    const name = cleanEmployeeName(e.name);
    const key = nameKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (out.has(key)) {
      outToday.push({ name, primaryLine: e.primaryLine, reason: out.get(key) ?? "" });
    } else if (!placements.has(key)) {
      unassigned[roleCategory(roleOf(name, roleMap))].push({ name, primaryLine: e.primaryLine });
    }
  }
  const unassignedCount = GROUPS.reduce((n, g) => n + unassigned[g.category].length, 0);

  function handleDragStart(e: DragEvent<HTMLSpanElement>, name: string) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ name, fromSlotId: UNASSIGNED_SOURCE }));
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(true);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    setDragOver(false);
    const payload = readDragPayload(e.dataTransfer);
    if (!payload || payload.fromSlotId === UNASSIGNED_SOURCE) return;
    e.preventDefault();
    onUnassign(payload.name, payload.fromSlotId);
  }

  function personChip(person: Person, extraClass = "") {
    return (
      <span
        key={person.name}
        className={`unassigned-person ${extraClass} ${isMatch(person.name) ? "name-chip-match" : ""}`}
        draggable
        onDragStart={(e) => handleDragStart(e, person.name)}
        title="Drag onto a line or duty to assign"
      >
        {person.name}
        {person.primaryLine && <small>{person.primaryLine}</small>}
      </span>
    );
  }

  return (
    <aside
      className={`panel unassigned-panel ${dragOver ? "name-multiselect-drag-over" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {doubleBooked.length > 0 && (
        <div className="assign-alert">
          <strong>⚠ On more than one line</strong>
          <ul>
            {doubleBooked.map((d) => (
              <li key={d.name}>
                {d.name} — {d.places.join(", ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      <h2>
        Unassigned <span className="count-badge">{unassignedCount}</span>
      </h2>
      <p className="panel-hint">Drag a name onto a line. Drop a name here to take it off its line.</p>
      {employees.length === 0 && <div className="unassigned-empty">No one on this shift's Skills &amp; Roles roster yet.</div>}
      {employees.length > 0 && unassignedCount === 0 && <div className="unassigned-empty">✓ Everyone is placed.</div>}
      {GROUPS.map(({ category, label }) =>
        unassigned[category].length === 0 ? null : (
          <div className="unassigned-group" key={category}>
            <h3>
              {label} <span className="count-badge">{unassigned[category].length}</span>
            </h3>
            <div className="unassigned-list">{unassigned[category].map((p) => personChip(p))}</div>
          </div>
        ),
      )}

      {outToday.length > 0 && (
        <div className="unassigned-group">
          <h3>
            Out today <span className="count-badge">{outToday.length}</span>
          </h3>
          <div className="unassigned-list">
            {outToday.map((p) => (
              <span
                key={p.name}
                className={`unassigned-person unassigned-out ${isMatch(p.name) ? "name-chip-match" : ""}`}
                title={`Listed under "${p.reason}" in Rosters & Notes`}
              >
                {p.name}
                <small>{p.reason}</small>
              </span>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
