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

export const COMMENT_FONT_OPTIONS = [
  { label: "Calibri", value: "Calibri, Arial, sans-serif" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Times New Roman", value: "'Times New Roman', Times, serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Courier New", value: "'Courier New', Courier, monospace" },
  { label: "Verdana", value: "Verdana, sans-serif" },
  { label: "Comic Sans MS", value: "'Comic Sans MS', 'Comic Sans', cursive" },
  { label: "Impact", value: "Impact, sans-serif" },
] as const;

export interface CommentBox {
  id: string;
  title: string; // short label, also identifies the box's saved print position
  text: string;
  fontSize: number; // px
  fontFamily: string;
  fontColor: string;
  backgroundColor: string;
  borderColor: string;
  borderWidth: number; // px
  bold: boolean;
  italic: boolean;
  textAlign: "left" | "center" | "right";
  includeInPrint: boolean;
}

export interface DailyBoard {
  id: string;
  date: string; // YYYY-MM-DD
  shiftLabel: string;
  deptLeader: string;
  lineSlots: LineSlot[];
  // Room/duty assignments (Label Room, Wash Room, Maintenance Mechs, ...) -
  // structurally part of the same line-assignment grid in the original
  // sheet (same 6-column band layout, just below the numbered lines), so
  // these print alongside lineSlots.
  roomSections: ListSection[];
  // PTO, Sick/Unscheduled, Training Plan, Leads, etc. - a separate side
  // panel in the original sheet. Editable on screen, excluded from print.
  listSections: ListSection[];
  // Free-standing styled comment/note boxes - fully custom appearance,
  // optionally included on the print report.
  comments: CommentBox[];
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

// A box's position and size on the print page, all as percentages of the
// page area (0-100) so the same layout scales across paper sizes.
export interface BoxLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PrintAssignSettings {
  orientation: "landscape" | "portrait";
  showBanner: boolean;
  bannerText: string;
  includeRoomSections: boolean;
  highlightRoles: boolean;
  titleColor: string;
  bannerColor: string;
  bannerTextColor: string;
  scheduledColor: string;
  notScheduledColor: string;
  pmColor: string;
  leaderColor: string;
  mllColor: string;
  mltColor: string;
  // When true, line/room boxes are drawn at their saved boxLayouts
  // position instead of the automatic flowing grid.
  freeFormLayout: boolean;
  boxLayouts: Record<string, BoxLayout>;
}

export interface AppData {
  workOrders: WorkOrder[];
  boards: DailyBoard[];
  employees: Employee[];
  printSettings: PrintAssignSettings;
  // Production lines checked in the "Scheduled Lines" panel - highlighted
  // with a green border around the line's whole block on the print report.
  scheduledLines: string[];
}
