import type { AppData, WorkOrder } from "./types";
import { groupByLine, percentActual, bottlesRemaining, changeoverCode } from "./scheduleLogic";

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
        resolve({
          workOrders: Array.isArray(parsed.workOrders) ? parsed.workOrders : [],
          boards: Array.isArray(parsed.boards) ? parsed.boards : [],
          employees: Array.isArray(parsed.employees) ? parsed.employees : [],
        });
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

// Best-effort import of a production schedule from an .xlsx/.xlsm file: finds
// the header row containing "LINE" and "WO", then reads rows below it until
// a blank LINE+WO pair or a "LEGEND" marker ends the table.
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
          const headerRowIdx = grid.findIndex(
            (row) =>
              Array.isArray(row) &&
              row.some((c) => String(c).trim().toUpperCase() === "LINE") &&
              row.some((c) => String(c).trim().toUpperCase() === "WO"),
          );
          if (headerRowIdx === -1) continue;

          const header = grid[headerRowIdx].map((c) => String(c ?? "").trim().toUpperCase());
          const col = (name: string) => header.indexOf(name);
          const idx = {
            line: col("LINE"),
            wo: col("WO"),
            seq: col("SEQ"),
            item: col("ITEM"),
            desc: col("PRODUCT DESCRIPTION"),
            count: col("COUNT"),
            bulk: col("BULK ITEM"),
            bottle: col("BOTTLE SIZE"),
            cap: col("CAP DESCRIPTION"),
            allergen: col("ALLERGEN"),
            remarks: col("REMARKS"),
            qty: col("WO QUANTITY"),
            pct: col("% COMPLETE"),
            status: col("LINE STATUS"),
            desiccant: col("DESICCANT"),
          };

          const result: WorkOrder[] = [];
          for (let r = headerRowIdx + 1; r < grid.length; r++) {
            const row = grid[r] ?? [];
            const lineVal = String(row[idx.line] ?? "").trim();
            if (lineVal.toUpperCase() === "LEGEND") break;
            if (!lineVal) continue;
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
