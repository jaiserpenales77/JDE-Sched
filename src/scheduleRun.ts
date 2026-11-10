import type { ChangeoverCode, LineStatusPick, RunStatus, ScheduleLineSetup, ScheduleRunSettings, WorkOrder } from "./types";
import { RUN_STATUSES } from "./types";
import { changeoverInto, groupByLine, SHIFT_HOURS } from "./scheduleLogic";

// The printed Production Schedule's line setup, estimated times, changeover
// notes and washroom prep list - the same rules as the JDE Schedule
// workbook (its 3. Lines, 4. Schedule, 5. Settings and 7. Washroom tabs).

// ---- Lines ----

// A line's number, which is how it's matched everywhere: VPKL05, LINE05 and
// LINE 5 are the same line. A name with no number is matched by itself.
export function lineKey(line: string): string {
  const digits = line.match(/\d+/g);
  if (digits) return String(Number(digits[digits.length - 1]));
  return `N:${line.trim().replace(/\s+/g, " ").toUpperCase()}`;
}

export function lineNumber(line: string): number | null {
  const key = lineKey(line);
  return key.startsWith("N:") ? null : Number(key);
}

// Lines 8 and up run through breaks and lunch; the others stop for them
// (as on the workbook's 3. Lines). Changed per line in the Lines panel.
export function defaultBreaks(line: string): boolean {
  const n = lineNumber(line);
  return n === null || n < 8;
}

export function defaultLineSetup(line: string): ScheduleLineSetup {
  const n = lineNumber(line);
  return { name: n === null ? line.trim() : `LINE ${n}`, thisShift: "", nextShift: "", breaks: defaultBreaks(line), crew: null };
}

// The setup saved for a schedule line, else the defaults.
export function setupFor(lines: ScheduleLineSetup[], line: string): ScheduleLineSetup {
  const key = lineKey(line);
  return lines.find((l) => lineKey(l.name) === key) ?? defaultLineSetup(line);
}

// What a typed or saved status means ("ot", "Trial", "yes" ...).
export function readStatus(value: unknown): LineStatusPick {
  const s = String(value ?? "").trim().toUpperCase();
  if (!s) return "";
  if (s === "NONE" || s === "-") return "NONE";
  if (s.includes("PARTIAL")) return "PARTIAL SHIFT";
  if (s === "OT" || s === "TRIAL" || s.includes("OVERTIME")) return "OVERTIME";
  if (s.includes("NOT") || s === "OFF" || s === "NO" || s === "DOWN") return "NOT SCHEDULED";
  if (s.includes("READY")) return "READY LINE";
  if (s.startsWith("PM") || s.includes("CLEAN")) return "PM / CLEANING";
  if (s.includes("RUN") || s === "YES" || s === "Y" || s === "X") return "RUNNING";
  return (RUN_STATUSES as readonly string[]).includes(s) ? (s as RunStatus) : "";
}

// A line's status this shift: the one picked, else its file's Line Status
// (Ready, PM, OT), else NOT SCHEDULED. NONE = no status ("").
export function thisShiftStatus(setup: ScheduleLineSetup, rows: WorkOrder[]): RunStatus | "" {
  if (setup.thisShift === "NONE") return "";
  if (setup.thisShift) return setup.thisShift;
  if (rows.some((r) => r.lineStatus === "Ready")) return "READY LINE";
  if (rows.some((r) => r.lineStatus === "PM")) return "PM / CLEANING";
  if (rows.some((r) => r.lineStatus === "OT")) return "OVERTIME";
  return "NOT SCHEDULED";
}

// Next shift: the one picked, else NOT SCHEDULED; NONE = no status ("").
export function nextShiftStatus(setup: ScheduleLineSetup): RunStatus | "" {
  if (setup.nextShift === "NONE") return "";
  return setup.nextShift || "NOT SCHEDULED";
}

// Lines that get estimated times.
export function runsThisShift(status: RunStatus | ""): boolean {
  return status === "RUNNING" || status === "PARTIAL SHIFT" || status === "OVERTIME";
}

// ---- The time the schedule is from ----

