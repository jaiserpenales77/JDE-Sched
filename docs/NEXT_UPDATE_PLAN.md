# LineUp: next update plan

Changes that are built and tested but not live yet. They wait on the
`claude/next-update` branch, so nobody sees them: only the
`claude/file-to-application-l25bre` branch deploys to the live app. When
it's time, ask Claude to run this plan, and everything below goes live
together.

## What's in the next update

### 1. Crew count on the printed Line Assignments

Each line's printed header shows the same 👥 badge as the page on screen:
people assigned, and the ZBS number when the line has one (for example
"7/5", "0/6", or "0" for PTP). It works with custom box positions and the
regular layout.

- A box in Customize Print Design (Line Assignments) turns it off:
  **Show the 👥 crew count on each line (people / ZBS)**. It starts ticked
  for every shift.
- It never makes a box taller or the page smaller. If a line's name and
  the badge don't both fit in a narrow box, the badge prints without its
  icon; if even that doesn't fit, that one line prints without the badge,
  so no name gets pushed out of its box.
- The ⚠ warnings on screen don't print.

**Needs outside the app:** nothing (no rules or logins).

**How to check:** print Line Assignments. Each line's dark (or gray) name
bar has a white badge at the right with the same numbers as the 👥 badges
on the page above. Untick the box in Customize Print Design and print
again: the badges are gone.

**Job Instruction:** none (the Job Instruction covers the Production
Schedule tab).

**Announcement:** "The printed Line Assignments now show each line's crew
count (people / ZBS), the same as the 👥 badge on screen. To leave it off,
untick it in Customize Print Design on the Line Assignments tab."

---

## Running the update

| # | Step | Who | Time |
|---|------|-----|------|
| 1 | Bring in anything newer from the live app, then re-run the checks and browser tests | Claude | 10 min |
| 2 | Update the Job Instruction, if the update changes what people do | Claude | 10 min |
| 3 | Release it | Claude | 2–15 min |
| 4 | Check the new version (each item lists what to look at) | You | 5 min |
| 5 | Send the announcement (written with each item) | You | – |

## If something goes wrong

Claude puts the previous version back, and it's live again in a few
minutes.

## Adding to this plan

Each new change is built and tested on this branch first, then added
under "What's in the next update": what changes for people, anything it
needs outside the app (rules, logins), how to check it, and what to do
once it's live.

---

## Released

### 2026-10-15: "Cap Change" in Remarks

When a work order's cap differs from the cap of the work order before it
on the same line, its blank Remarks shows **Cap Change**: gray on screen,
printed, and in Export Excel. Anything typed in Remarks wins, and nothing
is saved, so it follows the caps and Seq order. Nothing changed in
Firebase. The Job Instruction (Rev. 2026-10-15) has a new Extras step 8.

### 2026-10-11: holiday themes start on Automatic

Every shift's Holiday theme moved to Automatic once (including shifts the
earlier update saved as Off), so from October 15 the printout shows the
Halloween theme by itself. A shift that picks Off or one theme after that
keeps it, and Reset to defaults gives Automatic. Nothing changed in
Firebase.

### 2026-10-11: print titles, designs and holiday themes

1. **Shorter column titles on the printout** (CT, BTL SIZE, ALLRG, WO QTY,
   BTLS LEFT), each changeable in Customize Print Design. **Fit all
   columns** and double-clicking a column's edge can now narrow a column,
   and fit for the printed page.
2. **Choose a design** in Customize Print Design: Classic (the default),
   Clean grid, Line bands or Striped table.
3. **Holiday themes:** Off (the default), Automatic, or one of 12 themes,
   with a scene under the schedule when there's room.

Nothing changed in Firebase. The Job Instruction (Rev. 2026-10-11) has
four new Extras: fit the columns, change a printed title, choose a
design, and turn on a holiday theme.

**Once it's live, each shift:** clicks **Fit all columns** in the Print
Report Preview once, and picks its design and holiday theme in Customize
Print Design if it wants them.
