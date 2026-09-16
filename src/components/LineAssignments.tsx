import type { CommentBox, DailyBoard, Employee, ListSection, LineSlot } from "../types";
import { COMMENT_FONT_OPTIONS } from "../types";
import NameMultiSelect from "./NameMultiSelect";

interface Props {
  boards: DailyBoard[];
  setBoards: (updater: (boards: DailyBoard[]) => DailyBoard[]) => void;
  selectedId: string;
  setSelectedId: (id: string) => void;
  employees: Employee[];
}

// Roster names carry trailing role tags (e.g. "Jaiser Penales MLL") that
// the day board itself never shows - strip them so picking someone from
// the dropdown produces the same plain "First Last" text as before.
function cleanEmployeeName(name: string): string {
  return name.trim().replace(/\s+(MLL|MLT|LL)$/i, "").trim();
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function blankBoard(date: string): DailyBoard {
  return {
    id: crypto.randomUUID(),
    date,
    shiftLabel: "3rd Shift",
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

export default function LineAssignments({ boards, setBoards, selectedId, setSelectedId, employees }: Props) {
  const sorted = [...boards].sort((a, b) => (a.date < b.date ? 1 : -1));
  const board = boards.find((b) => b.id === selectedId) ?? sorted[0];
  const employeeNames = [...new Set(employees.map((e) => cleanEmployeeName(e.name)).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );

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
      : blankBoard(date);
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

  // Moves an entire line's assigned team onto another line in one board
  // update (not two separate updateSlot calls, which would each read the
  // same pre-transfer lineSlots and the second would clobber the first),
  // then clears the team off the line they transferred from.
  function transferTeam(slot: LineSlot) {
    if (!board) return;
    const team = slot.assigned
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);
    if (team.length === 0) {
      alert("No team assigned to this line to transfer.");
      return;
    }
    const otherLines = board.lineSlots.filter((s) => s.id !== slot.id).map((s) => s.line);
    if (otherLines.length === 0) {
      alert("There's no other line to transfer this team to.");
      return;
    }
    const target = prompt(
      `Transfer the team from "${slot.line}" to which line?\n\nAvailable lines: ${otherLines.join(", ")}`,
    );
    if (!target || !target.trim()) return;
    const targetSlot = board.lineSlots.find(
      (s) => s.id !== slot.id && s.line.trim().toLowerCase() === target.trim().toLowerCase(),
    );
    if (!targetSlot) {
      alert(`No line named "${target}" found.`);
      return;
    }
    const existing = targetSlot.assigned
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);
    const merged = [...existing, ...team.filter((n) => !existing.includes(n))];
    updateBoard(board.id, {
      lineSlots: board.lineSlots.map((s) => {
        if (s.id === slot.id) return { ...s, assigned: "" };
        if (s.id === targetSlot.id) return { ...s, assigned: merged.join(", ") };
        return s;
      }),
    });
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

          <div className="panel">
            <h2>Line Status</h2>
            <div className="line-slots-grid">
              {board.lineSlots.map((slot) => (
                <div className="line-slot-card" key={slot.id}>
                  <div className={`slot-head slot-status-${slot.status.replace(/ /g, "-") || "none"}`}>
                    <input
                      className="slot-line-input"
                      value={slot.line}
                      onChange={(e) => updateSlot(slot.id, { line: e.target.value })}
                    />
                    <button className="btn small danger" onClick={() => removeSlot(slot.id)}>
                      ✕
                    </button>
                  </div>
                  <div className="slot-body">
                    <select value={slot.status} onChange={(e) => updateSlot(slot.id, { status: e.target.value as LineSlot["status"] })}>
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
                    />
                    <button type="button" className="btn small" onClick={() => transferTeam(slot)}>
                      🔀 Transfer team
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button className="btn small" style={{ marginTop: 10 }} onClick={addSlot}>
              + Add line
            </button>
          </div>

          <div className="panel">
            <h2>Room &amp; Duty Assignments</h2>
            <p className="panel-hint">Prints alongside the line grid above (Label Room, Wash Room, Maintenance Mechs, etc.).</p>
            <div className="sections-grid">
              {board.roomSections.map((section) => (
                <div className="section-card" key={section.id}>
                  <div className="section-title">
                    <input
                      value={section.title}
                      onChange={(e) => updateSection("roomSections", section.id, { title: e.target.value })}
                    />
                    <button className="btn small danger" onClick={() => removeSection("roomSections", section.id)}>
                      ✕
                    </button>
                  </div>
                  {section.items.map((item, i) => (
                    <div className="section-item-row" key={i}>
                      <input value={item} onChange={(e) => setItem("roomSections", section, i, e.target.value)} />
                      <button className="btn small danger" onClick={() => removeItem("roomSections", section, i)}>
                        ✕
                      </button>
                    </div>
                  ))}
                  <button className="btn small" onClick={() => addItem("roomSections", section)}>
                    + Add item
                  </button>
                </div>
              ))}
            </div>
            <button className="btn small" style={{ marginTop: 10 }} onClick={() => addSection("roomSections")}>
              + Add section
            </button>
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
