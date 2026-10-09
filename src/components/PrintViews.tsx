import { Fragment, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import type {
  CommentBox,
  DailyBoard,
  Employee,
  LineSlot,
  ListSection,
  PrintAssignSettings,
  SchedulePrintSettings,
  WorkOrder,
} from "../types";
import { defaultSchedulePrintSettings } from "../seedData";
import {
  groupByLine,
  percentActual,
  bottlesRemaining,
  changeoverInto,
  isAllergenRow,
  isOilRow,
  isBulkHighlightRow,
  lineStatusLabel,
  orderedScheduleColumns,
  SCHEDULE_COLUMN_LABELS,
} from "../scheduleLogic";
import type { ScheduleColumnKey } from "../scheduleLogic";
import {
  buildRoleMap,
  chunk,
  nameRoleClass,
  pageBoxKeys,
  resolveBoxLayout,
  scheduleCssVars,
  sectionHeaderStyle,
  sectionItemStyle,
  SLOTS_PER_BAND,
  sortByRole,
  statusKey,
} from "../printLayout";
import ProgressBar from "./ProgressBar";

// Print layouts that mirror the original workbook's printed pages as
// closely as HTML/CSS allows: same title, same column set and order as
// the "JDE Template (2)" sheet's print area (A1:P16 - Line Status was
// outside that print area, so it's left out here too), plus a Desiccant
// column (also part of the original sheet, but outside its print area)
// alongside % Actual Complete, the same pastel conditional-formatting
// fills, and the same thick navy divider between production lines that
// "Add Line Dividers" used to draw.

const FORMULA_COLUMN_KEYS = new Set<ScheduleColumnKey>(["percentActual", "bottlesRemaining", "changeover"]);

// Percentages of the table's width - don't need to add up to exactly
// 100 (the browser distributes fixed-layout columns proportionally
// either way), just to reflect each column's typical content width.
const DEFAULT_SCHEDULE_COLUMN_WIDTHS: Record<ScheduleColumnKey, number> = {
  // Wide enough for the line name in bold plus its READY / PM tag.
  line: 6.5,
  wo: 5,
  seq: 3,
  item: 5,
  description: 14,
  count: 3,
  bulkItem: 5,
  bottleSize: 4,
  capDescription: 10,
  allergen: 3,
  remarks: 12.5,
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
  activePct,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onDoubleClick,
}: {
  show: boolean;
  // The column's width while it's being dragged, shown in a small tip.
  activePct: number | null;
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: () => void;
  onDoubleClick: () => void;
}) {
  if (!show) return null;
  return (
    <span
      className={`col-resize-handle ${activePct !== null ? "active" : ""}`}
      title="Drag to resize · double-click to fit"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      onDragStart={(e) => e.preventDefault()}
    >
      {activePct !== null && <span className="col-resize-tip">{activePct.toFixed(1)}%</span>}
    </span>
  );
}

// Widest a column can be made by dragging or fitting, as a share of the table.
const MAX_COLUMN_SHARE = 0.6;
// Fitting never lets one long column (e.g. Remarks) take more than this.
const MAX_FIT_SHARE = 0.3;

interface PrintScheduleProps {
  workOrders: WorkOrder[];
  scheduledLines?: string[];
  columnWidths?: Record<string, number>;
  hiddenColumns?: string[];
  // Omit to render a plain, non-interactive table (used for the actual
  // print output) - pass it to get draggable column resize handles (used
  // by the live preview).
  setColumnWidths?: (updater: (widths: Record<string, number>) => Record<string, number>) => void;
  columnOrder?: string[];
  // Pass to let column headers be dragged to new positions (live preview).
  setColumnOrder?: (order: string[]) => void;
  design?: SchedulePrintSettings;
  // Estimated changeover time by line, shown on each line's running work
  // order (its first), whose Changeover cell is otherwise empty.
  changeoverTimes?: Record<string, string>;
}

const COLUMN_DRAG_MIME = "application/x-jde-sched-column";

