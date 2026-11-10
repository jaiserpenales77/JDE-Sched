import type { RunStatus, ScheduleRunSettings } from "./types";
import type { ScheduleLine } from "./scheduleRun";

// What the Line boxes printout shows (see components/ScheduleBoxes.tsx).

export interface BoxesView {
  lines: ScheduleLine[];
  asOf: Date;
  end: Date;
  shiftLabel: string;
  nextShiftLabel: string;
  summary: { text: string; minor: number; major: number; next: { line: string; at: Date } | null };
  // A red CHECK in place of the summary: Schedule as of isn't today, or a
  // WO is on two rows ("" = none).
  check: string;
  settings: ScheduleRunSettings;
}

// Its columns, in order, and their share of the page width (%). LINE and
// NEXT SHIFT hold the line's name and statuses down the whole box.
export const BOX_COLUMNS = [
  { key: "line", label: "Line", title: "LINE", width: 8.5 },
  { key: "wo", label: "WO #", title: "WO", width: 5.4 },
  { key: "seq", label: "Seq", title: "SQ", width: 2.3 },
  { key: "item", label: "Item", title: "ITEM", width: 6.0 },
  { key: "description", label: "Item description", title: "ITEM DESCRIPTION", width: 15.5 },
  { key: "count", label: "Count", title: "CT", width: 2.8 },
  { key: "bulkItem", label: "Bulk item", title: "BULK", width: 6.2 },
  { key: "bottleSize", label: "Bottle size", title: "BTL", width: 2.9 },
  { key: "capDescription", label: "Cap", title: "CAP", width: 4.2 },
  { key: "allergen", label: "Allergen", title: "A", width: 2.1 },
  { key: "desiccant", label: "Desiccant", title: "DES", width: 3.1 },
  { key: "woQuantity", label: "WO Qty", title: "WO QTY", width: 4.6 },
  { key: "progress", label: "Progress / changeover", title: "PROGRESS / CHANGEOVER", width: 11.7 },
  { key: "left", label: "Left / changeover minutes", title: "LEFT / C.O.", width: 4.6 },
  { key: "crew", label: "Crew (EE)", title: "EE", width: 2.3 },
  { key: "est", label: "Est. time", title: "EST. TIME", width: 9.0 },
  { key: "next", label: "Next shift", title: "NEXT SHIFT", width: 8.8 },
] as const;
export type BoxColumnKey = (typeof BOX_COLUMNS)[number]["key"];

export const STATUS_CLASS: Record<RunStatus, string> = {
  RUNNING: "running",
  "PARTIAL SHIFT": "partial",
  OVERTIME: "overtime",
  "READY LINE": "ready",
  "PM / CLEANING": "pm",
  "NOT SCHEDULED": "not",
};
