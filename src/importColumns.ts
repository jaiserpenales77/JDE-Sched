import type { WorkOrder } from "./types";
import { normalizeLineStatus } from "./scheduleLogic";

// Reads a production schedule out of any spreadsheet layout. Exports from
// different places name the same column differently ("WO", "WO#", "Order
// Number", ...), so every column is matched to a schedule field by, in
// order: what the user picked for that column title last time, known
// names, looser "the title contains ..." rules, and finally - for Line and
// WO only - what the values in the column look like. The user sees every
// guess before importing and can change any of them.

export const IMPORT_FIELDS = [
  { key: "line", label: "Line", required: true },
  { key: "wo", label: "WO #", required: true },
  { key: "seq", label: "Seq" },
  { key: "item", label: "Item" },
  { key: "desc", label: "Product Description" },
  { key: "count", label: "Count" },
  { key: "bulk", label: "Bulk Item" },
  { key: "bottle", label: "Bottle Size" },
  { key: "cap", label: "Cap Description" },
  { key: "allergen", label: "Allergen" },
  { key: "remarks", label: "Remarks" },
  { key: "qty", label: "WO Qty" },
  { key: "pct", label: "% Complete" },
  { key: "status", label: "Line Status" },
  { key: "desiccant", label: "Desiccant" },
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number]["key"];
// One entry per spreadsheet column: the field it goes into, or "" to skip it.
export type ColumnMapping = (ImportField | "")[];

export interface SheetGrid {
  name: string;
  grid: unknown[][];
}

