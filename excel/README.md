# JDE Production Schedule (Excel)

`JDE_Production_Schedule.xlsm` replaces the web app's **Production Schedule** tab with
a single Excel workbook - no app. It works in Excel 2010 and newer (Windows),
Excel for Mac and Excel on the web / Teams. Everything is worksheet formulas;
the macros only help. `JDENotes.FitNotes` (run by the workbook's events - no
button) hides the empty notes rows on 4. Schedule, so the work orders sit
right under each other. Before saving it shows them again (`JDENotes.Clean`)
and hides them after, so the saved file is the plain layout. `JDELines` runs
the buttons on 3. Lines (below). Without macros (Excel on the web, or Enable
Content not clicked) everything still works by hand: the buttons do nothing
and those thin rows stay.

## The buttons on 3. Lines

A row of buttons under the instructions (they don't print):

- **Guided setup** (green) asks step by step with Yes / No boxes: paste
  today's schedule (if it was just copied), checks 2. Check Columns is GREEN,
  the shift (1, 2 or 3) and the time (now, or typed), adds the lines missing
  from the list, then each line in today's schedule - RUNNING? (Yes: its crew;
  No: NOT SCHEDULED, PM / CLEANING, READY LINE, PARTIAL SHIFT or OVERTIME) -
  then the next shift (the same lines, or line by line), and offers to print.
  Cancel stops it; what was answered stays.
- **Paste today's schedule**: what was copied goes into 1. Paste Schedule as
  values (Paste Values), the rows and columns past it cleared; then it says
  whether 2. Check Columns is GREEN.
- **Add missing lines**: the lines of today's schedule that aren't in the list
  go in its empty rows (VPKL09 as LINE 9).
- **This shift: all RUNNING**: each line with work orders today that has no
  status yet gets RUNNING, the others NOT SCHEDULED; statuses already picked
  stay.
- **Next shift = this shift**, **Clear statuses** (this shift, next shift and
  crew - asks first), **Set time to now** (Schedule as of; the shift too when
  it's empty, by the clock on 5. Settings), **Print 4. Schedule** (warns first
  when 3. Lines shows a CHECK, then the Print dialog).
- Double-click a status: RUNNING / NOT SCHEDULED; Breaks & lunch: Yes / No;
  the yellow Schedule as of box: now.

Ctrl+Z can't undo a macro, so the buttons that would overwrite something ask
first. While a button works, Excel doesn't recalculate after every cell
(manual calculation, restored after). The buttons are shapes with an assigned
macro (`macro="[0]!GuidedSetup"` in the drawing) - in Excel, right-click one >
Assign Macro to see it.

It combines the app's report with the plant's **JDE Packaging Schedule** printout:
each line's status this shift and next shift, the crew (EE), progress dots,
the changeover type and minutes before each work order, and an estimated
finish time for every work order on a running line. The bottles per hour come
from the **Line Lead MDI Router** (Power BI), in `line_rates.csv`.

The daily job is three steps (load, set the lines, print); the first tab,
**How To Use**, walks through them:

| Tab | What it is |
| --- | --- |
| How To Use | Step-by-step instructions, how to read the schedule, changeover codes, tips |
| 1. Paste Schedule | Paste today's schedule file here at A1 (any layout; up to 1000 rows, columns A-BH). Ships with the work orders of the JDE Packaging Schedule printout of Oct 29, 2026 |
| 2. Check Columns | Which row holds the column titles and which column feeds each field, with Override cells, and the "Found N work orders on M lines" check |
| 3. Lines | This copy's shift and the time the schedule is from; per line: status this shift and next shift, breaks & lunch (Yes / No), crew. Buttons: Guided setup and one-step helpers |
| 4. Schedule | The printable JDE Packaging Schedule - fills itself in, protected |
| 5. Settings | Shift clock (1st shift start, break and lunch hours, their output), line efficiency, changeover minutes |
| 6. Line Rates | Bottles per hour by line and item (2,263 rows from the router; add or paste more) |
| 7. Washroom | The washroom attendants' prep list: every changeover expected this shift, first to last - fills itself in |
| 8. Products | The items of the router's work orders (292, in `products.csv`), to tick Oily or Powdery for 7. Washroom, and International or Domestic (filled in from the router) |

