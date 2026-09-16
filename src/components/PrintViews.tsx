import { Fragment, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type { CommentBox, DailyBoard, Employee, LineSlot, ListSection, PrintAssignSettings, WorkOrder } from "../types";
import {
  groupByLine,
  percentActual,
  bottlesRemaining,
  changeoverCode,
  isAllergenRow,
  isOilRow,
  isBulkHighlightRow,
} from "../scheduleLogic";
import { buildFirstNameRoleMap, commentBoxKey, lineBoxKey, resolveBoxLayout, roomBoxKey } from "../printLayout";
import ProgressBar from "./ProgressBar";

// Print layouts that mirror the original workbook's printed pages as
// closely as HTML/CSS allows: same title, same column set and order as
// the "JDE Template (2)" sheet's print area (A1:P16 - Line Status was
// outside that print area, so it's left out here too), plus a Desiccant
// column (also part of the original sheet, but outside its print area)
// alongside % Actual Complete, the same pastel conditional-formatting
// fills, and the same thick navy divider between production lines that
// "Add Line Dividers" used to draw.

// Print-table column keys, in on-screen order - drives both the
// resizable <colgroup> and which column a given resize handle borrows
// width from/gives width to (its immediate neighbor to the right).
const SCHEDULE_COLUMN_KEYS = [
  "line",
  "wo",
  "seq",
  "item",
  "description",
  "count",
  "bulkItem",
  "bottleSize",
  "capDescription",
  "allergen",
  "remarks",
  "woQuantity",
  "percentComplete",
  "desiccant",
  "percentActual",
  "bottlesRemaining",
  "changeover",
] as const;
type ScheduleColumnKey = (typeof SCHEDULE_COLUMN_KEYS)[number];

// Percentages of the table's width - don't need to add up to exactly
// 100 (the browser distributes fixed-layout columns proportionally
// either way), just to reflect each column's typical content width.
const DEFAULT_SCHEDULE_COLUMN_WIDTHS: Record<ScheduleColumnKey, number> = {
  line: 5,
  wo: 5,
  seq: 3,
  item: 5,
  description: 14,
  count: 3,
  bulkItem: 5,
  bottleSize: 4,
  capDescription: 10,
  allergen: 3,
  remarks: 14,
  woQuantity: 4,
  percentComplete: 4,
  desiccant: 4,
  percentActual: 5,
  bottlesRemaining: 4,
  changeover: 6,
};

const MIN_COLUMN_PCT = 2;

// A draggable divider on a header cell's right edge - hoisted to module
// scope (rather than defined inside PrintSchedule's render) so it keeps
// a stable component identity across renders.
function ColResizeHandle({
  show,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  show: boolean;
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: () => void;
}) {
  if (!show) return null;
  return (
    <span
      className="col-resize-handle"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  );
}

interface PrintScheduleProps {
  workOrders: WorkOrder[];
  scheduledLines?: string[];
  columnWidths?: Record<string, number>;
  // Omit to render a plain, non-interactive table (used for the actual
  // print output) - pass it to get draggable column resize handles (used
  // by the live preview).
  setColumnWidths?: (updater: (widths: Record<string, number>) => Record<string, number>) => void;
}

export function PrintSchedule({ workOrders, scheduledLines = [], columnWidths = {}, setColumnWidths }: PrintScheduleProps) {
  const groups = groupByLine(workOrders);
  const today = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  const tableRef = useRef<HTMLTableElement>(null);
  const [drag, setDrag] = useState<{
    key: ScheduleColumnKey;
    nextKey: ScheduleColumnKey;
    startX: number;
    startA: number;
    startB: number;
    tableWidthPx: number;
  } | null>(null);

  function widthOf(key: ScheduleColumnKey): number {
    return columnWidths[key] ?? DEFAULT_SCHEDULE_COLUMN_WIDTHS[key];
  }

  function beginResize(e: ReactPointerEvent, key: ScheduleColumnKey) {
    if (!setColumnWidths || !tableRef.current) return;
    const idx = SCHEDULE_COLUMN_KEYS.indexOf(key);
    const nextKey = SCHEDULE_COLUMN_KEYS[idx + 1];
    if (!nextKey) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setDrag({
      key,
      nextKey,
      startX: e.clientX,
      startA: widthOf(key),
      startB: widthOf(nextKey),
      tableWidthPx: tableRef.current.getBoundingClientRect().width,
    });
  }

  function onResizeMove(e: ReactPointerEvent) {
    if (!drag || !setColumnWidths) return;
    const deltaPct = ((e.clientX - drag.startX) / drag.tableWidthPx) * 100;
    const maxDelta = drag.startB - MIN_COLUMN_PCT;
    const minDelta = -(drag.startA - MIN_COLUMN_PCT);
    const clamped = Math.max(minDelta, Math.min(maxDelta, deltaPct));
    setColumnWidths((w) => ({ ...w, [drag.key]: drag.startA + clamped, [drag.nextKey]: drag.startB - clamped }));
  }

  function endResize() {
    setDrag(null);
  }

  function resizeHandleProps(columnKey: ScheduleColumnKey) {
    return {
      show: !!setColumnWidths && SCHEDULE_COLUMN_KEYS.indexOf(columnKey) < SCHEDULE_COLUMN_KEYS.length - 1,
      onPointerDown: (e: ReactPointerEvent) => beginResize(e, columnKey),
      onPointerMove: onResizeMove,
      onPointerUp: endResize,
    };
  }

  return (
    <div className="print-schedule">
      <table className="print-table" ref={tableRef}>
        <colgroup>
          {SCHEDULE_COLUMN_KEYS.map((key) => (
            <col key={key} style={{ width: `${widthOf(key)}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th colSpan={17} className="print-title-row">
              PRODUCTION LINE SCHEDULE
              <span className="print-title-date">{today}</span>
            </th>
          </tr>
          <tr className="print-col-headers">
            <th>
              LINE
              <ColResizeHandle {...resizeHandleProps("line")} />
            </th>
            <th>
              WO
              <ColResizeHandle {...resizeHandleProps("wo")} />
            </th>
            <th>
              SEQ
              <ColResizeHandle {...resizeHandleProps("seq")} />
            </th>
            <th>
              ITEM
              <ColResizeHandle {...resizeHandleProps("item")} />
            </th>
            <th>
              PRODUCT DESCRIPTION
              <ColResizeHandle {...resizeHandleProps("description")} />
            </th>
            <th>
              Count
              <ColResizeHandle {...resizeHandleProps("count")} />
            </th>
            <th>
              Bulk Item
              <ColResizeHandle {...resizeHandleProps("bulkItem")} />
            </th>
            <th>
              Bottle Size
              <ColResizeHandle {...resizeHandleProps("bottleSize")} />
            </th>
            <th>
              CAP DESCRIPTION
              <ColResizeHandle {...resizeHandleProps("capDescription")} />
            </th>
            <th>
              Allergen
              <ColResizeHandle {...resizeHandleProps("allergen")} />
            </th>
            <th>
              REMARKS
              <ColResizeHandle {...resizeHandleProps("remarks")} />
            </th>
            <th>
              WO Quantity
              <ColResizeHandle {...resizeHandleProps("woQuantity")} />
            </th>
            <th>
              % Complete
              <ColResizeHandle {...resizeHandleProps("percentComplete")} />
            </th>
            <th>
              Desiccant
              <ColResizeHandle {...resizeHandleProps("desiccant")} />
            </th>
            <th className="print-formula-col">
              % Actual Complete
              <ColResizeHandle {...resizeHandleProps("percentActual")} />
            </th>
            <th className="print-formula-col">
              Bottles Remaining
              <ColResizeHandle {...resizeHandleProps("bottlesRemaining")} />
            </th>
            <th className="print-formula-col">CHANGEOVER</th>
          </tr>
        </thead>
        <tbody>
          {groups.length === 0 && (
            <tr>
              <td colSpan={17} style={{ textAlign: "center", padding: 20 }}>
                No work orders scheduled.
              </td>
            </tr>
          )}
          {groups.map((group, groupIdx) => {
            const isScheduled = scheduledLines.includes(group.line);
            return (
            <Fragment key={group.line}>
              {group.rows.map((row, idx) => {
                const next = group.rows[idx + 1];
                const chg = changeoverCode(row, next);
                // An "S1 Count Change" is flagged on the PREVIOUS row (it
                // describes the changeover INTO this row) - so the count
                // that actually changed is this row's own Count cell.
                const countChanged = idx > 0 && changeoverCode(group.rows[idx - 1], row) === "S1 Count Change";
                const isFirstOfGroup = idx === 0;
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
                const scheduledCls = isScheduled
                  ? `print-line-scheduled ${isFirstOfGroup ? "print-line-scheduled-first" : ""} ${isLastOfGroup ? "print-line-scheduled-last" : ""}`
                  : "";
                return (
                  <tr key={row.id} className={`${hl} ${isLastOfGroup ? "print-divider" : ""} ${scheduledCls}`}>
                    <td className={lineCls}>{row.line}</td>
                    <td>{row.wo}</td>
                    <td>{row.seq}</td>
                    <td>{row.item}</td>
                    <td className="print-left">{row.description}</td>
                    <td className={countChanged ? "print-count-changed" : ""}>{row.count}</td>
                    <td>{row.bulkItem}</td>
                    <td>{row.bottleSize}</td>
                    <td className="print-left">{row.capDescription}</td>
                    <td>{row.allergen}</td>
                    <td className="print-left">{row.remarks}</td>
                    <td className="print-num">{row.woQuantity}</td>
                    <td className="print-num">{row.percentComplete}</td>
                    <td>{row.desiccant}</td>
                    <td className="print-formula-col print-progress-cell">
                      <ProgressBar value={percentActual(row)} />
                    </td>
                    <td className="print-num print-formula-col">{bottlesRemaining(row)}</td>
                    <td className="print-formula-col">{chg}</td>
                  </tr>
                );
              })}
              {groupIdx < groups.length - 1 && (
                <tr className="print-line-spacer" aria-hidden="true">
                  <td colSpan={17} />
                </tr>
              )}
            </Fragment>
            );
          })}
        </tbody>
      </table>
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
  if (/\bMLL\b/i.test(role)) return "print-assign-role-mll";
  if (/\bMLT\b/i.test(role)) return "print-assign-role-mlt";
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

// A free-standing note box - fully self-styled (font, colors, border), so
// unlike LineBoxContent/RoomBoxContent it ignores the shared print
// settings entirely and just renders the comment's own appearance.
export function CommentBoxContent({ comment }: { comment: CommentBox }) {
  return (
    <div
      className="print-comment-box"
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
      {comment.text}
    </div>
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
  const printedComments = board.comments.filter((c) => c.includeInPrint);

  const cssVars = {
    "--print-title-color": settings.titleColor,
    "--print-banner-color": settings.bannerColor,
    "--print-banner-text-color": settings.bannerTextColor,
    "--print-scheduled-color": settings.scheduledColor,
    "--print-not-scheduled-color": settings.notScheduledColor,
    "--print-pm-color": settings.pmColor,
    "--print-leader-color": settings.leaderColor,
    "--print-mll-color": settings.mllColor,
    "--print-mlt-color": settings.mltColor,
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
          {printedComments.map((comment, i) => {
            const rect = resolveBoxLayout(
              commentBoxKey(comment.title),
              board.lineSlots.length + roomSections.length + i,
              settings.boxLayouts,
            );
            return (
              <div
                className="print-assign-col-absolute print-comment-col-absolute"
                key={comment.id}
                style={{ left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.width}%`, height: `${rect.height}%` }}
              >
                <CommentBoxContent comment={comment} />
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

          {printedComments.length > 0 && (
            <div className="print-assign-comments-row">
              {printedComments.map((comment) => (
                <CommentBoxContent comment={comment} key={comment.id} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
