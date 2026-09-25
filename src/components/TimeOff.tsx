import { useState } from "react";
import type { Employee, TimeOffEntry, TimeOffType } from "../types";
import { TIME_OFF_TYPES } from "../types";
import { cleanEmployeeName } from "../assignmentLogic";
import { nameKey } from "../printLayout";
import { addDays, covers, describeEntry, entriesOn, overlaps, todayIso } from "../timeOffLogic";

interface Props {
  timeOff: TimeOffEntry[];
  setTimeOff: (updater: (entries: TimeOffEntry[]) => TimeOffEntry[]) => void;
  employees: Employee[];
}

const WINDOW_DAYS = 14;
const TYPE_CLASS: Record<TimeOffType, string> = {
  PTO: "to-pto",
  "Call Out": "to-callout",
  LOA: "to-loa",
  Sick: "to-sick",
  Bereavement: "to-bereavement",
  Other: "to-other",
};

// Short labels for the calendar's narrow day cells.
const SHORT_LABEL: Partial<Record<TimeOffType, string>> = { Bereavement: "Brv", "Call Out": "C/O" };

type Filter = "upcoming" | "past" | "all";

function dayCount(entry: TimeOffEntry): number {
  const [y1, m1, d1] = entry.start.split("-").map(Number);
  const [y2, m2, d2] = (entry.end || entry.start).split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000) + 1;
}

function dayLabel(iso: string): { weekday: string; date: string; weekend: boolean } {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return {
    weekday: date.toLocaleDateString(undefined, { weekday: "short" }),
    date: `${m}/${d}`,
    weekend: date.getDay() === 0 || date.getDay() === 6,
  };
}

