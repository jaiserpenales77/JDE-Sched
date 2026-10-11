# LineUp: next update plan

Changes that are built and tested but not live yet. They wait on the
`claude/next-update` branch, so nobody sees them: only the
`claude/file-to-application-l25bre` branch deploys to the live app. When
it's time, ask Claude to run this plan, and everything below goes live
together.

**Timing:** Halloween's theme dates start October 15. To have it this
year, run the update before October 31.

## What's in the next update

### 1. Shorter column titles on the printed schedule

Added 2026-10-11. Tested on a local test database with rows from a real
printout.

**What changes for people using the app:**

- On the printed Production Schedule, the narrow columns get shorter
  titles, so a title no longer makes its column wider than the numbers in
  it. Product Description, Cap Description and Remarks get the room.

  | Column | Prints as |
  |---|---|
  | Count | CT |
  | Bottle Size | BTL SIZE |
  | Allergen | ALLRG |
  | WO Quantity | WO QTY |
  | Bottles Remaining | BTLS LEFT |

- Any printed title can be changed in **Customize Print Design → Column
  titles on the printout**. A blank box prints the column's full name, and
  **Reset to defaults** brings back the short titles. Each shift keeps its
  own. The on-screen schedule keeps the full names.
- **Fit all columns**, and double-clicking a column's edge in the Print
  Report Preview, now narrow a column that's too wide, not just widen it.
  They size the columns for the printed page, which is usually narrower
  than the preview, so numbers aren't cut off on paper.

**Needs:** nothing outside the app. No Firestore rules change, no new
logins.

**Once it's live:** each shift clicks **Fit all columns** once in the
Print Report Preview. To keep the rest of a shift's layout, double-click
the edges of only the too-wide columns instead. Fit all shares the
leftover room between Product Description, Cap Description and Remarks;
drag an edge to make one of them wider.

**Job Instruction:** the Extras page gets "Change a printed column title"
and "Fit the columns to the page".

### 2. Choose a design for the printed schedule

Added 2026-10-11. Tested on a local test database with every row from a
real printout.

**What changes for people using the app:**

- **Customize Print Design** starts with a **Design** choice. Each design
  has a small picture of its look:
  - **Classic:** today's look, with a black grid, a gap between lines and
    thick green boxes.
  - **Clean grid:** light gray lines, no gaps between lines, a thinner
    green box.
  - **Line bands:** each line's name in a navy band, green with a ✓ when
    the line is scheduled. No up-and-down lines, and every other row is
    lightly shaded.
  - **Striped table:** a navy title row, every other row lightly shaded,
    a thinner green box.
- The Print Report Preview and the printout follow the chosen design.
  Each shift keeps its own choice. Every shift starts on Classic, so
  nothing looks different until someone picks another design.
- Clean grid, Line bands and Striped table leave out the blank row
  between lines, so the same schedule takes about 55% of the page instead
  of 83%. They also put commas in big numbers (19,056), center the
  changeover codes in bold, and put the title and date on one line. The
  allergen, oily product and bulk item colors, and the other color
  settings, work in every design.

**Needs:** nothing outside the app. No Firestore rules change, no new
logins.

**Once it's live:** each shift picks its design in Customize Print Design,
then clicks **Fit all columns** in the Print Report Preview.

**Job Instruction:** the Extras page gets "Choose a design for the
printout".

### 3. Holiday themes for the printed schedule

Added 2026-10-11. Tested on a local test database with rows from a real
printout, and with longer made-up schedules of up to two pages.

**What changes for people using the app:**

- **Customize Print Design** gets a **Holiday theme** choice:
  - **Off**, where every shift starts.
  - **Automatic:** each theme shows on its own dates and turns off
    afterward, so nobody has to remember.
  - Or one theme, picked to stay on.
- 12 themes, with the dates Automatic uses:

  | Theme | Automatic dates |
  |---|---|
  | New Year | Dec 27 – Jan 2 |
  | Valentine's Day | Feb 7 – 14 |
  | St. Patrick's Day | Mar 10 – 17 |
  | Easter | the week before Easter |
  | Memorial Day | the week before Memorial Day |
  | Independence Day | Jun 28 – Jul 4 |
  | Labor Day | the week before Labor Day |
  | Halloween | Oct 15 – 31 |
  | Veterans Day | Nov 8 – 11 |
  | Thanksgiving | Nov 15 – 30 |
  | Winter holidays ("Happy Holidays!") | Dec 1 – 26 |
  | Christmas ("Merry Christmas!") | only when picked |

- A theme adds icons beside the title, a greeting next to the date, a
  thin strip of small icons under the title, and its own color on the
  lines. It works with all four designs.
- **Scene under the schedule** (ticked unless someone unticks it): a few
  of the theme's pictures after the last line. Full size when there's
  room, smaller when there's only a little, none when the page is full.
  It never adds a page or makes the schedule smaller, whether or not the
  browser prints its own header and footer.
- The row colors that mean something (scheduled green, allergen, oily
  product, bulk item) never change, and no theme uses green for its
  lines, so scheduled lines still stand out.
- With **Fit to one page**, a theme's title line is a little taller, so a
  schedule that already fills the page prints very slightly smaller.

**Needs:** nothing outside the app. No Firestore rules change, no new
logins.

**Once it's live:** each shift that wants it picks **Automatic** (or a
theme) under **Holiday theme** in Customize Print Design.

**Job Instruction:** the Extras page gets "Turn on a holiday theme".

---

## Running the update

No maintenance window is needed: the data stays the same, and nothing
changes in Firebase.

| # | Step | Who | Time |
|---|------|-----|------|
| 1 | Bring in anything newer from the live app, then re-run the checks and browser tests | Claude | 10 min |
| 2 | Update the Job Instruction | Claude | 10 min |
| 3 | Release it | Claude | 2–15 min |
| 4 | Check the new version (below) | You | 5 min |
| 5 | Send the announcement | You | – |

**Step 4: check the new version.**
1. Open LineUp, press Ctrl+Shift+R, and unlock a shift.
2. On the Production Schedule tab, look at **Print Report Preview**: the
   titles read CT, BTL SIZE, ALLRG, WO QTY and BTLS LEFT.
3. Click **Fit all columns**. WO QTY and % ACTUAL COMPLETE get narrower,
   and no number ends in "…".
4. Open **Customize Print Design** and click each design under
   **Design**. The preview changes each time. Finish on the one your
   shift wants.
5. Under **Holiday theme**, pick **Halloween**: the preview shows the
   pumpkins, "Happy Halloween!" and the scene under the schedule. Then
   set it to Automatic or Off, as your shift wants.
6. Print the schedule (or print it to PDF) and check the page.

**Announcement:**

> **LineUp update:** you can now choose a design for the printed
> schedule. On the Production Schedule tab, open **Customize Print
> Design** and pick one under **Design**: Classic (today's look), Clean
> grid, Line bands or Striped table. The new designs fit the same schedule
> on about a third less of the page. The narrow columns also print shorter
> titles (CT, BTL SIZE, ALLRG, WO QTY, BTLS LEFT), which you can change in
> the same place. You can also turn on a **Holiday theme** there:
> Automatic decorates the printout for each holiday on its own. Refresh
> LineUp to get it, then click **Fit all columns** in the Print Report
> Preview once.

## If something goes wrong

Claude puts the previous version back, and it's live again in a few
minutes. The data isn't affected: the previous version just doesn't use
the saved titles, designs or themes, and prints Classic with no theme.

## Adding to this plan

Each new change is built and tested on this branch first, then added
under "What's in the next update": what changes for people, anything it
needs outside the app (rules, logins), and what to do once it's live.
