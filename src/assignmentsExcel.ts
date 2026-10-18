import type ExcelJS from "exceljs";
import type { CommentBox, DailyBoard, Employee, LineSlot, ListSection, PrintAssignSettings } from "./types";
import { DEFAULT_SECTION_STYLE } from "./types";
import { buildRoleMap, chunk, nameKey, roleCategory, roleOf, SLOTS_PER_BAND, sortByRole, statusKey } from "./printLayout";
import { cleanEmployeeName, parseNames } from "./assignmentLogic";

// The Line Assignments print report as an Excel sheet: same title,
// banner, 6-across line boxes, Room & Duty sections and printed comments,
// in the same colors (see the .print-assign-* rules in App.css). It stays
// live in Excel - the Status cells are dropdowns that recolor their box,
// names are picked from the Roster sheet, and MLL / Line Lead / MLT names
// highlight from the role typed on the Roster sheet.

type Workbook = ExcelJS.Workbook;
type Worksheet = ExcelJS.Worksheet;
type Cell = ExcelJS.Cell;

const SHEET = "Line Assignments";
const ROSTER = "Roster";
const STATUS_LIST = ["Scheduled", "Not Scheduled", "PM", "—"];
// Blank row left under each band's names / items for adding people.
const EXTRA_ROWS = 1;
const STRIPE = "#f2f2f2";
const ROOM_HEADER_FILL = "#44546a";

// Box columns A, C, E, G, I, K with a narrow gap column between each,
// like the 6px gap between boxes on the page.
const BOX_COLS = Array.from({ length: SLOTS_PER_BAND }, (_, i) => 1 + i * 2);
const LAST_COL = BOX_COLS[BOX_COLS.length - 1];

function argb(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  return `FF${(m ? m[1] : "000000").toUpperCase()}`;
}

// CSS color-mix(in srgb, color pct%, white).
function mixWhite(hex: string, pct: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const channel = (shift: number) =>
    Math.round(((n >> shift) & 255) * (pct / 100) + 255 * (1 - pct / 100))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

function fill(hex: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb: argb(hex) }, bgColor: { argb: argb(hex) } };
}

