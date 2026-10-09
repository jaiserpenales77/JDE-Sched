import { useRef, useState } from "react";
import type { ChangeoverClock, SchedulePrintSettings, WorkOrder } from "../types";
import {
  groupByLine,
  percentActual,
  bottlesRemaining,
  changeoverInto,
  rowHighlightClass,
  lineStatusClass,
  lineStatusLabel,
  newBlankWorkOrder,
  orderedScheduleColumns,
  SCHEDULE_COLUMN_LABELS,
  SHIFT_HOURS,
  formatClock,
  parseClock,
} from "../scheduleLogic";
import ProgressBar from "./ProgressBar";
import { PrintSchedule } from "./PrintViews";
import SchedulePrintDesign from "./SchedulePrintDesign";

interface Props {
  workOrders: WorkOrder[];
  setWorkOrders: (updater: (wos: WorkOrder[]) => WorkOrder[]) => void;
  scheduledLines: string[];
  setScheduledLines: (updater: (lines: string[]) => string[]) => void;
  columnWidths: Record<string, number>;
  setColumnWidths: (updater: (widths: Record<string, number>) => Record<string, number>) => void;
  hiddenColumns: string[];
  setHiddenColumns: (updater: (cols: string[]) => string[]) => void;
  columnOrder: string[];
  setColumnOrder: (order: string[]) => void;
  design: SchedulePrintSettings;
  setDesign: (updater: (s: SchedulePrintSettings) => SchedulePrintSettings) => void;
  // Estimated changeover time by line, and the shift clock it counts from.
  changeoverTimes: Record<string, string>;
  changeoverClock: ChangeoverClock;
  setChangeoverClock: (clock: ChangeoverClock) => void;
}

const COLUMNS: { key: keyof WorkOrder; label: string; width?: string; numeric?: boolean }[] = [
  { key: "wo", label: "WO #" },
  { key: "seq", label: "Seq" },
  { key: "item", label: "Item" },
  { key: "description", label: "Product Description" },
  { key: "count", label: "Count" },
  { key: "bulkItem", label: "Bulk Item" },
  { key: "bottleSize", label: "Bottle Size" },
  { key: "capDescription", label: "Cap Description" },
  { key: "allergen", label: "Allergen" },
  { key: "remarks", label: "Remarks" },
  { key: "woQuantity", label: "WO Qty", numeric: true },
  { key: "percentComplete", label: "% Complete", numeric: true },
  { key: "desiccant", label: "Desiccant" },
];

function fmtChg(code: string) {
  return code === "" ? "—" : code;
}

