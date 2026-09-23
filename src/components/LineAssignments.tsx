import { useState } from "react";
import type { CommentBox, DailyBoard, Employee, ListSection, LineSlot, PrintAssignSettings, SectionStyle } from "../types";
import { COMMENT_FONT_OPTIONS, DEFAULT_SECTION_STYLE } from "../types";
import NameMultiSelect from "./NameMultiSelect";
import type { ChipWarning, NameStatus } from "./NameMultiSelect";
import UnassignedPanel from "./UnassignedPanel";
import PageEditor from "./PageEditor";
import type { PageSelection } from "./PageEditor";
import PersonPicker from "./PersonPicker";
import { buildRoleMap, nameKey, roleCategory, roleOf } from "../printLayout";
import { autoFillFromPrimaryLines, boardOut, boardPlacements, cleanEmployeeName, parseNames, slotCoverage } from "../assignmentLogic";

interface Props {
  boards: DailyBoard[];
  setBoards: (updater: (boards: DailyBoard[]) => DailyBoard[]) => void;
  selectedId: string;
  setSelectedId: (id: string) => void;
  employees: Employee[];
  // Label a newly-created board starts with (e.g. "1st Shift") - matches
  // whichever shift this device is currently showing.
  defaultShiftLabel: string;
  printSettings: PrintAssignSettings;
  setPrintSettings: (updater: (s: PrintAssignSettings) => PrintAssignSettings) => void;
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
  printSettings,
  setPrintSettings,
}: Props) {
  const sorted = [...boards].sort((a, b) => (a.date < b.date ? 1 : -1));
  const board = boards.find((b) => b.id === selectedId) ?? sorted[0];
  const employeeNames = [...new Set(employees.map((e) => cleanEmployeeName(e.name)).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
  const roleMap = buildRoleMap(employees);

  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<PageSelection | null>(null);

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
    const slot = blankSlot();
    updateBoard(board.id, { lineSlots: [...board.lineSlots, slot] });
    setSelection({ kind: "line", id: slot.id });
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

  // Moves one person between any two places on the page - a line, a duty
  // section, or in from the Unassigned list (fromId matches nothing then) -
  // in a single board update, so the remove and the add can't clobber
  // each other.
  function movePerson(name: string, fromId: string, toId: string) {
    if (!board || fromId === toId) return;
    const key = nameKey(name);
    updateBoard(board.id, {
      lineSlots: board.lineSlots.map((s) => {
        if (s.id !== fromId && s.id !== toId) return s;
        let names = parseNames(s.assigned);
        if (s.id === fromId) names = names.filter((n) => n !== name);
        if (s.id === toId && !names.some((n) => nameKey(n) === key)) names = [...names, name];
        return { ...s, assigned: names.join(", ") };
      }),
      roomSections: board.roomSections.map((r) => {
        if (r.id !== fromId && r.id !== toId) return r;
        let items = r.items;
        if (r.id === fromId) items = items.filter((item) => item !== name);
        if (r.id === toId && !items.some((item) => nameKey(item) === key)) items = [...items, name];
        return { ...r, items };
      }),
    });
  }

  function removePerson(name: string, placeId: string) {
    if (!board) return;
    updateBoard(board.id, {
      lineSlots: board.lineSlots.map((s) =>
        s.id === placeId ? { ...s, assigned: parseNames(s.assigned).filter((n) => n !== name).join(", ") } : s,
      ),
      roomSections: board.roomSections.map((r) =>
        r.id === placeId ? { ...r, items: r.items.filter((item) => item !== name) } : r,
      ),
    });
  }

  function addPerson(name: string, placeId: string) {
    movePerson(name, "", placeId);
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
    const section = blankSection();
    updateBoard(board.id, { [field]: [...board[field], section] });
    if (field === "roomSections") setSelection({ kind: "room", id: section.id });
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

  function setSectionStyle(section: ListSection, patch: Partial<SectionStyle>) {
    updateSection("roomSections", section.id, { style: { ...(section.style ?? DEFAULT_SECTION_STYLE), ...patch } });
  }

  // Drops the style key entirely (not style: undefined - Firestore rejects
  // undefined values) so the section goes back to the standard look.
  function resetSectionStyle(section: ListSection) {
    if (!board) return;
    updateBoard(board.id, {
      roomSections: board.roomSections.map((r) => {
        if (r.id !== section.id) return r;
        const { style: _style, ...rest } = r;
        return rest;
      }),
    });
  }

  function applyStyleToAllSections(section: ListSection) {
    if (!board) return;
    const style = section.style ?? DEFAULT_SECTION_STYLE;
    updateBoard(board.id, { roomSections: board.roomSections.map((r) => ({ ...r, style: { ...style } })) });
  }

  function renderSectionStyle(section: ListSection) {
    const st = section.style ?? DEFAULT_SECTION_STYLE;
    const size = (value: string, fallback: number) => Math.min(48, Math.max(4, Number(value) || fallback));
    return (
      <details className="inspector-details" open>
        <summary>Style</summary>
        <label className="inspector-field">
          Font
          <select value={st.fontFamily} onChange={(e) => setSectionStyle(section, { fontFamily: e.target.value })}>
            {COMMENT_FONT_OPTIONS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>

        <div className="inspector-row">
          <label className="inspector-field">
            Header size (pt)
            <input
              type="number"
              min={4}
              max={48}
              step={0.5}
              value={st.headerFontSize}
              onChange={(e) => setSectionStyle(section, { headerFontSize: size(e.target.value, st.headerFontSize) })}
            />
          </label>
          <label className="inspector-field">
            Header align
            <select
              value={st.headerAlign}
              onChange={(e) => setSectionStyle(section, { headerAlign: e.target.value as SectionStyle["headerAlign"] })}
            >
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </label>
        </div>
        <div className="style-colors">
          <label className="color-field">
            <input
              type="color"
              value={st.headerTextColor}
              onChange={(e) => setSectionStyle(section, { headerTextColor: e.target.value })}
            />
            <span>Header text</span>
          </label>
          <label className="color-field">
            <input
              type="color"
              value={st.headerFillColor}
              onChange={(e) => setSectionStyle(section, { headerFillColor: e.target.value })}
            />
            <span>Header fill</span>
          </label>
        </div>

        <div className="inspector-row">
          <label className="inspector-field">
            Text size (pt)
            <input
              type="number"
              min={4}
              max={48}
              step={0.5}
              value={st.textFontSize}
              onChange={(e) => setSectionStyle(section, { textFontSize: size(e.target.value, st.textFontSize) })}
            />
          </label>
          <label className="inspector-field">
            Text align
            <select
              value={st.textAlign}
              onChange={(e) => setSectionStyle(section, { textAlign: e.target.value as SectionStyle["textAlign"] })}
            >
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </label>
        </div>
        <div className="style-colors">
          <label className="color-field">
            <input type="color" value={st.textColor} onChange={(e) => setSectionStyle(section, { textColor: e.target.value })} />
            <span>Text color</span>
          </label>
          <button
            type="button"
            className={`btn small toggle ${st.textBold ? "active" : ""}`}
            onClick={() => setSectionStyle(section, { textBold: !st.textBold })}
            title="Bold names"
          >
            B
          </button>
        </div>
        <p className="panel-hint inspector-hint">MLL, Line Lead and MLT names keep their highlight colors.</p>

        <div className="style-actions">
          <button type="button" className="btn small" onClick={() => applyStyleToAllSections(section)}>
            Apply to all duty sections
          </button>
          <button type="button" className="btn small" onClick={() => resetSectionStyle(section)} disabled={!section.style}>
            Reset
          </button>
        </div>
      </details>
    );
  }

  // Edits whatever box is selected on the page.
  function renderInspector(board: DailyBoard) {
    const close = (
      <button className="btn small" onClick={() => setSelection(null)} title="Done">
        ✕
      </button>
    );

    if (selection?.kind === "header") {
      return (
        <div className="panel inspector">
          <div className="inspector-head">
            <h2>Page header</h2>
            {close}
          </div>
          <label className="inspector-field">
            Date
            <input type="date" value={board.date} onChange={(e) => updateBoard(board.id, { date: e.target.value })} />
          </label>
          <label className="inspector-field">
            Shift
            <input value={board.shiftLabel} onChange={(e) => updateBoard(board.id, { shiftLabel: e.target.value })} />
          </label>
          <label className="inspector-field">
            Dept. Leader(s)
            <input value={board.deptLeader} onChange={(e) => updateBoard(board.id, { deptLeader: e.target.value })} />
          </label>
          <p className="panel-hint inspector-hint">The safety banner text and colors are under Print Design below.</p>
        </div>
      );
    }

    const slot = selection?.kind === "line" ? board.lineSlots.find((s) => s.id === selection.id) : undefined;
    if (slot) {
      const cov = slotCoverage(slot, roleMap);
      return (
        <div className="panel inspector">
          <div className="inspector-head">
            <h2>{slot.line || "Line"}</h2>
            {close}
          </div>
          <label className="inspector-field">
            Line name
            <input value={slot.line} onChange={(e) => updateSlot(slot.id, { line: e.target.value })} />
          </label>
          <div className="inspector-row">
            <label className="inspector-field">
              Status
              <select
                value={slot.status}
                onChange={(e) => updateSlot(slot.id, { status: e.target.value as LineSlot["status"] })}
              >
                <option value="">—</option>
                <option value="Scheduled">Scheduled</option>
                <option value="Not Scheduled">Not Scheduled</option>
                <option value="PM">PM</option>
              </select>
            </label>
            <label className="inspector-field">
              Note
              <input
                placeholder="e.g. ZBS - 6"
                value={slot.subNote}
                onChange={(e) => updateSlot(slot.id, { subNote: e.target.value })}
              />
            </label>
          </div>
          {cov.warnings.length > 0 && (
            <ul className="slot-warnings">
              {cov.warnings.map((w) => (
                <li key={w}>⚠ {w}</li>
              ))}
            </ul>
          )}
          <div className="inspector-label">
            Crew <span className="count-badge">{cov.target !== null ? `${cov.count}/${cov.target}` : cov.count}</span>
          </div>
          <NameMultiSelect
            value={slot.assigned}
            onChange={(next) => updateSlot(slot.id, { assigned: next })}
            options={employeeNames}
            slotId={slot.id}
            onDropEmployee={(name, fromId) => movePerson(name, fromId, slot.id)}
            roleMap={roleMap}
            describe={describe}
            chipWarning={(name) => warningFor(name, slot.id)}
            isMatch={isMatch}
          />
          <select
            className="inspector-select"
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
          <button
            className="btn small danger inspector-delete"
            onClick={() => {
              if (slot.assigned.trim() && !confirm(`Delete ${slot.line || "this line"} and its crew from the page?`)) return;
              removeSlot(slot.id);
              setSelection(null);
            }}
          >
            Delete line
          </button>
        </div>
      );
    }

    const section = selection?.kind === "room" ? board.roomSections.find((r) => r.id === selection.id) : undefined;
    if (section) {
      return (
        <div className="panel inspector">
          <div className="inspector-head">
            <h2>{section.title || "Duty section"}</h2>
            {close}
          </div>
          <label className="inspector-field">
            Section title
            <input
              value={section.title}
              onChange={(e) => updateSection("roomSections", section.id, { title: e.target.value })}
            />
          </label>
          <div className="inspector-label">People / items</div>
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
              onPick={(name) => addPerson(name, section.id)}
            />
            <button className="btn small" onClick={() => addItem("roomSections", section)}>
              + Text
            </button>
          </div>
          {renderSectionStyle(section)}
          <button
            className="btn small danger inspector-delete"
            onClick={() => {
              if (section.items.some((i) => i.trim()) && !confirm(`Delete the ${section.title || "duty"} section?`)) return;
              removeSection("roomSections", section.id);
              setSelection(null);
            }}
          >
            Delete section
          </button>
        </div>
      );
    }

    const comment = selection?.kind === "comment" ? board.comments.find((c) => c.id === selection.id) : undefined;
    if (comment) {
      return (
        <div className="panel inspector">
          <div className="inspector-head">
            <h2>{comment.title || "Comment"}</h2>
            {close}
          </div>
          <textarea
            className="inspector-textarea"
            rows={4}
            value={comment.text}
            onChange={(e) => updateComment(comment.id, { text: e.target.value })}
          />
          <label className="print-design-checkbox">
            <input
              type="checkbox"
              checked={comment.includeInPrint}
              onChange={(e) => {
                updateComment(comment.id, { includeInPrint: e.target.checked });
                if (!e.target.checked) setSelection(null);
              }}
            />
            Include in print report
          </label>
          <p className="panel-hint inspector-hint">Font, colors and border are under Comments below.</p>
        </div>
      );
    }

    return (
      <div className="panel inspector inspector-empty">
        <strong>Click a box on the page to edit it.</strong>
        <span>Line names, status, notes and crew — or click the title to change the date, shift and dept. leader.</span>
      </div>
    );
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
          <div className="assign-layout">
            <div className="assign-main">
              <div className="panel">
                <h2>Line Assignments page</h2>
                <p className="panel-hint">
                  This is the printed page. Drag names between boxes (or in from Unassigned), hover a name and click ✕ to
                  remove it, and click any box — or the title — to edit it in the panel on the right.
                  {printSettings.freeFormLayout && " Drag a box's ⠿ handle to move it, or its corner to resize it."}
                </p>
                <div className="line-status-toolbar">
                  <input
                    type="search"
                    className="assign-search"
                    placeholder="🔍 Find a person…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <button className="btn small" onClick={addSlot}>
                    + Line
                  </button>
                  <button className="btn small" onClick={() => addSection("roomSections")}>
                    + Duty section
                  </button>
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

                <PageEditor
                  board={board}
                  settings={printSettings}
                  setSettings={setPrintSettings}
                  roleMap={roleMap}
                  employeeNames={employeeNames}
                  selection={selection}
                  onSelect={setSelection}
                  movePerson={movePerson}
                  removePerson={removePerson}
                  addPerson={addPerson}
                  describe={describe}
                  warningFor={warningFor}
                  coverage={(slot) => slotCoverage(slot, roleMap)}
                  isMatch={isMatch}
                  searching={q.length >= 2}
                />
              </div>
            </div>

            <div className="assign-side">
              {renderInspector(board)}
              <UnassignedPanel
                employees={employees}
                placements={placements}
                out={out}
                roleMap={roleMap}
                doubleBooked={doubleBooked}
                isMatch={isMatch}
                onUnassign={removePerson}
              />
            </div>
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