export default function TimeOff({ timeOff, setTimeOff, employees }: Props) {
  const today = todayIso();
  const rosterNames = [...new Set(employees.map((e) => cleanEmployeeName(e.name)).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );

  const [draft, setDraft] = useState({ name: "", type: "PTO" as TimeOffType, start: today, end: today, note: "" });
  const [callOut, setCallOut] = useState({ name: "", note: "" });
  const [windowStart, setWindowStart] = useState(today);
  const [filter, setFilter] = useState<Filter>("upcoming");

  function addEntry() {
    const name = cleanEmployeeName(draft.name);
    if (!name || !draft.start) {
      alert("Pick an employee and a start date.");
      return;
    }
    const [start, end] = draft.end && draft.end < draft.start ? [draft.end, draft.start] : [draft.start, draft.end || draft.start];
    setTimeOff((entries) => [...entries, { id: crypto.randomUUID(), name, type: draft.type, start, end, note: draft.note.trim() }]);
    setDraft((d) => ({ ...d, name: "", note: "" }));
  }

  // One-click "they called in today" - a Call Out entry for today only.
  function logCallOut() {
    const name = cleanEmployeeName(callOut.name);
    if (!name) {
      alert("Pick who called out.");
      return;
    }
    const key = nameKey(name);
    if (timeOff.some((e) => e.type === "Call Out" && nameKey(e.name) === key && covers(e, today))) {
      alert(`${name} is already logged as a call-out today.`);
      return;
    }
    setTimeOff((entries) => [
      ...entries,
      { id: crypto.randomUUID(), name, type: "Call Out", start: today, end: today, note: callOut.note.trim() },
    ]);
    setCallOut({ name: "", note: "" });
  }

  function update(id: string, patch: Partial<TimeOffEntry>) {
    setTimeOff((entries) =>
      entries.map((e) => {
        if (e.id !== id) return e;
        const next = { ...e, ...patch };
        if (next.end < next.start) next.end = next.start;
        return next;
      }),
    );
  }

  function remove(entry: TimeOffEntry) {
    if (!confirm(`Delete ${entry.name}'s ${entry.type} (${entry.start}${entry.end !== entry.start ? ` to ${entry.end}` : ""})?`)) return;
    setTimeOff((entries) => entries.filter((e) => e.id !== entry.id));
  }

  // ---- Coverage calendar ----
  const days = Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(windowStart, i));
  const windowEnd = days[days.length - 1];
  const inWindow = timeOff.filter((e) => e.name.trim() && overlaps(e, windowStart, windowEnd));
  const people = new Map<string, { name: string; entries: TimeOffEntry[] }>();
  for (const e of inWindow) {
    const key = nameKey(e.name);
    const row = people.get(key) ?? { name: e.name, entries: [] };
    row.entries.push(e);
    people.set(key, row);
  }
  const rows = [...people.values()].sort((a, b) => a.name.localeCompare(b.name));
  const outToday = entriesOn(timeOff, today);
  const callOutsToday = outToday.filter((e) => e.type === "Call Out");

  // ---- List ----
  const listed = timeOff
    .filter((e) => (filter === "all" ? true : filter === "past" ? (e.end || e.start) < today : (e.end || e.start) >= today))
    .sort((a, b) => (filter === "past" ? b.start.localeCompare(a.start) : a.start.localeCompare(b.start)) || a.name.localeCompare(b.name));

  return (
    <div>
      <datalist id="time-off-names">
        {rosterNames.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      <div className="panel call-out-panel">
        <h2>📞 Log a call-out</h2>
        <p className="panel-hint">Someone called in and won't be at work today — marks them out on today's board right away.</p>
        <div className="time-off-form">
          <label className="time-off-field time-off-name">
            Employee
            <input
              list="time-off-names"
              placeholder="Pick or type a name"
              value={callOut.name}
              onChange={(e) => setCallOut((c) => ({ ...c, name: e.target.value }))}
            />
          </label>
          <label className="time-off-field time-off-note">
            Note (optional)
            <input
              placeholder="e.g. called at 5:40, car trouble"
              value={callOut.note}
              onChange={(e) => setCallOut((c) => ({ ...c, note: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && logCallOut()}
            />
          </label>
          <button className="btn call-out-btn" onClick={logCallOut}>
            📞 Log call-out
          </button>
        </div>
        {callOutsToday.length > 0 && (
          <div className="call-out-today">
            <strong>Called out today ({callOutsToday.length}):</strong>
            {callOutsToday.map((e) => (
              <span key={e.id} className="time-off-chip to-callout" title={describeEntry(e)}>
                {e.name}
                {e.note ? ` – ${e.note}` : ""}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Add time off</h2>
        <p className="panel-hint">
          Anyone with time off covering a day's date shows as out on that day's Line Assignments board — greyed in the
          sidebar, grouped under "Out today" in the pickers, and skipped by Auto-fill.
        </p>
        <div className="time-off-form">
          <label className="time-off-field time-off-name">
            Employee
            <input
              list="time-off-names"
              placeholder="Pick or type a name"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
          </label>
          <label className="time-off-field">
            Type
            <select value={draft.type} onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value as TimeOffType }))}>
              {TIME_OFF_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="time-off-field">
            From
            <input
              type="date"
              value={draft.start}
              onChange={(e) =>
                setDraft((d) => ({ ...d, start: e.target.value, end: d.end < e.target.value ? e.target.value : d.end }))
              }
            />
          </label>
          <label className="time-off-field">
            To
            <input type="date" value={draft.end} min={draft.start} onChange={(e) => setDraft((d) => ({ ...d, end: e.target.value }))} />
          </label>
          <label className="time-off-field time-off-note">
            Note (optional)
            <input
              placeholder="e.g. Vacation, doctor"
              value={draft.note}
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && addEntry()}
            />
          </label>
          <button className="btn primary" onClick={addEntry}>
            + Add
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="time-off-cal-head">
          <h2>Coverage</h2>
          <span className="count-badge">{outToday.length}</span>
          <span className="panel-hint time-off-today">out today</span>
          <span style={{ flex: 1 }} />
          <button className="btn small" onClick={() => setWindowStart((s) => addDays(s, -WINDOW_DAYS))}>
            ◀ Earlier
          </button>
          <button className="btn small" onClick={() => setWindowStart(today)} disabled={windowStart === today}>
            Today
          </button>
          <button className="btn small" onClick={() => setWindowStart((s) => addDays(s, WINDOW_DAYS))}>
            Later ▶
          </button>
        </div>
        <div className="time-off-legend">
          {TIME_OFF_TYPES.map((t) => (
            <span key={t} className={`time-off-chip ${TYPE_CLASS[t]}`}>
              {t}
            </span>
          ))}
        </div>
        <div className="schedule-table-wrap">
          <table className="time-off-cal">
            <thead>
              <tr>
                <th className="time-off-cal-name">
                  {windowStart} – {windowEnd}
                </th>
                {days.map((iso) => {
                  const label = dayLabel(iso);
                  return (
                    <th key={iso} className={`${label.weekend ? "time-off-weekend" : ""} ${iso === today ? "time-off-is-today" : ""}`}>
                      <div>{label.weekday}</div>
                      <div>{label.date}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.name}>
                  <td className="time-off-cal-name">{row.name}</td>
                  {days.map((iso) => {
                    const entry = row.entries.find((e) => covers(e, iso));
                    const label = dayLabel(iso);
                    return (
                      <td key={iso} className={`${label.weekend ? "time-off-weekend" : ""} ${iso === today ? "time-off-is-today" : ""}`}>
                        {entry && (
                          <span className={`time-off-chip ${TYPE_CLASS[entry.type]}`} title={`${row.name}: ${describeEntry(entry)}`}>
                            {SHORT_LABEL[entry.type] ?? entry.type}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={WINDOW_DAYS + 1} className="time-off-empty">
                    No one has time off in these two weeks.
                  </td>
                </tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr>
                  <td className="time-off-cal-name">Out</td>
                  {days.map((iso) => {
                    const n = entriesOn(timeOff, iso).length;
                    return (
                      <td key={iso} className={`time-off-total ${n ? "" : "time-off-zero"}`}>
                        {n}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="time-off-cal-head">
          <h2>All time off</h2>
          <span style={{ flex: 1 }} />
          <select className="time-off-filter" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
            <option value="upcoming">Current &amp; upcoming</option>
            <option value="past">Past</option>
            <option value="all">All</option>
          </select>
        </div>
        <div className="schedule-table-wrap">
          <table className="roster time-off-list">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Type</th>
                <th>From</th>
                <th>To</th>
                <th>Days</th>
                <th>Note</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {listed.map((e) => (
                <tr key={e.id} className={covers(e, today) ? "time-off-row-today" : ""}>
                  <td>
                    <input list="time-off-names" value={e.name} onChange={(ev) => update(e.id, { name: ev.target.value })} />
                  </td>
                  <td>
                    <select value={e.type} onChange={(ev) => update(e.id, { type: ev.target.value as TimeOffType })}>
                      {TIME_OFF_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input type="date" value={e.start} onChange={(ev) => ev.target.value && update(e.id, { start: ev.target.value })} />
                  </td>
                  <td>
                    <input
                      type="date"
                      value={e.end}
                      min={e.start}
                      onChange={(ev) => ev.target.value && update(e.id, { end: ev.target.value })}
                    />
                  </td>
                  <td className="time-off-days">{dayCount(e)}</td>
                  <td>
                    <input value={e.note} onChange={(ev) => update(e.id, { note: ev.target.value })} />
                  </td>
                  <td>
                    <button className="btn small danger" onClick={() => remove(e)} title="Delete">
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              {listed.length === 0 && (
                <tr>
                  <td colSpan={7} className="time-off-empty">
                    {filter === "past" ? "No past time off." : "No time off scheduled yet — add some above."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
