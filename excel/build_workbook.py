#!/usr/bin/env python3
"""Build excel/JDE_Production_Schedule.xlsx - the Excel replacement for the
JDE Sched web app's Production Schedule tab (only that tab).

    python3 excel/build_workbook.py          (run from the repo root)

The output is deterministic: the same script always writes byte-identical
files (fixed document timestamps and zip entry dates).

Behaviour is ported from the app's code - src/importColumns.ts (reading any
schedule layout), src/scheduleLogic.ts (grouping, Seq order, calculated
columns, changeover codes, highlights, line status) and
src/components/PrintViews.tsx + src/App.css (the printed report). Every
calculation is a worksheet formula; there are no macros. Only Excel 2007
functions are used, and every formula that compares a whole range sits inside
SUMPRODUCT, LOOKUP(2,1/(...)), MATCH(1,INDEX(...,0),0) or COUNTIF/COUNTIFS, so
nothing depends on dynamic arrays or Excel 365's implicit-intersection rules.

Sheets (tab order)
------------------
  How To Use          instructions (protected, opens first)
  1. Paste Schedule   the data: today's file pasted at A1 (unprotected)
                      capacity A:BH (60 columns) x rows 1:1000
  2. Check Columns    header row + field -> column mapping, overrides, status
  3. Lines            Scheduled / Status per line + today's lines
  4. Schedule         the printable report (formulas only, protected)
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
  LINES_NAME / LINES_SCHEDULED / LINES_STATUS   '3. Lines'!$A/$B/$C$4:$103
  LINES_CHECKED_ON     '3. Lines'!$K$1  input: date the ticks/statuses were
                       checked (not today -> red CHECK on 3. Lines + 4. Schedule)
  SCHED_KIND / SCHED_HL / SCHED_SCHEDULED / SCHED_STATUS
                       '4. Schedule'!$T/$U/$V/$W$3:$702 (hidden helpers)
  '4. Schedule' also has a sheet-scoped _xlnm.Print_Area =
  '4. Schedule'!$A$1:INDEX('4. Schedule'!$R$1:$R$702,Calc!$B$14) so the
  printout stops at the last used row, and _xlnm.Print_Titles = rows 1:2.

'4. Schedule' column A has the line name on every work-order row: bold black
on the first row of each line, grey on the others (conditional formats), so a
line that runs on to the next printed page is still named there.

No CHAR() above 127 and nothing below CHAR(32) except 9/10/13: the
non-breaking space, the other non-ASCII characters column-title normalization
removes (NORM1_CHARS) and the duplicate-key separator (U+241F) are typed into
the formula text (see NBSP / SEP below).

Calc sheet layout (row 3 = band titles, row 4 = column labels, data from 5)
------------------------------------------------------------------------
  A:B    scalars (label in A, value in B), rows 5-46, in SCALARS order:
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
         B34 3. Lines ticks/statuses not dated today, B35 4. Schedule typed on
         (its A3:R702 differ from Calc), B36 warning for '4. Schedule'!A1,
         B37 Line column, B38/B39 first / last work order text, B40 kept
         rows whose WO # is on an earlier kept row (old rows left on the
         sheet), B41 window row of the first one, B42 its text, B43 status OK
         apart from those, B44 this computer's decimal separator (VALUE()
         follows the regional settings; "." is swapped for it first), B45/B46
         window row / paste row of the example row (the first work order, or
         the first filled row under the titles when there is none)
  D:R    field table, rows 5-19 (one per import field, app order):
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
  U      override text, normalization stage 1 (rows 5-19)
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
  DE:EX  the window: every pasted row under the header down to row 1000
         (rows 5-1003), one row per pasted row HEADER_ROW+k: k, paste row,
         in range, line, row key (the 60 cells joined with U+241F, trimmed),
         duplicate, kept before the cap, running count, kept (the first 600),
         the other fields (WO Qty and % Complete as cleaned text, then the
         number), first kept row of the line, first-of-line flag, line
         count, line no., Seq anchor (LOOKUP(2,1/...)), Seq key, Seq group
         (0 blank, 1 number, 2 text), Seq value, rank, report position, row
         in '3. Lines', scheduled, status from the file, status typed on
         '3. Lines', status shown, highlight, % actual, bottles remaining,
         first kept row with the same WO # (EXACT), looks like a row of
         column titles (Line = the header's Line title, or a Line / WO #
         title after a light normalization), filled cells of the row (only
         worked out when there is no work order - for the example row)
  EZ:FY  the report, 700 rows (rows 5-704): position, window row, kind
         (row/spacer/""), first/last of line, then the 18 printed columns
         A:R side by side (FE:FV), highlight, scheduled, count-change flag
  GA:GK  today's lines 1-100 (rows 5-104) for '3. Lines': no., window row,
         name, work orders, status, scheduled, note, then the lines that are
         NOT IN YOUR LIST one after the other (flag, running count, name),
         and the line's row in the left table of '3. Lines'
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

OUT = Path(__file__).resolve().parent / "JDE_Production_Schedule.xlsx"
FIXED_TIME = datetime(2026, 10, 7, 12, 0, 0)

# ----------------------------------------------------------------------------
# Capacities
PASTE_ROWS = 1000      # 1. Paste Schedule rows read
PASTE_COLS = 60        # A:BH
SCAN_ROWS = 40         # header search (app: first 40 rows)
WIN = PASTE_ROWS - 1   # window: every pasted row under the header, down to row 1000
MAX_WO = 600           # work orders kept (the first 600, in paste order)
OUT_ROWS = 700         # 4. Schedule rows 3:702
LINE_SLOTS = 100       # 3. Lines rows

# Characters typed into formulas instead of CHAR(): CHAR(160) is only a
# non-breaking space in Windows/ANSI Excel (Excel for Mac and LibreOffice map
# it through another character set), and Excel for the web only supports
# CHAR(9), CHAR(10), CHAR(13) and CHAR(32) and above. Formula text is Unicode
# everywhere, so a typed character works the same on every platform.
NBSP = " "
SEP = "␟"         # joins the cells of a row for the duplicate check

S_HOW, S_PASTE, S_CHECK, S_LINES, S_SCHED, S_CALC = (
    "How To Use", "1. Paste Schedule", "2. Check Columns", "3. Lines", "4. Schedule", "Calc")
PASTE, CHECK, LINES, SCHED = "'1. Paste Schedule'", "'2. Check Columns'", "'3. Lines'", "'4. Schedule'"

# Import fields, in the app's order (src/importColumns.ts IMPORT_FIELDS).
FIELDS = [
    ("line", "Line"), ("wo", "WO #"), ("seq", "Seq"), ("item", "Item"),
    ("desc", "Product Description"), ("count", "Count"), ("bulk", "Bulk Item"),
    ("bottle", "Bottle Size"), ("cap", "Cap Description"), ("allergen", "Allergen"),
    ("remarks", "Remarks"), ("qty", "WO Qty"), ("pct", "% Complete"),
    ("status", "Line Status"), ("desiccant", "Desiccant"),
]
FI = {k: i + 1 for i, (k, _) in enumerate(FIELDS)}

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
SAMPLE = [
    ("VPKL01", "2682056", "2", "13612", "NM COQ10 200MG", "90", "A640AB", "225", "CAP 45MM CT YELLOW 116 NV", "N", "", 19780, 0),
    ("VPKL03", "2682467", "5", "4251", "VITAMIN D 1000IU SG", "650", "BU001565", "300", "CAP 45MM CT YELL 116 V", "N", "", 45802, 0),
    ("VPKL05", "2682229", "11", "2883", "MAGNESIUM 400MG LSG", "150", "BU001299", "500", "CAP 45MM CT YELL 116 V", "N", "", 22233, 79.34),
    ("VPKL05", "2683002", "12", "2883", "MAGNESIUM 400MG LSG", "150", "BU001299", "500", "CAP 45MM CT YELL 116 V", "N", "", 28920, 0),
    ("VPKL05", "2679111", "13", "13176", "SUPER B + C SUPPORT", "300", "A633", "625", "CAP 53MM CT YELLOW 116 V", "N", "Label currently is PK002584 but needs new label PK002875 once in system", 10399, 0),
    ("VPKL07", "2682249", "6", "HL000430", "FISH OIL 1200MG BPLESS SAMS", "240", "A420PE", "950", "CAP 53MM CT YELLOW 116 V", "N", "", 23618, 17.78),
    ("VPKL08", "2681041", "9", "1717", "CHEWABLE VIT C 500MG", "150", "704AS", "625", "CAP 53MM CT YELLOW 116 V", "M", "", 30967, 61.85),
    ("VPKL08", "2679117", "10", "1717", "CHEWABLE VIT C 500MG", "150", "704AS", "625", "CAP 53MM CT YELLOW 116 V", "N", "", 27404, 0),
    ("VPKL09", "2681071", "6", "4294", "FISH OIL 1200MG", "150", "A419PE", "500", "CAP 45MM CT YELL 116 V", "N", "", 20132, 0),
    ("VPKL09", "2681067", "7", "2895", "MAGNESIUM CITRATE SG", "120", "A685AC", "400", "CAP 45MM CT YELL 116 V", "N", "", 20174, 0),
    ("VPKL09", "2682430", "8", "2729", "SUPER B COMP W/C & FOL ACID", "360", "BU001588", "400", "CAP 45MM CT YELL 116 V", "N", "", 20171, 0),
    ("VPKL10", "2682127", "10", "2727", "SUPER B-COMP W/FOLIC BIOTIN& C", "140", "704AS", "225", "CAP 45MM CT YELL 116 V", "N", "", 33270, 0),
    ("VPKL10", "2682130", "11", "2727", "SUPER B-COMP W/FOLIC BIOTIN& C", "140", "BU001588", "225", "CAP 45MM CT YELL 116 V", "N", "", 40702, 9.43),
    ("VPKL10", "2681559", "12", "4065", "SUPER B COMPLEX W/VIT C", "160", "BU001588", "225", "CAP 45MM CT YELL 116 V", "N", "", 38193, 0),
    ("VPKL12", "2682211", "8", "2509", "VIT C 500MG S/G", "60", "A101AI", "225", "CAP 45MM CT YELL 116 V", "N", "", 53770, 7.14),
    ("VPKL12", "2681653", "9", "HL000589", "MG GLYCINATE 300MG 2PC AMZN", "90", "BU001333", "225", "CAP 45MM CT YELL 116 V", "N", "", 23099, 0),
]
# The app's Excel export columns (src/excel.ts SCHEDULE_HEADERS).
EXPORT_HEADERS = ["LINE", "WO", "SEQ", "ITEM", "PRODUCT DESCRIPTION", "Count", "Bulk Item", "Bottle Size",
                  "CAP DESCRIPTION", "Allergen", "REMARKS", "WO Quantity", "% Complete", "% Actual Complete",
                  "Bottles Remaining", "CHANGEOVER", "Line Status", "Desiccant"]

# Print look (src/seedData.ts defaultSchedulePrintSettings).
TITLE = "PRODUCTION LINE SCHEDULE"
C_HEADER, C_FORMULA, C_ALLERGEN, C_OIL, C_BULK = "D9D9D9", "FFF9DB", "F8CBAD", "FFF2CC", "BDD7EE"
C_READY, C_PM, C_OT = "15803D", "1D4ED8", "FACC15"
C_DIVIDER, C_SCHEDULED, C_COUNT_CHANGED, C_GRID = "000080", "00C805", "FF0000", "808080"
# The line name repeated on the 2nd.. rows of a line: grey (on the green of a
# ticked line: near black), not bold.
C_LINE_REPEAT, C_LINE_REPEAT_ON_GREEN = "8C8C8C", "262626"
# The app tints the LINE cell of a line with a status (color-mix 16% with white).
C_TINT = {"READY": "DAEBE0", "PM": "DBE3F9", "OT": "FEF7DA"}
# % ACTUAL COMPLETE on a work-order row: blank shows a dash, like the app's
# ProgressBar. The dash is the cell's value (text), not a number format: a
# number format inside a conditional format leaked into the next column
# (BOTTLES REMAINING showed 459300.0%) in real Excel, so conditional formats
# here never carry one.
PA_DASH = "\u2014"

# 4. Schedule columns: (header, Calc output key, width % from PrintViews.tsx
# DEFAULT_SCHEDULE_COLUMN_WIDTHS; STATUS is this workbook's own column).
SCHED_COLS = [
    ("LINE", "o_line", 6.5), ("STATUS", "o_status", 4.5), ("WO", "o_wo", 5), ("SEQ", "o_seq", 3),
    ("ITEM", "o_item", 5), ("PRODUCT DESCRIPTION", "o_desc", 14), ("COUNT", "o_count", 3),
    ("BULK ITEM", "o_bulk", 5), ("BOTTLE SIZE", "o_bottle", 4), ("CAP DESCRIPTION", "o_cap", 10),
    ("ALLERGEN", "o_allergen", 3), ("REMARKS", "o_remarks", 12.5), ("WO QUANTITY", "o_qty", 4),
    ("% COMPLETE", "o_pct", 4), ("DESICCANT", "o_desiccant", 4), ("% ACTUAL COMPLETE", "o_pa", 5),
    ("BOTTLES REMAINING", "o_br", 4), ("CHANGEOVER", "o_chg", 6),
]
# Font sizes (points). "Fit all columns on one page" prints the sheet at about
# 80 %, so these are the app's print sizes / 0.8: title 16, date 9, body 7,
# line name 7.7 in the app. Nothing is smaller than the 8.5 pt body text: real
# Excel drew 7 pt column titles at about 9.5 pt, so they broke mid-word.
TITLE_PT, DATE_PT, HEADER_PT, BODY_PT, LINE_PT = 20, 11, 8.5, 8.5, 9
ROW_HEIGHT = 12.0      # points: one line of 8.5 pt text
# Column widths (Excel units). Excel gives a column of width w trunc(7w+0.49)
# pixels, 5 of them padding, and draws Calibri with every letter rounded to
# whole pixels - tighter than LibreOffice. Each column fits the longest word
# of its title in 9 pt bold (a margin over the 8.5 pt used) and a typical value
# in 8.5 pt: WO 2682056, ITEM HL000430, BULK ITEM BU001565, a 6-digit
# quantity. Longer values shrink to fit (SHRINK_COLS); the two description
# columns take the room that's left.
SCHED_WIDTHS = {
    "LINE": 7.5, "STATUS": 6.8, "WO": 7.3, "SEQ": 4.4, "ITEM": 8.1, "PRODUCT DESCRIPTION": 21.0,
    "COUNT": 6.4, "BULK ITEM": 8.3, "BOTTLE SIZE": 6.7, "CAP DESCRIPTION": 17.5, "ALLERGEN": 8.7,
    "REMARKS": 12.5, "WO QUANTITY": 8.7, "% COMPLETE": 8.9, "DESICCANT": 9.4, "% ACTUAL COMPLETE": 8.9,
    "BOTTLES REMAINING": 9.9, "CHANGEOVER": 11.6,
}
# Every report column shrinks a value that's too long for it, so nothing is
# cut off and no number turns into ####; only REMARKS is cut at the cell edge
# (shrinking a long remark makes it unreadably small; the app cuts it too).
SHRINK_COLS = {key for _, key, _ in SCHED_COLS} - {"o_remarks"}

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
    # size - and never the number format (see PA_DASH).
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
]
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
              "qty_s", "qty", "pct_s", "pct", "stat", "desiccant"]
W = Band(LN_BAND.end + 2, ["kn", "pr", "valid", "line", "key", "dup", "keep0", "ord0", "keep"] + FIELD_COLS +
         ["firstk", "isfirst", "cumf", "lno", "anch", "sk", "grp", "nv", "rank", "pos", "lidx", "sched",
          "der", "ovst", "stshown", "hl", "pa", "br", "wofk", "hdrlike", "nfill"])
O = Band(W.end + 2, ["pn", "k", "kind", "first", "last"] + [k for _, k, _ in SCHED_COLS] + ["hl", "sched", "cchg"])
LB = Band(O.end + 2, ["n", "lk", "name", "cnt", "st", "sc", "note", "miss", "mcum", "mname", "lrow"])
W0, WN = 5, 4 + WIN                                 # window rows
O0, ON = 5, 4 + OUT_ROWS                            # output rows


def wr(col):                                        # whole window column
    return f"${W[col]}${W0}:${W[col]}${WN}"


def build_calc(wb):
    ws = wb.create_sheet(S_CALC)
    ws.sheet_state = "hidden"
    hdr = font(9, True)
    put(ws, "A1", "Calc - helper sheet for 4. Schedule, 2. Check Columns and 3. Lines. "
                  "Do not edit. Layout: see the comments at the top of excel/build_workbook.py.", font=hdr)

    # ---- scalars -----------------------------------------------------------
    put(ws, "A3", "Scalars", font=hdr)
    labels = {
        "hdr_auto": "Header row found automatically", "hdr_ov": "Header row override (number)",
        "hdr_ov_ok": "Override valid", "legend_row": "LEGEND row (1001 = none)",
        "wo_found": "Work orders in rows 1-1000", "wo_count": "Work orders kept (max 600)", "line_count": "Lines",
        "total": "Report rows needed", "shown": "Report rows shown", "print_last": "Last print row",
        "first_k": "Window row of first WO", "first_pr": "Paste row of first WO",
        "last_k": "Window row of last WO", "last_pr": "Paste row of last WO",
        "overflow": "Work orders past 600", "rows_over": "Cells below row 1000", "beyond_cols": "Cells right of BH",
        "out_over": "Report rows that don't fit", "lines_over": "Lines past 100",
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
    }
    for i, n in enumerate(SCALARS):
        put(ws, f"A{5 + i}", labels[n])

    s = SL
    legr = f"${LN_BAND['leg']}$5:${LN_BAND['leg']}${4 + PASTE_ROWS}"
    scores = f"${SUM_COLS['score']}${B_NH + 1}:${SUM_COLS['score']}${B_NH + SCAN_ROWS}"
    used_line, used_wo = ft("used", 1), ft("used", 2)
    line_hdr = ft("hdr_text", 1)
    twice = f'({wr("wofk")}>0)*({wr("wofk")}<{wr("kn")})'
    lines_inputs = 'SUMPRODUCT(--(TRIM(LINES_SCHEDULED&"")<>""))+SUMPRODUCT(--(TRIM(LINES_STATUS&"")<>""))'
    out_a, out_r = O["o_line"], O["o_chg"]       # the 18 report columns A:R, side by side in Calc
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
        "total": f"IF({s['wo_count']}=0,0,{s['wo_count']}+{s['line_count']}-1)",
        "shown": f"MIN({s['total']},{OUT_ROWS})",
        "print_last": f"2+{s['shown']}",
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
            f'&IF({s["out_over"]}>0," WARNING: 4. Schedule has room for {OUT_ROWS} rows (work orders plus the blank rows '
            f'between lines) - the last "&{s["out_over"]}&" row(s) are not shown.","")'
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
        "tamper": (f'IFERROR(IF(SUMPRODUCT(--({SCHED}!$A$3:$R${2 + OUT_ROWS}&""<>${out_a}${O0}:${out_r}${ON}&""))>0,'
                   f'1,0),1)'),
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
    }
    for n in SCALARS:
        ws[s[n].replace("$", "")] = "=" + f[n]

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
                "allergen": 10, "remarks": 11, "qty_s": 12, "pct_s": 13, "stat": 14, "desiccant": 15}
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
        ws[c["pos"]] = f'=IF({A["keep"]}=0,"",{A["rank"]}+{A["lno"]}-1)'
        lines_names = ttrim('LINES_NAME&""')
        ws[c["lidx"]] = (f'=IF({A["keep"]}=0,0,IFERROR(MATCH(1,INDEX(--({lines_names}={A["line"]}),0),0),0))')
        sv = f'UPPER(TRIM(INDEX(LINES_SCHEDULED,{A["lidx"]})&""))'
        ws[c["sched"]] = f'=IF({A["lidx"]}=0,0,IF(OR({sv}="YES",{sv}="Y",{sv}="X"),1,0))'
        cnt = lambda st: f'COUNTIFS({wr("lno")},{A["lno"]},{wr("stat")},"{st}")>0'
        ws[c["der"]] = (f'=IF({A["keep"]}=0,"",IF({cnt("Ready")},"READY",IF({cnt("PM")},"PM",'
                        f'IF({cnt("OT")},"OT",""))))')
        ws[c["ovst"]] = f'=IF({A["lidx"]}=0,"",UPPER(TRIM(INDEX(LINES_STATUS,{A["lidx"]})&"")))'
        ov = A["ovst"]
        # NONE (or -) on 3. Lines: no tag, even if the file's Line Status has one
        ws[c["stshown"]] = (f'=IF({A["keep"]}=0,"",IF(OR({ov}="READY",{ov}="PM",{ov}="OT"),{ov},'
                            f'IF(OR({ov}="NONE",{ov}="-"),"",{A["der"]})))')
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

    # ---- report rows (4. Schedule rows 3..702) ------------------------------
    put(ws, f"{O['pn']}3", f"Report: 4. Schedule rows 3-{2 + OUT_ROWS}", font=hdr)
    for n in O.col:
        put(ws, f"{O[n]}4", n, font=hdr)
    out_from = {"o_wo": "wo", "o_seq": "seq", "o_item": "item", "o_desc": "desc", "o_count": "count",
                "o_bulk": "bulk", "o_bottle": "bottle", "o_cap": "cap", "o_allergen": "allergen",
                "o_remarks": "remarks", "o_qty": "qty", "o_pct": "pct", "o_desiccant": "desiccant",
                "o_pa": "pa", "o_br": "br", "o_status": "stshown"}
    for p in range(1, OUT_ROWS + 1):
        r_ = 4 + p
        A = {n: f"${O[n]}{r_}" for n in O.col}
        ws[f"{O['pn']}{r_}"] = p
        ws[f"{O['k']}{r_}"] = f"=IFERROR(MATCH({A['pn']},{wr('pos')},0),0)"
        ws[f"{O['kind']}{r_}"] = f'=IF({A["pn"]}>{s["total"]},"",IF({A["k"]}>0,"row","spacer"))'
        prev_kind, next_kind, prev_k = f"${O['kind']}{r_ - 1}", f"${O['kind']}{r_ + 1}", f"${O['k']}{r_ - 1}"
        ws[f"{O['first']}{r_}"] = f'=IF(AND({A["kind"]}="row",{prev_kind}<>"row"),1,0)'
        ws[f"{O['last']}{r_}"] = f'=IF(AND({A["kind"]}="row",{next_kind}<>"row"),1,0)'
        is_row = f'{A["kind"]}="row"'
        # the line name on every work-order row (a number stays a number, like
        # every other column): bold black on the first row of the line, light
        # grey on the others (conditional formats on 4. Schedule), so a line
        # that runs on to the next printed page is still named there
        raw_line = paste(f'INDEX({wr("pr")},{A["k"]})', s["line_col"])
        line_txt = f'INDEX({wr("line")},{A["k"]})'
        ws[f"{O['o_line']}{r_}"] = (f'=IF({is_row},IFERROR(IF(ISNUMBER({raw_line}),{raw_line},{line_txt}),'
                                    f'{line_txt}),"")')
        for oc, wc in out_from.items():
            ws[f"{O[oc]}{r_}"] = f'=IF({is_row},INDEX({wr(wc)},{A["k"]}),"")'
        pa_v = f'INDEX({wr("pa")},{A["k"]})'
        ws[f"{O['o_pa']}{r_}"] = f'=IF({is_row},IF({pa_v}="","{PA_DASH}",{pa_v}),"")'
        g = lambda n, k_: f"INDEX({wr(n)},{k_})"
        b1, b2 = g("bottle", prev_k), g("bottle", A["k"])
        code = (f'IF(OR({b1}="",{b2}=""),"",IF(NOT(EXACT({b1},{b2})),"S4",'
                f'IF(NOT(EXACT({g("bulk", prev_k)},{g("bulk", A["k"])})),"S3",'
                f'IF(NOT(EXACT({g("count", prev_k)},{g("count", A["k"])})),"S1 Count Change","S1"))))')
        ws[f"{O['o_chg']}{r_}"] = f'=IF(AND({is_row},{prev_kind}="row"),{code},"")'
        ws[f"{O['hl']}{r_}"] = f'=IF({is_row},INDEX({wr("hl")},{A["k"]}),"")'
        ws[f"{O['sched']}{r_}"] = f'=IF({is_row},INDEX({wr("sched")},{A["k"]}),0)'
        ws[f"{O['cchg']}{r_}"] = f'=IF({A["o_chg"]}="S1 Count Change",1,0)'

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
        ws[f"{LB['st']}{r_}"] = f'=IF({A["lk"]}=0,"",INDEX({wr("stshown")},{A["lk"]}))'
        ws[f"{LB['sc']}{r_}"] = f'=IF({A["lk"]}=0,"",IF(INDEX({wr("sched")},{A["lk"]})=1,"Yes",""))'
        ws[f"{LB['note']}{r_}"] = (f'=IF({A["lk"]}=0,"",IF(INDEX({wr("lidx")},{A["lk"]})>0,"",'
                                   f'"NOT IN YOUR LIST - type it in column A to tick it"))')
        # the lines that are NOT IN YOUR LIST, one after the other (3. Lines column N)
        ws[f"{LB['miss']}{r_}"] = f'=IF(AND({A["lk"]}>0,{A["note"]}<>""),1,0)'
        ws[f"{LB['mcum']}{r_}"] = f"={A['miss']}" if n_ == 1 else f"={LB['mcum']}{r_ - 1}+{A['miss']}"
        mc = f"${LB['mcum']}$5:${LB['mcum']}${4 + LINE_SLOTS}"
        nm = f"${LB['name']}$5:${LB['name']}${4 + LINE_SLOTS}"
        ws[f"{LB['mname']}{r_}"] = f'=IFERROR(INDEX({nm},MATCH({A["n"]},{mc},0)),"")'
        # the row of the line in the left table of 3. Lines (where it is ticked)
        ws[f"{LB['lrow']}{r_}"] = (f'=IF({A["lk"]}=0,"",IF(INDEX({wr("lidx")},{A["lk"]})>0,'
                                   f'INDEX({wr("lidx")},{A["lk"]})+3,""))')
    protect(ws)
    return ws


# ----------------------------------------------------------------------------
# Visible sheets

def build_paste(wb):
    ws = wb.create_sheet(S_PASTE)
    ws.sheet_properties.tabColor = "FFC000"
    for i, h in enumerate(EXPORT_HEADERS, start=1):
        put(ws, f"{L(i)}1", h, font=font(11, True))
    for r, row in enumerate(SAMPLE, start=2):
        for i, v in enumerate(row, start=1):
            if v != "":
                ws.cell(r, i, v)
    # wide enough in real Excel (tighter than LibreOffice) for the sample's titles
    # and values in 11 pt
    widths = [9, 10, 6, 10, 36, 7, 11, 11, 30, 9, 40, 13, 12, 18, 18, 14, 12, 11]
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
    for col, w in {"A": 2, "B": 30, "C": 16, "D": 30, "E": 30, "F": 22, "G": 14, "H": 52, "I": 2}.items():
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
            alignment=Alignment(wrap_text=True))
        put(ws, f"J{r}", f"=IF(Calc!${FT['used']}${cr}=0,1,0)")
        put(ws, f"K{r}", f'=IF(LEFT(H{r},5)="Found",1,0)')     # 1 = the Note is only information
    cf(ws, "G13:G14", "$J13=1", "FFC7CE", font(10, True, "9C0006"))
    cf(ws, "H13:H27", "$K13=1", None, font(10, True, "006100"))

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
            font=font(10), border=THIN_GRAY, alignment=Alignment(horizontal="left", shrink_to_fit=True))
        fld = f"Calc!${scol(c)}${R_FLD}"
        put(ws, f"E{r}", f'=IF({fld}=0,"",INDEX(Calc!${FT["label"]}${FT_ROW0}:${FT["label"]}${FT_ROW0 + 14},{fld}))',
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
    dv.add("F13:F27")
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


def build_lines(wb):
    ws = wb.create_sheet(S_LINES)
    ws.sheet_properties.tabColor = "00C805"
    ws.sheet_view.showGridLines = False
    for col, w in {"A": 16, "B": 12, "C": 11, "D": 11, "E": 34, "F": 3, "G": 9, "H": 18, "I": 11, "J": 14,
                   "K": 14, "L": 46, "M": 3, "N": 22}.items():
        ws.column_dimensions[col].width = w
    put(ws, "A1", "3. Lines - Scheduled Lines", font=font(18, True))
    # the date the ticks and statuses were last checked (stale ones are flagged)
    ws.merge_cells("G1:J1")
    put(ws, "G1", "Ticks and statuses checked on:", font=font(11, True),
        alignment=Alignment(horizontal="right", vertical="center"))
    put(ws, "K1", None, fill=INPUT_FILL, border=THIN_BLACK, protection=UNLOCKED, font=font(11, True),
        number_format="mmm d, yyyy", alignment=Alignment(horizontal="center", vertical="center"))
    # (no TEXT(): its date codes differ between Excel languages)
    put(ws, "L1", (f'=IF({SC["stale"]}=0,"",IF(ISNUMBER(K1),"CHECK: the ticks and statuses below were last checked '
                   f'on the date in the yellow box - not today.","CHECK: the ticks and statuses below have no date.")'
                   f'&" Check them, then type today\'s date in the yellow box (Ctrl+;).")'),
        font=font(10, True, "C00000"), alignment=Alignment(wrap_text=True, vertical="center"))
    cf(ws, "L1", '$L$1<>""', "FFC7CE", font(10, True, "9C0006"))
    ws.row_dimensions[1].height = 40
    dv0 = DataValidation(type="date", operator="greaterThan", formula1="36526", allow_blank=True,
                         showErrorMessage=True, errorTitle="Date", error="Type a date, like 10/7/2026 - or press Ctrl+; "
                                                                         "for today's date.",
                         showInputMessage=True, promptTitle="Checked on",
                         prompt="After checking the ticks and statuses, press Ctrl+; (semicolon) for today's date.")
    ws.add_data_validation(dv0)
    dv0.add("K1")
    ws.merge_cells("A2:E2")
    put(ws, "A2", "Pick Yes for every line running this shift (green box on the printout). Pick READY, PM or OT to "
                  "tag a line; leave Status empty to use the Line Status column of your file; NONE = no tag at all.",
        font=font(10, italic=True, color="595959"), alignment=Alignment(wrap_text=True, vertical="top"))
    ws.merge_cells("G2:L2")
    put(ws, "G2", f'=IF(LINE_COUNT>{LINE_SLOTS},"WARNING: "&LINE_COUNT&" lines in today\'s schedule - only the first '
                  f'{LINE_SLOTS} are listed here.","")', font=font(10, True, "C00000"),
        alignment=Alignment(wrap_text=True, vertical="top"))
    ws.row_dimensions[2].height = 42
    left = ["Line", "Scheduled", "Status", "Work orders today", "Note"]
    right = ["Its row on the left", "Lines in today's schedule", "Work orders", "Status shown (set in column C)",
             "Ticked? (set in column B)", "Note"]
    for i, h in enumerate(left):
        put(ws, f"{L(1 + i)}3", h, font=font(10, True), fill=fill(C_HEADER), border=THIN_BLACK,
            alignment=Alignment(wrap_text=True, vertical="center"))
    for i, h in enumerate(right):
        put(ws, f"{L(7 + i)}3", h, font=font(10, True), fill=fill(C_HEADER), border=THIN_BLACK,
            alignment=Alignment(wrap_text=True, vertical="center"))
    put(ws, "N3", "Lines to add to column A", font=font(10, True), fill=fill(C_HEADER), border=THIN_BLACK,
        alignment=Alignment(wrap_text=True, vertical="center"))
    ws.row_dimensions[3].height = 42
    sample_lines = []
    for row in SAMPLE:
        if row[0] not in sample_lines:
            sample_lines.append(row[0])
    keep = f"Calc!${W['keep']}${W0}:${W['keep']}${WN}"
    line_rng = f"Calc!${W['line']}${W0}:${W['line']}${WN}"
    center = Alignment(horizontal="center", vertical="center")
    all_names = ttrim(f'$A$4:$A${3 + LINE_SLOTS}&""')
    lb = lambda n: f"Calc!${LB[n]}$5:${LB[n]}${4 + LINE_SLOTS}"
    for i in range(LINE_SLOTS):
        r = 4 + i
        # the input cells are yellow, like every cell that takes typing
        put(ws, f"A{r}", sample_lines[i] if i < len(sample_lines) else None, font=font(11, True),
            protection=UNLOCKED, border=THIN_GRAY, fill=INPUT_FILL)
        put(ws, f"B{r}", None, protection=UNLOCKED, border=THIN_GRAY, alignment=center, font=font(11, True),
            fill=INPUT_FILL)
        put(ws, f"C{r}", None, protection=UNLOCKED, border=THIN_GRAY, alignment=center, font=font(11, True),
            fill=INPUT_FILL)
        a = ttrim(f'A{r}&""')
        above = ttrim(f'$A$3:A{r - 1}&""')
        put(ws, f"D{r}", f'=IF({a}="","",SUMPRODUCT(({line_rng}={a})*{keep}))', border=THIN_GRAY,
            alignment=center, font=font(10))
        # a Scheduled / Status left behind when only the name was cleared would
        # be taken over by the next line typed in that row
        put(ws, f"E{r}", f'=IF({a}="",IF(OR(TRIM(B{r}&"")<>"",TRIM(C{r}&"")<>""),"No line name - clear Scheduled '
                         f'and Status in this row",""),IF(SUMPRODUCT(--({above}={a}))>0,'
                         f'"Listed twice - only the first one is used",IF(SUMPRODUCT(--({all_names}={a}))>1,'
                         f'"Listed twice - this row is the one used",IF(D{r}=0,"Not in today\'s schedule",""))))',
            font=font(9, italic=True, color="7F7F7F"), border=THIN_GRAY)
        # right-hand lists: by position (ROW()-3), so they stay whole if a row is ever inserted or deleted
        at = lambda n: f"INDEX({lb(n)},ROW()-3)"
        # which row of the left table to edit for this line
        put(ws, f"G{r}", f'=IF({at("lrow")}="","","row "&{at("lrow")})', font=font(10, color="404040"),
            alignment=center)
        put(ws, f"H{r}", f"={at('name')}", font=font(11, True))
        put(ws, f"I{r}", f"={at('cnt')}", alignment=center, font=font(10))
        put(ws, f"J{r}", f"={at('st')}", alignment=center, font=font(10, True))
        put(ws, f"K{r}", f"={at('sc')}", alignment=center, font=font(10, True))
        put(ws, f"L{r}", f"={at('note')}", font=font(10, True, "C00000"))
        put(ws, f"N{r}", f"={at('mname')}", font=font(11, True, "C00000"))
    last = 3 + LINE_SLOTS
    orphan = 'AND(TRIM($A4&"")="",OR(TRIM($B4&"")<>"",TRIM($C4&"")<>""))'
    cf(ws, f"B4:C{last}", orphan, "FFC7CE", font(11, True, "9C0006"))      # first, so it wins
    cf(ws, f"E4:E{last}", 'OR(LEFT($E4,7)="No line",LEFT($E4,12)="Listed twice")', None, font(9, True, "C00000"))
    sched_yes = 'OR(UPPER(TRIM($B{r}&""))="YES",UPPER(TRIM($B{r}&""))="Y",UPPER(TRIM($B{r}&""))="X")'
    cf(ws, f"A4:B{last}", sched_yes.format(r=4), "C6EFCE", font(11, True, "006100"))
    for st, color, txt in [("READY", C_READY, "FFFFFF"), ("PM", C_PM, "FFFFFF"), ("OT", C_OT, "000000")]:
        cf(ws, f"C4:C{last}", f'UPPER(TRIM($C4&""))="{st}"', color, font(11, True, txt))
        cf(ws, f"J4:J{last}", f'$J4="{st}"', color, font(10, True, txt))
    cf(ws, f"C4:C{last}", 'OR(UPPER(TRIM($C4&""))="NONE",TRIM($C4&"")="-")', "D9D9D9", font(11, True, "404040"))
    cf(ws, f"K4:K{last}", '$K4="Yes"', "C6EFCE", font(10, True, "006100"))
    cf(ws, f"L4:L{last}", '$L4<>""', "FFC7CE", font(10, True, "9C0006"))
    cf(ws, f"N4:N{last}", '$N4<>""', "FFC7CE", font(11, True, "9C0006"))
    dv1 = DataValidation(type="list", formula1='"Yes"', allow_blank=True, showErrorMessage=True,
                         errorTitle="Scheduled", error="Pick Yes from the list, or leave it empty.")
    dv2 = DataValidation(type="list", formula1='"READY,PM,OT,NONE"', allow_blank=True, showErrorMessage=True,
                         errorTitle="Status", error="Pick READY, PM, OT or NONE from the list, or leave it empty.",
                         showInputMessage=True, promptTitle="Status",
                         prompt="READY, PM or OT tags the line. Empty: use the Line Status column of your file. "
                                "NONE: no tag, even if your file has one.")
    ws.add_data_validation(dv1)
    ws.add_data_validation(dv2)
    dv1.add(f"B4:B{last}")
    dv2.add(f"C4:C{last}")
    ws.freeze_panes = "A4"
    fit_width(ws, "landscape")
    ws.print_area = f"A1:N{last}"
    ws.print_title_rows = "3:3"
    protect(ws, formatColumns=False, formatRows=False)
    return ws


def build_schedule(wb):
    ws = wb.create_sheet(S_SCHED)
    ws.sheet_properties.tabColor = "1F3864"
    ws.sheet_view.showGridLines = False
    ncol = len(SCHED_COLS)                        # 18 -> A:R
    last_row = 2 + OUT_ROWS
    for i, (h, _, _) in enumerate(SCHED_COLS, start=1):
        ws.column_dimensions[L(i)].width = SCHED_WIDTHS[h]
    ws.column_dimensions["S"].width = 2
    # row 1: warnings (left), title (centred on the page), date (right). A:E
    # holds each warning on one line; A:E and O:R are about as wide, so F:N is
    # close to centred on the table like the app's title.
    ws.merge_cells("A1:E1")
    put(ws, "A1", f"={SC['short_warn']}", font=font(BODY_PT, True, "C00000"),
        alignment=Alignment(horizontal="left", vertical="center", wrap_text=True))
    ws.merge_cells("F1:N1")
    put(ws, "F1", TITLE, font=font(TITLE_PT, True), alignment=Alignment(horizontal="center", vertical="center"))
    ws.merge_cells("O1:R1")
    put(ws, "O1", "=TODAY()", number_format="mmmm d, yyyy", font=font(DATE_PT, color="444444"),
        alignment=Alignment(horizontal="right", vertical="center"))
    ws.row_dimensions[1].height = 36
    for i, (h, _, _) in enumerate(SCHED_COLS, start=1):
        put(ws, f"{L(i)}2", h, font=font(HEADER_PT, True), fill=fill(C_HEADER), border=THIN_BLACK,
            alignment=Alignment(wrap_text=True, vertical="center", horizontal="left"))
    ws.row_dimensions[2].height = 32
    helpers = [("T", "KIND", "kind"), ("U", "HL", "hl"), ("V", "SCHEDULED", "sched"), ("W", "STATUS", "o_status"),
               ("X", "FIRST", "first"), ("Y", "LAST", "last"), ("Z", "COUNT CHG", "cchg")]
    for col, h, _ in helpers + [("AA", "BORDER", None)]:
        put(ws, f"{col}2", h, font=font(8, True))
        ws.column_dimensions[col].hidden = True
    right = {"o_qty", "o_pct", "o_pa", "o_br"}
    for r in range(3, last_row + 1):
        cr = r + 2                                # Calc output row
        # One line per row, like the app's printout: no wrapping, so rows never
        # depend on Excel re-fitting their height after a paste. Long product /
        # cap descriptions, desiccants and line names shrink to fit their cell
        # (the app cuts them with "..."; a cut without "..." would look whole);
        # long remarks stop at the cell edge.
        ws.row_dimensions[r].height = ROW_HEIGHT
        for i, (_, key, _) in enumerate(SCHED_COLS, start=1):
            c = ws.cell(r, i, f"=Calc!${O[key]}${cr}")
            horiz = "center" if key in ("o_line", "o_status") else "right" if key in right else "left"
            c.alignment = Alignment(horizontal=horiz, vertical="center", shrink_to_fit=key in SHRINK_COLS)
            # LINE: grey and not bold, like the repeated names; the first row of
            # each line is made bold black by a conditional format
            c.font = (font(LINE_PT, False, C_LINE_REPEAT) if key == "o_line" else
                      font(BODY_PT, key == "o_status"))
            if key == "o_pa":
                c.number_format = "0.0%"
            elif key == "o_br":
                c.number_format = "0"
        for col, _, key in helpers:
            ws[f"{col}{r}"] = f"=Calc!${O[key]}${cr}"
        ws[f"AA{r}"] = (f'=IF($T{r}<>"row",0,IF($V{r}=1,IF($X{r}=1,IF($Y{r}=1,1,2),IF($Y{r}=1,3,4)),'
                        f'IF($X{r}=1,IF($Y{r}=1,5,6),IF($Y{r}=1,7,8))))')
    add_conditional_formats(ws, last_row)
    ws.freeze_panes = "A3"
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
    ws.print_title_rows = "1:2"
    # Print area stops at the last used row (see Calc!B13).
    ws.defined_names["Print_Area"] = DefinedName(
        "Print_Area", attr_text=f"{SCHED}!$A$1:INDEX({SCHED}!${L(ncol)}$1:${L(ncol)}${last_row},{SC['print_last']})")
    # Columns can be hidden or widened; rows can't be hidden (formatRows on):
    # the report is by position, so a hidden row would hide another work order
    # on a later day.
    protect(ws, formatColumns=False, formatRows=True)
    return ws


def add_conditional_formats(ws, last_row):
    """Exactly one rule can be true for any cell (each rule spells out its
    fill, font and borders together), so the result doesn't depend on how a
    spreadsheet program merges several true rules. Borders are thin - Excel
    conditional formats can't draw thick ones."""
    gray, navy, green = side(C_GRID), side(C_DIVIDER), side(C_SCHEDULED)
    R = lambda col: f"{col}3:{col}{last_row}"
    code = lambda *cs: "OR(" + ",".join(f"$AA3={c}" for c in cs) + ")" if len(cs) > 1 else f"$AA3={cs[0]}"
    # STATUS of the row's line (READY / PM / OT / none) - one condition each
    status = [('$W3="READY"', C_READY, "FFFFFF", C_TINT["READY"]), ('$W3="PM"', C_PM, "FFFFFF", C_TINT["PM"]),
              ('$W3="OT"', C_OT, "000000", C_TINT["OT"]), ('AND($W3<>"READY",$W3<>"PM",$W3<>"OT")', None, None, None)]
    # LINE column: looks like one tall cell per line (no lines inside a block).
    # A ticked line is bright green; an unticked line with a status gets the
    # app's light status tint. The name is bold black on the first row (codes
    # 1, 2, 5, 6) and grey on the rest.
    a_borders = {
        1: Border(left=green, right=gray, top=green, bottom=green), 2: Border(left=green, right=gray, top=green),
        3: Border(left=green, right=gray, bottom=green), 4: Border(left=green, right=gray),
        5: Border(left=gray, right=gray, top=gray, bottom=navy), 6: Border(left=gray, right=gray, top=gray),
        7: Border(left=gray, right=gray, bottom=navy), 8: Border(left=gray, right=gray),
    }
    for c, b in a_borders.items():
        first = c in (1, 2, 5, 6)
        if c <= 4:
            cf(ws, R("A"), code(c), C_SCHEDULED, font(8, True, "000000") if first else
               font(8, False, C_LINE_REPEAT_ON_GREEN), b)
        else:
            for cond, _, _, tint in status:
                cf(ws, R("A"), f"AND({code(c)},{cond})", tint, font(8, True, "000000") if first else None, b)
    # B..R: a grid; green top/bottom on a scheduled block; navy under each line.
    inner = [((1,), Border(left=gray, right=gray, top=green, bottom=green)),
             ((2,), Border(left=gray, right=gray, top=green, bottom=gray)),
             ((3,), Border(left=gray, right=gray, top=gray, bottom=green)),
             ((4, 6, 8), Border(left=gray, right=gray, top=gray, bottom=gray)),
             ((5, 7), Border(left=gray, right=gray, top=gray, bottom=navy))]
    last_col = [((1,), Border(left=gray, right=green, top=green, bottom=green)),
                ((2,), Border(left=gray, right=green, top=green, bottom=gray)),
                ((3,), Border(left=gray, right=green, top=gray, bottom=green)),
                ((4,), Border(left=gray, right=green, top=gray, bottom=gray)),
                ((6, 8), Border(left=gray, right=gray, top=gray, bottom=gray)),
                ((5, 7), Border(left=gray, right=gray, top=gray, bottom=navy))]
    hl = [('$U3="allergen"', C_ALLERGEN), ('$U3="oil"', C_OIL), ('$U3="bulk"', C_BULK)]
    hl_none = '$U3=""'
    # STATUS column: the READY / PM / OT tag colors.
    for codes, b in inner:
        for cond, color, txt, _ in status:
            cf(ws, R("B"), f"AND({code(*codes)},{cond})", color, font(8, True, txt) if txt else None, b)
    # plain columns C:F, H:O - row highlight (allergen > oil > bulk)
    plain = "C3:F{0} H3:O{0}".format(last_row)
    for codes, b in inner:
        for cond, color in hl + [(hl_none, None)]:
            cf(ws, plain, f"AND({code(*codes)},{cond})", color, None, b)
    # COUNT: highlight + red bold count on an "S1 Count Change" row
    for codes, b in inner:
        for cond, color in hl + [(hl_none, None)]:
            cf(ws, R("G"), f"AND({code(*codes)},{cond},$Z3=1)", color, font(8, True, C_COUNT_CHANGED), b)
            cf(ws, R("G"), f"AND({code(*codes)},{cond},$Z3<>1)", color, None, b)
    # calculated columns P:R - pale yellow unless the row is highlighted
    for rng, sets in [(R("P"), inner), (R("Q"), inner), (R("R"), last_col)]:
        for codes, b in sets:
            for cond, color in hl + [(hl_none, C_FORMULA)]:
                cf(ws, rng, f"AND({code(*codes)},{cond})", color, None, b)


