import type { AppData, DailyBoard, Employee, PrintAssignSettings, WorkOrder } from "./types";

// Seed data carried over from JDE_Sched_FINAL_v1.8.xlsm so the app opens
// with the same production schedule / roster the spreadsheet had, instead
// of an empty screen. Everything here is fully editable in the app.

function wo(partial: Omit<WorkOrder, "id" | "lineStatus" | "desiccant">): WorkOrder {
  return { id: crypto.randomUUID(), lineStatus: "", desiccant: "", ...partial };
}

export const seedWorkOrders: WorkOrder[] = [
  wo({ line: "VPKL01", wo: "2682056", seq: "2", item: "13612", description: "NM COQ10 200MG", count: "90", bulkItem: "A640AB", bottleSize: "225", capDescription: "CAP 45MM CT YELLOW 116 NV", allergen: "N", remarks: "", woQuantity: 19780, percentComplete: 0 }),
  wo({ line: "VPKL03", wo: "2682467", seq: "5", item: "4251", description: "VITAMIN D 1000IU SG", count: "650", bulkItem: "BU001565", bottleSize: "300", capDescription: "CAP 45MM CT YELL 116 V", allergen: "N", remarks: "", woQuantity: 45802, percentComplete: 0 }),
  wo({ line: "VPKL05", wo: "2682229", seq: "11", item: "2883", description: "MAGNESIUM 400MG LSG", count: "150", bulkItem: "BU001299", bottleSize: "500", capDescription: "CAP 45MM CT YELL 116 V", allergen: "N", remarks: "", woQuantity: 22233, percentComplete: 79.34 }),
  wo({ line: "VPKL05", wo: "2683002", seq: "12", item: "2883", description: "MAGNESIUM 400MG LSG", count: "150", bulkItem: "BU001299", bottleSize: "500", capDescription: "CAP 45MM CT YELL 116 V", allergen: "N", remarks: "", woQuantity: 28920, percentComplete: 0 }),
  wo({ line: "VPKL05", wo: "2679111", seq: "13", item: "13176", description: "SUPER B + C SUPPORT", count: "300", bulkItem: "A633", bottleSize: "625", capDescription: "CAP 53MM CT YELLOW 116 V", allergen: "N", remarks: "Label currently is PK002584 but needs new label PK002875 once in system", woQuantity: 10399, percentComplete: 0 }),
  wo({ line: "VPKL07", wo: "2682249", seq: "6", item: "HL000430", description: "FISH OIL 1200MG BPLESS SAMS", count: "240", bulkItem: "A420PE", bottleSize: "950", capDescription: "CAP 53MM CT YELLOW 116 V", allergen: "N", remarks: "", woQuantity: 23618, percentComplete: 17.78 }),
  wo({ line: "VPKL08", wo: "2681041", seq: "9", item: "1717", description: "CHEWABLE VIT C 500MG", count: "150", bulkItem: "704AS", bottleSize: "625", capDescription: "CAP 53MM CT YELLOW 116 V", allergen: "M", remarks: "", woQuantity: 30967, percentComplete: 61.85 }),
  wo({ line: "VPKL08", wo: "2679117", seq: "10", item: "1717", description: "CHEWABLE VIT C 500MG", count: "150", bulkItem: "704AS", bottleSize: "625", capDescription: "CAP 53MM CT YELLOW 116 V", allergen: "N", remarks: "", woQuantity: 27404, percentComplete: 0 }),
  wo({ line: "VPKL09", wo: "2681071", seq: "6", item: "4294", description: "FISH OIL 1200MG", count: "150", bulkItem: "A419PE", bottleSize: "500", capDescription: "CAP 45MM CT YELL 116 V", allergen: "N", remarks: "", woQuantity: 20132, percentComplete: 0 }),
  wo({ line: "VPKL09", wo: "2681067", seq: "7", item: "2895", description: "MAGNESIUM CITRATE SG", count: "120", bulkItem: "A685AC", bottleSize: "400", capDescription: "CAP 45MM CT YELL 116 V", allergen: "N", remarks: "", woQuantity: 20174, percentComplete: 0 }),
  wo({ line: "VPKL09", wo: "2682430", seq: "8", item: "2729", description: "SUPER B COMP W/C & FOL ACID", count: "360", bulkItem: "BU001588", bottleSize: "400", capDescription: "CAP 45MM CT YELL 116 V", allergen: "N", remarks: "", woQuantity: 20171, percentComplete: 0 }),
  wo({ line: "VPKL10", wo: "2682127", seq: "10", item: "2727", description: "SUPER B-COMP W/FOLIC BIOTIN& C", count: "140", bulkItem: "704AS", bottleSize: "225", capDescription: "CAP 45MM CT YELL 116 V", allergen: "N", remarks: "", woQuantity: 33270, percentComplete: 0 }),
  wo({ line: "VPKL10", wo: "2682130", seq: "11", item: "2727", description: "SUPER B-COMP W/FOLIC BIOTIN& C", count: "140", bulkItem: "BU001588", bottleSize: "225", capDescription: "CAP 45MM CT YELL 116 V", allergen: "N", remarks: "", woQuantity: 40702, percentComplete: 9.43 }),
  wo({ line: "VPKL10", wo: "2681559", seq: "12", item: "4065", description: "SUPER B COMPLEX W/VIT C", count: "160", bulkItem: "BU001588", bottleSize: "225", capDescription: "CAP 45MM CT YELL 116 V", allergen: "N", remarks: "", woQuantity: 38193, percentComplete: 0 }),
  wo({ line: "VPKL12", wo: "2682211", seq: "8", item: "2509", description: "VIT C 500MG S/G", count: "60", bulkItem: "A101AI", bottleSize: "225", capDescription: "CAP 45MM CT YELL 116 V", allergen: "N", remarks: "", woQuantity: 53770, percentComplete: 7.14 }),
  wo({ line: "VPKL12", wo: "2681653", seq: "9", item: "HL000589", description: "MG GLYCINATE 300MG 2PC AMZN", count: "90", bulkItem: "BU001333", bottleSize: "225", capDescription: "CAP 45MM CT YELL 116 V", allergen: "N", remarks: "", woQuantity: 23099, percentComplete: 0 }),
];

