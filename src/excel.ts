import type { AppData, WorkOrder } from "./types";
import { groupByLine, percentActual, bottlesRemaining, changeoverCode } from "./scheduleLogic";
import { normalizeAppData } from "./storage";

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportAppDataToJson(data: AppData) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  download(blob, `jde-sched-backup-${new Date().toISOString().slice(0, 10)}.json`);
}

export function readAppDataFromJsonFile(file: File): Promise<AppData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        if (!parsed || typeof parsed !== "object") throw new Error("Not a valid JDE Sched backup file.");
        resolve(normalizeAppData(parsed as Partial<AppData>));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

const SCHEDULE_HEADERS = [
  "LINE",
  "WO",
  "SEQ",
  "ITEM",
  "PRODUCT DESCRIPTION",
  "Count",
  "Bulk Item",
  "Bottle Size",
  "CAP DESCRIPTION",
  "Allergen",
  "REMARKS",
  "WO Quantity",
  "% Complete",
  "% Actual Complete",
  "Bottles Remaining",
  "CHANGEOVER",
  "Line Status",
  "Desiccant",
];

export async function exportWorkOrdersToExcel(workOrders: WorkOrder[]) {
  const XLSX = await import("xlsx");
  const groups = groupByLine(workOrders);
  const rows: (string | number)[][] = [SCHEDULE_HEADERS];

  for (const group of groups) {
    group.rows.forEach((row, idx) => {
      const next = group.rows[idx + 1];
      rows.push([
        row.line,
        row.wo,
        row.seq,
        row.item,
        row.description,
        row.count,
        row.bulkItem,
        row.bottleSize,
        row.capDescription,
        row.allergen,
        row.remarks,
        row.woQuantity,
        row.percentComplete,
        percentActual(row),
        bottlesRemaining(row),
        changeoverCode(row, next),
        row.lineStatus,
        row.desiccant,
      ]);
    });
    rows.push([]); // blank divider row between lines, like the original workbook
  }

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet["!cols"] = SCHEDULE_HEADERS.map(() => ({ wch: 14 }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Production Schedule");
  XLSX.writeFile(workbook, `jde-production-schedule-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// Different exports of "the same" production schedule use different column
// names for the same field (e.g. an ERP export's "Order Number" instead of
// the JDE template's "WO") - each field lists every header text seen in the
// wild, tried in order, so either format (or a mix) is recognized.
const COLUMN_ALIASES = {
  line: ["LINE", "WORK CENTER"],
  wo: ["WO", "ORDER NUMBER"],
  seq: ["SEQ", "SEQUENCE NUMBER"],
  item: ["ITEM", "2ND ITEM NUMBER"],
  desc: ["PRODUCT DESCRIPTION", "2ND ITEM NUMBER DESCRIPTION"],
  count: ["COUNT", "BOTTLE COUNT"],
  bulk: ["BULK ITEM"],
  bottle: ["BOTTLE SIZE"],
  cap: ["CAP DESCRIPTION"],
  allergen: ["ALLERGEN", "ALLERGEN CODE"],
  remarks: ["REMARKS"],
  qty: ["WO QUANTITY", "BATCH QUANTITY"],
  pct: ["% COMPLETE", "WO % COMPLETED"],
  status: ["LINE STATUS"],
  desiccant: ["DESICCANT"],
} as const satisfies Record<string, readonly string[]>;

function findColumn(header: string[], aliases: readonly string[]): number {
  for (const alias of aliases) {
    const i = header.indexOf(alias);
    if (i !== -1) return i;
  }
  return -1;
}

// Best-effort import of a production schedule from an .xlsx/.xlsm file: finds
// the header row containing a LINE column and a WO-like column (see
// COLUMN_ALIASES), then reads rows below it until a blank LINE+WO pair or a
// "LEGEND" marker ends the table.
export function readWorkOrdersFromWorkbookFile(file: File): Promise<WorkOrder[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const XLSX = await import("xlsx");
        const data = new Uint8Array(reader.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const grid: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: true });
          const headerRowIdx = grid.findIndex((row) => {
            if (!Array.isArray(row)) return false;
            const upper = row.map((c) => String(c ?? "").trim().toUpperCase());
            const hasLine = COLUMN_ALIASES.line.some((alias) => upper.includes(alias));
            const hasWo = COLUMN_ALIASES.wo.some((alias) => upper.includes(alias));
            return hasLine && hasWo;
          });
          if (headerRowIdx === -1) continue;

          const header = grid[headerRowIdx].map((c) => String(c ?? "").trim().toUpperCase());
          const idx = {
            line: findColumn(header, COLUMN_ALIASES.line),
            wo: findColumn(header, COLUMN_ALIASES.wo),
            seq: findColumn(header, COLUMN_ALIASES.seq),
            item: findColumn(header, COLUMN_ALIASES.item),
            desc: findColumn(header, COLUMN_ALIASES.desc),
            count: findColumn(header, COLUMN_ALIASES.count),
            bulk: findColumn(header, COLUMN_ALIASES.bulk),
            bottle: findColumn(header, COLUMN_ALIASES.bottle),
            cap: findColumn(header, COLUMN_ALIASES.cap),
            allergen: findColumn(header, COLUMN_ALIASES.allergen),
            remarks: findColumn(header, COLUMN_ALIASES.remarks),
            qty: findColumn(header, COLUMN_ALIASES.qty),
            pct: findColumn(header, COLUMN_ALIASES.pct),
            status: findColumn(header, COLUMN_ALIASES.status),
            desiccant: findColumn(header, COLUMN_ALIASES.desiccant),
          };

          const result: WorkOrder[] = [];
          // ERP exports can list the same work order row twice, identically.
          const seen = new Set<string>();
          for (let r = headerRowIdx + 1; r < grid.length; r++) {
            const row = grid[r] ?? [];
            const lineVal = String(row[idx.line] ?? "").trim();
            if (lineVal.toUpperCase() === "LEGEND") break;
            if (!lineVal) continue;
            const rowKey = JSON.stringify(row.map((c) => String(c ?? "").trim()));
            if (seen.has(rowKey)) continue;
            seen.add(rowKey);
            result.push({
              id: crypto.randomUUID(),
              line: lineVal,
              wo: String(row[idx.wo] ?? "").trim(),
              seq: String(row[idx.seq] ?? "").trim(),
              item: String(row[idx.item] ?? "").trim(),
              description: String(row[idx.desc] ?? "").trim(),
              count: String(row[idx.count] ?? "").trim(),
              bulkItem: String(row[idx.bulk] ?? "").trim(),
              bottleSize: String(row[idx.bottle] ?? "").trim(),
              capDescription: String(row[idx.cap] ?? "").trim(),
              allergen: String(row[idx.allergen] ?? "").trim(),
              remarks: String(row[idx.remarks] ?? "").trim(),
              woQuantity: row[idx.qty] === undefined || row[idx.qty] === "" ? "" : Number(row[idx.qty]),
              percentComplete: row[idx.pct] === undefined || row[idx.pct] === "" ? "" : Number(row[idx.pct]),
              lineStatus: idx.status >= 0 ? String(row[idx.status] ?? "").trim() : "",
              desiccant: idx.desiccant >= 0 ? String(row[idx.desiccant] ?? "").trim() : "",
            });
          }
          if (result.length > 0) {
            resolve(result);
            return;
          }
        }
        reject(new Error("Could not find a production schedule table (a LINE/WO header row) in that file."));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}