// First family of a CSS font stack: "'Times New Roman', Times, serif" -> "Times New Roman".
function fontName(stack: string): string {
  const first = stack.split(",")[0].trim().replace(/^['"]|['"]$/g, "");
  return !first || /^(sans-serif|serif|monospace|cursive)$/i.test(first) ? "Calibri" : first;
}

function colLetter(col: number): string {
  return String.fromCharCode(64 + col);
}

function ref(col: number, row: number, absRow = false): string {
  return `${colLetter(col)}${absRow ? "$" : ""}${row}`;
}

interface Look {
  fill: string;
  color: string;
}

// A line box's three header cells per status - Scheduled navy, Not
// Scheduled gray, PM gray with a blue status label.
function statusLooks(settings: PrintAssignSettings): Record<"scheduled" | "not-scheduled" | "pm", Look[]> {
  const sched = settings.scheduledColor;
  const gray = settings.notScheduledColor;
  return {
    scheduled: [
      { fill: sched, color: "#ffffff" },
      { fill: mixWhite(sched, 55), color: "#ffffff" },
      { fill: mixWhite(sched, 80), color: "#ffffff" },
    ],
    "not-scheduled": [
      { fill: gray, color: "#ffffff" },
      { fill: gray, color: "#ffffff" },
      { fill: mixWhite(gray, 55), color: "#404040" },
    ],
    pm: [
      { fill: gray, color: "#ffffff" },
      { fill: settings.pmColor, color: "#ffffff" },
      { fill: mixWhite(gray, 55), color: "#404040" },
    ],
  };
}

function cfRule(formula: string, look: Look, bold?: boolean): ExcelJS.ConditionalFormattingRule {
  return {
    type: "expression",
    priority: 1,
    formulae: [formula],
    style: {
      fill: fill(look.fill),
      font: { color: { argb: argb(look.color) }, ...(bold === undefined ? {} : { bold }) },
    },
  };
}

// Roster sheet: board name, role, and the highlight that role gets -
// a formula, so changing someone's role recolors their name.
function addRoster(wb: Workbook, board: DailyBoard, employees: Employee[]): number {
  const ws = wb.addWorksheet(ROSTER);
  ws.columns = [
    { header: "Name", width: 28 },
    { header: "Role", width: 22 },
    { header: "Highlight", width: 14 },
    { header: "Primary Line", width: 18 },
  ];
  const head = ws.getRow(1);
  head.font = { name: "Calibri", bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = fill("#1f3864");

  const rows: [string, string, string][] = [];
  const seen = new Set<string>();
  for (const e of employees) {
    const name = cleanEmployeeName(e.name);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    rows.push([name, e.role, e.primaryLine]);
  }
  // Names typed differently on the board than on the roster (a nickname,
  // "Last, First") still match in the app - list them as written so the
  // sheet's exact-match lookup finds them too.
  const roleMap = buildRoleMap(employees);
  const boardNames = [...board.lineSlots.flatMap((s) => parseNames(s.assigned)), ...board.roomSections.flatMap((r) => r.items)];
  for (const raw of boardNames) {
    const name = raw.trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    const role = roleOf(name, roleMap);
    if (role === undefined) continue;
    seen.add(name.toLowerCase());
    const match = employees.find((e) => nameKey(e.name) === nameKey(name));
    rows.push([name, role, match?.primaryLine ?? ""]);
  }

  rows.forEach(([name, role, primary], i) => {
    const r = i + 2;
    ws.getCell(r, 1).value = name;
    ws.getCell(r, 2).value = role;
    ws.getCell(r, 3).value = {
      formula: `IF(B${r}="","",IF(ISNUMBER(SEARCH("MLL",B${r})),"MLL",IF(OR(ISNUMBER(SEARCH("LINE LEAD",B${r})),UPPER(TRIM(B${r}))="LL"),"Line Lead",IF(ISNUMBER(SEARCH("MLT",B${r})),"MLT",""))))`,
    };
    ws.getCell(r, 4).value = primary;
  });
  // Room to add people without the highlight formula going missing.
  const last = Math.max(rows.length + 1, 200);
  for (let r = rows.length + 2; r <= last; r++) {
    ws.getCell(r, 3).value = {
      formula: `IF(B${r}="","",IF(ISNUMBER(SEARCH("MLL",B${r})),"MLL",IF(OR(ISNUMBER(SEARCH("LINE LEAD",B${r})),UPPER(TRIM(B${r}))="LL"),"Line Lead",IF(ISNUMBER(SEARCH("MLT",B${r})),"MLT",""))))`,
    };
  }
  ws.eachRow((row) => {
    row.eachCell({ includeEmpty: true }, (c) => {
      c.font = { name: "Calibri", ...c.font };
    });
  });
  ws.pageSetup.printArea = `A1:D${rows.length + 1}`;
  ws.getCell("F1").value = "Type a role here (MLL, Line Lead, MLT...) to highlight that name on the Line Assignments sheet.";
  ws.getCell("F1").font = { name: "Calibri", italic: true, color: { argb: "FF595959" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  return last;
}

function roleOfCellFormula(cell: string, rosterLast: number): string {
  return `IFERROR(INDEX(${ROSTER}!$C$2:$C$${rosterLast},MATCH(TRIM(${cell}),${ROSTER}!$A$2:$A$${rosterLast},0)),"")`;
}

// Static look a name row starts with (so the sheet still looks right in a
// viewer that skips conditional formats), plus the rules that keep it
// right as names change.
function styleNameRange(
  ws: Worksheet,
  col: number,
  firstRow: number,
  lastRow: number,
  names: string[],
  settings: PrintAssignSettings,
  roleMap: Map<string, string>,
  rosterLast: number,
  base: { font: Partial<ExcelJS.Font>; align: "left" | "center" | "right"; color: string; bold: boolean },
) {
  const roleLooks = {
    mll: { fill: settings.mllColor, color: "#ffffff" },
    leader: { fill: settings.leaderColor, color: "#ffffff" },
    mlt: { fill: settings.mltColor, color: "#ffffff" },
  };
  for (let r = firstRow; r <= lastRow; r++) {
    const i = r - firstRow;
    const name = names[i] ?? "";
    const cell = ws.getCell(r, col);
    cell.value = name || null;
    cell.alignment = { horizontal: base.align, vertical: "middle", wrapText: true };
    let look: Look = { fill: "#ffffff", color: base.color };
    let bold = base.bold;
    if (name) {
      const cat = settings.highlightRoles ? roleCategory(roleOf(name, roleMap)) : "other";
      if (cat !== "other") {
        look = roleLooks[cat];
        bold = true;
      } else if (i % 2 === 1) look = { fill: STRIPE, color: base.color };
    }
    cell.font = { ...base.font, bold, color: { argb: argb(look.color) } };
    if (look.fill !== "#ffffff") cell.fill = fill(look.fill);
  }

  const top = ref(col, firstRow);
  const rules: ExcelJS.ConditionalFormattingRule[] = [];
  if (settings.highlightRoles) {
    const role = roleOfCellFormula(top, rosterLast);
    rules.push(cfRule(`${role}="MLL"`, roleLooks.mll, true));
    rules.push(cfRule(`${role}="Line Lead"`, roleLooks.leader, true));
    rules.push(cfRule(`${role}="MLT"`, roleLooks.mlt, true));
  }
  rules.push(cfRule(`AND(TRIM(${top})<>"",MOD(ROW()-${firstRow},2)=1)`, { fill: STRIPE, color: base.color }, base.bold));
  rules.push(cfRule("TRUE", { fill: "#ffffff", color: base.color }, base.bold));
  rules.forEach((rule, i) => (rule.priority = i + 1));
  ws.addConditionalFormatting({ ref: `${top}:${ref(col, lastRow)}`, rules });

  for (let r = firstRow; r <= lastRow; r++) {
    ws.getCell(r, col).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`${ROSTER}!$A$2:$A$${rosterLast}`],
      showErrorMessage: false,
    };
  }
}

// Row heights in points for a row of 10pt names - taller when a name is
// longer than fits on one line of its box.
function nameRowHeight(names: string[], charsPerLine: number, fontPt: number): number {
  const lines = Math.max(1, ...names.map((n) => Math.ceil((n.length || 1) / charsPerLine)));
  return Math.round((fontPt * 1.25 * lines + 4.5) * 2) / 2;
}

function writeLineBand(
  ws: Worksheet,
  startRow: number,
  band: LineSlot[],
  settings: PrintAssignSettings,
  roleMap: Map<string, string>,
  rosterLast: number,
  charsPerLine: number,
): number {
  const looks = statusLooks(settings);
  const [nameRow, statusRow, noteRow] = [startRow, startRow + 1, startRow + 2];
  ws.getRow(nameRow).height = 25.5;
  ws.getRow(statusRow).height = 15;
  ws.getRow(noteRow).height = 15;

  const crews = band.map((slot) => {
    const raw = parseNames(slot.assigned);
    return settings.highlightRoles ? sortByRole(raw, roleMap) : raw;
  });
  const nameRows = Math.max(0, ...crews.map((c) => c.length)) + EXTRA_ROWS;
  const firstName = noteRow + 1;
  const lastName = noteRow + nameRows;

  band.forEach((slot, i) => {
    const col = BOX_COLS[i];
    const current = looks[statusKey(slot.status)];
    const cells: [Cell, string, number][] = [
      [ws.getCell(nameRow, col), slot.line, 13],
      [ws.getCell(statusRow, col), slot.status || "—", 8],
      [ws.getCell(noteRow, col), slot.subNote, 8],
    ];
    cells.forEach(([cell, value, size], k) => {
      cell.value = value || null;
      cell.font = { name: "Calibri", size, bold: true, color: { argb: argb(current[k].color) } };
      cell.fill = fill(current[k].fill);
      cell.alignment = { horizontal: k === 0 ? "left" : "center", vertical: "middle", indent: k === 0 ? 1 : 0, wrapText: k > 0 };
    });

    // Status dropdown recolors the box's header, like picking a status in the app.
    const status = ref(col, statusRow, true);
    ws.getCell(statusRow, col).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`"${STATUS_LIST.join(",")}"`],
      showErrorMessage: true,
      errorTitle: "Status",
      error: "Pick Scheduled, Not Scheduled or PM.",
    };
    const s = `TRIM(${status})`;
    const isSched = `${s}="Scheduled"`;
    const isPm = `${s}="PM"`;
    [nameRow, statusRow, noteRow].forEach((row, k) => {
      const rules = [
        cfRule(isSched, looks.scheduled[k]),
        cfRule(isPm, looks.pm[k]),
        cfRule("TRUE", looks["not-scheduled"][k]),
      ];
      rules.forEach((rule, p) => (rule.priority = p + 1));
      ws.addConditionalFormatting({ ref: ref(col, row), rules });
    });

    styleNameRange(ws, col, firstName, lastName, crews[i], settings, roleMap, rosterLast, {
      font: { name: "Calibri", size: 10 },
      align: "center",
      color: "#000000",
      bold: false,
    });
  });

  for (let r = firstName; r <= lastName; r++) {
    ws.getRow(r).height = nameRowHeight(
      crews.map((c) => c[r - firstName] ?? ""),
      charsPerLine,
      10,
    );
  }
  return lastName;
}

function writeRoomBand(
  ws: Worksheet,
  startRow: number,
  band: ListSection[],
  settings: PrintAssignSettings,
  roleMap: Map<string, string>,
  rosterLast: number,
  charsPerLine: number,
): number {
  const headerRow = startRow;
  const styles = band.map((s) => s.style ?? DEFAULT_SECTION_STYLE);
  ws.getRow(headerRow).height = Math.max(...styles.map((st) => st.headerFontSize)) * 1.3 + 9;
  const itemRows = Math.max(0, ...band.map((s) => s.items.length)) + EXTRA_ROWS;
  const firstItem = headerRow + 1;
  const lastItem = headerRow + itemRows;

  band.forEach((section, i) => {
    const col = BOX_COLS[i];
    // A section without its own style keeps the report's standard look.
    const st = section.style ?? DEFAULT_SECTION_STYLE;
    const header = ws.getCell(headerRow, col);
    header.value = section.title || null;
    header.font = {
      name: fontName(st.fontFamily),
      size: st.headerFontSize,
      bold: true,
      color: { argb: argb(section.style ? st.headerTextColor : "#ffffff") },
    };
    header.fill = fill(section.style ? st.headerFillColor : ROOM_HEADER_FILL);
    header.alignment = { horizontal: st.headerAlign, vertical: "middle", indent: st.headerAlign === "center" ? 0 : 1, wrapText: true };

    styleNameRange(ws, col, firstItem, lastItem, section.items, settings, roleMap, rosterLast, {
      font: { name: fontName(st.fontFamily), size: st.textFontSize },
      align: st.textAlign,
      color: st.textColor,
      bold: st.textBold,
    });
  });

  for (let r = firstItem; r <= lastItem; r++) {
    const size = Math.max(...styles.map((st) => st.textFontSize));
    ws.getRow(r).height = nameRowHeight(
      band.map((s) => s.items[r - firstItem] ?? ""),
      charsPerLine,
      size,
    );
  }
  return lastItem;
}

function borderStyle(px: number): ExcelJS.BorderStyle | undefined {
  if (px <= 0) return undefined;
  if (px <= 1) return "thin";
  if (px <= 2) return "medium";
  return "thick";
}

function writeComment(ws: Worksheet, row: number, comment: CommentBox, pageWidthPx: number) {
  ws.mergeCells(row, 1, row, LAST_COL);
  const cell = ws.getCell(row, 1);
  cell.value = comment.text || null;
  const pt = comment.fontSize * 0.75;
  cell.font = {
    name: fontName(comment.fontFamily),
    size: pt,
    bold: comment.bold,
    italic: comment.italic,
    color: { argb: argb(comment.fontColor) },
  };
  cell.fill = fill(comment.backgroundColor);
  cell.alignment = { horizontal: comment.textAlign, vertical: "top", wrapText: true, indent: 1 };
  const style = borderStyle(comment.borderWidth);
  if (style) {
    const side = { style, color: { argb: argb(comment.borderColor) } };
    for (let c = 1; c <= LAST_COL; c++) {
      ws.getCell(row, c).border = {
        top: side,
        bottom: side,
        ...(c === 1 ? { left: side } : {}),
        ...(c === LAST_COL ? { right: side } : {}),
      };
    }
  }
  const charsPerLine = Math.max(10, Math.floor(pageWidthPx / (comment.fontSize * 0.55)));
  const lines = comment.text
    .split("\n")
    .reduce((n, line) => n + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
  ws.getRow(row).height = Math.min(409, pt * 1.35 * lines + 12);
}

export function buildLineAssignmentsWorkbook(
  ExcelJSLib: typeof ExcelJS,
  board: DailyBoard,
  employees: Employee[],
  settings: PrintAssignSettings,
): Workbook {
  const wb = new ExcelJSLib.Workbook();
  wb.creator = "LineUp";
  wb.created = new Date();
  const ws = wb.addWorksheet(SHEET, {
    views: [{ showGridLines: false }],
    pageSetup: {
      orientation: settings.orientation,
      horizontalCentered: true,
      ...(settings.printScaleMode === "fit"
        ? { fitToPage: true, fitToWidth: 1, fitToHeight: 1 }
        : { scale: Math.min(200, Math.max(25, Math.round(settings.printScalePercent) || 100)) }),
    },
  });
  const rosterLast = addRoster(wb, board, employees);
  wb.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: 0, visibility: "visible" }];

  // Column widths from the printed page: Letter inside the margins, six
  // boxes sharing it with a 6px gap between each.
  const marginMm = Math.min(30, Math.max(0, Number(settings.printMarginMm) || 0));
  const marginIn = marginMm / 25.4;
  ws.pageSetup.margins = { left: marginIn, right: marginIn, top: marginIn, bottom: marginIn, header: 0, footer: 0 };
  const pageWidthPx = ((settings.orientation === "landscape" ? 11 : 8.5) - marginIn * 2) * 96;
  const boxPx = (pageWidthPx - 6 * (SLOTS_PER_BAND - 1)) / SLOTS_PER_BAND;
  for (let c = 1; c <= LAST_COL; c++) {
    ws.getColumn(c).width = BOX_COLS.includes(c) ? Math.round(((boxPx - 5) / 7) * 10) / 10 : 0.7;
  }
  const charsPerLine = Math.max(6, Math.floor(boxPx / 6.5));

  // Title
  ws.mergeCells(1, 1, 1, LAST_COL);
  const title = ws.getCell(1, 1);
  title.value = `${board.shiftLabel} | Line Assignments`;
  title.font = { name: "Calibri", size: 20, bold: true, color: { argb: "FFFFFFFF" } };
  title.fill = fill(settings.titleColor);
  title.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 39;

  // Banner: date | safety message | Dept. Leader
  const bannerRow = 2;
  ws.getRow(bannerRow).height = settings.showBanner ? 33 : 27;
  for (let c = 1; c <= LAST_COL; c++) ws.getCell(bannerRow, c).fill = fill(settings.bannerColor);
  const bannerFont = { name: "Calibri", size: 10, bold: true, color: { argb: argb(settings.titleColor) } };
  if (settings.showBanner) {
    ws.mergeCells(bannerRow, 1, bannerRow, 2);
    ws.mergeCells(bannerRow, 3, bannerRow, LAST_COL - 3);
    ws.mergeCells(bannerRow, LAST_COL - 2, bannerRow, LAST_COL);
    const safety = ws.getCell(bannerRow, 3);
    safety.value = settings.bannerText || null;
    safety.font = { name: "Calibri", size: 13, bold: true, color: { argb: argb(settings.bannerTextColor) } };
    safety.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  } else {
    ws.mergeCells(bannerRow, 1, bannerRow, 5);
    ws.mergeCells(bannerRow, LAST_COL - 4, bannerRow, LAST_COL);
  }
  const date = ws.getCell(bannerRow, 1);
  date.value = board.date;
  date.font = bannerFont;
  date.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  const leader = ws.getCell(bannerRow, settings.showBanner ? LAST_COL - 2 : LAST_COL - 4);
  leader.value = `Dept. Leader: ${board.deptLeader || "—"}`;
  leader.font = bannerFont;
  leader.alignment = { horizontal: "right", vertical: "middle", indent: 1, shrinkToFit: true };

  const roleMap = buildRoleMap(employees);
  let row = bannerRow;
  const spacer = (pt: number) => {
    row++;
    ws.getRow(row).height = pt;
  };

  for (const band of chunk(board.lineSlots, SLOTS_PER_BAND)) {
    spacer(6);
    row = writeLineBand(ws, row + 1, band, settings, roleMap, rosterLast, charsPerLine);
  }
  const rooms = settings.includeRoomSections ? board.roomSections : [];
  for (const band of chunk(rooms, SLOTS_PER_BAND)) {
    spacer(10.5);
    row = writeRoomBand(ws, row + 1, band, settings, roleMap, rosterLast, charsPerLine);
  }
  const comments = board.comments.filter((c) => c.includeInPrint);
  comments.forEach((comment, i) => {
    spacer(i === 0 ? 10.5 : 6);
    row++;
    writeComment(ws, row, comment, pageWidthPx);
  });

  ws.pageSetup.printArea = `A1:${colLetter(LAST_COL)}${row}`;
  return wb;
}

export async function exportLineAssignmentsToExcel(board: DailyBoard, employees: Employee[], settings: PrintAssignSettings) {
  const ExcelJSLib = (await import("exceljs")).default;
  const wb = buildLineAssignmentsWorkbook(ExcelJSLib, board, employees, settings);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const shift = board.shiftLabel.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  a.download = `line-assignments-${board.date}${shift ? `-${shift}` : ""}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