Everything on 2-4 is worksheet formulas: the import, grouping, Seq order,
changeover codes and highlights are ported from `src/importColumns.ts`,
`src/scheduleLogic.ts` and the print view. A hidden, protected **Calc** sheet
holds the machinery.

## 4. Schedule

- A title band with the shift (from 3. Lines), the date and the "as of" time,
  a one-line summary (lines by status, the minor and major changeovers from
  "as of" to the end of the shift, the next changeover), and
  three labelled legends: BORDER (line statuses), CHANGEOVER (changeover
  types) and HIGHLIGHT (row colors).
- Each line is a box with a border in its status color this shift, like the
  printout's border legend (RUNNING green, PARTIAL SHIFT orange, OVERTIME
  gold, READY LINE purple, PM / CLEANING blue, NOT SCHEDULED grey; navy with
  no status): in the middle of the box, its name in the LINE column with its
  status right under it in the same color, and on that row its status next
  shift at the right edge.
  A line that isn't scheduled prints in grey.
- PROGRESS / CHANGEOVER: ten dots and the % on the running work order; on the
  next ones the changeover type (Minor · S1, Minor · Count, MAJOR · S3,
  MAJOR · S4) in its color, with · INTL after it for an international work
  order (its item is International on 8. Products - filled in from the
  router, editable - or, for an item not on it, INTL / INTERNATIONAL in its
  description). LEFT / C.O.: bottles left (32.9k), then the
  changeover minutes.
- CAP as size-type (45-CRC), in bold orange when it differs from the work
  order before it (the app's Cap Change). CT in red bold on a count change.
- Under each work order, two thin notes rows, each one cell merged from SQ to
  EST. TIME, in 6.5 pt italics on cream. **Changeover Notes:** what the
  changeover into it changes from the work order before it: Cap / Count /
  Bottle Change (in one phrase, e.g. Cap & Bottle Change; Count Change only
  on an S1 Count Change), Add / Remove
  / Change Cotton, Add / Remove / Change Desiccant, Dumping for a dumping
  work order (bulk A662 / A624), and Prepare For INTERNATIONAL WO for an
  international one - only for changeovers that start before the
  end of the shift (the same ones the summary counts). Under it, on its own
  row, **Remarks:** and its remark. A long row shrinks to fit. Merged cells,
  font sizes and row heights can't follow the data, so both rows are there
  for every work order; the macro hides the empty ones (hidden column AU says
  which) when the file opens, when 4. Schedule recalculates or is opened, and
  before printing. The gap between two lines is the last work order's empty
  changeover notes row (kept), or a blank row when that work order has notes.
  The file's COT (cotton) column isn't printed as a column: Yes for Y / Yes /
  X, none for N / No / 0 / blank, else the file's value (Change Cotton
  (value)). 2. Check Columns shows the column it comes from, with an Override
  for a file that titles it differently. A desiccant of N / No / 0 / None
  counts as none.
- Row highlights as in the app, from WO to EST. TIME: allergen, oil, and dumping in light blue (bulk
  items A662 / A624).

## 7. Washroom

