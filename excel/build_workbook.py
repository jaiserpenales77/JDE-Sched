#!/usr/bin/env python3
"""Build excel/JDE_Production_Schedule.xlsm - the Excel replacement for the
JDE Sched web app's Production Schedule tab (only that tab), combined with
the plant's JDE Packaging Schedule printout: line statuses this shift and
next shift, crew, progress bars, changeover types and minutes, and an
estimated finish time for every work order (bottles per hour from the Line
Lead MDI Router, excel/line_rates.csv).

    python3 excel/build_workbook.py          (run from the repo root)
    python3 excel/build_workbook.py --demo   (JDE_Production_Schedule_DEMO.xlsm)

The output is deterministic: the same script always writes byte-identical
files (fixed document timestamps and zip entry dates).

Behaviour is ported from the app's code - src/importColumns.ts (reading any
schedule layout), src/scheduleLogic.ts (grouping, Seq order, calculated
columns, changeover codes, highlights, line status) and
src/components/PrintViews.tsx + src/App.css (the printed report). Every
calculation is a worksheet formula. One small macro (VBA_MODULE below, run by
the workbook's events) only hides 4. Schedule's empty notes rows; without
macros everything still works, those rows just stay visible. Only Excel 2007
functions are used, and every formula that compares a whole range sits inside
SUMPRODUCT, LOOKUP(2,1/(...)), MATCH(1,INDEX(...,0),0) or COUNTIF/COUNTIFS, so
nothing depends on dynamic arrays or Excel 365's implicit-intersection rules.

Sheets (tab order)
------------------
  How To Use          instructions (protected, opens first)
  Guided Setup        five steps with buttons (macros in JDELines) and a
                      status each; step 4's table mirrors 3. Lines rows 4-23
  1. Paste Schedule   the data: today's file pasted at A1 (unprotected)
                      capacity A:BH (60 columns) x rows 1:1000
  2. Check Columns    header row + field -> column mapping, overrides, status
  3. Lines            the shift of this copy, the "schedule as of" time, and
                      per line: status this shift / next shift, breaks &
                      lunch (Yes/No), crew; + today's lines; buttons in row 2
                      (a drawing; macros in JDELines)
  4. Schedule         the printable report (formulas only, protected)
  5. Settings         shift clock (1st shift start, break / lunch hours and
                      their output share), line efficiency, changeover minutes
  6. Line Rates       (hidden) bottles per hour by line and item (unprotected), with a
                      hidden key column F (line number | ITEM)
  7. Washroom         the washroom attendants' prep list: this shift's
                      changeovers, first to last (formulas only, protected)
  8. Products         (hidden) the work orders' items (from the router) to tick Oily or
                      Powdery for 7. Washroom and International or Domestic
                      (unprotected), hidden KEY column J
  Calc                hidden helper sheet (protected), layout below

Workbook-scope defined names
----------------------------
  PASTE_ALL            '1. Paste Schedule'!$1:$1048576 (whole sheet, so the
                       formulas survive inserted/deleted rows and columns)
  HEADER_ROW           '2. Check Columns'!$E$6   header row actually used
  HEADER_ROW_OVERRIDE  '2. Check Columns'!$E$5   input
  COL_OVERRIDES        '2. Check Columns'!$F$13:$F$27  input, field order
  WO_COUNT             '2. Check Columns'!$E$9
  LINE_COUNT           '2. Check Columns'!$E$10
  LINES_NAME / LINES_STATUS / LINES_NEXT / LINES_BREAKS / LINES_CREW
                       '3. Lines'!$A/$B/$C/$D/$E$4:$103
  LINES_SHIFT          '3. Lines'!$C$1  input: 1st / 2nd / 3rd Shift
  LINES_CHECKED_ON     '3. Lines'!$L$1  input: schedule as of (date and time;
                       not today -> red CHECK on 3. Lines + 4. Schedule)
  SET_START, SET_BREAK1, SET_BREAK2, SET_LUNCH, SET_FBREAK, SET_FLUNCH,
  SET_EFF, SET_CO_S1, SET_CO_CNT, SET_CO_S3, SET_CO_S4   '5. Settings'!$C$..
  SCHED_KIND / SCHED_HL / SCHED_STATUS / SCHED_SCHEDULED
                       '4. Schedule'!$S/$T/$AC/$AD$5:$2104 (hidden helpers)
  '4. Schedule' also has a sheet-scoped _xlnm.Print_Area =
  '4. Schedule'!$A$1:INDEX('4. Schedule'!$Q$1:$Q$704,Calc!$B$14) so the
  printout stops at the last used row, and _xlnm.Print_Titles = rows 1:4.

'4. Schedule' rows 1-4: title band and shift, subtitle (shift, date, as of) +
status legend, one-line summary (or the warnings) + changeover / row legend,
column titles. From row 5, each line is a box: column A has the line name
and right under it its status tag in the middle of the box (the tag on the
middle row, with the NEXT SHIFT chip; a one-row line shows the status by the
cell color). Each report slot (a work order, or a blank between two lines) is
three rows: the work order's row, then two thin notes rows, each one cell
merged from SQ to EST. TIME in small italics - "Changeover Notes: ..." (only
when the changeover into it starts before the end of the shift) and under it
"Remarks: ...". The macro hides the empty notes rows (column AU). The gap
between two lines is the empty changeover notes row of the first one's last
work order, or a blank slot when that work order has notes. Hidden columns
S:AU hold the helpers and the look codes the conditional formats test (one
rule per code, so one rule is true per cell).

Estimated times: per line, in Seq order, the work in full-hour equivalents
(changeover minutes / 60 + bottles left / (bottles per hour x efficiency)) is
added up from "schedule as of". On a line without breaks a full hour is a
clock hour. On a line with breaks the shift clock (Calc rows 70-72) gives each
of the next 8 hours its output share (lunch 4/7, break 6/7, else 1): the work
fills what is left of the current hour, then whole 8-hour shifts, then the
hours of the last one.

No CHAR() above 127 and nothing below CHAR(32) except 9/10/13: the
non-breaking space, the other non-ASCII characters column-title normalization
removes (NORM1_CHARS) and the duplicate-key separator (U+241F) are typed into
the formula text (see NBSP / SEP below).

Calc sheet layout (row 3 = band titles, row 4 = column labels, data from 5)
------------------------------------------------------------------------
  A:B    scalars (label in A, value in B), rows 5-63, in SCALARS order:
         B5 auto header row, B6/B7 parsed header-row override + valid flag,
         B8 LEGEND row (1001 = none), B9 work orders in rows 1-1000, B10 work
         orders kept (max 600), B11 lines, B12 rows the report needs (work
         orders + spacers), B13 rows shown (max 700), B14 last print row,
         B15-B18 window row / paste row of the first and last work order,
         B19 work orders past 600, B20 cells below row 1000, B21 cells right
         of BH, B22 report rows that don't fit, B23 lines past 100, B24/B25
         Line / WO # column missing, B26 paste sheet empty, B27 no header row
         in rows 1-40, B28/B29 kept rows that look like a row of column
         titles (old data left on the sheet) + the first one's paste row, B30 overrides worth a
         look, B31 capacity warnings, B32 status text, B33 status OK flag,
         B34 3. Lines statuses not dated today, B35 4. Schedule typed on
         (its TYPED column: cells that differ from Calc), B36 warnings for 4. Schedule,
         B37 Line column, B38/B39 first / last work order text, B40 kept
         rows whose WO # is on an earlier kept row (old rows left on the
         sheet), B41 window row of the first one, B42 its text, B43 status OK
         apart from those, B44 this computer's decimal separator (VALUE()
         follows the regional settings; "." is swapped for it first), B45/B46
         window row / paste row of the example row (the first work order, or
         the first filled row under the titles when there is none),
         B47 work orders with notes, B48 schedule as of, B49/B50 this / next shift,
         B51-B55 shift clock now (hours into the shift, hour 1-8, share of
         this hour left, its output share, a whole shift's output), B56/B57
         next changeover time and its window row, B58 summary line, B59
         subtitle, B60 the warnings on one line, B61 the end of the shift,
         B62/B63 minor / major changeovers from as-of to then
  A70:J72 shift clock: row 71 the output share of hour +1..+8, row 72 the
         running total S0..S8
  D:R    field table, rows 5-19 (one per import field, app order), and row
         20 for Cotton (the COT column - not an app field: found by its exact
         title among the columns no field uses, or its Override on
         2. Check Columns row 28; it takes no part in the header scan):
         D index, E key, F label, G 2^index, H override text, I override
         parsed (0 auto, -1 "-", -2 invalid, else column no. - from a letter
         A-BH, or from a column title: the first column of the header row
         whose normalized title matches), J override in
         effect (0 if another field already took that column), K column
         found automatically, L column used, M/N their letters, O header
         text of the used column, P example (first work order), Q note,
         R 1 = override worth a look (differs from automatic / displaces one
         / a letter for a field the titles don't give)
  S:T    column numbers 1-60 and letters A-BH (rows 5-64)
  U      override text, normalization stage 1 (rows 5-20)
  V:W    EXACT header aliases (normalized) -> field index
  Y:CF   header scan, one column per pasted column 1-60, one row per pasted
         row 1-40, in six blocks:
           rows 245-284 normalization stage 1 (upper case, control and
                        non-ASCII punctuation / spaces removed)
           rows   5-44  normalized header text (stage 2: ASCII punctuation
                        removed too - A-Z/0-9 only)
           rows  50-89  cell type: 0 empty, 1 text, 2 plain number
           rows  95-134 EXACT alias field index (0 = none)
           rows 140-179 CONTAINS-rule bit mask (bit f = field f's rule)
           rows 185-224 running mask of fields claimed by CONTAINS rules
                        (left to right, skipping fields/columns already
                        taken; same result as the app's field-by-field loop)
         CH:CM rows 5-44: filled cells, numbers, EXACT mask, CONTAINS mask,
         fields mapped, score (fields + 2 Line + 2 WO - numbers; rows with
         fewer than 2 filled cells can't win)
         rows 230-239: the header row actually used (HEADER_ROW):
           230 normalized, 231 EXACT field, 232 CONTAINS mask,
           233-235 automatic mapping (EXACT claim, CONTAINS running mask,
           field), 236 overriding field, 237 EXACT claim, 238 CONTAINS
           running mask, 239 field used (overrides first, then EXACT, then
           CONTAINS - like the app's remembered picks, known names, rules)
           241 normalization stage 1 of the header row used
         CH233 EXACT mask (auto), CH236 overridden-fields mask,
         CH237 EXACT mask (with overrides)
  DA:DC  pasted rows 1-1000 (rows 5-1004): row no., trimmed Line, LEGEND flag
  DE:GL  the window: every pasted row under the header down to row 1000
         (rows 5-1003), one row per pasted row HEADER_ROW+k: k, paste row,
         in range, line, row key (the 60 cells joined with U+241F, trimmed),
         duplicate, kept before the cap, running count, kept (the first 600),
         the other fields (WO Qty and % Complete as cleaned text, then the
         number), first kept row of the line, first-of-line flag, line
         count, line no., Seq anchor (LOOKUP(2,1/...)), Seq key, Seq group
         (0 blank, 1 number, 2 text), Seq value, rank, report position, row
         in '3. Lines', running (RUNNING / PARTIAL SHIFT / OVERTIME), status
         shown, highlight, % actual, bottles remaining, first kept row with
         the same WO # (EXACT), looks like a row of column titles, filled
         cells of the row (only for the example row); then EX:GL: line
         number, name shown, next shift, breaks, crew (from LB), the work
         order before it on the line, first-of-line flag, changeover code and
         minutes, cap change, cotton (its own, the one before it, Add /
         Remove / Change Cotton), desiccant (its own, Add / Remove / Change
         Desiccant), cap + 2 x count + 4 x bottle changed, the changeover
         notes (blank when the changeover starts after the end of the
         shift) and their list (any time), oily (7. Washroom), the
         changeover's start in minutes when within this shift and its
         place in time order, remark, the notes rows' texts (Changeover Notes: ...,
         Remarks: ...), rate key, bottles per hour, bottles, full-hour equivalents, no rate,
         running total, the shift-clock steps (F2, whole shifts, rest, hour),
         estimated time (number, text), next changeover, when the changeover
         into it starts, progress / changeover
         text, left / minutes text, CAP as size-type
  GN:IB  the report, 700 slots (row 4 + p = slot p = 4. Schedule rows
         2 + 3p to 4 + 3p): slot, window row, kind (row/spacer/""), first/last
         of line, then the 17 printed columns A:Q side by side (GS:HI), then
         the helpers, the line no., the slot's role in LINE / NEXT SHIFT
         (name, status tag, other, one-slot line) and the two notes rows
  ID:JB  today's lines 1-100 (rows 5-104), row n = the line with line no. n:
         no., window row, name, work orders, line number, matching key, row
         on 3. Lines, name shown, status from the file, status typed, status
         shown, running, next shift, breaks, crew, note, the lines that are
         NOT IN YOUR LIST one after the other (flag, running count, name), and
         the line's row in the left table of '3. Lines', a blank slot after
         it (its last work order has notes), the blank slots before it, its
         box on 4. Schedule (first report slot, slots, the name's slot)
  JD:JJ  3. Lines rows 1-100: line number, matching key (the number, or
         N:NAME without one), first row with the same key, status this shift
         and next (standard spelling), breaks, crew
"""

import io
import textwrap
import re
import sys
import zipfile
from datetime import datetime
from pathlib import Path

from openpyxl import Workbook
from openpyxl.formatting.rule import Rule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Protection, Side
from openpyxl.styles.differential import DifferentialStyle
from openpyxl.utils import get_column_letter as L
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.workbook.protection import WorkbookProtection
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.worksheet.pagebreak import Break
from openpyxl.worksheet.properties import PageSetupProperties

OUT = Path(__file__).resolve().parent / "JDE_Production_Schedule.xlsm"
FIXED_TIME = datetime(2026, 10, 7, 12, 0, 0)

# ----------------------------------------------------------------------------
# Capacities
PASTE_ROWS = 1000      # 1. Paste Schedule rows read
PASTE_COLS = 60        # A:BH
SCAN_ROWS = 40         # header search (app: first 40 rows)
WIN = PASTE_ROWS - 1   # window: every pasted row under the header, down to row 1000
MAX_WO = 600           # work orders kept (the first 600, in paste order)
OUT_ROWS = 700         # report slots: a work order or the blank between two lines, 2 rows each
LINE_SLOTS = 100       # 3. Lines rows

# Characters typed into formulas instead of CHAR(): CHAR(160) is only a
# non-breaking space in Windows/ANSI Excel (Excel for Mac and LibreOffice map
# it through another character set), and Excel for the web only supports
# CHAR(9), CHAR(10), CHAR(13) and CHAR(32) and above. Formula text is Unicode
# everywhere, so a typed character works the same on every platform.
NBSP = " "
SEP = "␟"         # joins the cells of a row for the duplicate check

S_HOW, S_SETUP, S_PASTE, S_CHECK, S_LINES, S_SCHED, S_SET, S_RATES, S_WASH, S_PROD, S_CALC = (
    "How To Use", "Guided Setup", "1. Paste Schedule", "2. Check Columns", "3. Lines", "4. Schedule", "5. Settings",
    "6. Line Rates", "7. Washroom", "8. Products", "Calc")
PASTE, CHECK, LINES, SCHED = "'1. Paste Schedule'", "'2. Check Columns'", "'3. Lines'", "'4. Schedule'"
SETTINGS, RATES, WASH, PRODS = "'5. Settings'", "'6. Line Rates'", "'7. Washroom'", "'8. Products'"
PROD_ROWS = 1000        # 8. Products rows 5:1004
PRODUCTS_CSV = Path(__file__).resolve().parent / "products.csv"
WASH_ROWS = 150         # 7. Washroom: up to 150 changeovers (rows 5:154)
# softgels are marked SG, LSG or S/G in the item description (9 more cells to add words)
OILY_WORDS = ["SG", "LSG", "S/G"] + [""] * 9
RATE_ROWS = 5000        # 6. Line Rates rows 5:5004
RATES_CSV = Path(__file__).resolve().parent / "line_rates.csv"

# Import fields, in the app's order (src/importColumns.ts IMPORT_FIELDS).
FIELDS = [
    ("line", "Line"), ("wo", "WO #"), ("seq", "Seq"), ("item", "Item"),
    ("desc", "Product Description"), ("count", "Count"), ("bulk", "Bulk Item"),
    ("bottle", "Bottle Size"), ("cap", "Cap Description"), ("allergen", "Allergen"),
    ("remarks", "Remarks"), ("qty", "WO Qty"), ("pct", "% Complete"),
    ("status", "Line Status"), ("desiccant", "Desiccant"),
]
FI = {k: i + 1 for i, (k, _) in enumerate(FIELDS)}
# Cotton (the JDE file's COT column): read like a field, but not one of the
# app's - it takes no part in finding the header row or the other columns. It
# is found by its exact title (normalized) among the columns no field uses,
# or by its Override (2. Check Columns row 28), and shows in the changeover
# notes (Add / Remove / Change Cotton).
COT_FIDX = len(FIELDS) + 1                  # field table row FT_ROW0 + 15 (Calc row 20)
COT_ALIASES = ["COT", "COTTON", "COTTONS", "COTTONBALL", "COTTONBALLS", "COTTONCOIL"]
COT_CHECK_ROW = 12 + COT_FIDX               # 2. Check Columns row 28

# Titles that definitely mean a field (src/importColumns.ts EXACT, normalized).
EXACT = {
    "line": ["LINE", "WORKCENTER", "WC", "LINENUMBER", "LINENO", "PRODUCTIONLINE", "LINEID"],
    "wo": ["WO", "WONUMBER", "WONO", "WORKORDER", "WORKORDERNUMBER", "WORKORDERNO", "ORDERNUMBER", "ORDERNO", "ORDER"],
    "seq": ["SEQ", "SEQUENCE", "SEQUENCENUMBER", "SEQNO", "SEQNUMBER", "STEP", "OPSEQ", "OPERATIONSEQ"],
    "item": ["ITEM", "ITEMNUMBER", "ITEMNO", "2NDITEMNUMBER", "SKU", "PART", "PARTNO", "PARTNUMBER"],
    "desc": ["PRODUCTDESCRIPTION", "DESCRIPTION", "2NDITEMNUMBERDESCRIPTION", "ITEMDESCRIPTION", "PRODUCT", "PRODUCTNAME"],
    "count": ["COUNT", "BOTTLECOUNT", "BOTTLECT", "BTLCT", "BTLCOUNT", "CT", "CNT"],
    "bulk": ["BULKITEM", "BULK", "BULKITEMNUMBER"],
    "bottle": ["BOTTLESIZE", "BTLSIZE", "BOTTLE", "SIZE"],
    "cap": ["CAPDESCRIPTION", "CAP", "CLOSURE"],
    "allergen": ["ALLERGEN", "ALLERGENCODE", "ALLERGENS"],
    "remarks": ["REMARKS", "REMARK", "NOTES", "NOTE", "COMMENTS", "COMMENT"],
    "qty": ["WOQUANTITY", "QUANTITY", "QTY", "WOQTY", "BATCHQUANTITY", "ORDERQUANTITY", "ORDERQTY"],
    "pct": ["COMPLETE", "PERCENTCOMPLETE", "PCTCOMPLETE", "WOCOMPLETED", "COMPLETED"],
    "status": ["LINESTATUS", "STATUS"],
    "desiccant": ["DESICCANT", "DESICCANTS", "DESICCANTNUMBER", "DESICCANTSNUMBER"],
}

# Sample work orders = src/seedData.ts seedWorkOrders (line status and
# desiccant are blank there). Text columns stay text, like the app's export.
# Sample work orders (the JDE Packaging Schedule printout of Oct 29, 2026, as a
# JDE paste would have them; % Complete read from its progress dots).
# (line, wo, seq, item, description, count, bulk, bottle, cap, allergen,
#  remarks, WO qty, % complete, desiccant)
SAMPLE = [
    ('VPKL01', '2688636', '2', 'HL000669', 'VITAMIN D3 + K2 WMT', '60', 'A845', '150', 'CAP 38MM CT WHITE 116', 'N', '', 62567, 29.7, ''),
    ('VPKL03', '2684428', '2', '2750SUB', 'PRENATAL MULTI W/DHA LSG SUB', '150', 'BU001268', '500', 'CAP 45MM CRC WHITE', 'N', '', 32901, 2.7, 'P-OR'),
    ('VPKL03', '2685239', '3', '2750SUB', 'PRENATAL MULTI W/DHA LSG SUB', '150', 'BU001268', '500', 'CAP 45MM CRC WHITE', 'N', '', 29664, 0, 'P-OR'),
    ('VPKL05', '2687675', '1', '3049', 'CHOLEST-OFF PLUS', '210', 'BU001375', '625', 'CAP 53MM CT YELLOW 116 V', 'N', '', 38094, 47.5, ''),
    ('VPKL05', '2687975', '2', '3049', 'CHOLEST-OFF PLUS', '210', 'BU001375', '625', 'CAP 53MM CT YELLOW 116 V', 'N', 'Labels are short due to over-issuing to WO 2687675. Please request labels once the previous order is complete.', 22472, 0, ''),
    ('VPKL05', '2687185', '3', '2883', 'MAGNESIUM 400MG LSG', '150', 'BU001299', '500', 'CAP 45MM CT YELL 116 V', 'N', '', 25393, 0, 'P'),
    ('VPKL07', '2687203', '1', 'HL000430', 'FISH OIL 1200MG BPLESS SAMS', '240', 'A420PE', '950', 'CAP 53MM CT YELLOW 116 V', 'N', '', 23390, 70.1, ''),
    ('VPKL07', '2686309', '2', 'HL000297', 'FISH OIL 2400MG SG NM COSTCO', '300', 'A419PE', '950', 'CAP 53MM CT YELLOW 116 V', 'N', '', 34811, 0, ''),
    ('VPKL08', '2688841', '3', '3184', 'FISH OIL 600 MG BURP-LESS', '230', 'A593PE', '625', 'CAP 53MM CT YELLOW 116 V', 'N', '', 24159, 50.3, ''),
    ('VPKL08', '2687178', '4', '2895', 'MAGNESIUM CITRATE SG', '120', 'A685AC', '400', 'CAP 45MM CT YELL 116 V', 'N', '', 19917, 0, ''),
    ('VPKL08', '2688248', '5', '3076', 'ULTRA OMEGA-3 FISH OIL 1400MG', '100', 'BU001123', '400', 'CAP 45MM CT YELL 116 V', 'N', '', 19089, 0, 'P-LM'),
    ('VPKL09', '2687168', '3', '2664', 'FISH OIL ONE PER DAY BURP-LESS', '120', 'A592AB', '400', 'CAP 45MM CT YELL 116 V', 'N', '', 15033, 26.8, ''),
    ('VPKL09', '2687258', '4', '3006', 'TURMERIC 500MG', '120', 'A624', '300', 'CAP 45MM CT YELL 116 V', 'N', '', 26777, 0, ''),
    ('VPKL09', '2687151', '5', '1882', 'VITAMIN E 400IU DLA', '300', '505AX', '300', 'CAP 45MM CT YELL 116 V', 'N', '', 28742, 0, ''),
    ('VPKL10', '2686735', '3', '4375', 'FISH OIL MINIS', '60', 'BU001043', '150', 'CAP 38MM CT WHITE 116', 'N', '', 33250, 0, 'P-LM'),
    ('VPKL10', '2687671', '4', '2837', 'POST NATAL MULTI S/G', '60', 'A826AB', '225', 'CAP 45MM CRC WHITE', 'N', '', 22836, 0, 'P-OR'),
    ('VPKL10', '2686734', '5', '2517', 'CALCIUM 500MG W/D', '130', 'BU001106', '225', 'CAP 45MM CT YELL 116 V', 'N', '', 30634, 0, ''),
    ('VPKL12', '2687974', '3', '2697', 'ULTRA OMEGA-3 FISH OIL 1400MG', '45', 'BU001123', '225', 'CAP 45MM CT YELL 116 V', 'N', 'PULL 4 SAMPLES FOR QA.', 22826, 25.5, 'P-LM'),
    ('VPKL12', '2687473', '4', '4313', 'MAGNESIUM GLYCINATE CAPSULE', '60', 'BU001333', '225', 'CAP 45MM CT YELL 116 V', 'N', '', 42721, 0, ''),
    ('VPKL12', '2686312', '5', '4345', 'VITAMIN D3 + K2', '30', 'A845', '150', 'CAP 38MM CT WHITE 116', 'N', '', 77667, 0, ''),
]
# The app's Excel export columns (src/excel.ts SCHEDULE_HEADERS).
EXPORT_HEADERS = ["LINE", "WO", "SEQ", "ITEM", "PRODUCT DESCRIPTION", "Count", "Bulk Item", "Bottle Size",
                  "CAP DESCRIPTION", "Allergen", "REMARKS", "WO Quantity", "% Complete", "% Actual Complete",
                  "Bottles Remaining", "CHANGEOVER", "Line Status", "Desiccant"]

# Row highlights and the count-change red (src/seedData.ts defaultSchedulePrintSettings).
C_HEADER, C_ALLERGEN, C_OIL, C_BULK = "D9D9D9", "F8CBAD", "FFF2CC", "BDD7EE"
C_INTL = "DDEBF7"            # International on 8. Products
C_COUNT_CHANGED = "FF0000"

# 4. Schedule columns: (title, Calc output key). The layout combines the app's
# report with the JDE Packaging Schedule printout: short titles, quantities
# with commas, progress bars and changeover types in one column, bottles left
# or changeover minutes in the next, the crew (EE), an estimated finish time
# for every work order and the line's next-shift status at the right edge.
# Remarks (and the app's "Cap Change") print on their own row under the work
# order, across the table, so they are never cut off.
SCHED_COLS = [
    ("LINE", "o_line"), ("WO", "o_wo"), ("SQ", "o_seq"), ("ITEM", "o_item"),
    ("ITEM DESCRIPTION", "o_desc"), ("CT", "o_count"), ("BULK", "o_bulk"), ("BTL", "o_bottle"),
    ("CAP", "o_cap"), ("A", "o_allergen"), ("DES", "o_desiccant"), ("WO QTY", "o_qty"),
    ("PROGRESS / CHANGEOVER", "o_prog"), ("LEFT / C.O.", "o_left"), ("EE", "o_crew"),
    ("EST. TIME", "o_est"), ("NEXT SHIFT", "o_next"),
]
# Font sizes (points). Nothing but the notes row (STRIP_PT) is smaller than
# the 8 pt body text: real Excel draws Calibri below 8 pt without ClearType and
# with much wider glyphs, so small column titles broke mid-word (the notes row
# shrinks to fit). On screen Excel draws 8 and 8.5 pt Calibri alike, 11 pixels
# high; printed, 8 pt is smaller.
TITLE_PT, DATE_PT, HEADER_PT, BODY_PT, LINE_PT = 20, 11, 9, 8, 8.5
ROW_HEIGHT = 11.25     # points: one line of 8 pt text
# Column widths (Excel units). Excel gives a column of width w trunc(7w+0.49)
# pixels, 5 of them padding, and draws Calibri with every letter rounded to
# whole pixels - tighter than LibreOffice. Each column fits the longest word
# of its title in 9 pt bold and a typical value in 8 pt (WO 2682056, ITEM
# HL000430, BULK BU001565, a 6-digit quantity, a ten-segment progress bar and "100%",
# "10/29 12:51 PM"). Longer values shrink to fit.
SCHED_WIDTHS = {
    "LINE": 11.0, "WO": 7.3, "SQ": 3.6, "ITEM": 8.1, "ITEM DESCRIPTION": 25.0, "CT": 4.4, "BULK": 8.3,
    "BTL": 4.6, "CAP": 7.0, "A": 3.0, "DES": 5.2, "WO QTY": 7.2, "PROGRESS / CHANGEOVER": 15.5,
    "LEFT / C.O.": 7.6, "EE": 3.4, "EST. TIME": 12.2, "NEXT SHIFT": 12.0,
}
SHRINK_COLS = {key for _, key in SCHED_COLS}     # every column: long values shrink to fit
# Each work order has three rows on 4. Schedule: its row, then two thin notes
# rows merged from SQ to EST. TIME, in small italics: "Changeover Notes: ..."
# and under it "Remarks: ..." (each shrinks to fit when long). The notes rows
# are there for every work order (a formula's text can't spill into the next
# cell, and merged cells, row heights and font sizes can't follow the data);
# the macro hides the empty ones.
STRIP_PT = 6.5
STRIP_HEIGHT = 9.0     # points: one line of 6.5 pt text
# the cap / count / bottle part of the changeover notes, by cap + 2 x count +
# 4 x bottle changed (Calc C5:C11)
CO_SIZE = ["Cap Change", "Count Change", "Cap & Count Change", "Bottle Change", "Cap & Bottle Change",
           "Count & Bottle Change", "Cap, Count & Bottle Change"]
CO_SIZE_COL = "C"
NONE_VALUES = ("N", "NO", "0", "-", "FALSE", "NONE")      # a cotton or desiccant that is none

# Line statuses (3. Lines This shift / Next shift), as on the JDE Packaging
# Schedule's border legend: (status, strong color, text on it, light tint).
# READY / PM / OT from the app (and a file's Line Status column) map to
# READY LINE / PM / CLEANING / OVERTIME.
STATUSES = [
    ("RUNNING", "2E7D32", "FFFFFF", "E2F0D9"),
    ("PARTIAL SHIFT", "ED7D31", "FFFFFF", "FBE5D6"),
    ("OVERTIME", "FFC000", "000000", "FFF2CC"),
    ("READY LINE", "7030A0", "FFFFFF", "E4DFEC"),
    ("PM / CLEANING", "0070C0", "FFFFFF", "DDEBF7"),
    ("NOT SCHEDULED", "8C8C8C", "FFFFFF", "EDEDED"),
]
STATUS_NAMES = [st for st, _, _, _ in STATUSES]
# the status chips (under the line name, NEXT SHIFT): bold text in this ink on
# the status's light tint (gold and orange darker, to read on the tint)
STATUS_INK = {"RUNNING": "2E7D32", "PARTIAL SHIFT": "C55A11", "OVERTIME": "9C6500", "READY LINE": "7030A0",
              "PM / CLEANING": "0070C0", "NOT SCHEDULED": "6E6E6E"}
# Statuses whose line is producing this shift: they get estimated times.
RUN_STATUSES = ["RUNNING", "PARTIAL SHIFT", "OVERTIME"]
C_TITLE, C_SUBTITLE, C_COLHEAD = "1F3864", "DDEBF7", "2E75B6"
C_NOTE_FILL, C_NOTE_TEXT, C_NOT_SCHED_TEXT = "FFF8E1", "7F6000", "A6A6A6"
# Changeover type labels (PROGRESS / CHANGEOVER column) and their text colors
# (the app's on-screen colors: S1 green, Count Change amber, S3 purple, S4 red).
CO_LABELS = [("S1", "Minor · S1", "2E7D32"), ("S1 Count Change", "Minor · Count", "B45309"),
             ("S3", "MAJOR · S3", "7030A0"), ("S4", "MAJOR · S4", "C00000")]

# ----------------------------------------------------------------------------
# Formula helpers

PW = "{" + ",".join(str(2 ** i) for i in range(1, 16)) + "}"        # 2^field
FIDX = "{" + ",".join(str(i) for i in range(1, 16)) + "}"
ALNUM = "{" + ",".join(f'"{c}"' for c in "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") + "}"
# normalizeHeader() drops every character that isn't A-Z / 0-9. Excel 2007 has
# no regular expressions, so the characters are removed one SUBSTITUTE at a
# time, in two stages (two cells) so no formula nests deeper than about 40:
#   stage 1 (NORM1_CHARS): upper case, then tab / line feed / carriage return
#     and the non-ASCII punctuation and spaces column titles pick up (dashes,
#     curly quotes, the numero sign, degree / ordinal signs, bullets,
#     zero-width and other special spaces, ...), typed into the formula
#   stage 2 (STRIP_CHARS): every printable ASCII character that isn't a
#     letter or digit
# Not covered: accented letters (the app drops the É of "NÚMERO"; Excel keeps
# it) and rarer symbols - the Override box handles such a title.
STRIP_CHARS = list(" !\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~")
NORM1_CHARS = [NBSP] + [chr(c) for c in (
    0x2013, 0x2014, 0x2012, 0x2010, 0x2011, 0x2212,   # dashes, minus sign
    0x2018, 0x2019, 0x201A, 0x201C, 0x201D, 0x00B4,   # curly quotes, acute accent
    0x2026, 0x2116, 0x00B0, 0x00BA, 0x00AA, 0x00B7,   # ellipsis, numero, degree, ordinals, middle dot
    0x2022, 0x00D7, 0x00AE, 0x2122, 0x00A9, 0x00A7,   # bullet, multiplication, (R), TM, (C), section
    0x200B, 0x200C, 0x200D, 0x2060, 0xFEFF, 0x00AD,   # zero-width characters, soft hyphen
    0x2009, 0x202F, 0x2002, 0x2003, 0x2007, 0x3000)]  # thin / narrow / en / em / figure / ideographic space


def lit(ch):
    return "CHAR(34)" if ch == '"' else '"' + ch + '"'


def norm1_expr(x):
    """normalizeHeader(), stage 1: upper case, control characters and
    non-ASCII punctuation / spaces removed ("" for an error value)."""
    e = f"UPPER({x})"
    for code in (9, 10, 13):
        e = f'SUBSTITUTE({e},CHAR({code}),"")'
    for ch in NORM1_CHARS:
        e = f'SUBSTITUTE({e},"{ch}","")'
    return f'IFERROR({e},"")'


def norm2_expr(x):
    """normalizeHeader(), stage 2 (x = a stage-1 cell): ASCII punctuation and
    spaces removed, leaving letters and digits."""
    e = x
    for ch in STRIP_CHARS:
        e = f'SUBSTITUTE({e},{lit(ch)},"")'
    return e


def lnorm_expr(x):
    """A light normalization (upper case; space . # - _ / : removed) - enough
    to spot a row of column titles among the work orders."""
    e = f"UPPER({x})"
    for ch in " .#-_/:":
        e = f'SUBSTITUTE({e},"{ch}","")'
    return e


def clean(x):
    """Non-breaking space, tab, line feed and carriage return -> a space (one
    character for one, so positions don't move). JS trim() removes them at
    the ends of a value; Excel's TRIM only removes spaces."""
    return (f'SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE({x},"{NBSP}"," "),CHAR(9)," "),'
            f'CHAR(10)," "),CHAR(13)," ")')


def ttrim(x):
    """cellString(): the trimmed text of a cell."""
    return f"TRIM({clean(x)})"


def strip_chars(e, chars):
    for ch in chars:
        e = f'SUBSTITUTE({e},"{ch}","")'
    return e


def celltype_expr(x):
    """0 empty, 1 text, 2 a plain number (number cell, or /^-?[\\d.,]+%?$/)."""
    t = f"TRIM({x})"
    u = f'MID({t},1+(LEFT({t},1)="-"),999)'
    v = f'LEFT({u},LEN({u})-(RIGHT({u},1)="%"))'
    d = strip_chars(v, "0123456789.,")
    return f'IFERROR(IF(ISNUMBER({x}),2,IF({t}="",0,IF(AND({v}<>"",{d}=""),2,1))),1)'


def has(s, h):
    return f'ISNUMBER(FIND("{s}",{h}))'


