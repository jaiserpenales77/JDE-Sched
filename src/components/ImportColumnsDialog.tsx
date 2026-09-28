import { useEffect, useState } from "react";
import type { WorkOrder } from "../types";
import {
  IMPORT_FIELDS,
  buildWorkOrders,
  detectTable,
  guessMapping,
  learnFromMapping,
} from "../importColumns";
import type { ColumnMapping, ImportField, SheetGrid } from "../importColumns";

interface Props {
  fileName: string;
  sheets: SheetGrid[];
  learned: Record<string, string>;
  onCancel: () => void;
  onImport: (workOrders: WorkOrder[], learned: Record<string, string>) => void;
}

const PREVIEW_ROWS = 4;

function columnLetter(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function cell(value: unknown): string {
  return String(value ?? "").trim();
}

function tableShape(sheets: SheetGrid[], sheetIndex: number, headerRow: number) {
  const grid = sheets[sheetIndex]?.grid ?? [];
  const rows = grid.slice(headerRow + 1);
  const width = Math.max(grid[headerRow]?.length ?? 0, ...rows.slice(0, 50).map((r) => r?.length ?? 0));
  const headers = Array.from({ length: width }, (_, i) => grid[headerRow]?.[i] ?? "");
  return { grid, rows, headers };
}

export default function ImportColumnsDialog({ fileName, sheets, learned, onCancel, onImport }: Props) {
  const [start] = useState(() => detectTable(sheets, learned) ?? { sheetIndex: 0, headerRow: 0 });
  const [sheetIndex, setSheetIndex] = useState(start.sheetIndex);
  const [headerRow, setHeaderRow] = useState(start.headerRow);
  const { grid, rows, headers } = tableShape(sheets, sheetIndex, headerRow);
  const [mapping, setMapping] = useState<ColumnMapping>(() => guessMapping(headers, rows.slice(0, 30), learned));

  const workOrders = buildWorkOrders(grid, headerRow, mapping);
  const lineCount = new Set(workOrders.map((w) => w.line)).size;
  const missing = IMPORT_FIELDS.filter((f) => "required" in f && f.required && !mapping.includes(f.key));
  const [showColumns, setShowColumns] = useState(missing.length > 0);
  const matched = mapping.filter(Boolean).length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  function reread(nextSheet: number, nextHeaderRow: number) {
    const shape = tableShape(sheets, nextSheet, nextHeaderRow);
    setSheetIndex(nextSheet);
    setHeaderRow(nextHeaderRow);
    setMapping(guessMapping(shape.headers, shape.rows.slice(0, 30), learned));
  }

  function pick(col: number, field: ImportField | "") {
    // A field can only come from one column - taking it clears it elsewhere.
    setMapping((m) => m.map((f, i) => (i === col ? field : field && f === field ? "" : f)));
  }

  function doImport() {
    onImport(workOrders, learnFromMapping(headers, rows.slice(0, 30), mapping, learned));
  }

  const example = (col: number) => rows.map((r) => cell(r?.[col])).find(Boolean) ?? "";
  const ready = missing.length === 0 && workOrders.length > 0;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <h2 id="import-title">Import schedule — check before replacing</h2>
        <p className="import-file">
          File: <strong>{fileName}</strong>
          {sheets.length > 1 && (
            <>
              {" "}
              · sheet <strong>{sheets[sheetIndex]?.name}</strong>
            </>
          )}
        </p>

        {ready ? (
          <div className="import-status import-ok">
            ✓ Found <strong>{workOrders.length}</strong> work order{workOrders.length === 1 ? "" : "s"} on{" "}
            <strong>{lineCount}</strong> line{lineCount === 1 ? "" : "s"}. Check the first few rows below, then click the
            blue button.
          </div>
        ) : (
          <div className="import-status import-problem">
            {missing.length > 0 ? (
              <>
                ⚠ Can't tell which column is the <strong>{missing.map((f) => f.label).join(" and the ")}</strong>. In the
                list below, find that column in your file and set it to <strong>{missing[0].label}</strong>.
              </>
            ) : (
              <>⚠ No work orders found under the column titles. Check the Line column, or the row the titles are on.</>
            )}
          </div>
        )}

        {workOrders.length > 0 && (
          <div className="import-preview-wrap">
            <table className="import-preview">
              <thead>
                <tr>
                  <th>Line</th>
                  <th>WO #</th>
                  <th>Seq</th>
                  <th>Item</th>
                  <th>Product Description</th>
                  <th>Count</th>
                  <th>WO Qty</th>
                </tr>
              </thead>
              <tbody>
                {workOrders.slice(0, PREVIEW_ROWS).map((w) => (
                  <tr key={w.id}>
                    <td>{w.line}</td>
                    <td>{w.wo}</td>
                    <td>{w.seq}</td>
                    <td>{w.item}</td>
                    <td>{w.description}</td>
                    <td>{w.count}</td>
                    <td>{w.woQuantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {workOrders.length > PREVIEW_ROWS && (
              <p className="import-more">…and {workOrders.length - PREVIEW_ROWS} more</p>
            )}
          </div>
        )}

        <button className="import-columns-toggle" onClick={() => setShowColumns((s) => !s)}>
          {showColumns ? "▲" : "▼"} Columns: {matched} of {headers.length} used —{" "}
          {showColumns ? "hide" : "change which column goes where"}
        </button>

        {showColumns && (
          <div className="import-columns">
            <p className="panel-hint">
              Each row is a column from your file. Pick where it goes in the schedule, or “Don't import”. The app
              remembers your choices for next time.
            </p>
            <table className="import-map">
              <thead>
                <tr>
                  <th>Column in your file</th>
                  <th>Example</th>
                  <th>Goes into</th>
                </tr>
              </thead>
              <tbody>
                {headers.map((h, i) => (
                  <tr key={i} className={mapping[i] ? "" : "import-unused"}>
                    <td>
                      <span className="import-col-letter">{columnLetter(i)}</span>
                      {cell(h) || <em>(no title)</em>}
                    </td>
                    <td className="import-example">{example(i)}</td>
                    <td>
                      <select
                        value={mapping[i] ?? ""}
                        onChange={(e) => pick(i, e.target.value as ImportField | "")}
                        aria-label={`Where column ${columnLetter(i)} goes`}
                      >
                        <option value="">Don't import</option>
                        {IMPORT_FIELDS.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}
                            {"required" in f && f.required ? " (needed)" : ""}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="import-advanced">
              {sheets.length > 1 && (
                <label>
                  Sheet
                  <select value={sheetIndex} onChange={(e) => reread(Number(e.target.value), 0)}>
                    {sheets.map((s, i) => (
                      <option key={s.name} value={i}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Column titles are on row
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, grid.length)}
                  value={headerRow + 1}
                  onChange={(e) => {
                    const row = Math.min(Math.max(1, Number(e.target.value) || 1), Math.max(1, grid.length)) - 1;
                    reread(sheetIndex, row);
                  }}
                />
              </label>
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn primary" disabled={!ready} onClick={doImport}>
            Replace schedule with {workOrders.length} work order{workOrders.length === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </div>
  );
}