// Column titles are compared on letters and digits only, so "WO#", "W.O."
// and "wo" are all "WO".
export function normalizeHeader(text: unknown): string {
  return String(text ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

// Titles that definitely mean this field (already normalized).
const EXACT: Record<ImportField, string[]> = {
  line: ["LINE", "WORKCENTER", "WC", "LINENUMBER", "LINENO", "PRODUCTIONLINE", "LINEID"],
  wo: ["WO", "WONUMBER", "WONO", "WORKORDER", "WORKORDERNUMBER", "WORKORDERNO", "ORDERNUMBER", "ORDERNO", "ORDER"],
  seq: ["SEQ", "SEQUENCE", "SEQUENCENUMBER", "SEQNO", "SEQNUMBER", "STEP", "OPSEQ", "OPERATIONSEQ"],
  item: ["ITEM", "ITEMNUMBER", "ITEMNO", "2NDITEMNUMBER", "SKU", "PART", "PARTNO", "PARTNUMBER"],
  desc: ["PRODUCTDESCRIPTION", "DESCRIPTION", "2NDITEMNUMBERDESCRIPTION", "ITEMDESCRIPTION", "PRODUCT", "PRODUCTNAME"],
  count: ["COUNT", "BOTTLECOUNT", "BOTTLECT", "BTLCT", "BTLCOUNT", "CT", "CNT"],
  bulk: ["BULKITEM", "BULK", "BULKITEMNUMBER"],
  bottle: ["BOTTLESIZE", "BTLSIZE", "BOTTLE", "SIZE"],
  cap: ["CAPDESCRIPTION", "CAP", "CLOSURE"],
  allergen: ["ALLERGEN", "ALLERGENCODE", "ALLERGENS"],
  remarks: ["REMARKS", "REMARK", "NOTES", "NOTE", "COMMENTS", "COMMENT"],
  qty: ["WOQUANTITY", "QUANTITY", "QTY", "WOQTY", "BATCHQUANTITY", "ORDERQUANTITY", "ORDERQTY"],
  pct: ["COMPLETE", "PERCENTCOMPLETE", "PCTCOMPLETE", "WOCOMPLETED", "COMPLETED"],
  status: ["LINESTATUS", "STATUS"],
  desiccant: ["DESICCANT", "DESICCANTS", "DESICCANTNUMBER", "DESICCANTSNUMBER"],
};

// Looser rules for titles that aren't in the lists above.
const CONTAINS: Partial<Record<ImportField, (h: string) => boolean>> = {
  line: (h) => h.includes("WORKCENTER") || (h.startsWith("LINE") && !h.includes("STATUS")),
  wo: (h) => h.includes("WORKORDER") || (h.startsWith("WO") && (h.includes("NUM") || h.endsWith("NO"))),
  seq: (h) => h.startsWith("SEQ"),
  item: (h) => h.startsWith("ITEM") && !h.includes("DESC"),
  desc: (h) => h.includes("DESC") && !h.includes("CAP"),
  bulk: (h) => h.includes("BULK"),
  count: (h) => h.endsWith("COUNT") || h.endsWith("CT"),
  bottle: (h) => h.includes("SIZE"),
  cap: (h) => h.startsWith("CAP"),
  allergen: (h) => h.includes("ALLERG"),
  remarks: (h) => h.includes("REMARK") || h.includes("COMMENT"),
  qty: (h) => h.includes("QTY") || h.includes("QUANTITY"),
  pct: (h) => (h.includes("COMPLETE") || h.includes("PCT") || h.includes("PERCENT")) && !h.includes("ACTUAL") && h.length <= 16,
  desiccant: (h) => h.includes("DESIC") || h.includes("DESSIC"),
};

const FIELD_KEYS = IMPORT_FIELDS.map((f) => f.key) as ImportField[];

function isField(value: string): value is ImportField {
  return (FIELD_KEYS as string[]).includes(value);
}

function cellString(value: unknown): string {
  return String(value ?? "").trim();
}

// Some exports fill empty cells with a lone "." or "," - treat a cell with
// no letters or digits as blank.
function cellText(value: unknown): string {
  const s = cellString(value);
  return /[A-Za-z0-9]/.test(s) ? s : "";
}

function columnValues(rows: unknown[][], col: number): string[] {
  return rows.map((r) => cellString(r?.[col])).filter(Boolean);
}

// Guesses based on the values themselves, for when the title says nothing:
// line names look like "VPKL01" / "PKGST" and repeat row after row; work
// order numbers are 5-9 digit numbers.
function looksLikeLineColumn(values: string[]): boolean {
  if (values.length < 2) return false;
  const lineLike = values.filter((v) => /^[A-Z][A-Z0-9 -]{1,14}$/i.test(v) && /[A-Z]/i.test(v)).length;
  const distinct = new Set(values).size;
  return lineLike / values.length >= 0.9 && distinct < values.length;
}

function looksLikeWoColumn(values: string[]): boolean {
  if (values.length < 2) return false;
  return values.filter((v) => /^\d{5,9}$/.test(v)).length / values.length >= 0.9;
}

// Rule-based guess, ignoring anything remembered from past imports - used
// to tell which of the user's picks are worth remembering.
export function guessMapping(headers: unknown[], rows: unknown[][], learned: Record<string, string> = {}): ColumnMapping {
  const norm = headers.map(normalizeHeader);
  const mapping: ColumnMapping = norm.map(() => "");
  const used = new Set<ImportField>();
  const assign = (col: number, field: ImportField) => {
    if (mapping[col] || used.has(field)) return;
    mapping[col] = field;
    used.add(field);
  };
  const skipped = new Set<number>();

  // 1. What the user chose for this title before ("" = leave it out).
  norm.forEach((h, col) => {
    if (!h || !(h in learned)) return;
    const choice = learned[h];
    if (choice === "") skipped.add(col);
    else if (isField(choice)) assign(col, choice);
  });
  const open = (col: number) => !mapping[col] && !skipped.has(col) && norm[col] !== "";

  // 2. Known titles, then 3. looser title rules - field by field in order.
  for (const field of FIELD_KEYS) {
    const col = norm.findIndex((h, i) => open(i) && EXACT[field].includes(h));
    if (col !== -1) assign(col, field);
  }
  for (const field of FIELD_KEYS) {
    const rule = CONTAINS[field];
    if (!rule || used.has(field)) continue;
    const col = norm.findIndex((h, i) => open(i) && rule(h));
    if (col !== -1) assign(col, field);
  }

  // 4. Line and WO from what the column holds.
  const anyOpen = (i: number) => !mapping[i] && !skipped.has(i);
  if (!used.has("line")) {
    const col = headers.findIndex((_, i) => anyOpen(i) && looksLikeLineColumn(columnValues(rows, i)));
    if (col !== -1) assign(col, "line");
  }
  if (!used.has("wo")) {
    const col = headers.findIndex((_, i) => anyOpen(i) && looksLikeWoColumn(columnValues(rows, i)));
    if (col !== -1) assign(col, "wo");
  }
  return mapping;
}

export interface DetectedTable {
  sheetIndex: number;
  headerRow: number;
}

// The sheet and row holding the column titles: whichever of the first 40
// rows of any sheet gets the most columns recognized (Line and WO count
// extra). Plain numbers in a row count against it - titles are words, so
// that's a data row. Falls back to the first row with several filled-in
// cells.
export function detectTable(sheets: SheetGrid[], learned: Record<string, string> = {}): DetectedTable | null {
  let best: DetectedTable | null = null;
  let bestScore = -1;
  for (let sheetIndex = 0; sheetIndex < sheets.length; sheetIndex++) {
    const grid = sheets[sheetIndex].grid;
    const limit = Math.min(grid.length, 40);
    for (let r = 0; r < limit; r++) {
      const row = grid[r] ?? [];
      if (row.filter((c) => cellString(c)).length < 2) continue;
      const mapping = guessMapping(row, grid.slice(r + 1, r + 31), learned);
      const numbers = row.filter((c) => typeof c === "number" || /^-?[\d.,]+%?$/.test(cellString(c))).length;
      const score =
        mapping.filter(Boolean).length + (mapping.includes("line") ? 2 : 0) + (mapping.includes("wo") ? 2 : 0) - numbers;
      if (score > bestScore) {
        best = { sheetIndex, headerRow: r };
        bestScore = score;
      }
    }
  }
  return best;
}

// Work orders from the rows under the title row, using the given mapping.
// Stops at a "LEGEND" line cell (the original workbook's key below the
// table), skips rows with no line, and drops exact duplicate rows (some
// ERP exports list the same row twice).
export function buildWorkOrders(grid: unknown[][], headerRow: number, mapping: ColumnMapping): WorkOrder[] {
  const col = (field: ImportField) => mapping.indexOf(field);
  const idx = Object.fromEntries(FIELD_KEYS.map((f) => [f, col(f)])) as Record<ImportField, number>;
  if (idx.line === -1) return [];
  const get = (row: unknown[], field: ImportField) => (idx[field] === -1 ? "" : cellString(row[idx[field]]));
  const num = (row: unknown[], field: ImportField): number | "" => {
    const raw = get(row, field).replace(/[,%]/g, "");
    if (raw === "") return "";
    const n = Number(raw);
    return Number.isFinite(n) ? n : "";
  };

  const result: WorkOrder[] = [];
  const seen = new Set<string>();
  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const line = get(row, "line");
    if (line.toUpperCase() === "LEGEND") break;
    if (!line) continue;
    const key = JSON.stringify(row.map(cellString));
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      id: crypto.randomUUID(),
      line,
      wo: get(row, "wo"),
      seq: get(row, "seq"),
      item: get(row, "item"),
      description: get(row, "desc"),
      count: get(row, "count"),
      bulkItem: get(row, "bulk"),
      bottleSize: get(row, "bottle"),
      capDescription: get(row, "cap"),
      allergen: get(row, "allergen"),
      remarks: idx.remarks === -1 ? "" : cellText(row[idx.remarks]),
      woQuantity: num(row, "qty"),
      percentComplete: num(row, "pct"),
      lineStatus: normalizeLineStatus(get(row, "status")),
      desiccant: get(row, "desiccant"),
    });
  }
  return result;
}

// The choices worth remembering: any column whose pick differs from what
// the rules alone would guess. Picks that match the rules are dropped from
// memory so the rules can keep improving.
export function learnFromMapping(
  headers: unknown[],
  rows: unknown[][],
  mapping: ColumnMapping,
  learned: Record<string, string>,
): Record<string, string> {
  const next = { ...learned };
  const ruleGuess = guessMapping(headers, rows);
  headers.forEach((h, i) => {
    const key = normalizeHeader(h);
    if (!key) return;
    if (mapping[i] === ruleGuess[i]) delete next[key];
    else next[key] = mapping[i];
  });
  return next;
}
