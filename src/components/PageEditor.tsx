import { Fragment, useRef, useState } from "react";
import type { DragEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import type {
  BoxLayout,
  CommentBox,
  DailyBoard,
  ExtraKind,
  LineSlot,
  ListSection,
  PrintAssignSettings,
  SectionStyle,
} from "../types";
import {
  chunk,
  clamp,
  nameKey,
  nameRoleClass,
  pageBoxKeys,
  printCssVars,
  resolveBoxLayout,
  sectionHeaderStyle,
  sectionItemStyle,
  SLOTS_PER_BAND,
  snapMove,
  snapResize,
  sortByRole,
  statusKey,
} from "../printLayout";
import {
  crewBadgeTone,
  describeExtras,
  DRAG_MIME,
  dutyCrew,
  extraGroups,
  lineCrew,
  lineLead,
  noteWithoutZbs,
  parseNames,
  slotRoleMap,
  readDragPayload,
  staffingOff,
} from "../assignmentLogic";
import type { SlotCoverage } from "../assignmentLogic";
import { CommentBoxContent, ExtraBubbles, ExtraDivider, ExtraParts, TallyRow } from "./PrintViews";
import PersonPicker from "./PersonPicker";
import type { ChipWarning, NameStatus } from "./NameMultiSelect";

export type PageSelection = { kind: "line" | "room" | "comment"; id: string } | { kind: "header" };

interface Props {
  board: DailyBoard;
  settings: PrintAssignSettings;
  setSettings: (updater: (s: PrintAssignSettings) => PrintAssignSettings) => void;
  roleMap: Map<string, string>;
  employeeNames: string[];
  selection: PageSelection | null;
  onSelect: (selection: PageSelection | null) => void;
  movePerson: (name: string, fromId: string, toId: string) => void;
  removePerson: (name: string, placeId: string) => void;
  addPerson: (name: string, placeId: string) => void;
  describe: (name: string) => NameStatus;
  warningFor: (name: string, placeId: string) => ChipWarning | undefined;
  coverage: (slot: LineSlot) => SlotCoverage;
  isMatch: (name: string) => boolean;
  searching: boolean;
}

const MIN_SIZE = 5;

interface DragState {
  key: string;
  mode: "move" | "resize";
  startX: number;
  startY: number;
  startRect: BoxLayout;
}

// The Line Assignments print page, drawn exactly as it prints, with every
// box editable in place: drag names between boxes, ✕ to remove, click a
// box to edit it in the sidebar, and (in free-form layout) move/resize it.
export default function PageEditor({
  board,
  settings,
  setSettings,
  roleMap,
  employeeNames,
  selection,
  onSelect,
  movePerson,
  removePerson,
  addPerson,
  describe,
  warningFor,
  coverage,
  isMatch,
  searching,
}: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({});
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const freeForm = settings.freeFormLayout;
  const printedRooms = settings.includeRoomSections ? board.roomSections : [];
  const printedComments = board.comments.filter((c) => c.includeInPrint);

  const layoutKeys = pageBoxKeys(board.lineSlots, printedRooms, printedComments);

  function isSelected(kind: "line" | "room" | "comment", id: string) {
    return selection?.kind === kind && "id" in selection && selection.id === id;
  }

  // ---- Free-form move / resize (same snapping as before) ----
  function beginLayoutDrag(e: ReactPointerEvent, index: number, mode: "move" | "resize") {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const key = layoutKeys[index];
    setDrag({ key, mode, startX: e.clientX, startY: e.clientY, startRect: resolveBoxLayout(key, index, settings.boxLayouts) });
  }

  function onLayoutMove(e: ReactPointerEvent) {
    if (!drag || !canvasRef.current) return;
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const dxPct = ((e.clientX - drag.startX) / canvasRect.width) * 100;
    const dyPct = ((e.clientY - drag.startY) / canvasRect.height) * 100;
    const raw: BoxLayout =
      drag.mode === "move"
        ? {
            ...drag.startRect,
            x: clamp(drag.startRect.x + dxPct, 0, 100 - drag.startRect.width),
            y: clamp(drag.startRect.y + dyPct, 0, 100 - drag.startRect.height),
          }
        : {
            ...drag.startRect,
            width: clamp(drag.startRect.width + dxPct, MIN_SIZE, 100 - drag.startRect.x),
            height: clamp(drag.startRect.height + dyPct, MIN_SIZE, 100 - drag.startRect.y),
          };
    const others = layoutKeys
      .map((key, i) => ({ key, rect: resolveBoxLayout(key, i, settings.boxLayouts) }))
      .filter((b) => b.key !== drag.key)
      .map((b) => b.rect);
    const snapped = drag.mode === "move" ? snapMove(raw, others) : snapResize(raw, others);
    const next: BoxLayout = {
      x: clamp(snapped.x, 0, 100 - snapped.width),
      y: clamp(snapped.y, 0, 100 - snapped.height),
      width: clamp(snapped.width, MIN_SIZE, 100 - snapped.x),
      height: clamp(snapped.height, MIN_SIZE, 100 - snapped.y),
    };
    setGuides({ x: snapped.guideX, y: snapped.guideY });
    setSettings((s) => ({ ...s, boxLayouts: { ...s.boxLayouts, [drag.key]: next } }));
  }

  function endLayoutDrag() {
    setDrag(null);
    setGuides({});
  }

  // ---- Dropping people onto a line / duty box ----
  function dropProps(placeId: string) {
    return {
      onDragOver: (e: DragEvent<HTMLDivElement>) => {
        if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (dropTarget !== placeId) setDropTarget(placeId);
      },
      onDragLeave: (e: DragEvent<HTMLDivElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget(null);
      },
      onDrop: (e: DragEvent<HTMLDivElement>) => {
        setDropTarget(null);
        const payload = readDragPayload(e.dataTransfer);
        if (!payload) return;
        e.preventDefault();
        movePerson(payload.name, payload.fromSlotId, placeId);
      },
    };
  }

  function nameRow(
    name: string,
    placeId: string,
    i: number,
    sectionStyle?: SectionStyle,
    extra: ExtraKind | null = null,
    roles: Map<string, string> = roleMap,
  ) {
    const warning = warningFor(name, placeId);
    const roleClass = extra ? `print-assign-extra-${extra}` : nameRoleClass(name, roles, settings.highlightRoles);
    const classes = ["print-assign-name-row", "page-name", roleClass];
    if (warning) classes.push(warning.soft ? "page-name-soft" : "page-name-warn");
    if (isMatch(name)) classes.push("page-name-match");
    return (
      <div
        key={`${i}-${name}`}
        className={classes.join(" ")}
        style={sectionItemStyle(sectionStyle, roleClass)}
        draggable
        title={warning?.text ?? "Drag to another box to move"}
        onDragStart={(e) => {
          e.stopPropagation();
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ name, fromSlotId: placeId }));
        }}
      >
        {warning && <span className="page-name-flag">{warning.soft ? "ℹ" : "⚠"}</span>}
        <span>{name}</span>
        <button
          type="button"
          className="page-name-remove"
          title={`Remove ${name}`}
          onClick={(e) => {
            e.stopPropagation();
            removePerson(name, placeId);
          }}
        >
          ✕
        </button>
      </div>
    );
  }

  function addRow(existing: string[], placeId: string) {
    const taken = new Set(existing.map(nameKey));
    return (
      <div className="page-add-row" onClick={(e) => e.stopPropagation()}>
        <PersonPicker
          names={employeeNames.filter((n) => !taken.has(nameKey(n)))}
          describe={describe}
          onPick={(name) => addPerson(name, placeId)}
          className="page-add-select"
          label="+ Add employee…"
        />
      </div>
    );
  }

  function boxClasses(base: string, id: string, kind: "line" | "room" | "comment", extra: string[] = []) {
    const classes = [base, "page-box", ...extra];
    if (isSelected(kind, id)) classes.push("page-box-selected");
    if (dropTarget === id) classes.push("page-box-dragover");
    return classes.join(" ");
  }

  function lineContent(slot: LineSlot) {
    // The crew, then the extra people (training, dumping, overtime) listed
    // last (as on the printout).
    const raw = lineCrew(slot);
    // Roles on this line: a lead picked in its panel counts as its Line Leader.
    const lineRoles = slotRoleMap(slot, roleMap);
    const names = settings.highlightRoles ? sortByRole(raw, lineRoles, lineLead(slot)) : raw;
    const groups = extraGroups(slot);
    const key = statusKey(slot.status);
    const cov = coverage(slot);
    // Same look as the printout: light red when a scheduled line is off its
    // ZBS, greyed out when it isn't running; amber for its other warnings,
    // like no MLL or Line Lead.
    const tone = crewBadgeTone(slot);
    const tips = [...(staffingOff(slot) === "over" ? ["More people than the ZBS"] : []), ...cov.warnings];
    return (
      <>
        <div className={`print-assign-name print-assign-${key}`}>{slot.line}</div>
        <div className={`print-assign-status print-assign-${key}`}>{slot.status || "—"}</div>
        {(() => {
          // The ZBS row, in the design picked in Customize Print Design.
          const style = settings.crewStyle;
          if (style === "tally")
            return (
              <div className={`print-assign-note print-assign-${key}`}>
                <TallyRow slot={slot}>
                  {cov.warnings.length > 0 && (
                    <span className="tally-warn" title={cov.warnings.join(" · ")}>
                      ⚠
                    </span>
                  )}
                </TallyRow>
              </div>
            );
          if (style === "badgeOnly") {
            const rest = noteWithoutZbs(slot.subNote);
            return rest ? <div className={`print-assign-note print-assign-${key}`}>{rest}</div> : null;
          }
          return <div className={`print-assign-note print-assign-${key}`}>{slot.subNote}</div>;
        })()}
        <div className="print-assign-names">
          {names.map((n, i) => nameRow(n, slot.id, i, undefined, null, lineRoles))}
          {groups.map((group) => (
            <Fragment key={`${group.kind}:${group.skill}`}>
              <ExtraDivider kind={group.kind} skill={group.skill} />
              {group.names.map((n, i) => nameRow(n, slot.id, names.length + i, undefined, group.kind))}
            </Fragment>
          ))}
        </div>
        {isSelected("line", slot.id) && addRow(parseNames(slot.assigned), slot.id)}
        {(() => {
          const toneClass = tone ? `page-box-badge-${tone}` : cov.warnings.length ? "page-box-badge-warn" : "";
          const crew = (
            <>
              👥 {cov.count}
              {cov.target !== null ? `/${cov.target}` : ""}
              {cov.warnings.length ? " ⚠" : ""}
            </>
          );
          const title = tips.length
            ? tips.join(" · ")
            : `${cov.count} on the crew${cov.overtime ? ` (${cov.overtime} on overtime)` : ""}${cov.extras.length ? ` + ${describeExtras(cov.extras)} (not counted in the ZBS)` : ""}`;
          if (settings.crewStyle === "tally") return null;
          // With extra people: "+1" bubbles on the badge's corner, or one
          // pill, the crew then a "+1" half per kind (like a gold "+1🎓").
          if (cov.extras.length > 0 && settings.crewStyle === "bubble")
            return (
              <span className={`page-box-badge page-box-badge-bubbled ${toneClass}`} title={title}>
                {crew}
                <ExtraBubbles extras={cov.extras} />
              </span>
            );
          return cov.extras.length > 0 ? (
            <span className="page-box-badge page-box-badge-split" title={title}>
              <span className={`page-crew-part ${toneClass}`}>{crew}</span>
              <ExtraParts extras={cov.extras} className="page-extra-part" />
            </span>
          ) : (
            <span className={`page-box-badge ${toneClass}`} title={title}>
              {crew}
            </span>
          );
        })()}
      </>
    );
  }

  function roomContent(section: ListSection) {
    const items = section.items.filter((item) => item.trim());
    const crew = dutyCrew(section);
    return (
      <>
        <div
          className={`print-assign-room-header${crew ? " page-room-header-badged" : ""}`}
          style={sectionHeaderStyle(section.style)}
        >
          {section.title}
        </div>
        {crew && (
          <span
            className={`page-box-badge${crew.tone ? ` page-box-badge-${crew.tone}` : ""}`}
            title={
              crew.tone === "off"
                ? `Short ${crew.needed! - crew.count} (needs ${crew.needed})`
                : `${crew.count} on this duty${crew.needed !== null ? ` (needs ${crew.needed})` : ""}`
            }
          >
            👥 {crew.count}
            {crew.needed !== null ? `/${crew.needed}` : ""}
          </span>
        )}
        <div className="print-assign-names">{items.map((item, i) => nameRow(item, section.id, i, section.style))}</div>
        {isSelected("room", section.id) && addRow(items, section.id)}
      </>
    );
  }

  function lineWarnClass(slot: LineSlot): string[] {
    const classes: string[] = [];
    if (coverage(slot).warnings.length) classes.push("page-box-warn");
    if (searching && !parseNames(slot.assigned).some(isMatch)) classes.push("page-box-dim");
    return classes;
  }
  function roomDimClass(section: ListSection): string[] {
    return searching && !section.items.some(isMatch) ? ["page-box-dim"] : [];
  }

  function select(next: PageSelection) {
    return (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      onSelect(next);
    };
  }

  function freeFormBox(index: number, className: string, onClick: (e: { stopPropagation: () => void }) => void, children: ReactNode, extra = {}) {
    const rect = resolveBoxLayout(layoutKeys[index], index, settings.boxLayouts);
    return (
      <div
        key={layoutKeys[index] + index}
        className={`${className} print-assign-col-absolute`}
        style={{ left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.width}%`, height: `${rect.height}%` }}
        onClick={onClick}
        {...extra}
      >
        {children}
        <div className="page-box-grip" title="Drag to move this box" onPointerDown={(e) => beginLayoutDrag(e, index, "move")}>
          ⠿
        </div>
        <div className="layout-box-resize" title="Drag to resize" onPointerDown={(e) => beginLayoutDrag(e, index, "resize")} />
      </div>
    );
  }

  const unprintedRooms = settings.includeRoomSections ? [] : board.roomSections;

  return (
    <div className="page-editor-wrap">
      <div className="page-sheet" style={printCssVars(settings)} onClick={() => onSelect(null)}>
        <div
          className={`page-header ${selection?.kind === "header" ? "page-box-selected" : ""}`}
          onClick={select({ kind: "header" })}
          title="Click to edit the date, shift and department leader"
        >
          <div className="print-assign-title">{board.shiftLabel} | Line Assignments</div>
          {settings.showBanner ? (
            <div className="print-assign-banner">
              <span className="print-assign-banner-date">{board.date}</span>
              <span className="print-assign-banner-safety">{settings.bannerText}</span>
              <span className="print-assign-banner-leader">Dept. Leader: {board.deptLeader || "—"}</span>
            </div>
          ) : (
            <div className="print-assign-banner print-assign-banner-minimal">
              <span className="print-assign-banner-date">{board.date}</span>
              <span className="print-assign-banner-leader">Dept. Leader: {board.deptLeader || "—"}</span>
            </div>
          )}
        </div>

        {freeForm ? (
          <div
            ref={canvasRef}
            className="print-layout-canvas page-canvas"
            style={{ aspectRatio: settings.orientation === "landscape" ? "11 / 8.5" : "8.5 / 11" }}
            onPointerMove={onLayoutMove}
            onPointerUp={endLayoutDrag}
            onPointerCancel={endLayoutDrag}
          >
            {drag && guides.x !== undefined && <div className="snap-guide snap-guide-v" style={{ left: `${guides.x}%` }} />}
            {drag && guides.y !== undefined && <div className="snap-guide snap-guide-h" style={{ top: `${guides.y}%` }} />}
            {board.lineSlots.map((slot, i) =>
              freeFormBox(
                i,
                boxClasses("print-assign-col", slot.id, "line", lineWarnClass(slot)),
                select({ kind: "line", id: slot.id }),
                lineContent(slot),
                dropProps(slot.id),
              ),
            )}
            {printedRooms.map((section, i) =>
              freeFormBox(
                board.lineSlots.length + i,
                boxClasses("print-assign-col", section.id, "room", roomDimClass(section)),
                select({ kind: "room", id: section.id }),
                roomContent(section),
                dropProps(section.id),
              ),
            )}
            {printedComments.map((comment: CommentBox, i) =>
              freeFormBox(
                board.lineSlots.length + printedRooms.length + i,
                boxClasses("print-comment-col-absolute", comment.id, "comment"),
                select({ kind: "comment", id: comment.id }),
                <CommentBoxContent comment={comment} />,
              ),
            )}
          </div>
        ) : (
          <>
            {chunk(board.lineSlots, SLOTS_PER_BAND).map((band, bandIdx) => (
              <div className="print-assign-band-row" key={bandIdx}>
                {band.map((slot) => (
                  <div
                    key={slot.id}
                    className={boxClasses("print-assign-col", slot.id, "line", lineWarnClass(slot))}
                    onClick={select({ kind: "line", id: slot.id })}
                    {...dropProps(slot.id)}
                  >
                    {lineContent(slot)}
                  </div>
                ))}
              </div>
            ))}
            {chunk(printedRooms, SLOTS_PER_BAND).map((band, bandIdx) => (
              <div className="print-assign-band-row print-assign-room-row" key={bandIdx}>
                {band.map((section) => (
                  <div
                    key={section.id}
                    className={boxClasses("print-assign-col", section.id, "room", roomDimClass(section))}
                    onClick={select({ kind: "room", id: section.id })}
                    {...dropProps(section.id)}
                  >
                    {roomContent(section)}
                  </div>
                ))}
              </div>
            ))}
            {printedComments.length > 0 && (
              <div className="print-assign-comments-row">
                {printedComments.map((comment) => (
                  <div
                    key={comment.id}
                    className={boxClasses("page-comment", comment.id, "comment")}
                    onClick={select({ kind: "comment", id: comment.id })}
                  >
                    <CommentBoxContent comment={comment} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {board.lineSlots.length === 0 && board.roomSections.length === 0 && (
          <div className="page-empty">No lines on this board yet — use “+ Line” above to add one.</div>
        )}
      </div>

      {unprintedRooms.length > 0 && (
        <div className="page-unprinted">
          <div className="panel-hint">
            Duty sections — not printed (turn on “Include room sections” under Print Design to print them):
          </div>
          <div className="print-assign-band-row page-unprinted-row" style={printCssVars(settings)}>
            {unprintedRooms.map((section) => (
              <div
                key={section.id}
                className={boxClasses("print-assign-col", section.id, "room", roomDimClass(section))}
                onClick={select({ kind: "room", id: section.id })}
                {...dropProps(section.id)}
              >
                {roomContent(section)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
