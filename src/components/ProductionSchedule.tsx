import { useState } from "react";
import type { WorkOrder } from "../types";
import {
  groupByLine,
  percentActual,
  bottlesRemaining,
  changeoverCode,
  rowHighlightClass,
  lineStatusClass,
  newBlankWorkOrder,
} from "../scheduleLogic";

interface Props {
  workOrders: WorkOrder[];
  setWorkOrders: (updater: (wos: WorkOrder[]) => WorkOrder[]) => void;
  scheduledLines: string[];
  setScheduledLines: (updater: (lines: string[]) => string[]) => void;
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

export default function ProductionSchedule({ workOrders, setWorkOrders, scheduledLines, setScheduledLines }: Props) {
  const [newLineName, setNewLineName] = useState("");
  const groups = groupByLine(workOrders);

  function toggleScheduledLine(line: string, checked: boolean) {
    setScheduledLines((lines) => (checked ? [...lines, line] : lines.filter((l) => l !== line)));
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
        <span className="swatch" style={{ background: "#4c1d95" }} /> Line has a "Trial" WO
        <br />
        Changeover: <span className="chg-S1">S1</span> = same setup ·{" "}
        <span className="chg-S1-Count-Change">S1 Count Change</span> = count differs ·{" "}
        <span className="chg-S3">S3</span> = bulk item differs · <span className="chg-S4">S4</span> = bottle size
        differs. % Actual Complete, Bottles Remaining and Changeover are calculated automatically.
      </div>

      {groups.length > 0 && (
        <div className="panel">
          <h2>Scheduled Lines</h2>
          <p className="panel-hint">
            Check a line to highlight its whole block with a green border on the print report.
          </p>
          <div className="scheduled-lines-grid">
            {groups.map((group) => (
              <label className="scheduled-line-checkbox" key={group.line}>
                <input
                  type="checkbox"
                  checked={scheduledLines.includes(group.line)}
                  onChange={(e) => toggleScheduledLine(group.line, e.target.checked)}
                />
                {group.line}
              </label>
            ))}
          </div>
        </div>
      )}

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
              {statusCls === "line-ready" && <span className="line-status-chip">READY</span>}
              {statusCls === "line-pm" && <span className="line-status-chip">PM</span>}
              {statusCls === "line-trial" && <span className="line-status-chip">TRIAL</span>}
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
                    const next = group.rows[idx + 1];
                    const chg = changeoverCode(row, next);
                    const hl = rowHighlightClass(row);
                    return (
                      <tr key={row.id} className={hl}>
                        {COLUMNS.map((c) => (
                          <td key={c.key}>
                            <input
                              className={c.numeric ? "num" : ""}
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
                            <option value="Trial">Trial</option>
                          </select>
                        </td>
                        <td className="computed">
                          {percentActual(row) === "" ? "" : `${(Number(percentActual(row)) * 100).toFixed(1)}%`}
                        </td>
                        <td className="computed">{bottlesRemaining(row)}</td>
                        <td className={`changeover chg-${chg.replace(/ /g, "-")}`}>{fmtChg(chg)}</td>
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
                onClick={() => setWorkOrders((wos) => [...wos, newBlankWorkOrder(group.line)])}
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
