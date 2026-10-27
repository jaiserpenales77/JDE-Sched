import { useState } from "react";
import type { CSSProperties } from "react";
import type {
  CommentBox,
  DailyBoard,
  Employee,
  ExtraKind,
  ExtraPerson,
  ListSection,
  LineSlot,
  PrintAssignSettings,
  SectionStyle,
  TimeOffEntry,
} from "../types";
import { describeEntry, entriesOn, todayIso } from "../timeOffLogic";
import { COMMENT_FONT_OPTIONS, DEFAULT_SECTION_STYLE, EXTRA_KINDS, EXTRA_KIND_LABELS, SKILL_LABELS } from "../types";
import NameMultiSelect from "./NameMultiSelect";
import type { ChipRole, ChipWarning, NameStatus } from "./NameMultiSelect";
import UnassignedPanel from "./UnassignedPanel";
import PageEditor from "./PageEditor";
import type { PageSelection } from "./PageEditor";
import PersonPicker from "./PersonPicker";
import PrintDesignSettings from "./PrintDesignSettings";
import { buildRoleMap, nameKey, roleCategory, roleOf } from "../printLayout";
import {
  autoFillFromPrimaryLines,
  boardOut,
  boardPlacements,
  cleanEmployeeName,
  parseNames,
  crewBadgeTone,
  describeExtras,
  dutyNeededFromTitle,
  extraKind,
  lineCrew,
  lineExtras,
  lineLead,
  slotCoverage,
  slotRoleMap,
  trainingSkillFor,
} from "../assignmentLogic";

// The extra people's kinds in the side panel (the page and printout draw
// their own icons).
const EXTRA_KIND_EMOJI: Record<ExtraKind, string> = { training: "🎓", dumping: "📥", overtime: "⏱" };

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
  // Scheduled time off from the Time Off tab - anyone covering the board's
  // date counts as out on that board.
  timeOff: TimeOffEntry[];
  // The other shifts' names, in shift order, A-Z - for picking overtime.
  otherShifts: { label: string; names: string[] }[];
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

