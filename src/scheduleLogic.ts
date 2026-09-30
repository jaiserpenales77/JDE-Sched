import type { ChangeoverCode, WorkOrder } from "./types";

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

// Groups work orders by production line, preserving each line's first
// appearance order and each row's insertion order within its line -
// replaces the manual "Add Line Dividers" macro from the spreadsheet.
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
  return order.map((line) => ({ line, rows: groups.get(line)! }));
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
