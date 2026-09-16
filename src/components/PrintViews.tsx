import type { DailyBoard, WorkOrder } from "../types";
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

export function PrintAssignments({ board }: { board: DailyBoard | undefined }) {
  if (!board) {
    return (
      <div className="print-assignments">
        <p>No shift board selected.</p>
      </div>
    );
  }
  return (
    <div className="print-assignments">
      <div className="print-board-header">
        <h1>
          {board.shiftLabel} | Line Assignments
        </h1>
        <div className="print-board-meta">
          <span>{board.date}</span>
          <span>Dept. Leader: {board.deptLeader || "—"}</span>
        </div>
        <div className="print-board-banner">
          REPORT ANY SAFETY, QUALITY AND MAJOR PRODUCTION DOWNTIME ISSUES IMMEDIATELY
        </div>
      </div>

      <div className="print-slots-grid">
        {board.lineSlots.map((slot) => (
          <div className={`print-slot ${slot.status === "Scheduled" ? "print-slot-scheduled" : ""}`} key={slot.id}>
            <div className="print-slot-name">{slot.line}</div>
            <div className="print-slot-status">{slot.status || "—"}</div>
            {slot.subNote && <div className="print-slot-note">{slot.subNote}</div>}
            {slot.assigned && <div className="print-slot-assigned">{slot.assigned}</div>}
          </div>
        ))}
      </div>

      <div className="print-sections-grid">
        {board.listSections.map((section) => (
          <div className="print-section" key={section.id}>
            <div className="print-section-title">{section.title}</div>
            <ul>
              {section.items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
