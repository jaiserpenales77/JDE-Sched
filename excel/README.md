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
and the column overrides are saved in it.

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
- Seq values that are not numbers sort after the numbered ones, in paste order
  (the app compares them as text). Hex text such as `0x10` is not read as a
  number (JS `Number()` reads it as 16).
- The status (READY / PM / OT) is in its own STATUS column; the box around a
  scheduled line is a thin green border plus a green LINE cell (Excel can't draw
  a thick border by formula). Columns can be hidden but not reordered.
- The LINE name is on the first row of each line only; Excel can't keep a
  line's rows together on one page or repeat the name after a page break.
- Long text is cut at the cell edge (the app adds "...").
- Excel's TRIM also turns runs of spaces inside a value into one space, and a
  tab or line break inside a value becomes a space; rows that differ only in
  such inner spaces count as duplicates.
- Statuses and ticks live on 3. Lines by line name, so pasting a new schedule
  doesn't clear them (the app clears statuses on import). A "checked on" date
  on 3. Lines makes stale ones show a red CHECK message until it is today's.
- Header-row and column overrides replace the app's remembered column choices;
  they stay in the file (a Note says when one differs from what the file
  would find by itself).
- Limits (a red warning shows when exceeded): 600 work orders (the first 600
  rows with a Line, in paste order), pasted rows 1-1000, columns A-BH, 100
  lines on 3. Lines, 700 rows on 4. Schedule.
