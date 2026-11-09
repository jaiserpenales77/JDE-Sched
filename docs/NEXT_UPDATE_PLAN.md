# LineUp: next update plan

Changes that are built and tested but not live yet. They wait on the
`claude/next-update` branch, so nobody sees them: only the
`claude/file-to-application-l25bre` branch deploys to the live app. When
it's time, ask Claude to run this plan, and everything below goes live
together.

## What's in the next update

### The Production Schedule in the JDE Schedule workbook's look

1. **New printout design, Line boxes (now the default):** each line is a
   box in the color of its status (Running, Partial shift, Overtime, Ready
   line, PM / Cleaning, Not scheduled), with the line's name and status on
   the left and next shift's status on the right. Every work order shows a
   progress bar (or Not Started Yet), bottles left, the changeover into it
   (Minor · S1 / Count, MAJOR · S3 / S4, with minutes and INTL), a new cap
   in orange, the crew (EE) and an estimated time. Changeover notes (cap,
   count, bottle, cotton, desiccant, dumping, international) and remarks
   go on a line under the work order. At the top: the shift, the date and
   "as of" time, the lines by status, the minor and major changeovers left
   before the end of the shift, and the next one. **Holiday themes** work
   on it too: the theme's color on the title bar, the band under it and
   the column titles, its icons by the title and in a strip, its greeting
   by the date, and its scene under the schedule when there's room (the
   status colors never change; the washroom list stays plain). Classic,
   Clean grid, Line bands and Striped are still in Customize Print Design,
   and they now take their green boxes and READY / PM / OT tags from the
   statuses.
2. **Lines panel** (in place of Scheduled Lines): each line's status this
   shift and next as colored buttons in the printout's colors (Running,
   Partial, OT, Ready, PM, Off: one click; a status that's automatic, not
   picked, has a dashed outline), a Yes / No switch for whether it stops
   for breaks and lunch (lines below 8 do), and its crew with − / +;
   **Schedule as of** with 🕒 Set to now; and the buttons This shift: all
   Running, Next shift = this shift and Clear statuses. Statuses stay from day to day, so until Schedule as of is
   today the printout shows a red **CHECK** in place of its summary (also
   for a WO on two rows). Lines ticked under the old Scheduled Lines start
   as Running. Each line's header on the tab has the same status picker.
3. **Estimated times on every work order** of a running line, the
   workbook's way: from Schedule as of, each changeover's minutes, then
   the bottles left at the Hub's Full Hour rate times the line efficiency,
   with break and lunch hours making 86% and 57% of a full hour on lines
   that stop for them. Checked against the workbook's own results for the
   same schedule: every time, note and count matches. **Estimated times**
   (was Estimated changeover) also sets the line efficiency, the break and
   lunch shares, the changeover minutes and the washroom settings.
4. **🖨 Print → Washroom Prep List:** every changeover until the end of
   the shift, first to last: time, line, filler (Cremer / Merrill), type
   and minutes, what comes off the line to wash (oily or powdery,
   allergen) and what goes on, with a Done box.
5. **Cotton, for the cotton notes (Add / Change / Remove Cotton):** from
   the Packaging Lead Hub's cotton list in Stored Data (each FG item and
   "Yes" or the cotton it takes), saved as `cottonItems` in
   `pk030/storedData`. A blank Cotton box in the table shows the Hub's
   cotton in gray; a work order's own Cotton (a COT column in the Excel
   file, or typed in the box) wins over the list, and N in the box means
   none.

6. **For QA: 🖨 Print → QA Changeover List and QA Gemba Walk.**
   - **QA Changeover List:** every changeover until the end of the shift,
     first to last, with its time, line and type, the WO coming off and
     going on, a box for each component that changes (item / label, bulk,
     cap, bottle, count, desiccant, cotton, dumping, international, oily /
     powdery parts), "No [item] left on the line" (a full clearance on a
     major S3 / S4, red edge), a swab test (Done / N/A), an allergen test
     (REQUIRED, Pass / Fail, when an allergen comes off the line; otherwise
     Done / N/A) and QA initials and time.
   - **QA Gemba Walk:** each running line with its WO running now and what
     should be on the line (item, bulk, count, bottle, cap; allergen,
     desiccant and cotton only when the WO has them), three product checks (product looks right, label
     & lot correct, cap on & sealed), three rounds (time, OK / Issue,
     initials) and notes; lines not running get "idle and clear".
   Both come from the same schedule, statuses and times, and have QA / Date
   / Lead lines at the bottom.
7. **Only from the company's network and home (optional, off until set up):**
   the unlock screen explains a sign-in refused by the new network check
   ("LineUp can only be opened from the company's network or from home").
   The check itself is set up once in Firebase: see
   `docs/NETWORK_ACCESS_PLAN.md`.
8. **Printing fix: pages centered, nothing cut off.** With 🖨 Print Both,
   Chrome lays every page out at the first page's width: when Line
   Assignments and the Production Schedule had different margins (or
   orientations), one page came out shrunk and off to the left, and its
   left edge could be cut off by the printer. Now every report in the
   printout is as wide as the narrowest page allows, each page's left and
   right margins split what's left evenly (top and bottom stay as set),
   and anything sticking out past a report is cut off at its edge instead
   of shrinking every page. Printing one report alone is unchanged.
9. The Hub's **Stored Data → Cotton** section, which this reads, is already
   live (released on its own, 2026-11-04, see Released below).

