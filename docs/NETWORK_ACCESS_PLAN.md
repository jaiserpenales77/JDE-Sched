# LineUp: only from the company's network and home

The three shift passwords stay as they are. On top of them, a **sign-in
check** in Firebase refuses a sign-in that doesn't come from one of the
allowed networks (the company's, and home), even with the right password.
The unlock screen then says: "Access restricted. LineUp can only be used
on approved company networks. This device's network (…) is not approved.
For access, please contact the LineUp administrator."

- It checks **sign-ins**. A computer that's already unlocked (a remembered
  one, for up to 12 hours) keeps working until it locks.
- The web page itself can still be opened anywhere (GitHub Pages can't
  limit that), but without signing in it holds no data.
- The allowed networks are **not** in this public repository: they're in
  one Firestore document that only the Firebase console can change.
- It covers LineUp's three shift accounts. The Packaging Lead Hub's
  accounts are included only if you turn that on (`hub`, below).
- **Home without looking up IPs:** in the Hub, **Admin → LineUp: Network
  Access → Allow LineUp from this network** (Owners only), pressed from
  home, allows that network for **30 days**. When home changes, press it
  again (it replaces your last one). The Hub itself isn't locked, so the
  button can always be reached.

## What's built

- `functions/index.js`: the check (a "before sign-in" blocking function,
  `allowedNetworksOnly`), and `lineupNetwork`, which the Hub's button calls
  (Owners only: shows this network, allows it for 30 days, or takes it
  off). `functions/allowed.js` matches IP addresses and ranges (IPv4 and
  IPv6).
- The unlock screen's message for a refused network, with the network it
  saw (live since 2026-11-09).
- The Hub's **Admin → LineUp: Network Access** section (live since
  2026-11-09).
- Tested on the test database (Firebase emulators): no list or turned off
  = everyone signs in; turned on = refused unless the network is listed;
  an empty list refuses everyone; the Hub only when `hub` is on; the app
  can't read or change the list. The Hub's button: only Owners can use it
  (not Admins, Leads or LineUp's shift accounts); it allows this network
  for 30 days, pressing again replaces the Owner's entry, Remove takes it
  off, an entry past its date lets nobody in, and the console's list is
  never touched.

## The allowed networks (Firestore document)

**Firestore Database → Data → Start collection** `jde-sched-access`,
document ID `network`, with these fields:

| Field | Type | Value |
|---|---|---|
| `enabled` | boolean | `false` while setting up; `true` to turn the check on |
| `allowed` | array of strings | each network: an address like `203.0.113.7`, or a range like `198.51.100.0/24` (IPv6 works too) |
| `hub` | boolean | `true` to also check the Hub's accounts; leave out or `false` for LineUp only (keep it `false`, so the Hub's button can be reached from home) |
| `temporary` | (made by the Hub's button) | the networks Owners allowed from the Hub, each with its end date; don't type here |

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
| 4 | Check it's connected: **Before sign-in (beforeSignIn)** shows `allowedNetworksOnly`. **Don't pick it there or click Save** (see below) | Authentication → Settings → Blocking functions |
| 5 | Release the LineUp and Hub updates (the message, and the Hub's button) | Done 2026-11-09 |
| 6 | At work: set `enabled` = **true**, then unlock LineUp. It should open | Firestore Database → Data |
| 7 | Try from a phone on mobile data: it should be refused | |
| 8 | At home: Hub → Admin → LineUp: Network Access → **Allow LineUp from this network**, then unlock LineUp | |

Step 3, in Google Cloud Shell (console.cloud.google.com, the `>_` button
at the top), signed in with the project's owner account:

```
git clone --branch claude/next-update https://github.com/jaiserpenales77/JDE-Sched.git
cd JDE-Sched/functions && npm install && cd ..
npx firebase-tools@14 login --no-localhost
npx firebase-tools@14 deploy --only functions --project jde-schedule-database
```

This installs both functions. If it asks to turn on Google Cloud services
(Cloud Functions, Cloud Build, Artifact Registry and so on), say yes. The check costs next to nothing at
LineUp's size (a few sign-ins a day).

## Don't click Save on the Blocking functions page

The deploy connects the check by its `run.app` address. Picking
`allowedNetworksOnly` in the console's dropdown and clicking **Save**
connects it by its old `cloudfunctions.net` address instead, and then
**every sign-in fails** (LineUp and the Hub): the function's log says the
token has an incorrect "aud" (audience) claim, expected "run.app".
(This happened on 2026-11-09.) To connect it again, in Cloud Shell:

```
URL=$(gcloud run services describe allowednetworksonly --region us-central1 --project jde-schedule-database --format='value(status.url)'); echo $URL
curl -s -X PATCH -H "Authorization: Bearer $(gcloud auth print-access-token)" -H "X-Goog-User-Project: jde-schedule-database" -H "Content-Type: application/json" "https://identitytoolkit.googleapis.com/admin/v2/projects/jde-schedule-database/config?updateMask=blockingFunctions" -d "{\"blockingFunctions\":{\"triggers\":{\"beforeSignIn\":{\"functionUri\":\"$URL\"}}}}" | grep -A3 beforeSignIn
```

The first line prints the address (ending in `.run.app`); the second
connects it and shows it. If sign-ins fail and you need everyone back in
right away, set **Before sign-in** to **None** there and Save (that one is
safe): sign-in works as before, without the check.

## Turning it off

Set `enabled` to **false** in the document: it stops at once, no redeploy.
(If someone is locked out at work, this is the quick fix while the list is
corrected.)
