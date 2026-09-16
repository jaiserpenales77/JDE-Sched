import type { DailyBoard, LineSlot, WorkOrder } from "../types";
import {
  groupByLine,
  percentActual,
  bottlesRemaining,
  changeoverCode,
  isAllergenRow,
  isOilRow,
  isBulkHighlightRow,
} from "../scheduleLogic";

// Print layouts that mirror the original workbook's printed pages as
// closely as HTML/CSS allows: same title, same column set and order as
// the "JDE Template (2)" sheet's print area (A1:P16 - Line Status and
// Desiccant were outside that print area, so they're left out here too),
// the same pastel conditional-formatting fills, and the same thick navy
// divider between production lines that "Add Line Dividers" used to draw.

function pct(n: number | ""): string {
  return n === "" ? "" : `${(Number(n) * 100).toFixed(1)}%`;
}

export function PrintSchedule({ workOrders }: { workOrders: WorkOrder[] }) {
  const groups = groupByLine(workOrders);
  const today = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="print-schedule">
      <table className="print-table">
        <thead>
          <tr>
            <th colSpan={16} className="print-title-row">
              PRODUCTION LINE SCHEDULE
              <span className="print-title-date">{today}</span>
            </th>
          </tr>
          <tr className="print-col-headers">
            <th>LINE</th>
            <th>WO</th>
            <th>SEQ</th>
            <th>ITEM</th>
            <th>PRODUCT DESCRIPTION</th>
            <th>Count</th>
            <th>Bulk Item</th>
            <th>Bottle Size</th>
            <th>CAP DESCRIPTION</th>
            <th>Allergen</th>
            <th>REMARKS</th>
            <th>WO Quantity</th>
            <th>% Complete</th>
            <th className="print-formula-col">% Actual Complete</th>
            <th className="print-formula-col">Bottles Remaining</th>
            <th className="print-formula-col">CHANGEOVER</th>
          </tr>
        </thead>
        <tbody>
          {groups.length === 0 && (
            <tr>
              <td colSpan={16} style={{ textAlign: "center", padding: 20 }}>
                No work orders scheduled.
              </td>
            </tr>
          )}
          {groups.map((group) =>
            group.rows.map((row, idx) => {
              const next = group.rows[idx + 1];
              const chg = changeoverCode(row, next);
              const isLastOfGroup = idx === group.rows.length - 1;
              let hl = "";
              if (isAllergenRow(row)) hl = "print-hl-allergen";
              else if (isOilRow(row)) hl = "print-hl-oil";
              else if (isBulkHighlightRow(row)) hl = "print-hl-bulk";
              const lineCls =
                row.lineStatus === "Ready"
                  ? "print-line-ready"
                  : row.lineStatus === "PM"
                    ? "print-line-pm"
                    : row.lineStatus === "Trial"
                      ? "print-line-trial"
                      : "";
              return (
                <tr key={row.id} className={`${hl} ${isLastOfGroup ? "print-divider" : ""}`}>
                  <td className={lineCls}>{row.line}</td>
                  <td>{row.wo}</td>
                  <td>{row.seq}</td>
                  <td>{row.item}</td>
                  <td className="print-left">{row.description}</td>
                  <td>{row.count}</td>
                  <td>{row.bulkItem}</td>
                  <td>{row.bottleSize}</td>
                  <td className="print-left">{row.capDescription}</td>
                  <td>{row.allergen}</td>
                  <td className="print-left">{row.remarks}</td>
                  <td className="print-num">{row.woQuantity}</td>
                  <td className="print-num">{row.percentComplete}</td>
                  <td className="print-num print-formula-col">{pct(percentActual(row))}</td>
                  <td className="print-num print-formula-col">{bottlesRemaining(row)}</td>
                  <td className="print-formula-col">{chg}</td>
                </tr>
              );
            }),
          )}
        </tbody>
      </table>

      <div className="print-legend">
        <strong>LEGEND</strong>
        <ul>
          <li>
            <span className="print-swatch" style={{ background: "#fff9db" }} /> % Actual Complete, Bottles Remaining
            and Changeover are system-calculated - do not overwrite.
          </li>
          <li>
            <span className="print-swatch" style={{ background: "#f8cbad" }} /> Allergen (column J) is anything
            other than N - verify before running.
          </li>
          <li>
            <span className="print-swatch" style={{ background: "#fff2cc" }} /> Product description contains "oil".
          </li>
          <li>
            <span className="print-swatch" style={{ background: "#bdd7ee" }} /> Bulk item A662 / A624, or the line
            has a work order marked PM.
          </li>
          <li>
            <span className="print-swatch" style={{ background: "#c6efce" }} /> Line has a work order marked Ready.
          </li>
          <li>
            <span className="print-swatch" style={{ background: "#d9d2e9" }} /> Line has a work order marked Trial.
          </li>
          <li>
            <span className="print-divider-swatch" /> Divider between production lines.
          </li>
        </ul>
      </div>
    </div>
  );
}

const SLOTS_PER_BAND = 6;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Matches the fill colors the original "3rd Shift | Line Assignments" sheet
// used for a line's header block, keyed off the same status text the sheet
// itself carried (Scheduled = navy/blue, Not Scheduled = gray, PM = blue-gray).
function statusKey(status: LineSlot["status"]): "scheduled" | "not-scheduled" | "pm" {
  if (status === "Scheduled") return "scheduled";
  if (status === "PM") return "pm";
  return "not-scheduled";
}

export function PrintAssignments({ board }: { board: DailyBoard | undefined }) {
  if (!board) {
    return (
      <div className="print-assignments">
        <p>No shift board selected.</p>
      </div>
    );
  }

  const bands = chunk(board.lineSlots, SLOTS_PER_BAND);

  return (
    <div className="print-assignments">
      <div className="print-assign-title">{board.shiftLabel} | Line Assignments</div>
      <div className="print-assign-banner">
        <span className="print-assign-banner-date">{board.date}</span>
        <span className="print-assign-banner-safety">
          REPORT ANY SAFETY, QUALITY AND MAJOR PRODUCTION DOWNTIME ISSUES IMMEDIATELY
        </span>
        <span className="print-assign-banner-leader">Dept. Leader: {board.deptLeader || "—"}</span>
      </div>

      {bands.map((band, bandIdx) => (
        <div className="print-assign-band-row" key={bandIdx}>
          {band.map((slot) => {
            const names = slot.assigned
              .split(",")
              .map((n) => n.trim())
              .filter(Boolean);
            const key = statusKey(slot.status);
            return (
              <div className="print-assign-col" key={slot.id}>
                <div className={`print-assign-name print-assign-${key}`}>{slot.line}</div>
                <div className={`print-assign-status print-assign-${key}`}>{slot.status || "—"}</div>
                <div className={`print-assign-note print-assign-${key}`}>{slot.subNote}</div>
                <div className="print-assign-names">
                  {names.map((name, i) => (
                    <div className="print-assign-name-row" key={i}>
                      {name}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