// A "(+1)" adder like the original sheet's Cremer / Labeler Training
// headers: gold #FEC802 fill with black text.
const ADDER_PRESET: Pick<ListSection, "title" | "style"> = {
  title: "New Adder",
  style: { ...DEFAULT_SECTION_STYLE, headerFillColor: "#fec802", headerTextColor: "#000000" },
};

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
  timeOff,
  otherShifts,
}: Props) {
  const sorted = [...boards].sort((a, b) => (a.date < b.date ? 1 : -1));
  const today = todayIso();
  // With nothing picked yet, open today's board if there is one.
  const board = boards.find((b) => b.id === selectedId) ?? boards.find((b) => b.date === today) ?? sorted[0];
  const employeeNames = [...new Set(employees.map((e) => cleanEmployeeName(e.name)).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
  const roleMap = buildRoleMap(employees);

  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<PageSelection | null>(null);
  // What the next person marked as extra on a line is there for.
  const [extraKindToAdd, setExtraKindToAdd] = useState<ExtraKind>("training");

  const placements = boardPlacements(board);
  const out = boardOut(board, timeOff);
  const scheduledOff = board ? entriesOn(timeOff, board.date) : [];

  // Time off only marks people out on the board for its own date - so when
  // an older (or future) board is open, today's call-outs don't show on it.
  const todayBoard = boards.find((b) => b.date === today);
  const notToday = !!board && board.date !== today;
  const outTodayHere = notToday
    ? entriesOn(timeOff, today).filter((e) => placements.has(nameKey(e.name)) && !out.has(nameKey(e.name)))
    : [];

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
  const rosterKeySet = new Set(rosterKeys);
  // Which other shift someone's name is on, for overtime ("2nd Shift").
  function shiftOf(name: string): string | undefined {
    const key = nameKey(name);
    return otherShifts.find((s) => s.names.some((n) => nameKey(n) === key))?.label;
  }
  const rosterAvailable = rosterKeys.filter((k) => !out.has(k));
  const rosterPlaced = rosterAvailable.filter((k) => placements.has(k)).length;

  function updateBoard(id: string, patch: Partial<DailyBoard>) {
    setBoards((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  function newDay(duplicateCurrent: boolean, date = prompt("Date for the new board (YYYY-MM-DD):", today)) {
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
        if (s.id === slot.id) return { ...s, assigned: "", trainees: [], lead: "" };
        if (s.id === targetSlot.id)
          return {
            ...s,
            assigned: merged.join(", "),
            trainees: [...lineExtras(targetSlot), ...lineExtras(slot)],
            lead: lineLead(targetSlot) ?? lineLead(slot) ?? "",
          };
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
  function addSection(field: SectionField, preset?: Pick<ListSection, "title" | "style">) {
    if (!board) return;
    const section = { ...blankSection(), ...preset };
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
      const extras = lineExtras(slot);
      const crewNames = lineCrew(slot);
      const setExtras = (next: ExtraPerson[]) => updateSlot(slot.id, { trainees: next });
      const changeExtra = (name: string, patch: Partial<ExtraPerson>) =>
        setExtras(extras.map((x) => (nameKey(x.name) === nameKey(name) ? { ...x, ...patch } : x)));
      // The other shifts' names for overtime, leaving out anyone already on
      // this line.
      const onLine = new Set(parseNames(slot.assigned).map(nameKey));
      const overtimeChoices = otherShifts
        .map((s) => ({
          label: s.label,
          names: s.names.filter((n) => !onLine.has(nameKey(n))).sort((a, b) => a.localeCompare(b)),
        }))
        .filter((s) => s.names.length > 0);
      const tone = crewBadgeTone(slot);
      const lead = lineLead(slot);
      const lineRoles = slotRoleMap(slot, roleMap);
      // Chips colored like the line's rows on the board (with the board's
      // highlight colors), the picked lead first with a ⭐.
      const chipRole = (name: string): ChipRole | null => {
        if (!printSettings.highlightRoles) return null;
        if (lead && nameKey(name) === nameKey(lead)) return "lead";
        const category = roleCategory(roleOf(name, lineRoles));
        return category === "other" ? null : category;
      };
      const count = cov.target !== null ? `${cov.count}/${cov.target}` : cov.count;
      const countBadge =
        cov.extras.length > 0 ? (
          <span className="count-badge count-badge-split" title={`+ ${describeExtras(cov.extras)} (not counted in the ZBS)`}>
            <span className={`count-crew-part${tone ? ` count-badge-${tone}` : ""}`}>👥 {count}</span>
            {cov.extras.map((e) => (
              <span className={`extra-${e.kind}`} key={e.kind}>
                +{e.count} {EXTRA_KIND_EMOJI[e.kind]}
              </span>
            ))}
          </span>
        ) : (
          <span className={`count-badge${tone ? ` count-badge-${tone}` : ""}`}>👥 {count}</span>
        );
      const panelColors = {
        "--line-bar": slot.status === "Scheduled" ? printSettings.scheduledColor : slot.status === "PM" ? printSettings.pmColor : printSettings.notScheduledColor,
        "--chip-leader": printSettings.leaderColor,
        "--chip-mll": printSettings.mllColor,
        "--chip-mlt": printSettings.mltColor,
      } as CSSProperties;
      return (
        <div className="panel inspector line-inspector" style={panelColors}>
          {/* Topped like the line's box on the board: its name (click to
              rename), crew count, status and note. */}
          <div className="line-bar">
            <div className="line-bar-top">
              <input
                className="line-bar-name"
                aria-label="Line name"
                title="Click to rename the line"
                value={slot.line}
                onChange={(e) => updateSlot(slot.id, { line: e.target.value })}
              />
              {countBadge}
              <button className="line-bar-close" onClick={() => setSelection(null)} title="Done">
                ✕
              </button>
            </div>
            <div className="line-bar-fields">
              <label className="line-bar-field">
                <span>Status</span>
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
              <label className="line-bar-field">
                <span>Note</span>
                <input
                  placeholder="e.g. ZBS - 6"
                  value={slot.subNote}
                  onChange={(e) => updateSlot(slot.id, { subNote: e.target.value })}
                />
              </label>
            </div>
          </div>
          <div className="line-body">
            {cov.warnings.length > 0 && (
              <ul className="slot-warnings line-warnings">
                {cov.warnings.map((w) => (
                  <li key={w}>⚠ {w}</li>
                ))}
              </ul>
            )}
            <section className="line-sec">
              <div className="line-sec-h">
                <span className="line-sec-ic line-sec-ic-crew">👥</span>Crew
              </div>
              <NameMultiSelect
                value={slot.assigned}
                onChange={(next) => updateSlot(slot.id, { assigned: next })}
                options={employeeNames}
                slotId={slot.id}
                onDropEmployee={(name, fromId) => movePerson(name, fromId, slot.id)}
                roleMap={lineRoles}
                leadFirst={lead}
                chipRole={chipRole}
                describe={describe}
                chipWarning={(name) => warningFor(name, slot.id)}
                isMatch={isMatch}
              />
              {printSettings.highlightRoles && (
                <div className="role-legend">
                  <span>
                    <b style={{ background: printSettings.leaderColor }} />
                    Lead
                  </span>
                  <span>
                    <b style={{ background: printSettings.mllColor }} />
                    MLL
                  </span>
                  <span>
                    <b style={{ background: printSettings.mltColor }} />
                    MLT
                  </span>
                </div>
              )}
            </section>
            <section className="line-sec">
              <div className="line-sec-h">
                <span className="line-sec-ic line-sec-ic-lead">⭐</span>Line lead
              </div>
              {/* The whole card opens the pick list. */}
              <label className={`lead-card${lead ? " lead-card-picked" : ""}`}>
                <span className="lead-star">{lead ? "★" : "☆"}</span>
                <span className="lead-who">
                  {lead ?? "From Skills & Roles"}
                  <small>{lead ? "Picked · listed first, in green" : "Leads from the roster are highlighted"}</small>
                </span>
                <span className="lead-change">Change ⌄</span>
                <select aria-label="Line lead" value={lead ?? ""} onChange={(e) => updateSlot(slot.id, { lead: e.target.value })}>
                  <option value="">From Skills &amp; Roles</option>
                  {crewNames.map((n) => {
                    const role = roleOf(n, roleMap);
                    return (
                      <option key={n} value={n}>
                        {n}
                        {role ? ` (${role})` : ""}
                      </option>
                    );
                  })}
                </select>
              </label>
            </section>
            <section className="line-sec">
              <div className="line-sec-h">
                <span className="line-sec-ic line-sec-ic-extra">➕</span>Training · dumping · overtime
              </div>
              {extras.map((t) => {
                const kind = extraKind(t);
                // Someone from another shift (not on this roster): ✕ takes them
                // off the line instead of leaving them in the crew.
                const fromShift = rosterKeySet.has(nameKey(t.name)) ? undefined : shiftOf(t.name);
                return (
                  <div className={`trainee-edit-row extra-edit-${kind}`} key={nameKey(t.name)}>
                    <span className="trainee-edit-name" title={fromShift ? `${t.name} (${fromShift})` : t.name}>
                      {t.name}
                    </span>
                    <select
                      value={kind}
                      title={`Why ${t.name} is extra`}
                      onChange={(e) => {
                        const next = e.target.value as ExtraKind;
                        // Back to training: start from their IP skill again.
                        const skill = next === "training" && !t.skill.trim() ? trainingSkillFor(t.name, employees) : t.skill;
                        changeExtra(t.name, { kind: next, skill });
                      }}
                    >
                      {EXTRA_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {EXTRA_KIND_EMOJI[k]} {EXTRA_KIND_LABELS[k]}
                        </option>
                      ))}
                    </select>
                    <button
                      className="btn small"
                      title={fromShift ? `Take ${t.name} off this line` : `${t.name} goes back to the crew`}
                      onClick={() =>
                        updateSlot(slot.id, {
                          trainees: extras.filter((x) => nameKey(x.name) !== nameKey(t.name)),
                          ...(fromShift
                            ? { assigned: parseNames(slot.assigned).filter((n) => nameKey(n) !== nameKey(t.name)).join(", ") }
                            : {}),
                        })
                      }
                    >
                      ✕
                    </button>
                    {fromShift && <span className="extra-from">From {fromShift}</span>}
                    {kind === "training" && (
                      <input
                        className="trainee-edit-skill"
                        list="training-skill-options"
                        placeholder="Training on what? (Cremer, MLL…)"
                        value={t.skill}
                        onChange={(e) => changeExtra(t.name, { skill: e.target.value })}
                      />
                    )}
                  </div>
                );
              })}
              <div className="extra-add-row">
                <select
                  value={extraKindToAdd}
                  title="What they're on the line for"
                  onChange={(e) => setExtraKindToAdd(e.target.value as ExtraKind)}
                >
                  {EXTRA_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {EXTRA_KIND_EMOJI[k]} {EXTRA_KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
                {extraKindToAdd === "overtime" ? (
                  // Overtime comes from the other shifts: their names, by
                  // shift (in shift order), A-Z. Picking adds them to the line.
                  <select
                    className="inspector-select"
                    value=""
                    disabled={overtimeChoices.length === 0}
                    onChange={(e) => {
                      const name = e.target.value;
                      if (!name) return;
                      updateSlot(slot.id, {
                        assigned: [...parseNames(slot.assigned), name].join(", "),
                        trainees: [...extras, { name, skill: "", kind: "overtime" }],
                      });
                    }}
                  >
                    <option value="">{overtimeChoices.length ? "From another shift…" : "No other shift's names yet"}</option>
                    {overtimeChoices.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.names.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                ) : (
                  <select
                    className="inspector-select"
                    value=""
                    disabled={crewNames.length === 0}
                    onChange={(e) => {
                      const name = e.target.value;
                      if (!name) return;
                      const skill = extraKindToAdd === "training" ? trainingSkillFor(name, employees) : "";
                      setExtras([...extras, { name, skill, kind: extraKindToAdd }]);
                    }}
                  >
                    <option value="">Pick someone…</option>
                    {crewNames.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <datalist id="training-skill-options">
                {[...Object.values(SKILL_LABELS), "MLL", "MLT", "Line Leader"].map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
              <p className="line-tip">
                ⓘ Overtime counts toward the ZBS; training and dumping don't.
              </p>
            </section>
            <div className="line-foot">
              {/* A button that opens the list of lines to move the crew to. */}
              <label
                className={`btn line-foot-btn${slot.assigned.trim() ? "" : " line-foot-btn-off"}`}
                title={slot.assigned.trim() ? "Move this line's crew to another line" : "No team assigned to this line to transfer."}
              >
                🔀 Transfer team
                <select
                  aria-label="Transfer team to"
                  value=""
                  disabled={!slot.assigned.trim()}
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
              </label>
              <button
                className="btn danger line-foot-btn"
                onClick={() => {
                  if (slot.assigned.trim() && !confirm(`Delete ${slot.line || "this line"} and its crew from the page?`)) return;
                  removeSlot(slot.id);
                  setSelection(null);
                }}
              >
                🗑 Delete line
              </button>
            </div>
          </div>
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
          <div className="duty-badge-options">
            <label className="print-design-checkbox">
              <input
                type="checkbox"
                checked={!!section.crewBadge}
                onChange={(e) => updateSection("roomSections", section.id, { crewBadge: e.target.checked })}
              />
              Show a 👥 crew badge on this box
            </label>
            {section.crewBadge && (
              <label className="inspector-field duty-needed">
                People needed
                <input
                  type="number"
                  min={0}
                  max={99}
                  placeholder={dutyNeededFromTitle(section.title) !== null ? `${dutyNeededFromTitle(section.title)} (from the title)` : "optional"}
                  value={typeof section.crewNeeded === "number" ? section.crewNeeded : ""}
                  onChange={(e) => {
                    const n = Math.round(Number(e.target.value));
                    updateSection("roomSections", section.id, {
                      crewNeeded: e.target.value === "" || !(n > 0) ? null : Math.min(99, n),
                    });
                  }}
                />
                <span className="duty-needed-hint">Fewer people than this shows the badge in light red.</span>
              </label>
            )}
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

      {board && notToday && (
        <div className="stale-board-banner">
          <div>
            <strong>
              This is the board for {board.date} — today is {today}.
            </strong>{" "}
            Time off and call-outs only mark people out on the board for their own date.
            {outTodayHere.length > 0 && (
              <>
                {" "}
                Out today but still shown on this board:{" "}
                {outTodayHere.map((e, i) => (
                  <span key={e.id}>
                    {i > 0 && ", "}
                    <strong>{e.name}</strong> ({describeEntry(e)})
                  </span>
                ))}
                .
              </>
            )}
          </div>
          {todayBoard ? (
            <button className="btn primary" onClick={() => setSelectedId(todayBoard.id)}>
              Go to today's board
            </button>
          ) : (
            <button className="btn primary" onClick={() => newDay(true, today)}>
              📋 Start today's board from this one
            </button>
          )}
        </div>
      )}

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
                    onClick={() => addSection("roomSections", ADDER_PRESET)}
                    title="A duty section styled like the sheet's (+1) adders: #FEC802 header, black text"
                  >
                    + Adder
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

              <PrintDesignSettings settings={printSettings} setSettings={setPrintSettings} />
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
            {scheduledOff.length > 0 && (
              <div className="scheduled-off">
                <strong>Scheduled time off on {board.date}</strong> <span className="panel-hint">(from the Time Off tab)</span>
                <ul>
                  {scheduledOff.map((e) => (
                    <li key={e.id}>
                      {e.name} — {describeEntry(e)}
                      {e.start !== e.end && (
                        <span className="scheduled-off-range">
                          {" "}
                          ({e.start} to {e.end})
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
