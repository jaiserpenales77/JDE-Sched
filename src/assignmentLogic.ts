import type { DailyBoard, Employee, ExtraKind, ExtraPerson, LineSlot, ListSection, TimeOffEntry } from "./types";
import { EXTRA_KINDS, EXTRA_KIND_LABELS, SKILL_KEYS, SKILL_LABELS } from "./types";
import { describeEntry, entriesOn } from "./timeOffLogic";
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

// nameKey -> why they're out: scheduled time off covering the board's date
// (from the Time Off tab) first, then anyone typed into an absence list.
export function boardOut(board: DailyBoard | undefined, timeOff: TimeOffEntry[] = []): Map<string, string> {
  const map = new Map<string, string>();
  if (!board) return map;
  for (const entry of entriesOn(timeOff, board.date)) {
    const key = nameKey(entry.name);
    if (key && !map.has(key)) map.set(key, describeEntry(entry));
  }
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

const ZBS_PATTERN = /zbs\s*-?\s*(\d+)(?:\s*\/\s*(\d+))?/i;

// A line's ZBS from its note: "ZBS - 4" -> 4 to 4, "ZBS -5/6" -> 5 to 6.
export function zbsRange(subNote: string): { min: number; max: number } | null {
  const match = subNote.match(ZBS_PATTERN);
  if (!match) return null;
  const min = Number(match[1]);
  return { min, max: Math.max(min, Number(match[2] ?? match[1])) };
}

// The rest of a line's note once its ZBS is taken out ("PTP", "new label").
export function noteWithoutZbs(subNote: string): string {
  return subNote
    .replace(ZBS_PATTERN, "")
    .replace(/^[\s\-·,;:]+|[\s\-·,;:]+$/g, "")
    .trim();
}

// Whether a scheduled line has fewer or more people than its ZBS number
// ("ZBS -5/6" allows 5 or 6). Lines that aren't scheduled, or have no ZBS
// number, are never off.
export function staffingOff(slot: LineSlot): "under" | "over" | null {
  if (slot.status !== "Scheduled") return null;
  const zbs = zbsRange(slot.subNote);
  if (!zbs) return null;
  // The crew and anyone on overtime; training and dumping are on top of it.
  const count = zbsCount(slot);
  return count < zbs.min ? "under" : count > zbs.max ? "over" : null;
}

// A Room & Duty box's 👥 badge, when it's turned on for the box: how many
// people it lists ("Jessica & Debbie" counts as two) and how many it needs -
// the box's own number, else a "Min 2" in its title. Light red when it has
// fewer than it needs, grey when nobody is on it and it needs no one.
export interface DutyCrew {
  count: number;
  needed: number | null;
  tone: "off" | "idle" | null;
}

export function dutyNeededFromTitle(title: string): number | null {
  const match = title.match(/\bmin\.?\s*(\d+)/i);
  return match ? Number(match[1]) : null;
}

export function dutyCrew(section: ListSection): DutyCrew | null {
  if (!section.crewBadge) return null;
  const count = section.items.flatMap((item) => item.split("&")).filter((p) => p.trim()).length;
  const own = section.crewNeeded;
  const needed = typeof own === "number" && own > 0 ? own : dutyNeededFromTitle(section.title);
  const tone = needed !== null && count < needed ? "off" : count === 0 && needed === null ? "idle" : null;
  return { count, needed, tone };
}

// How a line's 👥 crew count badge looks, on screen and printed: light red
// when a scheduled line is off its ZBS, greyed out when the line isn't
// running (Not Scheduled or PM), plain otherwise.
export function crewBadgeTone(slot: LineSlot): "off" | "idle" | null {
  if (!isRunning(slot)) return "idle";
  return staffingOff(slot) ? "off" : null;
}

export function isRunning(slot: LineSlot): boolean {
  return slot.status !== "Not Scheduled" && slot.status !== "PM";
}

// The extra people on a line (training, dumping, overtime) who are still on
// it, once each.
export function lineExtras(slot: LineSlot): ExtraPerson[] {
  const onLine = new Set(parseNames(slot.assigned).map(nameKey));
  const seen = new Set<string>();
  return (slot.trainees ?? []).filter((t) => {
    const key = nameKey(t.name);
    if (!onLine.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Why someone is extra (people marked before dumping and overtime were
// training).
export function extraKind(person: ExtraPerson): ExtraKind {
  return person.kind && EXTRA_KINDS.includes(person.kind) ? person.kind : "training";
}

// A line's crew: everyone on it except the extra people.
export function lineCrew(slot: LineSlot): string[] {
  const extra = new Set(lineExtras(slot).map((t) => nameKey(t.name)));
  return parseNames(slot.assigned).filter((n) => !extra.has(nameKey(n)));
}

// The extra people in their rows: training (grouped by what they're
// training on, in the order first marked), then dumping, then overtime.
export interface ExtraGroup {
  kind: ExtraKind;
  skill: string;
  names: string[];
}

export function extraGroups(slot: LineSlot): ExtraGroup[] {
  const groups: ExtraGroup[] = [];
  for (const t of lineExtras(slot)) {
    const kind = extraKind(t);
    const skill = kind === "training" ? t.skill.trim() : "";
    const group = groups.find((g) => g.kind === kind && g.skill.toLowerCase() === skill.toLowerCase());
    if (group) group.names.push(t.name);
    else groups.push({ kind, skill, names: [t.name] });
  }
  return groups.sort((a, b) => EXTRA_KINDS.indexOf(a.kind) - EXTRA_KINDS.indexOf(b.kind));
}

// People on overtime fill the line's ZBS spots; training and dumping are on
// top of it.
export function countsTowardZbs(kind: ExtraKind): boolean {
  return kind === "overtime";
}

// How many people on a line count against its ZBS: the crew plus anyone on
// overtime.
export function zbsCount(slot: LineSlot): number {
  return lineCrew(slot).length + lineOvertime(slot);
}

// How many people on a line are on overtime.
export function lineOvertime(slot: LineSlot): number {
  return lineExtras(slot).filter((t) => countsTowardZbs(extraKind(t))).length;
}

// How many extra people of each kind are on top of the ZBS - training and
// dumping, for the badge's "+1"s (kinds with nobody left out).
export interface ExtraCount {
  kind: ExtraKind;
  count: number;
}

export function extraCounts(slot: LineSlot): ExtraCount[] {
  const extras = lineExtras(slot);
  return EXTRA_KINDS.filter((kind) => !countsTowardZbs(kind))
    .map((kind) => ({ kind, count: extras.filter((t) => extraKind(t) === kind).length }))
    .filter((c) => c.count > 0);
}

// "1 training, 2 dumping" - for tooltips.
export function describeExtras(counts: ExtraCount[]): string {
  return counts.map((c) => `${c.count} ${EXTRA_KIND_LABELS[c.kind].toLowerCase()}`).join(", ");
}

// What someone is most likely training on: the first skill marked "IP"
// (in progress) for them on Skills & Roles, or "".
export function trainingSkillFor(name: string, employees: Employee[]): string {
  const emp = employees.find((e) => nameKey(e.name) === nameKey(name));
  const key = emp && SKILL_KEYS.find((k) => emp.skills?.[k] === "IP");
  return key ? SKILL_LABELS[key] : "";
}

// The lead picked for a line in its panel, if they're still on its crew
// (not an extra person); null = the leads come from Skills & Roles.
export function lineLead(slot: LineSlot): string | null {
  const key = nameKey(slot.lead ?? "");
  if (!key) return null;
  return lineCrew(slot).find((n) => nameKey(n) === key) ?? null;
}

// Roles as they apply on one line. With a lead picked, that person is the
// line's Line Leader (an MLL stays an MLL), and anyone else the roster calls
// a Line Leader is ordinary crew on this line. MLL and MLT are unchanged.
export function slotRoleMap(slot: LineSlot, roleMap: Map<string, string>): Map<string, string> {
  const lead = lineLead(slot);
  if (!lead) return roleMap;
  const map = new Map(roleMap);
  for (const name of lineCrew(slot)) {
    if (roleCategory(roleOf(name, roleMap)) === "leader") map.set(`full:${nameKey(name)}`, "");
  }
  if (roleCategory(roleOf(lead, roleMap)) !== "mll") map.set(`full:${nameKey(lead)}`, "Line Leader");
  return map;
}

export interface SlotCoverage {
  // Everyone counted against the ZBS: the crew and anyone on overtime.
  count: number;
  // How many of them are on overtime.
  overtime: number;
  target: number | null;
  warnings: string[];
  // The people on top of the ZBS (training, dumping).
  extras: ExtraCount[];
}

export function slotCoverage(slot: LineSlot, allRoles: Map<string, string>): SlotCoverage {
  const roleMap = slotRoleMap(slot, allRoles);
  const names = lineCrew(slot);
  const count = zbsCount(slot);
  const target = zbsTarget(slot.subNote);
  const warnings: string[] = [];
  if (slot.status === "Scheduled") {
    if (count === 0) {
      warnings.push("No crew assigned");
    } else {
      const hasLead = names.some((n) => {
        const category = roleCategory(roleOf(n, roleMap));
        return category === "mll" || category === "leader";
      });
      if (!hasLead) warnings.push("No MLL or Line Lead");
      if (target !== null && count < target) warnings.push(`Short ${target - count} (ZBS ${target})`);
    }
  }
  return { count, overtime: lineOvertime(slot), target, warnings, extras: extraCounts(slot) };
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
