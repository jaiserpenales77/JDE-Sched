# LineUp: next update plan

Changes that are built and tested but not live yet. They wait on the
`claude/next-update` branch, so nobody sees them: only the
`claude/file-to-application-l25bre` branch deploys to the live app. When
it's time, ask Claude to run this plan, and everything below goes live
together.

## What's in the next update

### 1. Crew count badges on Line Assignments (lines and duty boxes)

Each line's printed header shows the same 👥 badge as the page on screen:
people assigned, and the ZBS number when the line has one (for example
"7/5", "0/6", or "0" for PTP). It works with custom box positions and the
regular layout.

- **Colors, on the printout and on screen:**
  - **light red** when a scheduled line has fewer or more people than its
    ZBS number (a range like "ZBS -5/6" allows 5 or 6);
  - **grey** on lines that aren't running (Not Scheduled or PM), so their
    "0/6"-style counts don't stand out;
  - **white** otherwise, including scheduled lines with no ZBS number.
- On screen this is the 👥 badge on the page and the Crew count in a
  selected line's panel. A line with the right count but no MLL or Line
  Lead keeps its amber ⚠ badge on screen. The ⚠ warnings don't print.
- **Duty boxes (Room & Duty), when you want them:** click a duty box and
  tick **Show a 👥 crew badge on this box** in its panel. Optionally type
  **People needed**; a "Min 2" in the box's title counts too. The badge is
  light red when the box has fewer people than it needs, grey when nobody
  is on it and it needs no one, white otherwise. "Jessica & Debbie" counts
  as two. The choice is saved with the box, so it carries over to new
  days, like the box's colors.
- A box in Customize Print Design (Line Assignments) turns the printed
  badges off: **Show the 👥 crew counts on lines (people / ZBS) and on duty
  boxes that have one**. It starts ticked for every shift.
- The badge never cuts anything off. If a title and its badge don't both
  fit, the badge first drops its icon; then the title wraps onto a second
  line if its box still shows everything; only if it wouldn't is the badge
  left off that box. The page never gets smaller.

**Needs outside the app:** nothing (no rules or logins).

**How to check:** print Line Assignments. Each line's name bar has a badge
at the right with the same numbers as the 👥 badges on the page above:
light red on a scheduled line over or under its ZBS, grey on lines that
aren't running, white on the rest. The badges on the page have the same
colors. Click a duty box (Wash Room), tick "Show a 👥 crew badge on this
box": its badge shows on the page and prints. Untick the box in Customize
Print Design and print again: the badges are gone.

**Job Instruction:** none (the Job Instruction covers the Production
Schedule tab).

**Announcement:** "Line Assignments now print each line's crew count
(people / ZBS), the same as the 👥 badge on screen. On both, it turns light
red when a scheduled line has more or fewer people than its ZBS, and it's
greyed out on lines that aren't running. Duty boxes can have one too:
click the box and tick "Show a 👥 crew badge on this box". To leave the
badges off the printout, untick them in Customize Print Design on the Line
Assignments tab."

### 2. Training shown on the line

Instead of a separate "Cremer Training" box, the person training is marked
on their line. They're listed last in the line's box, under a gold
**🎓 TRAINING · CREMER** row, with their name in light gold, on the page
and on the printout. The line's 👥 badge becomes one two-tone pill: the
crew in its usual color (white, light red or grey) and a gold **+1🎓** half.
People training aren't counted in the ZBS, so a full crew plus a trainee
isn't light red for overstaffing.

- **To mark someone:** click the line. In its panel, under **🎓 Training on
  this line**, pick them from **Mark someone on this line as training…**.
  **On what?** starts as the skill they're marked IP on in Skills & Roles
  (Cremer for Adriana Martin) and can be changed to anything ("MLL", ...).
  ✕ puts them back in the crew.
- They stay on the line everywhere else in the app (Unassigned, search,
  out-today checks). Transfer team brings the training marks along, and a
  new day's board copied from this one keeps them, like the crew.
- A lead who is training doesn't count as the line's MLL or Line Lead.
- The gold row adds one row to the box: if a box with a custom position is
  full, drag it a little taller (the old Cremer Training box's spot is
  free).

**Needs outside the app:** nothing (no rules or logins).

**How to check:** on Line Assignments, click a line, mark someone as
training. They move to the bottom under the gold Training row, and the
badge is one pill with a gold +1🎓 half. Print: same. Delete the old Cremer
Training box if it's no longer needed.

**Job Instruction:** none (the Job Instruction covers the Production
Schedule tab).

**Announcement:** "Training now shows on the line itself: click the line,
pick the person under 'Training on this line'. They're listed last under a
gold TRAINING row, on screen and on the printout, and the crew count shows
them as +1 instead of counting them in the ZBS. The separate Cremer
Training box isn't needed anymore."

### 3. Pick how lines show their crew and ZBS

Customize Print Design (Line Assignments) has a **Crew count design**
picker, for the page on screen and the printout:

- **Badge** (the starting choice for every shift): the 👥 badge in the name
  bar, with a gold "+1🎓" half for people training; the ZBS row below.
- **Badge + bubble:** the same badge, with training as a gold "+1" bubble
  on its corner.
- **ZBS blocks:** no badge. The ZBS row shows a block per ZBS spot (white =
  filled, outlined = open, red = more than the ZBS), then crew/ZBS (light
  red when off) and the gold "+1🎓". Lines without a ZBS show their note
  and 👥 count. On screen a line's ⚠ stays at the end of the row.
- **Badge only:** the badge, without the ZBS row: one more row for names.
  A note that says more than the ZBS ("PTP") keeps its row.

Same colors in every design: light red when a scheduled line is off its
ZBS, grey when it isn't running, gold for training. The ZBS is still typed
the same way, in the line's Note.

**Needs outside the app:** nothing.

**How to check:** in Customize Print Design on Line Assignments, click each
design: the page above changes, and so does the printout.

**Announcement:** "You can now pick how each line shows its crew and ZBS on
Line Assignments: Badge, Badge + bubble, ZBS blocks, or Badge only. It's
under Customize Print Design on the Line Assignments tab."

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
