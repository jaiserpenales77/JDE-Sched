import type { ChangeoverCode, WorkOrder } from "./types";

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

// Changeover code between a row and the NEXT row on the same production
// line: compares Bottle Size, Bulk Item and Count to flag how much
// changeover work is needed transitioning between the two work orders.
export function changeoverCode(current: WorkOrder, next: WorkOrder | undefined): ChangeoverCode {
  if (!next) return "";
  if (!current.bottleSize || !next.bottleSize) return "";
  if (current.line.trim() !== next.line.trim()) return "";
  if (current.bottleSize !== next.bottleSize) return "S4";
  if (current.bulkItem !== next.bulkItem) return "S3";
  if (current.count !== next.count) return "S1 Count Change";
  return "S1";
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

// A line's label is colored when ANY of its rows carries that Line Status.
export function lineStatusClass(rows: WorkOrder[]): string {
  if (rows.some((r) => r.lineStatus === "Ready")) return "line-ready";
  if (rows.some((r) => r.lineStatus === "PM")) return "line-pm";
  if (rows.some((r) => r.lineStatus === "Trial")) return "line-trial";
  return "";
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
