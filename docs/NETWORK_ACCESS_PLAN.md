# LineUp: only from the company's network and home

The three shift passwords stay as they are. On top of them, a **sign-in
check** in Firebase refuses a sign-in that doesn't come from one of the
allowed networks (the company's, and home), even with the right password.
The unlock screen then says: "LineUp can only be opened from the
company's network or from home."

- It checks **sign-ins**. A computer that's already unlocked (a remembered
  one, for up to 12 hours) keeps working until it locks.
- The web page itself can still be opened anywhere (GitHub Pages can't
  limit that), but without signing in it holds no data.
- The allowed networks are **not** in this public repository: they're in
  one Firestore document that only the Firebase console can change.
- It covers LineUp's three shift accounts. The Packaging Lead Hub's
  accounts are included only if you turn that on (`hub`, below).

## What's built

- `functions/index.js`: the check (a "before sign-in" blocking function,
  `allowedNetworksOnly`). `functions/allowed.js` matches IP addresses and
  ranges (IPv4 and IPv6).
- The unlock screen's message for a refused network (in the next LineUp
  update).
- Tested on the test database (Firebase emulators): no list or turned off
  = everyone signs in; turned on = refused unless the network is listed;
  an empty list refuses everyone; the Hub only when `hub` is on; the app
  can't read or change the list.

## The allowed networks (Firestore document)

**Firestore Database → Data → Start collection** `jde-sched-access`,
document ID `network`, with these fields:

| Field | Type | Value |
|---|---|---|
| `enabled` | boolean | `false` while setting up; `true` to turn the check on |
| `allowed` | array of strings | each network: an address like `203.0.113.7`, or a range like `198.51.100.0/24` (IPv6 works too) |
| `hub` | boolean | `true` to also check the Hub's accounts; leave out or `false` for LineUp only |

Changes apply to the next sign-in; nothing needs redeploying.

- **Company:** ask IT for the company's **public** (outside) IP addresses
  or ranges, including other sites and the VPN if people use them.
- **Home:** from home, search "what is my IP". Most home addresses change
  now and then: when home sign-in is refused, check it again and update
  the list. A home IPv6 address changes too; its first four groups as a
  `/64` range (like `2001:db8:1:2::/64`) usually stay the same longer.

## Setting it up (one time, as the project's owner)

| # | Step | Where |
|---|------|-------|
| 1 | Upgrade sign-in to **Identity Platform** (accounts and passwords stay) | Firebase console → Authentication → Settings → Upgrade |
| 2 | Create the `jde-sched-access/network` document with `enabled` = **false**, and the networks in `allowed` | Firestore Database → Data |
| 3 | Install the check (below) | Google Cloud Shell |
| 4 | Check it's connected: **Before sign-in (beforeSignIn)** shows `allowedNetworksOnly` | Authentication → Settings → Blocking functions |
| 5 | Release the LineUp update (so a refused sign-in shows the message) | "execute the update" |
| 6 | At work: set `enabled` = **true**, then unlock LineUp. It should open | Firestore Database → Data |
| 7 | Try from a phone on mobile data: it should be refused. Then from home | |

Step 3, in Google Cloud Shell (console.cloud.google.com, the `>_` button
at the top), signed in with the project's owner account:

```
git clone --branch claude/next-update https://github.com/jaiserpenales77/JDE-Sched.git
cd JDE-Sched/functions && npm install && cd ..
npx firebase-tools@14 login --no-localhost
npx firebase-tools@14 deploy --only functions --project jde-schedule-database
```

If it asks to turn on Google Cloud services (Cloud Functions, Cloud Build,
Artifact Registry and so on), say yes. The check costs next to nothing at
LineUp's size (a few sign-ins a day).

## Turning it off

Set `enabled` to **false** in the document: it stops at once, no redeploy.
(If someone is locked out at work, this is the quick fix while the list is
corrected.)
