# Backend plan — moving sync to Supabase

*Written 2026-10-09. This is the agreed shape and order of work; each step
below becomes its own pull request. Progress is marked on each step.*

Background and the conversation that led here: the last two entries in
`IDEAS.md` ("One app for tasks, emails, call notes and products" and
"Replace GitHub-repo sync with a real shared backend").

---

## What this is for

Ben's requirements, in his words where possible:

1. **Data on both phone and PC, without copying and pasting.** Call reports
   written on the phone should be on the PC when he opens it there.
2. **No loss of photo quality.** Photos travel at 1400px, the size already
   held on the phone — not the 800px copy the current sync sends.
3. **Encrypted everywhere it travels or rests off the device** — phone to
   cloud, cloud to PC, and back — with the key held on Ben's devices, not in
   the cloud.
4. **Load the CRM export and belt catalogue once, not once per device.**
   Loading them into each device separately is tedious now and will not work
   at all once colleagues use the app.
5. **Plan for more than one user**, even though only Ben uses it today.
6. **Still works offline**, still fast, still lightweight, free or near-free.
7. **AI clean-up of call notes inside the app** — no jumping out to Claude and
   pasting back. (Last, once everything above is solid.)

---

## Two corrections to what I said earlier

- **"Postgres fits this app's relational data" was the wrong reason to pick
  Supabase.** Once everything is encrypted on the device before it is sent
  (requirement 3), the server cannot read the fields, so it cannot relate or
  search them either. What Supabase actually gives this app is sign-in, file
  storage for photos, realtime push, a place to run the AI function, and
  per-user access rules — all under one account. It is still the right
  choice; the reason is different.
- **The AI cost I quoted ("a few cents a month") assumed the cheapest model.**
  It depends on which model is used — see Step 8. Still small either way.

---

## How it will work

**IndexedDB stays exactly where it is.** It is the app's working copy and
the reason the app runs offline. Nothing about using the app in a plant with
no signal changes.

**Supabase becomes the one shared copy, holding only encrypted data.** Each
device keeps its working copy in step with Supabase: it sends what changed
locally, and takes what changed elsewhere. Supabase cannot read any of it.

**Three kinds of data, treated differently:**

| Kind | Examples | How it syncs |
|---|---|---|
| Records — written by Ben, change often | calls and quote requests (with photos), appointments; later tasks, emails, saved notes, not-stocked products | One encrypted row per record. Newest edit wins, by the `updated` time the app already keeps. Deletes travel as a "deleted" marker so they reach the other device. |
| Shared reference data — imported, change rarely | CRM accounts and contacts, belt catalogue (`beltref`), plant audit register (`assets`), zone overrides, manager map, planning weeks, CRM `meta` | One encrypted copy of each whole dataset, with a version number. Import on any device; every other device pulls the new version. **This is the "load once" fix.** |
| Device-only — never synced | GitHub settings, folder handles, the load log, sign-in session, the unlocked key | Stay on the device. |

**Photos** are stored in Supabase's file storage, encrypted before upload,
at 1400px — the copy already on the phone, sent as is, not recompressed. The
PC fetches a call's photos when that call is opened rather than downloading
every photo at every sync, which keeps the monthly download allowance low.
Each photo gets a permanent ID; today's sync identifies photos by their
position in a list, which breaks when an entry is deleted.

**When sync happens:** when the app opens, when the device comes back
online, and when Ben presses Sync. While both devices are open and online,
realtime push (Step 6) makes changes appear within seconds without pressing
anything.

**Encryption design (the part to get right first time):**
- Ben chooses a passphrase. On each device it is turned into a key with a
  deliberately slow function (PBKDF2), so guessing it is expensive.
- That key does not encrypt the data directly. It locks a random data key,
  and the locked data key is what is stored in Supabase. This is called
  envelope encryption, and it is what makes two later things possible
  without re-encrypting everything: changing the passphrase, and giving a
  colleague access.
- Every record, dataset and photo is encrypted with AES-GCM using the
  browser's built-in Web Crypto. No third-party crypto code.
- **If the passphrase is lost, the cloud copy cannot be read by anyone,
  including Ben.** The copies already on his devices are unaffected. The
  passphrase belongs in a password manager.

**What this protects against:** a breach at Supabase, a mistake in the
access rules, someone getting into the Supabase account, a leaked
configuration. In every case they get unreadable data.
**What it does not protect against:** someone with Ben's phone *unlocked*,
or malware on a device. Android's own device encryption covers a phone that
is lost while locked.

**Sign-in:** email and password, once per device; the app stays signed in.
Not magic-link email — on Android those links tend to open in Chrome rather
than the installed app, which fights a home-screen PWA.

