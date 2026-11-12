import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import type { RunStatus, ShiftKey } from "./types";
import type { SheetGrid } from "./importColumns";
import { lineNumber, shiftEnd } from "./scheduleRun";

// The week plan: which lines run each shift, from the weekly packaging
// schedule's "Daily Line Sched" sheet (one row per line, one column per day
// and shift: 1 = running, a part like 0.25 = partial shift, PM, Ready,
// blank = not running). Imported once from any shift and shared by all
// three (jde-sched-plan/week, firestore.rules); each shift's Lines panel
// takes its statuses from it.

// A shift of a production day: "2026-11-11|3rd". The 3rd shift of a day is
// the overnight one that starts the evening before (11:15 PM on 11/10 for
// 11/11), as on the weekly sheet and the JDE printout.
export type PlanShiftKey = string;

// Line number ("5") -> its status that shift. A line left out (blank on the
// sheet) has no plan: it falls back to the JDE file's Ready / PM / OT, else
// Not scheduled.
export type PlanShift = Record<string, RunStatus>;

export interface WeekPlan {
  shifts: Record<PlanShiftKey, PlanShift>;
  // The file it came from, when (ms), and from which shift.
  file: string;
  importedAt: number;
  importedBy: ShiftKey | "";
}

const SHIFT_ORDER: ShiftKey[] = ["3rd", "1st", "2nd"];
const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// The plan's key for a shift running at `asOf` (the shift starting at
// `shiftStart`, "23:15").
export function planShiftKey(asOf: Date, shift: ShiftKey, shiftStart: string): PlanShiftKey {
  const start = new Date(shiftEnd(asOf, shiftStart).getTime() - 8 * 3600e3);
  const day = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  // A shift that starts in the evening belongs to the next day.
  if (start.getHours() >= 18) day.setDate(day.getDate() + 1);
  return `${dayKey(day)}|${shift}`;
}

// The shift after it: 3rd -> 1st -> 2nd -> the next day's 3rd.
export function nextPlanShiftKey(key: PlanShiftKey): PlanShiftKey {
  const [date, shift] = key.split("|") as [string, ShiftKey];
  if (shift === "3rd") return `${date}|1st`;
  if (shift === "1st") return `${date}|2nd`;
  const [y, m, d] = date.split("-").map(Number);
  return `${dayKey(new Date(y, m - 1, d + 1))}|3rd`;
}

