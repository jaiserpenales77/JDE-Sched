import type { AppData, WorkOrder } from "./types";
import { groupByLine, percentActual, bottlesRemaining, changeoverInto } from "./scheduleLogic";
import { normalizeAppData } from "./storage";
import type { SheetGrid } from "./importColumns";

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
        if (!parsed || typeof parsed !== "object") throw new Error("Not a valid LineUp backup file.");
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
        changeoverInto(group.rows, idx),
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

// Every sheet of an .xlsx/.xlsm/.xls file as a grid of cell values - the
// Import screen (see importColumns.ts) works out which sheet, row and
// columns hold the schedule.
export function readWorkbookSheets(file: File): Promise<SheetGrid[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const XLSX = await import("xlsx");
        const workbook = XLSX.read(new Uint8Array(reader.result as ArrayBuffer), { type: "array" });
        const sheets = workbook.SheetNames.map((name) => ({
          name,
          grid: XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, blankrows: true, defval: "" }),
        })).filter((s) => s.grid.some((row) => row.some((c) => String(c ?? "").trim())));
        if (!sheets.length) throw new Error("That file has no data in it.");
        resolve(sheets);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}