def rule_mask_expr(h):
    """Bit mask of the app's CONTAINS rules that match normalized header h."""
    rules = [
        (1, f'OR({has("WORKCENTER", h)},AND(LEFT({h},4)="LINE",NOT({has("STATUS", h)})))'),
        (2, f'OR({has("WORKORDER", h)},AND(LEFT({h},2)="WO",OR({has("NUM", h)},RIGHT({h},2)="NO")))'),
        (3, f'LEFT({h},3)="SEQ"'),
        (4, f'AND(LEFT({h},4)="ITEM",NOT({has("DESC", h)}))'),
        (5, f'AND({has("DESC", h)},NOT({has("CAP", h)}))'),
        (6, f'OR(RIGHT({h},5)="COUNT",RIGHT({h},2)="CT")'),
        (7, has("BULK", h)),
        (8, has("SIZE", h)),
        (9, f'LEFT({h},3)="CAP"'),
        (10, has("ALLERG", h)),
        (11, f'OR({has("REMARK", h)},{has("COMMENT", h)})'),
        (12, f'OR({has("QTY", h)},{has("QUANTITY", h)})'),
        (13, f'AND(OR({has("COMPLETE", h)},{has("PCT", h)},{has("PERCENT", h)}),NOT({has("ACTUAL", h)}),LEN({h})<=16)'),
        (15, f'OR({has("DESIC", h)},{has("DESSIC", h)})'),
    ]
    return f'IF({h}="",0,' + "+".join(f"{2 ** i}*({e})" for i, e in rules) + ")"


def lowbit_expr(cm, used):
    """Lowest field bit that is set in cm and not in used (0 if none)."""
    a = f"SUMPRODUCT(MOD(INT({cm}/{PW}),2)*(1-MOD(INT(({used})/{PW}),2))*{PW})"
    return f"IF({a}=0,0,2^SUMPRODUCT(--(MOD({a},{PW})=0)))"


def popcount(m):
    return f"SUMPRODUCT(MOD(INT(({m})/{PW}),2))"


def bit_set(m, f):
    return f"MOD(INT(({m})/{2 ** f}),2)"


def numeric_text_ok(s):
    """Text shaped like a decimal number JS Number() accepts: digits, at most
    one '.', at most one E, a sign only first or right after the E, and no
    '.' after the E. Checked before VALUE(), because Excel's VALUE() also
    reads '1-2', '10-20' or '2026-10-07' as dates and '19780-' as -19780,
    where JS Number() gives NaN. s should be a short expression (a cell)."""
    u = f"UPPER({s})"
    m = f'MID({u},1+OR(LEFT({u},1)="+",LEFT({u},1)="-"),999)'
    m2 = f'SUBSTITUTE(SUBSTITUTE({m},"E+","E"),"E-","E")'
    return (f'AND({strip_chars(u, "0123456789.+-E")}="",'
            f'LEN({m2})=LEN(SUBSTITUTE(SUBSTITUTE({m2},"+",""),"-","")),'
            f'LEN({u})-LEN(SUBSTITUTE({u},"E",""))<2,'
            f'LEN({u})-LEN(SUBSTITUTE({u},".",""))<2,'
            f'IFERROR(FIND(".",{u}),0)<IFERROR(FIND("E",{u}),999))')


def num_value(s):
    """VALUE() of number text written with a "." decimal point, whatever the
    computer's regional settings: the "." becomes this computer's decimal
    separator (Calc scalar "dec") first. numeric_text_ok() has already made
    sure there is no "," and at most one "."."""
    return f'VALUE(SUBSTITUTE({s},".",{SL["dec"]}))'


def paste(r, c):
    return f"INDEX(PASTE_ALL,{r},{c})"


# ----------------------------------------------------------------------------
# Styles

FONT = "Calibri"


def font(size=10, bold=False, color="000000", italic=False):
    return Font(name=FONT, size=size, bold=bold, color="FF" + color, italic=italic)


def fill(color):
    return PatternFill(fill_type="solid", start_color="FF" + color, end_color="FF" + color)


def side(color, style="thin"):
    return Side(style=style, color="FF" + color)


THIN_BLACK = Border(*(side("000000") for _ in range(4)))
THIN_GRAY = Border(*(side("BFBFBF") for _ in range(4)))
UNLOCKED = Protection(locked=False)
INPUT_FILL = fill("FFF2A8")


def put(ws, ref, value, **style):
    c = ws[ref]
    c.value = value
    for k, v in style.items():
        setattr(c, k, v)
    return c


def protect(ws, **allow):
    ws.protection.sheet = True
    for k, v in allow.items():
        setattr(ws.protection, k, v)


def cf(ws, rng, formula, fill_color=None, font_=None, border=None):
    # Conditional formats can only change bold/italic/colour, not the font or
    # size - and never the number format: a number format inside a conditional
    # format leaked into the next column in real Excel (a bottle count showed
    # as 459300.0%).
    if font_ is not None:
        font_ = Font(bold=font_.bold, italic=font_.italic, color=font_.color)
    dxf = DifferentialStyle(font=font_, fill=fill(fill_color) if fill_color else None, border=border)
    ws.conditional_formatting.add(rng, Rule(type="expression", dxf=dxf, formula=[formula], stopIfTrue=True))


def fit_width(ws, orientation):
    ws.page_setup.orientation = orientation
    ws.page_setup.paperSize = ws.PAPERSIZE_LETTER
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
    ws.page_margins.left = ws.page_margins.right = 0.4


def add_name(wb, name, ref):
    wb.defined_names[name] = DefinedName(name, attr_text=ref)


# ----------------------------------------------------------------------------
# Calc sheet

class Band:
    """A block of named Calc columns."""

    def __init__(self, start_col, names):
        self.col = {n: L(start_col + i) for i, n in enumerate(names)}
        self.end = start_col + len(names) - 1

    def __getitem__(self, n):
        return self.col[n]


SCALARS = [
    "hdr_auto", "hdr_ov", "hdr_ov_ok", "legend_row", "wo_found", "wo_count", "line_count", "total", "shown",
    "print_last", "first_k", "first_pr", "last_k", "last_pr", "overflow", "rows_over", "beyond_cols",
    "out_over", "lines_over", "miss_line", "miss_wo", "paste_empty", "no_header", "hdr_like", "hdr_like_row",
    "ov_notes", "capwarn", "status_text", "status_ok", "stale", "tamper", "short_warn", "line_col",
    "first_text", "last_text", "wo_twice", "wo_twice_k", "wo_twice_text", "status_ok0", "dec", "ex_k", "ex_pr",
    "notes", "asof", "shift", "nshift", "cx", "h0", "cu", "f0", "cc", "nco", "nco_k", "summary", "subtitle",
    "warn_line", "sh_end", "co_minor", "co_major",
]
# Shift-clock table on Calc (estimated times): row CY_F holds the bottles of
# each of the next 8 hours after the current one (as a share of a full hour),
# row CY_S their running total (S0..S8).
CY_LABEL, CY_F, CY_S = 70, 71, 72
SC = {n: f"Calc!$B${5 + i}" for i, n in enumerate(SCALARS)}       # for other sheets
SL = {n: f"$B${5 + i}" for i, n in enumerate(SCALARS)}            # inside Calc

FT_ROW0 = 5                                   # field table rows 5..19
FT = dict(idx="D", key="E", label="F", pw="G", raw="H", parsed="I", eff="J", auto="K",
          used="L", auto_letter="M", used_letter="N", hdr_text="O", example="P", note="Q", ovflag="R")


def ft(col, f):
    return f"${FT[col]}${FT_ROW0 + f - 1}"


LET_NUM, LET_COL = "S", "T"
LETTERS = f"$T$5:$T${4 + PASTE_COLS}"
ALIAS_NORM, ALIAS_FIELD = "V", "W"

SCAN_C0 = 25                                   # column Y = pasted column 1
B_NH, B_CT, B_CAND, B_CM, B_CML = 4, 49, 94, 139, 184   # row = base + pasted row
B_PRE = 244                                    # rows 245-284: normalization stage 1
SUM_COLS = Band(86, ["filled", "nums", "exm", "cmm", "mapped", "score"])
R_NHF, R_CANDF, R_CMF, R_EXA, R_CMLA, R_FLDA, R_OVC, R_EXF, R_CMLF, R_FLD = range(230, 240)
R_PREF = 241                                   # the header row used: normalization stage 1
FT_OVPRE = "U"                                 # override text, normalization stage 1 (rows 5-19)
LINE_ALIASES = "{" + ",".join(f'"{a}"' for a in EXACT["line"]) + "}"
WO_ALIASES = "{" + ",".join(f'"{a}"' for a in EXACT["wo"]) + "}"


def count_content(rng):
    """Cells holding a number or at least one character of text. COUNTIF(r,"<>")
    would also count cells holding empty text (what Paste Values leaves where
    the source had a formula returning "")."""
    return f'(COUNTIF({rng},"?*")+COUNTIF({rng},">=0")+COUNTIF({rng},"<0"))'


def count_content_exact(rng, block):
    """count_content(rng), but the cells of block (a part of rng) only count
    when they hold more than spaces / tabs / line breaks / non-breaking
    spaces - the app trims every cell, so such a cell is empty to it. The
    cheap COUNTIF runs first; the cell-by-cell check only when it finds
    something. Cells of rng outside block are counted the cheap way."""
    whole, blk = count_content(rng), count_content(block)
    exact = f'SUMPRODUCT(--(LEN(TRIM({clean(block + chr(38) + chr(34) * 2)}))>0))'
    return f"IF({whole}=0,0,{whole}-{blk}+IFERROR({exact},{blk}))"


EXACT_ROWS_TO = 3000          # whitespace-only cells are ignored in rows 1001-3000 ...
EXACT_COLS_TO = 104           # ... and in columns BI:CZ of rows 1-1000


def scol(c):
    return L(SCAN_C0 + c - 1)


SCAN_FIRST, SCAN_LAST = scol(1), scol(PASTE_COLS)
LN_BAND = Band(105, ["rn", "ln", "leg"])           # DA:DC, rows 5..1004
FIELD_COLS = ["wo", "seq", "item", "desc", "count", "bulk", "bottle", "cap", "allergen", "remarks",
              "qty_s", "qty", "pct_s", "pct", "stat", "desiccant", "cotton"]
W = Band(LN_BAND.end + 2, ["kn", "pr", "valid", "line", "key", "dup", "keep0", "ord0", "keep"] + FIELD_COLS +
         ["firstk", "isfirst", "cumf", "lno", "anch", "sk", "grp", "nv", "rank", "pos", "lidx", "sched",
          "stshown", "hl", "pa", "br", "wofk", "hdrlike", "nfill",
          # combined report (v2): the line's number, statuses and crew (from the
          # lines table LB), changeovers, notes, estimates
          "lnum", "dname", "nxt", "brk", "crew", "kprev", "fw", "co", "comin", "capchg", "cotv", "cotprev", "cotnote",
          "desv", "szchg", "desnote", "conote", "colist", "pidx", "ptype", "oily", "intl", "wm", "wrk", "note", "cotext", "remtext", "rkey", "rate", "bott", "fhe", "norate", "cumfe", "f2", "cq", "cr", "cm",
          "est", "estt", "nextco", "cot_t", "prog", "left", "capc"])
# (Calc rows 5-704 hold a window row and a report slot: keep their XML under
# 32 KB - the zip's compression window - or the file grows by about a fifth)
O = Band(W.end + 2, ["pn", "k", "kind", "first", "last"] + [k for _, k in SCHED_COLS]
         + ["hl", "sched", "cchg", "capx", "o_status", "fw", "code", "ns", "stidx", "nidx", "r_pa", "r_br",
            "r_note", "r_pct", "r_cap", "lo", "role", "o_cnote", "o_rem"])
# the lines in today's schedule, in report order (row n = the line with lno n):
# its number and matching key, its row on 3. Lines, the name shown, statuses,
# breaks and crew, and where its box is on 4. Schedule
LB = Band(O.end + 2, ["n", "lk", "name", "cnt", "lnum", "lkey", "lidx", "dname", "der", "ovst", "st", "sched",
                      "nxt", "brk", "crew", "note", "miss", "mcum", "mname", "lrow", "lsp", "lcum", "ltop", "lsz", "lnp"])
# 3. Lines list rows: line number, matching key (the number, or the name when
# it has none), the first list row with the same key, and its inputs read once
LK = Band(LB.end + 2, ["num", "key", "first", "st", "nx", "brk", "crew"])
W0, WN = 5, 4 + WIN                                 # window rows
O0, ON = 5, 4 + OUT_ROWS                            # report slots


def wr(col):                                        # whole window column
    return f"${W[col]}${W0}:${W[col]}${WN}"


SCHED_ROW0 = 5          # 4. Schedule: first work-order row (rows 1-4 are the title, summary and titles)
SLOT_ROWS = 3           # 4. Schedule rows per slot: the work order, its changeover notes, its remarks
SCHED_LAST = SCHED_ROW0 + SLOT_ROWS * OUT_ROWS - 1  # 2104: slot p = rows 2 + 3p, 3 + 3p, 4 + 3p
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
          "November", "December"]


def status_expr(x):
    """A status as typed on 3. Lines, in its standard spelling: RUNNING,
    PARTIAL SHIFT, OVERTIME, READY LINE, PM / CLEANING, NOT SCHEDULED, NONE
    (no status, not even from the file) or "" (empty). The app's READY / PM /
    OT and Yes (Scheduled) still work; anything else is kept as typed."""
    u = f'UPPER(TRIM({x}&""))'
    has = lambda w: f'ISNUMBER(SEARCH("{w}",{u}))'
    return (f'IF({u}="","",IF(OR({u}="NONE",{u}="-"),"NONE",IF({has("PARTIAL")},"PARTIAL SHIFT",'
            f'IF(OR({u}="OT",{u}="TRIAL",{has("OVERTIME")}),"OVERTIME",IF(OR({has("NOT")},{u}="OFF",{u}="NO",'
            f'{u}="DOWN"),"NOT SCHEDULED",IF({has("READY")},"READY LINE",IF(OR(LEFT({u},2)="PM",{has("CLEAN")}),'
            f'"PM / CLEANING",IF(OR({has("RUN")},{u}="YES",{u}="Y",{u}="X"),"RUNNING",{u}))))))))')


def changeover_expr(prev, cur):
    """changeoverCode(previous work order, this one) - prev / cur map a field
    name to its cell."""
    b1, b2 = prev("bottle"), cur("bottle")
    return (f'IF(OR({b1}="",{b2}=""),"",IF(NOT(EXACT({b1},{b2})),"S4",'
            f'IF(NOT(EXACT({prev("bulk")},{cur("bulk")})),"S3",'
            f'IF(NOT(EXACT({prev("count")},{cur("count")})),"S1 Count Change","S1"))))')



def window_v2(ws, c, A, s, r_):
    """The combined report's per-work-order columns of the Calc window."""
    keep, lno, rank = A["keep"], A["lno"], A["rank"]
    ix = lambda n, k_: f"INDEX({wr(n)},{k_})"
    # the work order before this one on its line (in Seq order)
    ws[c["kprev"]] = f'=IF({keep}=0,0,IFERROR(MATCH({rank}-1,{wr("rank")},0),0))'
    kp = A["kprev"]
    ws[c["fw"]] = f'=IF({keep}=0,0,IF({kp}=0,1,IF({ix("lno", kp)}={lno},0,1)))'
    fw = A["fw"]
    co = changeover_expr(lambda n: ix(n, kp), lambda n: A[n])
    ws[c["co"]] = f'=IF({keep}=0,"",IF({fw}=1,"",{co}))'
    cc = A["co"]
    ws[c["comin"]] = (f'=IF({cc}="","",IF({cc}="S1",SET_CO_S1,IF({cc}="S1 Count Change",SET_CO_CNT,'
                      f'IF({cc}="S3",SET_CO_S3,SET_CO_S4))))')
    # the app's "Cap Change": the cap differs from the work order before it
    # (ends trimmed, inner spaces collapsed, any case); blank caps don't count
    cap_p, cap_c = f'TRIM({ix("cap", kp)}&"")', f'TRIM({A["cap"]}&"")'
    ws[c["capchg"]] = (f'=IF({keep}=0,0,IF({fw}=1,0,IF(OR({cap_p}="",{cap_c}=""),0,'
                       f'IF(UPPER({cap_p})=UPPER({cap_c}),0,1))))')
    # the notes row under the work order: its changeover notes, then its
    # remark. The cotton (COT column) is Yes for Y / Yes / X / 1, none
    # for N / No / 0 / - / blank, else the value; the changeover into a work
    # order adds, removes or changes it (a different value).
    ct = f'TRIM({A["cotton"]}&"")'
    no = "{" + ",".join(f'"{v}"' for v in NONE_VALUES) + "}"
    yes = "{" + ",".join(f'"{v}"' for v in ("Y", "YES", "X", "TRUE", "1")) + "}"
    # (MATCH of text is not case-sensitive)
    ws[c["cotv"]] = (f'=IF({keep}=0,"",IF({ct}="","",IF(ISNUMBER(MATCH({ct},{no},0)),"",'
                     f'IF(ISNUMBER(MATCH({ct},{yes},0)),"Yes",{ct}))))')
    ws[c["cotprev"]] = f'=IF(OR({keep}=0,{fw}=1),"",{ix("cotv", kp)})'
    cv, pv = A["cotv"], A["cotprev"]
    ws[c["cotnote"]] = (f'=IF(OR({keep}=0,{fw}=1),"",IF({cv}<>"",IF({pv}="","Add Cotton"&IF({cv}="Yes","",'
                        f'" ("&{cv}&")"),IF(UPPER({cv})<>UPPER({pv}),"Change Cotton ("&{cv}&")","")),'
                        f'IF({pv}<>"","Remove Cotton","")))')
    # the desiccant (DES column; none for N / No / 0 / - / blank): Add, Remove
    # or Change Desiccant
    dt = f'TRIM({A["desiccant"]}&"")'
    ws[c["desv"]] = f'=IF({keep}=0,"",IF(ISNUMBER(MATCH({dt},{no},0)),"",{dt}))'
    dv, dp = A["desv"], ix("desv", kp)
    ws[c["desnote"]] = (f'=IF(OR({keep}=0,{fw}=1),"",IF({dv}<>"",IF({dp}="","Add Desiccant",IF(UPPER({dv})<>'
                        f'UPPER({dp}),"Change Desiccant","")),IF({dp}<>"","Remove Desiccant","")))')
    # cap + 2 x count + 4 x bottle changed (the count only on an S1 Count
    # Change; the bottle as the changeover code compares it, blanks don't
    # count)
    diff = lambda f: f'AND({ix(f, kp)}<>"",{A[f]}<>"",NOT(EXACT({ix(f, kp)},{A[f]})))'
    ws[c["szchg"]] = (f'=IF(OR({keep}=0,{fw}=1),0,{A["capchg"]}+2*({A["co"]}="S1 Count Change")'
                      f'+4*{diff("bottle")})')
    # Changeover notes - only when the changeover into it starts (the work
    # order before it ends) before the end of the shift: the cap / count /
    # bottle change, the cotton, the desiccant, Dumping for a dumping work
    # order (bulk A662 / A624, as its highlight), and Prepare For INTERNATIONAL
    # WO for an international one
    sz, te = A["szchg"], ix("est", kp)
    part = lambda n: f'IF({A[n]}<>"",", "&{A[n]},"")'
    lst = (f'IF({sz}=0,"",", "&INDEX(${CO_SIZE_COL}$5:${CO_SIZE_COL}${4 + len(CO_SIZE)},{sz}))&{part("cotnote")}&'
           f'{part("desnote")}&IF(OR(EXACT({A["bulk"]},"A662"),EXACT({A["bulk"]},"A624")),", Dumping","")'
           f'&IF({A["intl"]}=1,", Prepare For INTERNATIONAL WO","")')
    ws[c["colist"]] = f'=IF(OR({keep}=0,{fw}=1),"",MID({lst},3,250))'
    ws[c["conote"]] = f'=IF(OR({te}="",{te}>={s["sh_end"]}),"",{A["colist"]})'
    # 7. Washroom: oily (a softgel: the description has a word of 5. Settings'
    # oily list) or powdery; the changeover's start in whole minutes when it
    # is from Schedule as of to the end of this copy's shift (other shifts may
    # run other lines), and its place in time order
    # (ties by paste order)
    d = f'" "&SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE({A["desc"]}&"","-"," "),","," "),"("," "),")"," ")&" "'
    # (the item's tick on 8. Products first: Oily or Powdery)
    ws[c["pidx"]] = (f'=IF({keep}=0,0,IFERROR(MATCH(UPPER(TRIM({A["item"]}&"")),{PRODS}!$J$5:$J${4 + PROD_ROWS},'
                     f'0),0))')
    px = A["pidx"]
    ptick = lambda col: f'IF({px}=0,"",UPPER(TRIM(INDEX({PRODS}!${col}$5:${col}${4 + PROD_ROWS},{px})&"")))'
    ws[c["ptype"]] = f"={ptick('F')}"
    pt = A["ptype"]
    ws[c["oily"]] = (f'=IF({keep}=0,0,IF({pt}="OILY",1,IF({pt}="POWDERY",0,IF(SUMPRODUCT(ISNUMBER(SEARCH(" "&'
                     f'TRIM(SET_OILY&"")&" ",{d}))*(TRIM(SET_OILY&"")<>""))>0,1,0))))')
    # international: the item's International / Domestic on 8. Products, else
    # INTL or INTERNATIONAL in its description
    mk, dd = ptick("G"), f'" "&{A["desc"]}&" "'
    ws[c["intl"]] = (f'=IF({keep}=0,0,IF({mk}="INTERNATIONAL",1,IF({mk}="DOMESTIC",0,'
                     f'IF(OR(ISNUMBER(SEARCH(" INTL ",{dd})),ISNUMBER(SEARCH(" INTERNATIONAL ",{dd}))),1,0))))')
    ws[c["wm"]] = (f'=IF(OR({keep}=0,{fw}=1),"",IF({te}="","",IF(AND({te}>={s["asof"]},{te}<{s["sh_end"]}),'
                   f'ROUND({te}*1440,0),"")))')
    ws[c["wrk"]] = (f'=IF({A["wm"]}="","",COUNTIF({wr("wm")},"<"&{A["wm"]})+COUNTIFS({wr("wm")},{A["wm"]},'
                    f'{wr("kn")},"<"&{A["kn"]})+1)')
    ws[c["note"]] = f'=IF({keep}=0,"",TRIM({A["remarks"]}&""))'
    # the two notes rows: Changeover Notes: ..., then Remarks: ...
    cn, nt = A["conote"], A["note"]
    ws[c["cotext"]] = f'=IF({cn}="","","Changeover Notes: "&{cn})'
    ws[c["remtext"]] = f'=IF({nt}="","","Remarks: "&{nt})'
    # ---- estimated time: this work order finishes (the line changes over) ----
    ws[c["rkey"]] = f'=IF(OR({keep}=0,{A["lnum"]}=""),"",{A["lnum"]}&"|"&UPPER(TRIM({A["item"]}&"")))'
    rate = f"INDEX({RATES}!$D$5:$D${4 + RATE_ROWS},MATCH({A['rkey']},{RATES}!$F$5:$F${4 + RATE_ROWS},0))"
    ws[c["rate"]] = f'=IF({A["rkey"]}="","",IFERROR(IF(ISNUMBER({rate}),IF({rate}>0,{rate},""),""),""))'
    ws[c["bott"]] = f'=IF({keep}=0,"",IF({A["br"]}<>"",{A["br"]},IF({A["qty"]}<>"",{A["qty"]},"")))'
    # in full-hour units: changeover minutes + bottles / (rate x efficiency)
    ws[c["fhe"]] = (f'=IF(OR({keep}=0,{A["sched"]}=0),"",IF(OR({A["rate"]}="",{A["bott"]}=""),"",'
                    f'IFERROR(N({A["comin"]})/60+{A["bott"]}/({A["rate"]}*SET_EFF),"")))')
    ws[c["norate"]] = f'=IF({keep}=0,0,IF({A["sched"]}=0,0,IF({A["fhe"]}="",1,0)))'
    ws[c["cumfe"]] = (f'=IF(OR({keep}=0,{A["sched"]}=0),"",IF(COUNTIFS({wr("lno")},{lno},{wr("rank")},"<="&{rank},'
                      f'{wr("norate")},1)>0,"",SUMIFS({wr("fhe")},{wr("lno")},{lno},{wr("rank")},"<="&{rank})))')
    F, brk = A["cumfe"], A["brk"]
    # breaks and lunch: what is left of this hour, then whole shifts, then the
    # hour of the last shift it finishes in (see the shift clock on Calc)
    ws[c["f2"]] = f'=IF({F}="","",{F}-{s["cu"]}*{s["f0"]})'
    ws[c["cq"]] = f'=IF(OR({A["f2"]}="",{brk}=0),"",IF({A["f2"]}<=0,"",MAX(0,-INT(-{A["f2"]}/{s["cc"]})-1)))'
    ws[c["cr"]] = f'=IF({A["cq"]}="","",{A["f2"]}-{A["cq"]}*{s["cc"]})'
    ws[c["cm"]] = f'=IF({A["cr"]}="","",MIN(8,1+SUMPRODUCT(--($C${CY_S}:$J${CY_S}<{A["cr"]}))))'
    t0 = s["asof"]
    ws[c["est"]] = (f'=IF({F}="","",IFERROR(IF({brk}=0,{t0}+{F}/24,IF({A["f2"]}<=0,{t0}+{F}/{s["f0"]}/24,'
                    f'{t0}+({s["cu"]}+8*{A["cq"]}+({A["cm"]}-1)+({A["cr"]}-INDEX($B${CY_S}:$I${CY_S},{A["cm"]}))'
                    f'/INDEX($C${CY_F}:$J${CY_F},{A["cm"]}))/24)),""))')
    ws[c["estt"]] = f'=IF({A["est"]}="","",{clock_text(A["est"], t0, "Today ")})'
    ws[c["nextco"]] = (f'=IF({fw}=0,"",IF({A["est"]}="","",IF(COUNTIF({wr("lno")},{lno})>1,{A["est"]},"")))')
    # when the changeover into this work order starts: the work order before it is done
    ws[c["cot_t"]] = f'=IF(OR({keep}=0,{fw}=1),"",IF({cc}="","",IFERROR(IF({ix("est", kp)}="","",{ix("est", kp)}),"")))'
    # ---- what the report shows ----------------------------------------------
    pa = A["pa"]
    n = f"MAX(0,MIN(10,ROUND({pa}*10,0)))"
    label = "".join(f'IF({cc}="{code}","{lab}",' for code, lab, _ in CO_LABELS) + '"—"' + ")" * len(CO_LABELS)
    ws[c["prog"]] = (f'=IF({keep}=0,"",IF({fw}=1,IF({pa}="","Not Started Yet",REPT("▰",{n})&REPT("▱",10-{n})'
                     f'&"  "&ROUND({pa}*100,0)&"%"),{label}&IF(AND({cc}<>"",{A["intl"]}=1)," · INTL","")))')
    b = A["bott"]
    ws[c["left"]] = (f'=IF({keep}=0,"",IF({fw}=1,IF({b}="","",IF({b}>=1000,ROUND({b}/1000,1)&"k",{b}&"")),'
                     f'IF({A["comin"]}="","",{A["comin"]}&" min")))')
    # CAP as size-type, like the printout: CAP 45MM CRC WHITE -> 45-CRC (the
    # number right before MM and the word after it; anything else as it is)
    t = f'TRIM({A["cap"]}&"")'
    p_ = f'SEARCH("MM",{t})'
    rest = f"TRIM(MID({t},{p_}+2,99))"
    ty = f'LEFT({rest},FIND(" ",{rest}&" ")-1)'
    sz = f'TRIM(RIGHT(SUBSTITUTE(LEFT({t},{p_}-1)," ",REPT(" ",30)),30))'
    ws[c["capc"]] = (f'=IF({keep}=0,"",IFERROR(IF(OR({sz}="",{ty}="",NOT(ISNUMBER(-{sz}))),{t},{sz}&"-"&{ty}),'
                     f'{t}))')


def hour_share(h):
    """The share of a full hour's bottles made in hour h (1-8) of a shift on a
    line with breaks and lunch: lunch wins over a break in the same hour."""
    return f"IF({h}=SET_LUNCH,SET_FLUNCH,IF(OR({h}=SET_BREAK1,{h}=SET_BREAK2),SET_FBREAK,1))"


def month_name(d):
    return "CHOOSE(MONTH(" + d + ")," + ",".join(f'"{m}"' for m in MONTHS) + ")"


def clock12(t):
    """h:mm AM/PM without TEXT() (its codes differ between Excel languages)."""
    return (f'(MOD(HOUR({t})+11,12)+1)&":"&RIGHT("0"&MINUTE({t}),2)&IF(HOUR({t})<12," AM"," PM")')


def clock_text(t, ref, today=""):
    """Time t to the nearest minute as "3:31 PM", with the month/day in front
    ("10/30 2:05 AM") when it isn't the day of ref (and today in front when it
    is: "Today 3:31 PM"). Half a second is added to the rounded minute so
    HOUR / MINUTE never land a hair below it."""
    m = f"(ROUND({t}*1440,0)/1440+1/172800)"
    return f'IF(INT({m})=INT({ref}),"{today}",MONTH({m})&"/"&DAY({m})&" ")&{clock12(m)}'


def shift_end_expr(s):
    """The end of this copy's shift - the first one at or after as-of - or of
    the shift it is at as-of when no shift is picked on 3. Lines. Shift k
    (0, 1, 2) runs from SET_START + k x 8 hours."""
    k = (f'IF({s["shift"]}="{SHIFTS[0]}",0,IF({s["shift"]}="{SHIFTS[1]}",1,IF({s["shift"]}="{SHIFTS[2]}",2,'
         f'INT(MOD(({s["asof"]}-SET_START)*24,24)/8))))')
    end = f"(INT({s['asof']})+MOD(SET_START+({k}+1)/3,1))"
    return f"IF({end}<{s['asof']},{end}+1,{end})"


def co_count(s, codes):
    """Changeovers of these codes that start from as-of to the end of the shift."""
    t = wr("cot_t")
    return "+".join(f'COUNTIFS({t},">="&{s["asof"]},{t},"<"&{s["sh_end"]},{wr("co")},"{c}")' for c in codes)


def summary_expr(s):
    st = f"Calc!${LB['st']}$5:${LB['st']}${4 + LINE_SLOTS}".replace("Calc!", "")
    short = {"READY LINE": "ready", "PM / CLEANING": "PM / cleaning"}
    parts = "".join(f'&IF(COUNTIF({st},"{name}")>0," · "&COUNTIF({st},"{name}")&" {short.get(name, name.lower())}","")'
                    for name in STATUS_NAMES)
    nco, k = s["nco"], s["nco_k"]
    nxt = (f'IF({nco}>0,"  |  Next: "&INDEX({wr("dname")},{k})&" at "&{clock_text(nco, s["asof"])},"")')
    cos = (f'"  |  Changeovers before end of shift ("&{clock_text(s["sh_end"], s["asof"])}&"): "&{s["co_minor"]}'
           f'&" minor · "&{s["co_major"]}&" major"')
    return (f'IF({s["wo_count"]}=0,"No work orders yet - paste today\'s schedule on 1. Paste Schedule.",'
            f'{s["line_count"]}&" lines"{parts}&{cos}&{nxt})')


def cotton_field(ws, s, nhf_row, fld_row):
    """Field table row 20: the Cotton column (not one of the app's fields)."""
    r = FT_ROW0 + COT_FIDX - 1
    c = lambda col: f"{FT[col]}{r}"
    for col in FT:
        assert ws[c(col)].value is None, c(col)
    ws[c("idx")] = COT_FIDX
    ws[c("key")] = "cotton"
    ws[c("label")] = "Cotton (COT)"
    ovr = f"{CHECK}!$F${COT_CHECK_ROW}"
    ws[c("raw")] = f'=IFERROR(UPPER(TRIM({ovr}&"")),"#")'
    raw = c("raw")
    ovpre = f"{FT_OVPRE}{r}"
    ws[ovpre] = "=" + norm1_expr(raw)
    ov_norm = norm2_expr(ovpre)
    letter_no = f"MATCH(1,INDEX(--EXACT({LETTERS},{raw}),0),0)"
    ws[c("parsed")] = (f'=IF({raw}="",0,IF(OR({raw}="-",{raw}="NONE"),-1,IFERROR({letter_no},'
                       f'IF({ov_norm}="",-2,IFERROR(MATCH(1,INDEX(--EXACT({nhf_row},{ov_norm}),0),0),-2)))))')
    parsed = c("parsed")
    # a column a field already uses can't be the cotton too
    taken = f"INDEX({fld_row},{parsed})>0"
    ws[c("eff")] = f"=IF({parsed}<=0,IF({parsed}=-1,-1,0),IF({taken},0,{parsed}))"
    aliases = "{" + ",".join(f'"{a}"' for a in COT_ALIASES) + "}"
    ws[c("auto")] = (f"=IFERROR(MATCH(1,INDEX(ISNUMBER(MATCH({nhf_row},{aliases},0))*({fld_row}=0),0),0),0)")
    auto, eff = c("auto"), c("eff")
    ws[c("used")] = f"=IF({eff}>0,{eff},IF({eff}=-1,0,{auto}))"
    used = c("used")
    ws[c("auto_letter")] = f'=IF({auto}=0,"(not found)",INDEX({LETTERS},{auto}))'
    ws[c("used_letter")] = f'=IF({used}=0,IF({eff}=-1,"(left out)","(none)"),INDEX({LETTERS},{used}))'
    xh_t = ttrim(paste("HEADER_ROW", used) + '&""')
    ws[c("hdr_text")] = f'=IF({used}=0,"",IFERROR({xh_t},""))'
    x_e = paste(s["ex_pr"], used)
    xe_t = ttrim(x_e + '&""')
    ws[c("example")] = f'=IF(OR({used}=0,{s["ex_pr"]}=0),"",IFERROR(IF(ISNUMBER({x_e}),{x_e},{xe_t}),""))'
    ws[c("note")] = (f'=IF({parsed}=-2,"\'"&IFERROR(TRIM({ovr}&""),"#")&"\' is not a column letter (A to BH) or a '
                     f'column title in row "&HEADER_ROW&" - ignored",IF(AND({parsed}>0,{eff}=0),"Column "&INDEX('
                     f'{LETTERS},{parsed})&" is already used by another field - ignored",IF({used}>0,"Found: '
                     f'it shows in the changeover notes under the work orders (not as a column).",IF({eff}=-1,"Left out by '
                     f'the Override.","No COT / Cotton column in this file - pick its title in Override if it has '
                     f'another one."))))')
    ws[c("ovflag")] = 0