The washroom attendants' prep list: every changeover expected from Schedule
as of to the end of this copy's shift (other shifts may run other lines - the
same changeovers the summary on 4. Schedule counts), first to last, numbered,
with the totals on top (changeovers, oily / powdery parts, allergens, Cremer /
Merrill). Per changeover: the time; the line and its filler - Cremer (lines
1, 5, 9, 10, 12) or Merrill (3, 7, 8, 11), editable on 5. Settings; the
changeover type and its minutes; the work order coming off the line (its
parts are washed), its allergen (orange) and its type - **Oily** (a softgel) or **Powdery** (a tablet): the item's
tick on **8. Products**, else SG, LSG or S/G in the description (the oily
words on 5. Settings, where more can be added; they don't change 4.
Schedule's Oil highlight);
the work order going on and its type; and a **DONE** box to tick with a pen
on the walk. The
times are 4. Schedule's estimated times, so only running lines with a line
rate are listed.

## Estimated times

For a line that is RUNNING, PARTIAL SHIFT or OVERTIME, the work orders are
added up in Seq order from **Schedule as of** (3. Lines): each one's
changeover minutes (5. Settings: S1 15, count change 15, S3 40, S4 45) plus
its bottles left / (bottles per hour from 6. Line Rates x line efficiency).
Lines 8 to 12 run through breaks and lunch, so an hour is an hour. Lines 1, 3,
4, 5 and 7 (Breaks & lunch = Yes on 3. Lines) slow down in the break hours
(hours 2 and 6 of the shift: 6/7 of an hour's bottles, the router's Break
(15 min) rate) and the lunch hour (hour 4: 4/7, its Lunch (30 min) rate). The
shifts start at 7:15 AM, 3:15 PM and 11:15 PM. A line and item missing from
6. Line Rates shows "no rate".

The times were checked against an independent hour-by-hour simulation for
several "as of" times (start of shift, inside a break, inside lunch, late
evening).

## Use

Sheets are protected without a password (and the workbook structure is locked
so tabs can't be deleted by accident). Users should never unprotect them: an
overtyped cell on 4. Schedule stops filling itself in (a red warning at the
top of 4. Schedule says so). To change the workbook, edit the script below.

Keep **one copy per shift** in a shared folder and reopen that copy every day:
the 3. Lines list, the statuses and crews (with the "as of" date), the column
overrides and the settings are saved in it. Keep the original next to them as
a clean master. The printout's footer shows the file name.

`JDE_Production_Schedule_DEMO.xlsm` is the same workbook set up for a
presentation: the printout's statuses and crews, 1st shift, as of 5:15 AM
today, opening on 4. Schedule. Don't use it for real work - start from the
main file.

## Regenerate

The workbook is generated - don't edit it by hand and commit it, edit the script:

```sh
python3 excel/build_workbook.py      # from the repo root; needs Python 3 + openpyxl
python3 excel/build_workbook.py --demo   # JDE_Production_Schedule_DEMO.xlsm: ready to present
```

The build is deterministic (same script, same bytes) and checks every formula
against the Excel 2007 function whitelist before saving. The Calc sheet layout
and all defined names are documented at the top of `build_workbook.py`. The
macros' source is in `build_workbook.py` (VBA_MODULE, VBA_LINES, VBA_THISWORKBOOK);
`vba_project.py` writes it into the file's vbaProject.bin (standard library
only: [MS-OVBA] compression and a [MS-CFB] compound file; no compiled code, so
Excel compiles the source when it opens the file). The macros are not signed;
the buttons are a DrawingML drawing added to 3. Lines (`button_drawing`).
`products.csv` (8. Products) is the items of the router's work order table
(Merge1, work orders 2024-2026): ITEM, DESCRIPTION, the bulk descriptions,
the dosage form from tProduct (Attribute16), a suggestion (Oily when the form
is a softgel or the item's or its bulk's description has SG / LSG / S/G), the
market from tProduct (Attribute08: International when any line has it so,
else Domestic; empty for an item not in tProduct), the number of work orders
and the latest one.
`line_rates.csv` (LINE, ITEM, DESCRIPTION, BOTTLES PER HOUR, SOURCE) is the
Router BPH of each line and item from the router's tProduct table, or the JDE
router rate (10000 / JDE_Router) where there is no Router BPH.

## Known differences

From the web app:

- One status per line (This shift on 3. Lines) instead of a Scheduled tick
  plus READY / PM / OT. The file's Line Status column (Ready, PM, OT /
  Overtime / Trial) is used when This shift is empty; with neither, the line
  is NOT SCHEDULED (it runs only when marked RUNNING / Yes); NONE removes the
  status. Next shift: empty is NOT SCHEDULED too.
