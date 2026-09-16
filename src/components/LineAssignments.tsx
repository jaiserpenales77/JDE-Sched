import { useState } from "react";
import type { DailyBoard, ListSection, LineSlot } from "../types";

interface Props {
  boards: DailyBoard[];
  setBoards: (updater: (boards: DailyBoard[]) => DailyBoard[]) => void;
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
    listSections: [],
  };
}

function blankSlot(): LineSlot {
  return { id: crypto.randomUUID(), line: "New Line", status: "", subNote: "", assigned: "" };
}

function blankSection(): ListSection {
  return { id: crypto.randomUUID(), title: "New Section", items: [] };
}

export default function LineAssignments({ boards, setBoards }: Props) {
  const sorted = [...boards].sort((a, b) => (a.date < b.date ? 1 : -1));
  const [selectedId, setSelectedId] = useState<string>(sorted[0]?.id ?? "");
  const board = boards.find((b) => b.id === selectedId) ?? sorted[0];

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
          listSections: board.listSections.map((s) => ({ ...s, id: crypto.randomUUID(), items: [...s.items] })),
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

  function updateSection(id: string, patch: Partial<ListSection>) {
    if (!board) return;
    updateBoard(board.id, { listSections: board.listSections.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  }
  function removeSection(id: string) {
    if (!board) return;
    updateBoard(board.id, { listSections: board.listSections.filter((s) => s.id !== id) });
  }
  function addSection() {
    if (!board) return;
    updateBoard(board.id, { listSections: [...board.listSections, blankSection()] });
  }

  function setItem(section: ListSection, i: number, value: string) {
    if (!board) return;
    const items = [...section.items];
    items[i] = value;
    updateSection(section.id, { items });
  }
  function removeItem(section: ListSection, i: number) {
    if (!board) return;
    updateSection(section.id, { items: section.items.filter((_, idx) => idx !== i) });
  }
  function addItem(section: ListSection) {
    updateSection(section.id, { items: [...section.items, ""] });
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
                    </select>
                    <input
                      placeholder="Note (e.g. ZBS-6)"
                      value={slot.subNote}
                      onChange={(e) => updateSlot(slot.id, { subNote: e.target.value })}
                    />
                    <textarea
                      placeholder="Assigned employees"
                      rows={2}
                      value={slot.assigned}
                      onChange={(e) => updateSlot(slot.id, { assigned: e.target.value })}
                    />
                  </div>
                </div>
              ))}
            </div>
            <button className="btn small" style={{ marginTop: 10 }} onClick={addSlot}>
              + Add line
            </button>
          </div>

          <div className="panel">
            <h2>Rosters &amp; Notes</h2>
            <div className="sections-grid">
              {board.listSections.map((section) => (
                <div className="section-card" key={section.id}>
                  <div className="section-title">
                    <input value={section.title} onChange={(e) => updateSection(section.id, { title: e.target.value })} />
                    <button className="btn small danger" onClick={() => removeSection(section.id)}>
                      ✕
                    </button>
                  </div>
                  {section.items.map((item, i) => (
                    <div className="section-item-row" key={i}>
                      <input value={item} onChange={(e) => setItem(section, i, e.target.value)} />
                      <button className="btn small danger" onClick={() => removeItem(section, i)}>
                        ✕
                      </button>
                    </div>
                  ))}
                  <button className="btn small" onClick={() => addItem(section)}>
                    + Add item
                  </button>
                </div>
              ))}
            </div>
            <button className="btn small" style={{ marginTop: 10 }} onClick={addSection}>
              + Add section
            </button>
          </div>
        </>
      )}
    </div>
  );
}