def build_calc(wb):
    ws = wb.create_sheet(S_CALC)
    ws.sheet_state = "hidden"
    hdr = font(9, True)
    put(ws, "A1", "Calc - helper sheet for 4. Schedule, 2. Check Columns and 3. Lines. "
                  "Do not edit. Layout: see the comments at the top of excel/build_workbook.py.", font=hdr)

    # ---- scalars -----------------------------------------------------------
    put(ws, "A3", "Scalars", font=hdr)
    put(ws, f"{CO_SIZE_COL}4", "Changeover notes: cap + 2 x count + 4 x bottle", font=hdr)
    for i, t in enumerate(CO_SIZE, start=5):
        ws[f"{CO_SIZE_COL}{i}"] = t
    labels = {
        "hdr_auto": "Header row found automatically", "hdr_ov": "Header row override (number)",
        "hdr_ov_ok": "Override valid", "legend_row": "LEGEND row (1001 = none)",
        "wo_found": "Work orders in rows 1-1000", "wo_count": "Work orders kept (max 600)", "line_count": "Lines",
        "total": "Report slots needed", "shown": "Report slots shown", "print_last": "Last print row",
        "first_k": "Window row of first WO", "first_pr": "Paste row of first WO",
        "last_k": "Window row of last WO", "last_pr": "Paste row of last WO",
        "overflow": "Work orders past 600", "rows_over": "Cells below row 1000", "beyond_cols": "Cells right of BH",
        "out_over": "Report slots that don't fit", "lines_over": "Lines past 100",
        "miss_line": "Line column missing", "miss_wo": "WO # column missing",
        "paste_empty": "1. Paste Schedule empty", "no_header": "No header row found in rows 1-40",
        "hdr_like": "Kept rows that look like column titles", "hdr_like_row": "Paste row of the first one",
        "ov_notes": "Overrides that differ from automatic", "capwarn": "Capacity warnings",
        "status_text": "Status text", "status_ok": "Status OK",
        "stale": "3. Lines ticks/statuses not dated today", "tamper": "4. Schedule typed on",
        "short_warn": "4. Schedule warning", "line_col": "Line column used",
        "first_text": "First work order (text)", "last_text": "Last work order (text)",
        "wo_twice": "Kept rows whose WO # is on an earlier kept row", "wo_twice_k": "Window row of the first one",
        "wo_twice_text": "Its text", "status_ok0": "Status OK apart from WOs listed twice",
        "dec": "Decimal separator of this computer", "ex_k": "Window row of the example row",
        "ex_pr": "Paste row of the example row",
        "notes": "Work orders with notes", "asof": "Schedule as of (date and time)",
        "shift": "This copy's shift", "nshift": "Next shift", "cx": "Hours into the current shift",
        "h0": "Hour of the shift now (1-8)", "cu": "Share of this hour left", "f0": "Bottles this hour (share)",
        "cc": "Bottles in a whole shift (full hours)", "nco": "Next changeover (time)",
        "nco_k": "Window row of the next changeover", "summary": "4. Schedule summary line",
        "sh_end": "End of the shift (This copy is for; else the one it is now)",
        "co_minor": "Minor changeovers (S1, count) from as-of to the end of the shift",
        "co_major": "Major changeovers (S3, S4) from as-of to the end of the shift",
        "subtitle": "4. Schedule subtitle", "warn_line": "Warnings on one line",
    }
    for i, n in enumerate(SCALARS):
        put(ws, f"A{5 + i}", labels[n])

    s = SL
    legr = f"${LN_BAND['leg']}$5:${LN_BAND['leg']}${4 + PASTE_ROWS}"
    scores = f"${SUM_COLS['score']}${B_NH + 1}:${SUM_COLS['score']}${B_NH + SCAN_ROWS}"
    used_line, used_wo = ft("used", 1), ft("used", 2)
    line_hdr = ft("hdr_text", 1)
    twice = f'({wr("wofk")}>0)*({wr("wofk")}<{wr("kn")})'
    lines_inputs = 'SUMPRODUCT(--(TRIM(LINES_STATUS&"")<>""))+SUMPRODUCT(--(TRIM(LINES_NEXT&"")<>""))'
    ov_pre = (f'IF({s["hdr_ov_ok"]}=1,"Header row override is set to "&{s["hdr_ov"]}&" (yellow box E5) - clear it '
              f'if today\'s file is different. ","")')
    wo_at = lambda k_, col: f"INDEX({wr(col)},{k_})"
    f = {
        "hdr_auto": f"IF(MAX({scores})>=0,MATCH(MAX({scores}),{scores},0),1)",
        "hdr_ov": 'IFERROR(VALUE(TRIM(HEADER_ROW_OVERRIDE&"")),0)',
        "hdr_ov_ok": f"IF(AND({s['hdr_ov']}>=1,{s['hdr_ov']}<={PASTE_ROWS - 1},{s['hdr_ov']}=INT({s['hdr_ov']})),1,0)",
        "legend_row": f"IFERROR(MATCH(1,{legr},0),{PASTE_ROWS + 1})",
        "wo_found": f"${W['ord0']}${WN}",
        "wo_count": f"MIN({s['wo_found']},{MAX_WO})",
        "line_count": f"${W['cumf']}${WN}",
        # work orders + the blank slots between lines (before the last line)
        "total": (f"IF({s['wo_count']}=0,0,{s['wo_count']}+IFERROR(INDEX(${LB['lcum']}$5:${LB['lcum']}${4 + LINE_SLOTS},"
                  f"{s['line_count']}),{s['line_count']}-1))"),
        "shown": f"MIN({s['total']},{OUT_ROWS})",
        "print_last": f"{SCHED_ROW0 - 1}+{SLOT_ROWS}*{s['shown']}",
        "first_k": f"IFERROR(MATCH(1,{wr('keep')},0),0)",
        "first_pr": f"IF({s['first_k']}=0,0,INDEX({wr('pr')},{s['first_k']}))",
        "last_k": f"IFERROR(LOOKUP(2,1/({wr('keep')}=1),{wr('kn')}),0)",
        "last_pr": f"IF({s['last_k']}=0,0,INDEX({wr('pr')},{s['last_k']}))",
        "overflow": f"MAX(0,{s['wo_found']}-{MAX_WO})",
        "rows_over": (f'IFERROR(IF({s["legend_row"]}<={PASTE_ROWS},0,' + count_content_exact(
                      f'INDEX(PASTE_ALL,{PASTE_ROWS + 1},1):INDEX(PASTE_ALL,ROWS(PASTE_ALL),{PASTE_COLS})',
                      f'INDEX(PASTE_ALL,{PASTE_ROWS + 1},1):INDEX(PASTE_ALL,{EXACT_ROWS_TO},{PASTE_COLS})') + '),0)'),
        "beyond_cols": ('IFERROR(' + count_content_exact(
                        f'INDEX(PASTE_ALL,0,{PASTE_COLS + 1}):INDEX(PASTE_ALL,0,COLUMNS(PASTE_ALL))',
                        f'INDEX(PASTE_ALL,1,{PASTE_COLS + 1}):INDEX(PASTE_ALL,{PASTE_ROWS},{EXACT_COLS_TO})') + ',0)'),
        "out_over": f"MAX(0,{s['total']}-{OUT_ROWS})",
        "lines_over": f"MAX(0,{s['line_count']}-{LINE_SLOTS})",
        "miss_line": f"IF({used_line}=0,1,0)",
        "miss_wo": f"IF({used_wo}=0,1,0)",
        "paste_empty": ('IFERROR(IF(' + count_content(f'INDEX(PASTE_ALL,1,1):INDEX(PASTE_ALL,{PASTE_ROWS},{PASTE_COLS})')
                        + '=0,1,0),0)'),
        "no_header": f"IF(AND({s['hdr_ov_ok']}=0,MAX({scores})<=0),1,0)",
        "hdr_like": f'SUMPRODUCT({wr("hdrlike")})',
        "hdr_like_row": f'IF({s["hdr_like"]}=0,0,INDEX({wr("pr")},MATCH(1,{wr("hdrlike")},0)))',
        "ov_notes": f"SUMPRODUCT(${FT['ovflag']}${FT_ROW0}:${FT['ovflag']}${FT_ROW0 + 14})",
        "capwarn": (
            f'IF({s["overflow"]}>0," WARNING: "&{s["overflow"]}&" more work order(s) were left out - this file holds up '
            f'to {MAX_WO} work orders (the first {MAX_WO}, in paste order).","")'
            f'&IF({s["rows_over"]}>0," WARNING: there is data below row {PASTE_ROWS} of 1. Paste Schedule - only rows 1 '
            f'to {PASTE_ROWS} are read.","")'
            f'&IF({s["beyond_cols"]}>0," WARNING: there is data to the right of column BH on 1. Paste Schedule - '
            f'only columns A to BH are read.","")'
            f'&IF({s["out_over"]}>0," WARNING: 4. Schedule has room for {OUT_ROWS} work orders and blank rows '
            f'between lines - the last "&{s["out_over"]}&" are not shown.","")'
            f'&IF({s["lines_over"]}>0," WARNING: "&{s["line_count"]}&" lines found - 3. Lines can only list '
            f'{LINE_SLOTS} of them.","")'),
        "status_text": (
            f'IF({s["paste_empty"]}=1,"WARNING: 1. Paste Schedule is empty, so the Line and WO # columns can\'t be '
            f'found. Paste today\'s file at cell A1 (How To Use, Part A).",'
            f'IF(AND({s["no_header"]}=1,{s["miss_line"]}=1),"WARNING: Can\'t find the row with the column titles in '
            f'rows 1 to {SCAN_ROWS}, so the Line column can\'t be found. Type the row number of the column titles in '
            f'Header row override (E5) - or check that today\'s file was pasted at cell A1.",'
            f'IF(OR({s["miss_line"]}=1,{s["miss_wo"]}=1),"WARNING: "&{ov_pre}&"Can\'t tell which column is the "'
            f'&IF(AND({s["miss_line"]}=1,{s["miss_wo"]}=1),"Line and the WO #",IF({s["miss_line"]}=1,"Line","WO #"))'
            f'&". In the list Your file\'s columns below, find that column and pick its title (or type its letter) in the '
            f'yellow Override box of "&IF({s["miss_line"]}=1,"Line","WO #")&".",'
            f'IF({s["wo_count"]}=0,"WARNING: "&{ov_pre}&"No work orders found under the column titles. Check the '
            f'Line column, or the header row.",'
            f'"Found "&{s["wo_count"]}&" work order"&IF({s["wo_count"]}=1,"","s")&" on "&{s["line_count"]}'
            f'&" line"&IF({s["line_count"]}=1,"","s")&"."'
            f'&IF({s["hdr_like"]}>0," WARNING: row "&{s["hdr_like_row"]}&" of 1. Paste Schedule looks like a row of '
            f'column titles, not a work order - yesterday\'s schedule may still be on that sheet. Clear the whole sheet '
            f'and paste again (How To Use, Part A).","")'
            f'&IF({s["wo_twice"]}>0," WARNING: "&{s["wo_twice_text"]}&" - yesterday\'s rows may still be on that sheet: '
            f'clear the whole sheet and paste again (How To Use, Part A). If today\'s file really lists it twice, you can '
            f'ignore this.","")'
            f'&{s["capwarn"]}'
            f'&IF({s["ov_notes"]}>0," (An Override is in use - see the Note column.)","")))))'),
        "status_ok0": (f'IF(AND({s["paste_empty"]}=0,{s["miss_line"]}=0,{s["miss_wo"]}=0,{s["wo_count"]}>0,'
                       f'{s["capwarn"]}="",{s["hdr_like"]}=0),1,0)'),
        "status_ok": f'IF(AND({s["status_ok0"]}=1,{s["wo_twice"]}=0),1,0)',
        "wo_twice": f"SUMPRODUCT({twice})",
        "wo_twice_k": f"IF({s['wo_twice']}=0,0,MATCH(1,INDEX({twice},0),0))",
        "wo_twice_text": (f'IF({s["wo_twice_k"]}=0,"","WO "&{wo_at(s["wo_twice_k"], "wo")}&" is on rows "'
                          f'&INDEX({wr("pr")},{wo_at(s["wo_twice_k"], "wofk")})&" and "&{wo_at(s["wo_twice_k"], "pr")}'
                          f'&" of 1. Paste Schedule"&IF({s["wo_twice"]}>1," (and "&({s["wo_twice"]}-1)&" more like it)",""))'),
        "stale": (f'IF(AND({lines_inputs}>0,NOT(AND(ISNUMBER(LINES_CHECKED_ON),'
                  f'INT(N(LINES_CHECKED_ON))=TODAY()))),1,0)'),
        # (4. Schedule's TYPED column: cells that differ from Calc, per row)
        "tamper": f'IFERROR(IF(SUM({SCHED}!${TYPED_COL}${SCHED_ROW0}:${TYPED_COL}${SCHED_LAST})>0,1,0),1)',
        # one short line each (the details are on 2. Check Columns / 3. Lines)
        "short_warn": (
            f'MID(IF({s["status_ok0"]}=1,IF({s["wo_twice"]}>0,CHAR(10)&"CHECK: WO twice - see 2. Check Columns",""),'
            f'CHAR(10)&"WARNING: see 2. Check Columns")'
            f'&IF({s["stale"]}=1,CHAR(10)&"CHECK: 3. Lines not dated today","")'
            f'&IF({s["tamper"]}=1,CHAR(10)&"Report typed on - see How To Use","")'
            f',2,999)'),
        "line_col": used_line,
        # VALUE() reads text with the computer's decimal separator; the app's
        # Number() always reads "." - so "." is swapped for this one first
        "dec": 'MID(1/2&"",2,1)',
        # the row the Example columns of 2. Check Columns show: the first work
        # order, or (none found, e.g. the Line column isn't known yet) the first
        # filled row under the column titles
        "ex_k": f"IF({s['first_k']}>0,{s['first_k']},IFERROR(MATCH(1,INDEX(--({wr('nfill')}>0),0),0),0))",
        "ex_pr": f"IF({s['ex_k']}=0,0,INDEX({wr('pr')},{s['ex_k']}))",
        "first_text": (f'IF({s["first_k"]}=0,"","Line "&{wo_at(s["first_k"], "line")}&", WO "&{wo_at(s["first_k"], "wo")}'
                       f'&" - row "&{s["first_pr"]}&" of 1. Paste Schedule")'),
        "last_text": (f'IF({s["last_k"]}=0,"","Line "&{wo_at(s["last_k"], "line")}&", WO "&{wo_at(s["last_k"], "wo")}'
                      f'&" - row "&{s["last_pr"]}&" of 1. Paste Schedule")'),
        # ---- combined report (v2) ----
        "notes": f'SUMPRODUCT(--(({wr("cotext")}&{wr("remtext")})<>""))',
        # a date typed without a time counts from the time it is now
        "asof": ('IF(ISNUMBER(LINES_CHECKED_ON),IF(LINES_CHECKED_ON=INT(LINES_CHECKED_ON),'
                 'LINES_CHECKED_ON+MOD(NOW(),1),LINES_CHECKED_ON),NOW())'),
        "shift": 'TRIM(LINES_SHIFT&"")',
        "nshift": (f'IF({s["shift"]}="{SHIFTS[0]}","{SHIFTS[1]}",IF({s["shift"]}="{SHIFTS[1]}","{SHIFTS[2]}",'
                   f'IF({s["shift"]}="{SHIFTS[2]}","{SHIFTS[0]}","")))'),
        "cx": f"MOD(({s['asof']}-SET_START)*24,8)",
        "h0": f"INT({s['cx']})+1",
        "cu": f"1-({s['cx']}-INT({s['cx']}))",
        "f0": hour_share(s["h0"]),
        "cc": f"$J${CY_S}",
        "nco": f"MIN({wr('nextco')})",
        "nco_k": f"IF({s['nco']}=0,0,IFERROR(MATCH({s['nco']},{wr('nextco')},0),0))",
        # the end of this copy's shift (the first one after as-of), or of the
        # shift it is at as-of when no shift is picked on 3. Lines
        "sh_end": shift_end_expr(s),
        "co_minor": co_count(s, ("S1", "S1 Count Change")),
        "co_major": co_count(s, ("S3", "S4")),
        "summary": summary_expr(s),
        "subtitle": (f'"This is the "&IF({s["shift"]}="","",{s["shift"]}&" ")&"schedule for "&{month_name(s["asof"])}'
                     f'&" "&DAY({s["asof"]})&", "&YEAR({s["asof"]})&" as of "&{clock12(s["asof"])}'),
        "warn_line": f'SUBSTITUTE({s["short_warn"]},CHAR(10),"   |   ")',
    }
    for n in SCALARS:
        ws[s[n].replace("$", "")] = "=" + f[n]

    # ---- shift clock: the next 8 hours after the current one ----------------
    put(ws, f"A{CY_LABEL}", "Shift clock: share of a full hour's bottles in hour +1..+8 (row 71), running total "
                           "S0..S8 (row 72)", font=hdr)
    put(ws, f"A{CY_F}", "hour share")
    put(ws, f"A{CY_S}", "running total")
    ws[f"B{CY_S}"] = 0
    for m in range(1, 9):
        col, pcol = L(2 + m), L(1 + m)
        ws[f"{col}{CY_F}"] = "=" + hour_share(f"(MOD({s['h0']}+{m - 1},8)+1)")
        ws[f"{col}{CY_S}"] = f"={pcol}{CY_S}+{col}{CY_F}"

    # ---- field table -----------------------------------------------------
    put(ws, "D3", "Field table", font=hdr)
    for col, lab in [("idx", "#"), ("key", "key"), ("label", "label"), ("pw", "2^#"), ("raw", "override text"),
                     ("parsed", "override parsed"), ("eff", "override used"), ("auto", "auto col"),
                     ("used", "used col"), ("auto_letter", "auto letter"), ("used_letter", "used letter"),
                     ("hdr_text", "header text"), ("example", "example"), ("note", "note"),
                     ("ovflag", "override worth a look")]:
        put(ws, f"{FT[col]}4", lab, font=hdr)
    fld_row = f"${scol(1)}${R_FLD}:${scol(PASTE_COLS)}${R_FLD}"
    flda_row = f"${scol(1)}${R_FLDA}:${scol(PASTE_COLS)}${R_FLDA}"
    nhf_row = f"${scol(1)}${R_NHF}:${scol(PASTE_COLS)}${R_NHF}"
    labels_rng = f"${FT['label']}${FT_ROW0}:${FT['label']}${FT_ROW0 + 14}"
    eff_all = f"${FT['eff']}${FT_ROW0}:${FT['eff']}${FT_ROW0 + 14}"
    put(ws, f"{FT_OVPRE}4", "override normalized (stage 1)", font=hdr)
    for i, (key, label) in enumerate(FIELDS, start=1):
        r = FT_ROW0 + i - 1
        c = lambda col: f"{FT[col]}{r}"
        ws[c("idx")] = i
        ws[c("key")] = key
        ws[c("label")] = label
        ws[c("pw")] = 2 ** i
        ovr = f"{CHECK}!$F${12 + i}"
        ws[c("raw")] = f'=IFERROR(UPPER(TRIM({ovr}&"")),"#")'
        raw = c("raw")
        # An override is a column letter A-BH, "-" (leave the field out), or a
        # column title: the first column of the header row whose normalized
        # title is the same (works whatever order the columns are in).
        ovpre = f"{FT_OVPRE}{r}"
        ws[ovpre] = "=" + norm1_expr(raw)
        ov_norm = norm2_expr(ovpre)
        letter_no = f"MATCH(1,INDEX(--EXACT({LETTERS},{raw}),0),0)"
        ws[c("parsed")] = (f'=IF({raw}="",0,IF(OR({raw}="-",{raw}="NONE"),-1,IFERROR({letter_no},'
                           f'IF({ov_norm}="",-2,IFERROR(MATCH(1,INDEX(--EXACT({nhf_row},{ov_norm}),0),0),-2)))))')
        parsed = c("parsed")
        by_title = f"AND({parsed}>0,ISERROR({letter_no}))"
        if i == 1:
            ws[c("eff")] = f"=IF({parsed}<=0,IF({parsed}=-1,-1,0),{parsed})"
        else:
            ws[c("eff")] = (f"=IF({parsed}<=0,IF({parsed}=-1,-1,0),"
                            f"IF(COUNTIF(${FT['parsed']}${FT_ROW0}:{FT['parsed']}{r - 1},{parsed})>0,0,{parsed}))")
        ws[c("auto")] = f"=IFERROR(MATCH({i},{flda_row},0),0)"
        ws[c("used")] = f"=IFERROR(MATCH({i},{fld_row},0),0)"
        ws[c("auto_letter")] = f'=IF({c("auto")}=0,"(not found)",INDEX({LETTERS},{c("auto")}))'
        ws[c("used_letter")] = (f'=IF({c("used")}=0,IF({c("eff")}=-1,"(left out)","(none)"),'
                                f'INDEX({LETTERS},{c("used")}))')
        x_h = paste("HEADER_ROW", c("used"))
        xh_t = ttrim(x_h + '&""')
        ws[c("hdr_text")] = f'=IF({c("used")}=0,"",IFERROR({xh_t},""))'
        x_e = paste(s["ex_pr"], c("used"))
        xe_t = ttrim(x_e + '&""')
        ws[c("example")] = (f'=IF(OR({c("used")}=0,{s["ex_pr"]}=0),"",'
                            f'IFERROR(IF(ISNUMBER({x_e}),{x_e},{xe_t}),""))')
        auto, used, eff, auto_l = c("auto"), c("used"), c("eff"), c("auto_letter")
        at_t = ttrim(paste("HEADER_ROW", auto) + '&""')
        auto_title = f'IFERROR({at_t},"")'
        conflict_owner = f"INDEX({labels_rng},MATCH({parsed},${FT['parsed']}${FT_ROW0}:${FT['parsed']}${FT_ROW0 + 14},0))"
        displaced = f"AND({eff}=0,{auto}>0,COUNTIF({eff_all},{auto})>0)"
        displaced_txt = (f'"Column "&{auto_l}&" is used by "&INDEX({labels_rng},MATCH({auto},{eff_all},0))&" (Override)"'
                         f'&IF({used}>0," - using column "&{c("used_letter")}&" instead",'
                         + ('" - REQUIRED: pick its title (or type its letter) in Override"' if i <= 2 else '" - not used"') + ")")
        differs = f"AND({eff}>0,{auto}>0,{eff}<>{auto})"
        differs_txt = (f'"Override in use - this file\'s own title for it is in column "&{auto_l}&" ("&{auto_title}'
                       f'&"). Clear the Override if that is right."')
        leftout = f"AND({eff}=-1,{auto}>0)"
        leftout_txt = f'"Left out by the Override - this file has it in column "&{auto_l}&" ("&{auto_title}&")."'
        # the Override gives a field this file's titles don't: by letter it
        # breaks when the columns move (worth a look), by title it doesn't
        ov_only = f"AND({eff}>0,{auto}=0)"
        ut_t = ttrim(paste("HEADER_ROW", eff) + '&""')
        used_title = f'IFERROR({ut_t},"")'
        ov_only_txt = (f'IF({by_title},"Found by the title you typed: column "&{c("used_letter")}&".",'
                       f'IF({used_title}="","Found by the letter you typed: column "&{c("used_letter")}&" has no '
                       f'title, so a letter is the only way - check it again when the file\'s layout changes.",'
                       f'"Column "&{c("used_letter")}&" (titled \'"&{used_title}&"\') - check it is right. If another '
                       f'day\'s file has its columns in a different order, a letter points at the wrong column: '
                       f'pick the column\'s title here instead."))')
        if i <= 2:
            rest = (f'IF(AND({used}=0,{eff}<>-1),"REQUIRED - not found: pick its title (or type its letter) in Override",'
                    f'IF({eff}=-1,"REQUIRED - it can\'t be left out",IF({differs},{differs_txt},'
                    f'IF({ov_only},{ov_only_txt},""))))')
        else:
            rest = f'IF({differs},{differs_txt},IF({leftout},{leftout_txt},IF({ov_only},{ov_only_txt},"")))'
        ws[c("note")] = (f'=IF({parsed}=-2,"\'"&IFERROR(TRIM({ovr}&""),"#")&"\' is not a column letter (A to BH) or a column title '
                         f'in row "&HEADER_ROW&" - ignored",'
                         f'IF(AND({parsed}>0,{eff}=0),"Column "&INDEX({LETTERS},{parsed})&" is already used by "'
                         f'&{conflict_owner}&" - ignored",IF({displaced},{displaced_txt},{rest})))')
        ws[c("ovflag")] = (f'=IF(OR({differs},{leftout},{displaced},AND({ov_only},NOT({by_title}),{used_title}<>"")),'
                           f'1,0)')

    cotton_field(ws, s, nhf_row, fld_row)

    # ---- column letters, aliases -----------------------------------------
    put(ws, f"{LET_NUM}3", "Columns", font=hdr)
    for c in range(1, PASTE_COLS + 1):
        ws[f"{LET_NUM}{4 + c}"] = c
        ws[f"{LET_COL}{4 + c}"] = L(c)
    put(ws, f"{ALIAS_NORM}3", "Header aliases (EXACT)", font=hdr)
    r = 5
    for key, aliases in EXACT.items():
        for a in aliases:
            ws[f"{ALIAS_NORM}{r}"] = a
            ws[f"{ALIAS_FIELD}{r}"] = FI[key]
            r += 1
    alias_norm = f"${ALIAS_NORM}$5:${ALIAS_NORM}${r - 1}"
    alias_field = f"${ALIAS_FIELD}$5:${ALIAS_FIELD}${r - 1}"

    # ---- header scan, rows 1..40 -----------------------------------------
    put(ws, f"{SCAN_FIRST}3", "Header scan (pasted rows 1-40 x columns A-BH)", font=hdr)
    for c in range(1, PASTE_COLS + 1):
        put(ws, f"{scol(c)}4", L(c), font=hdr)
    for blk, base in [("normalized", B_NH), ("cell type", B_CT), ("EXACT field", B_CAND), ("CONTAINS mask", B_CM),
                      ("CONTAINS running mask", B_CML), ("normalized, stage 1", B_PRE)]:
        put(ws, f"{L(SCAN_C0 - 1)}{base + 1}", blk, font=hdr)
    for n in SUM_COLS.col:
        put(ws, f"{SUM_COLS[n]}4", n, font=hdr)

    def row_rng(base, r_):
        return f"${SCAN_FIRST}{base + r_}:${SCAN_LAST}{base + r_}"

    for r_ in range(1, SCAN_ROWS + 1):
        exm = f"${SUM_COLS['exm']}{B_NH + r_}"
        for c in range(1, PASTE_COLS + 1):
            col = scol(c)
            x = paste(r_, c)
            nh, pre = f"{col}{B_NH + r_}", f"{col}{B_PRE + r_}"
            ws[pre] = "=" + norm1_expr(x)
            ws[nh] = "=" + norm2_expr(pre)
            ws[f"{col}{B_CT + r_}"] = "=" + celltype_expr(x)
            cand = f"{col}{B_CAND + r_}"
            ws[cand] = f'=IF({nh}="",0,IFERROR(INDEX({alias_field},MATCH({nh},{alias_norm},0)),0))'
            cm = f"{col}{B_CM + r_}"
            ws[cm] = "=" + rule_mask_expr(nh)
            prev = "0" if c == 1 else f"{scol(c - 1)}{B_CML + r_}"
            claimed = (f"{cand}>0" if c == 1 else
                       f"AND({cand}>0,COUNTIF(${SCAN_FIRST}{B_CAND + r_}:{scol(c - 1)}{B_CAND + r_},{cand})=0)")
            ws[f"{col}{B_CML + r_}"] = f"={prev}+IF({claimed},0,{lowbit_expr(cm, f'{exm}+{prev}')})"
        rr = B_NH + r_
        ct_row, cand_row = row_rng(B_CT, r_), row_rng(B_CAND, r_)
        ws[f"{SUM_COLS['filled']}{rr}"] = f'=COUNTIF({ct_row},">0")'
        ws[f"{SUM_COLS['nums']}{rr}"] = f"=COUNTIF({ct_row},2)"
        ws[f"{SUM_COLS['exm']}{rr}"] = f"=SUMPRODUCT((COUNTIF({cand_row},{FIDX})>0)*{PW})"
        ws[f"{SUM_COLS['cmm']}{rr}"] = f"={SCAN_LAST}{B_CML + r_}"
        allm = f"({SUM_COLS['exm']}{rr}+{SUM_COLS['cmm']}{rr})"
        ws[f"{SUM_COLS['mapped']}{rr}"] = "=" + popcount(allm)
        ws[f"{SUM_COLS['score']}{rr}"] = (f"=IF({SUM_COLS['filled']}{rr}<2,-9999,{SUM_COLS['mapped']}{rr}"
                                          f"+2*{bit_set(allm, 1)}+2*{bit_set(allm, 2)}-{SUM_COLS['nums']}{rr})")

    # ---- the header row actually used ---------------------------------------
    for rr, lab in [(R_NHF, "used row: normalized"), (R_CANDF, "EXACT field"), (R_CMF, "CONTAINS mask"),
                    (R_EXA, "auto: EXACT claim"), (R_CMLA, "auto: CONTAINS running"), (R_FLDA, "auto: field"),
                    (R_OVC, "override field"), (R_EXF, "EXACT claim"), (R_CMLF, "CONTAINS running"),
                    (R_FLD, "field used"), (R_PREF, "used row: normalized, stage 1")]:
        put(ws, f"{L(SCAN_C0 - 1)}{rr}", lab, font=hdr)
    exma, ovmask, exmf = f"${SUM_COLS['filled']}${R_EXA}", f"${SUM_COLS['filled']}${R_OVC}", f"${SUM_COLS['filled']}${R_EXF}"
    put(ws, f"{SUM_COLS['nums']}{R_EXA}", "EXACT mask (auto)", font=hdr)
    put(ws, f"{SUM_COLS['nums']}{R_OVC}", "overridden fields mask", font=hdr)
    put(ws, f"{SUM_COLS['nums']}{R_EXF}", "EXACT mask (used)", font=hdr)
    candf_row = f"${SCAN_FIRST}${R_CANDF}:${SCAN_LAST}${R_CANDF}"
    exf_row = f"${SCAN_FIRST}${R_EXF}:${SCAN_LAST}${R_EXF}"
    ws[exma.replace("$", "")] = f"=SUMPRODUCT((COUNTIF({candf_row},{FIDX})>0)*{PW})"
    eff_rng = f"${FT['eff']}${FT_ROW0}:${FT['eff']}${FT_ROW0 + 14}"
    pw_rng = f"${FT['pw']}${FT_ROW0}:${FT['pw']}${FT_ROW0 + 14}"
    ws[ovmask.replace("$", "")] = f"=SUMPRODUCT(({eff_rng}<>0)*{pw_rng})"
    ws[exmf.replace("$", "")] = f"=SUMPRODUCT((COUNTIF({exf_row},{FIDX})>0)*{PW})"
    for c in range(1, PASTE_COLS + 1):
        col, pc = scol(c), scol(c - 1) if c > 1 else None
        nh, cand, cm = f"{col}{R_NHF}", f"{col}{R_CANDF}", f"{col}{R_CMF}"
        pre = f"{col}{R_PREF}"
        ws[pre] = "=" + norm1_expr(paste("HEADER_ROW", c))
        ws[nh] = "=" + norm2_expr(pre)
        ws[cand] = f'=IF({nh}="",0,IFERROR(INDEX({alias_field},MATCH({nh},{alias_norm},0)),0))'
        ws[cm] = "=" + rule_mask_expr(nh)
        # automatic mapping (no overrides)
        exa = f"{col}{R_EXA}"
        ws[exa] = (f"=IF({cand}>0,{cand},0)" if c == 1 else
                   f"=IF(AND({cand}>0,COUNTIF(${SCAN_FIRST}${R_CANDF}:{pc}{R_CANDF},{cand})=0),{cand},0)")
        prev = "0" if c == 1 else f"{pc}{R_CMLA}"
        cmla = f"{col}{R_CMLA}"
        ws[cmla] = f"={prev}+IF({exa}>0,0,{lowbit_expr(cm, f'{exma}+{prev}')})"
        ws[f"{col}{R_FLDA}"] = f"=IF({exa}>0,{exa},IF({cmla}-{prev}>0,MATCH({cmla}-{prev},{PW},0),0))"
        # with overrides
        ovc = f"{col}{R_OVC}"
        ws[ovc] = f"=IFERROR(MATCH({c},{eff_rng},0),0)"
        exf = f"{col}{R_EXF}"
        left_free = "" if c == 1 else (f",COUNTIFS(${SCAN_FIRST}${R_CANDF}:{pc}{R_CANDF},{cand},"
                                       f"${SCAN_FIRST}${R_OVC}:{pc}{R_OVC},0)=0")
        ws[exf] = f"=IF({ovc}>0,0,IF(AND({cand}>0,MOD(INT({ovmask}/2^{cand}),2)=0{left_free}),{cand},0))"
        prev = "0" if c == 1 else f"{pc}{R_CMLF}"
        cmlf = f"{col}{R_CMLF}"
        ws[cmlf] = f"={prev}+IF(OR({ovc}>0,{exf}>0),0,{lowbit_expr(cm, f'{ovmask}+{exmf}+{prev}')})"
        ws[f"{col}{R_FLD}"] = (f"=IF({ovc}>0,{ovc},IF({exf}>0,{exf},"
                               f"IF({cmlf}-{prev}>0,MATCH({cmlf}-{prev},{PW},0),0)))")

    # ---- pasted rows 1..1000: Line + LEGEND --------------------------------
    put(ws, f"{LN_BAND['rn']}3", "Pasted rows", font=hdr)
    for n, lab in [("rn", "row"), ("ln", "line"), ("leg", "LEGEND")]:
        put(ws, f"{LN_BAND[n]}4", lab, font=hdr)
    for r_ in range(1, PASTE_ROWS + 1):
        rr = 4 + r_
        ws[f"{LN_BAND['rn']}{rr}"] = r_
        x = paste(r_, s["line_col"])
        ws[f"{LN_BAND['ln']}{rr}"] = f'=IF({s["line_col"]}=0,"",IFERROR({ttrim(x)},""))'
        ws[f"{LN_BAND['leg']}{rr}"] = (f'=IF(AND({r_}>HEADER_ROW,UPPER({LN_BAND["ln"]}{rr})="LEGEND"),1,0)')

    # ---- window: every pasted row under the header, down to row 1000 --------
    put(ws, f"{W['kn']}3", f"Window: pasted rows HEADER_ROW+1 .. {PASTE_ROWS} (the first {MAX_WO} work orders are kept)",
        font=hdr)
    for n in W.col:
        put(ws, f"{W[n]}4", n, font=hdr)
    field_of = {"wo": 2, "seq": 3, "item": 4, "desc": 5, "count": 6, "bulk": 7, "bottle": 8, "cap": 9,
                "allergen": 10, "remarks": 11, "qty_s": 12, "pct_s": 13, "stat": 14, "desiccant": 15,
                "cotton": COT_FIDX}
    ln_rng = f"${LN_BAND['ln']}$5:${LN_BAND['ln']}${4 + PASTE_ROWS}"
    for k in range(1, WIN + 1):
        r_ = 4 + k
        c = {n: f"{W[n]}{r_}" for n in W.col}
        A = {n: f"${W[n]}{r_}" for n in W.col}      # absolute column, this row
        up = lambda n: f"${W[n]}${W0 - 1}:{W[n]}{r_ - 1}"     # rows above (from the label row)
        upto = lambda n: f"${W[n]}${W0}:{W[n]}{r_}"           # rows down to this one
        ws[c["kn"]] = k
        ws[c["pr"]] = f"=HEADER_ROW+{A['kn']}"
        ws[c["valid"]] = f"=IF(AND({A['pr']}<={PASTE_ROWS},{A['pr']}<{s['legend_row']}),1,0)"
        ws[c["line"]] = f'=IF({A["valid"]}=1,IFERROR(INDEX({ln_rng},{A["pr"]}),""),"")'
        # The app's duplicate key: every cell of the row, trimmed. The 60 cells
        # are joined with SEP, then cleaned and trimmed once: TRIM collapses the
        # spaces inside each cell and the replacements drop the spaces next to
        # each SEP, which trims every cell at both ends.
        joined = ('&"' + SEP + '"&').join(f'IFERROR({paste(A["pr"], cc)}&"","")' for cc in range(1, PASTE_COLS + 1))
        key = f'SUBSTITUTE(SUBSTITUTE(TRIM({clean(joined)})," {SEP}","{SEP}"),"{SEP} ","{SEP}")'
        ws[c["key"]] = f'=IF(AND({A["valid"]}=1,{A["line"]}<>""),IFERROR({key},"#"&{A["kn"]}),"")'
        ws[c["dup"]] = f'=IF({A["key"]}="",0,IF(SUMPRODUCT(--EXACT({up("key")},{A["key"]}))>0,1,0))'
        ws[c["keep0"]] = f'=IF(AND({A["key"]}<>"",{A["dup"]}=0),1,0)'
        ws[c["ord0"]] = f"={A['keep0']}" if k == 1 else f"={W['ord0']}{r_ - 1}+{A['keep0']}"
        ws[c["keep"]] = f"=IF(AND({A['keep0']}=1,{A['ord0']}<={MAX_WO}),1,0)"
        for n, fidx in field_of.items():
            used = ft("used", fidx)
            x = paste(A["pr"], used)
            t = ttrim(x)
            if n == "remarks":
                val = f'IF(ISNUMBER({x}),{x},IF(SUMPRODUCT(--ISNUMBER(FIND({ALNUM},UPPER({t}))))>0,{t},""))'
            elif n in ("qty_s", "pct_s"):
                # the trimmed text with , and % taken out (a number stays a number)
                val = f'IF(ISNUMBER({x}),{x},SUBSTITUTE(SUBSTITUTE({t},",",""),"%",""))'
            elif n == "stat":
                u = f"UPPER({t})"
                val = (f'IF({u}="READY","Ready",IF({u}="PM","PM",IF(OR({u}="OT",{u}="OVERTIME",{u}="TRIAL"),"OT",'
                       f'{t})))')
            else:
                val = f"IF(ISNUMBER({x}),{x},{t})"
            ws[c[n]] = f'=IF({A["keep"]}=0,"",IF({used}=0,"",IFERROR({val},"")))'
        for n in ("qty", "pct"):
            # JS Number() of that text: ends trimmed, "" -> blank, only spaces -> 0
            q = A[n + "_s"]
            tq = f"TRIM({q})"
            vq = num_value(tq)
            ws[c[n]] = (f'=IF({A["keep"]}=0,"",IFERROR(IF(ISNUMBER({q}),{q},IF({q}="","",IF({tq}="",0,'
                        f'IF(AND({numeric_text_ok(tq)},ISNUMBER({vq})),{vq},"")))),""))')
        # (window row 1 is its own first row; MATCH over a one-cell range is avoided)
        ws[c["firstk"]] = (f'=IF({A["keep"]}=0,"",1)' if k == 1 else
                           f'=IF({A["keep"]}=0,"",MATCH(1,INDEX(EXACT({upto("line")},{A["line"]})*{upto("keep")},0),0))')
        ws[c["isfirst"]] = f"=IF({A['keep']}=0,0,IF({A['firstk']}={A['kn']},1,0))"
        ws[c["cumf"]] = f"={A['isfirst']}" if k == 1 else f"={W['cumf']}{r_ - 1}+{A['isfirst']}"
        ws[c["lno"]] = f'=IF({A["keep"]}=0,"",INDEX({wr("cumf")},{A["firstk"]}))'
        ws[c["anch"]] = (f'=IF({A["keep"]}=0,"",IF({A["seq"]}<>"","",IFERROR(LOOKUP(2,1/(({up("lno")}={A["lno"]})'
                         f'*({up("seq")}<>"")),{up("seq")}),"")))')
        ws[c["sk"]] = f'=IF({A["keep"]}=0,"",IF({A["seq"]}<>"",{A["seq"]},{A["anch"]}))'
        sk = A["sk"]
        ws[c["grp"]] = (f'=IF({A["keep"]}=0,"",IF({sk}="",0,IF(OR(ISNUMBER({sk}),AND({numeric_text_ok(sk)},'
                        f'ISNUMBER({num_value(sk)}))),1,2)))')
        ws[c["nv"]] = (f'=IF({A["keep"]}=0,"",IF({A["grp"]}=1,IF(ISNUMBER({sk}),{sk},{num_value(sk)}),'
                       f'IF({A["grp"]}=2,{A["kn"]},0)))')
        ws[c["rank"]] = (f'=IF({A["keep"]}=0,"",COUNTIF({wr("lno")},"<"&{A["lno"]})+SUMPRODUCT(({wr("lno")}={A["lno"]})'
                         f'*(({wr("grp")}<{A["grp"]})+({wr("grp")}={A["grp"]})*(({wr("nv")}<{A["nv"]})'
                         f'+({wr("nv")}={A["nv"]})*({wr("kn")}<{A["kn"]}))))+1)')
        # report slot: the work orders, and a blank slot after a line whose
        # last work order has notes (LB lcum)
        ws[c["pos"]] = (f'=IF({A["keep"]}=0,"",{A["rank"]}+IFERROR(INDEX(${LB["lcum"]}$5:${LB["lcum"]}${4 + LINE_SLOTS},'
                        f'{A["lno"]}),{A["lno"]}-1))')
        # the line's number, its row on 3. Lines, the name shown, statuses,
        # breaks and crew: worked out once per line (Calc LB), by line number
        lbv = lambda n, dflt: f'IFERROR(INDEX(${LB[n]}$5:${LB[n]}${4 + LINE_SLOTS},{A["lno"]}),{dflt})'
        ws[c["lnum"]] = f'=IF({A["keep"]}=0,"",{lbv("lnum", chr(34) * 2)})'
        ws[c["lidx"]] = f'=IF({A["keep"]}=0,0,{lbv("lidx", 0)})'
        ws[c["dname"]] = f'=IF({A["keep"]}=0,"",{lbv("dname", A["line"])})'
        ws[c["stshown"]] = f'=IF({A["keep"]}=0,"",{lbv("st", chr(34) * 2)})'
        ws[c["sched"]] = f'=IF({A["keep"]}=0,0,{lbv("sched", 0)})'
        ws[c["nxt"]] = f'=IF({A["keep"]}=0,"",{lbv("nxt", chr(34) * 2)})'
        ws[c["brk"]] = f'=IF({A["keep"]}=0,1,{lbv("brk", 1)})'
        ws[c["crew"]] = f'=IF({A["keep"]}=0,"",{lbv("crew", chr(34) * 2)})'
        al, de, bu = A["allergen"], A["desc"], A["bulk"]
        ws[c["hl"]] = (f'=IF({A["keep"]}=0,"",IF(AND({al}<>"",UPPER({al})<>"N"),"allergen",'
                       f'IF(ISNUMBER(SEARCH("oil",{de})),"oil",IF(OR(EXACT({bu},"A662"),EXACT({bu},"A624")),"bulk",""))))')
        ws[c["pa"]] = f'=IF({A["keep"]}=0,"",IF(OR({A["pct"]}="",{A["pct"]}=0),"",{A["pct"]}/100))'
        # INT(x+0.5) is JS Math.round (halves go up); ROUND would take -2.5 to -3
        ws[c["br"]] = f'=IF(OR({A["pa"]}="",{A["qty"]}=""),"",INT({A["qty"]}*(1-{A["pa"]})+0.5))'
        # Old rows left on the sheet: the first kept row with the same WO #
        # (case-sensitive text) - an earlier one means the WO is listed twice...
        ws[c["wofk"]] = (f'=IF(OR({A["keep"]}=0,{A["wo"]}=""),0,1)' if k == 1 else
                         f'=IF(OR({A["keep"]}=0,{A["wo"]}=""),0,'
                         f'MATCH(1,INDEX(EXACT({upto("wo")},{A["wo"]})*{upto("keep")},0),0))')
        # ...and a kept row that looks like a row of column titles (its Line is
        # the header row's Line title, or a Line / WO # title)
        ln_u, wo_u = lnorm_expr(A["line"]), lnorm_expr(A["wo"] + '&""')
        ws[c["hdrlike"]] = (f'=IF({A["keep"]}=0,0,IF(OR(AND({line_hdr}<>"",UPPER({A["line"]})=UPPER({line_hdr})),'
                            f'SUMPRODUCT(--({ln_u}={LINE_ALIASES}))>0,SUMPRODUCT(--({wo_u}={WO_ALIASES}))>0),1,0))')
        # filled cells of the pasted row - only worked out when there is no work
        # order to take the 2. Check Columns examples from
        row_cells = f"INDEX(PASTE_ALL,{A['pr']},1):INDEX(PASTE_ALL,{A['pr']},{PASTE_COLS})"
        ws[c["nfill"]] = (f'=IF(OR({s["first_k"]}>0,{A["valid"]}=0),0,IFERROR({count_content(row_cells)},0))')
        window_v2(ws, c, A, s, r_)

    # ---- report slots (4. Schedule rows 5..2104, three per slot) -------------
    put(ws, f"{O['pn']}3", f"Report slots 1-{OUT_ROWS}: slot p = 4. Schedule rows 2+3p (work order), 3+3p and 4+3p (notes)",
        font=hdr)
    for n in O.col:
        put(ws, f"{O[n]}4", n, font=hdr)
    # what a work-order row shows in each report column (window column)
    row_from = {"o_wo": "wo", "o_seq": "seq", "o_item": "item", "o_desc": "desc", "o_count": "count",
                "o_bulk": "bulk", "o_bottle": "bottle", "o_cap": "capc", "o_allergen": "allergen",
                "o_desiccant": "desiccant", "o_qty": "qty", "o_prog": "prog", "o_left": "left", "o_crew": "crew"}
    st_list = "{" + ",".join(f'"{n}"' for n in STATUS_NAMES) + "}"
    for p in range(1, OUT_ROWS + 1):
        r_ = 4 + p
        A = {n: f"${O[n]}{r_}" for n in O.col}
        ix = lambda n, k_: f"INDEX({wr(n)},{k_})"
        ws[f"{O['pn']}{r_}"] = p
        ws[f"{O['k']}{r_}"] = f"=IFERROR(MATCH({A['pn']},{wr('pos')},0),0)"
        ws[f"{O['kind']}{r_}"] = f'=IF({A["pn"]}>{s["total"]},"",IF({A["k"]}>0,"row","spacer"))'
        prev_kind, next_kind = f"${O['kind']}{r_ - 1}", f"${O['kind']}{r_ + 1}"
        is_row, k = f'{A["kind"]}="row"', A["k"]
        # (two lines can follow each other with no blank slot between them)
        prev_lo, next_lo = f"${O['lo']}{r_ - 1}", f"${O['lo']}{r_ + 1}"
        ws[f"{O['first']}{r_}"] = f'=IF(AND({is_row},OR({prev_kind}<>"row",{prev_lo}<>{A["lo"]})),1,0)'
        ws[f"{O['last']}{r_}"] = f'=IF(AND({is_row},OR({next_kind}<>"row",{next_lo}<>{A["lo"]})),1,0)'
        kk = k
        # LINE: the name and right under it the status tag, in the middle of
        # the line's box (the tag on the middle row); NEXT SHIFT on the tag's
        # row. Role 1 name, 2 tag, 3 the rest, 4 a line with a single row
        # (name and NEXT SHIFT; the status shows by the cell's color)
        name, tag = ix("dname", kk), ix("stshown", kk)
        lbr = lambda n: f"${LB[n]}$5:${LB[n]}${4 + LINE_SLOTS}"
        lo = A["lo"]
        ws[f"{O['lo']}{r_}"] = f'=IF({kk}=0,0,{ix("lno", kk)})'
        # (past the 100 lines of the lines table: the name on the first row)
        ws[f"{O['role']}{r_}"] = (f'=IF({lo}=0,0,IFERROR(IF(INDEX({lbr("lsz")},{lo})=1,4,'
                                  f'IFERROR(MATCH({A["pn"]}-INDEX({lbr("lnp")},{lo}),{{0,1}},0),3)),'
                                  f'IF({A["first"]}=1,1,3)))')
        role = A["role"]
        ws[f"{O['o_line']}{r_}"] = f'=IF(OR({role}=1,{role}=4),{name},IF({role}=2,{tag},""))'
        for oc, wc in row_from.items():
            v = ix(wc, k) if oc in ("o_wo", "o_qty", "o_crew") else ix(wc, k) + '&""'
            ws[f"{O[oc]}{r_}"] = f'=IF({is_row},{v},"")'
        # no rate / no qty: this work order can't be timed; a dash: one above it
        # on the line can't, so neither can it
        est = (f'IF({ix("sched", k)}=1,IF({ix("estt", k)}<>"",{ix("estt", k)},IF({ix("norate", k)}=1,'
               f'IF({ix("rate", k)}="","no rate","no qty"),"—")),"")')
        ws[f"{O['o_est']}{r_}"] = f'=IF({is_row},{est},"")'
        ws[f"{O['o_next']}{r_}"] = f'=IF(OR({role}=2,{role}=4),{ix("nxt", kk)},"")'
        # helpers for the formats (4. Schedule's hidden columns) and the tests
        ws[f"{O['hl']}{r_}"] = f'=IF({is_row},{ix("hl", k)},"")'
        ws[f"{O['sched']}{r_}"] = f'=IF({is_row},{ix("sched", k)},0)'
        ws[f"{O['cchg']}{r_}"] = f'=IF({is_row},IF({ix("co", k)}="S1 Count Change",1,0),0)'
        ws[f"{O['capx']}{r_}"] = f'=IF({is_row},{ix("capchg", k)},0)'
        ws[f"{O['o_status']}{r_}"] = f'=IF({is_row},{tag},"")'
        ws[f"{O['fw']}{r_}"] = f'=IF({is_row},{ix("fw", k)},0)'
        ws[f"{O['code']}{r_}"] = f'=IF({is_row},{ix("co", k)},"")'
        # grey work orders: NOT SCHEDULED and PM / CLEANING lines (the line
        # column and NEXT SHIFT keep their colors)
        ws[f"{O['ns']}{r_}"] = f'=IF({A["stidx"]}>={STATUS_NAMES.index("PM / CLEANING") + 1},1,0)'
        ws[f"{O['stidx']}{r_}"] = f"=IFERROR(MATCH({A['o_status']},{st_list},0),0)"
        ws[f"{O['nidx']}{r_}"] = f"=IFERROR(MATCH({A['o_next']},{st_list},0),0)"
        for oc, wc in (("r_pa", "pa"), ("r_br", "br"), ("r_note", "remarks"), ("r_pct", "pct"), ("r_cap", "cap"),
                       ("o_cnote", "cotext"), ("o_rem", "remtext")):
            ws[f"{O[oc]}{r_}"] = f'=IF({is_row},{ix(wc, k)},"")'

    # ---- today's lines (for 3. Lines) ---------------------------------------
    put(ws, f"{LB['n']}3", "Lines in today's schedule", font=hdr)
    for n in LB.col:
        put(ws, f"{LB[n]}4", n, font=hdr)
    for n_ in range(1, LINE_SLOTS + 1):
        r_ = 4 + n_
        A = {n: f"${LB[n]}{r_}" for n in LB.col}
        ws[f"{LB['n']}{r_}"] = n_
        ws[f"{LB['lk']}{r_}"] = f"=IFERROR(MATCH({A['n']},{wr('cumf')},0),0)"
        ws[f"{LB['name']}{r_}"] = f'=IF({A["lk"]}=0,"",INDEX({wr("line")},{A["lk"]}))'
        ws[f"{LB['cnt']}{r_}"] = f'=IF({A["lk"]}=0,"",COUNTIF({wr("lno")},{A["n"]}))'
        lk = A["lk"]
        lkr = lambda n: f"${LK[n]}$5:${LK[n]}${4 + LINE_SLOTS}"
        ws[f"{LB['lnum']}{r_}"] = f'=IF({lk}=0,"",{lnum_expr(A["name"])})'
        ws[f"{LB['lkey']}{r_}"] = f'=IF({lk}=0,"",IF({A["lnum"]}<>"",{A["lnum"]},"N:"&UPPER(TRIM({A["name"]}&""))))'
        ws[f"{LB['lidx']}{r_}"] = f'=IF({lk}=0,0,IFERROR(MATCH({A["lkey"]},{lkr("key")},0),0))'
        li = A["lidx"]
        ws[f"{LB['dname']}{r_}"] = f'=IF({lk}=0,"",IF({li}>0,TRIM(INDEX(LINES_NAME,{li})&""),{A["name"]}))'
        cnt = lambda st: f'COUNTIFS({wr("lno")},{A["n"]},{wr("stat")},"{st}")>0'
        # a file's Line Status (Ready / PM / OT) when 3. Lines leaves This shift empty
        ws[f"{LB['der']}{r_}"] = (f'=IF({lk}=0,"",IF({cnt("Ready")},"READY LINE",IF({cnt("PM")},"PM / CLEANING",'
                                  f'IF({cnt("OT")},"OVERTIME",""))))')
        ws[f"{LB['ovst']}{r_}"] = f'=IF({li}=0,"",INDEX({lkr("st")},{li}))'
        ov = A["ovst"]
        # (not picked and nothing from the file: NOT SCHEDULED - a line runs
        # only when it is marked so)
        ws[f"{LB['st']}{r_}"] = (f'=IF({lk}=0,"",IF({ov}="NONE","",IF({ov}<>"",{ov},'
                                 f'IF({A["der"]}<>"",{A["der"]},"NOT SCHEDULED"))))')
        run = ",".join(f'{A["st"]}="{st}"' for st in RUN_STATUSES)
        ws[f"{LB['sched']}{r_}"] = f'=IF({lk}=0,0,IF(OR({run}),1,0))'
        nx = f"INDEX({lkr('nx')},{li})"
        # (not picked, or not on 3. Lines: NOT SCHEDULED, as This shift)
        ws[f"{LB['nxt']}{r_}"] = (f'=IF({lk}=0,"",IF({li}=0,"NOT SCHEDULED",IF({nx}="NONE","",'
                                  f'IF({nx}="","NOT SCHEDULED",{nx}))))')
        ws[f"{LB['brk']}{r_}"] = f'=IF({li}=0,1,INDEX({lkr("brk")},{li}))'
        ws[f"{LB['crew']}{r_}"] = f'=IF({li}=0,"",INDEX({lkr("crew")},{li}))'
        ws[f"{LB['note']}{r_}"] = (f'=IF({lk}=0,"",IF({li}>0,"",'
                                   f'"NOT IN YOUR LIST - type it in column A to set its status"))')
        # the lines that are NOT IN YOUR LIST, one after the other (3. Lines column N)
        ws[f"{LB['miss']}{r_}"] = f'=IF(AND({A["lk"]}>0,{A["note"]}<>""),1,0)'
        ws[f"{LB['mcum']}{r_}"] = f"={A['miss']}" if n_ == 1 else f"={LB['mcum']}{r_ - 1}+{A['miss']}"
        mc = f"${LB['mcum']}$5:${LB['mcum']}${4 + LINE_SLOTS}"
        nm = f"${LB['name']}$5:${LB['name']}${4 + LINE_SLOTS}"
        ws[f"{LB['mname']}{r_}"] = f'=IFERROR(INDEX({nm},MATCH({A["n"]},{mc},0)),"")'
        # the row of the line in the left table of 3. Lines (where it is ticked)
        ws[f"{LB['lrow']}{r_}"] = f'=IF({lk}=0,"",IF({li}>0,{li}+3,""))'
        # its box on 4. Schedule, in report slots. Lines are a gap apart: the
        # empty changeover notes row of the line's last work order, or - when
        # that one has notes - a blank slot after it (lsp; lcum: blank slots before the
        # line). Then the first slot, slots, and the name's slot (the status
        # tag right under it is the middle one)
        last_k = f'MATCH(COUNTIF({wr("lno")},"<="&{A["n"]}),{wr("rank")},0)'
        lk_notes = f'INDEX({wr("cotext")},{last_k})&INDEX({wr("remtext")},{last_k})'
        ws[f"{LB['lsp']}{r_}"] = f'=IF({lk}=0,0,IF(IFERROR({lk_notes},"")<>"",1,0))'
        ws[f"{LB['lcum']}{r_}"] = 0 if n_ == 1 else f"={LB['lcum']}{r_ - 1}+{LB['lsp']}{r_ - 1}"
        ws[f"{LB['ltop']}{r_}"] = f'=IF({lk}=0,0,COUNTIF({wr("lno")},"<"&{A["n"]})+{A["lcum"]}+1)'
        ws[f"{LB['lsz']}{r_}"] = f'=IF({lk}=0,0,MIN({A["cnt"]},{OUT_ROWS + 1}-{A["ltop"]}))'
        ws[f"{LB['lnp']}{r_}"] = f'=IF({lk}=0,0,{A["ltop"]}+IF({A["lsz"]}<=1,0,INT({A["lsz"]}/2)-1))'

    # ---- 3. Lines list: matching key of each row ------------------------------
    put(ws, f"{LK['key']}3", "3. Lines rows", font=hdr)
    for n in LK.col:
        put(ws, f"{LK[n]}4", n, font=hdr)
    keys = f"${LK['key']}$5:${LK['key']}${4 + LINE_SLOTS}"
    for i in range(1, LINE_SLOTS + 1):
        r_ = 4 + i
        A = {n: f"${LK[n]}{r_}" for n in LK.col}
        nm = f'TRIM(INDEX(LINES_NAME,{i})&"")'
        ws[f"{LK['num']}{r_}"] = f'=IF({nm}="","",{lnum_expr(nm)})'
        ws[f"{LK['key']}{r_}"] = f'=IF({nm}="","",IF({A["num"]}<>"",{A["num"]},"N:"&UPPER({nm})))'
        ws[f"{LK['first']}{r_}"] = f'=IF({A["key"]}="",{i},MATCH({A["key"]},{keys},0))'
        ws[f"{LK['st']}{r_}"] = f"={status_expr(f'INDEX(LINES_STATUS,{i})')}"
        ws[f"{LK['nx']}{r_}"] = f"={status_expr(f'INDEX(LINES_NEXT,{i})')}"
        ws[f"{LK['brk']}{r_}"] = f'=IF(UPPER(TRIM(INDEX(LINES_BREAKS,{i})&""))="NO",0,1)'
        ws[f"{LK['crew']}{r_}"] = (f'=IF(TRIM(INDEX(LINES_CREW,{i})&"")="","",IF(ISNUMBER(INDEX(LINES_CREW,{i})),'
                                   f'INDEX(LINES_CREW,{i}),TRIM(INDEX(LINES_CREW,{i})&"")))')
    protect(ws)
    return ws