**Not in it yet:** the workbook's product list (oily / powdery and
international for each item) and its line rates, to be added to the Hub's
Stored Data tab. Until then, an item is oily when its
description has SG, LSG or S/G, international when its description says
INTL or INTERNATIONAL, and the rates are the Hub's Line Rates.

**Firebase:** nothing changes; the new settings are saved with each
shift's schedule, and LineUp's shift accounts can already read the Hub's
Stored Data (where `cottonItems` goes; Hub admins can change it without a
rules change). **Job Instruction:** the Production Schedule part
changes (Lines panel, Set to now, the new printout and the washroom list),
so it gets a new revision at step 2.

**How to check it, once it's live:** on the Production Schedule tab, set
each line's This shift status in Lines, click 🕒 Set to now, and look at
the preview: no red CHECK, each line boxed in its color, estimated times
on the running lines. Print → Washroom Prep List. In the Hub (as an
Admin): Stored Data → Cotton → add an FG item from today's schedule; in
LineUp its blank Cotton box shows it in gray.


**Announcement:** "Production Schedule: the printout now looks like the
JDE Schedule workbook, with each line boxed in its status color, progress,
bottles left and estimated times on every work order. Set each line's
status in the new Lines panel at the start of the shift and click Set to
now (until then the printout shows a red CHECK). New: Print → Washroom
Prep List, and for QA, Print → QA Changeover List and QA Gemba Walk."

---

## Running the update

| # | Step | Who | Time |
|---|------|-----|------|
| 1 | Bring in anything newer from the live app, then re-run the checks and browser tests | Claude | 10 min |
| 2 | Update the Job Instruction, if the update changes what people do | Claude | 10 min |
| 3 | Release it: LineUp, and (when this update has Hub changes) the Hub's `claude/next-update` into its live branch `claude/modest-gauss-y18sdh` | Claude | 2–15 min |
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

### 2026-11-04 (evening): Packaging Lead Hub only, Stored Data → Cotton

In the Packaging Lead Hub (repository `AutoCoordinator`, released from its
`claude/next-update` branch into `claude/modest-gauss-y18sdh`; LineUp not
changed): a new **Cotton** section on the Stored Data tab. Admins and
Owners add, change and remove the FG items that take cotton ("Yes", or the
cotton it takes; several FG items at once, with commas); Leads see the
list. Saved as `cottonItems` in `pk030/storedData`; in Export / Import
Stored Data (import: admins only) and the Activity Log. Tested end to end
on the test database: an Owner's changes reach the database, a Lead's are
refused by the rules, every tab opens for an Owner and a Lead, and
LineUp's next update shows the cotton.

Nothing changed in Firebase (admins could already write Stored Data, and
LineUp's shift accounts could already read it).

**Done after the release:** the 26 FG items whose limiting machine is the
cottoner in the Line Lead MDI Router were added to the live Stored Data as
"Yes" (2026-11-04, with the Hub's `tools/pk030_db.py` as an Admin; one
Activity Log entry each; the list is given in chat, not kept in this
public repository). Other FG items that take cotton are added by hand: the
router only shows the ones where the cottoner limits the speed. The live
LineUp starts using the list with its next update.

**Announcement (Hub):** "Stored Data has a new Cotton section: the FG
items that take cotton, and which. Admins keep it up to date; LineUp will
use it for its Add / Change / Remove Cotton changeover notes."

### 2026-10-27 (night): lead first, new line side panel, add people from a list

1. **A picked lead goes first** on a line (page, side panel chips and
   printout), above an MLL; with From Skills & Roles the MLL is first as
   before.
2. **A line's side panel, redesigned ("board look"):** a top bar in the
   line's status color with its name (click to rename), 👥 badge, Status
   and Note; then Crew (chips in the board's role colors, the picked lead
   green with a ⭐), Line lead (a card with Change), and Training ·
   dumping · overtime; Transfer team and Delete line as two buttons.
3. **Skills & Roles → 📋 Add from a list:** paste names one per line, a
   role after a tab, a " - " or on the end (MLL / MLT / LL); a preview
   shows who's new, and only new people are added.

Nothing changed in Firebase. The Job Instruction covers the Production
Schedule tab, so it stays at Rev. 2026-10-15.

**Once it's live, on 2nd shift:** Skills & Roles → 📋 Add from a list →
paste the 42 names from the 10/26 sheet (given in chat, not kept in this
public repository) → Add.

**Announcement:** "Line Assignments: a line's side panel has a new, tidier
look, and the lead you pick is listed first, above the MLL. Skills &
Roles: add several people at once with 📋 Add from a list."

### 2026-10-27 (evening): overtime from the other shifts' names (Line Assignments)

With **⏱ Overtime** picked in a line's side panel, the list is **From
another shift…**: the other shifts' people, grouped in shift order and
A–Z. Picking a name adds them to the line under OVERTIME, counted toward
the ZBS ("From 2nd Shift" in the panel; their ✕ takes them off the line).
Training and Dumping still pick from the line's own crew.

Each shift shares **only its people's names** in `jde-sched-names/{shift}`,
updated whenever someone on that shift unlocks LineUp; any shift reads all
three, a shift writes only its own, and schedules, boards, time off and
skills stay private. **Firebase:** the database rules gained the
`jde-sched-names` block, published by hand in the Firebase console
(Firestore Database → Rules). The Job Instruction stays at Rev. 2026-10-15.

**Announcement:** "Line Assignments: for overtime, pick ⏱ Overtime in the
line's side panel and choose the person from the other shifts' names
(grouped by shift, A–Z). They're added to the line and counted toward the
ZBS."

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
