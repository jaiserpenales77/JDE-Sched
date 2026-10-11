# LineUp: next update plan

Changes that are built and tested but not live yet. They wait on the
`claude/next-update` branch, so nobody sees them: only the
`claude/file-to-application-l25bre` branch deploys to the live app. When
it's time, ask Claude to run this plan, and everything below goes live
together.

## What's in the next update

Nothing yet.

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