// "2026-11-04T16:00" (local) as a Date; a date alone takes the time it is
// now; blank or unreadable = now.
export function scheduleAsOfDate(asOf: string, now: Date = new Date()): Date {
  const m = asOf.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?/);
  if (!m) return now;
  const [, y, mo, d, h, mi] = m;
  if (h === undefined) return new Date(+y, +mo - 1, +d, now.getHours(), now.getMinutes(), now.getSeconds());
  return new Date(+y, +mo - 1, +d, +h, +mi);
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// The value for Schedule as of = now ("2026-11-04T16:05").
export function asOfNow(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}T${p(now.getHours())}:${p(now.getMinutes())}`;
}

// When this shift ends: its start plus 8 hours, the next time that comes
// after Schedule as of. shiftStart is "HH:MM".
export function shiftEnd(asOf: Date, shiftStart: string): Date {
  const [h, m] = shiftStart.split(":").map(Number);
  const end = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate(), (h || 0) + SHIFT_HOURS, m || 0);
  // Back to the same calendar day as Schedule as of, then on to the next day if it's already past.
  while (end.getTime() - asOf.getTime() > 24 * 3600e3) end.setDate(end.getDate() - 1);
  if (end < asOf) end.setDate(end.getDate() + 1);
  return end;
}

const toMinute = (d: Date) => new Date(Math.round(d.getTime() / 60000) * 60000);

// "8:43 PM", to the nearest minute.
export function clockText(d: Date): string {
  const r = toMinute(d);
  const h = r.getHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(r.getMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

// "Today 8:43 PM" on the day of Schedule as of, "11/5 3:40 AM" on another.
export function whenText(d: Date, asOf: Date): string {
  const r = toMinute(d);
  return `${sameDay(r, asOf) ? "Today" : `${r.getMonth() + 1}/${r.getDate()}`} ${clockText(r)}`;
}

// The workbook's 5. Settings, as it comes.
export function defaultRunSettings(): ScheduleRunSettings {
  return {
    efficiency: 1,
    changeoverMinutes: { s1: 15, count: 15, s3: 40, s4: 45 },
    // The Line Lead MDI Router's Break (15 min) and Lunch (30 min) rates are
    // 86% and 57% of the full-hour rate.
    breakShare: 6 / 7,
    lunchShare: 4 / 7,
    cremerLines: "1, 5, 9, 10, 12",
    merrillLines: "3, 7, 8, 11",
    oilyWords: ["SG", "LSG", "S/G"],
  };
}

export function normalizeRunSettings(raw: unknown): ScheduleRunSettings {
  const d = defaultRunSettings();
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<ScheduleRunSettings>;
  const num = (v: unknown, fallback: number, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : fallback;
  const co = (r.changeoverMinutes ?? {}) as Partial<ScheduleRunSettings["changeoverMinutes"]>;
  return {
    efficiency: num(r.efficiency, d.efficiency, 0.05, 2),
    changeoverMinutes: {
      s1: num(co.s1, d.changeoverMinutes.s1, 0, 600),
      count: num(co.count, d.changeoverMinutes.count, 0, 600),
      s3: num(co.s3, d.changeoverMinutes.s3, 0, 600),
      s4: num(co.s4, d.changeoverMinutes.s4, 0, 600),
    },
    breakShare: num(r.breakShare, d.breakShare, 0, 1),
    lunchShare: num(r.lunchShare, d.lunchShare, 0, 1),
    cremerLines: typeof r.cremerLines === "string" ? r.cremerLines : d.cremerLines,
    merrillLines: typeof r.merrillLines === "string" ? r.merrillLines : d.merrillLines,
    oilyWords: Array.isArray(r.oilyWords) ? r.oilyWords.filter((w): w is string => typeof w === "string").slice(0, 12) : d.oilyWords,
  };
}

// The saved line setups, cleaned up. Before this setup existed, a line was
// ticked under Scheduled Lines to run: those lines start as RUNNING.
export function normalizeScheduleLines(raw: unknown, ticked: unknown): ScheduleLineSetup[] {
  if (!Array.isArray(raw)) {
    return (Array.isArray(ticked) ? ticked : [])
      .filter((l): l is string => typeof l === "string" && !!l.trim())
      .map((l) => ({ ...defaultLineSetup(l), thisShift: "RUNNING" as const }));
  }
  const seen = new Set<string>();
  const out: ScheduleLineSetup[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const s = item as Partial<ScheduleLineSetup>;
    const name = typeof s.name === "string" ? s.name.trim() : "";
    if (!name || seen.has(lineKey(name))) continue;
    seen.add(lineKey(name));
    out.push({
      name,
      thisShift: readStatus(s.thisShift),
      nextShift: readStatus(s.nextShift),
      breaks: typeof s.breaks === "boolean" ? s.breaks : defaultBreaks(name),
      crew: typeof s.crew === "number" && Number.isFinite(s.crew) && s.crew >= 0 ? Math.round(s.crew) : null,
    });
  }
  return out;
}

// ---- Estimated times ----

// Share of a full hour's bottles made in an hour of the shift (1-8).
function hourShare(hour: number, settings: ScheduleRunSettings, breakHours: number[], lunchHour: number): number {
  if (hour === lunchHour) return settings.lunchShare;
  if (breakHours.includes(hour)) return settings.breakShare;
  return 1;
}

export interface ShiftClock {
  start: string; // "HH:MM", this shift's start
  breakHours: number[];
  lunchHour: number;
}

// The time `hours` full hours of making bottles after `asOf` comes to: on a
// line that stops for breaks and lunch, those hours of the shift make only
// their share. (The workbook's shift clock, hour by hour, in 8-hour turns.)
export function addRunHours(asOf: Date, hours: number, breaks: boolean, clock: ShiftClock, settings: ScheduleRunSettings): Date {
  const at = (h: number) => new Date(asOf.getTime() + h * 3600e3);
  if (!breaks) return at(hours);
  const [sh, sm] = clock.start.split(":").map(Number);
  const startOfDay = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate(), sh || 0, sm || 0);
  const into = ((((asOf.getTime() - startOfDay.getTime()) / 3600e3) % SHIFT_HOURS) + SHIFT_HOURS) % SHIFT_HOURS;
  const hourNow = Math.floor(into) + 1;
  const leftOfHour = 1 - (into - Math.floor(into));
  const shareNow = hourShare(hourNow, settings, clock.breakHours, clock.lunchHour);
  const firstPart = leftOfHour * shareNow;
  if (hours - firstPart <= 0) return at(shareNow > 0 ? hours / shareNow : 0);
  const shares = Array.from({ length: SHIFT_HOURS }, (_, k) =>
    hourShare(((hourNow + k) % SHIFT_HOURS) + 1, settings, clock.breakHours, clock.lunchHour),
  );
  const totals = shares.reduce<number[]>((acc, s) => [...acc, acc[acc.length - 1] + s], [0]);
  const perShift = totals[SHIFT_HOURS];
  const rest = hours - firstPart;
  const turns = Math.max(0, Math.ceil(rest / perShift) - 1);
  const lastTurn = rest - turns * perShift;
  const hour = Math.min(SHIFT_HOURS, 1 + totals.slice(1).filter((t) => t < lastTurn).length);
  return at(leftOfHour + SHIFT_HOURS * turns + (hour - 1) + (lastTurn - totals[hour - 1]) / shares[hour - 1]);
}

export const CHANGEOVER_LABELS: Record<Exclude<ChangeoverCode, "">, string> = {
  S1: "Minor · S1",
  "S1 Count Change": "Minor · Count",
  S3: "MAJOR · S3",
  S4: "MAJOR · S4",
};

export function changeoverMinutes(code: ChangeoverCode, settings: ScheduleRunSettings): number | null {
  if (code === "S1") return settings.changeoverMinutes.s1;
  if (code === "S1 Count Change") return settings.changeoverMinutes.count;
  if (code === "S3") return settings.changeoverMinutes.s3;
  if (code === "S4") return settings.changeoverMinutes.s4;
  return null;
}

// Bottles a work order still has to make: WO Qty x (1 - % Complete), or its
// whole WO Qty with no % Complete.
export function bottlesToMake(wo: WorkOrder): number | null {
  if (wo.woQuantity === "") return null;
  const qty = Number(wo.woQuantity);
  const pct = wo.percentComplete === "" ? 0 : Number(wo.percentComplete);
  if (!Number.isFinite(qty)) return null;
  return pct ? Math.floor(qty * (1 - pct / 100) + 0.5) : qty;
}

export interface RowEstimate {
  // When the work order should be done (the line changes over then), or null.
  done: Date | null;
  // "no rate" / "no qty" / "—" when there's no time; "" on lines that don't run.
  missing: "" | "no rate" | "no qty" | "—";
}

// The estimated times down one line (rows in Seq order): from Schedule as
// of, each work order's changeover and then its bottles at the line's
// bottles per hour x the line efficiency. A row with no rate or quantity
// stops the times below it.
export function estimateLine(
  rows: WorkOrder[],
  rateOf: (wo: WorkOrder) => number | null,
  asOf: Date,
  breaks: boolean,
  clock: ShiftClock,
  settings: ScheduleRunSettings,
): RowEstimate[] {
  let hours = 0;
  let stopped = false;
  return rows.map((wo, i) => {
    const bottles = bottlesToMake(wo);
    const rate = rateOf(wo);
    if (!rate || !(rate > 0) || bottles === null) {
      stopped = true;
      return { done: null, missing: !rate || !(rate > 0) ? "no rate" : "no qty" };
    }
    // A row below one with no time can't have one either.
    if (stopped) return { done: null, missing: "—" };
    const co = i > 0 ? (changeoverMinutes(changeoverInto(rows, i), settings) ?? 0) : 0;
    hours += co / 60 + bottles / (rate * settings.efficiency);
    return { done: addRunHours(asOf, hours, breaks, clock, settings), missing: "" };
  });
}

// ---- What a row shows ----

// "▰▰▰▱▱▱▱▱▱▱  30%", or Not Started Yet.
export function progressText(wo: WorkOrder): string {
  const pct = wo.percentComplete === "" ? 0 : Number(wo.percentComplete);
  if (!pct) return "Not Started Yet";
  const filled = Math.max(0, Math.min(10, Math.round(pct / 10)));
  return `${"▰".repeat(filled)}${"▱".repeat(10 - filled)}  ${Math.round(pct)}%`;
}

// 32,900 bottles left -> "32.9k".
export function leftText(bottles: number | null): string {
  if (bottles === null) return "";
  if (bottles < 1000) return String(bottles);
  return `${Math.round(bottles / 100) / 10}k`;
}

// "CAP 45MM CRC WHITE" -> "45-CRC", as on the JDE printout. A cap that
// doesn't read that way is shown as it is.
export function capShort(cap: string): string {
  const text = cap.trim().replace(/\s+/g, " ");
  const at = text.toUpperCase().indexOf("MM");
  if (at < 0) return text;
  const size = text.slice(0, at).trim().split(" ").pop() ?? "";
  const type = text.slice(at + 2).trim().split(" ")[0] ?? "";
  if (!size || !type || !Number.isFinite(Number(size))) return text;
  return `${size}-${type}`;
}

const NONE_WORDS = ["N", "NO", "0", "-", "FALSE", "NONE"];

// The cotton a work order uses: "Yes" for Y / Yes / X, nothing for N or blank.
// A work order's cotton: its own Cotton box (from the file, or typed), else
// the Hub's cotton list for its FG item (`listed`). "Yes", the cotton it
// takes, or "" for none (a box with N / No / - means none, whatever the list
// says).
export function cottonOf(wo: WorkOrder, listed: string | null = null): string {
  const own = String(wo.cotton ?? "").trim();
  const v = own || (listed ?? "").trim();
  if (!v || NONE_WORDS.includes(v.toUpperCase())) return "";
  return ["Y", "YES", "X", "TRUE", "1"].includes(v.toUpperCase()) ? "Yes" : v;
}

// A work order's desiccant, the same way: its own DES box (from the file, or
// typed), else the Hub's desiccant list for its FG item (`listed`). "Yes",
// the desiccant it takes, or "" for none (N / No / - in the box means none,
// whatever the list says).
export function desiccantOf(wo: WorkOrder, listed: string | null = null): string {
  const own = String(wo.desiccant ?? "").trim();
  const v = own || (listed ?? "").trim();
  if (!v || NONE_WORDS.includes(v.toUpperCase())) return "";
  return ["Y", "YES", "X", "TRUE", "1"].includes(v.toUpperCase()) ? "Yes" : v;
}

const sameText = (a: string, b: string) => a.trim().replace(/\s+/g, " ").toUpperCase() === b.trim().replace(/\s+/g, " ").toUpperCase();

// International: as marked for its item (once the item list says), else
// INTL or INTERNATIONAL in its description.
export function isInternational(wo: WorkOrder, marked?: boolean | null): boolean {
  if (marked !== undefined && marked !== null) return marked;
  return /(^|\s)(INTL|INTERNATIONAL)(\s|$)/i.test(wo.description);
}

export function isDumping(wo: WorkOrder): boolean {
  return wo.bulkItem === "A662" || wo.bulkItem === "A624";
}

// What the changeover into rows[i] changes from the work order before it:
// "Cap & Bottle Change, Add Cotton, Dumping, Prepare For INTERNATIONAL WO".
// cottonListed / desiccantListed: the Hub's cotton or desiccant for an FG
// item, if it lists it. merrill: the line has a Merrill filler, where an S1
// count change also needs the filler's slate set up.
export function changeoverNotes(
  rows: WorkOrder[],
  i: number,
  intl: boolean,
  cottonListed?: (item: string) => string | null,
  desiccantListed?: (item: string) => string | null,
  merrill = false,
): string {
  if (i <= 0) return "";
  const before = rows[i - 1];
  const wo = rows[i];
  const parts: string[] = [];
  const cap = !!before.capDescription.trim() && !!wo.capDescription.trim() && !sameText(before.capDescription, wo.capDescription);
  const count = changeoverInto(rows, i) === "S1 Count Change";
  const bottle = !!before.bottleSize && !!wo.bottleSize && before.bottleSize !== wo.bottleSize;
  const changes = [cap && "Cap", count && "Count", bottle && "Bottle"].filter(Boolean) as string[];
  if (changes.length) parts.push(`${changes.length === 3 ? `${changes[0]}, ${changes[1]} & ${changes[2]}` : changes.join(" & ")} Change`);
  if (count && merrill) parts.push("Filler Slate Setup");
  const cot = cottonOf(wo, cottonListed?.(wo.item) ?? null);
  const cotBefore = cottonOf(before, cottonListed?.(before.item) ?? null);
  if (cot && !cotBefore) parts.push(`Add Cotton${cot === "Yes" ? "" : ` (${cot})`}`);
  else if (cot && cot.toUpperCase() !== cotBefore.toUpperCase()) parts.push(`Change Cotton (${cot})`);
  else if (!cot && cotBefore) parts.push("Remove Cotton");
  const des = desiccantOf(wo, desiccantListed?.(wo.item) ?? null);
  const desBefore = desiccantOf(before, desiccantListed?.(before.item) ?? null);
  if (des && !desBefore) parts.push("Add Desiccant");
  else if (des && des.toUpperCase() !== desBefore.toUpperCase()) parts.push("Change Desiccant");
  else if (!des && desBefore) parts.push("Remove Desiccant");
  if (isDumping(wo)) parts.push("Dumping");
  if (intl) parts.push("Prepare For INTERNATIONAL WO");
  return parts.join(", ");
}

// ---- The whole schedule ----

export interface ScheduleRow {
  wo: WorkOrder;
  first: boolean;
  code: ChangeoverCode;
  intl: boolean;
  capChanged: boolean;
  countChanged: boolean;
  estimate: RowEstimate;
  // When the changeover into this work order starts (the one before it is done).
  changeoverAt: Date | null;
  // Shown under the row, for changeovers that start before the end of the shift.
  notes: string;
  // Its cotton ("Yes", the cotton it takes, or "" for none): its own Cotton
  // box, else the Hub's cotton list.
  cotton: string;
  // Its desiccant, the same way: its own DES box, else the Hub's list.
  desiccant: string;
}

export interface ScheduleLine {
  line: string;
  setup: ScheduleLineSetup;
  name: string;
  status: RunStatus | "";
  next: RunStatus | "";
  runs: boolean;
  rows: ScheduleRow[];
}

export interface ScheduleRunInput {
  workOrders: WorkOrder[];
  lines: ScheduleLineSetup[];
  asOf: Date;
  clock: ShiftClock;
  settings: ScheduleRunSettings;
  rateOf: (line: string, item: string) => number | null;
  // From the item list, once there is one: International (true) / Domestic (false).
  internationalOf?: (item: string) => boolean | null;
  // The Hub's cotton list: the cotton an FG item takes ("Yes" or its type), or null.
  cottonListed?: (item: string) => string | null;
  // The Hub's desiccant list, the same way.
  desiccantListed?: (item: string) => string | null;
}

export function buildSchedule(input: ScheduleRunInput): { lines: ScheduleLine[]; end: Date } {
  const end = shiftEnd(input.asOf, input.clock.start);
  const merrillLines = lineNumbersIn(input.settings.merrillLines);
  const lines = groupByLine(input.workOrders).map(({ line, rows }) => {
    const setup = setupFor(input.lines, line);
    const n = lineNumber(line);
    const merrill = n !== null && merrillLines.includes(n);
    const status = thisShiftStatus(setup, rows);
    const runs = runsThisShift(status);
    const estimates = runs
      ? estimateLine(rows, (wo) => input.rateOf(line, wo.item), input.asOf, setup.breaks, input.clock, input.settings)
      : rows.map(() => ({ done: null, missing: "" as const }));
    const out: ScheduleRow[] = rows.map((wo, i) => {
      const intl = isInternational(wo, input.internationalOf?.(wo.item));
      const changeoverAt = i > 0 ? estimates[i - 1].done : null;
      const code = changeoverInto(rows, i);
      return {
        wo,
        first: i === 0,
        code,
        intl,
        capChanged: i > 0 && !!rows[i - 1].capDescription.trim() && !!wo.capDescription.trim() && !sameText(rows[i - 1].capDescription, wo.capDescription),
        countChanged: code === "S1 Count Change",
        estimate: estimates[i],
        changeoverAt,
        notes:
          changeoverAt && changeoverAt < end
            ? changeoverNotes(rows, i, intl, input.cottonListed, input.desiccantListed, merrill)
            : "",
        cotton: cottonOf(wo, input.cottonListed?.(wo.item) ?? null),
        desiccant: desiccantOf(wo, input.desiccantListed?.(wo.item) ?? null),
      };
    });
    return { line, setup, name: setup.name || line, status, next: nextShiftStatus(setup), runs, rows: out };
  });
  return { lines, end };
}

// The summary under the title: lines by status, the changeovers on running
// lines from Schedule as of to the end of the shift, and the next one.
export function scheduleSummary(lines: ScheduleLine[], asOf: Date, end: Date) {
  const byStatus = new Map<string, number>();
  for (const l of lines) if (l.status) byStatus.set(l.status, (byStatus.get(l.status) ?? 0) + 1);
  let minor = 0;
  let major = 0;
  let next: { line: string; at: Date } | null = null;
  for (const l of lines) {
    for (const r of l.rows) {
      if (r.changeoverAt && r.changeoverAt >= asOf && r.changeoverAt < end) {
        if (r.code === "S1" || r.code === "S1 Count Change") minor++;
        if (r.code === "S3" || r.code === "S4") major++;
      }
    }
    const firstDone = l.rows.length > 1 ? l.rows[0].estimate.done : null;
    if (firstDone && (!next || firstDone < next.at)) next = { line: l.name, at: firstDone };
  }
  const words: [RunStatus, string][] = [
    ["RUNNING", "running"],
    ["PARTIAL SHIFT", "partial shift"],
    ["OVERTIME", "overtime"],
    ["READY LINE", "ready"],
    ["PM / CLEANING", "PM / cleaning"],
    ["NOT SCHEDULED", "not scheduled"],
  ];
  const parts = [`${lines.length} lines`, ...words.filter(([s]) => byStatus.get(s)).map(([s, w]) => `${byStatus.get(s)} ${w}`)];
  return { text: parts.join(" · "), minor, major, next };
}

// ---- Washroom prep list ----

// The words that make an item oily (a softgel): whole words, any case.
export function isOily(description: string, words: string[]): boolean {
  const text = ` ${description.toUpperCase().replace(/\s+/g, " ")} `;
  return words.some((w) => w.trim() && text.includes(` ${w.trim().toUpperCase()} `));
}

export function lineNumbersIn(list: string): number[] {
  return list
    .split(/[,;\s]+/)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export interface WashroomRow {
  at: Date;
  line: string;
  filler: "Cremer" | "Merrill" | "";
  code: ChangeoverCode;
  minutes: number | null;
  off: WorkOrder;
  offType: "Oily" | "Powdery";
  offAllergen: string;
  next: WorkOrder;
  nextType: "Oily" | "Powdery";
}

// Every changeover expected from Schedule as of to the end of the shift,
// first to last: what comes off the line to be washed and what goes on.
export function washroomList(
  lines: ScheduleLine[],
  asOf: Date,
  end: Date,
  settings: ScheduleRunSettings,
  oilyOf?: (item: string) => boolean | null,
): WashroomRow[] {
  const cremer = lineNumbersIn(settings.cremerLines);
  const merrill = lineNumbersIn(settings.merrillLines);
  const type = (wo: WorkOrder): "Oily" | "Powdery" => {
    const marked = oilyOf?.(wo.item);
    const oily = marked === undefined || marked === null ? isOily(wo.description, settings.oilyWords) : marked;
    return oily ? "Oily" : "Powdery";
  };
  const out: WashroomRow[] = [];
  for (const l of lines) {
    const n = lineNumber(l.line);
    const filler = n !== null && cremer.includes(n) ? "Cremer" : n !== null && merrill.includes(n) ? "Merrill" : "";
    l.rows.forEach((r, i) => {
      if (i === 0 || !r.changeoverAt || r.changeoverAt < asOf || r.changeoverAt >= end || !r.code) return;
      const off = l.rows[i - 1].wo;
      const allergen = off.allergen.trim();
      out.push({
        at: r.changeoverAt,
        line: l.name,
        filler,
        code: r.code,
        minutes: changeoverMinutes(r.code, settings),
        off,
        offType: type(off),
        offAllergen: allergen && allergen.toUpperCase() !== "N" ? allergen : "",
        next: r.wo,
        nextType: type(r.wo),
      });
    });
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

// ---- The printout's CHECK and the other designs ----

// The red CHECK the printout shows in place of its summary, as on the
// workbook: until Schedule as of is today, the statuses may be yesterday's,
// so they never print by mistake; and a WO on two rows is usually
// yesterday's schedule left in. A 3rd shift that crosses midnight stays
// fine for 12 hours.
export function scheduleCheck(asOfRaw: string, asOf: Date, now: Date, workOrders: WorkOrder[]): string {
  if (!asOfRaw.trim()) return "CHECK: Schedule as of isn't set - check each line's status, then click Set to now";
  const age = now.getTime() - asOf.getTime();
  if (!sameDay(asOf, now) && !(age >= 0 && age < 12 * 3600e3)) {
    return "CHECK: Line statuses not dated today - check each line's status, then click Set to now";
  }
  const seen = new Set<string>();
  for (const wo of workOrders) {
    const key = wo.wo.trim().toUpperCase();
    if (!key) continue;
    if (seen.has(key)) return `CHECK: WO ${wo.wo.trim()} is on two rows`;
    seen.add(key);
  }
  return "";
}

// The other designs' READY / PM / OT tag for a line's status.
export function fileLineStatus(status: RunStatus | ""): "Ready" | "PM" | "OT" | "" {
  if (status === "READY LINE") return "Ready";
  if (status === "PM / CLEANING") return "PM";
  if (status === "OVERTIME") return "OT";
  return "";
}

// ---- QA sheets ----

// An allergen code that counts ("" for none: blank or N).
// The work orders with the Hub's allergen filled in where a work order's
// own Allergen box is empty (a box with anything in it, N included, wins).
// For the schedule and printouts; the saved work orders don't change.
export function withListedAllergen(workOrders: WorkOrder[], listed: (item: string) => string | null): WorkOrder[] {
  return workOrders.map((wo) => {
    if (String(wo.allergen ?? "").trim()) return wo;
    const code = (listed(wo.item) ?? "").trim();
    return code ? { ...wo, allergen: code } : wo;
  });
}

export function allergenOf(wo: WorkOrder): string {
  const a = wo.allergen.trim().toUpperCase();
  return a && a !== "N" ? a : "";
}

export interface QaChangeoverRow {
  at: Date;
  line: string;
  code: ChangeoverCode;
  // S3 / S4: a full line clearance.
  major: boolean;
  off: WorkOrder;
  next: WorkOrder;
  // The components that change, to check one by one.
  checks: string[];
  sameItem: boolean;
  // The allergen coming off and going on ("" for none); the allergen test is
  // required when one comes off and the next work order doesn't have it.
  offAllergen: string;
  nextAllergen: string;
  allergenTestRequired: boolean;
  international: boolean;
}

const changed = (a: string, b: string) => !!a.trim() && !!b.trim() && !sameText(a, b);

// What QA checks at a changeover: each component that changes.
export function qaChecks(
  off: WorkOrder,
  next: WorkOrder,
  cotton: { off: string; next: string },
  intl: boolean,
  oily: { off: boolean; next: boolean },
  desiccant: { off: string; next: string } = { off: desiccantOf(off), next: desiccantOf(next) },
): string[] {
  const out: string[] = [];
  if (changed(off.item, next.item)) out.push(`Item / label ${off.item.trim()} → ${next.item.trim()}`);
  if (changed(off.bulkItem, next.bulkItem)) out.push(`Bulk ${off.bulkItem.trim()} → ${next.bulkItem.trim()}`);
  if (changed(off.capDescription, next.capDescription)) out.push(`Cap ${capShort(off.capDescription)} → ${capShort(next.capDescription)}`);
  if (changed(String(off.bottleSize), String(next.bottleSize))) out.push(`Bottle ${off.bottleSize} → ${next.bottleSize}`);
  if (changed(String(off.count), String(next.count))) out.push(`Count ${off.count} → ${next.count}`);
  const dOff = desiccant.off;
  const dNext = desiccant.next;
  if (dNext && !dOff) out.push(`Desiccant: add${dNext === "Yes" ? "" : ` ${dNext}`}`);
  else if (!dNext && dOff) out.push(`Desiccant: remove${dOff === "Yes" ? "" : ` ${dOff}`}`);
  else if (dNext && !sameText(dOff, dNext)) out.push(`Desiccant ${dOff} → ${dNext}`);
  if (cotton.next && !cotton.off) out.push(`Cotton: add${cotton.next === "Yes" ? "" : ` ${cotton.next}`}`);
  else if (!cotton.next && cotton.off) out.push("Cotton: remove");
  else if (cotton.next && !sameText(cotton.off, cotton.next)) out.push(`Cotton → ${cotton.next}`);
  if (isDumping(next)) out.push(`Dumping (bulk ${next.bulkItem.trim()})`);
  if (intl) out.push("International WO: labels");
  if (oily.off !== oily.next) out.push(`Parts: ${oily.off ? "oily" : "powdery"} → ${oily.next ? "oily" : "powdery"}`);
  return out;
}

// Every changeover from Schedule as of to the end of the shift, first to
// last, with what QA checks there.
export function qaChangeoverList(
  lines: ScheduleLine[],
  asOf: Date,
  end: Date,
  settings: ScheduleRunSettings,
  oilyOf?: (item: string) => boolean | null,
): QaChangeoverRow[] {
  const oily = (wo: WorkOrder) => {
    const marked = oilyOf?.(wo.item);
    return marked === undefined || marked === null ? isOily(wo.description, settings.oilyWords) : marked;
  };
  const out: QaChangeoverRow[] = [];
  for (const l of lines) {
    l.rows.forEach((r, i) => {
      if (i === 0 || !r.changeoverAt || r.changeoverAt < asOf || r.changeoverAt >= end || !r.code) return;
      const before = l.rows[i - 1];
      const offAllergen = allergenOf(before.wo);
      const nextAllergen = allergenOf(r.wo);
      out.push({
        at: r.changeoverAt,
        line: l.name,
        code: r.code,
        major: r.code === "S3" || r.code === "S4",
        off: before.wo,
        next: r.wo,
        checks: qaChecks(
          before.wo,
          r.wo,
          { off: before.cotton, next: r.cotton },
          r.intl,
          { off: oily(before.wo), next: oily(r.wo) },
          { off: before.desiccant, next: r.desiccant },
        ),
        sameItem: !changed(before.wo.item, r.wo.item),
        offAllergen,
        nextAllergen,
        allergenTestRequired: !!offAllergen && offAllergen !== nextAllergen,
        international: r.intl,
      });
    });
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

export interface QaWalkLine {
  name: string;
  status: RunStatus | "";
  // The work order on the line now, and what should be on the line for it
  // (null for a line that isn't running).
  wo: WorkOrder | null;
  components: { label: string; value: string; flag?: boolean }[];
  // The next changeover on the line, if one is expected.
  nextChangeover: { at: Date; code: ChangeoverCode } | null;
}

// The quality checks on each round of the Gemba walk.
export const QA_QUALITY_CHECKS = ["Product looks right", "Label & lot correct", "Cap on & sealed"];
export const QA_WALK_ROUNDS = 3;

// Each line for the Gemba walk: running lines first (with their work order
// running now and its components), then the lines that aren't running.
export function qaWalkLines(lines: ScheduleLine[]): QaWalkLine[] {
  const running: QaWalkLine[] = [];
  const idle: QaWalkLine[] = [];
  for (const l of lines) {
    const first = l.rows[0];
    if (!l.runs || !first) {
      idle.push({ name: l.name, status: l.status, wo: null, components: [], nextChangeover: null });
      continue;
    }
    const wo = first.wo;
    const allergen = allergenOf(wo);
    const components = [
      { label: "Item", value: wo.item.trim() || "—" },
      { label: "Bulk", value: wo.bulkItem.trim() || "—" },
      { label: "Count", value: String(wo.count).trim() || "—" },
      { label: "Bottle", value: String(wo.bottleSize).trim() || "—" },
      { label: "Cap", value: capShort(wo.capDescription) || "—" },
      ...(allergen ? [{ label: "Allergen", value: allergen, flag: true }] : []),
      // Desiccant and cotton only when the work order has them.
      ...(first.desiccant ? [{ label: "Desiccant", value: first.desiccant }] : []),
      ...(first.cotton ? [{ label: "Cotton", value: first.cotton }] : []),
    ];
    const second = l.rows[1];
    running.push({
      name: l.name,
      status: l.status,
      wo,
      components,
      nextChangeover: second?.changeoverAt ? { at: second.changeoverAt, code: second.code } : null,
    });
  }
  return [...running, ...idle];
}