- Lines are matched by their number: VPKL05 in the file, LINE 5 on 3. Lines
  and LINE05 on 6. Line Rates are the same line. The name typed on 3. Lines is
  the one printed.
- The Line and WO # columns are found by their titles only (the app also
  guessed them from the values); use the Override cells on 2. Check Columns.
  An Override is the column's title (picked from its drop-down), `-` (leave
  the field out) or a column letter - a title keeps working when the columns
  move. While no work order is found, the Example columns there show the first
  filled row under the titles, so the Line column can be spotted.
- Column titles are normalized by removing ASCII punctuation and spaces, tab /
  line breaks and the common non-ASCII ones (dashes, curly quotes, the numero
  sign, degree / ordinal signs, bullets, zero-width and special spaces).
  Accented letters and rarer symbols stay in (the app drops them), so such a
  title may need an Override.
- Seq values that are not numbers sort after the numbered ones, in paste order
  (the app compares them as text). Hex text such as `0x10` is not read as a
  number (JS `Number()` reads it as 16).
- The LINE name is shown once, in the middle of each line's box. The app also
  keeps each line on one page; Excel can't, so a line that runs on to the next
  page has its name on one of the pages only. Columns can be hidden but not
  reordered.
- A value too long for its column shrinks to fit (so nothing is cut off and no
  number turns into ####). Column widths are sized for real Excel, which gives
  text fewer pixels than LibreOffice; nothing on the report but the notes rows
  (6.5 pt) is smaller than 8 pt (Excel draws smaller Calibri without
  ClearType, much wider).
- No conditional format changes a number format (in real Excel one meant for
  one column leaked into the next).
- Excel's TRIM also turns runs of spaces inside a value into one space, and a
  tab or line break inside a value becomes a space; rows that differ only in
  such inner spaces count as duplicates.
- Numbers stored as text (Seq `6.5`, % Complete `79.34`) are read with `.` as
  the decimal point on every computer, like the app - whatever the Windows /
  Mac regional settings.
- Statuses live on 3. Lines, so pasting a new schedule doesn't clear them (the
  app clears statuses on import). The "Schedule as of" date makes stale ones
  show a red CHECK message until it is today's.
- No Customize Print Design: the title, fonts and colors are fixed (portrait,
  margins and scaling can be changed in the print window). Line Assignments is
  not part of this file.
- Header-row and column overrides replace the app's remembered column choices;
  they stay in the file (a Note says when one differs from what the file
  would find by itself, or when a letter gives a field the titles don't).
- Checks the app doesn't need (its Import replaces the whole schedule; here a
  paste can leave old rows behind): 2. Check Columns turns red when a WO # is
  on two kept rows, or when a kept row looks like a row of column titles, and
  the top of 4. Schedule says so too. Rows of 4. Schedule can't be hidden
  (they hold other work orders on another day); columns can.
- Limits (a red warning shows when exceeded): 600 work orders (the first 600
  rows with a Line, in paste order), pasted rows 1-1000, columns A-BH, 100
  lines on 3. Lines, 700 work orders and blank rows between lines on 4.
  Schedule, 5000 rows on 6. Line Rates.

From the JDE Packaging Schedule printout:

- HOT WO and twin pack are not shown: the schedule file has no column for
  them. COT (cotton) shows in the Changeover Notes instead of a column.
- The estimated times come from the router rates, so they differ from the
  printout's (which were made another way). Line efficiency on 5. Settings can
  bring them closer.
- Line 4 isn't on the printout; it is set to Breaks & lunch = Yes. A count
  change is set to 15 minutes, like a Minor S1.
