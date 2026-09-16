# JDE Sched

A web app version of the "JDE Sched" production scheduling spreadsheet
(`JDE_Sched_FINAL_v1.8.xlsm`), rebuilt as a React single-page app so the
schedule, shift board, and skills roster no longer depend on Excel macros.

## What it replaces

The original workbook had three jobs, now one tab each in the app:

- **Production Schedule** — work orders per production line. % Actual
  Complete, Bottles Remaining, and the changeover code (S1 / S1 Count
  Change / S3 / S4) are calculated automatically, same formulas as the
  spreadsheet. Allergen, "oil" product, and bulk-item (A662/A624) rows are
  highlighted automatically, and rows stay grouped by line as you add or
  reorder them — no more running "Add Line Dividers" by hand.
- **Line Assignments** — a daily shift/crew board (who's running which
  line, PTO/sick lists, training plan, etc.), with a button to duplicate
  today's board into a new day, replacing the `DuplicateTabWithDate` macro.
- **Skills & Roles** — the employee skills matrix and per-line/per-supervisor
  team rosters, computed live instead of copy-pasted into separate columns.

## Data & backup

Everything is saved automatically to your browser's local storage — no
server, no login. Because that only lives in one browser:

- **Backup (JSON)** downloads a full snapshot you can keep or move to
  another device; **Restore Backup** loads one back in.
- **Export Excel** / **Import Excel** on the Production Schedule tab read
  and write an `.xlsx` file shaped like the original template, for sharing
  with people who still want a spreadsheet.
- **Reset to sample data** restores the example schedule/roster that shipped
  with this app; **Wipe all data** clears everything.

## Development

```bash
npm install
npm run dev      # start the dev server
npm run build     # type-check and build for production
```

Built with Vite + React + TypeScript. Spreadsheet import/export uses
[SheetJS (`xlsx`)](https://www.npmjs.com/package/xlsx); note the npm
registry's latest published build (0.18.5) predates two known parser
advisories (prototype pollution / ReDoS) that SheetJS has since fixed in
builds only distributed from their own CDN. Risk is limited here because
the app only ever parses spreadsheet files the user opens themselves in
their own browser, not files from a server or untrusted source.
