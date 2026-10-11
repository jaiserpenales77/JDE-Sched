# LineUp: next update plan

Changes that are built and tested but not live yet. They wait on the
`claude/next-update` branch, so nobody sees them: only the
`claude/file-to-application-l25bre` branch deploys to the live app. When
it's time, ask Claude to run this plan, and everything below goes live
together.

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
4. Print the schedule (or print it to PDF) and check the page.

**Announcement:**

> **LineUp update:** the printed schedule now uses shorter titles on its
> narrow columns (CT, BTL SIZE, ALLRG, WO QTY, BTLS LEFT), so Product
> Description, Cap Description and Remarks get more room. Refresh LineUp
> to get it. Then, on the Production Schedule tab, click **Fit all
> columns** in the Print Report Preview once. To change a printed title,
> open **Customize Print Design**.

## If something goes wrong

Claude puts the previous version back, and it's live again in a few
minutes. The data isn't affected: the previous version just doesn't use
the saved titles.

## Adding to this plan

Each new change is built and tested on this branch first, then added
under "What's in the next update": what changes for people, anything it
needs outside the app (rules, logins), and what to do once it's live.