// Seq box that only applies the new number when you leave it (or press
// Enter) - rows are listed in Seq order, so applying every keystroke would
// make the row jump around while you type.
function SeqInput({ value, onCommit }: { value: string; onCommit: (seq: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  // Escape blurs to cancel - the blur runs before the cleared draft renders.
  const cancelled = useRef(false);
  return (
    <input
      type="text"
      value={draft ?? value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (!cancelled.current && draft !== null && draft !== value) onCommit(draft);
        cancelled.current = false;
        setDraft(null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
    />
  );
}

// Whether the Print Report Preview is open - remembered per device, open
// by default.
const SHOW_PREVIEW_KEY = "jde-sched-show-schedule-preview";

function loadShowPreview(): boolean {
  try {
    return localStorage.getItem(SHOW_PREVIEW_KEY) !== "0";
  } catch {
    return true;
  }
}

type LineStatus = "Ready" | "PM" | "OT";
const LINE_STATUSES: LineStatus[] = ["Ready", "PM", "OT"];

// READY / PM / OT buttons for a whole production line - click one to
// mark the line, click it again to clear it.
function LineStatusToggle({
  line,
  status,
  onChange,
  onDark = false,
}: {
  line: string;
  status: LineStatus | "";
  onChange: (status: LineStatus | "") => void;
  onDark?: boolean;
}) {
  return (
    <span className={`status-toggle ${onDark ? "status-toggle-dark" : ""}`} role="group" aria-label={`${line} status`}>
      {LINE_STATUSES.map((s) => (
        <button
          key={s}
          type="button"
          className={`status-toggle-btn status-${s.toLowerCase()} ${status === s ? "active" : ""}`}
          aria-pressed={status === s}
          title={status === s ? `Clear ${s.toUpperCase()} from ${line}` : `Mark ${line} as ${s.toUpperCase()}`}
          onClick={() => onChange(status === s ? "" : s)}
        >
          {s.toUpperCase()}
        </button>
      ))}
    </span>
  );
}

// When the shift starts and which of its hours have breaks and lunch - what
// the estimated changeover times count from.
function ChangeoverClockSettings({
  clock,
  setClock,
}: {
  clock: ChangeoverClock;
  setClock: (clock: ChangeoverClock) => void;
}) {
  const start = parseClock(clock.start);
  const hours = Array.from({ length: SHIFT_HOURS }, (_, i) => i + 1);
  const setBreak = (i: number, hour: number) => {
    const next = [clock.breakHours[0] ?? 0, clock.breakHours[1] ?? 0];
    next[i] = hour;
    setClock({ ...clock, breakHours: next.filter(Boolean) });
  };
  const hourSelect = (id: string, label: string, value: number, onChange: (hour: number) => void) => (
    <label className="estimate-field" htmlFor={id}>
      {label}
      <select id={id} value={value} onChange={(e) => onChange(Number(e.target.value))}>
        <option value={0}>None</option>
        {hours.map((h) => (
          <option key={h} value={h}>
            Hour {h} ({formatClock(start + (h - 1) * 60)})
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="panel estimate-settings">
      <h2>Estimated changeover</h2>
      <p className="panel-hint">
        Shown in the Changeover column of each line's running work order: when its bottles remaining will be done, at
        the line's rate for that FG item from the Packaging Lead Hub's Line Rates. It counts from the shift's start and
        uses the Break and Lunch rates in those hours. Lines that run through breaks and lunch (no Break or Lunch rate
        in the Hub) use the Full Hour rate all shift.
      </p>
      <div className="estimate-fields">
        <label className="estimate-field" htmlFor="co-start">
          Shift starts
          <input
            id="co-start"
            type="time"
            value={clock.start}
            onChange={(e) => e.target.value && setClock({ ...clock, start: e.target.value })}
          />
        </label>
        {hourSelect("co-break-1", "Break", clock.breakHours[0] ?? 0, (h) => setBreak(0, h))}
        {hourSelect("co-break-2", "Second break", clock.breakHours[1] ?? 0, (h) => setBreak(1, h))}
        {hourSelect("co-lunch", "Lunch", clock.lunchHour, (h) => setClock({ ...clock, lunchHour: h }))}
      </div>
    </div>
  );
}

export default function ProductionSchedule({
  workOrders,
  setWorkOrders,
  scheduledLines,
  setScheduledLines,
  columnWidths,
  setColumnWidths,
  hiddenColumns,
  setHiddenColumns,
  columnOrder,
  setColumnOrder,
  design,
  setDesign,
  changeoverTimes,
  changeoverClock,
  setChangeoverClock,
}: Props) {
  const [newLineName, setNewLineName] = useState("");
  const groups = groupByLine(workOrders);
  const [showPreview, setShowPreview] = useState(loadShowPreview);

  function togglePreview(show: boolean) {
    setShowPreview(show);
    try {
      localStorage.setItem(SHOW_PREVIEW_KEY, show ? "1" : "0");
    } catch {
      // Not remembered on this device - the toggle still works.
    }
  }

  function toggleHiddenColumn(key: string, hidden: boolean) {
    setHiddenColumns((cols) => (hidden ? [...cols, key] : cols.filter((c) => c !== key)));
  }

  function toggleScheduledLine(line: string, checked: boolean) {
    setScheduledLines((lines) => (checked ? [...lines, line] : lines.filter((l) => l !== line)));
  }

  // Marks every work order on the line - the printout tags the whole line.
  function setLineStatus(line: string, status: LineStatus | "") {
    setWorkOrders((wos) => wos.map((w) => (w.line.trim() === line ? { ...w, lineStatus: status } : w)));
  }

  function updateRow(id: string, field: keyof WorkOrder, value: string | number) {
    setWorkOrders((wos) => wos.map((w) => (w.id === id ? { ...w, [field]: value } : w)));
  }

  function insertAfter(id: string) {
    setWorkOrders((wos) => {
      const idx = wos.findIndex((w) => w.id === id);
      if (idx === -1) return wos;
      const blank = newBlankWorkOrder(wos[idx].line);
      const next = [...wos];
      next.splice(idx + 1, 0, blank);
      return next;
    });
  }

  // A new work order goes at the bottom of its line: saved right after the
  // line's last row (in Seq order), which is where a row with no Seq shows.
  function addToEnd(line: string, lastId: string | undefined) {
    setWorkOrders((wos) => {
      const idx = lastId ? wos.findIndex((w) => w.id === lastId) : -1;
      if (idx === -1) return [...wos, newBlankWorkOrder(line)];
      const next = [...wos];
      next.splice(idx + 1, 0, newBlankWorkOrder(line));
      return next;
    });
  }

  function deleteRow(id: string) {
    setWorkOrders((wos) => wos.filter((w) => w.id !== id));
  }

  function deleteLine(line: string) {
    if (!confirm(`Remove line "${line}" and all its work orders?`)) return;
    setWorkOrders((wos) => wos.filter((w) => w.line.trim() !== line));
    setScheduledLines((lines) => lines.filter((l) => l !== line));
  }

  function renameLine(oldLine: string, newLine: string) {
    setWorkOrders((wos) => wos.map((w) => (w.line.trim() === oldLine ? { ...w, line: newLine } : w)));
    setScheduledLines((lines) => lines.map((l) => (l === oldLine ? newLine : l)));
  }

  function addNewLine() {
    const name = newLineName.trim();
    if (!name) return;
    setWorkOrders((wos) => [...wos, newBlankWorkOrder(name)]);
    setNewLineName("");
  }

  function clearAll() {
    if (!confirm("This will permanently clear all work order data. Continue?")) return;
    setWorkOrders(() => []);
  }

  return (
    <div>
      <div className="legend">
        <span className="swatch" style={{ background: "#f8cbad" }} /> Allergen (not "N") &nbsp;
        <span className="swatch" style={{ background: "#fff2cc" }} /> Oily product &nbsp;
        <span className="swatch" style={{ background: "#bdd7ee" }} /> Bulk item A662 / A624 &nbsp;
        <span className="swatch" style={{ background: "#14532d" }} /> Line has a "Ready" WO &nbsp;
        <span className="swatch" style={{ background: "#1e3a8a" }} /> Line has a "PM" WO &nbsp;
        <span className="swatch" style={{ background: "#facc15" }} /> Line marked "OT"
        <br />
        Changeover: <span className="chg-S1">S1</span> = same setup ·{" "}
        <span className="chg-S1-Count-Change">S1 Count Change</span> = count differs ·{" "}
        <span className="chg-S3">S3</span> = bulk item differs · <span className="chg-S4">S4</span> = bottle size
        differs. Each code is shown on the work order the changeover happens on. % Actual Complete, Bottles Remaining
        and Changeover are calculated automatically.
      </div>

      {groups.length > 0 && (
        <div className="panel">
          <h2>Scheduled Lines</h2>
          <p className="panel-hint">
            Tick a line to box it in green on the print report. Click READY, PM or OT to tag the line on the
            printout — click it again to clear it.
          </p>
          <div className="scheduled-lines-grid">
            {groups.map((group) => {
              const status = lineStatusLabel(group.rows);
              return (
                <div className={`scheduled-line-item ${status ? `has-${status.toLowerCase()}` : ""}`} key={group.line}>
                  <label className="scheduled-line-checkbox">
                    <input
                      type="checkbox"
                      checked={scheduledLines.includes(group.line)}
                      onChange={(e) => toggleScheduledLine(group.line, e.target.checked)}
                    />
                    {group.line}
                  </label>
                  <LineStatusToggle
                    line={group.line}
                    status={status}
                    onChange={(s) => setLineStatus(group.line, s)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="panel">
        <button
          className="print-design-toggle"
          aria-expanded={showPreview}
          onClick={() => togglePreview(!showPreview)}
        >
          <h2 style={{ margin: 0 }}>🖨 Print Report Preview</h2>
          <span>{showPreview ? "▲ Hide" : "▼ Show"}</span>
        </button>
        {showPreview && (
          <div className="print-preview-body">
            <p className="panel-hint">
              Live preview of the printed Production Schedule. Drag a column's name to move it. To resize, drag
              the faint line on a column's edge (anywhere down the table) — double-click it to fit the column, or use
              Fit all columns. Tick a column below to hide it. All of these apply to the printout too.
            </p>
            <div className="hide-columns-grid">
              {orderedScheduleColumns(columnOrder).map((key) => (
                <label className="hide-column-checkbox" key={key}>
                  <input
                    type="checkbox"
                    checked={hiddenColumns.includes(key)}
                    onChange={(e) => toggleHiddenColumn(key, e.target.checked)}
                  />
                  {SCHEDULE_COLUMN_LABELS[key]}
                </label>
              ))}
              {columnOrder.length > 0 && (
                <button className="btn small" onClick={() => setColumnOrder([])}>
                  Reset column order
                </button>
              )}
            </div>
            <div className="print-preview-wrap">
              <PrintSchedule
                workOrders={workOrders}
                scheduledLines={scheduledLines}
                columnWidths={columnWidths}
                setColumnWidths={setColumnWidths}
                hiddenColumns={hiddenColumns}
                columnOrder={columnOrder}
                setColumnOrder={setColumnOrder}
                design={design}
                changeoverTimes={changeoverTimes}
              />
            </div>
          </div>
        )}
      </div>

      {groups.length > 0 && <ChangeoverClockSettings clock={changeoverClock} setClock={setChangeoverClock} />}

      <SchedulePrintDesign settings={design} setSettings={setDesign} />

      {groups.length === 0 && (
        <div className="empty-state panel">No work orders yet. Add a production line below to get started.</div>
      )}

      {groups.map((group) => {
        const statusCls = lineStatusClass(group.rows);
        return (
          <div className="line-group" key={group.line}>
            <div className={`line-group-header ${statusCls}`}>
              <input
                className="line-name-input"
                value={group.line}
                onChange={(e) => renameLine(group.line, e.target.value)}
              />
              <LineStatusToggle
                line={group.line}
                status={lineStatusLabel(group.rows)}
                onChange={(s) => setLineStatus(group.line, s)}
                onDark
              />
              <span style={{ flex: 1 }} />
              <button className="btn small danger" onClick={() => deleteLine(group.line)}>
                Remove line
              </button>
            </div>
            <div className="schedule-table-wrap">
              <table className="schedule">
                <thead>
                  <tr>
                    {COLUMNS.map((c) => (
                      <th key={c.key}>{c.label}</th>
                    ))}
                    <th>Line Status</th>
                    <th>% Actual</th>
                    <th>Bottles Rem.</th>
                    <th>Changeover</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((row, idx) => {
                    const chg = changeoverInto(group.rows, idx);
                    const hl = rowHighlightClass(row);
                    // On an "S1 Count Change" the count that changed is this
                    // row's own Count cell.
                    const countChanged = chg === "S1 Count Change";
                    return (
                      <tr key={row.id} className={hl}>
                        {COLUMNS.map((c) => (
                          <td key={c.key}>
                            {c.key === "seq" ? (
                              <SeqInput value={row.seq} onCommit={(seq) => updateRow(row.id, "seq", seq)} />
                            ) : (
                              <input
                                className={`${c.numeric ? "num" : ""} ${c.key === "count" && countChanged ? "count-changed" : ""}`}
                                type={c.numeric ? "number" : "text"}
                                value={row[c.key] as string | number}
                                onChange={(e) =>
                                  updateRow(
                                    row.id,
                                    c.key,
                                    c.numeric ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value,
                                  )
                                }
                              />
                            )}
                          </td>
                        ))}
                        <td>
                          <select
                            value={row.lineStatus}
                            onChange={(e) => updateRow(row.id, "lineStatus", e.target.value)}
                          >
                            <option value="">—</option>
                            <option value="Ready">Ready</option>
                            <option value="PM">PM</option>
                            <option value="OT">OT</option>
                          </select>
                        </td>
                        <td className="computed">
                          <ProgressBar value={percentActual(row)} />
                        </td>
                        <td className="computed">{bottlesRemaining(row)}</td>
                        <td className={`changeover chg-${chg.replace(/ /g, "-")}`}>
                          {!chg && idx === 0 && changeoverTimes[group.line] ? (
                            <span className="co-estimate" title="Estimated changeover">
                              Est. {changeoverTimes[group.line]}
                            </span>
                          ) : (
                            fmtChg(chg)
                          )}
                        </td>
                        <td className="row-actions">
                          <button className="btn small" title="Insert row below" onClick={() => insertAfter(row.id)}>
                            + Row
                          </button>
                          <button className="btn small danger" title="Delete row" onClick={() => deleteRow(row.id)}>
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="line-group-footer">
              <button
                className="btn small"
                onClick={() => addToEnd(group.line, group.rows[group.rows.length - 1]?.id)}
              >
                + Add work order to {group.line}
              </button>
            </div>
          </div>
        );
      })}

      <div className="panel">
        <div className="new-line-bar">
          <input
            placeholder="New production line (e.g. VPKL02)"
            value={newLineName}
            onChange={(e) => setNewLineName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addNewLine()}
          />
          <button className="btn primary" onClick={addNewLine}>
            + Add line
          </button>
          <span style={{ flex: 1 }} />
          <button className="btn danger" onClick={clearAll}>
            🗑 Clear All Work Order Data
          </button>
        </div>
      </div>

    </div>
  );
}