# ----------------------------------------------------------------------------
# How To Use

HOW_ROWS = [
    ("title", "JDE Production Schedule - How To Use"),
    ("sub", "Load it, Pick the Lines, Print it. Follow the steps in order. Do one step at a time."),
    ("gap",),
    ("head", "", "QUICK CARD - A Load, B Pick the lines, C Print (this page prints on its own: post it at the computer)"),
    ("qc", "A1", "Open YOUR shift's copy of this file. Yellow PROTECTED VIEW bar? Click Enable Editing."),
    ("qc", "A2", "Tab 1. Paste Schedule: click the corner triangle (above row 1), then Home > Clear > Clear All."),
    ("qc", "A3", "Today's schedule file: Data > Clear (if it has filter arrows), click its corner triangle, Ctrl+C."),
    ("qc", "A4", "Back in THIS file, 1. Paste Schedule: right-click A1 > Paste Options > Values (123)."),
    ("qc", "A5", "Tab 2. Check Columns: the box is GREEN; First / Last work order = first / last row of today's file."),
    ("qc", "B1", "Tab 3. Lines: a line marked NOT IN YOUR LIST? Type its name in an empty row of the left table."),
    ("qc", "B2", "Scheduled: pick Yes for every line running this shift. Clear the others (Delete)."),
    ("qc", "B3", "Status: clear yesterday's. Pick READY / PM / OT (empty = from your file, NONE = no tag)."),
    ("qc", "B4", "Click the yellow box Ticks and statuses checked on, press Ctrl+; (today's date)."),
    ("qc", "B5", "Press Ctrl+S."),
    ("qc", "C1", "Tab 4. Schedule: press Ctrl+P, pick the printer, click Print."),
    ("qc", "C2", "Check: today's date, green on the running lines, no red WARNING / CHECK at the top left."),
    ("qc", "C3", "Post it."),
    ("qc", "C4", "Press Ctrl+S."),
    ("pagebreak",),
    ("kv", "For", "Anyone printing the Production Schedule (1st, 2nd or 3rd shift). About 5 minutes."),
    ("kv", "This file", "Replaces the Production Schedule tab of the JDE Sched web app. It works in Excel 2010 and "
                        "newer, Excel for Mac and Excel on the web / Teams. No macros."),
    ("kv", "Mac", "The keys below are for Windows. On a Mac use Cmd instead of Ctrl (Cmd+C, Cmd+V, Cmd+Z, Cmd+Y, "
                  "Cmd+S, Cmd+P, Cmd+H). Today's date is Control+; on a Mac too."),
    ("gap",),
    ("head", "", "You will do 3 jobs, in this order"),
    ("kv", "A", "Load the schedule - paste today's Excel file into the tab 1. Paste Schedule."),
    ("kv", "B", "Pick the lines - tick the lines running this shift and mark READY / PM / OT on the tab 3. Lines."),
    ("kv", "C", "Print it - print the tab 4. Schedule and post it."),
    ("gap",),
    ("head", "", "What you need"),
    ("text", "", "- YOUR SHIFT'S COPY of this file (golden rule 1), opened in Excel. If a yellow bar says PROTECTED "
                 "VIEW, click Enable Editing first (otherwise the sheets stay empty)."),
    ("text", "", "- Today's Excel schedule file (it ends in .xlsx, .xlsm or .xls). It is usually in the Downloads folder."),
    ("text", "", "- A printer."),
    ("gap",),
    ("head", "", "First time only (supervisor) - skip this if your shift's file already exists"),
    ("step", "1", "Put this file in your shared folder (Teams or network drive) and rename it "
                  "JDE Schedule - MASTER - do not edit.xlsx. It is the clean spare."),
    ("step", "2", "Open it and click File > Save As (on the web: File > Save a Copy). Name the copy for a shift, "
                  "for example JDE Schedule - 1st Shift.xlsx. Do this 3 times: 1st, 2nd and 3rd Shift."),
    ("step", "3", "In each shift's copy, type your production lines on the tab 3. Lines (left table, column A) - "
                  "in the same order as the schedule, so the two tables there line up. Press Ctrl+S."),
    ("gap",),
    ("head", "", "3 golden rules"),
    ("kv", "1", "ONE FILE PER SHIFT. Every day open YOUR shift's file - never the MASTER. Your lines, ticks and "
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
    ("see", "", "You should see: each line's work orders together, in Seq order, with a blank row between lines."),
    ("gap",),
    ("part", "B", "Pick the lines running this shift - tick the running lines, and mark any line that is READY, "
                  "down for PM, or OT."),
    ("step", "1", "Click the tab 3. Lines. The left table (yellow cells) is your list of production lines - you "
                  "type there. The right table lists the lines in today's schedule and fills itself in; its first "
                  "column, Its row on the left, says which row of the left table to change for that line."),
    ("step", "2a", "A line marked NOT IN YOUR LIST (in red) can't be ticked yet: type its name in a row of the left "
                   "table where Line, Scheduled and Status are all empty. (The names are also listed under Lines to "
                   "add, on the far right.)"),
    ("careful", "CAREFUL", "Copying names from Lines to add? Paste them with right-click > Paste Options > Values "
                           "(123) - NOT Ctrl+V. Ctrl+V pastes formulas and Excel warns about a circular reference: "
                           "press Ctrl+Z and paste as Values, or type the names."),
    ("step", "2b", "To take a line off your list, clear all three cells of its row (Line, Scheduled and Status)."),
    ("step", "3", "In the Scheduled column, pick Yes for every line running this shift (click the cell, then the "
                  "small arrow). Clear the lines that are not running this shift: click the cell and press Delete."),
    ("step", "4a", "Clear yesterday's statuses: click C4, hold Shift, click the last Status cell of your list, and "
                   "press Delete."),
    ("step", "4b", "Pick READY for a line that is set up and ready to run, PM for a line down for maintenance, or "
                   "OT. Leave the rest empty - an empty Status uses the Line Status column of your file (Ready, PM, "
                   "or OT / Overtime / Trial). NONE removes a READY / PM / OT that comes from your file."),
    ("step", "5", "Click the yellow box Ticks and statuses checked on (top right) and press Ctrl+; (semicolon) to "
                  "put in today's date."),
    ("see", "", "You should see: today's date in the yellow box, and no red CHECK message next to it."),
    ("step", "6", "Click the tab 4. Schedule and check it. Then press Ctrl+S to save."),
    ("see", "", "You should see: the LINE cell of each ticked line filled bright green with a thin green box around "
                "its rows, and READY / PM / OT in the STATUS column of the lines you marked."),
    ("tip", "TIP", "Ticks and statuses stay in this file from day to day. Until today's date is in the yellow box, "
                   "3. Lines and the top left of 4. Schedule show a red CHECK message - it prints too - so old "
                   "ticks never go out by mistake."),
    ("gap",),
    ("part", "C", "Print the schedule - make sure Parts A and B are done first."),
    ("step", "1", "Click the tab 4. Schedule. Press Ctrl+P (or File > Print)."),
    ("step", "2", "Pick your printer and click Print. The layout is already set: Landscape, Letter, all columns on "
                  "one page wide, column titles on every page, page numbers at the bottom."),
    ("step", "3", "Check the printout and post it: today's date top right, your shift's file name bottom left, every "
                  "line, green on the running lines, a READY / PM / OT tag on the lines that have one, and no red "
                  "WARNING or CHECK at the top left."),
    ("step", "4", "Press Ctrl+S to save before you close the file."),
    ("gap",),
    ("head", "", "Colors on 4. Schedule"),
    ("swatch", C_ALLERGEN, "Allergen (anything but N) - the row, from WO to CHANGEOVER. Highlights go allergen "
                           "first, then oil, then bulk."),
    ("swatch", C_OIL, "Oily product (the description contains OIL)."),
    ("swatch", C_BULK, "Bulk item A662 or A624."),
    ("swatch", C_FORMULA, "Calculated columns: % Actual Complete, Bottles Remaining, Changeover. A dash in % Actual "
                          "Complete means % Complete is 0 or blank."),
    ("swatch", C_READY, "READY - the line is set up and ready to run."),
    ("swatch", C_PM, "PM - the line is down for maintenance."),
    ("swatch", C_OT, "OT - a line marked OT. A Line Status of OT, Overtime or Trial in your file also shows as OT."),
    ("swatch", C_TINT["READY"], "Light green, blue or yellow LINE cell: the line has a READY, PM or OT status but "
                                "is not ticked."),
    ("swatch", C_SCHEDULED, "A ticked (Scheduled) line: green LINE cell and a thin green box around its rows."),
    ("swatch", C_LINE_REPEAT, "LINE name in bold black: the first work order of that line. In grey: more work "
                              "orders of the same line (so every printed page names its lines)."),
    ("swatch", C_COUNT_CHANGED, "Red bold Count = the count changed from the work order before it (S1 Count Change)."),
    ("swatch", C_DIVIDER, "Navy line under the last work order of each line."),
    ("gap",),
    ("head", "", "Changeover codes"),
    ("kv", "S1", "Same setup."),
    ("kv", "S1 Count Change", "The count differs."),
    ("kv", "S3", "The bulk item differs."),
    ("kv", "S4", "The bottle size differs."),
    ("text", "", "Each code is shown on the work order the changeover happens on. It is blank on the first work "
                 "order of a line, and when either Bottle Size is missing."),
    ("text", "", "% Actual Complete = % Complete / 100 (blank when % Complete is 0 or blank). Bottles Remaining = "
                 "WO Quantity x (1 - % Actual Complete), rounded."),
    ("gap",),
    ("head", "", "Something went wrong?"),
    ("kv", "The box on 2. Check Columns is red", "Read what it says. Line / WO # not found: Part A, the CAREFUL box "
                                                 "after step 5. Empty sheet: Part A, steps 2a to 4b. Capacity "
                                                 "warning: see Limits below."),
    ("kv", "The sheets look empty", "Click Enable Editing on the yellow bar at the top."),
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
                                           "says CHECK: WO twice at the top left)."),
    ("kv", "Red box: a row looks like column titles", "Yesterday's schedule is probably still on 1. Paste Schedule, "
                                                      "or today's file was pasted lower down than A1. Do Part A "
                                                      "again from step 2a."),
    ("kv", "A work order is missing", "On 1. Paste Schedule its Line must be filled in. Rows below a Line cell "
                                      "that says LEGEND are ignored. Exact duplicate rows are counted once."),
    ("kv", "Something is in the wrong column", "On 2. Check Columns pick the right column's title in that field's "
                                               "Override box (or - to leave it out)."),
    ("kv", "Excel says the cell is on a protected sheet", "Only the yellow cells take typing (on 2. Check Columns "
                                                          "and 3. Lines), plus all of 1. Paste Schedule. 4. Schedule "
                                                          "fills itself in - to change it, edit 1. Paste Schedule. "
                                                          "Never click Review > Unprotect Sheet."),
    ("kv", "Excel warns about a circular reference", "Names were pasted on 3. Lines with Ctrl+V. Press Ctrl+Z, then "
                                                     "paste them with Paste Options > Values (123), or type them."),
    ("kv", "Report typed on", "Something was typed over 4. Schedule, so it no longer fills itself in. Press Ctrl+Z "
                              "right away. If that does not fix it: close the file and click Don't Save, then open "
                              "it again. If it was already saved: File > Info > Version History (Teams / OneDrive / "
                              "SharePoint) and restore an earlier version - or copy the MASTER file again (First "
                              "time only) and type your lines on 3. Lines again."),
    ("kv", "The file says Read-Only or locked for editing", "Someone else has your shift's file open (on a network "
                                                            "drive only one person at a time can change it - your "
                                                            "ticks could not be saved). Close it, ask them to close "
                                                            "it, then open it again. On Teams / OneDrive several "
                                                            "people can edit it together."),
    ("kv", "A line can't be ticked", "Type its name in the left table of 3. Lines (Part B, step 2a)."),
    ("kv", "A line is ticked that nobody ticked", "On 3. Lines look for a red Note: a Scheduled or Status left in a "
                                                  "row whose Line was cleared is taken over by the next line typed "
                                                  "there. Clear Line, Scheduled and Status together."),
    ("kv", "A READY / PM / OT nobody picked", "It comes from the Line Status column of today's file. To remove it, "
                                              "pick NONE in that line's Status on 3. Lines."),
    ("kv", "CHECK: 3. Lines not dated today", "Check the ticks and statuses on 3. Lines (Part B), then put "
                                              "today's date in the yellow box there (Ctrl+;)."),
    ("kv", "WARNING: see 2. Check Columns", "The box on 2. Check Columns says what is wrong (see the first row of "
                                            "this list)."),
    ("kv", "The printout has no colors", "In the print window, check the printer is not set to black and white / "
                                         "draft. The STATUS words still print in black and white."),
    ("kv", "Blank pages, or rows missing", "The printout follows the schedule by itself - never use Page Layout > "
                                           "Print Area > Set Print Area. If it still goes wrong: on 4. Schedule "
                                           "select from cell A1 to column R of the last work order, press Ctrl+P "
                                           "and under Settings pick Print Selection."),
    ("kv", "Columns cut off", "In the print window keep Fit All Columns on One Page."),
    ("kv", "Long text", "Long product and cap descriptions, desiccants and line names get smaller to fit their "
                        "cell. Remarks show one line and stop at the cell edge (the web app's printout cuts them "
                        "too). To see more, make the column wider: drag the line between two column letters at the "
                        "top of 4. Schedule (double-click it to fit the text)."),
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
    ("kv", "Fit on one page", "In the print window, under Settings, change Fit All Columns on One Page to Fit Sheet "
                              "on One Page (the text gets smaller)."),
    ("kv", "Portrait or margins", "Portrait, margins and scaling can be changed in the print window for one "
                                  "printout. Keep Fit All Columns on One Page."),
    ("kv", "Hide a column", "On 4. Schedule right-click the column letter (for example L for REMARKS) > Hide. "
                            "To bring it back, select the columns on both sides (K to M), right-click > Unhide."),
    ("kv", "Make a column wider", "On 4. Schedule drag the line between two column letters. Double-click it to fit."),
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
                            "name on 3. Lines too."),
    ("kv", "Leave a whole line off", "On 1. Paste Schedule click a cell in the title row, then Data > Filter. "
                                     "With the arrow on the Line column show only that line, select its rows "
                                     "(click the row numbers) and press Delete. Then click Data > Filter again to "
                                     "turn the filter off. (Rows on 4. Schedule can't be hidden: its rows change "
                                     "every day, so a hidden row would hide another line's work order later.)"),
    ("kv", "Send the schedule as PDF", "With 4. Schedule open: File > Save As (on the web: Save a Copy / Export) "
                                       "and pick PDF. Email or post the PDF."),
    ("kv", "Send it as Excel", "Send this file (or File > Save a Copy). To send only the schedule: on 4. Schedule "
                               "select from A1 to column R of the last row, press Ctrl+C, open a new workbook, "
                               "right-click A1 > Paste Options > Values."),
    ("kv", "Seq order", "Numbers sort as numbers (6.5 goes between 6 and 7). A row with no Seq stays right after "
                        "the row above it of the same line. Seq values that are not numbers go after the numbered "
                        "ones, in the order they were pasted."),
    ("kv", "Long schedules", "The LINE name is bold on the first row of each line and grey on its other rows, so a "
                             "line that runs on to the next page is still named at the top of that page. Excel "
                             "can't keep a line's rows together on one page like the web app - use Fit Sheet on One "
                             "Page if that matters."),
    ("kv", "Limits", f"Up to {MAX_WO} work orders (the first {MAX_WO} under the column titles, in paste order), "
                     f"pasted rows 1 to {PASTE_ROWS}, columns A to BH, {LINE_SLOTS} lines on 3. Lines, {OUT_ROWS} "
                     f"rows on 4. Schedule. Past a limit, a red WARNING shows on 2. Check Columns and on "
                     f"4. Schedule."),
    ("kv", "Not like the web app", "The status is in its own STATUS column; the green box around a ticked line is "
                                   "thin (Excel can't draw a thick one by formula); the line name repeats in grey "
                                   "on a line's other rows (Excel can't keep a line on one page); long text shrinks "
                                   "to fit or (remarks) is cut at the cell edge with no ...; columns can be hidden "
                                   "but not moved; the Line and WO columns are found by their titles only; pasting "
                                   "a new schedule does not clear the statuses (Part B, step 4a does)."),
    ("kv", "Also not in this file", "The web app's Customize Print Design: the report title, the date, the fonts "
                                    "and the colors are fixed here. Line Assignments (and the app's Print > Both) "
                                    "is not part of this file. Export Excel: see Send it as Excel."),
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
ALLOWED = {"IF", "IFERROR", "AND", "OR", "NOT", "INDEX", "MATCH", "LOOKUP", "COUNTIF", "COUNTIFS", "SUMIF", "SUMIFS",
           "SUMPRODUCT", "ROW", "ROWS", "COLUMN", "COLUMNS", "MIN", "MAX", "SMALL", "LARGE", "ISNUMBER", "ISERROR",
           "ISBLANK", "ISTEXT", "LEN", "TRIM", "UPPER", "LEFT", "RIGHT", "MID", "SEARCH", "FIND", "SUBSTITUTE",
           "EXACT", "VALUE", "TEXT", "ROUND", "TODAY", "CHAR", "N", "T", "ABS", "INT", "MOD", "OFFSET"}


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
    if problems:
        raise SystemExit("Formula audit failed:\n" + "\n".join(problems[:50]))
    return len(texts)


