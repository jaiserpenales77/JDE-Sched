import type { CSSProperties } from "react";
import type { DailyBoard, Employee, LineSlot, ListSection, PrintAssignSettings, WorkOrder } from "../types";
import {
  groupByLine,
  percentActual,
  bottlesRemaining,
  changeoverCode,
  isAllergenRow,
  isOilRow,
  isBulkHighlightRow,
} from "../scheduleLogic";
import { buildFirstNameRoleMap, lineBoxKey, resolveBoxLayout, roomBoxKey } from "../printLayout";

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

// The original sheet hand-highlighted Line Leaders (dark green) and
// MLL/MLT crew (navy) by name within the assigned-names lists.
function nameRoleClass(name: string, roleMap: Map<string, string>, enabled: boolean): string {
  if (!enabled) return "";
  const first = name.trim().split(/\s+/)[0]?.toLowerCase();
  const role = first ? roleMap.get(first) : undefined;
  if (!role) return "";
  if (/line leader/i.test(role)) return "print-assign-role-leader";
  if (/\bMLL\b|\bMLT\b/i.test(role)) return "print-assign-role-mlx";
  return "";
}

export function LineBoxContent({
  slot,
  roleMap,
  settings,
}: {
  slot: LineSlot;
  roleMap: Map<string, string>;
  settings: PrintAssignSettings;
}) {
  const names = slot.assigned
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
  const key = statusKey(slot.status);
  return (
    <>
      <div className={`print-assign-name print-assign-${key}`}>{slot.line}</div>
      <div className={`print-assign-status print-assign-${key}`}>{slot.status || "—"}</div>
      <div className={`print-assign-note print-assign-${key}`}>{slot.subNote}</div>
      <div className="print-assign-names">
        {names.map((name, i) => (
          <div className={`print-assign-name-row ${nameRoleClass(name, roleMap, settings.highlightRoles)}`} key={i}>
            {name}
          </div>
        ))}
      </div>
    </>
  );
}

export function RoomBoxContent({
  section,
  roleMap,
  settings,
}: {
  section: ListSection;
  roleMap: Map<string, string>;
  settings: PrintAssignSettings;
}) {
  return (
    <>
      <div className="print-assign-room-header">{section.title}</div>
      <div className="print-assign-names">
        {section.items.map((item, i) => (
          <div className={`print-assign-name-row ${nameRoleClass(item, roleMap, settings.highlightRoles)}`} key={i}>
            {item}
          </div>
        ))}
      </div>
    </>
  );
}

interface PrintAssignmentsProps {
  board: DailyBoard | undefined;
  employees: Employee[];
  settings: PrintAssignSettings;
}

export function PrintAssignments({ board, employees, settings }: PrintAssignmentsProps) {
  if (!board) {
    return (
      <div className="print-assignments">
        <p>No shift board selected.</p>
      </div>
    );
  }

  const roleMap = buildFirstNameRoleMap(employees);
  const roomSections = settings.includeRoomSections ? board.roomSections : [];

  const cssVars = {
    "--print-title-color": settings.titleColor,
    "--print-banner-color": settings.bannerColor,
    "--print-banner-text-color": settings.bannerTextColor,
    "--print-scheduled-color": settings.scheduledColor,
    "--print-not-scheduled-color": settings.notScheduledColor,
    "--print-pm-color": settings.pmColor,
    "--print-leader-color": settings.leaderColor,
    "--print-crew-color": settings.crewColor,
  } as CSSProperties;

  return (
    <div className="print-assignments" style={cssVars}>
      <div className="print-assign-title">{board.shiftLabel} | Line Assignments</div>
      {settings.showBanner && (
        <div className="print-assign-banner">
          <span className="print-assign-banner-date">{board.date}</span>
          <span className="print-assign-banner-safety">{settings.bannerText}</span>
          <span className="print-assign-banner-leader">Dept. Leader: {board.deptLeader || "—"}</span>
        </div>
      )}
      {!settings.showBanner && (
        <div className="print-assign-banner print-assign-banner-minimal">
          <span className="print-assign-banner-date">{board.date}</span>
          <span className="print-assign-banner-leader">Dept. Leader: {board.deptLeader || "—"}</span>
        </div>
      )}

      {settings.freeFormLayout ? (
        <div
          className="print-layout-canvas"
          style={{ aspectRatio: settings.orientation === "landscape" ? "11 / 8.5" : "8.5 / 11" }}
        >
          {board.lineSlots.map((slot, i) => {
            const rect = resolveBoxLayout(lineBoxKey(slot.line), i, settings.boxLayouts);
            return (
              <div
                className="print-assign-col print-assign-col-absolute"
                key={slot.id}
                style={{ left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.width}%`, height: `${rect.height}%` }}
              >
                <LineBoxContent slot={slot} roleMap={roleMap} settings={settings} />
              </div>
            );
          })}
          {roomSections.map((section, i) => {
            const rect = resolveBoxLayout(roomBoxKey(section.title), board.lineSlots.length + i, settings.boxLayouts);
            return (
              <div
                className="print-assign-col print-assign-col-absolute"
                key={section.id}
                style={{ left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.width}%`, height: `${rect.height}%` }}
              >
                <RoomBoxContent section={section} roleMap={roleMap} settings={settings} />
              </div>
            );
          })}
        </div>
      ) : (
        <>
          {chunk(board.lineSlots, SLOTS_PER_BAND).map((band, bandIdx) => (
            <div className="print-assign-band-row" key={bandIdx}>
              {band.map((slot) => (
                <div className="print-assign-col" key={slot.id}>
                  <LineBoxContent slot={slot} roleMap={roleMap} settings={settings} />
                </div>
              ))}
            </div>
          ))}

          {chunk(roomSections, SLOTS_PER_BAND).map((band, bandIdx) => (
            <div className="print-assign-band-row print-assign-room-row" key={bandIdx}>
              {band.map((section) => (
                <div className="print-assign-col" key={section.id}>
                  <RoomBoxContent section={section} roleMap={roleMap} settings={settings} />
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
