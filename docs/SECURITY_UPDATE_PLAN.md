# LineUp (formerly JDE Sched) security update: maintenance plan

The update adds **one password per shift**. Until the maintenance window,
it lives on the `claude/security-update` branch and nobody sees it: only
the `claude/file-to-application-l25bre` branch deploys to the live app.

## What changes for people using the app

- **New name: LineUp.** JDE Sched is renamed LineUp. Same web address,
  same data.

- Opening the app shows an **Unlock** screen: pick your shift, type that
  shift's password. Each password opens only its own shift's data.
- The password is needed **every time the app is opened**. It stays
  unlocked while it's open (refreshing the page is fine) until it's closed
  or someone clicks **🔒 Lock** (top right, where the shift drop-down used
  to be). To switch shifts: Lock, then unlock with the other shift's
  password.
- Closing the app always locks it, even if the browser is set to reopen
  the tabs it had open.
- Except on a **remembered** computer: ticking **Remember this computer**
  on the Unlock screen keeps that computer unlocked for **12 hours**, even
  when the app is closed. The header then shows "Remembered until …".
  Clicking Lock ends it right away.
- Without a password, the data can't be opened at all, not even by someone
  who has the app's address.
- **Auto-lock:** after 60 minutes with no click or key press, a "Still
  there?" box gives one minute's warning, then the app saves and locks.
  This also ends a remembered computer's 12 hours. If the last change
  can't reach the cloud (no connection), it stays unlocked rather than
  lose it, and tries again every minute.
- **Reset to sample data** and **Wipe all data** open a box where WIPE
  has to be typed before they run, so a stray click can't erase a shift.
- The Packaging Lead Hub is not affected. Its accounts can't open LineUp,
  and the LineUp passwords can't open the Hub.

---

## Part 1: Before the window (no effect on anyone)

### 1A. Create the three shift logins (about 5 minutes)

Do this soon. It reserves the three login names.

1. Go to **console.firebase.google.com** and open the
   **jde-schedule-database** project.
2. Left menu: **Build → Authentication**, then the **Users** tab.
3. Click **Add user** and fill in:
   - Email: `1st@jde-sched.local`
   - Password: 1st shift's password. Use at least 8 characters, and
     nothing easy to guess like "password" or the shift name.
4. Click **Add user**.
5. Repeat for `2nd@jde-sched.local` and `3rd@jde-sched.local`, each with
   its own password.
6. Write the three passwords down somewhere safe. Firebase can't show
   them to you again.

These logins do nothing until the new version is live.

### 1B. Keep a copy of today's rules (1 minute)

1. Left menu: **Build → Firestore Database**, then the **Rules** tab.
2. Select all the text, copy it, and save it in a text file named
   `rules-before-security-update.txt`. This is what we put back if
   anything goes wrong.

### 1C. Pick the window and announce it

- About **45 minutes** total. Most of it is waiting for GitHub to publish
  the app, which can occasionally take up to 15 minutes.
- **Right before the window**, paste the current rules to Claude again, in
  case the Packaging Lead Hub's rules changed since. The new rules file has
  to include the Hub's latest rules, or the Hub would break.

**Announcement (send ahead of time):**

> **JDE Sched maintenance: [day, date] from [start] to [end].**
> We're adding a password to JDE Sched so only our team can open it, and
> giving it a new name: **LineUp**. Same web address, same data.
> Please finish your edits and close the app before [start]. Don't use it
> during the maintenance. Afterward, open it again (or refresh it), pick
> your shift, and enter your shift's password. You'll need it every time
> you open the app. You'll get the password from [name].

---

## Part 2: During the window

| # | Step | Who | Time |
|---|------|-----|------|
| 1 | Send "maintenance started". Everyone finishes and closes the app. | You | – |
| 2 | Back up all three shifts' data (a copy of each, kept safe) | Claude | 2 min |
| 3 | Bring any newer app changes into the update, then release it | Claude | 2–15 min |
| 4 | Check the new version (below) | You | 5 min |
| 5 | Publish the new rules (below) | You | 2 min |
| 6 | Check that the data is locked and the app still saves (below) | Claude + you | 5 min |
| 7 | Check the Packaging Lead Hub still works: sign in, open a yield sheet | You | 2 min |
| 8 | Give each shift its password and send the all-clear | You | – |

**Step 4: check the new version.** On one computer, open the app. It
shows the Unlock screen. If it doesn't, press Ctrl+Shift+R.
1. Unlock **1st Shift** with its password and check its data is all there.
2. Click **🔒 Lock**.
3. Repeat for 2nd and 3rd Shift.

**Step 5: publish the new rules.**
1. **Firestore Database → Rules**.
2. Select all of the old text and delete it.
3. Paste the new rules Claude sends you (the `firestore.rules` file, updated
   with the Hub's latest rules).
4. Click **Publish**.

**Step 6: check it's locked.**
- Claude confirms the data can't be read without a password.
- On your computer, unlock a shift and make a small change, like ticking a
  Scheduled Line. Refresh the page and check the change is still there.
  If a red bar says changes aren't reaching the cloud, tell Claude.

**The order matters:** the new app goes live first (step 3), then the rules
are locked (step 5). Locking first would cut off the current app.

**Announcement (all-clear):**

> **JDE Sched is back, now called LineUp.** Same web address, same data.
> Refresh the app (or close and reopen it), pick your shift and enter your
> shift's password. You'll need it every time you open
> the app; refreshing the page doesn't lock it. To skip the password on a
> computer for 12 hours, tick Remember this computer. It also locks by
> itself after an hour without use. To switch shifts, click 🔒 Lock (top
> right) and unlock with the other shift's password.

---

## If something goes wrong (about 5 minutes)

1. **Firestore Database → Rules**: paste the text from
   `rules-before-security-update.txt` and click **Publish**. Everything is
   open again, exactly as before.
2. Claude puts the previous app version back. It's live again in a few
   minutes.

The data itself is never changed by this update. The backup from step 2 is
there as well.

---

## After the update

- **Anyone who left the app open** during the window has to refresh it.
  Until they do, their changes won't save, and the app shows a red warning
  bar saying so.
- **Changing a shift's password:**
  1. **Authentication → Users**.
  2. On the shift's login (for example `2nd@jde-sched.local`), click
     **⋮ → Delete account**.
  3. Click **Add user** with the **same email** and the new password.

  From then on, opening the app needs the new password. An app that's
  already open on that shift, or a remembered computer, locks within about
  an hour.
- **Forgot a password:** same steps as changing it.
- **Turning a shift off for a while:** Authentication → Users → ⋮ →
  **Disable account**.