const lineByName: Record<string, string> = {
  "Alejandro Gragasin": "Line 10",
  "Donovan Campbell MLT": "Line 10",
  "Francisco Ramirez": "Line 10",
  "Laylonie Evans MLL": "Line 10",
  "Roy Rama": "Line 10",
  "Andres Hernadez": "Line 12",
  "Jaiser Penales MLL": "Line 12",
  "Joseph Billet": "Line 12",
  "Marisol Mireles": "Line 12",
  "Leshawn James MLT": "Line 12/9",
  "Michael Ballman": "Utility",
  "Nicole Sweet": "Washroom",
  "Teresa Gonzalez": "Washroom",
  "Tori Sewer": "Washroom",
  "Angela Bernal": "Line 5",
  "Daryous Pledger": "Line 5",
  "Diana Rosales": "Line 5",
  "Gilda Santillan": "Line 5",
  "Juan Jaimes MLT": "Line 5",
  "Pedro Aparicio": "Line 5",
  "Vicky LL": "Line 5/9",
  "Amapola Borgueta LL": "Line 7",
  "Alex Lopez MLT": "Line 7",
  "Fred Landry": "Line 7",
  "Ilse Lopez": "Line 7",
  "Adriana Martin": "Line 7/9",
  "Jose Rojas": "Line 7/9",
  "Angel Trevino": "Mech",
  "Willy Hernandez": "Mech",
};

function emp(
  name: string,
  reportsTo: string,
  role: string,
  skills: [string, string, string, string, string, string],
  restricted = false,
): Employee {
  const trimmed = name.trim();
  return {
    id: crypto.randomUUID(),
    name: trimmed,
    reportsTo,
    role,
    primaryLine: lineByName[trimmed] ?? "",
    restricted,
    skills: {
      utility: skills[0],
      casePacker: skills[1],
      labeler: skills[2],
      merrill: skills[3],
      cremer: skills[4],
      washroom: skills[5],
    },
  };
}