# ----------------------------------------------------------------------------
# Visible sheets

def build_paste(wb):
    ws = wb.create_sheet(S_PASTE)
    ws.sheet_properties.tabColor = "FFC000"
    # the app's export columns, then the JDE file's COT (cotton) column - empty
    # on the printout this sample comes from
    for i, h in enumerate(EXPORT_HEADERS + ["COT"], start=1):
        put(ws, f"{L(i)}1", h, font=font(11, True))
    for r, row in enumerate(SAMPLE, start=2):
        # LINE .. % Complete in columns 1-13, Desiccant in its export column 18
        for i, v in list(enumerate(row[:13], start=1)) + [(18, row[13])]:
            if v != "":
                ws.cell(r, i, v)
    # wide enough in real Excel (tighter than LibreOffice) for the sample's titles
    # and values in 11 pt
    widths = [9, 10, 6, 10, 36, 7, 11, 11, 30, 9, 40, 13, 12, 18, 18, 14, 12, 11, 7]
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[L(i)].width = w
    fit_width(ws, "landscape")
    return ws


EXAMPLE_HEAD = (f'IF({SC["first_pr"]}>0,"Example (first work order)",IF({SC["ex_pr"]}>0,"Example (row "&{SC["ex_pr"]}'
                f'&" of 1. Paste Schedule)","Example"))')


def build_check(wb):
    ws = wb.create_sheet(S_CHECK)
    ws.sheet_properties.tabColor = "70AD47"
    ws.sheet_view.showGridLines = False
    for col, w in {"A": 2, "B": 30, "C": 16, "D": 30, "E": 30, "F": 22, "G": 14, "H": 64, "I": 2}.items():
        ws.column_dimensions[col].width = w
    put(ws, "B1", "2. Check Columns", font=font(18, True))
    put(ws, "B2", "Check this page every time you paste a new schedule. Only the yellow cells can be changed - "
                  "everything else is filled in automatically.", font=font(10, italic=True, color="595959"))
    lab = font(11, True)
    put(ws, "B4", "Header row found automatically:", font=lab)
    put(ws, "E4", f"={SC['hdr_auto']}", font=font(11), alignment=Alignment(horizontal="center"), border=THIN_GRAY)
    put(ws, "B5", "Header row override (type a row number, or leave empty):", font=lab)
    put(ws, "E5", None, fill=INPUT_FILL, border=THIN_BLACK, protection=UNLOCKED, font=font(11, True),
        alignment=Alignment(horizontal="center"))
    put(ws, "F5", f'=IF(TRIM(E5&"")="","",IF({SC["hdr_ov_ok"]}=0,"Not a row number from 1 to {PASTE_ROWS - 1} - ignored",'
                  f'IF({SC["hdr_ov"]}<>{SC["hdr_auto"]},"Override in use - automatic would be row "&{SC["hdr_auto"]}'
                  f'&". Clear it if today\'s file is different.","Same as automatic - you can clear it.")))',
        font=font(10, True, "C00000"))
    put(ws, "B6", "Header row used:", font=lab)
    put(ws, "E6", f"=IF({SC['hdr_ov_ok']}=1,{SC['hdr_ov']},{SC['hdr_auto']})", font=font(11, True),
        alignment=Alignment(horizontal="center"), border=THIN_BLACK)
    ws.merge_cells("B8:H8")
    put(ws, "B8", f"={SC['status_text']}", font=font(13, True), border=THIN_BLACK,
        alignment=Alignment(wrap_text=True, vertical="center", horizontal="left", indent=1))
    ws.row_dimensions[8].height = 66
    put(ws, "J8", f"={SC['status_ok']}")
    cf(ws, "B8:H8", "$J$8=1", "C6EFCE", font(13, True, "006100"))
    cf(ws, "B8:H8", "$J$8<>1", "FFC7CE", font(13, True, "9C0006"))
    put(ws, "B9", "Work orders found:", font=lab)
    put(ws, "E9", f"={SC['wo_count']}", font=font(11, True), alignment=Alignment(horizontal="center"))
    put(ws, "B10", "Lines found:", font=lab)
    put(ws, "E10", f"={SC['line_count']}", font=font(11, True), alignment=Alignment(horizontal="center"))
    # first / last work order read - compare them with today's file (old rows left on the sheet show up here)
    for r, lab_, key in [(9, "First work order:", "first_text"), (10, "Last work order:", "last_text")]:
        put(ws, f"F{r}", lab_, font=lab, alignment=Alignment(horizontal="right"))
        ws.merge_cells(f"G{r}:H{r}")
        put(ws, f"G{r}", f"={SC[key]}", font=font(11, True), alignment=Alignment(horizontal="left", indent=1))

    heads = ["Field (bold = needed)", "Found automatically", "Header text (column used)", "=" + EXAMPLE_HEAD,
             "Override: pick the column's title (or type a letter like C), or - to leave the field out", "Column used", "Note"]
    for i, h in enumerate(heads):
        put(ws, f"{L(2 + i)}12", h, font=font(10, True), fill=fill(C_HEADER), border=THIN_BLACK,
            alignment=Alignment(wrap_text=True, vertical="center"))
    ws.row_dimensions[12].height = 58
    for i, (key, label) in enumerate(FIELDS, start=1):
        r = 12 + i
        cr = FT_ROW0 + i - 1
        put(ws, f"B{r}", label, font=font(10, i <= 2), border=THIN_GRAY)
        put(ws, f"C{r}", f"=Calc!${FT['auto_letter']}${cr}", border=THIN_GRAY, font=font(10),
            alignment=Alignment(horizontal="center"))
        put(ws, f"D{r}", f"=Calc!${FT['hdr_text']}${cr}", border=THIN_GRAY, font=font(10))
        put(ws, f"E{r}", f"=Calc!${FT['example']}${cr}", border=THIN_GRAY, font=font(10),
            alignment=Alignment(horizontal="left"))
        put(ws, f"F{r}", None, fill=INPUT_FILL, border=THIN_BLACK, protection=UNLOCKED, font=font(11, True),
            alignment=Alignment(horizontal="center"))
        put(ws, f"G{r}", f"=Calc!${FT['used_letter']}${cr}", border=THIN_GRAY, font=font(10, True),
            alignment=Alignment(horizontal="center"))
        put(ws, f"H{r}", f"=Calc!${FT['note']}${cr}", border=THIN_GRAY, font=font(10, True, "C00000"),
            alignment=Alignment(wrap_text=True, vertical="top"))
        # two lines for a note: Excel doesn't grow a row to fit a formula's text
        ws.row_dimensions[r].height = 27
        put(ws, f"J{r}", f"=IF(Calc!${FT['used']}${cr}=0,1,0)")
        put(ws, f"K{r}", f'=IF(LEFT(H{r},5)="Found",1,0)')     # 1 = the Note is only information
    # row 28: Cotton - not one of the app's fields; it prints as a note
    r, cr = COT_CHECK_ROW, FT_ROW0 + COT_FIDX - 1
    put(ws, f"B{r}", "Cotton (COT) - in the notes rows", font=font(10, italic=True), border=THIN_GRAY,
        fill=fill(C_NOTE_FILL))
    for col, key, al in (("C", "auto_letter", "center"), ("D", "hdr_text", "left"), ("E", "example", "left"),
                         ("G", "used_letter", "center")):
        put(ws, f"{col}{r}", f"=Calc!${FT[key]}${cr}", border=THIN_GRAY, font=font(10, col == "G"),
            alignment=Alignment(horizontal=al))
    put(ws, f"F{r}", None, fill=INPUT_FILL, border=THIN_BLACK, protection=UNLOCKED, font=font(11, True),
        alignment=Alignment(horizontal="center"))
    put(ws, f"H{r}", f"=Calc!${FT['note']}${cr}", border=THIN_GRAY, font=font(10, True, "C00000"),
        alignment=Alignment(wrap_text=True, vertical="top"))
    ws.row_dimensions[r].height = 27
    put(ws, f"K{r}", f'=IF(OR(LEFT(H{r},5)="Found",LEFT(H{r},5)="No CO"),1,0)')
    cf(ws, "G13:G14", "$J13=1", "FFC7CE", font(10, True, "9C0006"))
    cf(ws, f"H13:H{COT_CHECK_ROW}", "$K13=1", None, font(10, True, "006100"))

    put(ws, "B30", '="Your file\'s columns (header row "&HEADER_ROW&") - use this list to find the right title '
                   'or letter for an Override."', font=font(12, True))
    for i, h in enumerate(["Column", "Header text", "=" + EXAMPLE_HEAD, "Goes into"]):
        put(ws, f"{L(2 + i)}31", h, font=font(10, True), fill=fill(C_HEADER), border=THIN_BLACK)
    for c in range(1, PASTE_COLS + 1):
        r = 31 + c
        put(ws, f"B{r}", L(c), font=font(10, True), border=THIN_GRAY, alignment=Alignment(horizontal="center"))
        xh = paste("HEADER_ROW", c)
        xh_t = ttrim(xh + '&""')
        put(ws, f"C{r}", f'=IFERROR({xh_t},"")', font=font(10), border=THIN_GRAY,
            alignment=Alignment(shrink_to_fit=True))
        xe = paste(SC["ex_pr"], c)
        xe_t = ttrim(xe + '&""')
        put(ws, f"D{r}", f'=IF({SC["ex_pr"]}=0,"",IFERROR(IF(ISNUMBER({xe}),{xe},{xe_t}),""))',
            font=font(10), border=THIN_GRAY, alignment=Alignment(horizontal="left"))
        fld = f"Calc!${scol(c)}${R_FLD}"
        cot_used = f"Calc!${FT['used']}${FT_ROW0 + COT_FIDX - 1}"
        put(ws, f"E{r}", (f'=IF({fld}=0,IF({cot_used}={c},"Cotton (note)",""),'
                          f'INDEX(Calc!${FT["label"]}${FT_ROW0}:${FT["label"]}${FT_ROW0 + 14},{fld}))'),
            font=font(10, True), border=THIN_GRAY)
    cf(ws, f"B32:E{31 + PASTE_COLS}", '$E32<>""', "E2EFDA")

    # drop-down list for the overrides: "-" and the titles of today's columns
    # (hidden column L; J32:J91 count the titled columns). A letter can still
    # be typed - the list doesn't reject other entries.
    put(ws, "L1", "Override choices")
    put(ws, "L2", "-")
    for c in range(1, PASTE_COLS + 1):
        r = 31 + c
        ws[f"J{r}"] = f'=IF(C{r}="",0,1)' if c == 1 else f'=J{r - 1}+IF(C{r}="",0,1)'
        ws[f"L{2 + c}"] = f'=IFERROR(INDEX($C$32:$C${31 + PASTE_COLS},MATCH({c},$J$32:$J${31 + PASTE_COLS},0)),"")'
    dv = DataValidation(type="list", formula1=f"$L$2:$L${2 + PASTE_COLS}", allow_blank=True, showErrorMessage=False,
                        showInputMessage=True, promptTitle="Override",
                        prompt="Pick the title of the column that holds this field (or type it), or pick - to "
                               "leave the field out. A column letter like C works too. Leave empty to let the "
                               "file find it.")
    ws.add_data_validation(dv)
    dv.add(f"F13:F{COT_CHECK_ROW}")
    dv2 = DataValidation(type="whole", operator="between", formula1="1", formula2=str(PASTE_ROWS - 1), allow_blank=True,
                         showErrorMessage=True, errorTitle="Header row", error="Type a row number from 1 to 999.")
    ws.add_data_validation(dv2)
    dv2.add("E5")
    for col in ("J", "K", "L"):
        ws.column_dimensions[col].hidden = True
    fit_width(ws, "landscape")
    ws.print_area = f"B1:H{31 + PASTE_COLS}"
    protect(ws, formatColumns=False, formatRows=False)
    return ws


# 3. Lines starts with the plant's lines (as named on the JDE Packaging
# Schedule) and whether each has breaks and lunch: lines 1, 3, 5 and 7 do,
# lines 8 to 12 run through them. Line 4 isn't known - it is set to Yes.
LINE_LIST = [("LINE 1", "Yes"), ("LINE 3", "Yes"), ("LINE 4", "Yes"), ("LINE 5", "Yes"), ("LINE 7", "Yes"),
             ("LINE 8", "No"), ("LINE 9", "No"), ("LINE 10", "No"), ("LINE 11", "No"), ("LINE 12", "No")]
SHIFTS = ["1st Shift", "2nd Shift", "3rd Shift"]