// "11/11 3rd shift".
export function planShiftLabel(key: PlanShiftKey): string {
  const [date, shift] = key.split("|");
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)} ${shift} shift`;
}

// A cell of the sheet as a status (undefined = blank: no plan for the line).
export function planStatus(value: unknown): RunStatus | undefined {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return undefined;
    return value < 1 ? "PARTIAL SHIFT" : "RUNNING";
  }
  const s = String(value ?? "").trim().toUpperCase();
  if (!s || s === "-" || s === "0") return undefined;
  if (s === "PM" || s.includes("CLEAN") || s.startsWith("PM ")) return "PM / CLEANING";
  if (s.startsWith("READY")) return "READY LINE";
  if (s === "OT" || s.includes("OVERTIME")) return "OVERTIME";
  if (s.includes("PARTIAL")) return "PARTIAL SHIFT";
  if (s === "RUN" || s === "RUNNING" || s === "X" || s === "Y" || s === "YES") return "RUNNING";
  const n = Number(s);
  if (Number.isFinite(n)) return planStatus(n);
  return undefined;
}

// A date cell: "11/09/2026", "11/09/26", an Excel date number or a Date.
function cellDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  if (typeof value === "number" && value > 30000 && value < 80000) {
    // Excel's day numbers count from 1899-12-30.
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400e3);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  const m = String(value ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const d = new Date(year, Number(m[1]) - 1, Number(m[2]));
  return d.getMonth() === Number(m[1]) - 1 ? d : null;
}

const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const cellText = (v: unknown) => String(v ?? "").trim();

export interface ParsedPlan {
  shifts: Record<PlanShiftKey, PlanShift>;
  // The first and last shift it covers, and how many lines it lists.
  first: PlanShiftKey;
  last: PlanShiftKey;
  lines: number;
}

// The week plan in a weekly schedule workbook: its "Daily Line Sched" sheet
// (or the first sheet laid out like it).
export function parseLinePlan(sheets: SheetGrid[]): ParsedPlan {
  const ordered = [
    ...sheets.filter((s) => /daily/i.test(s.name) && /line/i.test(s.name)),
    ...sheets.filter((s) => !(/daily/i.test(s.name) && /line/i.test(s.name))),
  ];
  for (const sheet of ordered) {
    const parsed = parseSheet(sheet.grid);
    if (parsed) return parsed;
  }
  throw new Error(
    "Couldn't find the daily line schedule in that file: a sheet with a row of weekdays (Mon, Tue ...), a row of shifts (3rd, 1st, 2nd) under it, and a row for each line (Line 1, Line 3 ...).",
  );
}

function parseSheet(grid: unknown[][]): ParsedPlan | null {
  // The shift row: at least three of 3rd / 1st / 2nd, with weekdays above it.
  const shiftRow = grid.findIndex(
    (row, r) =>
      r > 0 &&
      row.filter((c) => ["1ST", "2ND", "3RD"].includes(cellText(c).toUpperCase())).length >= 3 &&
      (grid[r - 1] ?? []).some((c) => WEEKDAYS.includes(cellText(c).toUpperCase().slice(0, 3))),
  );
  if (shiftRow < 0) return null;
  const dayRow = grid[shiftRow - 1];
  const dateRows = grid.slice(0, shiftRow - 1);
  // Each day block starts at its weekday and runs over its shift columns;
  // its date is in a row above, over one of those columns.
  const columns: { col: number; key: PlanShiftKey }[] = [];
  const width = Math.max(...grid.slice(0, shiftRow + 1).map((r) => r.length));
  let day: Date | null = null;
  for (let c = 0; c < width; c++) {
    if (WEEKDAYS.includes(cellText(dayRow[c]).toUpperCase().slice(0, 3))) {
      day = null;
      for (let cc = c; cc < Math.min(width, c + 3) && !day; cc++) {
        for (const row of dateRows) {
          const d = cellDate(row[cc]);
          if (d) {
            day = d;
            break;
          }
        }
      }
    }
    const shift = cellText(grid[shiftRow][c]).toLowerCase() as ShiftKey;
    if (day && SHIFT_ORDER.includes(shift)) columns.push({ col: c, key: `${dayKey(day)}|${shift}` });
  }
  if (!columns.length) return null;
  // The lines: the first block of "Line N" rows under the shifts (the sheet
  // repeats them lower down for the crew sizes).
  const shifts: Record<PlanShiftKey, PlanShift> = Object.fromEntries(columns.map((c) => [c.key, {}]));
  const seen = new Set<number>();
  for (let r = shiftRow + 1; r < grid.length; r++) {
    const name = cellText(grid[r]?.[0]);
    if (!/^line\s*\d+/i.test(name)) continue;
    const n = lineNumber(name);
    if (n === null) continue;
    if (seen.has(n)) break;
    seen.add(n);
    for (const { col, key } of columns) {
      const status = planStatus(grid[r][col]);
      if (status) shifts[key][String(n)] = status;
    }
  }
  if (!seen.size) return null;
  const keys = columns.map((c) => c.key).sort(compareKeys);
  return { shifts, first: keys[0], last: keys[keys.length - 1], lines: seen.size };
}

// In time order: by day, then 3rd, 1st, 2nd.
export function compareKeys(a: PlanShiftKey, b: PlanShiftKey): number {
  const [da, sa] = a.split("|");
  const [dbb, sb] = b.split("|");
  return da === dbb ? SHIFT_ORDER.indexOf(sa as ShiftKey) - SHIFT_ORDER.indexOf(sb as ShiftKey) : da < dbb ? -1 : 1;
}

// A new import over the plan already saved: its shifts replace the same
// shifts; others stay, except those more than four weeks old.
export function mergePlans(saved: WeekPlan | null, parsed: ParsedPlan, now: Date): Record<PlanShiftKey, PlanShift> {
  const oldest = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 28));
  const kept = Object.entries(saved?.shifts ?? {}).filter(([key]) => key.split("|")[0] >= oldest && !(key in parsed.shifts));
  return Object.fromEntries([...kept, ...Object.entries(parsed.shifts)].sort(([a], [b]) => compareKeys(a, b)));
}

// The saved plan as read (cleaned), or null when there's none.
export function cleanWeekPlan(raw: unknown): WeekPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<WeekPlan> & { importedAt?: unknown };
  const shifts: Record<PlanShiftKey, PlanShift> = {};
  for (const [key, value] of Object.entries(r.shifts ?? {})) {
    if (!/^\d{4}-\d{2}-\d{2}\|(1st|2nd|3rd)$/.test(key) || !value || typeof value !== "object") continue;
    shifts[key] = {};
    for (const [line, status] of Object.entries(value as Record<string, unknown>)) {
      const s = planStatus(status) ?? (typeof status === "string" ? (status as RunStatus) : undefined);
      if (/^\d+$/.test(line) && s && ["RUNNING", "PARTIAL SHIFT", "OVERTIME", "READY LINE", "PM / CLEANING", "NOT SCHEDULED"].includes(s)) {
        shifts[key][line] = s;
      }
    }
  }
  if (!Object.keys(shifts).length) return null;
  const at = r.importedAt as unknown;
  const importedAt = typeof at === "number" ? at : at && typeof (at as { toMillis?: () => number }).toMillis === "function" ? (at as { toMillis: () => number }).toMillis() : 0;
  return {
    shifts,
    file: typeof r.file === "string" ? r.file : "",
    importedAt,
    importedBy: r.importedBy === "1st" || r.importedBy === "2nd" || r.importedBy === "3rd" ? r.importedBy : "",
  };
}

const planDoc = () => doc(db, "jde-sched-plan", "week");

// The shared week plan, kept up to date (null: none yet, or not readable).
export function useWeekPlan(enabled: boolean): WeekPlan | null {
  const [plan, setPlan] = useState<WeekPlan | null>(null);
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      planDoc(),
      (snap) => setPlan(cleanWeekPlan(snap.data())),
      (err) => {
        console.info("The week plan isn't available.", err.code);
        setPlan(null);
      },
    );
  }, [enabled]);
  return enabled ? plan : null;
}

// Saves an imported plan for every shift.
export async function saveWeekPlan(saved: WeekPlan | null, parsed: ParsedPlan, file: string, shift: ShiftKey, now = new Date()) {
  const plan: WeekPlan = { shifts: mergePlans(saved, parsed, now), file: file.slice(0, 200), importedAt: now.getTime(), importedBy: shift };
  await setDoc(planDoc(), plan);
  return plan;
}

// One line's plan for this shift and the next, and whether the plan covers
// those shifts at all.
export interface LinePlanFor {
  key: PlanShiftKey;
  thisCovered: boolean;
  nextCovered: boolean;
  thisShift?: RunStatus;
  nextShift?: RunStatus;
}

export function linePlanFor(plan: WeekPlan | null, key: PlanShiftKey, line: string): LinePlanFor {
  const n = lineNumber(line);
  const now = plan?.shifts[key];
  const next = plan?.shifts[nextPlanShiftKey(key)];
  return {
    key,
    thisCovered: !!now,
    nextCovered: !!next,
    thisShift: n !== null ? now?.[String(n)] : undefined,
    nextShift: n !== null ? next?.[String(n)] : undefined,
  };
}