export const seedEmployees: Employee[] = [
  emp("Jaiser Penales MLL", "JUAN", "MLL", ["✓", "✓", "✓", "✓", "✓", "Ҳ"]),
  emp("Laylonie Evans MLL", "JUAN", "MLL", ["✓", "✓", "✓", "✓", "✓", "Ҳ"]),
  emp("Leshawn James MLT", "JUAN", "MLT", ["✓", "✓", "✓", "✓", "✓", "Ҳ"]),
  emp("Juan Jaimes MLT", "MIKE", "MLT", ["✓", "✓", "✓", "✓", "✓", "Ҳ"]),
  emp("Alex Lopez MLT", "MIKE", "MLT", ["✓", "✓", "✓", "✓", "✓", "Ҳ"]),
  emp("Donovan Campbell MLT", "JUAN", "MLT", ["✓", "✓", "✓", "✓", "✓", "Ҳ"]),
  emp("Vicky LL", "MIKE", "LINE LEADER", ["✓", "✓", "✓", "✓", "✓", "Ҳ"]),
  emp("Amapola Borgueta LL", "MIKE", "LINE LEADER", ["✓", "✓", "✓", "✓", "✓", "Ҳ"]),
  emp("Ilse Lopez", "MIKE", "CREMER/FILLER/LABELER/CASE PACKER", ["✓", "✓", "✓", "✓", "✓", "Ҳ"]),
  emp("Diana Rosales", "MIKE", "CREMER/FILLER/LABELER/CASE PACKER", ["✓", "✓", "✓", "✓", "✓", "Ҳ"]),
  emp("Gilda Santillan", "MIKE", "CREMER/FILLER/LABELER/CASE PACKER", ["✓", "✓", "✓", "✓", "✓", "Ҳ"]),
  emp("Marisol Mireles", "JUAN", "LABELER", ["Ҳ", "Ҳ", "✓", "PAUSED", "IP", "Ҳ"]),
  emp("Daryous Pledger", "MIKE", "UTILITY / FILLER", ["✓", "✓", "Ҳ", "✓", "Ҳ", "Ҳ"]),
  emp("Pedro Aparicio", "MIKE", "FILLER / CASE PACKER", ["✓", "✓", "Ҳ", "✓", "Ҳ", "Ҳ"], true),
  emp("Jose Rojas", "MIKE", "UTILITY / CASE PACKER", ["✓", "✓", "NEXT", "Ҳ", "Ҳ", "Ҳ"]),
  emp("Roy Rama", "JUAN", "UTILITY/CASE PACKE/LABELER/CREMER", ["✓", "✓", "✓", "Ҳ", "✓", "Ҳ"]),
  emp("Francisco Ramirez", "JUAN", "UTILITY/CASE PACKER/LABELER", ["✓", "✓", "✓", "Ҳ", "IP", "Ҳ"]),
  emp("Alejandro Gragasin", "JUAN", "UTILITY/CASE PACKE/LABELER/CREMER", ["✓", "✓", "✓", "Ҳ", "✓", "Ҳ"]),
  emp("Andres Hernadez", "JUAN", "UTILITY / CASE PACKER", ["✓", "✓", "X", "Ҳ", "IP", "Ҳ"]),
  emp("Michael Ballman", "JUAN", "INSIDE UTILITY/ UTILITY/CASEPACKER", ["✓", "✓", "Ҳ", "Ҳ", "Ҳ", "Ҳ"]),
  emp("Teresa Gonzalez", "JUAN", "WASHROOM / RESTRICTIONS", ["Ҳ", "Ҳ", "Ҳ", "Ҳ", "Ҳ", "✓"], true),
  emp("Nicole Sweet", "JUAN", "WASHROOM", ["Ҳ", "Ҳ", "Ҳ", "Ҳ", "Ҳ", "✓"]),
  emp("Tori Sewer", "JUAN", "WASHROOM / FILLER / CASEPACKER", ["✓", "✓", "Ҳ", "✓", "Ҳ", "✓"]),
  emp("Adriana Martin", "MIKE", "FILLER / LABELER", ["Ҳ", "Ҳ", "✓", "✓", "IP", "Ҳ"], true),
  emp("Joseph Billet", "JUAN", "UTILITY", ["✓", "NEXT", "Ҳ", "Ҳ", "Ҳ", "Ҳ"]),
  emp("Angela Bernal", "MIKE", "LABELER", ["Ҳ", "Ҳ", "✓", "Ҳ", "IP", "Ҳ"]),
  emp("Fred Landry", "MIKE", "UTILITY", ["✓", "Ҳ", "Ҳ", "Ҳ", "Ҳ", "Ҳ"]),
  emp("Willy Hernandez", "MIKE", "Maintenance Mechanic", ["", "", "", "", "", ""]),
  emp("Angel Trevino", "MIKE", "Maintenance Mechanic", ["", "", "", "", "", ""]),
];

function section(title: string, items: string[]) {
  return { id: crypto.randomUUID(), title, items };
}