**Configuration** (the Supabase project address, its public key, and the
passphrase) is typed in on each device, under Settings — the same way the
GitHub token is today. Nothing about Ben's project goes into this public
repository, so a colleague can be handed the same app and point it at their
own project or a team one. The Supabase "public" key is designed to be
public; the access rules and sign-in are what protect the data, and the
encryption protects it even if those fail.

**The Supabase code library is shipped inside the app** (one file, about
218 KB, 56 KB compressed), cached by the service worker like everything
else — not loaded from a CDN. CLAUDE.md already records the problem a CDN
causes for SheetJS when the first load fails and the phone goes offline;
this avoids repeating it.

---

## The steps, one by one

Each step is its own pull request, usable on its own, with its own test on
the phone. **The current GitHub sync keeps working throughout** and is only
removed in Step 7, after the new sync has been used for real.

### Step 0 — Ben's setup (no code)

1. ~~Decide the policy question first.~~ Done — Ben's decision is to go
   ahead (Decisions, 1).
2. Create a Supabase account and one project. **Choose the Sydney region**
   (`ap-southeast-2`) when creating it — it cannot be changed afterwards, and
   it keeps data in Australia and the app fast.
3. Note the project URL and the public ("anon") key from the project's API
   settings.
4. Check on the pricing page whether free projects are **paused after a
   period of inactivity** (I believe they are, after about a week), and what
   restarting one involves. Your list doesn't mention it either way.
5. Choose the encryption passphrase and put it in a password manager.
6. Take a **Backup** on each device (Settings, data and backup) before
   Step 4. Nothing in the plan should lose data; this is the safety net if
   it does.
7. *Optional, but it makes my testing much better:* this cloud environment
   currently blocks `supabase.co`. If you add `*.supabase.co` to the
   environment's allowed network list (Claude Code on the web environment
   settings — https://code.claude.com/docs/en/claude-code-on-the-web), and
   give me a separate *test* sign-in, I can test against your real project
   instead of a stand-in.

### Step 1 — Database tables and access rules — **done 2026-10-09**

