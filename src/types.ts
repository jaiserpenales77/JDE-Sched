// Core data model for the JDE production scheduling app.
// Mirrors the original "JDE Sched" Excel workbook: a production line
// work-order schedule, a daily shift/line-assignment board, and an
// employee skills & roles roster.

export interface WorkOrder {
  id: string;
  line: string;
  wo: string;
  seq: string;
  item: string;
  description: string;
  count: string;
  bulkItem: string;
  bottleSize: string;
  capDescription: string;
  allergen: string;
  remarks: string;
  woQuantity: number | "";
  percentComplete: number | "";
  lineStatus: string;
  desiccant: string;
}

export const LINE_STATUS_OPTIONS = ["", "Ready", "PM", "Trial"] as const;

export type ChangeoverCode = "" | "S1" | "S1 Count Change" | "S3" | "S4";

export interface LineSlot {
  id: string;
  line: string;
  status: "" | "Scheduled" | "Not Scheduled" | "PM";
  subNote: string;
  assigned: string;
}

export interface ListSection {
  id: string;
  title: string;
  items: string[];
}

export interface DailyBoard {
  id: string;
  date: string; // YYYY-MM-DD
  shiftLabel: string;
  deptLeader: string;
  lineSlots: LineSlot[];
  listSections: ListSection[];
}

export const SKILL_KEYS = [
  "utility",
  "casePacker",
  "labeler",
  "merrill",
  "cremer",
  "washroom",
] as const;
export type SkillKey = (typeof SKILL_KEYS)[number];

export const SKILL_LABELS: Record<SkillKey, string> = {
  utility: "Utility",
  casePacker: "Case Packer",
  labeler: "Labeler",
  merrill: "Merrill",
  cremer: "Cremer",
  washroom: "Washroom",
};

export const SKILL_MARK_OPTIONS = ["", "✓", "Ҳ", "NEXT", "IP", "PAUSED", "X"] as const;

export interface Employee {
  id: string;
  name: string;
  reportsTo: string;
  role: string;
  primaryLine: string;
  restricted: boolean;
  skills: Record<SkillKey, string>;
}

export interface AppData {
  workOrders: WorkOrder[];
  boards: DailyBoard[];
  employees: Employee[];
}
