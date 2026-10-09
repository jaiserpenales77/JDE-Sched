import type { ChangeoverClock, ChangeoverCode, ShiftKey, WorkOrder } from "./types";

// Print-table column keys, in on-screen order - drives the resizable
// <colgroup>, which column a resize handle borrows width from/gives
// width to (its immediate neighbor to the right), and the "hide column"
// checkboxes in the print preview.
export const SCHEDULE_COLUMN_KEYS = [
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
export type ScheduleColumnKey = (typeof SCHEDULE_COLUMN_KEYS)[number];

// The printed schedule's columns in the saved order. LINE always comes
// first (it holds the line name and its READY / PM / OT tag); unknown keys
// are dropped and any column missing from the saved order (e.g. one added
// in a later version) goes back in its standard place at the end.
export function orderedScheduleColumns(order: readonly string[] = []): ScheduleColumnKey[] {
  const known = new Set<string>(SCHEDULE_COLUMN_KEYS);
  const saved = order.filter((k, i): k is ScheduleColumnKey => known.has(k) && k !== "line" && order.indexOf(k) === i);
  const rest = SCHEDULE_COLUMN_KEYS.filter((k) => k !== "line" && !saved.includes(k));
  return ["line", ...saved, ...rest];
}

export const SCHEDULE_COLUMN_LABELS: Record<ScheduleColumnKey, string> = {
  line: "LINE",
  wo: "WO",
  seq: "SEQ",
  item: "ITEM",
  description: "PRODUCT DESCRIPTION",
  count: "Count",
  bulkItem: "Bulk Item",
  bottleSize: "Bottle Size",
  capDescription: "CAP DESCRIPTION",
  allergen: "Allergen",
  remarks: "REMARKS",
  woQuantity: "WO Quantity",
  percentComplete: "% Complete",
  desiccant: "Desiccant",
  percentActual: "% Actual Complete",
  bottlesRemaining: "Bottles Remaining",
  changeover: "CHANGEOVER",
};

// Seq order: numbers compare as numbers (so 6.5 sits between 6 and 7);
// anything else compares as text, numbers-aware.
function compareSeq(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a.localeCompare(b, undefined, { numeric: true });
}

// A line's work orders in Seq order, however they were imported or
// entered. A row with no Seq yet (just added) stays right after the row
// it was added below; rows with the same Seq keep their saved order.
export function sortBySeq(rows: WorkOrder[]): WorkOrder[] {
  let anchor = "";
  return rows
    .map((row, index) => {
      const seq = String(row.seq ?? "").trim();
      if (seq) anchor = seq;
      return { row, index, key: seq || anchor };
    })
    .sort((a, b) => compareSeq(a.key, b.key) || a.index - b.index)
    .map((r) => r.row);
}

// Groups work orders by production line, preserving each line's first
// appearance order, with each line's rows in Seq order - replaces the
// manual "Add Line Dividers" macro from the spreadsheet.
export function groupByLine(workOrders: WorkOrder[]): { line: string; rows: WorkOrder[] }[] {
  const order: string[] = [];
  const groups = new Map<string, WorkOrder[]>();
  for (const wo of workOrders) {
    const key = wo.line.trim() || "(unassigned)";
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(wo);
  }
  return order.map((line) => ({ line, rows: sortBySeq(groups.get(line)!) }));
}

// % Actual Complete: blank when % Complete is 0 or blank (matches the
// original "=IFERROR(IF(M=0,"",M/100),"")" formula).
export function percentActual(wo: WorkOrder): number | "" {
  const m = wo.percentComplete;
  if (m === "" || Number(m) === 0) return "";
  return Number(m) / 100;
}

// Bottles Remaining = WO Quantity * (1 - % Actual Complete).
export function bottlesRemaining(wo: WorkOrder): number | "" {
  const pa = percentActual(wo);
  if (pa === "" || wo.woQuantity === "") return "";
  return Math.round(Number(wo.woQuantity) * (1 - Number(pa)));
}

// Changeover code between two consecutive work orders on the same
// production line: compares Bottle Size, Bulk Item and Count to flag how
// much changeover work is needed going from one to the next.
export function changeoverCode(current: WorkOrder, next: WorkOrder | undefined): ChangeoverCode {
  if (!next) return "";
  if (!current.bottleSize || !next.bottleSize) return "";
  if (current.line.trim() !== next.line.trim()) return "";
  if (current.bottleSize !== next.bottleSize) return "S4";
  if (current.bulkItem !== next.bulkItem) return "S3";
  if (current.count !== next.count) return "S1 Count Change";
  return "S1";
}

// The changeover a work order starts with: the change from the work order
// before it on the same line. That's the row the changeover actually
// happens on, so it's the row the code is shown on; a line's first work
// order has none.
export function changeoverInto(rows: WorkOrder[], idx: number): ChangeoverCode {
  return idx > 0 ? changeoverCode(rows[idx - 1], rows[idx]) : "";
}

export function isAllergenRow(wo: WorkOrder): boolean {
  const j = wo.allergen.trim();
  return j !== "" && j.toUpperCase() !== "N";
}

export function isOilRow(wo: WorkOrder): boolean {
  return wo.description.toLowerCase().includes("oil");
}

export function isBulkHighlightRow(wo: WorkOrder): boolean {
  return wo.bulkItem === "A662" || wo.bulkItem === "A624";
}

// Highlight priority per the original workbook's legend: allergen > oil > bulk item.
export function rowHighlightClass(wo: WorkOrder): string {
  if (isAllergenRow(wo)) return "hl-allergen";
  if (isOilRow(wo)) return "hl-oil";
  if (isBulkHighlightRow(wo)) return "hl-bulk";
  return "";
}

// A work order's Line Status in its standard spelling. "Trial" was
// replaced by "OT", so older data and spreadsheets that say Trial read as
// OT; anything unrecognized is kept as typed.
export function normalizeLineStatus(value: unknown): string {
  const s = String(value ?? "").trim();
  const key = s.toUpperCase();
  if (key === "READY") return "Ready";
  if (key === "PM") return "PM";
  if (key === "OT" || key === "OVERTIME" || key === "TRIAL") return "OT";
  return s;
}

// A whole line takes a status when ANY of its rows carries it (Ready
// first, then PM, then OT).
export function lineStatusLabel(rows: WorkOrder[]): "Ready" | "PM" | "OT" | "" {
  for (const status of ["Ready", "PM", "OT"] as const) {
    if (rows.some((r) => r.lineStatus === status)) return status;
  }
  return "";
}

// A line's label is colored when ANY of its rows carries that Line Status.
export function lineStatusClass(rows: WorkOrder[]): string {
  const status = lineStatusLabel(rows);
  return status ? `line-${status.toLowerCase()}` : "";
}

export function newBlankWorkOrder(line: string): WorkOrder {
  return {
    id: crypto.randomUUID(),
    line,
    wo: "",
    seq: "",
    item: "",
    description: "",
    count: "",
    bulkItem: "",
    bottleSize: "",
    capDescription: "",
    allergen: "",
    remarks: "",
    woQuantity: "",
    percentComplete: "",
    lineStatus: "",
    desiccant: "",
  };
}

// ---- Estimated changeover time ----
// A line's running work order (its first, in Seq order) finishes when its
// bottles remaining have been made, hour by hour from the shift's start at
// the line's rate for that FG item: the Full Hour rate, or the Lunch or
// Break rate in the hours that have them (from the Packaging Lead Hub's
// Line Rates). That's when the line changes over to its next work order.

export const SHIFT_HOURS = 8;
// Used until a shift sets its own start time.
export const DEFAULT_SHIFT_START: Record<ShiftKey, string> = { "1st": "07:15", "2nd": "15:15", "3rd": "23:15" };

// Bottles made in a full hour, an hour with lunch and an hour with a break.
// Lunch / break are null for a line that runs through them.
export interface LineRate {
  fullHour: number;
  lunch: number | null;
  break: number | null;
}
// Keyed "LINE|FG ITEM", as the Hub stores them.
export type LineRates = Record<string, LineRate>;

const normLine = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();
// VPKL12 -> 12.
const lineNumber = (s: string) => {
  const digits = s.match(/\d+/g);
  return digits ? Number(digits[digits.length - 1]) : null;
};
// A Hub line written as just a number: "12" or "Line 12" -> 12.
const bareLineNumber = (s: string) => {
  const t = s.replace(/^LINE\s*/i, "").trim();
  return /^\d+$/.test(t) ? Number(t) : null;
};

// The rate for a line and FG item. The Hub's line may be written as the
// line's full name ("VPKL12") or just its number ("12", "Line 12").
export function findLineRate(rates: LineRates, line: string, item: string): LineRate | null {
  const fg = item.trim().toUpperCase();
  if (!fg) return null;
  const exact = rates[`${normLine(line)}|${fg}`];
  if (exact) return exact;
  const num = lineNumber(line);
  if (num === null) return null;
  for (const [key, rate] of Object.entries(rates)) {
    const [rateLine, rateItem] = key.split("|");
    if (rateItem === fg && bareLineNumber(rateLine) === num) return rate;
  }
  return null;
}

export function parseClock(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

// "8:29 AM" for a time in minutes after midnight (may run into the next day).
export function formatClock(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m % 60).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
}

// Minutes after midnight when `remaining` bottles are done. Past the end of
// the shift it carries on in full hours.
export function estimateFinish(remaining: number, rate: LineRate, clock: ChangeoverClock): number | null {
  if (!(rate.fullHour > 0) || !(remaining >= 0)) return null;
  let left = remaining;
  let t = parseClock(clock.start);
  for (let hour = 1; hour <= 24 * 7; hour++) {
    const inShift = hour <= SHIFT_HOURS;
    const perHour =
      inShift && hour === clock.lunchHour
        ? (rate.lunch ?? rate.fullHour)
        : inShift && clock.breakHours.includes(hour)
          ? (rate.break ?? rate.fullHour)
          : rate.fullHour;
    if (left <= perHour) return perHour > 0 ? t + (left / perHour) * 60 : t;
    left -= perHour;
    t += 60;
  }
  return null;
}

// "8:29 AM" for each line whose running work order has a % Complete and a
// stored rate; lines without one are left out.
export function changeoverEstimates(
  workOrders: WorkOrder[],
  rates: LineRates,
  clock: ChangeoverClock,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { line, rows } of groupByLine(workOrders)) {
    const first = rows[0];
    const remaining = first ? bottlesRemaining(first) : "";
    if (remaining === "") continue;
    const rate = findLineRate(rates, line, first.item);
    const at = rate ? estimateFinish(remaining, rate, clock) : null;
    if (at !== null) out[line] = formatClock(at);
  }
  return out;
}