def deterministic_zip(data):
    """Rewrite the package with fixed timestamps so rebuilds are identical."""
    src = zipfile.ZipFile(io.BytesIO(data))
    out = io.BytesIO()
    stamp = FIXED_TIME.strftime("%Y-%m-%dT%H:%M:%SZ")
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as dst:
        for info in src.infolist():
            body = src.read(info.filename)
            if info.filename == "docProps/core.xml":
                body = re.sub(rb"(<dcterms:(created|modified)[^>]*>)[^<]*", lambda m: m.group(1) + stamp.encode(), body)
            zi = zipfile.ZipInfo(info.filename, date_time=(1980, 1, 1, 0, 0, 0))
            zi.compress_type = zipfile.ZIP_DEFLATED
            zi.external_attr = 0o644 << 16
            dst.writestr(zi, body, compresslevel=9)
    return out.getvalue()


def main():
    wb = Workbook()
    build_how(wb)
    build_paste(wb)
    build_check(wb)
    build_lines(wb)
    build_schedule(wb)
    build_calc(wb)

    add_name(wb, "PASTE_ALL", f"{PASTE}!$1:$1048576")
    add_name(wb, "HEADER_ROW", f"{CHECK}!$E$6")
    add_name(wb, "HEADER_ROW_OVERRIDE", f"{CHECK}!$E$5")
    add_name(wb, "COL_OVERRIDES", f"{CHECK}!$F$13:$F$27")
    add_name(wb, "WO_COUNT", f"{CHECK}!$E$9")
    add_name(wb, "LINE_COUNT", f"{CHECK}!$E$10")
    last = 3 + LINE_SLOTS
    add_name(wb, "LINES_NAME", f"{LINES}!$A$4:$A${last}")
    add_name(wb, "LINES_SCHEDULED", f"{LINES}!$B$4:$B${last}")
    add_name(wb, "LINES_STATUS", f"{LINES}!$C$4:$C${last}")
    add_name(wb, "LINES_CHECKED_ON", f"{LINES}!$K$1")
    for name, col in [("SCHED_KIND", "T"), ("SCHED_HL", "U"), ("SCHED_SCHEDULED", "V"), ("SCHED_STATUS", "W")]:
        add_name(wb, name, f"{SCHED}!${col}$3:${col}${2 + OUT_ROWS}")

    wb.active = 0
    for ws in wb.worksheets:
        ws.sheet_view.tabSelected = ws.title == S_HOW
    wb.security = WorkbookProtection(lockStructure=True)
    wb.calculation.fullCalcOnLoad = True
    wb.properties.creator = "JDE Sched"
    wb.properties.title = "JDE Production Schedule"
    wb.properties.created = FIXED_TIME
    n = audit(wb)

    buf = io.BytesIO()
    wb.save(buf)
    OUT.write_bytes(deterministic_zip(buf.getvalue()))
    print(f"Wrote {OUT} ({OUT.stat().st_size // 1024} KB, {n} formulas audited)")


if __name__ == "__main__":
    sys.exit(main())