def build_lines(wb):
    ws = wb.create_sheet(S_LINES)
    ws.sheet_properties.tabColor = "00C805"
    ws.sheet_view.showGridLines = False
    for col, w in {"A": 14, "B": 17, "C": 17, "D": 10, "E": 7, "F": 10, "G": 30, "H": 2, "I": 9, "J": 18,
                   "K": 10, "L": 21, "M": 44, "N": 2, "O": 22}.items():
        ws.column_dimensions[col].width = w
    put(ws, "A1", "3. Lines", font=font(18, True), alignment=Alignment(vertical="center"))
    put(ws, "B1", "This copy is for:", font=font(11, True), alignment=Alignment(horizontal="right", vertical="center"))
    put(ws, "C1", None, fill=INPUT_FILL, border=THIN_BLACK, protection=UNLOCKED, font=font(11, True),
        alignment=Alignment(horizontal="center", vertical="center"))
    ws.merge_cells("I1:K1")
    put(ws, "I1", "Schedule as of (date and time):", font=font(11, True),
        alignment=Alignment(horizontal="right", vertical="center"))
    put(ws, "L1", None, fill=INPUT_FILL, border=THIN_BLACK, protection=UNLOCKED, font=font(11, True),
        number_format="m/d/yyyy h:mm AM/PM", alignment=Alignment(horizontal="center", vertical="center"))
    put(ws, "M1", (f'=IF({SC["stale"]}=0,"",IF(ISNUMBER(L1),"CHECK: the statuses below were set for an earlier '
                   f'day than today.","CHECK: there is no date in the yellow box."))&IF({SC["stale"]}=0,"",'
                   f'" Check them, then click Set time to now (or double-click the yellow box).")'),
        font=font(10, True, "C00000"), alignment=Alignment(wrap_text=True, vertical="center"))
    cf(ws, "M1", '$M$1<>""', "FFC7CE", font(10, True, "9C0006"))
    ws.row_dimensions[1].height = LINES_ROW1_PT
    dvs = DataValidation(type="list", formula1='"' + ",".join(SHIFTS) + '"', allow_blank=True,
                         showErrorMessage=True, errorTitle="Shift", error="Pick 1st, 2nd or 3rd Shift.")
    ws.add_data_validation(dvs)
    dvs.add("C1")
    dv0 = DataValidation(type="decimal", operator="greaterThan", formula1="36526", allow_blank=True,
                         showErrorMessage=True, errorTitle="Date and time",
                         error="Type a date and time, like 10/29/2026 5:15 AM - or press Ctrl+; then a space, "
                               "then Ctrl+Shift+; for now.",
                         showInputMessage=True, promptTitle="Schedule as of",
                         prompt="When the % Complete in today's file was taken. Double-click for now (or "
                                "Ctrl+; a space, Ctrl+Shift+;). The estimated times count from here.")
    ws.add_data_validation(dv0)
    dv0.add("L1")
    ws.merge_cells("A2:G2")
    put(ws, "A2", "The buttons (click Enable Content if Excel asks): Guided setup asks you step by step. By hand: "
                  "pick each line's status - double-click one to switch RUNNING / NOT SCHEDULED - type the crew, "
                  "and double-click the yellow time box for now.",
        font=font(10, italic=True, color="595959"), alignment=Alignment(wrap_text=True, vertical="top"))
    ws.merge_cells("I2:M2")
    put(ws, "I2", f'=IF(LINE_COUNT>{LINE_SLOTS},"WARNING: "&LINE_COUNT&" lines in today\'s schedule - only the first '
                  f'{LINE_SLOTS} are listed here.","")', font=font(10, True, "C00000"),
        alignment=Alignment(wrap_text=True, vertical="top"))
    ws.row_dimensions[2].height = LINES_ROW2_PT
    left = ["Line", "This shift", "Next shift", "Breaks & lunch", "Crew (EE)", "Work orders today", "Note"]
    right = ["Its row on the left", "Lines in today's schedule", "Work orders", "This shift (shown)", "Note"]
    for i, h in enumerate(left):
        put(ws, f"{L(1 + i)}3", h, font=font(10, True, "FFFFFF"), fill=fill(C_COLHEAD), border=THIN_BLACK,
            alignment=Alignment(wrap_text=True, vertical="center"))
    for i, h in enumerate(right):
        put(ws, f"{L(9 + i)}3", h, font=font(10, True, "FFFFFF"), fill=fill(C_COLHEAD), border=THIN_BLACK,
            alignment=Alignment(wrap_text=True, vertical="center"))
    put(ws, "O3", "Lines to add to column A", font=font(10, True, "FFFFFF"), fill=fill(C_COLHEAD), border=THIN_BLACK,
        alignment=Alignment(wrap_text=True, vertical="center"))
    ws.row_dimensions[3].height = 42
    center = Alignment(horizontal="center", vertical="center")
    lb = lambda n: f"Calc!${LB[n]}$5:${LB[n]}${4 + LINE_SLOTS}"
    lk = lambda n: f"Calc!${LK[n]}$5:${LK[n]}${4 + LINE_SLOTS}"
    lidx = f"Calc!${W['lidx']}${W0}:${W['lidx']}${WN}"
    for i in range(LINE_SLOTS):
        r = 4 + i
        name, brk = LINE_LIST[i] if i < len(LINE_LIST) else (None, None)
        # the input cells are yellow, like every cell that takes typing
        put(ws, f"A{r}", name, font=font(11, True), protection=UNLOCKED, border=THIN_GRAY, fill=INPUT_FILL)
        for col, val in (("B", None), ("C", None), ("D", brk), ("E", None)):
            put(ws, f"{col}{r}", val, protection=UNLOCKED, border=THIN_GRAY, alignment=center, font=font(10, True),
                fill=INPUT_FILL)
        put(ws, f"F{r}", f'=IF(TRIM(A{r}&"")="","",COUNTIF({lidx},{i + 1}))', border=THIN_GRAY, alignment=center,
            font=font(10))
        at_k = f"INDEX({lk('key')},{i + 1})"
        put(ws, f"G{r}", (f'=IF(TRIM(A{r}&"")="",IF(OR(TRIM(B{r}&"")<>"",TRIM(C{r}&"")<>"",TRIM(E{r}&"")<>""),'
                          f'"No line name - clear this row",""),IF(INDEX({lk("first")},{i + 1})<{i + 1},'
                          f'"Listed twice - only the first one is used",IF(F{r}=0,"Not in today\'s schedule","")))'),
            font=font(9, italic=True, color="7F7F7F"), border=THIN_GRAY)
        # right-hand lists: by position (ROW()-3), so they stay whole if a row is ever inserted or deleted
        at = lambda n: f"INDEX({lb(n)},ROW()-3)"
        put(ws, f"I{r}", f'=IF({at("lrow")}="","","row "&{at("lrow")})', font=font(10, color="404040"),
            alignment=center)
        put(ws, f"J{r}", f"={at('name')}", font=font(11, True))
        put(ws, f"K{r}", f"={at('cnt')}", alignment=center, font=font(10))
        put(ws, f"L{r}", f"={at('st')}", alignment=center, font=font(10, True))
        put(ws, f"M{r}", f"={at('note')}", font=font(10, True, "C00000"))
        put(ws, f"O{r}", f"={at('mname')}", font=font(11, True, "C00000"))
    last = 3 + LINE_SLOTS
    orphan = 'AND(TRIM($A4&"")="",OR(TRIM($B4&"")<>"",TRIM($C4&"")<>"",TRIM($E4&"")<>""))'
    cf(ws, f"B4:E{last}", orphan, "FFC7CE", font(10, True, "9C0006"))      # first, so it wins
    cf(ws, f"G4:G{last}", 'OR(LEFT($G4,7)="No line",LEFT($G4,12)="Listed twice")', None, font(9, True, "C00000"))
    for st, strong, txt, _ in STATUSES:
        cf(ws, f"B4:C{last}", f'UPPER(TRIM(B4&""))="{st}"', strong, font(10, True, txt))
        cf(ws, f"L4:L{last}", f'$L4="{st}"', strong, font(10, True, txt))
    cf(ws, f"D4:D{last}", 'UPPER(TRIM($D4&""))="NO"', "EDEDED", font(10, True, "404040"))
    cf(ws, f"M4:M{last}", '$M4<>""', "FFC7CE", font(10, True, "9C0006"))
    cf(ws, f"O4:O{last}", '$O4<>""', "FFC7CE", font(11, True, "9C0006"))
    dv1 = DataValidation(type="list", formula1='"' + ",".join(STATUS_NAMES) + '"', allow_blank=True,
                         showErrorMessage=True, errorStyle="warning", errorTitle="Status",
                         error="Pick a status from the list (or leave it empty).",
                         showInputMessage=True, promptTitle="Line status",
                         prompt="RUNNING, PARTIAL SHIFT or OVERTIME: the line runs (estimated times). READY LINE, "
                                "PM / CLEANING, NOT SCHEDULED: it doesn't. Empty: from your file.")
    dv2 = DataValidation(type="list", formula1='"Yes,No"', allow_blank=True, showErrorMessage=True,
                         errorTitle="Breaks & lunch", error="Pick Yes or No.")
    dv3 = DataValidation(type="whole", operator="between", formula1="0", formula2="99", allow_blank=True,
                         showErrorMessage=True, errorTitle="Crew", error="Type the number of people (0 to 99).")
    for dv, rng in ((dv1, f"B4:C{last}"), (dv2, f"D4:D{last}"), (dv3, f"E4:E{last}")):
        ws.add_data_validation(dv)
        dv.add(rng)
    ws.freeze_panes = "A4"
    fit_width(ws, "landscape")
    ws.print_area = f"A1:O{last}"
    ws.print_title_rows = "3:3"
    protect(ws, formatColumns=False, formatRows=False, objects=True)     # the buttons stay put
    return ws


# The buttons on 3. Lines (each runs a JDELines macro), in row 2 under the
# instructions; Guided setup opens the Guided Setup tab. Each shape: (name,
# macro, text, fill, left, top, width, height in pixels, options).
# Excel draws a column of width w trunc(7w + 0.49) pixels (A:G are 735 wide, I
# starts at 749, L at 1008, M at 1155) and a row of h points h x 4/3 pixels
# (rows 1-3: 72, 96, 56; then 20 each).
LINES_ROW1_PT, LINES_ROW2_PT = 54, 72
C_BTN, C_BTN_GO, C_BTN_OFF = "2E75B6", "2E7D32", "7F7F7F"
_BTN_Y, _BTN_H = 112, 48
LINES_BUTTONS = [
    ("btnSetup", "GoSetup", "Guided setup", C_BTN_GO, 2, _BTN_Y, 116, _BTN_H, {}),
    ("btnPaste", "PasteSchedule", "Paste today's schedule", C_BTN, 125, _BTN_Y, 116, _BTN_H, {}),
    ("btnAdd", "AddMissingLines", "Add missing lines", C_BTN, 248, _BTN_Y, 116, _BTN_H, {}),
    ("btnRunning", "AllRunning", "This shift: all RUNNING", C_BTN, 371, _BTN_Y, 116, _BTN_H, {}),
    ("btnNext", "NextSameAsThis", "Next shift = this shift", C_BTN, 494, _BTN_Y, 116, _BTN_H, {}),
    ("btnClear", "ClearStatuses", "Clear statuses", C_BTN_OFF, 617, _BTN_Y, 116, _BTN_H, {}),
    ("btnNow", "SetNow", "Set time to now", C_BTN, 1012, _BTN_Y, 140, _BTN_H, {}),
    ("btnPrint", "PrintSchedule", "Print 4. Schedule", C_TITLE, 1161, _BTN_Y, 140, _BTN_H, {}),
]

# Guided Setup: five step cards (number, title and what to do, buttons, a
# status that turns green when the step is done), and in step 4 a table of the
# lines on 3. Lines (row t = 3. Lines row 4 + t) with a row of status buttons
# that set the selected cells. Columns (pixels): A 21, B 49, C 112, D 91, E 147,
# F 147, G 280; I holds each step's done flag (hidden).
SETUP_LINES = 20
SETUP_TABLE_ROW = 19        # the table's first row (= 3. Lines row 4)
SETUP_CHOICES = ["RUNNING", "NOT SCHEDULED", "PM / CLEANING", "READY LINE", "PARTIAL SHIFT", "OVERTIME"]
SETUP_WIDTHS = {"A": 3, "B": 7, "C": 16, "D": 13, "E": 21, "F": 21, "G": 40, "H": 3, "I": 6}
SETUP_STEPS = [
    ("Today's schedule", "Copy today's file (its corner triangle above row 1, Ctrl+C), then click Paste."),
    ("Shift and time", "This copy's shift, then the time the schedule is from: Now, or Other time."),
    ("Your lines", "Every line in today's schedule needs a row in your list (3. Lines)."),
    ("Line statuses", "Click line cells below (drag for several), then a status. Double-click a cell: "
                      "RUNNING / NOT SCHEDULED. Crew: on 3. Lines."),
    ("Print", "Check 4. Schedule, print it and post it. Then Ctrl+S."),
]


