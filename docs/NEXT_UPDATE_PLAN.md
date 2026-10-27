# LineUp: next update plan

Changes that are built and tested but not live yet. They wait on the
`claude/next-update` branch, so nobody sees them: only the
`claude/file-to-application-l25bre` branch deploys to the live app. When
it's time, ask Claude to run this plan, and everything below goes live
together.

## What's in the next update

### 1. Overtime from the other shifts' names (Line Assignments)

In a line's side panel, with **⏱ Overtime** picked under "Training,
dumping & overtime", the list is **From another shift…**: the other
shifts' people, grouped in shift order (1st Shift, 2nd Shift, 3rd Shift,
leaving out your own) and A–Z inside each. Picking a name adds them to
the line under the light green OVERTIME row, counted toward the ZBS, with
"From 2nd Shift" under their name in the panel. Their ✕ takes them off
the line (they aren't on this shift's crew). Training and Dumping still
pick from the line's own crew, and someone from this shift can still be
switched to Overtime from their row.

How the names get there: each shift shares **only its people's names**
(as shown on Line Assignments) in a small shared list, kept up to date
whenever someone on that shift opens LineUp. Schedules, boards, time off
and skills stay private to each shift. A shift can change only its own
list, and Packaging Lead Hub accounts can't read them.

**Needs outside the app (you, about 2 minutes, before or right after the
release):** publish the updated database rules. In the Firebase console
(project jde-schedule-database): **Firestore Database → Rules**, replace
everything with the contents of `firestore.rules` from this branch (Claude
can paste it for you in chat), then **Publish**. The only change is the new
`jde-sched-names` block. Until the rules are published, the overtime list
says "No other shift's names yet" and nothing else is affected.

**After it's live:** each shift's names show up for the others once
someone on that shift opens LineUp (unlocks it) once.

**How to check:** on 3rd shift, click a line, pick ⏱ Overtime: the list
shows 1st Shift and 2nd Shift names A–Z (once those shifts have opened
LineUp). Pick one: they're under OVERTIME on the line and in the count.

**Announcement:** "Line Assignments: for overtime, pick ⏱ Overtime in the
line's side panel and choose the person from the other shifts' names
(grouped by shift, A–Z). They're added to the line and counted toward the
ZBS."

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

### 2026-10-27 (later): overtime counts toward the ZBS (Line Assignments)

People marked **Overtime** fill the line's ZBS spots: they're in the 👥
count, the light red over/under check and the "Short" warning, and their
spots fill in light green in the ZBS blocks design. They keep their light
green OVERTIME row; the badge only shows a "+1" for Training and Dumping,
which stay on top of the ZBS. The side panel's section is now called
**Training, dumping & overtime**. Overtime marks saved earlier count from
now on. Nothing changed in Firebase, and the Job Instruction stays at
Rev. 2026-10-15.

**Announcement:** "Line Assignments: people marked Overtime now count
toward the line's ZBS. Training and Dumping are still extra."

### 2026-10-27: line lead pick, extra people for training, dumping or overtime (Line Assignments)

1. **Pick a lead for a line:** a line's side panel has a **Line lead** box
   (starting on From Skills & Roles). The person picked is that line's
   Line Leader, green at the top of the crew (after any MLL), on the
   page and the printout; anyone else the roster calls a Line Leader is
   ordinary crew on that line, and its "No MLL or Line Lead" warning goes
   away. The pick moves with Transfer team and a copied day.
2. **Extra people on a line:** "Training on this line" became **Extra
   people on this line**: Training (gold, with what they're training on),
   Dumping (light blue) or Overtime (light green). They're listed after
   the crew under their own colored row, the 👥 badge shows a "+1" in each
   kind's color (bubbles and ZBS blocks too), and none of them count
   against the ZBS or can be the line's lead. People marked as training
   before stayed training.

Nothing changed in Firebase. The Job Instruction covers the Production
Schedule tab, so it stays at Rev. 2026-10-15.

**Announcement:** "On Line Assignments you can now pick a line's lead
(click the line, 'Line lead'), and mark extra people on a line as
Training, Dumping or Overtime ('Extra people on this line'). Extra people
are listed under their own colored row and don't count against the ZBS."

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
