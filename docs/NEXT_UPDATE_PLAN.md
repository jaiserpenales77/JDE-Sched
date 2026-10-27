# LineUp: next update plan

Changes that are built and tested but not live yet. They wait on the
`claude/next-update` branch, so nobody sees them: only the
`claude/file-to-application-l25bre` branch deploys to the live app. When
it's time, ask Claude to run this plan, and everything below goes live
together.

## What's in the next update

### 1. Pick a lead for a line (Line Assignments)

A line's side panel has a **Line lead** box, under its crew. It starts on
**From Skills & Roles** (as today: whoever is a Line Leader, MLL or MLT on
the roster is highlighted). Picking someone from the line's crew makes
them that line's Line Leader:

- they're green and at the top of the crew (after any MLL), on the page,
  in the panel and on the printout;
- anyone else the roster calls a Line Leader is ordinary crew on that line
  (other lines are unchanged); MLL and MLT stay as they are, and picking
  an MLL keeps them an MLL;
- the line's "No MLL or Line Lead" warning goes away.

The pick is saved with the line, carries over to a new day's board copied
from this one, and moves with Transfer team. If the lead leaves the line
or is marked as training, the line goes back to Skills & Roles.

**Needs outside the app:** nothing.

**How to check:** click a line, pick someone under Line lead: their name
turns green and moves to the top, on the page and the printout. Pick
"From Skills & Roles" to undo.

**Announcement:** "On Line Assignments you can now pick a line's lead:
click the line and choose under 'Line lead'. They're shown in green at the
top of the crew, on screen and on the printout."

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

### 2026-10-21: crew counts, training on the line, crew count designs (Line Assignments)

1. **Crew count badges:** each line shows its crew against the ZBS (👥 4/4)
   on the page and the printout: light red when a scheduled line is over or
   under its ZBS, grey when it isn't running. Duty boxes can have one too
   (tick "Show a 👥 crew badge on this box"; People needed or a "Min 2" in
   the title). Customize Print Design turns the printed badges off. A
   badge never cuts off a name: it drops its icon, lets the title wrap
   when the box has room, or is left off that box.
2. **Training on the line:** mark people on a line as training, and on
   what (starting from their IP skill). They're listed last under a gold
   "TRAINING · CREMER" row, and the badge shows them as a gold "+1🎓" half
   instead of counting them in the ZBS.
3. **Crew count design picker** in Customize Print Design: Badge (the
   starting choice), Badge + bubble, ZBS blocks, Badge only.

Nothing changed in Firebase. The Job Instruction covers the Production
Schedule tab, so it stays at Rev. 2026-10-15.

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