def build_setup(wb):
    """The Guided Setup tab; returns its buttons (shapes for button_drawing)."""
    ws = wb.create_sheet(S_SETUP)
    ws.sheet_properties.tabColor = C_BTN_GO
    ws.sheet_view.showGridLines = False
    for col, w in SETUP_WIDTHS.items():
        ws.column_dimensions[col].width = w
    ws.column_dimensions["I"].hidden = True
    px_w = {c: int(7 * w + 0.49) for c, w in SETUP_WIDTHS.items()}
    x_of = lambda col: sum(px_w[c] for c in "ABCDEFGHI"[:"ABCDEFGHI".index(col)])
    heights = {}

    def height(r, pt):
        ws.row_dimensions[r].height = pt
        heights[r] = pt
    y_of = lambda r: sum(round(heights.get(k, 15) * 4 / 3) for k in range(1, r))
    height(1, 10)
    ws.merge_cells("B2:F2")
    put(ws, "B2", "Guided Setup", font=font(22, True, C_TITLE), alignment=Alignment(vertical="center"))
    height(2, 36)
    ws.merge_cells("B3:G3")
    put(ws, "B3", "Five steps, top to bottom - each one turns green when it's done. The buttons need macros "
                  "(click Enable Content if Excel asks); without them, use the tabs 1 to 4.",
        font=font(10, italic=True, color="595959"), alignment=Alignment(vertical="center", wrap_text=True))
    height(3, 28)
    height(4, 8)
    shapes = []
    btn = lambda name, macro, text, color, x, y, w, h, **o: shapes.append(
        (name, macro, text, color, x, y, w, h, dict(o)))
    st_ink = {st: (strong, txt) for st, strong, txt, _ in STATUSES}
    lr = lambda c, t: f"{LINES}!${c}${4 + t}"
    flags = []
    r = 5
    tab0 = None
    for k, (title, desc) in enumerate(SETUP_STEPS, start=1):
        height(r, 26)
        height(r + 1, 44 if k == 4 else 34)
        ws.merge_cells(f"B{r}:B{r + 1}")
        put(ws, f"B{r}", k, font=font(18, True, "FFFFFF"), fill=fill(C_TITLE),
            alignment=Alignment(horizontal="center", vertical="center"))
        ws.merge_cells(f"C{r}:D{r}")
        put(ws, f"C{r}", title, font=font(13, True, C_TITLE), alignment=Alignment(vertical="bottom", indent=1))
        ws.merge_cells(f"C{r + 1}:D{r + 1}")
        put(ws, f"C{r + 1}", desc, font=font(9, color="595959"),
            alignment=Alignment(vertical="top", wrap_text=True, indent=1))
        ws.merge_cells(f"G{r}:G{r + 1}")
        flags.append(f"$I${r}")
        for c in "BCDEFG":
            ws[f"{c}{r + 1}"].border = Border(bottom=side("D9D9D9"))
        y0, bh = y_of(r), round((26 + (44 if k == 4 else 34)) * 4 / 3)
        ex, ew = x_of("E") + 6, px_w["E"] + px_w["F"] - 12
        if k == 1:
            btn("suPaste", "PasteSchedule", "Paste today's schedule", C_BTN, ex, y0 + (bh - 36) // 2, ew, 36)
        elif k == 2:
            w3 = (ew - 12) // 3
            for i in range(3):
                btn(f"suShift{i + 1}", f"SetShift{i + 1}", SHIFTS[i], C_BTN, ex + i * (w3 + 6), y0 + 6, w3, 30)
            w2 = (ew - 6) // 2
            btn("suNow", "SetNow", "Set time to now", C_BTN, ex, y0 + 42, w2, 30)
            btn("suOther", "OtherTime", "Other time...", C_BTN_OFF, ex + w2 + 6, y0 + 42, w2, 30)
        elif k == 3:
            btn("suAdd", "AddMissingLines", "Add missing lines", C_BTN, ex, y0 + (bh - 36) // 2, ew, 36)
        elif k == 4:
            w1 = (ew - 12) * 3 // 8
            w3 = ew - 12 - 2 * w1
            y = y0 + (bh - 44) // 2
            btn("suAll", "AllRunning", "This shift: all RUNNING", C_BTN, ex, y, w1, 44, size=900)
            btn("suNext", "NextSameAsThis", "Next shift = this shift", C_BTN, ex + w1 + 6, y, w1, 44, size=900)
            btn("suClear", "ClearStatuses", "Clear", C_BTN_OFF, ex + 2 * w1 + 12, y, w3, 44, size=900)
        elif k == 5:
            btn("suPrint", "PrintSchedule", "Print 4. Schedule", C_TITLE, ex, y0 + (bh - 36) // 2, ew, 36)
        r += 2
        if k == 4:
            # the status buttons, then the table of lines
            height(r, 6)
            r += 1
            height(r, 34)
            ws.merge_cells(f"C{r}:D{r}")
            put(ws, f"C{r}", "Set the selected cells to:", font=font(10, True, C_TITLE),
                alignment=Alignment(vertical="center", indent=1))
            cx, cw = x_of("E"), (px_w["E"] + px_w["F"] + px_w["G"] - 5 * 6) // 6
            for i, st in enumerate(SETUP_CHOICES):
                btn(f"suPick{i + 1}", f"SetupPick{i + 1}", st, st_ink[st][0], cx + i * (cw + 6), y_of(r) + 3, cw, 39,
                    ink=st_ink[st][1], size=900, pad=27432)
            r += 1
            height(r, 22)
            for c, h in zip("CDEFG", ["LINE", "WORK ORDERS TODAY", "THIS SHIFT", "NEXT SHIFT", "NOTE"]):
                put(ws, f"{c}{r}", h, font=font(9, True, "FFFFFF"), fill=fill(C_COLHEAD),
                    alignment=Alignment(horizontal="left" if c in "CG" else "center", vertical="center",
                                        indent=1 if c in "CG" else 0, wrap_text=True))
            r += 1
            tab0 = r
            for t in range(SETUP_LINES):
                rr = r + t
                height(rr, 18)
                nm = f"C{rr}"
                put(ws, nm, f'=TRIM({lr("A", t)}&"")', font=font(10, True), alignment=Alignment(indent=1,
                                                                                                vertical="center"))
                put(ws, f"D{rr}", f'=IF({nm}="","",{lr("F", t)})', font=font(10),
                    alignment=Alignment(horizontal="center", vertical="center"))
                for c, src in (("E", "B"), ("F", "C")):
                    v = status_expr(lr(src, t))
                    put(ws, f"{c}{rr}", f'=IF({nm}="","",IF({v}="","not picked",{v}))', font=font(9, True),
                        alignment=Alignment(horizontal="center", vertical="center"))
                put(ws, f"G{rr}", f'=IF({nm}="","",IF(N(D{rr})=0,"not in today\'s schedule",""))',
                    font=font(9, italic=True, color="7F7F7F"), alignment=Alignment(indent=1, vertical="center"))
                for c in "CDEFG":
                    ws[f"{c}{rr}"].border = Border(bottom=side("EDEDED"))
            last = r + SETUP_LINES - 1
            for st, strong, txt, _ in STATUSES:
                cf(ws, f"E{tab0}:F{last}", f'E{tab0}="{st}"', strong, font(9, True, txt))
            cf(ws, f"E{tab0}:F{last}", f'E{tab0}="not picked"', "F2F2F2", font(9, False, "A6A6A6"))
            cf(ws, f"C{tab0}:D{last}", f'AND($C{tab0}<>"",N($D{tab0})=0)', None, font(10, False, "A6A6A6"))
            r = last + 1
        height(r, 12)
        r += 1
    # each step's status (G) and done flag (I)
    rows = [5]
    for k in range(1, 5):
        rows.append(rows[-1] + 3 + (3 + SETUP_LINES if k == 4 else 0))
    chk = f"{CHECK}!$J$8"
    miss = f'COUNTIF({LINES}!$O$4:$O${3 + LINE_SLOTS},"?*")'
    rng_ = lambda c: f"{LINES}!${c}$4:${c}${3 + LINE_SLOTS}"
    nost = f'COUNTIFS({rng_("F")},">0",{rng_("B")},"")'
    sh_ok = 'TRIM(LINES_SHIFT&"")<>""'
    t_ok = "AND(ISNUMBER(LINES_CHECKED_ON),INT(N(LINES_CHECKED_ON))=TODAY())"
    status = [
        (f"N({chk})=1", f'IF(N({chk})=1,"✓  "&WO_COUNT&" work orders on "&LINE_COUNT&" lines",IF(N(WO_COUNT)=0,'
                        f'"Nothing pasted yet","Check the tab 2. Check Columns - it isn\'t GREEN"))'),
        (f"AND({sh_ok},{t_ok})", f'IF(AND({sh_ok},{t_ok}),"✓  "&LINES_SHIFT&"  ·  as of "&'
                                 f'{clock_text("LINES_CHECKED_ON", "TODAY()", "today ")},IF(NOT({sh_ok}),'
                                 f'"Pick your shift",IF(ISNUMBER(LINES_CHECKED_ON),"The time isn\'t today - '
                                 f'click Set time to now","Set the time")))'),
        (f"AND(N(WO_COUNT)>0,{miss}=0)", f'IF(N(WO_COUNT)=0,"Paste the schedule first",IF({miss}=0,"✓  Every line '
                                         f'of today\'s schedule is in your list",{miss}&" missing: "&{LINES}!$O$4&'
                                         f'IF({miss}>1," and "&({miss}-1)&" more","")))'),
        (f"AND(N(WO_COUNT)>0,{nost}=0)", f'IF(N(WO_COUNT)=0,"Paste the schedule first",IF({nost}=0,"✓  "&COUNTIF('
                                         f'{rng_("B")},"RUNNING")&" running this shift  ·  "&COUNTIF({rng_("C")},'
                                         f'"RUNNING")&" next shift",{nost}&" line(s) with work orders have no '
                                         f'status this shift"))'),
        (f"SUM({','.join(flags[:4])})=4", f'IF(SUM({",".join(flags[:4])})=4,IF({LINES}!$M$1="","✓  Ready to '
                                          f'print","Check 3. Lines: "&{LINES}!$M$1),"Finish the steps in amber '
                                          f'first")'),
    ]
    for (done, text), r in zip(status, rows):
        ws[f"I{r}"] = f"=IF({done},1,0)"
        put(ws, f"G{r}", f"={text}", font=font(10.5, True, "9C5700"), fill=fill("FFF2CC"),
            alignment=Alignment(vertical="center", wrap_text=True, indent=1))
        cf(ws, f"G{r}", f"$I${r}=1", "E2F0D9", font(10.5, True, "2E7D32"))
        cf(ws, f"B{r}", f"$I${r}=1", "2E7D32", font(18, True, "FFFFFF"))
    put(ws, "G2", f'=SUM({",".join(flags[:4])})&" of 4 steps done"&IF(SUM({",".join(flags[:4])})=4,"  ·  ready",'
                  f'"")', font=font(11, True, "7F7F7F"), alignment=Alignment(horizontal="right", vertical="center"))
    cf(ws, "G2", f'SUM({",".join(flags[:4])})=4', None, font(11, True, "2E7D32"))
    fit_width(ws, "landscape")
    protect(ws, objects=True)
    assert tab0 == SETUP_TABLE_ROW, tab0
    return shapes


def button_drawing(ws, shapes):
    """A DrawingML drawing of shapes that run macros (Excel's "Assign Macro"
    on a shape: macro="[0]!Name"), each anchored to the cell it starts in and
    left out of the printout."""
    emu_px = 9525

    def at(x, size):                            # pixels -> (0-based column / row, offset)
        k = 0
        while True:
            w = size(k + 1)
            if x < w:
                return k, x
            x -= w
            k += 1
    col_px = lambda c: int(7 * (ws.column_dimensions[L(c)].width or 8.43) + 0.49)
    row_px = lambda r: round((ws.row_dimensions[r].height or 15) * 4 / 3)
    out = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
           '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" '
           'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">']
    for i, (name, macro, text, color, x, y, w, h, o) in enumerate(shapes, start=2):
        col, xo = at(x, col_px)
        row, yo = at(y, row_px)
        line = o.get("line") or "".join(f"{int(int(color[k:k + 2], 16) * 0.75):02X}" for k in (0, 2, 4))
        paras = "".join(
            f'<a:p><a:pPr algn="{o.get("align", "ctr")}"/><a:r><a:rPr lang="en-US" sz="{o.get("size", 1000)}" '
            f'b="1"><a:solidFill><a:srgbClr val="{o.get("ink", "FFFFFF")}"/></a:solidFill><a:latin '
            f'typeface="{FONT}"/></a:rPr><a:t>{t}</a:t></a:r></a:p>' for t in text.split("\n"))
        out.append(
            f'<xdr:oneCellAnchor><xdr:from><xdr:col>{col}</xdr:col><xdr:colOff>{xo * emu_px}</xdr:colOff>'
            f'<xdr:row>{row}</xdr:row><xdr:rowOff>{yo * emu_px}</xdr:rowOff></xdr:from>'
            f'<xdr:ext cx="{w * emu_px}" cy="{h * emu_px}"/>'
            f'<xdr:sp macro="{"[0]!" + macro if macro else ""}" textlink=""><xdr:nvSpPr><xdr:cNvPr id="{i}" '
            f'name="{name}" descr="{text}"{' hidden="1"' if o.get("hidden") else ""}/><xdr:cNvSpPr/></xdr:nvSpPr>'
            f'<xdr:spPr><a:prstGeom prst="{o.get("geom", "roundRect")}"><a:avLst/></a:prstGeom><a:solidFill>'
            f'<a:srgbClr val="{color}"/></a:solidFill><a:ln w="{o.get("line_w", 9525)}"><a:solidFill>'
            f'<a:srgbClr val="{line}"/></a:solidFill></a:ln></xdr:spPr><xdr:txBody><a:bodyPr vertOverflow="clip" '
            f'horzOverflow="clip" wrap="square" lIns="{o.get("pad", 91440)}" tIns="{o.get("pad", 91440) // 2}" '
            f'rIns="{o.get("pad", 91440)}" bIns="{o.get("pad", 91440) // 2}" '
            f'anchor="{o.get("anchor", "ctr")}"/><a:lstStyle/>{paras}</xdr:txBody></xdr:sp>'
            f'<xdr:clientData fPrintsWithSheet="0"/></xdr:oneCellAnchor>')
    out.append("</xdr:wsDr>")
    return "".join(out)


POS30 = "{" + ",".join(str(i) for i in range(1, 31)) + "}"


def lnum_expr(x):
    """The line number in a line's name: its last run of digits ("VPKL05" -> 5,
    "LINE 12" -> 12, "LINE05" -> 5); "" when it has no digits. Lines are
    matched by this number between the schedule, 3. Lines and 6. Line Rates,
    so "VPKL03" from JDE and "LINE 3" typed on 3. Lines are the same line."""
    t = f'TRIM({x}&"")'
    last = f"LOOKUP(2,1/ISNUMBER(-MID({t},{POS30},1)),{POS30})"
    start = f"IFERROR(LOOKUP(2,1/(({POS30}<{last})*ISERROR(-MID({t},{POS30},1))),{POS30}),0)"
    return f'IFERROR(VALUE(MID({t},{start}+1,{last}-{start})),"")'


SETTINGS_ROWS = [
    # (name, label, value, number format, note)
    ("head", "Shift clock - for the estimated times"),
    ("SET_START", "1st shift starts at", 7.25 / 24, "h:mm AM/PM",
     "2nd shift starts 8 hours later and 3rd shift 16 hours later (7:15 AM, 3:15 PM, 11:15 PM)."),
    ("SET_BREAK1", "Break - hour of the shift", 2, "0", "1 = the first hour of the shift. 0 = no break."),
    ("SET_BREAK2", "Second break - hour of the shift", 6, "0", "0 = no second break."),
    ("SET_LUNCH", "Lunch - hour of the shift", 4, "0", "0 = no lunch."),
    ("SET_FBREAK", "Bottles in a break hour", 6 / 7, "0%",
     "Of a full hour. From the Line Lead MDI Router: the Break (15 min) rate is 86% of the full-hour rate."),
    ("SET_FLUNCH", "Bottles in a lunch hour", 4 / 7, "0%", "Of a full hour. The router's Lunch (30 min) rate is 57%."),
    ("gap",),
    ("head", "Estimated times"),
    ("SET_EFF", "Line efficiency", 1, "0%",
     "Lower it (for example 85%) if lines usually run slower than the router rate. 100% = the router rate."),
    ("SET_CO_S1", "Changeover minutes: Minor - S1", 15, "0", "Same setup, different item."),
    ("SET_CO_CNT", "Changeover minutes: Minor - count change", 15, "0", "Same bottle and bulk, different count."),
    ("SET_CO_S3", "Changeover minutes: MAJOR - S3", 40, "0", "Different bulk item."),
    ("SET_CO_S4", "Changeover minutes: MAJOR - S4", 45, "0", "Different bottle size."),
    ("gap",),
    ("head", "Washroom prep list (7. Washroom)"),
    ("SET_CREMER", "Cremer lines", "1, 5, 9, 10, 12", "@", "Line numbers, with commas."),
    ("SET_MERRILL", "Merrill filler lines", "3, 7, 8, 11", "@", "Line numbers, with commas."),
] + [(f"SET_OILY{i}", "Oily (softgel) word", w, "@",
      "A work order whose ITEM DESCRIPTION has one of these words (whole words, any case) is oily; the "
      "others are powdery (tablets)." if i == 1 else "")
     for i, w in enumerate(OILY_WORDS, start=1)]


def build_settings(wb):
    ws = wb.create_sheet(S_SET)
    ws.sheet_properties.tabColor = "7F7F7F"
    ws.sheet_view.showGridLines = False
    for col, w in {"A": 2, "B": 40, "C": 14, "D": 90}.items():
        ws.column_dimensions[col].width = w
    put(ws, "B1", "5. Settings", font=font(18, True))
    put(ws, "B2", "Set once by the supervisor. Only the yellow cells can be changed. The estimated times on "
                  "4. Schedule use these and the bottles per hour on 6. Line Rates.",
        font=font(10, italic=True, color="595959"))
    names = {}
    r = 4
    for row in SETTINGS_ROWS:
        if row[0] == "gap":
            r += 1
            continue
        if row[0] == "head":
            ws.merge_cells(f"B{r}:D{r}")
            put(ws, f"B{r}", row[1], font=font(12, True, "FFFFFF"), fill=fill(C_TITLE),
                alignment=Alignment(vertical="center", indent=1))
            ws.row_dimensions[r].height = 20
            r += 1
            continue
        name, label, value, fmt, note = row
        put(ws, f"B{r}", label, font=font(11, True), border=THIN_GRAY)
        put(ws, f"C{r}", value, number_format=fmt, fill=INPUT_FILL, border=THIN_BLACK, protection=UNLOCKED,
            font=font(11, True), alignment=Alignment(horizontal="center"))
        put(ws, f"D{r}", note, font=font(10, color="404040"), border=THIN_GRAY)
        names[name] = f"{SETTINGS}!$C${r}"
        r += 1
    # the oily words as one range
    names["SET_OILY"] = names["SET_OILY1"].split(":")[0] + ":" + names[f"SET_OILY{len(OILY_WORDS)}"].split("!")[1]
    r += 1
    put(ws, f"B{r}", "Breaks and lunch apply only to the lines marked Yes in the Breaks & lunch column of 3. Lines "
                     "(lines 1, 3, 5 and 7 have them; lines 8 to 12 run through).", font=font(10, italic=True,
                                                                                             color="595959"))
    fit_width(ws, "landscape")
    protect(ws, formatColumns=False)
    return names


def build_rates(wb):
    import csv
    ws = wb.create_sheet(S_RATES)
    ws.sheet_properties.tabColor = "7F7F7F"
    ws.sheet_view.showGridLines = False
    for col, w in {"A": 10, "B": 12, "C": 52, "D": 18, "E": 12, "F": 14}.items():
        ws.column_dimensions[col].width = w
    put(ws, "A1", "6. Line Rates - bottles per hour by line and item", font=font(16, True))
    put(ws, "A2", "From the Line Lead MDI Router (Power BI): the Router BPH of each line and item, or the JDE "
                  "router rate where there is no Router BPH. To update it, paste a new list over A5:E (Paste "
                  "Values). The line is matched by its number, so LINE05, VPKL05 and LINE 5 are the same line (in column A "
                  "the number must end the line name).",
        font=font(10, italic=True, color="595959"))
    for i, h in enumerate(["LINE", "ITEM", "DESCRIPTION", "BOTTLES PER HOUR", "SOURCE"]):
        put(ws, f"{L(1 + i)}4", h, font=font(10, True, "FFFFFF"), fill=fill(C_COLHEAD), border=THIN_BLACK)
    with open(RATES_CSV, newline="") as fh:
        rates = list(csv.DictReader(fh))
    if len(rates) > RATE_ROWS:
        raise SystemExit(f"{len(rates)} rates don't fit in {RATE_ROWS} rows")
    for i, rt in enumerate(rates):
        r = 5 + i
        ws.cell(r, 1, rt["LINE"])
        ws.cell(r, 2, rt["ITEM"])
        ws.cell(r, 3, rt["DESCRIPTION"])
        ws.cell(r, 4, float(rt["BOTTLES PER HOUR"])).number_format = "#,##0"
        ws.cell(r, 5, rt["SOURCE"])
    # hidden lookup key: line number | ITEM
    put(ws, "F4", "KEY", font=font(9, True))
    for r in range(5, 5 + RATE_ROWS):
        t = f'TRIM(A{r}&"")'
        num = f'IFERROR(--MID({t},MIN(FIND({{0,1,2,3,4,5,6,7,8,9}},{t}&"0123456789")),9),"")'
        ws[f"F{r}"] = f'=IF(OR({t}="",TRIM(B{r}&"")=""),"",{num}&"|"&UPPER(TRIM(B{r}&"")))'
    ws.column_dimensions["F"].hidden = True
    ws.freeze_panes = "A5"
    fit_width(ws, "portrait")
    ws.print_title_rows = "4:4"
    return ws


PROD_COLS = [("ITEM", 12), ("DESCRIPTION", 38), ("BULK (from the work orders)", 44), ("ROUTER FORM", 26),
             ("SUGGESTED", 11), ("OILY OR POWDERY", 14), ("INTERNATIONAL OR DOMESTIC", 16), ("WORK ORDERS", 10),
             ("LAST WORK ORDER", 13)]


def build_products(wb):
    """8. Products: the items of the work orders (from the Line Lead MDI
    Router's work order table), for the supervisor to tick Oily or Powdery
    (7. Washroom uses the tick; an item without one goes by the oily words on
    5. Settings). SUGGESTED is the router's dosage form (SoftGel) or SG / LSG
    / S/G in the item's or its bulk's description - a hint only. International
    or Domestic is filled in from the router (tProduct's market, International
    when any line has it so) and can be changed: an International work order
    shows INTL by its changeover type and "Prepare For INTERNATIONAL WO" in its
    changeover notes (an item without one: INTL or INTERNATIONAL in its
    description)."""
    import csv
    ws = wb.create_sheet(S_PROD)
    ws.sheet_properties.tabColor = "7F7F7F"
    ws.sheet_view.showGridLines = False
    for i, (_, w) in enumerate(PROD_COLS, start=1):
        ws.column_dimensions[L(i)].width = w
    put(ws, "A1", "8. Products - oily or powdery (for 7. Washroom), international or domestic", font=font(16, True))
    for i, (h, _) in enumerate(PROD_COLS, start=1):
        put(ws, f"{L(i)}4", h, font=font(10, True, "FFFFFF"), fill=fill(C_COLHEAD), border=THIN_BLACK,
            alignment=Alignment(wrap_text=True, vertical="center", horizontal="center"))
    ws.row_dimensions[4].height = 30
    with open(PRODUCTS_CSV, newline="") as fh:
        prods = list(csv.DictReader(fh))
    if len(prods) > PROD_ROWS:
        raise SystemExit(f"{len(prods)} products don't fit in {PROD_ROWS} rows")
    last = 4 + PROD_ROWS
    for i in range(PROD_ROWS):
        r = 5 + i
        pr = prods[i] if i < len(prods) else None
        vals = ([pr["ITEM"], pr["DESCRIPTION"], pr["BULK"], pr["ROUTER FORM"], pr["SUGGESTED"], None,
                 pr["MARKET"] or None, int(pr["WORK ORDERS"]), pr["LAST WORK ORDER"]] if pr else [None] * 9)
        for j, v in enumerate(vals, start=1):
            c = ws.cell(r, j, v)
            c.font = font(10, j in (1, 6, 7))
            c.border = THIN_GRAY
            c.alignment = Alignment(horizontal="center" if j >= 5 else "left", vertical="center",
                                    shrink_to_fit=j in (2, 3, 4))
            if j in (6, 7):
                c.fill = INPUT_FILL
        ws[f"J{r}"] = f'=IF(TRIM(A{r}&"")="","",UPPER(TRIM(A{r}&"")))'
    put(ws, "J4", "KEY", font=font(9, True))
    ws.column_dimensions["J"].hidden = True
    dv = DataValidation(type="list", formula1='"Oily,Powdery"', allow_blank=True, showErrorMessage=True,
                        errorTitle="Oily or Powdery", error="Pick Oily or Powdery (or leave it empty).")
    ws.add_data_validation(dv)
    dv.add(f"F5:F{last}")
    dv = DataValidation(type="list", formula1='"International,Domestic"', allow_blank=True, showErrorMessage=True,
                        errorTitle="International or Domestic",
                        error="Pick International or Domestic (or leave it empty).")
    ws.add_data_validation(dv)
    dv.add(f"G5:G{last}")
    cf(ws, f"G5:G{last}", '$G5="International"', C_INTL, font(10, True, "1F3864"))
    for col in ("E", "F"):
        cf(ws, f"{col}5:{col}{last}", f'${col}5="Oily"', C_OIL if col == "F" else None, font(10, True, "7F6000"))
        cf(ws, f"{col}5:{col}{last}", f'${col}5="Powdery"', "EDEDED" if col == "F" else None, font(10, True, "595959"))
    ws.auto_filter.ref = f"A4:I{4 + len(prods)}"
    ws.freeze_panes = "A5"
    fit_width(ws, "landscape")
    ws.print_title_rows = "4:4"
    return ws


WASH_COLS = [("#", 4), ("TIME", 14), ("LINE", 9), ("FILLER", 9), ("CHANGEOVER", 13), ("MIN", 7),
             ("OFF THE LINE - PARTS TO WASH", 38), ("TYPE", 9), ("ALLERGEN", 10), ("NEXT ON THE LINE", 38),
             ("TYPE", 9), ("DONE", 7)]


def build_wash(wb):
    """7. Washroom: the washroom attendants' prep list - every changeover
    expected from Schedule as of to the end of this copy's shift, first to
    last: when, the line and its filler (Cremer / Merrill), the changeover,
    what comes off the line (its parts to wash: oily softgel or powdery
    tablet) and what goes on."""
    ws = wb.create_sheet(S_WASH)
    ws.sheet_properties.tabColor = "0070C0"
    ws.sheet_view.showGridLines = False
    last = 4 + WASH_ROWS
    for i, (_, w) in enumerate(WASH_COLS, start=1):
        ws.column_dimensions[L(i)].width = w
    lc = L(len(WASH_COLS))
    wm, rk = f"Calc!{wr('wm')}", f"Calc!{wr('wrk')}"
    at = lambda col, k: f"INDEX(Calc!{wr(col)},{k})"
    asof = SC["asof"]
    # title, subtitle, totals
    ws.merge_cells(f"A1:{lc}1")
    put(ws, "A1", f'="WASHROOM PREP LIST"&IF({SC["shift"]}="",""," · "&UPPER({SC["shift"]}))',
        font=font(TITLE_PT - 2, True, "FFFFFF"), fill=fill(C_TITLE),
        alignment=Alignment(horizontal="left", vertical="center", indent=1))
    ws.row_dimensions[1].height = 30
    ws.merge_cells(f"A2:{lc}2")
    put(ws, "A2", (f'="Changeovers expected from "&{clock_text(asof, asof, "today ")}&" to "'
                   f'&{clock_text(SC["sh_end"], asof, "today ")}&" (the end of the shift), first to last (Schedule as of on '
                   f'3. Lines; the times from 4. Schedule)"'),
        font=font(10, True, C_TITLE, italic=True), fill=fill(C_SUBTITLE),
        alignment=Alignment(horizontal="left", vertical="center", indent=1, shrink_to_fit=True))
    ws.row_dimensions[2].height = 16
    rng_ = lambda col: f"${col}$5:${col}${last}"
    ws.merge_cells(f"A3:{lc}3")
    put(ws, "A3", (f'=COUNT({wm})&" changeovers  |  Oily parts: "&COUNTIF({rng_("H")},"Oily")&"  ·  Powdery parts: "'
                   f'&COUNTIF({rng_("H")},"Powdery")&"  |  Allergen: "&COUNTIF({rng_("I")},"?*")&"  |  Cremer: "'
                   f'&COUNTIF({rng_("D")},"Cremer")&"  ·  Merrill: "&COUNTIF({rng_("D")},"Merrill")&IF(COUNT({wm})>{WASH_ROWS},"  |  only the first {WASH_ROWS} '
                   f'are listed","")'),
        font=font(10, True, "262626"), alignment=Alignment(horizontal="left", vertical="center", indent=1))
    ws.row_dimensions[3].height = 18
    for i, (h, _) in enumerate(WASH_COLS, start=1):
        put(ws, f"{L(i)}4", h, font=font(HEADER_PT, True, "FFFFFF"), fill=fill(C_COLHEAD),
            border=Border(left=side("FFFFFF"), right=side("FFFFFF")),
            alignment=Alignment(wrap_text=True, vertical="center", horizontal="center"))
    ws.row_dimensions[4].height = 26
    put(ws, "M4", "K", font=font(8, True))
    put(ws, "N4", "K BEFORE", font=font(8, True))
    ws.column_dimensions["M"].hidden = ws.column_dimensions["N"].hidden = True
    filler = lambda ln, lst: f'ISNUMBER(SEARCH(","&{ln}&",",","&SUBSTITUTE({lst}&""," ","")&","))'
    center = {"#", "FILLER", "TYPE", "MIN", "ALLERGEN", "DONE"}
    grid = side("D9D9D9")
    for n in range(1, WASH_ROWS + 1):
        r = 4 + n
        k, kp = f"$M{r}", f"$N{r}"
        ws[f"M{r}"] = f"=IFERROR(MATCH({n},{rk},0),0)"
        ws[f"N{r}"] = f"=IF({k}=0,0,{at('kprev', k)})"
        t = f"({at('wm', k)}/1440)"
        al = f'TRIM({at("allergen", kp)}&"")'               # the allergen of what comes off
        ln = at("lnum", k)
        f = {
            "A": f"={n}",
            "B": f"={clock_text(t, asof, 'Today ')}",
            "C": f"={at('dname', k)}",
            "D": f'=IF({ln}="","",IF({filler(ln, "SET_CREMER")},"Cremer",IF({filler(ln, "SET_MERRILL")},"Merrill","")))',
            "E": f"={at('prog', k)}",
            "F": f'=IF({at("comin", k)}="","",{at("comin", k)}&" min")',
            "G": f'={at("item", kp)}&"   "&{at("desc", kp)}',
            "H": f'=IF({at("oily", kp)}=1,"Oily","Powdery")',
            "I": f'=IF(OR({al}="",UPPER({al})="N"),"",{al})',
            "J": f'={at("item", k)}&"   "&{at("desc", k)}',
            "K": f'=IF({at("oily", k)}=1,"Oily","Powdery")',
            "L": '="\u2610"',                     # a box to tick with a pen on the walk
        }
        for i, (h, _) in enumerate(WASH_COLS, start=1):
            col = L(i)
            body = f[col][1:]
            c = ws.cell(r, i, f'=IF({k}=0,"",{body})')
            c.font = font(15, False, "404040") if h == "DONE" else font(BODY_PT + 1, col in "ACEF")
            c.alignment = Alignment(horizontal="center" if h in center else "left", vertical="center",
                                    shrink_to_fit=True)
            c.border = Border(bottom=grid)
        ws.row_dimensions[r].height = 19
    # looks: oily / powdery, the changeover in its color, the filler
    cf(ws, f"I5:I{last}", '$I5<>""', C_ALLERGEN, font(BODY_PT, True, "843C0C"))
    for col in ("H", "K"):
        cf(ws, f"{col}5:{col}{last}", f'${col}5="Oily"', C_OIL, font(BODY_PT, True, "7F6000"))
        cf(ws, f"{col}5:{col}{last}", f'${col}5="Powdery"', "EDEDED", font(BODY_PT, True, "595959"))
    for _, lab, color in CO_LABELS:
        cf(ws, f"E5:E{last}", f'$E5="{lab}"', None, font(BODY_PT, lab.startswith("MAJOR"), color))
    cf(ws, f"D5:D{last}", '$D5="Cremer"', None, font(BODY_PT, True, "1F6F8B"))
    cf(ws, f"D5:D{last}", '$D5="Merrill"', None, font(BODY_PT, True, "7B3F00"))
    ws.freeze_panes = "A5"
    ws.page_setup.orientation = "landscape"
    ws.page_setup.paperSize = ws.PAPERSIZE_LETTER
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
    ws.page_margins.left = ws.page_margins.right = 0.4
    ws.page_margins.top = 0.4
    ws.page_margins.bottom = 0.5
    ws.print_options.horizontalCentered = True
    ws.oddFooter.center.text = "Page &P of &N"
    ws.oddFooter.center.size = 8
    ws.oddFooter.left.text = "&F"
    ws.oddFooter.left.size = 8
    ws.print_title_rows = "1:4"
    ws.defined_names["Print_Area"] = DefinedName(
        "Print_Area", attr_text=f"{WASH}!$A$1:INDEX({WASH}!${lc}$1:${lc}${last},MAX(5,4+MIN(COUNT({wm}),{WASH_ROWS})))")
    protect(ws, formatColumns=False)
    return ws


# 4. Schedule's hidden helper columns (S onwards): (column, title, Calc output
# key or None). Each work order (report slot) has three rows: its row and its
# two notes rows under it. The codes in AE:AU pick each cell's look - one
# conditional format rule per code, so exactly one rule is true for any cell.
SCHED_HELPERS = [("S", "KIND", "kind"), ("T", "HL", "hl"), ("U", "NOT SCHED", "ns"), ("V", "STATUS #", "stidx"),
                 ("W", "FIRST", "first"), ("X", "LAST", "last"), ("Y", "COUNT CHG", "cchg"), ("Z", "FIRST WO", "fw"),
                 ("AA", "CHANGEOVER", "code"), ("AB", "NEXT #", "nidx"), ("AC", "STATUS", "o_status"),
                 ("AD", "RUNS", "sched"), ("AE", "EDGE", None), ("AF", "LINE LOOK", None), ("AG", "DATA LOOK", None),
                 ("AH", "CT LOOK", None), ("AI", "PROGRESS LOOK", None), ("AJ", "EE LOOK", None),
                 ("AK", "EST LOOK", None), ("AL", "NEXT LOOK", None), ("AM", "CAP CHG", "capx"),
                 ("AN", "CAP LOOK", None), ("AO", "BORDER", None), ("AP", "NEXT BORDER", None),
                 ("AQ", "LINE ROLE", "role"), ("AR", "BELOW BOX", None), ("AS", "TYPED", None),
                 ("AT", "NOTES LOOK", None), ("AU", "HIDE", None),
                 ("AW", "HL #", None)]
NOTES_HELPERS = ("V", "W", "X", "AQ")          # also read on a notes row (status, first, last, role)
TYPED_COL = "AS"
NOTES_COL = "C"            # a notes row's text: one cell merged from SQ to EST. TIME
NOTE_ARROW = "↳"           # in the WO column of a notes row with text: from the WO down to its note
HIDE_COL = "AU"            # 1 on a notes row the macro hides
C_FRAME, C_INNER, C_NO_STATUS, C_CAP_CHANGED = "1F3864", "D9D9D9", "F2F2F2", "C55A11"
LEGEND_HL = [("Allergen", "F4B183"), ("Oil", "FFD966"), ("Dumping", "9DC3E6")]


def look_codes(r, cr):
    """The look codes of 4. Schedule row r, a work order's row (its slot is
    Calc row cr). Edge: 1 the box's only row, 2 its first, 3 its last, 4
    between. The box ends on the last work order's row when its notes rows
    are empty (the changeover notes row is then the gap to the next line),
    else under them (drawn by the blank slot's row that follows)."""
    end = f'AND($X{r}=1,$C{r + 1}="",$C{r + 2}="")'
    edge = f'IF($S{r}="row",IF($W{r}=1,IF({end},1,2),IF({end},3,4)),0)'
    data = f'IF($U{r}=1,5,IF($T{r}="allergen",2,IF($T{r}="oil",3,IF($T{r}="bulk",4,1))))'
    prog = (f'IF($U{r}=1,8,IF($Z{r}=1,IF($M{r}="Not Started Yet",2,1),IF($AA{r}="S1",3,'
            f'IF($AA{r}="S1 Count Change",4,IF($AA{r}="S3",5,IF($AA{r}="S4",6,7))))))')
    return {
        "AE": f"={edge}",
        # LINE: role (1 name, 2 status tag, 3 the rest, 4 a line with one work
        # order) x100 + status x10 + edge
        "AF": f"=IF($AE{r}=0,0,$AQ{r}*100+$V{r}*10+$AE{r})",
        "AG": f"=IF($AE{r}=0,0,{data}*10+$AE{r})",
        "AH": f'=IF($AE{r}=0,0,IF(AND($U{r}=0,$Y{r}=1),INT($AG{r}/10)+10,INT($AG{r}/10))*10+$AE{r})',
        # PROGRESS, EE, EST. TIME: their look x10 + the row highlight (AW: 0
        # none, 1 allergen, 2 oil, 3 dumping), x10 + edge
        "AW": f'=IF(OR($S{r}<>"row",$U{r}=1),0,IF($T{r}="allergen",1,IF($T{r}="oil",2,IF($T{r}="bulk",3,0))))',
        "AI": f"=IF($AE{r}=0,0,({prog}*10+$AW{r})*10+$AE{r})",
        "AJ": f'=IF($AE{r}=0,0,(IF($U{r}=1,5,1)*10+$AW{r})*10+$AE{r})',
        "AK": (f'=IF($AE{r}=0,0,(IF($U{r}=1,5,IF(OR($P{r}="no rate",$P{r}="no qty",$P{r}="—"),3,'
               f'IF($Z{r}=1,1,2)))*10+$AW{r})*10+$AE{r})'),
        "AL": f'=IF($AE{r}=0,0,IF(OR($AQ{r}=2,$AQ{r}=4),IF($AB{r}>0,$AB{r},7),8)*10+$AE{r})',
        "AN": f'=IF($AE{r}=0,0,IF(AND($U{r}=0,$AM{r}=1),INT($AG{r}/10)+10,INT($AG{r}/10))*10+$AE{r})',
        # the box border takes the line's status color: + status x1000 on its
        # first and last rows, and always in NEXT SHIFT (its right side is the
        # box's)
        "AO": f"=IF(AND($AE{r}>=1,$AE{r}<=3),$V{r}*1000,0)",
        "AP": f"=IF($AE{r}>0,$V{r}*1000,0)",
        # the row under a box draws the box's bottom across the merged notes
        # row (status + 1)
        "AR": f'=IF(AND($S{r - 1}="notes",N($X{r - 1})=1,OR($C{r - 1}<>"",$C{r - 2}<>"")),$V{r - 1}+1,0)',
        # cells that differ from Calc (typed on - Calc tamper)
        "AS": (f'=SUMPRODUCT(--($A{r}:${L(len(SCHED_COLS))}{r}&""<>'
               f'Calc!${O["o_line"]}${cr}:${O["o_next"]}${cr}&""))'),
    }


def notes_codes(r, cr, remarks):
    """The look codes of 4. Schedule row r, a work order's changeover notes
    row or (remarks) its remarks row: inside the box (edge 4; the box's bottom
    is drawn by the row under it), or outside it (0) when the line's last work
    order has no notes - its changeover notes row is then the gap to the next
    line."""
    co, rm = (f"$C{r - 1}", f"$C{r}") if remarks else (f"$C{r}", f"$C{r + 1}")
    key = "o_rem" if remarks else "o_cnote"
    # the macro hides it when empty (the gap stays), and a blank slot's
    hide = (f'IF(OR(AND($S{r}="notes",$C{r}=""),$S{r - 2}="spacer"),1,0)' if remarks else
            f'IF(OR(AND($S{r}="notes",$C{r}="",NOT(AND(N($X{r})=1,{rm}=""))),$S{r - 1}="spacer"),1,0)')
    return {
        "AE": f'=IF($S{r}="notes",IF(AND(N($X{r})=1,{co}="",{rm}=""),0,4),0)',
        "AF": f"=IF($AE{r}=0,0,IF($AQ{r}=4,4,3)*100+$V{r}*10+$AE{r})",
        "AL": f"=IF($AE{r}=0,0,90+$AE{r})",
        "AP": f"=IF($AE{r}>0,$V{r}*1000,0)",
        "AS": f'=IF($C{r}&""<>Calc!${O[key]}${cr}&"",1,0)',
        "AT": f'=IF(AND($S{r}="notes",$C{r}<>""),1,0)',
        "AU": "=" + hide,
    }


def rich(parts, size=BODY_PT):
    """A legend cell: [(text, color, bold)] runs."""
    from openpyxl.cell.rich_text import CellRichText, TextBlock
    from openpyxl.cell.text import InlineFont
    return CellRichText(*[TextBlock(InlineFont(rFont=FONT, sz=size, b=b, color="FF" + col), t) for t, col, b in parts])


def build_schedule(wb):
    ws = wb.create_sheet(S_SCHED)
    ws.sheet_properties.tabColor = C_TITLE
    ws.sheet_view.showGridLines = False
    ncol = len(SCHED_COLS)                        # 17 -> A:Q
    last_row = SCHED_LAST                         # 2104
    for i, (h, _) in enumerate(SCHED_COLS, start=1):
        ws.column_dimensions[L(i)].width = SCHED_WIDTHS[h]
    ws.column_dimensions["R"].width = 2
    split = "J"                                   # rows 1-3: A:I on the left, J:Q on the right
    lc = L(ncol)
    navy, title_white = fill(C_TITLE), "FFFFFF"
    # row 1: title band - the title and this copy's shift | the status legend
    ws.merge_cells("A1:I1")
    put(ws, "A1", f'="JDE PACKAGING SCHEDULE"&IF({SC["shift"]}="",""," · "&UPPER({SC["shift"]}))',
        font=font(TITLE_PT - 2, True, title_white), fill=navy,
        alignment=Alignment(horizontal="left", vertical="center", indent=1, shrink_to_fit=True))
    ws.merge_cells(f"{split}1:{lc}1")
    parts = [("BORDER  ", "FFD966", True)]
    for st, strong, _, _ in STATUSES:
        parts += [("■ ", strong if st != "PM / CLEANING" else "5B9BD5", False),
                  (st.capitalize().replace("Pm / cleaning", "PM / Cleaning") + "   ", title_white, False)]
    put(ws, f"{split}1", rich(parts), fill=navy, font=font(BODY_PT, False, title_white),
        alignment=Alignment(horizontal="right", vertical="center", indent=1, shrink_to_fit=True))
    ws.row_dimensions[1].height = 30
    # row 2: which copy this is (shift, date, as of) | changeover legend
    light = fill(C_SUBTITLE)
    ws.merge_cells("A2:I2")
    put(ws, "A2", f"={SC['subtitle']}", font=font(10, True, C_TITLE, italic=True), fill=light,
        alignment=Alignment(horizontal="left", vertical="center", indent=1, shrink_to_fit=True))
    ws.merge_cells(f"{split}2:{lc}2")
    parts = [("CHANGEOVER  ", C_TITLE, True)]
    for _, lab, col in CO_LABELS:
        parts += [("● ", col, False), (lab.replace(" · ", " ") + "   ", col, lab.startswith("MAJOR"))]
    parts += [("CAP", C_CAP_CHANGED, True), (" = new cap   ", "262626", False), ("INTL", C_TITLE, True),
              (" = international ", "262626", False)]
    put(ws, f"{split}2", rich(parts), fill=light, font=font(BODY_PT),
        alignment=Alignment(horizontal="right", vertical="center", indent=1, shrink_to_fit=True))
    ws.row_dimensions[2].height = 16
    # row 3: today in one line (or the warnings) | row highlight legend
    ws.merge_cells("A3:M3")
    put(ws, "A3", f'=IF({SC["warn_line"]}<>"","⚠ "&{SC["warn_line"]},{SC["summary"]})',
        font=font(9.5, True, "262626"), alignment=Alignment(horizontal="left", vertical="center", indent=1,
                                                            shrink_to_fit=True))
    cf(ws, "A3", 'LEFT($A$3,1)="⚠"', "FFC7CE", font(9.5, True, "9C0006"))
    ws.merge_cells(f"N3:{lc}3")
    parts = [("HIGHLIGHT ", C_TITLE, True)]
    for i, (lab, col) in enumerate(LEGEND_HL):
        parts += [(" ■ ", col, False), (lab + ("" if i == len(LEGEND_HL) - 1 else " "), "262626", False)]
    put(ws, "N3", rich(parts), font=font(BODY_PT),
        alignment=Alignment(horizontal="right", vertical="center", indent=1, shrink_to_fit=True))
    ws.row_dimensions[3].height = 16
    # row 4: column titles (NEXT SHIFT names the shift)
    for i, (h, key) in enumerate(SCHED_COLS, start=1):
        v = h if key != "o_next" else f'=IF({SC["nshift"]}="","NEXT SHIFT","NEXT: "&UPPER({SC["nshift"]}))'
        put(ws, f"{L(i)}4", v, font=font(HEADER_PT, True, "FFFFFF"), fill=fill(C_COLHEAD),
            border=Border(left=side("FFFFFF"), right=side("FFFFFF"), bottom=side(C_FRAME)),
            alignment=Alignment(wrap_text=True, vertical="center", horizontal="center"))
    ws.row_dimensions[4].height = 26
    for col, h, _ in SCHED_HELPERS:
        put(ws, f"{col}4", h, font=font(8, True))
        ws.column_dimensions[col].hidden = True
    align = {"o_line": "center", "o_seq": "center", "o_count": "center", "o_bottle": "center", "o_cap": "center",
             "o_allergen": "center", "o_desiccant": "center", "o_qty": "right", "o_left": "right",
             "o_crew": "center", "o_est": "right", "o_next": "center"}
    for p in range(1, OUT_ROWS + 1):
        # report slot p (Calc row cr): the work order's row, then its notes rows
        r, cr = SCHED_ROW0 + SLOT_ROWS * (p - 1), 4 + p
        # One line per row, so rows never depend on Excel re-fitting their
        # height after a paste: long values shrink to fit their cell.
        ws.row_dimensions[r].height = ROW_HEIGHT
        for i, (_, key) in enumerate(SCHED_COLS, start=1):
            c = ws.cell(r, i, f"=Calc!${O[key]}${cr}")
            c.alignment = Alignment(horizontal=align.get(key, "left"), vertical="center",
                                    shrink_to_fit=key in SHRINK_COLS)
            c.font = font(LINE_PT, True) if key == "o_line" else font(BODY_PT)
            if key == "o_qty":
                c.number_format = "#,##0"
        for col, _, key in SCHED_HELPERS:
            if key:
                ws[f"{col}{r}"] = f"=Calc!${O[key]}${cr}"
        for col, f in look_codes(r, cr).items():
            ws[f"{col}{r}"] = f
        # the changeover notes row and the remarks row under it: one cell each,
        # merged from SQ to EST. TIME, small italics
        for n, key in ((r + 1, "o_cnote"), (r + 2, "o_rem")):
            ws.row_dimensions[n].height = STRIP_HEIGHT
            ws.merge_cells(f"{NOTES_COL}{n}:{L(ncol - 1)}{n}")
            c = ws.cell(n, 3, f"=Calc!${O[key]}${cr}")
            c.font = font(STRIP_PT, color=C_NOTE_TEXT, italic=True)
            c.alignment = Alignment(horizontal="left", vertical="center", shrink_to_fit=True)
            # under the WO, an arrow down and right to the note
            a = ws.cell(n, 2, f'=IF($AT{n}=1,"{NOTE_ARROW}","")')
            a.font = font(7.5, False, C_NOTE_TEXT)
            a.alignment = Alignment(horizontal="center", vertical="center")
            ws[f"S{n}"] = f'=IF(Calc!${O["kind"]}${cr}="row","notes","")'
            for col, _, k_ in SCHED_HELPERS:
                if col in NOTES_HELPERS:
                    ws[f"{col}{n}"] = f"=Calc!${O[k_]}${cr}"
            for col, f in notes_codes(n, cr, key == "o_rem").items():
                ws[f"{col}{n}"] = f
    add_conditional_formats(ws, last_row)
    ws.freeze_panes = f"A{SCHED_ROW0}"
    # page setup
    ws.page_setup.orientation = "landscape"
    ws.page_setup.paperSize = ws.PAPERSIZE_LETTER
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
    ws.page_margins.left = ws.page_margins.right = 0.4
    ws.page_margins.top = 0.4
    ws.page_margins.bottom = 0.5
    ws.page_margins.header = 0.2
    ws.page_margins.footer = 0.25
    ws.print_options.horizontalCentered = True
    ws.oddFooter.center.text = "Page &P of &N"
    ws.oddFooter.center.size = 8
    ws.oddFooter.left.text = "&F"          # the file name - it says which shift's copy this is
    ws.oddFooter.left.size = 8
    ws.print_title_rows = f"1:{SCHED_ROW0 - 1}"
    # Print area stops at the last used row (Calc print_last).
    ws.defined_names["Print_Area"] = DefinedName(
        "Print_Area", attr_text=f"{SCHED}!$A$1:INDEX({SCHED}!${lc}$1:${lc}${last_row},{SC['print_last']})")
    # Columns can be hidden or widened; rows can't be hidden (formatRows on):
    # the report is by position, so a hidden row would hide another work order
    # on a later day.
    protect(ws, formatColumns=False, formatRows=True)
    return ws


def add_conditional_formats(ws, last_row):
    """Each range's rules test one look code (helper columns AE:AT), so
    exactly one rule is true for any cell and the result doesn't depend on how
    a spreadsheet program merges several true rules. Each line is a box with a
    border in its status color (the printout's border legend; navy when it has
    none), a LINE tab (name, then the status tag on the line's color) and a
    gap before the next line. The merged notes rows get no borders: the row
    under the box draws its bottom."""
    r0 = SCHED_ROW0
    inner = side(C_INNER)
    rng = lambda *cols: " ".join(f"{a}{r0}:{b}{last_row}" for a, b in cols)
    st_colors = [(0, C_NO_STATUS, "262626", C_NO_STATUS)] + [
        (i, strong, txt, tint) for i, (_, strong, txt, tint) in enumerate(STATUSES, start=1)]
    frame_of = {st: side(C_FRAME if st == 0 else strong) for st, strong, _, _ in st_colors}

    def rules(where, code, v, fill_color, font_, last=False):
        """The rules of look v on a work order's row in range where (code
        column code): one per edge (1 the box's only row, 2 its first, 3 its
        last, 4 between; the box's top and bottom in the status color, a light
        line above the others) and, on the box's edges, per status. last =
        NEXT SHIFT, whose right side is the box's on every row."""
        off = "AP" if last else "AO"
        for e in (1, 2, 3, 4):
            for st in (range(7) if (e <= 3 or last) else (0,)):
                fr = frame_of[st]
                b = Border(left=inner, right=fr if last else inner, top=fr if e in (1, 2) else inner,
                           bottom=fr if e in (1, 3) else None)
                cf(ws, where, f"${code}{r0}+${off}{r0}={st * 1000 + v * 10 + e}", fill_color, font_, b)

    grey = font(BODY_PT, False, C_NOT_SCHED_TEXT)
    # LINE: the line's tab on its light tint: the name in bold navy and right
    # under it the status tag, in bold in the status's ink (a line with one work order: its name in that ink); the box's
    # left side in the status color. (Role 3 / 4 at edge 3 or 4 is a work
    # order's row or a notes row - they look alike.)
    ink = {0: C_TITLE, **{i: STATUS_INK[n] for i, (n, _, _, _) in enumerate(STATUSES, start=1)}}
    for role, edges in ((1, (2, 4)), (2, (3, 4)), (3, (2, 3, 4)), (4, (1, 2, 4))):
        for st, strong, txt, tint in st_colors:
            fr = frame_of[st]
            for e in edges:
                b = Border(left=fr, right=inner, top=fr if e in (1, 2) else None, bottom=fr if e in (1, 3) else None)
                if role in (2, 4):
                    fc, fo = tint, font(LINE_PT, True, ink[st])
                else:
                    fc, fo = tint, font(LINE_PT, True, "1F3864" if role == 1 else "7F7F7F")
                cf(ws, rng(("A", "A")), f"$AF{r0}={role * 100 + st * 10 + e}", fc, fo, b)
    # data columns B:E, G:H, J:L: row highlight (allergen > oil > dumping),
    # grey for a line that isn't scheduled
    hl_fill = {1: None, 2: C_ALLERGEN, 3: C_OIL, 4: C_BULK, 5: None}
    row_hl = [None, C_ALLERGEN, C_OIL, C_BULK]          # AW: the row highlight in PROGRESS to EST. TIME
    data = rng(("B", "E"), ("G", "H"), ("J", "L"))
    for v in range(1, 6):
        rules(data, "AG", v, hl_fill[v], grey if v == 5 else None)
    # CT and CAP: as the data columns, in bold red on a count change (CT) and
    # bold orange on a cap change (CAP)
    for col, code, color in (("F", "AH", C_COUNT_CHANGED), ("I", "AN", C_CAP_CHANGED)):
        for v in list(range(1, 6)) + list(range(11, 15)):
            rules(rng((col, col)), code, v, hl_fill[v % 10 if v > 10 else v],
                  font(BODY_PT, True, color) if v > 10 else grey if v == 5 else None)
    # PROGRESS / CHANGEOVER and LEFT / C.O.: the green progress bar on the
    # running work order, the changeover type in its color on the next ones
    prog_fonts = {1: font(BODY_PT, True, "2E7D32"), 2: font(BODY_PT, False, "7F7F7F", italic=True),
                  7: font(BODY_PT, False, "A6A6A6"), 8: grey}
    for i, (_, _, col) in enumerate(CO_LABELS, start=3):
        prog_fonts[i] = font(BODY_PT, i >= 5, col)
    for v, fo in prog_fonts.items():
        for h, hf in enumerate(row_hl):
            rules(rng(("M", "N")), "AI", v * 10 + h, hf, fo)
    # EE
    for v, fo in ((1, None), (5, grey)):
        for h, hf in enumerate(row_hl):
            rules(rng(("O", "O")), "AJ", v * 10 + h, hf, fo)
    # EST. TIME: the running work order's time in bold navy
    est_fonts = {1: font(BODY_PT, True, C_TITLE), 2: font(BODY_PT, False, "262626"),
                 3: font(BODY_PT, False, "7F7F7F", italic=True), 5: grey}
    for v, fo in est_fonts.items():
        for h, hf in enumerate(row_hl):
            rules(rng(("P", "P")), "AK", v * 10 + h, hf, fo)
    # NEXT SHIFT: a chip in the next shift's status color on the row of the
    # line's status tag (looks 1-6, 7 = none), plain on the other work order
    # rows (8) and the notes rows (9)
    q = rng(("Q", "Q"))
    # (the chip: the next status's tint and bold ink; no lines across the
    # column but the box's own top and bottom)
    chips = [(v, STATUS_INK[n], tint) for v, (n, _, _, tint) in enumerate(STATUSES, start=1)]
    for v, txt, tint in chips + [(7, None, None), (8, None, None)]:
        for e in (1, 2, 3, 4):
            for st in range(7):
                fr = frame_of[st]
                b = Border(left=inner, right=fr, top=fr if e in (1, 2) else None, bottom=fr if e in (1, 3) else None)
                cf(ws, q, f"$AL{r0}+$AP{r0}={st * 1000 + v * 10 + e}", tint, font(BODY_PT, True, txt) if txt else None, b)
    for st in range(7):
        cf(ws, q, f"$AL{r0}+$AP{r0}={st * 1000 + 94}", None, None, Border(left=inner, right=frame_of[st]))
    # notes rows with something to say: cream, small italics (the size is the
    # cell's own)
    cf(ws, rng((NOTES_COL, L(len(SCHED_COLS) - 1))), f"$AT{r0}=1", C_NOTE_FILL, font(STRIP_PT, False, C_NOTE_TEXT, True))
    # the box's bottom: the top of the row under it, in the status color
    for st in range(7):
        cf(ws, rng(("A", L(len(SCHED_COLS)))), f"$AR{r0}={st + 1}", None, None, Border(top=frame_of[st]))


# ----------------------------------------------------------------------------
# The macros: JDENotes hides the empty notes rows (ThisWorkbook's events run
# it by itself); JDELines is the buttons on 3. Lines. The workbook works the
# same without them.

VBA_MODULE = """Option Explicit
' Hides the notes rows of 4. Schedule that have nothing to say (its hidden
' column {hide} says which), so the work orders sit right under each other.
' It runs by itself: when the file opens, when 4. Schedule recalculates or is
' opened, and before printing (see ThisWorkbook). Before saving it shows them
' again (Clean) and hides them after, so the saved file looks right without
' macros too (Excel on the web, or Enable Content not clicked: everything
' still works, those thin rows just stay).
Private lastPattern As String

Public Sub FitNotes(Optional ByVal always As Boolean = False)
    Dim ws As Worksheet, v As Variant, i As Long, pattern As String, addr As String
    Dim events As Boolean, screen As Boolean, wasSaved As Boolean
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets("{sched}")
    If ws Is Nothing Then Exit Sub
    v = ws.Range("{hide}{first}:{hide}{last}").Value
    If Err.Number <> 0 Then Exit Sub
    For i = 1 To UBound(v, 1)
        If IsError(v(i, 1)) Then
            pattern = pattern & "0"
        ElseIf v(i, 1) = 1 Then
            pattern = pattern & "1"
        Else
            pattern = pattern & "0"
        End If
    Next i
    If pattern = lastPattern And Not always Then Exit Sub
    wasSaved = ThisWorkbook.Saved
    events = Application.EnableEvents
    screen = Application.ScreenUpdating
    Application.EnableEvents = False
    Application.ScreenUpdating = False
    ws.Unprotect
    ws.Rows("{first}:{last}").Hidden = False
    For i = 1 To Len(pattern)
        If Mid$(pattern, i, 1) = "1" Then
            If Len(addr) > 200 Then
                ws.Range(addr).EntireRow.Hidden = True
                addr = ""
            End If
            If Len(addr) > 0 Then addr = addr & ","
            addr = addr & "A" & (i + {first} - 1)
        End If
    Next i
    If Len(addr) > 0 Then ws.Range(addr).EntireRow.Hidden = True
    ws.Protect DrawingObjects:=False, Contents:=True, Scenarios:=False, AllowFormattingColumns:=True
    lastPattern = pattern
    ThisWorkbook.Saved = wasSaved
    Application.ScreenUpdating = screen
    Application.EnableEvents = events
End Sub

' the file is saved with every row showing (see ThisWorkbook)
Public Sub Clean()
    Dim ws As Worksheet, events As Boolean
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets("{sched}")
    If ws Is Nothing Then Exit Sub
    events = Application.EnableEvents
    Application.EnableEvents = False
    ws.Unprotect
    ws.Rows("{first}:{last}").Hidden = False
    ws.Protect DrawingObjects:=False, Contents:=True, Scenarios:=False, AllowFormattingColumns:=True
    lastPattern = ""
    Application.EnableEvents = events
End Sub
"""

VBA_THISWORKBOOK = """Option Explicit
' 4. Schedule's empty notes rows are hidden by JDENotes.FitNotes. The file is
' saved with them showing, so it looks right without macros too.

Private Sub Workbook_Open()
    JDENotes.FitNotes True
End Sub

Private Sub Workbook_SheetActivate(ByVal Sh As Object)
    If Sh.Name = "{sched}" Then JDENotes.FitNotes
End Sub

Private Sub Workbook_SheetCalculate(ByVal Sh As Object)
    If Sh.Name = "{sched}" Then JDENotes.FitNotes
End Sub

Private Sub Workbook_BeforePrint(Cancel As Boolean)
    JDENotes.FitNotes
End Sub

Private Sub Workbook_BeforeSave(ByVal SaveAsUI As Boolean, Cancel As Boolean)
    JDENotes.Clean
End Sub

Private Sub Workbook_AfterSave(ByVal Success As Boolean)
    JDENotes.FitNotes True
    ThisWorkbook.Saved = True
End Sub

' 3. Lines: double-click a status to switch it (see JDELines.DoubleClick)
Private Sub Workbook_SheetBeforeDoubleClick(ByVal Sh As Object, ByVal Target As Range, Cancel As Boolean)
    If Sh.Name = "{lines}" Then JDELines.DoubleClick Target, Cancel
    If Sh.Name = "{setup}" Then JDELines.SetupDoubleClick Target, Cancel
End Sub
"""


VBA_LINES = """Option Explicit
' The buttons on the Guided Setup tab and on 3. Lines, and double-clicking
' there (see ThisWorkbook): each does one step. All of it can be done by hand
' too. Ctrl+Z can't undo a macro, so the buttons that would
' overwrite something ask first.
Public TestMode As Boolean      ' tests: no dialogs, the answers come from TestAnswers
Public TestAnswers As String    ' "6|7|3|~" - MsgBox codes or InputBox texts (~ = the default)

Private Const FIRST_ROW As Long = 4
Private Const LAST_ROW As Long = {lines_last}
Private Const TITLE As String = "JDE Production Schedule"
Private savedCalc As Long
Private savedEvents As Boolean

Private Function LinesWs() As Worksheet
    Set LinesWs = ThisWorkbook.Worksheets("{lines}")
End Function

' ---- dialogs (skipped in TestMode) ----

Private Function NextAnswer(ByVal deflt As String) As String
    Dim p As Long
    If Len(TestAnswers) = 0 Then
        NextAnswer = deflt
        Exit Function
    End If
    p = InStr(TestAnswers, "|")
    If p = 0 Then
        NextAnswer = TestAnswers
        TestAnswers = ""
    Else
        NextAnswer = Left$(TestAnswers, p - 1)
        TestAnswers = Mid$(TestAnswers, p + 1)
    End If
End Function

Private Function Ask(ByVal prompt As String, ByVal buttons As Long) As Long
    If TestMode Then
        Ask = CLng(Val(NextAnswer("2")))
    Else
        Ask = MsgBox(prompt, buttons, TITLE)
    End If
End Function

Private Function AskText(ByVal prompt As String, ByVal deflt As String) As String
    Dim a As String
    If TestMode Then
        a = NextAnswer("")
        If a = "~" Then a = deflt
        AskText = a
    Else
        AskText = InputBox(prompt, TITLE, deflt)
    End If
End Function

Private Sub Tell(ByVal msg As String)
    If Not TestMode Then MsgBox msg, vbInformation, TITLE
End Sub

' ---- while a button works: no recalculation after every cell, no events ----

Private Sub BeginWork()
    On Error Resume Next
    savedEvents = Application.EnableEvents
    savedCalc = Application.Calculation
    Application.EnableEvents = False
    Application.Calculation = -4135             ' manual
End Sub

Private Sub EndWork()
    On Error Resume Next
    Application.Calculation = savedCalc
    Application.Calculate
    Application.EnableEvents = savedEvents
    Application.ScreenUpdating = True
    JDENotes.FitNotes
End Sub

' ---- the left table ----

Private Function LineName(ByVal r As Long) As String
    LineName = Trim$(LinesWs.Cells(r, 1).Value & "")
End Function

Private Function WorkOrders(ByVal r As Long) As Long
    Dim v As Variant
    v = LinesWs.Cells(r, 6).Value
    If IsError(v) Then Exit Function
    WorkOrders = CLng(Val(v & ""))
End Function

Private Function CellText(ByVal r As Long, ByVal c As Long) As String
    CellText = UCase$(Trim$(LinesWs.Cells(r, c).Value & ""))
End Function

' the lines of today's schedule that aren't in the left table go in its empty rows
Private Function AddMissing() As Long
    Dim ws As Worksheet, v As Variant, i As Long, r As Long, nm As String
    Set ws = LinesWs
    v = ws.Range("O" & FIRST_ROW & ":O" & LAST_ROW).Value
    r = FIRST_ROW
    For i = 1 To UBound(v, 1)
        nm = ""
        If Not IsError(v(i, 1)) Then nm = Trim$(v(i, 1) & "")
        If nm <> "" Then
            Do While r <= LAST_ROW
                If LineName(r) = "" And CellText(r, 2) = "" And CellText(r, 3) = "" And CellText(r, 5) = "" Then Exit Do
                r = r + 1
            Loop
            If r > LAST_ROW Then Exit For
            ws.Cells(r, 1).Value = ListName(nm)
            AddMissing = AddMissing + 1
            r = r + 1
        End If
    Next i
End Function

' a line's name for the list, like the others there: VPKL09 -> LINE 9 (lines
' match by their number); a name without a number as it is
Private Function ListName(ByVal nm As String) As String
    Dim i As Long, j As Long
    j = Len(nm)
    Do While j > 0
        If IsDigit(Mid$(nm, j, 1)) Then Exit Do
        j = j - 1
    Loop
    If j = 0 Then
        ListName = nm
        Exit Function
    End If
    i = j
    Do While i > 1
        If Not IsDigit(Mid$(nm, i - 1, 1)) Then Exit Do
        i = i - 1
    Loop
    ListName = "LINE " & CLng(Val(Mid$(nm, i, j - i + 1)))
End Function

Private Function IsDigit(ByVal c As String) As Boolean
    IsDigit = (c >= "0" And c <= "9" And Len(c) = 1)
End Function

Private Function ShiftAt(ByVal t As Date) As String
    Dim st As Double, h As Double
    st = 7.25 / 24
    On Error Resume Next
    st = CDbl(ThisWorkbook.Names("SET_START").RefersToRange.Value)
    On Error GoTo 0
    h = ((CDbl(t) - Int(CDbl(t))) - (st - Int(st))) * 24
    If h < 0 Then h = h + 24
    If h >= 24 Then h = 0
    ShiftAt = Choose(Int(h / 8) + 1, "1st Shift", "2nd Shift", "3rd Shift")
End Function

Private Function NowToMinute() As Date
    Dim t As Date
    t = Now
    NowToMinute = DateSerial(Year(t), Month(t), Day(t)) + TimeSerial(Hour(t), Minute(t), 0)
End Function

Private Function CheckOk() As Boolean
    On Error Resume Next
    CheckOk = (Val(ThisWorkbook.Worksheets("{check}").Range("J8").Value & "") = 1)
End Function

Private Function CheckText() As String
    On Error Resume Next
    CheckText = ThisWorkbook.Worksheets("{check}").Range("B8").Value & ""
End Function

' 1. Paste Schedule := what was copied, as values (like Paste Values); the
' rows and columns past it are cleared. False when nothing was copied.
Private Function PasteNow() As Boolean
    Dim ws As Worksheet, back As Worksheet, rg As Range, r2 As Long, c2 As Long
    Set back = ActiveSheet
    Set ws = ThisWorkbook.Worksheets("{paste}")
    On Error Resume Next
    ws.Activate
    ws.Range("A1").Select
    Err.Clear
    ws.Range("A1").PasteSpecial -4163           ' values
    If Err.Number <> 0 Then
        Err.Clear
        back.Activate
        Exit Function
    End If
    ' (Excel selects what it pasted; LibreOffice only A1 - then nothing is cleared)
    Set rg = Selection
    If rg.Rows.Count > 1 Or rg.Columns.Count > 1 Then
        r2 = rg.Row + rg.Rows.Count - 1
        c2 = rg.Column + rg.Columns.Count - 1
        If r2 < ws.Rows.Count Then ws.Range(ws.Rows(r2 + 1), ws.Rows(ws.Rows.Count)).Clear
        If c2 < ws.Columns.Count Then ws.Range(ws.Columns(c2 + 1), ws.Columns(ws.Columns.Count)).Clear
    End If
    Application.CutCopyMode = False
    ws.Range("A1").Select
    back.Activate
    PasteNow = True
End Function

' ---- the buttons ----

Public Sub PasteSchedule()
    Dim ok As Boolean
    On Error GoTo fail
    BeginWork
    ok = PasteNow()
    EndWork
    If Not ok Then
        Tell "Nothing to paste." & vbLf & vbLf & "First open today's schedule file, click its corner triangle " & _
             "(above row 1) and press Ctrl+C (if it has filter arrows: Data > Clear first). Then come back " & _
             "and click Paste today's schedule."
    ElseIf CheckOk() Then
        Tell "Pasted. 2. Check Columns is GREEN."
    Else
        Tell "Pasted - but 2. Check Columns is not GREEN:" & vbLf & vbLf & CheckText() & vbLf & vbLf & _
             "Open the tab 2. Check Columns to fix it."
    End If
    Exit Sub
fail:
    EndWork
    Tell "Something went wrong: " & Err.Description
End Sub

Public Sub SetNow()
    Dim ws As Worksheet, t As Date
    Set ws = LinesWs
    t = NowToMinute()
    ws.Range("L1").Value = t
    If Trim$(ws.Range("C1").Value & "") = "" Then ws.Range("C1").Value = ShiftAt(t)
End Sub

Public Sub AddMissingLines()
    Dim n As Long
    On Error GoTo fail
    BeginWork
    n = AddMissing()
    EndWork
    If n = 0 Then
        Tell "Every line in today's schedule is already in your list."
    Else
        Tell n & " line(s) added to the left table. Now pick their status."
    End If
    Exit Sub
fail:
    EndWork
    Tell "Something went wrong: " & Err.Description
End Sub

' This shift: RUNNING for each line in today's schedule that has no status
' yet (NOT SCHEDULED for the rest); statuses already picked stay
Public Sub AllRunning()
    Dim ws As Worksheet, r As Long, n As Long
    Set ws = LinesWs
    On Error GoTo fail
    BeginWork
    For r = FIRST_ROW To LAST_ROW
        If LineName(r) <> "" And CellText(r, 2) = "" Then
            If WorkOrders(r) > 0 Then
                ws.Cells(r, 2).Value = "RUNNING"
            Else
                ws.Cells(r, 2).Value = "NOT SCHEDULED"
            End If
            n = n + 1
        End If
    Next r
    EndWork
    If n = 0 Then Tell "Every line already has a status this shift - change the ones you need in the This shift " & _
                       "column (double-click one to switch RUNNING / NOT SCHEDULED), or click Clear statuses first."
    Exit Sub
fail:
    EndWork
    Tell "Something went wrong: " & Err.Description
End Sub

Public Sub NextSameAsThis()
    Dim ws As Worksheet, r As Long, differ As Boolean
    Set ws = LinesWs
    For r = FIRST_ROW To LAST_ROW
        If LineName(r) <> "" And CellText(r, 3) <> "" And CellText(r, 3) <> CellText(r, 2) Then differ = True
    Next r
    If differ Then
        If Ask("Next shift already has statuses that differ from this shift." & vbLf & vbLf & _
               "Replace them with this shift's? (Ctrl+Z can't undo this.)", vbYesNo + vbQuestion) <> vbYes Then Exit Sub
    End If
    On Error GoTo fail
    BeginWork
    For r = FIRST_ROW To LAST_ROW
        If LineName(r) <> "" Then ws.Cells(r, 3).Value = ws.Cells(r, 2).Value
    Next r
    EndWork
    Exit Sub
fail:
    EndWork
    Tell "Something went wrong: " & Err.Description
End Sub

Public Sub ClearStatuses()
    Dim ws As Worksheet
    Set ws = LinesWs
    If Ask("Clear This shift, Next shift and Crew (EE) for every line?" & vbLf & vbLf & _
           "The line names and Breaks & lunch stay. Ctrl+Z can't undo this.", _
           vbYesNo + vbExclamation + vbDefaultButton2) <> vbYes Then Exit Sub
    On Error GoTo fail
    BeginWork
    ws.Range("B" & FIRST_ROW & ":C" & LAST_ROW).ClearContents
    ws.Range("E" & FIRST_ROW & ":E" & LAST_ROW).ClearContents
    EndWork
    Exit Sub
fail:
    EndWork
    Tell "Something went wrong: " & Err.Description
End Sub

Public Sub PrintSchedule()
    Dim ws As Worksheet, msg As String
    On Error Resume Next
    msg = Trim$(LinesWs.Range("M1").Value & "")
    If msg <> "" Then
        If Ask(msg & vbLf & vbLf & "Print anyway?", vbYesNo + vbExclamation + vbDefaultButton2) <> vbYes Then Exit Sub
    End If
    Set ws = ThisWorkbook.Worksheets("{sched}")
    ws.Activate
    JDENotes.FitNotes True
    If TestMode Then Exit Sub
    Err.Clear
    Application.Dialogs(8).Show                 ' the Print dialog
    If Err.Number <> 0 Then
        Err.Clear
        ws.PrintPreview
    End If
End Sub

' ---- the Guided Setup tab ----

Public Sub GoSetup()
    ThisWorkbook.Worksheets("{setup}").Activate
End Sub

Private Sub SetShift(ByVal k As Long)
    LinesWs.Range("C1").Value = Choose(k, "1st Shift", "2nd Shift", "3rd Shift")
End Sub

Public Sub SetShift1()
    SetShift 1
End Sub

Public Sub SetShift2()
    SetShift 2
End Sub

Public Sub SetShift3()
    SetShift 3
End Sub

Public Sub OtherTime()
    Dim s As String, t As Date
    t = NowToMinute()
    s = Trim$(AskText("The date and time the schedule is from (when today's file was taken), like " & _
                      Format(t, "m/d/yyyy h:mm AM/PM") & ":", Format(t, "m/d/yyyy h:mm AM/PM")))
    If s = "" Then Exit Sub
    If Not IsDate(s) Then
        Tell "That isn't a date and time. Type it like " & Format(t, "m/d/yyyy h:mm AM/PM") & "."
        Exit Sub
    End If
    LinesWs.Range("L1").Value = CDate(s)
    If Trim$(LinesWs.Range("C1").Value & "") = "" Then LinesWs.Range("C1").Value = ShiftAt(CDate(s))
End Sub

' the status buttons over the table: set each selected line's This shift (the
' THIS SHIFT column, or the line's name) or Next shift (the NEXT SHIFT column)
Private Sub SetupApply(ByVal st As String)
    Dim ws As Worksheet, rg As Range, c As Range, n As Long, r As Long
    Set ws = ThisWorkbook.Worksheets("{setup}")
    On Error GoTo fail
    If ActiveSheet.Name <> ws.Name Then Exit Sub
    If TypeName(Selection) <> "Range" Then GoTo none
    Set rg = Application.Intersect(Selection, ws.Range("C{t0}:G{t1}"))
    If rg Is Nothing Then GoTo none
    BeginWork
    For Each c In rg.Cells
        r = FIRST_ROW + c.Row - {t0}
        If LineName(r) <> "" Then
            LinesWs.Cells(r, IIf(c.Column = 6, 3, 2)).Value = st
            n = n + 1
        End If
    Next c
    EndWork
    If n > 0 Then Exit Sub
none:
    Tell "First click a line's THIS SHIFT or NEXT SHIFT cell in the table (drag to pick several lines), " & _
         "then click a status."
    Exit Sub
fail:
    EndWork
    Tell "Something went wrong: " & Err.Description
End Sub

Public Sub SetupPick1()
    SetupApply "{c1}"
End Sub

Public Sub SetupPick2()
    SetupApply "{c2}"
End Sub

Public Sub SetupPick3()
    SetupApply "{c3}"
End Sub

Public Sub SetupPick4()
    SetupApply "{c4}"
End Sub

Public Sub SetupPick5()
    SetupApply "{c5}"
End Sub

Public Sub SetupPick6()
    SetupApply "{c6}"
End Sub

' double-click a THIS SHIFT / NEXT SHIFT cell of the table: RUNNING / NOT SCHEDULED
Public Sub SetupDoubleClick(ByVal Target As Range, ByRef Cancel As Boolean)
    Dim r As Long, col As Long
    If Target.Cells.Count <> 1 Then Exit Sub
    If Target.Row < {t0} Or Target.Row > {t1} Then Exit Sub
    If Target.Column <> 5 And Target.Column <> 6 Then Exit Sub
    r = FIRST_ROW + Target.Row - {t0}
    If LineName(r) = "" Then Exit Sub
    col = IIf(Target.Column = 6, 3, 2)
    If UCase$(Trim$(Target.Value & "")) = "RUNNING" Then
        LinesWs.Cells(r, col).Value = "NOT SCHEDULED"
    Else
        LinesWs.Cells(r, col).Value = "RUNNING"
    End If
    Cancel = True
End Sub

' ---- for the tests (LibreOffice runs these; a person never needs them) ----

Public Sub TestSetup(ByVal answers As String)
    TestMode = (answers <> "off")
    TestAnswers = answers
    If answers = "off" Then TestAnswers = ""
End Sub

Public Function TestAnswersLeft() As String
    TestAnswersLeft = TestAnswers
End Function

Public Sub TestSelect(ByVal sheetName As String, ByVal addr As String)
    ThisWorkbook.Worksheets(sheetName).Activate
    ThisWorkbook.Worksheets(sheetName).Range(addr).Select
End Sub

Public Sub TestSetupDoubleClick(ByVal addr As String)
    Dim c As Boolean
    SetupDoubleClick ThisWorkbook.Worksheets("{setup}").Range(addr), c
End Sub

Public Sub TestDoubleClick(ByVal addr As String)
    Dim c As Boolean
    DoubleClick LinesWs.Range(addr), c
End Sub

Public Sub TestCopy(ByVal sheetName As String, ByVal addr As String)
    ThisWorkbook.Worksheets(sheetName).Range(addr).Copy
End Sub

' Double-click on 3. Lines: a status switches RUNNING / NOT SCHEDULED, Breaks &
' lunch Yes / No, and the Schedule as of box takes the time now
Public Sub DoubleClick(ByVal Target As Range, ByRef Cancel As Boolean)
    If Target.Cells.Count <> 1 Then Exit Sub
    If Target.Row = 1 And Target.Column = 12 Then
        SetNow
        Cancel = True
        Exit Sub
    End If
    If Target.Row < FIRST_ROW Or Target.Row > LAST_ROW Then Exit Sub
    If LineName(Target.Row) = "" Then Exit Sub
    Select Case Target.Column
        Case 2, 3
            If CellText(Target.Row, Target.Column) = "RUNNING" Then
                Target.Value = "NOT SCHEDULED"
            Else
                Target.Value = "RUNNING"
            End If
            Cancel = True
        Case 4
            If CellText(Target.Row, 4) = "YES" Then
                Target.Value = "No"
            Else
                Target.Value = "Yes"
            End If
            Cancel = True
    End Select
End Sub
"""


def vba_bin():
    from vba_project import vba_project_bin
    fill_in = lambda t: (t.replace("{hide}", HIDE_COL).replace("{sched}", S_SCHED)
                         .replace("{first}", str(SCHED_ROW0)).replace("{last}", str(SCHED_LAST))
                         .replace("{lines}", S_LINES).replace("{lines_last}", str(3 + LINE_SLOTS))
                         .replace("{check}", S_CHECK).replace("{paste}", S_PASTE).replace("{setup}", S_SETUP)
                         .replace("{t0}", str(SETUP_TABLE_ROW))
                         .replace("{t1}", str(SETUP_TABLE_ROW + SETUP_LINES - 1)))
    for i, st in enumerate(SETUP_CHOICES, start=1):
        _f = fill_in
        fill_in = lambda t, _f=_f, i=i, st=st: _f(t).replace(f"{{c{i}}}", st)
    return vba_project_bin([("ThisWorkbook", "document", fill_in(VBA_THISWORKBOOK)),
                            ("JDENotes", "module", fill_in(VBA_MODULE)),
                            ("JDELines", "module", fill_in(VBA_LINES))])


# ----------------------------------------------------------------------------
# How To Use

HOW_ROWS = [
    ("title", "JDE Production Schedule - How To Use"),
    ("sub", "Load it, Set the Lines, Print it. Follow the steps in order. Do one step at a time."),
    ("gap",),
    ("head", "", "QUICK CARD - A Load, B Set the lines, C Print (this page prints on its own: post it at the computer)"),
    ("qc", "A1", "Open YOUR shift's copy of this file. Yellow bar? Click Enable Editing, then Enable Content."),
    ("qc", "A2", "Today's schedule file: Data > Clear (if it has filter arrows), click its corner triangle, Ctrl+C."),
    ("qc", "A3", "Back in THIS file, tab Guided Setup: do its 5 steps top to bottom - each turns green when done. "
                 "It does A4 to C1 with buttons."),
    ("qc", "A4", "Or by hand: tab 1. Paste Schedule, corner triangle, Home > Clear > Clear All; right-click A1 > "
                 "Paste Options > Values (123)."),
    ("qc", "A5", "Tab 2. Check Columns: the box is GREEN; First / Last work order = first / last row of today's file."),
    ("qc", "B1", "Tab 3. Lines: a line marked NOT IN YOUR LIST? Click Add missing lines."),
    ("qc", "B2", "This shift: pick each line's status (double-click one: RUNNING / NOT SCHEDULED). Next shift: the same."),
    ("qc", "B3", "Crew (EE): type the number of people on each running line."),
    ("qc", "B4", "Click Set time to now (or double-click the yellow box Schedule as of)."),
    ("qc", "B5", "Press Ctrl+S."),
    ("qc", "C1", "Click Print 4. Schedule on 3. Lines (or tab 4. Schedule, Ctrl+P), pick the printer, click Print."),
    ("qc", "C2", "Check: your shift and today's date at the top, each line's status, no red line under the title."),
    ("qc", "C3", "Post it."),
    ("qc", "C4", "Press Ctrl+S."),
    ("pagebreak",),
    ("kv", "For", "Anyone printing the Production Schedule (1st, 2nd or 3rd shift). About 5 minutes."),
    ("kv", "This file", "Replaces the Production Schedule tab of the JDE Sched web app and the JDE Packaging Schedule "
                        "printout, in one. It works in Excel 2010 and newer, Excel for Mac and Excel on the web / "
                        "Teams. Its macros hide the empty notes rows on 4. Schedule and run the buttons on Guided "
                        "Setup and 3. Lines - "
                        "click Enable Content when Excel asks. Without them (Excel on the web, or macros off) "
                        "everything still works by hand: the buttons do nothing and those thin rows just stay."),
    ("kv", "Mac", "The keys below are for Windows. On a Mac use Cmd instead of Ctrl (Cmd+C, Cmd+V, Cmd+Z, Cmd+Y, "
                  "Cmd+S, Cmd+P, Cmd+H). Today's date is Control+; and the time Cmd+; on a Mac."),
    ("gap",),
    ("head", "", "You will do 3 jobs, in this order"),
    ("kv", "A", "Load the schedule - paste today's Excel file into the tab 1. Paste Schedule."),
    ("kv", "B", "Set the lines - on the tab 3. Lines pick each line's status for this shift and the next, the crew, "
                "and the time the schedule is from."),
    ("kv", "C", "Print it - print the tab 4. Schedule and post it."),
    ("gap",),
    ("head", "", "What you need"),
    ("text", "", "- YOUR SHIFT'S COPY of this file (golden rule 1), opened in Excel. If a yellow bar says PROTECTED "
                 "VIEW, click Enable Editing first (otherwise the sheets stay empty); if one says SECURITY WARNING "
                 "Macros have been disabled, click Enable Content."),
    ("text", "", "- Today's Excel schedule file (it ends in .xlsx, .xlsm or .xls). It is usually in the Downloads folder."),
    ("text", "", "- A printer."),
    ("gap",),
    ("head", "", "First time only (supervisor) - skip this if your shift's file already exists"),
    ("step", "1", "Put this file in your shared folder (Teams or network drive) and rename it "
                  "JDE Schedule - MASTER - do not edit.xlsm. It is the clean spare."),
    ("step", "2", "Open it and click File > Save As (on the web: File > Save a Copy). Name the copy for a shift, "
                  "for example JDE Schedule - 1st Shift.xlsm (keep the type Excel Macro-Enabled Workbook). Do "
                  "this 3 times: 1st, 2nd and 3rd Shift."),
    ("step", "3", "In each shift's copy, on the tab 3. Lines: pick the shift in the yellow box This copy is for (top "
                  "left). Lines 1, 3, 4, 5, 7 and 8 to 12 are already listed - add or remove lines in column A, and "
                  "check Breaks & lunch: Yes for a line that stops for breaks and lunch (lines 1, 3, 5 and 7), No for "
                  "a line that runs through them (lines 8 to 12)."),
    ("step", "4", "Check the tab 5. Settings (when the 1st shift starts, the break and lunch hours, the changeover "
                  "minutes) and the tab 6. Line Rates (bottles per hour of each line and item - a hidden tab: "
                  "see Tips, Hidden tabs). Press Ctrl+S."),
    ("gap",),
    ("head", "", "3 golden rules"),
    ("kv", "1", "ONE FILE PER SHIFT. Every day open YOUR shift's file - never the MASTER. Your lines, statuses and "
                "column fixes are saved in it. Press Ctrl+S at the end of Part B and Part C."),
    ("kv", "2", "Check the tab 2. Check Columns after every paste. The box at the top must be GREEN, and the First "
                "and Last work order shown there must be the first and last rows of today's file."),
    ("kv", "3", "NEVER TYPE ON 4. Schedule - it fills itself in. To change, add or remove a work order, edit the "
                "tab 1. Paste Schedule. Never click Review > Unprotect Sheet."),
    ("tip", "TIP", "Made a mistake? Press Ctrl+Z (Undo) right away. Ctrl+Y puts it back (Redo). These are Excel's "
                   "own Undo and Redo."),
    ("gap",),
    ("part", "A", "Load the schedule from Excel - do this at the start of the shift, or when a new schedule comes out."),
    ("step", "1", "Check the file name at the top of the Excel window. It must say YOUR shift (for example JDE "
                  "Schedule - 2nd Shift). If it is wrong, close it and open your shift's file."),
    ("see", "", "You should see: your shift in the file name. It also prints at the bottom left of the schedule."),
    ("step", "2a", "In THIS file, click the tab 1. Paste Schedule."),
    ("step", "2b", "Click the small triangle in its top-left corner (left of column A, above row 1). It selects the "
                   "whole sheet - Ctrl+A only selects part of it."),
    ("step", "2c", "Click Home > Clear (the eraser) > Clear All. No Clear All? Press Delete. Clear it - do not delete "
                   "rows or columns."),
    ("see", "", "You should see: an empty sheet. (Old rows left on it would mix into today's printout.)"),
    ("step", "3a", "Open today's schedule file. If a yellow bar says PROTECTED VIEW, click Enable Editing."),
    ("step", "3b", "If it has more than one sheet, click the one with the LINE and WO column titles."),
    ("step", "3c", "If its title row has filter arrows, click Data > Clear (a copy leaves out hidden rows)."),
    ("step", "3d", "Click its corner triangle to select the whole sheet (not Ctrl+A), then press Ctrl+C. Copy - never "
                   "Cut (Ctrl+X)."),
    ("see", "", "You should see: a moving dotted line around the sheet."),
    ("step", "4a", "Go back to THIS file (click it on the taskbar, or View > Switch Windows). On 1. Paste Schedule "
                   "click cell A1."),
    ("step", "4b", "Right-click A1 and, under Paste Options, click Values (the clipboard with 123). On a Mac: Edit > "
                   "Paste Special > Values. Excel on the web (no Values button): press Ctrl+V."),
    ("see", "", "You should see: today's schedule, starting at cell A1."),
    ("careful", "CAREFUL", "Paste is greyed out, or nothing is pasted? The copy was cancelled. Go back to today's "
                           "file, press Ctrl+C again and come straight back to paste."),
    ("careful", "", "Excel says the copy area and the paste area are not the same size? You clicked a cell other "
                    "than A1 - click A1 and paste again."),
    ("step", "5", "Click the tab 2. Check Columns."),
    ("see", "", "You should see: a green box that says Found ... work orders on ... lines. First work order and Last "
                "work order must be the first and last rows of today's file - if the last one is not, yesterday's "
                "rows are still there: do Part A again from step 2a."),
    ("careful", "CAREFUL", "Red box that says Can't tell which column is the Line (or WO #)?"),
    ("careful", "", "1. At the bottom of 2. Check Columns, look at the list Your file's columns. Its Example column "
                    "shows what is in each column."),
    ("careful", "", "2. Find the column with the line names (like VPKL01) - or the work order numbers."),
    ("careful", "", "3. Click the yellow Override box of Line (or WO #), click its arrow and pick that column's "
                    "title. The box turns green. (Why titles: see Tips, Override.)"),
    ("step", "6", "Wrong row taken as the column titles? Type the right row number in Header row override (the "
                  "yellow box E5). Leave it empty to let the file find the titles (it looks at the first 40 rows)."),
    ("step", "7", "Something in the wrong column? In that field's yellow Override box pick the right column's title, "
                  "or - to leave the field out. A red Note next to an Override means today's file may not need it: "
                  "read it, and clear the Override if the Note is right."),
    ("step", "8", "Click the tab 4. Schedule. Pick 2 or 3 work order numbers and make sure they match today's file."),
    ("see", "", "You should see: each line as a box of its work orders, in Seq order, with a blank row between lines."),
    ("gap",),
    ("part", "B", "Set the lines - each line's status this shift and next shift, the crew, and the time the "
                  "schedule is from."),
    ("kv", "The buttons", "The tab Guided Setup (after How To Use) does Parts A to C in five steps, each with "
                          "its buttons and a status that turns green when it's done. Step 4: click line cells in "
                          "its table (drag for several), then a status button; double-click a cell to switch "
                          "RUNNING / NOT SCHEDULED. Type the crew on 3. Lines. The same buttons are on 3. Lines "
                          "(its green Guided setup opens the tab): Paste today's schedule, Add missing lines, This "
                          "shift: all RUNNING (each line in today's schedule that has no status yet), Next shift = "
                          "this shift, Clear statuses (this shift, next shift and crew - for a new day), Set time to "
                          "now, Print 4. Schedule. Double-click a status to switch RUNNING / NOT SCHEDULED, a "
                          "Breaks & lunch to switch Yes / No, the yellow time box for now. Ctrl+Z can't undo a "
                          "button: the ones that would overwrite something ask first."),
    ("step", "1", "Click the tab 3. Lines. The left table (yellow cells) is your list of production lines - you "
                  "type there. The right table lists the lines in today's schedule and fills itself in; its first "
                  "column, Its row on the left, says which row of the left table belongs to that line. A line is "
                  "found by its number: VPKL05 in the file is LINE 5 in the list."),
    ("step", "2a", "A line marked NOT IN YOUR LIST (in red) can't get a status yet: click Add missing lines, or "
                   "type its name in an empty row of the left table. (The names are also listed under Lines to "
                   "add, on the far right.)"),
    ("careful", "CAREFUL", "Copying names from Lines to add? Paste them with right-click > Paste Options > Values "
                           "(123) - NOT Ctrl+V. Ctrl+V pastes formulas and Excel warns about a circular reference: "
                           "press Ctrl+Z and paste as Values, or type the names."),
    ("step", "2b", "To take a line off your list, clear its whole row (Line, This shift, Next shift, Crew)."),
    ("step", "3", "This shift: click the cell of each line in today's schedule, click the small arrow and pick its "
                  "status (or double-click it: RUNNING / NOT SCHEDULED). RUNNING, PARTIAL SHIFT and OVERTIME lines get estimated times; READY LINE (set up, ready "
                  "to run), PM / CLEANING and NOT SCHEDULED lines don't. Empty = the Line Status column of your file "
                  "(Ready, PM, OT), else NOT SCHEDULED: a line only runs when you pick RUNNING (or type Yes). "
                  "NONE = no status, even if your file has one."),
    ("step", "4", "Next shift: the same, for the next shift. It prints at the right edge of 4. Schedule. Empty = "
                  "NOT SCHEDULED; NONE = no status."),
    ("step", "5", "Crew (EE): type the number of people on each line (it prints in the EE column). Leave it empty if "
                  "you don't use it."),
    ("step", "6", "Click Set time to now (or double-click the yellow box Schedule as of, top right; without "
                  "macros: click it, press Ctrl+; for today's date, a space, Ctrl+Shift+; for the time, Enter). "
                  "Better still, type the time today's file was taken "
                  "(for example 10/29/2026 5:15 AM): the % Complete is from then, and the estimated times count "
                  "from it. A date without a time counts from the time it is now."),
    ("see", "", "You should see: today's date and time in the yellow box, and no red CHECK message next to it."),
    ("step", "7", "Click the tab 4. Schedule and check it. Then press Ctrl+S to save."),
    ("see", "", "You should see: each line's name in the middle of the LINE column with its status right under it "
                "in the status's color, the estimated times of the running lines, and the next shift's status at "
                "the right, on the same row as this shift's."),
    ("tip", "TIP", "Statuses and crews stay in this file from day to day. Until today's date is in Schedule as of, "
                   "3. Lines and the top of 4. Schedule show a red CHECK message - it prints too - so yesterday's "
                   "statuses never go out by mistake."),
    ("gap",),
    ("part", "C", "Print the schedule - make sure Parts A and B are done first."),
    ("step", "1", "Click the tab 4. Schedule. Press Ctrl+P (or File > Print)."),
    ("step", "2", "Pick your printer and click Print. The layout is already set: Landscape, Letter, all columns on "
                  "one page wide, the title and column titles on every page, page numbers at the bottom."),
    ("step", "3", "Check the printout and post it: your shift and today's date at the top, your shift's file name "
                  "bottom left, every line with its status, and no red line under the title."),
    ("step", "4", "Press Ctrl+S to save before you close the file."),
    ("gap",),
    ("head", "", "Reading 4. Schedule"),
    ("kv", "Top", "The title and the shift (This copy is for, on 3. Lines); which schedule it is and the time it is "
                  "from (Schedule as of); one line with the lines by status, how many minor (S1, count) and major (S3, S4) "
                  "changeovers the running lines have from Schedule as of to the end of the shift, and the next "
                  "changeover. "
                  "A red line in its place means something to check (see Something went wrong). On the right, the "
                  "three legends: BORDER (the line statuses below), CHANGEOVER (the changeover types) and "
                  "HIGHLIGHT (the row colors below)."),
    ("kv", "LINE", "Each line is a box with a border in its status color this shift (the BORDER legend, below): in "
                   "the middle of the box its name, and right under it its status, in the same color. A line with "
                   "one work order shows its status by the color of its name. A line left empty on 3. Lines "
                   "(and with no Line Status in your file) is NOT SCHEDULED; one set to NONE has a navy border."),
] + [("swatch", strong, desc) for (st, strong, _, _), desc in zip(STATUSES, [
    "RUNNING - the line runs this shift. Estimated times.",
    "PARTIAL SHIFT - the line runs part of the shift. Estimated times (as if it ran the whole shift).",
    "OVERTIME - an overtime or trial run (OT, Overtime or Trial in your file). Estimated times.",
    "READY LINE - set up and ready to run (Ready in your file). No estimated times.",
    "PM / CLEANING - down for maintenance or cleaning (PM in your file). No estimated times. Its work orders "
    "print in grey; its name and status stay blue.",
    "NOT SCHEDULED - not running this shift. Its work orders print in grey."])] + [
    ("kv", "PROGRESS / CHANGEOVER", "The first work order of a line (the one running now): a bar of ten "
                                    "segments, one filled for each 10 % done (▰▰▰▱▱▱▱▱▱▱), and the % Complete - or Not Started Yet when % Complete is 0 or "
                                    "blank. The work orders after it: the changeover before each one (see "
                                    "Changeover codes)."),
    ("kv", "LEFT / C.O.", "The first work order: the bottles left (32.9k = 32,900) = WO Qty x (1 - % Complete). The "
                          "next ones: the changeover minutes (set on 5. Settings)."),
    ("kv", "EE (crew)", "The number of people on the line (Crew on 3. Lines)."),
    ("kv", "EST. TIME", "When the work order should be done - the time the line changes over to the next one. It "
                        "counts from Schedule as of: the changeovers, then the bottles at the line's bottles per hour "
                        "(6. Line Rates) x the line efficiency (5. Settings), slower in the break and lunch hours on "
                        "lines with Breaks & lunch = Yes. Only RUNNING, PARTIAL SHIFT and OVERTIME lines get times; "
                        "Today in front of a time on the day of Schedule as of, the date in front of another day's. no rate = the line and item are not on "
                        "6. Line Rates (add them there); no qty = the work order has no WO Qty; a dash = a work "
                        "order above it on the line has no time, so this one can't have one either."),
    ("kv", "NEXT SHIFT", "The line's status next shift (Next shift on 3. Lines), in its color, in the middle of "
                         "the box on the same row as this shift's status."),
    ("kv", "CAP", "Size and type, like the JDE printout: CAP 45MM CRC WHITE shows as 45-CRC. In bold orange: a "
                  "different cap from the work order before it (the web app's Cap Change)."),
    ("kv", "NOTES", "Thin rows under a work order, from SQ to EST. TIME, in small italics on cream, with an "
                    "arrow (↳) under the WO pointing to them. Changeover Notes: what the changeover into the work order changes from the one "
                    "before it - Cap / Count / Bottle Change (Count Change only on an S1 Count Change), Add / Remove / Change Cotton (the COT column of your "
                    "file: Yes for Y / Yes / X, nothing for N or blank), Add / Remove / Change Desiccant, "
                    "Dumping (bulk A662 / A624), and Prepare For INTERNATIONAL WO (an international work order: "
                    "8. Products); only for changeovers that start before the end of the shift (the "
                    "summary's count at the top). Under it, on its own row, Remarks: and its remark. A long row "
                    "gets smaller to fit - the whole remark is on 1. Paste Schedule."),
    ("swatch", C_ALLERGEN, "Allergen (anything but N) - the row, from WO to EST. TIME. Highlights go allergen "
                           "first, then oil, then dumping."),
    ("swatch", C_OIL, "Oily product (the description contains OIL)."),
    ("swatch", C_BULK, "Dumping - the light blue rows: bulk item A662 or A624."),
    ("swatch", C_COUNT_CHANGED, "Red bold CT = the count changed from the work order before it (Minor · Count)."),
    ("gap",),
    ("head", "", "Changeover codes"),
    ("kv", "Minor · S1", "Same bottle, bulk and count - a new item. Green."),
    ("kv", "Minor · Count", "The count differs (S1 Count Change). Amber."),
    ("kv", "MAJOR · S3", "The bulk item differs. Purple."),
    ("kv", "MAJOR · S4", "The bottle size differs. Red."),
    ("kv", "· INTL", "Added to the code (MAJOR · S4 · INTL) when the work order is international: its item is "
                     "International on 8. Products (filled in from the router - change it there), or, for an item "
                     "not on it, INTL or INTERNATIONAL in its description."),
    ("text", "", "Each code is shown on the work order the changeover happens on: compared with the work order "
                 "before it on the same line. A dash when either Bottle Size is missing."),
    ("gap",),
    ("head", "", "Something went wrong?"),
    ("kv", "The box on 2. Check Columns is red", "Read what it says. Line / WO # not found: Part A, the CAREFUL box "
                                                 "after step 5. Empty sheet: Part A, steps 2a to 4b. Capacity "
                                                 "warning: see Limits below."),
    ("kv", "The sheets look empty", "Click Enable Editing on the yellow bar at the top."),
    ("kv", "Thin empty rows under the work orders", "The macro that hides them is off. Click Enable Content on the "
                                                    "yellow bar. A red bar saying Microsoft has blocked macros: close "
                                                    "the file, right-click it > Properties > tick Unblock > OK, and "
                                                    "open it again (or ask IT to make the shared folder a Trusted "
                                                    "Location). The schedule is right either way - only the look "
                                                    "differs."),
    ("kv", "Nothing changes after pasting", "Formulas > Calculation Options > Automatic, or press F9. (Excel takes "
                                            "this setting from the first file you open.)"),
    ("kv", "Paste is greyed out", "The copy was cancelled. Go back to today's file, press Ctrl+C again and paste "
                                  "right away (Part A, step 4b)."),
    ("kv", "Excel says it can't do that to a merged cell", "Old formatting is still on 1. Paste Schedule. Do Part A "
                                                           "again from step 2a (Home > Clear > Clear All), then "
                                                           "paste again."),
    ("kv", "Yesterday's work orders are still there", "1. Paste Schedule was not cleared before pasting. Do Part A "
                                                      "again from step 2a."),
    ("kv", "Red box: a WO is on two rows", "The same WO # is on two rows of 1. Paste Schedule - usually yesterday's "
                                           "rows left under today's. Do Part A again from step 2a. If today's file "
                                           "really lists that work order twice, you can ignore it (the printout "
                                           "says CHECK: WO twice at the top)."),
    ("kv", "Red box: a row looks like column titles", "Yesterday's schedule is probably still on 1. Paste Schedule, "
                                                      "or today's file was pasted lower down than A1. Do Part A "
                                                      "again from step 2a."),
    ("kv", "A work order is missing", "On 1. Paste Schedule its Line must be filled in. Rows below a Line cell "
                                      "that says LEGEND are ignored. Exact duplicate rows are counted once."),
    ("kv", "Something is in the wrong column", "On 2. Check Columns pick the right column's title in that field's "
                                               "Override box (or - to leave it out)."),
    ("kv", "Excel says the cell is on a protected sheet", "Only the yellow cells take typing (on 2. Check Columns, "
                                                          "3. Lines and 5. Settings), plus all of 1. Paste Schedule "
                                                          "and 6. Line Rates. 4. Schedule fills itself in - to "
                                                          "change it, edit 1. Paste Schedule. Never click Review > "
                                                          "Unprotect Sheet."),
    ("kv", "Excel warns about a circular reference", "Names were pasted on 3. Lines with Ctrl+V. Press Ctrl+Z, then "
                                                     "paste them with Paste Options > Values (123), or type them."),
    ("kv", "Report typed on", "Something was typed over 4. Schedule, so it no longer fills itself in. Press Ctrl+Z "
                              "right away. If that does not fix it: close the file and click Don't Save, then open "
                              "it again. If it was already saved: File > Info > Version History (Teams / OneDrive / "
                              "SharePoint) and restore an earlier version - or copy the MASTER file again (First "
                              "time only) and set up 3. Lines again."),
    ("kv", "The file says Read-Only or locked for editing", "Someone else has your shift's file open (on a network "
                                                            "drive only one person at a time can change it - your "
                                                            "statuses could not be saved). Close it, ask them to "
                                                            "close it, then open it again. On Teams / OneDrive "
                                                            "several people can edit it together."),
    ("kv", "A line can't get a status", "Type its name in the left table of 3. Lines (Part B, step 2a)."),
    ("kv", "A status nobody picked", "On 3. Lines look for a red Note: a status left in a row whose Line was cleared "
                                     "is taken over by the next line typed there. Clear the whole row together. A "
                                     "READY / PM / OVERTIME can also come from the Line Status column of today's file: "
                                     "pick NONE in that line's This shift to remove it."),
    ("kv", "CHECK: 3. Lines not dated today", "Check the statuses on 3. Lines (Part B), then put today's date and "
                                              "time in Schedule as of there (Part B, step 6)."),
    ("kv", "WARNING: see 2. Check Columns", "The box on 2. Check Columns says what is wrong (see the first row of "
                                            "this list)."),
    ("kv", "No estimated times", "Only lines that are RUNNING, PARTIAL SHIFT or OVERTIME (This shift on 3. Lines) "
                                 "get them. no rate: add the line and item to 6. Line Rates. A dash: the work order "
                                 "above it has no rate (or no WO Qty)."),
    ("kv", "The estimated times look wrong", "Check Schedule as of (the time the % Complete was taken), the line's "
                                             "Breaks & lunch on 3. Lines, its bottles per hour on 6. Line Rates, and "
                                             "the line efficiency and changeover minutes on 5. Settings. A time after "
                                             "the work order before it can't be earlier - the times add up down the "
                                             "line."),
    ("kv", "The printout has no colors", "In the print window, check the printer is not set to black and white / "
                                         "draft. The status words and changeover types still print in black and "
                                         "white."),
    ("kv", "Blank pages, or rows missing", "The printout follows the schedule by itself - never use Page Layout > "
                                           "Print Area > Set Print Area. If it still goes wrong: on 4. Schedule "
                                           "select from cell A1 to column Q of the last work order, press Ctrl+P "
                                           "and under Settings pick Print Selection."),
    ("kv", "Columns cut off", "In the print window keep Fit All Columns on One Page."),
    ("kv", "Long text", "Long product descriptions, desiccants, line names and notes get smaller to fit their cell. "
                        "To see more of a column, make it wider: drag the line between two column letters at the "
                        "top of 4. Schedule."),
    ("gap",),
    ("head", "", "7. Washroom - the washroom attendants' prep list"),
    ("kv", "What it is", "Every changeover expected from Schedule as of (3. Lines) to the end of this copy's shift "
                         "(other shifts may run other lines), first to last, with the totals at the top. It fills itself in from 4. Schedule's estimated times, "
                         "so only RUNNING, PARTIAL SHIFT and OVERTIME lines with a line rate are on it. Print it the "
                         "same way (Ctrl+P) and give it to the washroom."),
    ("kv", "The columns", "TIME of the changeover; the LINE and its FILLER (Cremer or Merrill, from "
                          "5. Settings); the CHANGEOVER type and its MINutes (5. Settings) - how long the line is "
                          "down; OFF THE LINE - the work order whose parts come off to be washed - its TYPE: Oily "
                          "(a softgel) or Powdery (a tablet) and its ALLERGEN (in orange: wash for allergens); NEXT "
                          "ON THE LINE and its type; and a DONE box to tick with a pen on the walk."),
    ("kv", "Oily or powdery", "By the item's tick on 8. Products (Oily or Powdery - the supervisor picks it once "
                              "per item). An item without one: oily (a softgel) when its description has SG, LSG "
                              "or S/G (the oily words on 5. Settings), else powdery. (This list is "
                              "only for 7. Washroom - the Oil highlight on 4. Schedule still goes by OIL in the "
                              "description.) The Cremer / Merrill line numbers are there too."),
    ("gap",),
    ("head", "", "Tips"),
    ("kv", "Override: title or letter", "Pick the column's title in an Override box: the Override stays in this "
                                        "file, and a title keeps working when another day's file has its columns in "
                                        "a different order. A column letter like C works too, but only while the "
                                        "columns stay in the same place. A column with no title can only be given "
                                        "by its letter."),
    ("kv", "Why an Override is needed", "This file goes by the column titles only. Unlike the web app it does not "
                                        "guess the Line or WO column from the values in it, and a title with unusual "
                                        "characters may not be recognised - the Override box is how you tell it."),
    ("kv", "Cotton (COT)", "The COT column of your file is not printed as a column: Add Cotton / Remove Cotton / "
                           "Change Cotton show in the Changeover Notes where the next work order changes it. "
                           "2. Check Columns shows which column it "
                           "is read from (row Cotton); if your file titles it differently, pick its title in that "
                           "row's Override box."),
    ("kv", "Hidden tabs", "6. Line Rates and 8. Products are hidden (set once by the supervisor). To open one: "
                          "Review > Protect Workbook (click it to turn the protection off - no password), then "
                          "right-click any tab > Unhide and pick it. When done: right-click its tab > Hide, then "
                          "Review > Protect Workbook again (no password: just click OK)."),
    ("kv", "Line rates", "6. Line Rates lists the bottles per hour of each line and item, from the Line Lead MDI "
                         "Router (Power BI). A new item: type a row under the last one (Line like LINE05, Item, "
                         "Description, Bottles per hour). A newer router list: paste it over A5:E with Paste "
                         "Options > Values."),
    ("kv", "Settings", "5. Settings: when the 1st shift starts, the break and lunch hours of the shift and how many "
                       "bottles a break / lunch hour makes, the line efficiency, and the minutes of each changeover. "
                       "They apply to every line (breaks and lunch only to lines with Breaks & lunch = Yes)."),
    ("kv", "Fit on one page", "In the print window, under Settings, change Fit All Columns on One Page to Fit Sheet "
                              "on One Page (the text gets smaller)."),
    ("kv", "Portrait or margins", "Portrait, margins and scaling can be changed in the print window for one "
                                  "printout. Keep Fit All Columns on One Page."),
    ("kv", "Hide a column", "On 4. Schedule right-click the column letter (for example O for EE) > Hide. "
                            "To bring it back, select the columns on both sides (N to P), right-click > Unhide."),
    ("kv", "Make a column wider", "On 4. Schedule drag the line between two column letters."),
    ("kv", "Find a work order", "On 1. Paste Schedule press Ctrl+F and type its WO number."),
    ("kv", "Change a work order", "Find it (above) and change its cells on 1. Paste Schedule. To remove it, clear "
                                  "its cells."),
    ("kv", "Add a work order", "On 1. Paste Schedule type a new row under the last row, with the Line and a Seq. "
                               "Give it a Seq bigger than the line's last one to put it last, or for example 6.5 "
                               "to put it between 6 and 7. (With no Seq it goes right after the row above it of the "
                               "same line.)"),
    ("kv", "Add a new line", "Type a row with the new line name in the Line column of 1. Paste Schedule, then add "
                             "the name on 3. Lines (Part B, step 2a)."),
    ("kv", "Type a schedule by hand", "Row 1 of 1. Paste Schedule needs the column titles: LINE, WO, SEQ, ITEM, "
                                      "PRODUCT DESCRIPTION, Count, Bulk Item, Bottle Size, CAP DESCRIPTION, "
                                      "Allergen, REMARKS, WO Quantity, % Complete, Line Status, Desiccant (or copy "
                                      "row 1 from the MASTER file). Then type one work order per row under it."),
    ("kv", "Rename a line", "On 1. Paste Schedule press Ctrl+H. Find what: the old name. Replace with: the new "
                            "name. Click Options, tick Match entire cell contents, then Replace All. Change the "
                            "name on 3. Lines too (a line keeps its row there as long as its number stays the same)."),
    ("kv", "Leave a whole line off", "On 1. Paste Schedule click a cell in the title row, then Data > Filter. "
                                     "With the arrow on the Line column show only that line, select its rows "
                                     "(click the row numbers) and press Delete. Then click Data > Filter again to "
                                     "turn the filter off. (Rows on 4. Schedule can't be hidden: its rows change "
                                     "every day, so a hidden row would hide another line's work order later.)"),
    ("kv", "Send the schedule as PDF", "With 4. Schedule open: File > Save As (on the web: Save a Copy / Export) "
                                       "and pick PDF. Email or post the PDF."),
    ("kv", "Send it as Excel", "Send this file (or File > Save a Copy). To send only the schedule: on 4. Schedule "
                               "select from A1 to column Q of the last row, press Ctrl+C, open a new workbook, "
                               "right-click A1 > Paste Options > Values."),
    ("kv", "Seq order", "Numbers sort as numbers (6.5 goes between 6 and 7). A row with no Seq stays right after "
                        "the row above it of the same line. Seq values that are not numbers go after the numbered "
                        "ones, in the order they were pasted."),
    ("kv", "Long schedules", "The LINE name is shown once, in the middle of each line's box. Excel can't keep a "
                             "line's rows together on one page, so a line that runs on to the next page may have "
                             "its name on one page only - use Fit Sheet on One Page if that matters."),
    ("kv", "Limits", f"Up to {MAX_WO} work orders (the first {MAX_WO} under the column titles, in paste order), "
                     f"pasted rows 1 to {PASTE_ROWS}, columns A to BH, {LINE_SLOTS} lines on 3. Lines, {OUT_ROWS} "
                     f"work orders and blank rows between lines on 4. Schedule, {RATE_ROWS} rows "
                     f"on 6. Line Rates. Past a limit, a red WARNING shows on 2. Check Columns and on 4. Schedule."),
    ("kv", "Not like the web app", "The status is a colored cell under the line name; a line that runs on to the "
                                   "next page isn't named again there (Excel can't keep a line on one page); long "
                                   "text shrinks to fit; columns can be hidden but not moved; the Line and WO "
                                   "columns are found by their titles only; pasting a new schedule does not clear "
                                   "the statuses (Part B, step 3 does)."),
    ("kv", "Not like the JDE printout", "HOT WO and twin pack are not shown: the schedule file has no column for "
                                        "them. COT shows in the Changeover Notes instead of a column. The "
                                        "estimated times are worked out from 6. Line Rates."),
    ("kv", "Also not in this file", "The web app's Customize Print Design: the report title, the fonts and the "
                                    "colors are fixed here. Line Assignments (and the app's Print > Both) is not "
                                    "part of this file. Export Excel: see Send it as Excel."),
]


def build_how(wb):
    ws = wb.active
    ws.title = S_HOW
    ws.sheet_properties.tabColor = "2F5597"
    ws.sheet_view.showGridLines = False
    ws.column_dimensions["A"].width = 2
    ws.column_dimensions["B"].width = 22
    ws.column_dimensions["C"].width = 100
    wrap = Alignment(wrap_text=True, vertical="top")
    r = 1
    for row in HOW_ROWS:
        kind = row[0]
        if kind == "gap":
            ws.row_dimensions[r].height = 8
            r += 1
            continue
        if kind == "pagebreak":          # the quick card prints on a page of its own
            ws.row_breaks.append(Break(id=r - 1))
            continue
        b, c = (row[1], row[2]) if len(row) > 2 else ("", row[1])
        lines = max(1, len(textwrap.wrap(c, 100)))     # column C: about 100 characters a line
        height = 15 * lines + 3
        if kind == "title":
            put(ws, f"B{r}", c, font=font(20, True, "1F3864"))
            height = 30
        elif kind == "sub":
            put(ws, f"B{r}", c, font=font(12, italic=True, color="404040"))
        elif kind == "head":
            ws.merge_cells(f"B{r}:C{r}")
            put(ws, f"B{r}", c, font=font(13, True, "FFFFFF"), fill=fill("1F3864"),
                alignment=Alignment(vertical="center", indent=1))
            height = 21
        elif kind == "part":
            put(ws, f"B{r}", b, font=font(22, True, "FFFFFF"), fill=fill("2F5597"),
                alignment=Alignment(horizontal="center", vertical="center"))
            put(ws, f"C{r}", c, font=font(13, True, "1F3864"), fill=fill("D9E2F3"),
                alignment=Alignment(wrap_text=True, vertical="center", indent=1))
            height = max(38, height + 6)
        elif kind == "qc":                # bigger, to read it posted next to the computer
            put(ws, f"B{r}", b, font=font(14, True, "2F5597"), alignment=Alignment(horizontal="center", vertical="top"),
                fill=fill("EDF2FA"), border=THIN_GRAY)
            put(ws, f"C{r}", c, font=font(13), alignment=wrap, fill=fill("EDF2FA"), border=THIN_GRAY)
            height = 19 * max(1, len(textwrap.wrap(c, 84))) + 5
        elif kind == "step":
            put(ws, f"B{r}", b, font=font(14, True, "2F5597"), alignment=Alignment(horizontal="center", vertical="top"))
            put(ws, f"C{r}", c, font=font(11), alignment=wrap)
        elif kind == "see":
            put(ws, f"C{r}", c, font=font(11, True, "006100"), alignment=wrap)
        elif kind in ("careful", "tip"):
            color, text = ("FCE4D6", "C00000") if kind == "careful" else ("DDEBF7", "1F3864")
            put(ws, f"B{r}", b, font=font(11, True, text), fill=fill(color),
                alignment=Alignment(horizontal="center", vertical="top"))
            put(ws, f"C{r}", c, font=font(11), fill=fill(color), alignment=wrap)
        elif kind == "kv":
            put(ws, f"B{r}", b, font=font(14 if len(b) <= 2 else 11, True, "2F5597" if len(b) <= 2 else "000000"),
                alignment=Alignment(wrap_text=True, vertical="top", horizontal="center" if len(b) <= 2 else "left"))
            put(ws, f"C{r}", c, font=font(11), alignment=wrap)
            lines = max(lines, len(textwrap.wrap(b, 19)))   # bold labels in column B
            height = max(15 * lines + 3, 21 if len(b) <= 2 else 0)   # a 14 pt letter needs 21
        elif kind == "swatch":
            put(ws, f"B{r}", None, fill=fill(b), border=THIN_GRAY)
            put(ws, f"C{r}", c, font=font(11), alignment=wrap)
        elif kind == "text":
            put(ws, f"C{r}", c, font=font(11), alignment=wrap)
        ws.row_dimensions[r].height = height
        r += 1
    fit_width(ws, "portrait")
    ws.print_area = f"A1:C{r - 1}"
    protect(ws)
    return ws


# ----------------------------------------------------------------------------
# Build, audit, save

FORBIDDEN = ["AGGREGATE", "MAXIFS", "MINIFS", "IFS", "SWITCH", "XLOOKUP", "XMATCH", "FILTER", "SORT", "SORTBY",
             "UNIQUE", "SEQUENCE", "LET", "LAMBDA", "TEXTJOIN", "CONCAT", "INDIRECT"]
ALLOWED = {"IF", "IFERROR", "AND", "OR", "NOT", "INDEX", "MATCH", "LOOKUP", "COUNT", "COUNTIF", "COUNTIFS", "SUMIF", "SUMIFS",
           "SUMPRODUCT", "ROW", "ROWS", "COLUMN", "COLUMNS", "MIN", "MAX", "SMALL", "LARGE", "ISNUMBER", "ISERROR",
           "ISBLANK", "ISTEXT", "LEN", "TRIM", "UPPER", "LEFT", "RIGHT", "MID", "SEARCH", "FIND", "SUBSTITUTE",
           "EXACT", "VALUE", "TEXT", "ROUND", "TODAY", "CHAR", "N", "T", "ABS", "INT", "MOD", "OFFSET",
           "NOW", "YEAR", "MONTH", "DAY", "HOUR", "MINUTE", "TIME", "CHOOSE", "REPT", "SUM"}


def formula_functions(formula):
    stripped = re.sub(r'"[^"]*"', '""', formula)
    return set(re.findall(r"([A-Z][A-Z0-9_.]*)\(", stripped))


def audit(wb):
    problems = []
    texts = []
    for ws in wb.worksheets:
        for row in ws.iter_rows():
            for c in row:
                if isinstance(c.value, str) and c.value.startswith("="):
                    texts.append((f"{ws.title}!{c.coordinate}", c.value))
        for cf_range in ws.conditional_formatting:
            for rule in cf_range.rules:
                for f in rule.formula or []:
                    texts.append((f"{ws.title} CF {cf_range.sqref}", "=" + f))
        for dv in ws.data_validations.dataValidation:
            for f in (dv.formula1, dv.formula2):
                if f:
                    texts.append((f"{ws.title} DV {dv.sqref}", "=" + f))
        for n, dn in ws.defined_names.items():
            texts.append((f"{ws.title} name {n}", "=" + dn.attr_text))
    for n, dn in wb.defined_names.items():
        texts.append((f"name {n}", "=" + dn.attr_text))
    for where, f in texts:
        funcs = formula_functions(f)
        bad = funcs - ALLOWED
        if bad:
            problems.append(f"{where}: functions not allowed {sorted(bad)}")
        if "_xlfn" in f or "[" in re.sub(r'"[^"]*"', "", f):
            problems.append(f"{where}: _xlfn prefix or structured reference")
        if len(f) > 8192:
            problems.append(f"{where}: {len(f)} chars")
        if any(len(lit_) > 255 for lit_ in re.findall(r'"([^"]*)"', f)):
            problems.append(f"{where}: a text constant longer than 255 characters")
        depth = best = 0
        for ch in re.sub(r'"[^"]*"', '""', f):
            depth += ch == "("
            depth -= ch == ")"
            best = max(best, depth)
        if best > 60:
            problems.append(f"{where}: nesting {best}")
        if depth != 0:
            problems.append(f"{where}: unbalanced parentheses ({depth:+d})")
    if problems:
        raise SystemExit("Formula audit failed:\n" + "\n".join(problems[:50]))
    return len(texts)


def deterministic_zip(data, vba=None, drawings=None):
    """Rewrite the package with fixed timestamps so rebuilds are identical
    (and, given a vbaProject.bin, as a macro-enabled .xlsm). drawings: {sheet
    part: DrawingML} - a drawing (the buttons) added to a sheet."""
    src = zipfile.ZipFile(io.BytesIO(data))
    out = io.BytesIO()
    stamp = FIXED_TIME.strftime("%Y-%m-%dT%H:%M:%SZ")
    drawings = drawings or {}
    rel_ns = b"http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    rels_new = {}                                   # sheet rels part -> drawing part
    extra = {}                                      # new parts
    for k, (sheet, xml) in enumerate(sorted(drawings.items()), start=1):
        rels = sheet.replace("worksheets/", "worksheets/_rels/") + ".rels"
        rels_new[rels] = f"../drawings/drawing_jde{k}.xml"
        extra[f"xl/drawings/drawing_jde{k}.xml"] = xml.encode()
    rel = lambda target: (f'<Relationship Id="rIdJDE1" Type="http://schemas.openxmlformats.org/officeDocument/2006/'
                          f'relationships/drawing" Target="{target}"/>').encode()
    for rels, target in rels_new.items():
        if rels not in src.namelist():
            extra[rels] = (b'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://'
                           b'schemas.openxmlformats.org/package/2006/relationships">' + rel(target) + b"</Relationships>")
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as dst:
        for info in src.infolist():
            body = src.read(info.filename)
            if info.filename in drawings:
                if b'xmlns:r="' not in body[:1000]:
                    body = body.replace(b"<worksheet ", b'<worksheet xmlns:r="' + rel_ns + b'" ', 1)
                m = re.search(rb"<(legacyDrawing|legacyDrawingHF|picture|oleObjects|controls|webPublishItems|"
                              rb"tableParts|extLst)\b|</worksheet>", body)
                body = body[:m.start()] + b'<drawing r:id="rIdJDE1"/>' + body[m.start():]
            if info.filename in rels_new:
                body = body.replace(b"</Relationships>", rel(rels_new[info.filename]) + b"</Relationships>")
            if info.filename == "[Content_Types].xml":
                for part in extra:
                    if part.startswith("xl/drawings/"):
                        body = body.replace(b"</Types>", f'<Override PartName="/{part}" ContentType="application/'
                                            f'vnd.openxmlformats-officedocument.drawing+xml"/></Types>'.encode())
            if info.filename.startswith("xl/worksheets/sheet"):
                # formulas carry no cached value (Excel calculates on load): an
                # empty <v></v> per formula cell would push Calc's rows past the
                # 32 KB compression window
                body = body.replace(b"</f><v></v>", b"</f>")
            if vba is not None and info.filename == "[Content_Types].xml":
                body = body.replace(b"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
                                    b"application/vnd.ms-excel.sheet.macroEnabled.main+xml")
                body = re.sub(rb"(<Types[^>]*>)", rb'\1<Default Extension="bin" '
                              rb'ContentType="application/vnd.ms-office.vbaProject"/>', body, count=1)
            if vba is not None and info.filename == "xl/_rels/workbook.xml.rels":
                body = body.replace(b"</Relationships>", b'<Relationship Id="rIdVBA" Type="http://schemas.microsoft'
                                    b'.com/office/2006/relationships/vbaProject" Target="vbaProject.bin"/>'
                                    b"</Relationships>")
            if info.filename == "docProps/core.xml":
                body = re.sub(rb"(<dcterms:(created|modified)[^>]*>)[^<]*", lambda m: m.group(1) + stamp.encode(), body)
            zi = zipfile.ZipInfo(info.filename, date_time=(1980, 1, 1, 0, 0, 0))
            zi.compress_type = zipfile.ZIP_DEFLATED
            zi.external_attr = 0o644 << 16
            dst.writestr(zi, body, compresslevel=9)
        if vba is not None:
            extra["xl/vbaProject.bin"] = vba
        for name, body in extra.items():
            zi = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            zi.compress_type = zipfile.ZIP_DEFLATED
            zi.external_attr = 0o644 << 16
            dst.writestr(zi, body, compresslevel=9)
    return out.getvalue()


# --demo: a copy ready to present - the JDE Packaging Schedule printout's
# lines with its statuses and crews, 1st shift as of 5:15 AM today (so no CHECK
# message on the day it's shown), opening on 4. Schedule.
DEMO_OUT = OUT.with_name("JDE_Production_Schedule_DEMO.xlsm")
DEMO_LINES = {  # line: (this shift, next shift, crew)
    "LINE 1": ("NOT SCHEDULED", "NOT SCHEDULED", None), "LINE 3": ("RUNNING", "NOT SCHEDULED", 5),
    "LINE 5": ("RUNNING", "RUNNING", 6), "LINE 7": ("RUNNING", "NOT SCHEDULED", 7),
    "LINE 8": ("PM / CLEANING", "RUNNING", 5), "LINE 9": ("RUNNING", "RUNNING", 5),
    "LINE 10": ("RUNNING", "RUNNING", 4), "LINE 12": ("RUNNING", "RUNNING", 5)}


def apply_demo(wb):
    ws = wb[S_LINES]
    for r in range(4, 4 + LINE_SLOTS):
        name = ws[f"A{r}"].value
        if name in DEMO_LINES:
            this, nxt, crew = DEMO_LINES[name]
            ws[f"B{r}"].value, ws[f"C{r}"].value, ws[f"E{r}"].value = this, nxt, crew
    ws["C1"].value = SHIFTS[0]
    ws["L1"].value = "=TODAY()+TIME(5,15,0)"
    wb.properties.title = "JDE Production Schedule (demo)"
    sched_idx = wb.sheetnames.index(S_SCHED)
    wb.active = sched_idx
    for w in wb.worksheets:
        w.sheet_view.tabSelected = w.title == S_SCHED


def main():
    demo = "--demo" in sys.argv[1:]
    wb = Workbook()
    build_how(wb)
    setup_shapes = build_setup(wb)
    build_paste(wb)
    build_check(wb)
    build_lines(wb)
    build_schedule(wb)
    settings = build_settings(wb)
    build_rates(wb)
    build_wash(wb)
    build_products(wb)
    build_calc(wb)

    add_name(wb, "PASTE_ALL", f"{PASTE}!$1:$1048576")
    add_name(wb, "HEADER_ROW", f"{CHECK}!$E$6")
    add_name(wb, "HEADER_ROW_OVERRIDE", f"{CHECK}!$E$5")
    add_name(wb, "COL_OVERRIDES", f"{CHECK}!$F$13:$F$27")
    add_name(wb, "WO_COUNT", f"{CHECK}!$E$9")
    add_name(wb, "LINE_COUNT", f"{CHECK}!$E$10")
    last = 3 + LINE_SLOTS
    for name, col in [("LINES_NAME", "A"), ("LINES_STATUS", "B"), ("LINES_NEXT", "C"), ("LINES_BREAKS", "D"),
                      ("LINES_CREW", "E")]:
        add_name(wb, name, f"{LINES}!${col}$4:${col}${last}")
    add_name(wb, "LINES_SHIFT", f"{LINES}!$C$1")
    add_name(wb, "LINES_CHECKED_ON", f"{LINES}!$L$1")
    for name, ref in settings.items():
        add_name(wb, name, ref)
    for name, col in [("SCHED_KIND", "S"), ("SCHED_HL", "T"), ("SCHED_STATUS", "AC"), ("SCHED_SCHEDULED", "AD")]:
        add_name(wb, name, f"{SCHED}!${col}${SCHED_ROW0}:${col}${SCHED_LAST}")

    # set once by the supervisor: hidden (How To Use, Tips: Hidden tabs)
    for t in (S_RATES, S_PROD):
        wb[t].sheet_state = "hidden"
    wb.active = 0
    for ws in wb.worksheets:
        ws.sheet_view.tabSelected = ws.title == S_HOW
    wb.security = WorkbookProtection(lockStructure=True)
    wb.calculation.fullCalcOnLoad = True
    # the VBA project's document modules: the workbook (ThisWorkbook) and the
    # sheets (Excel adds their empty modules)
    wb.code_name = "ThisWorkbook"
    for i, ws in enumerate(wb.worksheets, start=1):
        ws.sheet_properties.codeName = f"Sheet{i}"
    wb.properties.creator = "JDE Sched"
    wb.properties.title = "JDE Production Schedule"
    wb.properties.created = FIXED_TIME
    if demo:
        apply_demo(wb)
    n = audit(wb)

    out = DEMO_OUT if demo else OUT
    buf = io.BytesIO()
    wb.save(buf)
    part = lambda t: f"xl/worksheets/sheet{wb.sheetnames.index(t) + 1}.xml"
    out.write_bytes(deterministic_zip(buf.getvalue(), vba_bin(),
                                      {part(S_LINES): button_drawing(wb[S_LINES], LINES_BUTTONS),
                                       part(S_SETUP): button_drawing(wb[S_SETUP], setup_shapes)}))
    print(f"Wrote {out} ({out.stat().st_size // 1024} KB, {n} formulas audited)")


if __name__ == "__main__":
    sys.exit(main())
