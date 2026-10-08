# JDE Production Schedule (Excel)

`JDE_Production_Schedule.xlsx` replaces the web app's **Production Schedule** tab with
a single Excel workbook - no app, no macros. It works in Excel 2010 and newer
(Windows), Excel for Mac and Excel on the web / Teams.

The daily job is the same three steps as in
`docs/Production_Schedule_Job_Instruction.pdf`; the first tab, **How To Use**, walks
through them:

| Tab | What it is |
| --- | --- |
| How To Use | Step-by-step instructions, color legend, changeover codes, tips |
| 1. Paste Schedule | Paste today's schedule file here at A1 (any layout; up to 1000 rows, columns A-BH). Ships with the app's sample work orders |
| 2. Check Columns | Which row holds the column titles and which column feeds each field, with Override cells, and the "Found N work orders on M lines" check |
| 3. Lines | Tick the lines running this shift (Scheduled = Yes) and mark READY / PM / OT |
| 4. Schedule | The printable Production Line Schedule - fills itself in, protected |

Everything on 2-4 is worksheet formulas ported from `src/importColumns.ts`,
`src/scheduleLogic.ts` and the print view (`src/components/PrintViews.tsx`,
`src/App.css`). A hidden, protected **Calc** sheet holds the machinery.

Sheets are protected without a password (and the workbook structure is locked
so tabs can't be deleted by accident). Users should never unprotect them: an
overtyped cell on 4. Schedule stops filling itself in (a red warning at the
top of 4. Schedule says so). To change the workbook, edit the script below.

Keep **one copy per shift** in a shared folder and reopen that copy every day:
the 3. Lines list, the ticks and statuses (with the date they were checked)
and the column overrides are saved in it. Keep the original next to them as a
clean master. The printout's footer shows the file name, so it says which
shift's copy was printed.

## Regenerate

The workbook is generated - don't edit it by hand and commit it, edit the script:

```sh
python3 excel/build_workbook.py      # from the repo root; needs Python 3 + openpyxl
```

The build is deterministic (same script, same bytes) and checks every formula
against the Excel 2007 function whitelist before saving. The Calc sheet layout
and all defined names are documented at the top of `build_workbook.py`.

## Known differences from the web app

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
- The status (READY / PM / OT) is in its own STATUS column; the box around a
  scheduled line is a thin green border plus a green LINE cell (Excel can't draw
  a thick border by formula). Columns can be hidden but not reordered.
- The LINE name is bold black on the first row of each line and repeated in
  grey on its other rows. The app prints it once per line, but it also keeps
  each line on one page; Excel can't, so the grey repeats make sure a line
  that runs on to the next page is still named there.
- A value too long for its column shrinks to fit (so nothing is cut off and
  no number turns into ####); only long remarks are cut at the cell edge (the
  app cuts all of them and adds "...").
- Column widths are sized for real Excel, which gives text fewer pixels than
  LibreOffice: every column fits the longest word of its title in 9 pt bold and
  a typical value (an 8-character item or bulk code, a 6-digit quantity) in
  8.5 pt. The cap description column fits a usual cap description without
  shrinking; REMARKS gives up the room (it is cut at the edge anyway).
- Fonts are sized for "fit all columns on one page" (about 80 %), so the body
  prints close to the app's 7 pt. Nothing on the report is smaller than
  8.5 pt (titles are 9 pt bold): Excel draws Calibri below about 8 pt without
  ClearType and with much wider letters, which broke 7 pt titles mid-word.
  The widths are sized for 100 % zoom; a value too long for its column can
  still shrink below 8.5 pt to fit.
- No conditional format changes a number format (Excel applied one meant for
  % ACTUAL COMPLETE to BOTTLES REMAINING); a blank % ACTUAL COMPLETE on a
  work-order row holds the text "—" instead.
- Excel's TRIM also turns runs of spaces inside a value into one space, and a
  tab or line break inside a value becomes a space; rows that differ only in
  such inner spaces count as duplicates.
- Numbers stored as text (Seq `6.5`, % Complete `79.34`) are read with `.` as
  the decimal point on every computer, like the app - whatever the Windows /
  Mac regional settings.
- Statuses and ticks live on 3. Lines by line name, so pasting a new schedule
  doesn't clear them (the app clears statuses on import). A "checked on" date
  on 3. Lines makes stale ones show a red CHECK message until it is today's.
  Status NONE removes a READY / PM / OT that comes from the file's Line Status
  column (the app: click the lit button again).
- No Customize Print Design: the report title, date, fonts and colors are
  fixed (portrait, margins and scaling can be changed in the print window).
  Line Assignments is not part of this file.
- Header-row and column overrides replace the app's remembered column choices;
  they stay in the file (a Note says when one differs from what the file
  would find by itself, or when a letter gives a field the titles don't).
- Checks the app doesn't need (its Import replaces the whole schedule; here a
  paste can leave old rows behind): 2. Check Columns turns red when a WO # is
  on two kept rows, or when a kept row looks like a row of column titles, and
  the top left of 4. Schedule says so too. Rows of 4. Schedule can't be hidden
  (they hold other work orders on another day); columns can.
- Limits (a red warning shows when exceeded): 600 work orders (the first 600
  rows with a Line, in paste order), pasted rows 1-1000, columns A-BH, 100
  lines on 3. Lines, 700 rows on 4. Schedule.