export const seedBoards: DailyBoard[] = [
  {
    id: crypto.randomUUID(),
    date: "2026-09-13",
    shiftLabel: "3rd Shift",
    deptLeader: "Juan & Michael",
    lineSlots: [
      { id: crypto.randomUUID(), line: "PTP", status: "PM", subNote: "PTP", assigned: "" },
      { id: crypto.randomUUID(), line: "Line 1", status: "Not Scheduled", subNote: "", assigned: "" },
      { id: crypto.randomUUID(), line: "Line 3", status: "Not Scheduled", subNote: "ZBS - 6", assigned: "" },
      { id: crypto.randomUUID(), line: "Line 5", status: "Scheduled", subNote: "ZBS - 6", assigned: "Vicky Rama, Leshawn James, Adriana Martin, Joe Billet, Marisol Mireles, Jose Rojas" },
      { id: crypto.randomUUID(), line: "Stretch", status: "Not Scheduled", subNote: "ZBS - 4", assigned: "" },
      { id: crypto.randomUUID(), line: "Line 7", status: "Not Scheduled", subNote: "ZBS - 7", assigned: "" },
      { id: crypto.randomUUID(), line: "Line 8", status: "Not Scheduled", subNote: "ZBS - 5", assigned: "" },
      { id: crypto.randomUUID(), line: "Line 9", status: "Not Scheduled", subNote: "ZBS - 4", assigned: "" },
      { id: crypto.randomUUID(), line: "Line 10", status: "Scheduled", subNote: "ZBS - 4", assigned: "Laylonie Evans, Donovan Campbell, Alejandro Gragasin, Francisco Ramirez" },
      { id: crypto.randomUUID(), line: "Line 11", status: "Scheduled", subNote: "ZBS - 4", assigned: "Amapola Borgueta, Alex Lopez, Andres Hernandez, Diana Rosales, Fred Landry" },
      { id: crypto.randomUUID(), line: "Line 12", status: "Scheduled", subNote: "ZBS - 4", assigned: "Jaiser Penales, Juan Jaimes, Daryous Pledger, Angie Bernal, Gilda Santillan" },
      { id: crypto.randomUUID(), line: "Rework Line", status: "Not Scheduled", subNote: "—", assigned: "" },
    ],
    roomSections: [
      section("Label Room", ["Jacob James", "Roy Rama (Training)"]),
      section("Light Duty", ["Teresa Gonzalez (PR)"]),
      section("Wash Room", ["Nicole Sweet", "Tori Sewer"]),
      section("Inside Utility", ["Michael Ballman"]),
      section("Lines Running Next Shift", []),
      section("Maintenance Mechs", ["Angel Trevino", "Willy Hernandez"]),
    ],
    listSections: [
      section("PTO / Absences", ["Ilse Lopez - PTO", "Pedro Aparicio (PR)", "Bryanna Jackson - Bereavement/LOA"]),
      section("Sick / Unscheduled", ["Nicole Sweet", "Pedro Aparicio", "Adriana Martin"]),
      section("Training Plan", [
        "Alejandro Gragasin - Utility, Case Packer, Labeler",
        "Roy Rama - Utility, Case Packer, Labeler",
        "Diana Rosales - Case Packer, Labeler",
        "Adriana Martin - Case Packer (Ҳ), Labeler (✓)",
        "Gilda Santillan - Case Packer (Ҳ), Labeler (✓)",
        "Vicky Rama - Case Packer, Labeler",
        "Ilse Lopez - Utility, Case Packer, Labeler",
        "Marisol Mireles - Labeler",
        "Andres Hernandez - Utility, Case Packer (Pending ass.)",
        "Jose Rojas - Utility",
      ]),
      section("Leads", ["Vicky Rama", "Amapola Borgueta"]),
      section("Mech Leads", ["Jaiser Penales", "Elizabet Salas", "Laylonie Evans"]),
      section("Notes", ["Only 1 Mechanic today", "Report any safety, quality and major production downtime issues immediately"]),
    ],
  },
];

// Matches the original workbook's actual cell fills - see the "Match Line
// Assignments print to the original sheet's exact colors" change for where
// these came from. Fully user-editable from the Line Assignments tab.
export const defaultPrintSettings: PrintAssignSettings = {
  orientation: "landscape",
  showBanner: true,
  bannerText: "REPORT ANY SAFETY, QUALITY AND MAJOR PRODUCTION DOWNTIME ISSUES IMMEDIATELY",
  includeRoomSections: true,
  highlightRoles: true,
  titleColor: "#1f3864",
  bannerColor: "#d9e2f3",
  bannerTextColor: "#bf9000",
  scheduledColor: "#1f3864",
  notScheduledColor: "#8c8c8c",
  pmColor: "#2e75b6",
  leaderColor: "#005426",
  crewColor: "#002060",
  freeFormLayout: false,
  boxLayouts: {},
};

export function buildSeedData(): AppData {
  return {
    workOrders: seedWorkOrders,
    boards: seedBoards,
    employees: seedEmployees,
    printSettings: { ...defaultPrintSettings },
  };
}