Project: **Field CRM**, Sydney region (ref `ksuwpjezkumyualdbfmn`). Applied
through the Supabase connector from `supabase/migrations/0001_initial_sync_schema.sql`
— nothing for Ben to paste. It creates:
- `records` — one encrypted row per synced thing (owner, store, ID, key ID,
  encrypted body, the app's updated time, deleted marker). `store` is
  `calls`, `appts` or `datasets`; the datasets (accounts, belt catalogue,
  assets, overrides, managers, weeks, meta) are rows in here with the
  dataset name as the ID, rather than a separate table. The column is named
  `store`, not `kind`, because CLAUDE.md reserves `kind` in the sync payload.
- `vaults` — each user's data key, locked with their passphrase;
- a private `photos` storage bucket, one folder per user;
- access rules so each signed-in user can read and write only their own
  rows and photos; nobody signed out can touch anything.
- Newest edit wins on the server: an update carrying an older edit time is
  skipped, so a device coming back online can't overwrite newer work.

Every table carries a `team_id` column, unused for now, so adding
colleagues later (Step 9) is a change to the rules rather than a rebuild.
The file holds no data and no secrets, so it is safe in a public repo.

**Checked:** applied without errors; Supabase's security check reports no
issues; a partial access test (one user inserting and reading their own
row) passed. The full two-user test (user B can't see or change user A's
rows, older edits are skipped) was not completed — it is covered again by
the Step 2–3 tests from the app itself.

**To do once Ben's account exists:** turn off new sign-ups in the
dashboard, so nobody else can create an account in the project and use up
its free quota.

### Step 2 — Connect and sign in (nothing syncs yet) — **built 2026-10-09, v66**

New **Cloud sync** section under Settings: project address, publishable
key, email and password, sign in / sign out, and a status line. The Supabase
library (`supabase-2.117.1.js`, a release at least two weeks old, checked
against npm's published checksum) is shipped in the repo and on the service
worker's list. No sign-up in the app: accounts are created in the Supabase
dashboard, and public sign-up is switched off. The app refuses the secret
key if it is pasted by mistake. Sign out is this device only.

**Checked:** headless suite `tests/qa-cloud.mjs` (real library, stand-in
network): set up, wrong password, sign in, still signed in after reopening,
sign out, secret key refused, missing library reported. Live from the cloud
environment against the real project: it accepts the publishable key,
rejects a wrong password with the message the app translates, and refuses
to show `records` to anyone signed out. **Not checked:** a real sign-in
(needs Ben's account) and anything on a phone.

**Test:** sign in on the phone and the PC; close and reopen the app and
confirm it is still signed in; sign out works.

### Step 3 — Encryption — **built 2026-10-09, v67**

On the first device, you set the passphrase: the app creates the data key,
locks it, and stores the locked key in Supabase. On the second device you
type the same passphrase and it unlocks. A wrong passphrase gives a plain
"that passphrase doesn't match" message, not a crash or a silent failure.
Nothing else is uploaded yet.

As built:
- Passphrase at least 12 characters, typed twice when set. PBKDF2-SHA-256,
  600,000 rounds, random salt; the data key is a random AES-GCM 256-bit key,
  locked (wrapped) with AES-GCM and bound to the account.
- The vault is only ever inserted, never overwritten. If two devices both
  try to set a passphrase, the second is told to type the first one's.
- Each device keeps the unlocked key in IndexedDB as a non-extractable key —
  usable by the app, unreadable as bytes — so it unlocks once per device.
  Signing out forgets it. Unlocking needs signal the first time.
- `sbSeal()` / `sbOpen()` encrypt and decrypt one record for Step 4 on. The
  store and record ID are bound into the encryption, so a body moved to
  another record, or changed at all, will not open.

**Checked:** `tests/qa-cloud.mjs` with real Web Crypto and the real library
against a stand-in server — set on one device, wrong then right passphrase
on a second, a record sealed on the first opens on the second, tampering
refused, the two-device race, sign-out forgets the key, offline message.
Each of these was also broken on purpose to confirm a test fails. **Not
checked:** the real project (needs Ben's account), and any phone or PC.

**Test:** set the passphrase on the phone, unlock on the PC, try a wrong one
on purpose.

### Step 4 — Reference data, loaded once

After any import (CRM export, plant audit workbook, plant audit register) or
a change to zone overrides, the manager map or planning weeks, the new
version is encrypted and uploaded. Other devices pull it on their next sync.

**Test:** import the CRM export on the PC only; open the phone, sync, and
confirm the accounts are there without importing anything on the phone.

### Step 5 — Calls, quote requests and appointments

Every record change is marked as unsent. Sync sends unsent changes, then
fetches everything changed elsewhere since the last sync, newest edit
winning. Photos upload encrypted at 1400px; the PC fetches them when a call
is opened. Sync runs when the app opens, when it comes back online, and
from a Sync button. The GitHub sync buttons stay, for a parallel run.

**Test:** write a call with photos on the phone; open the PC — it is there,
photos at full quality. Edit it on the PC; open the phone — the edit is
there. Delete one on either — it disappears on the other. Do some of this
with the phone in flight mode, then reconnect.

### Step 6 — Realtime

While both devices are open and online, changes arrive within seconds
without pressing anything.

**Test:** phone and PC side by side; save on one, watch the other.

### Step 7 — Retire the GitHub sync

Only after you've used Steps 5–6 for real and are happy. Removes the
appointment, call and belt-catalogue sync over the private GitHub repo, and
updates `MANUAL.md` and `CLAUDE.md`. The private repo itself can stay as a
backup or be deleted — your choice.

### Step 8 — AI clean-up of call notes

A Supabase Edge Function holds the Anthropic API key (in Supabase's secret
settings, never in the app or this repo) and accepts requests only from a
signed-in user — otherwise anyone who found it could spend your API credit.
A button on the call-notes field sends that note's text, gets the tidied
version back, and shows it for you to accept or discard before it replaces
anything.

**Worth knowing:** to be tidied, the note has to be decrypted on your device
and sent as readable text to Anthropic's API. It is one note, when you press
the button, never automatic — but it is the one place in this plan where
call-note text leaves your devices unencrypted. Intralox may want to know
that (Decisions, 1).

**Model: Claude Haiku 5.5** (Ben's choice, 2026-10-09). Both options as they
were costed, for a typical note (about 1,000 tokens in, including
instructions, and 600 out — roughly 750 and 450 words):

| Model | Per note | 110 notes a month (5 a working day) |
|---|---|---|
| Claude Opus 5.5 — most capable | about 2 cents | about $2 |
| Claude Haiku 5.5 — cheapest | about 0.04 cents | about 5 cents |

(Rates: Opus 5.5 $4 / $20, Haiku 5.5 $0.10 / $0.50 per million tokens in /
out, from the current Claude API pricing. Opus 5.5 always does some
thinking before answering, which adds a little to its output.) Either needs
an Anthropic API account with a payment method — separate from a Claude
subscription. Edge Function calls themselves are within the free tier.

### Step 9 — Later: colleagues, and the new stores

- **Colleagues:** invite flow, a team in the access rules, and a shared data
  key for the team, locked separately for each person. Who sees what needs
  deciding first (Decisions, 5).
- **Tasks, emails, saved notes, not-stocked products** (the "one app" entry
  in `IDEAS.md`) become new record kinds on this same sync — no separate
  sync to build. They can come before colleagues if you'd rather.

### Step 10 — Photo archive

Ben's request (2026-10-09), so photo storage doesn't fill up. At about 50
photos a week the free 1 GB lasts roughly one to two years, so this is
needed within a year of Step 5, not before.

Shape, with Ben's answers (2026-10-09):
- Photos on calls **older than 12 months** are archived.
- The full-size photos for those calls are downloaded and saved to a folder
  on the PC — decrypted, as ordinary image files, named by account and date
  so they're findable without the app.
- Only after the PC confirms every file is saved, the full-size copy in
  Supabase is replaced with a **low-resolution copy** — proposed 800px at
  reduced quality, the size the current GitHub sync uses (roughly 60–100 KB
  against 200–350 KB). Still readable on screen; marked "full size archived
  on PC". That cuts archived photos' storage by roughly three quarters.
- The phone drops its full-size local copies of archived photos too,
  keeping the low-resolution one, so phone storage doesn't keep growing.
- Call text, notes and everything else stay as they are — archiving is
  photos only, since the photos are what take the space.

**Open before building:** whether 800px is low enough or too low; where on
the PC the archive folder should live (a OneDrive folder would give it a
backup for free).

---

## Who does what

| Ben | Me |
|---|---|
| Step 0: policy check, Supabase account and project, passphrase, backups | Everything in Steps 1–9 that is code: schema file, app changes, tests, docs |
| Create his account in the Supabase dashboard; switch off public sign-up (Step 2) | The schema, applied through the Supabase connector (Step 1), and any later changes to it |
| Type the project address, key and passphrase on each device | The Settings screens they go into |
| Anthropic API account and key, pasted into Supabase secrets (Step 8) | The Edge Function and the button |
| Test each step on the phone and PC, and merge each pull request | Say exactly what to test in each pull request |

---

## Testing — what can and can't be checked from here

- **Can check:** the encryption (round trip, wrong passphrase, tampered data
  rejected), the sync rules (newest wins, deletes travel, offline changes
  queue and send later), the screens, and that nothing breaks the existing
  app — against a stand-in for Supabase, in the headless test suite.
- **Cannot check from here:** anything against the real Supabase — this
  environment blocks it. Every step needs your test on real devices until
  Step 0.7 is done. Never assume a step works against the real project
  because the stand-in tests pass.

---

## Will it fit the free tier?

Using the figures you found (500 MB database, 1 GB file storage, 5 GB
download a month, 50,000 users, 500,000 function calls and 500,000 realtime
messages a month, 2 projects):

| | Use | Fit |
|---|---|---|
| Database 500 MB | encrypted text — accounts, calls, appointments, catalogue | Comfortable for years at one person's volume |
| **File storage 1 GB** | photos at 1400px, roughly 200–350 KB each | **About 3,000–5,000 photos. This is the limit to watch.** |
| Download 5 GB/month | photos fetched only when a call is opened on the PC | Comfortable |
| Realtime, functions, users | — | Nowhere near |

So photos are what will eventually outgrow free. At Ben's figure of about
50 photos a week, that's **roughly one to two years** after Step 5. The
answer chosen is the photo archive (Step 10); the paid plan remains the
fallback. Nothing stops working without warning — Supabase's dashboard
shows usage against each limit.

---

## Decisions

**Answered 2026-10-09:**

1. **Policy.** Ben has not checked with Intralox IT. His decision: go ahead,
   because this is a safer option than what exists today — call-report sync
   already sends customer names and notes, *unencrypted*, to the private
   GitHub repo, and this plan encrypts them. (Recorded as his call. If IT
   ever asks, the "What this protects against" section above is the answer
   to give them, along with the one exception in Step 8.)
2. **Sign-in:** email and password.
3. **AI model for note clean-up:** Claude Haiku 5.5 (about 5 cents a month at
   his volume).
4. **Photo volume:** about 50 photos a week. At roughly 200–350 KB each that
   is 10–17 MB a week, so the free 1 GB of file storage lasts **roughly one
   to two years**. Ben asked for an archive feature to deal with that —
   added as Step 10.

**Still open:**

5. **When colleagues join:** does each person's call reports stay private to
   them, with accounts and the belt catalogue shared across the team?
   (Needed before Step 9 only.)
6. **Passphrase custody** (answered 2026-10-09): in Ben's password manager,
   and he can remember it.

---

## Risks and how the plan handles them

| Risk | Handling |
|---|---|
| Losing data during the switch-over | Backups before Step 4; GitHub sync stays running alongside until Step 7 |
| Lost passphrase | Password manager; local copies unaffected; cloud copy unrecoverable by design |
| Same call edited on both devices while both offline | Newest edit wins, same as today; the other edit is lost. Rare for one person; worth knowing |
| Device clocks disagree | Server time used for "what's new since last sync"; device time only to decide which edit is newer |
| Free project paused after inactivity | Confirm the rule in Step 0; restart from the dashboard if it happens |
| Supabase library updates | Shipped as a fixed version inside the app; updated deliberately, not automatically |