export function PrintSchedule({
  workOrders,
  scheduledLines = [],
  columnWidths = {},
  hiddenColumns = [],
  setColumnWidths,
  columnOrder = [],
  setColumnOrder,
  design = defaultSchedulePrintSettings,
  changeoverTimes = {},
}: PrintScheduleProps) {
  const groups = groupByLine(workOrders);
  const today = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  const tableRef = useRef<HTMLTableElement>(null);
  const [drag, setDrag] = useState<{
    key: ScheduleColumnKey;
    startX: number;
    startShare: number;
    othersSum: number;
    tableWidthPx: number;
    share: number;
  } | null>(null);
  // Height of the table from the column-header row down, so the resize
  // strips run the full height of the columns.
  const [resizeH, setResizeH] = useState(0);

  const hiddenSet = new Set(hiddenColumns);
  const orderedKeys = orderedScheduleColumns(columnOrder);
  const visibleKeys = orderedKeys.filter((key) => !hiddenSet.has(key));
  // Dragging a header to move its column - LINE stays put. Tracks where it
  // would land, to draw the drop marker.
  const [dropAt, setDropAt] = useState<{ key: ScheduleColumnKey; side: "before" | "after" } | null>(null);
  const resizing = useRef(false);
  const isHidden = (key: ScheduleColumnKey) => hiddenSet.has(key);

  function widthOf(key: ScheduleColumnKey): number {
    return columnWidths[key] ?? DEFAULT_SCHEDULE_COLUMN_WIDTHS[key];
  }

  // Columns fill the page: each one's printed share is its stored width
  // over the total of the visible columns.
  const visibleSum = visibleKeys.reduce((sum, key) => sum + widthOf(key), 0);
  const shareOf = (key: ScheduleColumnKey) => widthOf(key) / visibleSum;

  // The stored width that gives `key` this share of the table while every
  // other column keeps its size relative to the rest.
  function widthForShare(key: ScheduleColumnKey, share: number): number {
    const others = visibleSum - widthOf(key);
    const clamped = Math.min(MAX_COLUMN_SHARE, Math.max(MIN_COLUMN_PCT / 100, share));
    return (clamped * others) / (1 - clamped);
  }

  useLayoutEffect(() => {
    if (!setColumnWidths || !tableRef.current) return;
    const table = tableRef.current;
    const measure = () => {
      const header = table.querySelector(".print-col-headers") as HTMLElement | null;
      if (header) setResizeH(table.offsetHeight - header.offsetTop);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(table);
    return () => observer.disconnect();
  }, [setColumnWidths]);

  function beginResize(e: ReactPointerEvent, key: ScheduleColumnKey) {
    if (!setColumnWidths || !tableRef.current) return;
    resizing.current = true;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setDrag({
      key,
      startX: e.clientX,
      startShare: shareOf(key),
      othersSum: visibleSum - widthOf(key),
      tableWidthPx: tableRef.current.getBoundingClientRect().width,
      share: shareOf(key),
    });
  }

  function onResizeMove(e: ReactPointerEvent) {
    if (!drag || !setColumnWidths) return;
    const share = Math.min(
      MAX_COLUMN_SHARE,
      Math.max(MIN_COLUMN_PCT / 100, drag.startShare + (e.clientX - drag.startX) / drag.tableWidthPx),
    );
    const width = (share * drag.othersSum) / (1 - share);
    setDrag({ ...drag, share });
    setColumnWidths((w) => ({ ...w, [drag.key]: width }));
  }

  function endResize() {
    resizing.current = false;
    setDrag(null);
  }

  // How wide a column's contents want to be, in px: its widest cell, or
  // the longest word of its title (titles wrap).
  function contentWidth(key: ScheduleColumnKey): number {
    const table = tableRef.current;
    if (!table) return 0;
    let widest = 0;
    table.querySelectorAll<HTMLElement>(`td[data-col="${key}"]`).forEach((td) => {
      widest = Math.max(widest, td.scrollWidth + 2);
    });
    const th = table.querySelector<HTMLElement>(`th[data-col="${key}"]`);
    if (th) {
      const ctx = document.createElement("canvas").getContext("2d");
      if (ctx) {
        const cs = getComputedStyle(th);
        ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const words = SCHEDULE_COLUMN_LABELS[key].toUpperCase().split(/\s+/);
        const longest = Math.max(...words.map((w) => ctx.measureText(w).width));
        widest = Math.max(widest, longest + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + 4);
      }
    }
    return widest;
  }

  function fitColumn(key: ScheduleColumnKey) {
    if (!setColumnWidths || !tableRef.current) return;
    const tableW = tableRef.current.getBoundingClientRect().width;
    const share = Math.min(MAX_FIT_SHARE, contentWidth(key) / tableW);
    setColumnWidths((w) => ({ ...w, [key]: widthForShare(key, share) }));
  }

  // Short columns (Seq, Count, Item...) get their full width first; the
  // long text columns (Description, Cap, Remarks) share what's left
  // evenly. If everything fits, the spare room is spread in proportion.
  function fitAllColumns() {
    if (!setColumnWidths || !tableRef.current) return;
    const tableW = tableRef.current.getBoundingClientRect().width;
    const wanted = visibleKeys.map((key) => Math.min(contentWidth(key), tableW * MAX_FIT_SHARE));
    const given = new Array<number>(wanted.length).fill(0);
    let remaining = tableW;
    let open = wanted.map((_, i) => i);
    while (open.length) {
      const fair = remaining / open.length;
      const fits = open.filter((i) => wanted[i] <= fair);
      if (!fits.length) {
        for (const i of open) given[i] = fair;
        break;
      }
      for (const i of fits) {
        given[i] = wanted[i];
        remaining -= wanted[i];
      }
      open = open.filter((i) => wanted[i] > fair);
    }
    const total = given.reduce((sum, v) => sum + v, 0) || 1;
    setColumnWidths((w) => {
      const next = { ...w };
      visibleKeys.forEach((key, i) => (next[key] = Math.max(MIN_COLUMN_PCT, (given[i] / total) * 100)));
      return next;
    });
  }

  function resizeHandleProps(columnKey: ScheduleColumnKey) {
    return {
      show: !!setColumnWidths,
      activePct: drag?.key === columnKey ? drag.share * 100 : null,
      onPointerDown: (e: ReactPointerEvent) => beginResize(e, columnKey),
      onPointerMove: onResizeMove,
      onPointerUp: endResize,
      onDoubleClick: () => fitColumn(columnKey),
    };
  }

  const canMove = (key: ScheduleColumnKey) => !!setColumnOrder && key !== "line";

  function onHeaderDragStart(e: ReactDragEvent, key: ScheduleColumnKey) {
    // A drag that starts on the resize handle resizes instead.
    if (resizing.current || !canMove(key)) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData(COLUMN_DRAG_MIME, key);
    e.dataTransfer.effectAllowed = "move";
  }

  function onHeaderDragOver(e: ReactDragEvent, key: ScheduleColumnKey) {
    if (!setColumnOrder || !e.dataTransfer.types.includes(COLUMN_DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // Nothing can go in front of LINE.
    const side = key === "line" || e.clientX > rect.left + rect.width / 2 ? "after" : "before";
    if (dropAt?.key !== key || dropAt.side !== side) setDropAt({ key, side });
  }

  function onHeaderDrop(e: ReactDragEvent, target: ScheduleColumnKey) {
    const moved = e.dataTransfer.getData(COLUMN_DRAG_MIME) as ScheduleColumnKey;
    const side = dropAt?.key === target ? dropAt.side : "after";
    setDropAt(null);
    if (!setColumnOrder || !moved || moved === target || moved === "line") return;
    e.preventDefault();
    // Reorder the full list (hidden columns keep their relative place).
    const next = orderedKeys.filter((k) => k !== moved);
    const at = next.indexOf(target) + (side === "after" ? 1 : 0);
    next.splice(Math.max(1, at), 0, moved);
    setColumnOrder(next);
  }


  return (
    <div className="print-schedule" style={scheduleCssVars(design)}>
      {setColumnWidths && (
        <div className="print-preview-tools">
          <button type="button" className="btn small" onClick={fitAllColumns} title="Size every column to what's in it">
            ↔ Fit all columns
          </button>
          {Object.keys(columnWidths).length > 0 && (
            <button type="button" className="btn small" onClick={() => setColumnWidths(() => ({}))}>
              Reset column widths
            </button>
          )}
        </div>
      )}
      <table
        className="print-table"
        ref={tableRef}
        style={resizeH ? ({ "--resize-h": `${resizeH}px` } as CSSProperties) : undefined}
      >
        <colgroup>
          {visibleKeys.map((key) => (
            <col key={key} style={{ width: `${shareOf(key) * 100}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th colSpan={visibleKeys.length} className="print-title-row">
              {design.title}
              {design.showDate && <span className="print-title-date">{today}</span>}
            </th>
          </tr>
          <tr className="print-col-headers">
            {visibleKeys.map((key) => (
              <th
                key={key}
                data-col={key}
                className={[
                  FORMULA_COLUMN_KEYS.has(key) ? "print-formula-col" : "",
                  canMove(key) ? "col-movable" : "",
                  dropAt?.key === key ? `col-drop-${dropAt.side}` : "",
                ].join(" ")}
                draggable={canMove(key)}
                title={canMove(key) ? "Drag to move this column" : undefined}
                onDragStart={(e) => onHeaderDragStart(e, key)}
                onDragOver={(e) => onHeaderDragOver(e, key)}
                onDragLeave={() => dropAt?.key === key && setDropAt(null)}
                onDrop={(e) => onHeaderDrop(e, key)}
                onDragEnd={() => setDropAt(null)}
              >
                {SCHEDULE_COLUMN_LABELS[key]}
                <ColResizeHandle {...resizeHandleProps(key)} />
              </th>
            ))}
          </tr>
        </thead>
        {groups.length === 0 && (
          <tbody>
            <tr>
              <td colSpan={visibleKeys.length} style={{ textAlign: "center", padding: 20 }}>
                No work orders scheduled.
              </td>
            </tr>
          </tbody>
        )}
        {groups.map((group, groupIdx) => {
          const isScheduled = scheduledLines.includes(group.line);
          // The line's name is printed once, in a tall cell down the left of
          // its block, with a READY / PM / OT tag when any of its work
          // orders has that status.
          const status = lineStatusLabel(group.rows);
          const showLine = !isHidden("line");
          return (
            <tbody key={group.line} className="print-line-group">
              {group.rows.map((row, idx) => {
                const chg = changeoverInto(group.rows, idx);
                // On an "S1 Count Change" the count that changed is this
                // row's own Count cell.
                const countChanged = chg === "S1 Count Change";
                const isFirstOfGroup = idx === 0;
                const isLastOfGroup = idx === group.rows.length - 1;
                let hl = "";
                if (isAllergenRow(row)) hl = "print-hl-allergen";
                else if (isOilRow(row)) hl = "print-hl-oil";
                else if (isBulkHighlightRow(row)) hl = "print-hl-bulk";
                const cells: Record<Exclude<ScheduleColumnKey, "line">, ReactNode> = {
                  wo: <td data-col="wo">{row.wo}</td>,
                  seq: <td data-col="seq">{row.seq}</td>,
                  item: <td data-col="item">{row.item}</td>,
                  description: <td data-col="description" className="print-left">{row.description}</td>,
                  count: <td data-col="count" className={countChanged ? "print-count-changed" : ""}>{row.count}</td>,
                  bulkItem: <td data-col="bulkItem">{row.bulkItem}</td>,
                  bottleSize: <td data-col="bottleSize">{row.bottleSize}</td>,
                  capDescription: <td data-col="capDescription" className="print-left">{row.capDescription}</td>,
                  allergen: <td data-col="allergen">{row.allergen}</td>,
                  remarks: <td data-col="remarks" className="print-left">{row.remarks}</td>,
                  woQuantity: <td data-col="woQuantity" className="print-num">{row.woQuantity}</td>,
                  percentComplete: <td data-col="percentComplete" className="print-num">{row.percentComplete}</td>,
                  desiccant: <td data-col="desiccant">{row.desiccant}</td>,
                  percentActual: (
                    <td data-col="percentActual" className="print-formula-col print-progress-cell">
                      <ProgressBar value={percentActual(row)} />
                    </td>
                  ),
                  bottlesRemaining: <td data-col="bottlesRemaining" className="print-num print-formula-col">{bottlesRemaining(row)}</td>,
                  changeover: (
                    <td data-col="changeover" className="print-formula-col">
                      {chg ||
                        (isFirstOfGroup && changeoverTimes[group.line] ? (
                          <span className="co-estimate" title="Estimated changeover">
                            Est. {changeoverTimes[group.line]}
                          </span>
                        ) : (
                          ""
                        ))}
                    </td>
                  ),
                };
                const scheduledCls = isScheduled
                  ? `print-line-scheduled ${isFirstOfGroup ? "print-line-scheduled-first" : ""} ${isLastOfGroup ? "print-line-scheduled-last" : ""}`
                  : "";
                return (
                  <tr
                    key={row.id}
                    className={`${hl} ${isLastOfGroup ? "print-divider" : ""} ${scheduledCls} ${showLine ? "print-merged" : ""}`}
                  >
                    {visibleKeys.map((key) => {
                      if (key !== "line") return <Fragment key={key}>{cells[key]}</Fragment>;
                      // The line's cell spans all its rows - only the first row has it.
                      if (!isFirstOfGroup) return null;
                      return (
                        <td
                          key={key}
                          data-col="line"
                          rowSpan={group.rows.length}
                          className={`print-line-cell ${status ? `print-line-${status.toLowerCase()}` : ""}`}
                        >
                          <span className="print-line-name">{group.line}</span>
                          {status && <span className="print-status-tag">{status.toUpperCase()}</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {groupIdx < groups.length - 1 && (
                <tr className="print-line-spacer" aria-hidden="true">
                  <td colSpan={visibleKeys.length} />
                </tr>
              )}
            </tbody>
          );
        })}
      </table>
    </div>
  );
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
  const rawNames = slot.assigned
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
  // MLL > Line Leader > MLT > everyone else - same "highlight roles"
  // toggle that colors these names also controls whether they're
  // reordered to put the crew hierarchy first.
  const names = settings.highlightRoles ? sortByRole(rawNames, roleMap) : rawNames;
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
      <div className="print-assign-room-header" style={sectionHeaderStyle(section.style)}>
        {section.title}
      </div>
      <div className="print-assign-names">
        {section.items.map((item, i) => {
          const roleClass = nameRoleClass(item, roleMap, settings.highlightRoles);
          return (
            <div className={`print-assign-name-row ${roleClass}`} style={sectionItemStyle(section.style, roleClass)} key={i}>
              {item}
            </div>
          );
        })}
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

  const roleMap = buildRoleMap(employees);
  const roomSections = settings.includeRoomSections ? board.roomSections : [];
  const printedComments = board.comments.filter((c) => c.includeInPrint);
  const boxKeys = pageBoxKeys(board.lineSlots, roomSections, printedComments);

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
            const rect = resolveBoxLayout(boxKeys[i], i, settings.boxLayouts);
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
            const index = board.lineSlots.length + i;
            const rect = resolveBoxLayout(boxKeys[index], index, settings.boxLayouts);
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
            const index = board.lineSlots.length + roomSections.length + i;
            const rect = resolveBoxLayout(boxKeys[index], index, settings.boxLayouts);
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
