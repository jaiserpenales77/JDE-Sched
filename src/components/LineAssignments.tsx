import { useState } from "react";
import type { DragEvent } from "react";
import type { CommentBox, DailyBoard, Employee, ListSection, LineSlot } from "../types";
import { COMMENT_FONT_OPTIONS } from "../types";
import NameMultiSelect from "./NameMultiSelect";
import type { ChipWarning, NameStatus } from "./NameMultiSelect";
import UnassignedPanel from "./UnassignedPanel";
import { buildRoleMap, nameKey, roleCategory, roleOf } from "../printLayout";
import {
  autoFillFromPrimaryLines,
  boardOut,
  boardPlacements,
  cleanEmployeeName,
  DRAG_MIME,
  isRunning,
  parseNames,
  readDragPayload,
  slotCoverage,
} from "../assignmentLogic";

const COMPACT_KEY = "jde-sched-compact-lines";

function loadCompact(): boolean {
  try {
    return localStorage.getItem(COMPACT_KEY) === "1";
  } catch {
    return false;
  }
}

// "+ Add employee…" for a Room & Duty section - same grouping as the line
// boxes' picker, so someone already on a line or out today stands out.
function PersonPicker({
  names,
  describe,
  onPick,
}: {
  names: string[];
  describe: (name: string) => NameStatus;
  onPick: (name: string) => void;
}) {
  const free: string[] = [];
  const elsewhere: { name: string; note?: string }[] = [];
  const out: { name: string; note?: string }[] = [];
  for (const name of names) {
    const info = describe(name);
    if (info.status === "free") free.push(name);
    else if (info.status === "elsewhere") elsewhere.push({ name, note: info.note });
    else out.push({ name, note: info.note });
  }
  return (
    <select
      className="section-person-picker"
      value=""
      onChange={(e) => {
        if (e.target.value) onPick(e.target.value);
      }}
    >
      <option value="">+ Add employee…</option>
      {free.length > 0 && (
        <optgroup label={`Not assigned yet (${free.length})`}>
          {free.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </optgroup>
      )}
      {elsewhere.length > 0 && (
        <optgroup label="Already placed elsewhere">
          {elsewhere.map(({ name, note }) => (
            <option key={name} value={name}>
              {name} — {note}
            </option>
          ))}
        </optgroup>
      )}
      {out.length > 0 && (
        <optgroup label="Out today">
          {out.map(({ name, note }) => (
            <option key={name} value={name}>
              {name} — {note}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

interface Props {
  boards: DailyBoard[];
  setBoards: (updater: (boards: DailyBoard[]) => DailyBoard[]) => void;
  selectedId: string;
  setSelectedId: (id: string) => void;
  employees: Employee[];
  // Label a newly-created board starts with (e.g. "1st Shift") - matches
  // whichever shift this device is currently showing.
  defaultShiftLabel: string;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function blankBoard(date: string, shiftLabel: string): DailyBoard {
  return {
    id: crypto.randomUUID(),
    date,
    shiftLabel,
    deptLeader: "",
    lineSlots: [],
    roomSections: [],
    listSections: [],
    comments: [],
  };
}

type SectionField = "roomSections" | "listSections";

function blankSlot(): LineSlot {
  return { id: crypto.randomUUID(), line: "New Line", status: "", subNote: "", assigned: "" };
}

function blankSection(): ListSection {
  return { id: crypto.randomUUID(), title: "New Section", items: [] };
}

function blankComment(index: number): CommentBox {
  return {
    id: crypto.randomUUID(),
    title: `Comment ${index + 1}`,
    text: "",
    fontSize: 14,
    fontFamily: COMMENT_FONT_OPTIONS[0].value,
    fontColor: "#1a1a1a",
    backgroundColor: "#ffffff",
    borderColor: "#8a8a8a",
    borderWidth: 1,
    bold: false,
    italic: false,
    textAlign: "left",
    includeInPrint: false,
  };
}

export default function LineAssignments({
  boards,
  setBoards,
  selectedId,
  setSelectedId,
  employees,
  defaultShiftLabel,
}: Props) {
  const sorted = [...boards].sort((a, b) => (a.date < b.date ? 1 : -1));
  const board = boards.find((b) => b.id === selectedId) ?? sorted[0];
  const employeeNames = [...new Set(employees.map((e) => cleanEmployeeName(e.name)).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
  const roleMap = buildRoleMap(employees);

  const [query, setQuery] = useState("");
  const [compact, setCompactState] = useState(loadCompact);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  function setCompact(next: boolean) {
    setCompactState(next);
    setExpanded(new Set());
    try {
      localStorage.setItem(COMPACT_KEY, next ? "1" : "0");
    } catch {
      // Private window / blocked storage - the toggle still works this session.
    }
  }

  const placements = boardPlacements(board);
  const out = boardOut(board);

  // Best display name for each person key - roster spelling first, then
  // however they were typed onto the board.
  const displayName = new Map<string, string>();
  for (const name of employeeNames) displayName.set(nameKey(name), name);
  for (const slot of board?.lineSlots ?? []) {
    for (const name of parseNames(slot.assigned)) {
      const key = nameKey(name);
      if (key && !displayName.has(key)) displayName.set(key, name);
    }
  }

  // Anyone can be on more than one line; for MLLs and Line Leads it's
  // expected, so they get a soft note rather than the amber warning.
  function isLead(name: string): boolean {
    const category = roleCategory(roleOf(name, roleMap));
    return category === "mll" || category === "leader";
  }

  const doubleBooked = [...placements.entries()]
    .filter(([, places]) => places.length > 1)
    .map(([key, places]) => {
      const name = displayName.get(key) ?? key;
      return { name, places: places.map((p) => p.label), soft: isLead(name) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  function describe(name: string): NameStatus {
    const key = nameKey(name);
    const reason = out.get(key);
    if (reason) return { status: "out", note: reason };
    const places = placements.get(key);
    if (places?.length) {
      const labels = places.map((p) => p.label).join(", ");
      return { status: "elsewhere", note: `also on ${labels}` };
    }
    return { status: "free" };
  }

  // Note for someone already sitting in the box identified by placeId.
  function warningFor(name: string, placeId: string): ChipWarning | undefined {
    const key = nameKey(name);
    const reason = out.get(key);
    if (reason) return { text: `Listed as out today (${reason})` };
    const others = (placements.get(key) ?? []).filter((p) => p.id !== placeId);
    if (!others.length) return undefined;
    const labels = others.map((p) => p.label).join(", ");
    return isLead(name) ? { text: `Also covering ${labels}`, soft: true } : { text: `Also on ${labels}` };
  }

  const q = query.trim().toLowerCase();
  function isMatch(name: string): boolean {
    return q.length >= 2 && (name.toLowerCase().includes(q) || nameKey(name).includes(q));
  }
  const searchResults =
    q.length >= 2
      ? [...displayName.entries()]
          .filter(([, name]) => isMatch(name))
          .slice(0, 8)
          .map(([key, name]) => {
            const reason = out.get(key);
            const places = placements.get(key);
            const where = reason
              ? `out today (${reason})`
              : places?.length
                ? places.map((p) => p.label).join(", ")
                : "not assigned";
            return { name, where, unplaced: !reason && !places?.length };
          })
      : [];

  const collapsedSlots =
    board?.lineSlots.filter(
      (s) => compact && !isRunning(s) && !expanded.has(s.id) && !parseNames(s.assigned).some(isMatch),
    ) ?? [];

  const scheduled = board?.lineSlots.filter((s) => s.status === "Scheduled") ?? [];
  const needsAttention = scheduled.filter((s) => slotCoverage(s, roleMap).warnings.length > 0).length;
  const rosterKeys = [...new Set(employeeNames.map(nameKey).filter(Boolean))];
  const rosterAvailable = rosterKeys.filter((k) => !out.has(k));
  const rosterPlaced = rosterAvailable.filter((k) => placements.has(k)).length;

  function updateBoard(id: string, patch: Partial<DailyBoard>) {
    setBoards((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  function newDay(duplicateCurrent: boolean) {
    const date = prompt("Date for the new board (YYYY-MM-DD):", todayIso());
    if (!date) return;
    if (boards.some((b) => b.date === date)) {
      alert("A board for that date already exists.");
      return;
    }
    const created = duplicateCurrent && board
      ? {
          ...board,
          id: crypto.randomUUID(),
          date,
          lineSlots: board.lineSlots.map((s) => ({ ...s, id: crypto.randomUUID() })),
          roomSections: board.roomSections.map((s) => ({ ...s, id: crypto.randomUUID(), items: [...s.items] })),
          listSections: board.listSections.map((s) => ({ ...s, id: crypto.randomUUID(), items: [...s.items] })),
          comments: board.comments.map((c) => ({ ...c, id: crypto.randomUUID() })),
        }
      : blankBoard(date, defaultShiftLabel);
    setBoards((bs) => [...bs, created]);
    setSelectedId(created.id);
  }

  function deleteBoard() {
    if (!board) return;
    if (!confirm(`Delete the board for ${board.date}? This cannot be undone.`)) return;
    setBoards((bs) => bs.filter((b) => b.id !== board.id));
    setSelectedId(sorted.find((b) => b.id !== board.id)?.id ?? "");
  }

  function updateSlot(id: string, patch: Partial<LineSlot>) {
    if (!board) return;
    updateBoard(board.id, { lineSlots: board.lineSlots.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  }
  function removeSlot(id: string) {
    if (!board) return;
    updateBoard(board.id, { lineSlots: board.lineSlots.filter((s) => s.id !== id) });
  }
  function addSlot() {
    if (!board) return;
    updateBoard(board.id, { lineSlots: [...board.lineSlots, blankSlot()] });
  }

  // Moves an entire line's assigned team onto another line (chosen from
  // the "Transfer team" dropdown) in one board update - not two separate
  // updateSlot calls, which would each read the same pre-transfer
  // lineSlots and the second would clobber the first - then clears the
  // team off the line they transferred from.
  function transferTeamTo(slot: LineSlot, targetId: string) {
    if (!board || !targetId) return;
    const team = parseNames(slot.assigned);
    const targetSlot = board.lineSlots.find((s) => s.id === targetId);
    if (team.length === 0 || !targetSlot) return;
    const existing = parseNames(targetSlot.assigned);
    const merged = [...existing, ...team.filter((n) => !existing.includes(n))];
    updateBoard(board.id, {
      lineSlots: board.lineSlots.map((s) => {
        if (s.id === slot.id) return { ...s, assigned: "" };
        if (s.id === targetSlot.id) return { ...s, assigned: merged.join(", ") };
        return s;
      }),
    });
  }

  // Moves a single person, dragged off one line's name chips and dropped
  // onto another line's box - same single-board-update shape as
  // transferTeamTo, so removing them from the source and adding them to
  // the target land in one setBoards call instead of two.
  function moveEmployee(name: string, fromSlotId: string, toSlotId: string) {
    if (!board || fromSlotId === toSlotId) return;
    updateBoard(board.id, {
      lineSlots: board.lineSlots.map((s) => {
        if (s.id === fromSlotId) {
          return { ...s, assigned: parseNames(s.assigned).filter((n) => n !== name).join(", ") };
        }
        if (s.id === toSlotId) {
          const existing = parseNames(s.assigned);
          if (existing.includes(name)) return s;
          return { ...s, assigned: [...existing, name].join(", ") };
        }
        return s;
      }),
    });
  }

  // A chip dragged off a line and dropped on the Unassigned list.
  function unassign(name: string, fromSlotId: string) {
    if (!board) return;
    updateBoard(board.id, {
      lineSlots: board.lineSlots.map((s) =>
        s.id === fromSlotId ? { ...s, assigned: parseNames(s.assigned).filter((n) => n !== name).join(", ") } : s,
      ),
    });
  }

  // Adds a person to a Room & Duty section - and, when they were dragged
  // off a line, takes them off that line in the same board update.
  function placeInRoom(name: string, sectionId: string, fromSlotId?: string) {
    if (!board) return;
    const key = nameKey(name);
    updateBoard(board.id, {
      lineSlots: board.lineSlots.map((s) =>
        s.id === fromSlotId ? { ...s, assigned: parseNames(s.assigned).filter((n) => n !== name).join(", ") } : s,
      ),
      roomSections: board.roomSections.map((s) =>
        s.id === sectionId && !s.items.some((item) => nameKey(item) === key) ? { ...s, items: [...s.items, name] } : s,
      ),
    });
  }

  function handleRoomDragOver(e: DragEvent<HTMLDivElement>) {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    e.currentTarget.classList.add("name-multiselect-drag-over");
  }
  function handleRoomDrop(e: DragEvent<HTMLDivElement>, sectionId: string) {
    e.currentTarget.classList.remove("name-multiselect-drag-over");
    const payload = readDragPayload(e.dataTransfer);
    if (!payload) return;
    e.preventDefault();
    placeInRoom(payload.name, sectionId, payload.fromSlotId);
  }

  function autoFill() {
    if (!board) return;
    if (
      !confirm(
        "Put everyone who isn't on the board yet onto the line (or duty) matching their Primary Line from the Skills & Roles tab?\n\nNobody already placed gets moved, people listed as out today are skipped, and lines marked Not Scheduled or PM are skipped.",
      )
    )
      return;
    const result = autoFillFromPrimaryLines(board, employees, placements, out);
    updateBoard(board.id, { lineSlots: result.lineSlots, roomSections: result.roomSections });
    const lines = [`Placed ${result.placed} ${result.placed === 1 ? "person" : "people"}.`];
    if (result.skipped.length) {
      lines.push("", `Still in the Unassigned list (${result.skipped.length}):`);
      lines.push(...result.skipped.slice(0, 15).map((s) => `• ${s.name} — ${s.reason}`));
      if (result.skipped.length > 15) lines.push(`…and ${result.skipped.length - 15} more`);
    }
    alert(lines.join("\n"));
  }

  function updateSection(field: SectionField, id: string, patch: Partial<ListSection>) {
    if (!board) return;
    updateBoard(board.id, { [field]: board[field].map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  }
  function removeSection(field: SectionField, id: string) {
    if (!board) return;
    updateBoard(board.id, { [field]: board[field].filter((s) => s.id !== id) });
  }
  function addSection(field: SectionField) {
    if (!board) return;
    updateBoard(board.id, { [field]: [...board[field], blankSection()] });
  }

  function setItem(field: SectionField, section: ListSection, i: number, value: string) {
    if (!board) return;
    const items = [...section.items];
    items[i] = value;
    updateSection(field, section.id, { items });
  }
  function removeItem(field: SectionField, section: ListSection, i: number) {
    if (!board) return;
    updateSection(field, section.id, { items: section.items.filter((_, idx) => idx !== i) });
  }
  function addItem(field: SectionField, section: ListSection) {
    updateSection(field, section.id, { items: [...section.items, ""] });
  }

  function updateComment(id: string, patch: Partial<CommentBox>) {
    if (!board) return;
    updateBoard(board.id, { comments: board.comments.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  }
  function removeComment(id: string) {
    if (!board) return;
    updateBoard(board.id, { comments: board.comments.filter((c) => c.id !== id) });
  }
  function addComment() {
    if (!board) return;
    updateBoard(board.id, { comments: [...board.comments, blankComment(board.comments.length)] });
  }

  return (
    <div>
      <div className="board-toolbar">
        <select value={board?.id ?? ""} onChange={(e) => setSelectedId(e.target.value)}>
          {sorted.length === 0 && <option value="">No boards yet</option>}
          {sorted.map((b) => (
            <option key={b.id} value={b.id}>
              {b.date} — {b.shiftLabel}
            </option>
          ))}
        </select>
        <button className="btn" onClick={() => newDay(true)}>
          📋 Duplicate as new day
        </button>
        <button className="btn" onClick={() => newDay(false)}>
          + Blank new day
        </button>
        {board && (
          <button className="btn danger" onClick={deleteBoard}>
            Delete this board
          </button>
        )}
      </div>

      {!board && <div className="empty-state panel">No shift board yet — create one above.</div>}

      {board && (
        <>
          <div className="board-meta panel">
            <label>
              Date
              <input type="date" value={board.date} onChange={(e) => updateBoard(board.id, { date: e.target.value })} />
            </label>
            <label>
              Shift
              <input value={board.shiftLabel} onChange={(e) => updateBoard(board.id, { shiftLabel: e.target.value })} />
            </label>
            <label>
              Dept. Leader(s)
              <input value={board.deptLeader} onChange={(e) => updateBoard(board.id, { deptLeader: e.target.value })} />
            </label>
          </div>

          <div className="assign-layout">
            <div className="assign-main">
              <div className="panel">
                <h2>Line Status</h2>
                <div className="line-status-toolbar">
                  <input
                    type="search"
                    className="assign-search"
                    placeholder="🔍 Find a person…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <label className="print-design-checkbox">
                    <input type="checkbox" checked={compact} onChange={(e) => setCompact(e.target.checked)} />
                    Collapse Not Scheduled / PM lines
                  </label>
                  <button
                    className="btn small"
                    onClick={autoFill}
                    title="Place everyone not on the board yet onto their Primary Line from Skills & Roles"
                  >
                    ⚡ Auto-fill from Primary Lines
                  </button>
                </div>

                {searchResults.length > 0 && (
                  <ul className="search-results">
                    {searchResults.map((r) => (
                      <li key={r.name} className={r.unplaced ? "search-unplaced" : ""}>
                        <strong>{r.name}</strong> → {r.where}
                      </li>
                    ))}
                  </ul>
                )}
                {q.length >= 2 && searchResults.length === 0 && (
                  <div className="search-results search-none">No one matching "{query.trim()}" on the roster or board.</div>
                )}

                <div className="coverage-summary">
                  <span>
                    <strong>{scheduled.length}</strong> scheduled {scheduled.length === 1 ? "line" : "lines"}
                  </span>
                  {rosterAvailable.length > 0 && (
                    <span>
                      <strong>
                        {rosterPlaced}/{rosterAvailable.length}
                      </strong>{" "}
                      available crew placed
                    </span>
                  )}
                  {out.size > 0 && (
                    <span>
                      <strong>{out.size}</strong> out today
                    </span>
                  )}
                  {needsAttention > 0 ? (
                    <span className="coverage-warn">
                      ⚠ <strong>{needsAttention}</strong> {needsAttention === 1 ? "line needs" : "lines need"} attention
                    </span>
                  ) : (
                    scheduled.length > 0 && <span className="coverage-ok">✓ All scheduled lines covered</span>
                  )}
                </div>

                {collapsedSlots.length > 0 && (
                  <div className="collapsed-lines">
                    <span className="collapsed-lines-label">Not running:</span>
                    {collapsedSlots.map((slot) => (
                      <button
                        key={slot.id}
                        type="button"
                        className={`collapsed-line slot-status-${slot.status.replace(/ /g, "-") || "none"}`}
                        onClick={() => setExpanded((prev) => new Set(prev).add(slot.id))}
                        title="Show this line"
                      >
                        <strong>{slot.line}</strong> {slot.status} · 👥 {parseNames(slot.assigned).length} ▾
                      </button>
                    ))}
                  </div>
                )}

                <div className="line-slots-grid">
                  {board.lineSlots.map((slot) => {
                    const coverage = slotCoverage(slot, roleMap);
                    const slotNames = parseNames(slot.assigned);
                    const hasMatch = slotNames.some(isMatch);
                    const collapsed = collapsedSlots.includes(slot);
                    const dim = q.length >= 2 && !hasMatch;
                    const statusClass = `slot-status-${slot.status.replace(/ /g, "-") || "none"}`;
                    const countLabel = coverage.target !== null ? `${coverage.count}/${coverage.target}` : `${coverage.count}`;

                    if (collapsed) return null;

                    return (
                      <div
                        className={`line-slot-card ${coverage.warnings.length ? "line-slot-warn" : ""} ${dim ? "line-slot-dim" : ""}`}
                        key={slot.id}
                      >
                        <div className={`slot-head ${statusClass}`}>
                          <input
                            className="slot-line-input"
                            value={slot.line}
                            onChange={(e) => updateSlot(slot.id, { line: e.target.value })}
                          />
                          <span
                            className={`slot-count ${coverage.target !== null && coverage.count < coverage.target && slot.status === "Scheduled" ? "slot-count-short" : ""}`}
                            title={coverage.target !== null ? `${coverage.count} assigned, ZBS target ${coverage.target}` : `${coverage.count} assigned`}
                          >
                            👥 {countLabel}
                          </span>
                          {compact && !isRunning(slot) && (
                            <button
                              className="btn small"
                              onClick={() =>
                                setExpanded((prev) => {
                                  const next = new Set(prev);
                                  next.delete(slot.id);
                                  return next;
                                })
                              }
                              title="Collapse this line"
                            >
                              ▴
                            </button>
                          )}
                          <button className="btn small danger" onClick={() => removeSlot(slot.id)}>
                            ✕
                          </button>
                        </div>
                        <div className="slot-body">
                          {coverage.warnings.length > 0 && (
                            <ul className="slot-warnings">
                              {coverage.warnings.map((w) => (
                                <li key={w}>⚠ {w}</li>
                              ))}
                            </ul>
                          )}
                          <select
                            value={slot.status}
                            onChange={(e) => updateSlot(slot.id, { status: e.target.value as LineSlot["status"] })}
                          >
                            <option value="">— status —</option>
                            <option value="Scheduled">Scheduled</option>
                            <option value="Not Scheduled">Not Scheduled</option>
                            <option value="PM">PM</option>
                          </select>
                          <input
                            placeholder="Note (e.g. ZBS-6)"
                            value={slot.subNote}
                            onChange={(e) => updateSlot(slot.id, { subNote: e.target.value })}
                          />
                          <NameMultiSelect
                            value={slot.assigned}
                            onChange={(next) => updateSlot(slot.id, { assigned: next })}
                            options={employeeNames}
                            slotId={slot.id}
                            onDropEmployee={(name, fromSlotId) => moveEmployee(name, fromSlotId, slot.id)}
                            roleMap={roleMap}
                            describe={describe}
                            chipWarning={(name) => warningFor(name, slot.id)}
                            isMatch={isMatch}
                          />
                          <select
                            value=""
                            disabled={!slot.assigned.trim()}
                            title={!slot.assigned.trim() ? "No team assigned to this line to transfer." : undefined}
                            onChange={(e) => transferTeamTo(slot, e.target.value)}
                          >
                            <option value="">🔀 Transfer team to…</option>
                            {board.lineSlots
                              .filter((s) => s.id !== slot.id)
                              .map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.line}
                                </option>
                              ))}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button className="btn small" style={{ marginTop: 10 }} onClick={addSlot}>
                  + Add line
                </button>
              </div>

              <div className="panel">
                <h2>Room &amp; Duty Assignments</h2>
                <p className="panel-hint">
                  Prints alongside the line grid above (Label Room, Wash Room, Maintenance Mechs, etc.). You can drag people
                  here too.
                </p>
                <div className="sections-grid">
                  {board.roomSections.map((section) => (
                    <div
                      className="section-card"
                      key={section.id}
                      onDragOver={handleRoomDragOver}
                      onDragLeave={(e) => e.currentTarget.classList.remove("name-multiselect-drag-over")}
                      onDrop={(e) => handleRoomDrop(e, section.id)}
                    >
                      <div className="section-title">
                        <input
                          value={section.title}
                          onChange={(e) => updateSection("roomSections", section.id, { title: e.target.value })}
                        />
                        <button className="btn small danger" onClick={() => removeSection("roomSections", section.id)}>
                          ✕
                        </button>
                      </div>
                      {section.items.map((item, i) => {
                        const warning = item.trim() ? warningFor(item, section.id) : undefined;
                        const classes = [
                          warning ? (warning.soft ? "section-item-soft" : "section-item-warn") : "",
                          isMatch(item) ? "name-chip-match" : "",
                        ];
                        return (
                          <div className="section-item-row" key={i}>
                            <input
                              className={classes.join(" ").trim()}
                              value={item}
                              title={warning?.text}
                              onChange={(e) => setItem("roomSections", section, i, e.target.value)}
                            />
                            <button className="btn small danger" onClick={() => removeItem("roomSections", section, i)}>
                              ✕
                            </button>
                          </div>
                        );
                      })}
                      <div className="section-add-row">
                        <PersonPicker
                          names={employeeNames.filter((n) => !section.items.some((item) => nameKey(item) === nameKey(n)))}
                          describe={describe}
                          onPick={(name) => placeInRoom(name, section.id)}
                        />
                        <button className="btn small" onClick={() => addItem("roomSections", section)}>
                          + Text
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <button className="btn small" style={{ marginTop: 10 }} onClick={() => addSection("roomSections")}>
                  + Add section
                </button>
              </div>
            </div>

            <UnassignedPanel
              employees={employees}
              placements={placements}
              out={out}
              roleMap={roleMap}
              doubleBooked={doubleBooked}
              isMatch={isMatch}
              onUnassign={unassign}
            />
          </div>

          <div className="panel">
            <h2>Rosters &amp; Notes</h2>
            <p className="panel-hint">On-screen only — not included in the print report.</p>
            <div className="sections-grid">
              {board.listSections.map((section) => (
                <div className="section-card" key={section.id}>
                  <div className="section-title">
                    <input
                      value={section.title}
                      onChange={(e) => updateSection("listSections", section.id, { title: e.target.value })}
                    />
                    <button className="btn small danger" onClick={() => removeSection("listSections", section.id)}>
                      ✕
                    </button>
                  </div>
                  {section.items.map((item, i) => (
                    <div className="section-item-row" key={i}>
                      <input value={item} onChange={(e) => setItem("listSections", section, i, e.target.value)} />
                      <button className="btn small danger" onClick={() => removeItem("listSections", section, i)}>
                        ✕
                      </button>
                    </div>
                  ))}
                  <button className="btn small" onClick={() => addItem("listSections", section)}>
                    + Add item
                  </button>
                </div>
              ))}
            </div>
            <button className="btn small" style={{ marginTop: 10 }} onClick={() => addSection("listSections")}>
              + Add section
            </button>
          </div>

          <div className="panel">
            <h2>Comments</h2>
            <p className="panel-hint">
              Fully customizable text boxes — set the font, size, colors and border for each. Check "Include in print
              report" to have a box print on the report.
            </p>
            <div className="comments-grid">
              {board.comments.map((comment) => (
                <div className="comment-card" key={comment.id}>
                  <div className="comment-card-head">
                    <input
                      className="comment-title-input"
                      value={comment.title}
                      onChange={(e) => updateComment(comment.id, { title: e.target.value })}
                    />
                    <button className="btn small danger" onClick={() => removeComment(comment.id)}>
                      ✕
                    </button>
                  </div>

                  <textarea
                    className="comment-text-input"
                    rows={3}
                    placeholder="Comment text…"
                    value={comment.text}
                    onChange={(e) => updateComment(comment.id, { text: e.target.value })}
                  />

                  <div className="comment-controls">
                    <label className="comment-field">
                      Font
                      <select
                        value={comment.fontFamily}
                        onChange={(e) => updateComment(comment.id, { fontFamily: e.target.value })}
                      >
                        {COMMENT_FONT_OPTIONS.map((f) => (
                          <option key={f.value} value={f.value}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="comment-field comment-field-narrow">
                      Size
                      <input
                        type="number"
                        min={8}
                        max={72}
                        value={comment.fontSize}
                        onChange={(e) => updateComment(comment.id, { fontSize: Number(e.target.value) || 8 })}
                      />
                    </label>
                    <label className="comment-field comment-field-narrow">
                      Border
                      <input
                        type="number"
                        min={0}
                        max={20}
                        value={comment.borderWidth}
                        onChange={(e) => updateComment(comment.id, { borderWidth: Number(e.target.value) || 0 })}
                      />
                    </label>
                    <label className="comment-field">
                      Align
                      <select
                        value={comment.textAlign}
                        onChange={(e) => updateComment(comment.id, { textAlign: e.target.value as CommentBox["textAlign"] })}
                      >
                        <option value="left">Left</option>
                        <option value="center">Center</option>
                        <option value="right">Right</option>
                      </select>
                    </label>
                  </div>

                  <div className="comment-controls">
                    <label className="color-field">
                      <input
                        type="color"
                        value={comment.fontColor}
                        onChange={(e) => updateComment(comment.id, { fontColor: e.target.value })}
                      />
                      <span>Text color</span>
                    </label>
                    <label className="color-field">
                      <input
                        type="color"
                        value={comment.backgroundColor}
                        onChange={(e) => updateComment(comment.id, { backgroundColor: e.target.value })}
                      />
                      <span>Fill</span>
                    </label>
                    <label className="color-field">
                      <input
                        type="color"
                        value={comment.borderColor}
                        onChange={(e) => updateComment(comment.id, { borderColor: e.target.value })}
                      />
                      <span>Border</span>
                    </label>
                    <button
                      type="button"
                      className={`btn small toggle ${comment.bold ? "active" : ""}`}
                      onClick={() => updateComment(comment.id, { bold: !comment.bold })}
                    >
                      B
                    </button>
                    <button
                      type="button"
                      className={`btn small toggle ${comment.italic ? "active" : ""}`}
                      onClick={() => updateComment(comment.id, { italic: !comment.italic })}
                    >
                      I
                    </button>
                    <label className="print-design-checkbox">
                      <input
                        type="checkbox"
                        checked={comment.includeInPrint}
                        onChange={(e) => updateComment(comment.id, { includeInPrint: e.target.checked })}
                      />
                      Include in print report
                    </label>
                  </div>

                  <div
                    className="comment-preview"
                    style={{
                      fontSize: comment.fontSize,
                      fontFamily: comment.fontFamily,
                      color: comment.fontColor,
                      backgroundColor: comment.backgroundColor,
                      borderColor: comment.borderColor,
                      borderWidth: comment.borderWidth,
                      borderStyle: "solid",
                      fontWeight: comment.bold ? 700 : 400,
                      fontStyle: comment.italic ? "italic" : "normal",
                      textAlign: comment.textAlign,
                    }}
                  >
                    {comment.text || "Preview text…"}
                  </div>
                </div>
              ))}
            </div>
            <button className="btn small" style={{ marginTop: 10 }} onClick={addComment}>
              + Add comment
            </button>
          </div>
        </>
      )}
    </div>
  );
}
