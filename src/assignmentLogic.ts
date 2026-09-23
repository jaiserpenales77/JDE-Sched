import type { DailyBoard, Employee, LineSlot, ListSection } from "./types";
import { nameKey, roleCategory, roleOf } from "./printLayout";

// Drag payload type for moving a person between lines, duty sections and
// the Unassigned list - namespaced so dropping something else (a browser
// tab, a file, plain text) is safely ignored.
export const DRAG_MIME = "application/x-jde-employee";
// "fromSlotId" for a person dragged out of the Unassigned list rather than
// off a line.
export const UNASSIGNED_SOURCE = "unassigned";

export interface DragPayload {
  name: string;
  fromSlotId: string;
}

export function readDragPayload(dataTransfer: DataTransfer): DragPayload | null {
  const raw = dataTransfer.getData(DRAG_MIME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DragPayload>;
    return parsed.name && parsed.fromSlotId ? { name: parsed.name, fromSlotId: parsed.fromSlotId } : null;
  } catch {
    return null;
  }
}

// The name as the day board shows and stores it. Strips trailing role tags
// the board never shows (e.g. "Jaiser Penales MLL"), and turns a roster's
// "Last, First" into "First Last" - a line's crew is stored as one
// comma-separated string, so a comma inside a name would split one person
// into two.
export function cleanEmployeeName(name: string): string {
  const s = name.trim().replace(/\s+(MLL|MLT|LL)$/i, "").trim();
  if (!s.includes(",")) return s;
  const [last, ...rest] = s.split(",");
  return `${rest.join(" ").trim()} ${last.trim()}`.replace(/\s+/g, " ").trim();
}

export function parseNames(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// A Rosters & Notes section whose title reads like an absence list
// ("PTO / Absences", "Sick / Unscheduled", "LOA", ...) - people listed
// there are out today, not available to assign.
const OUT_SECTION_TITLE = /pto|absen|sick|unscheduled|\bloa\b|leave|bereave|vacation|\boff\b/i;

export function isOutSection(section: ListSection): boolean {
  return OUT_SECTION_TITLE.test(section.title);
}

export interface Placement {
  kind: "line" | "room";
  id: string;
  label: string;
}

// Every place each person (by nameKey) is on today's board: line slots
// and Room & Duty sections. More than one entry means double-booked.
export function boardPlacements(board: DailyBoard | undefined): Map<string, Placement[]> {
  const map = new Map<string, Placement[]>();
  if (!board) return map;
  function add(name: string, placement: Placement) {
    const key = nameKey(name);
    if (!key) return;
    const list = map.get(key) ?? [];
    if (!list.some((p) => p.id === placement.id)) list.push(placement);
    map.set(key, list);
  }
  for (const slot of board.lineSlots) {
    for (const name of parseNames(slot.assigned)) add(name, { kind: "line", id: slot.id, label: slot.line.trim() || "a line" });
  }
  for (const section of board.roomSections) {
    for (const item of section.items) add(item, { kind: "room", id: section.id, label: section.title.trim() || "a duty" });
  }
  return map;
}

// nameKey -> the absence section they're listed under.
export function boardOut(board: DailyBoard | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!board) return map;
  for (const section of board.listSections) {
    if (!isOutSection(section)) continue;
    for (const item of section.items) {
      const key = nameKey(item);
      if (key && !map.has(key)) map.set(key, section.title.trim());
    }
  }
  return map;
}

// Staffing target from a line's note, e.g. "ZBS - 6" -> 6. A range like
// "ZBS -5/6" uses the lower number as the minimum.
export function zbsTarget(subNote: string): number | null {
  const match = subNote.match(/zbs\s*-?\s*(\d+)/i);
  return match ? Number(match[1]) : null;
}

export function isRunning(slot: LineSlot): boolean {
  return slot.status !== "Not Scheduled" && slot.status !== "PM";
}

export interface SlotCoverage {
  count: number;
  target: number | null;
  warnings: string[];
}

export function slotCoverage(slot: LineSlot, roleMap: Map<string, string>): SlotCoverage {
  const names = parseNames(slot.assigned);
  const target = zbsTarget(slot.subNote);
  const warnings: string[] = [];
  if (slot.status === "Scheduled") {
    if (names.length === 0) {
      warnings.push("No crew assigned");
    } else {
      const hasLead = names.some((n) => {
        const category = roleCategory(roleOf(n, roleMap));
        return category === "mll" || category === "leader";
      });
      if (!hasLead) warnings.push("No MLL or Line Lead");
      if (target !== null && names.length < target) warnings.push(`Short ${target - names.length} (ZBS ${target})`);
    }
  }
  return { count: names.length, target, warnings };
}

// "Line 08", "Line 8 ", "line 12/9" -> "8", "8", "12"; "STRETCH" -> "stretch".
export function lineKey(line: string): string {
  return line
    .toLowerCase()
    .split("/")[0]
    .replace(/\bline\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .replace(/^0+(?=\d)/, "");
}

function compact(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Primary Line text vs a Room & Duty section title - "Washroom Support"
// matches a "Wash Room" section, "Inside Utility" matches "Inside Utility".
function roomMatches(title: string, primaryLine: string): boolean {
  const a = compact(title);
  const b = compact(primaryLine);
  if (!a || !b) return false;
  if (a === b) return true;
  return Math.min(a.length, b.length) >= 4 && (a.includes(b) || b.includes(a));
}

export interface AutoFillResult {
  lineSlots: LineSlot[];
  roomSections: ListSection[];
  placed: number;
  skipped: { name: string; reason: string }[];
}

// Puts everyone not yet placed (and not out) onto the line or duty that
// matches their Primary Line on the Skills & Roles tab. Only ever adds -
// never moves or removes anyone already on the board.
export function autoFillFromPrimaryLines(
  board: DailyBoard,
  employees: Employee[],
  placements: Map<string, Placement[]>,
  out: Map<string, string>,
): AutoFillResult {
  const lineSlots = board.lineSlots.map((s) => ({ ...s }));
  const roomSections = board.roomSections.map((s) => ({ ...s, items: [...s.items] }));
  const handled = new Set<string>();
  let placed = 0;
  const skipped: { name: string; reason: string }[] = [];

  for (const e of employees) {
    const name = cleanEmployeeName(e.name);
    const key = nameKey(name);
    if (!key || handled.has(key)) continue;
    handled.add(key);
    if (placements.has(key) || out.has(key)) continue;

    const primary = e.primaryLine.trim();
    if (!primary) {
      skipped.push({ name, reason: "no Primary Line set" });
      continue;
    }
    const slot = lineSlots.find((s) => lineKey(s.line) !== "" && lineKey(s.line) === lineKey(primary));
    if (slot) {
      if (!isRunning(slot)) {
        skipped.push({ name, reason: `${slot.line.trim()} is ${slot.status}` });
        continue;
      }
      slot.assigned = [...parseNames(slot.assigned), name].join(", ");
      placed++;
      continue;
    }
    const room = roomSections.find((r) => roomMatches(r.title, primary));
    if (room) {
      room.items.push(name);
      placed++;
      continue;
    }
    skipped.push({ name, reason: `no "${primary}" on this board` });
  }

  return { lineSlots, roomSections, placed, skipped };
}
