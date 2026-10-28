# 6. Running it

## Releasing a change

The app's code lives on GitHub (repository `benjaminkeithrose-svg/CRM`). The
`main` branch is what GitHub Pages publishes, so anything merged into `main`
is live within a minute or two.

1. The change is made on a working branch, never on `main`.
2. The version goes up by one, in three places that must agree:
   `<meta name="build">` in `index.html`, `APP_BUILD` in `app.js`, and
   `CACHE` in `sw.js` (`fieldcrm-vNN`).
3. The Help screen is updated if a flow or button changed, and `MANUAL.md` is
   made again from it (`python3 tools/help-to-manual.py`).
4. These documents are updated if the data, sync or AI changed, and the
   printable copy is made again (`python3 tools/docs-to-print.py`).
5. The tests run (`npm test`) and all pass.
6. A pull request is opened that says, in plain language, what changed, which
   files, what was tested and what to check on the phone.
7. Ben reads it and says "Merge it". Nothing is merged without that.
8. After the merge, each device takes the new version (below).

**Why the version matters.** The service worker keeps a copy of the app on
each device and serves that copy, so the app opens with no signal. It only
fetches new files when the version in `sw.js` changes. A change merged
without a version bump never reaches the phone.

## Getting the new version on a device

The app checks once a day, when it opens with signal, and updates itself if
the server has a newer version. To get it straight away:

1. Tap **⋯** on Home, then **Settings**.
2. Tap **Get the latest version**.

Or close the app fully and open it again, twice: the first opening fetches
the new files, the second runs them. Nothing on the device is touched by an
update: calls, accounts, photos and settings stay.

## When the database version goes up

Some changes add a new kind of record, and the device database then needs a
new version (it is at 9). The new build opens the database at the higher
version and adds the new store; nothing already in it is changed.

An older copy of the app still open in another tab, or left running in the
background, holds the database at the old version. Since v126:

- the new build waits and shows "Close any other Field CRM window or tab to
  finish the update", and carries on the moment the old copy closes;
- the old copy, if it is open, closes the database and reloads itself into
  the new build.

Before v126 the new build started with no accounts and no belt data in that
case (v125, 2026-10-12). Nothing was lost; closing the other tab brought it
back. `tests/qa-upgrade.mjs` guards this.

## Tests

```
npm install     # once per cloud session: jsdom and fake-indexeddb
npm test        # every suite in tests/, one line each
```

Each suite loads the real `index.html` and scripts into a simulated browser
(jsdom) with a simulated database, drives the screens, and checks the
result. They catch runtime errors, broken flows and escaping faults. They
cannot test the camera, the share sheet, the microphone, touch, launcher
icons, the clipboard under corporate policy, or a real 5,700-row export.

Three tests drive a real browser (Chromium) and are run by hand, not by
`npm test`; how to run each is at the top of its file:

| Test | What it checks |
|---|---|
| `tests/browser-cloud.mjs` | Two browser profiles as two devices, against a stand-in for Supabase |
| `tests/browser-cloud-live.mjs` | The same against the real Supabase project, with a throwaway test account |
| `tests/browser-team-live.mjs` | A team of two against the real project; the test account is the admin of its own test team |

The test account's details are passed in when the test runs and are never
written to the repository. Ben's own account is never used for tests.

None of these is a phone test. Every pull request says what was tested and
how; nothing is called "checked on a phone" unless it was.

## The server functions

The three functions in `supabase/functions/` run on Supabase, not in the app.
Changing one means deploying it again; merging the pull request alone does
not change what runs. They are deployed with sign-in checking on.

| Function | Secrets it uses (set in Supabase, never in the repo) |
|---|---|
| `ai-tidy` | `ANTHROPIC_API_KEY`; the service key Supabase supplies itself, for the daily count |
| `team-admin` | The service key Supabase supplies itself, to add and remove sign-ins |
| `intralox-manuals` | None |

A developer with the Supabase command line deploys with
`supabase functions deploy ai-tidy` (and so on). In Ben's Claude sessions,
Claude deploys through the Supabase connector and checks the deployed
version.

The database schema is the numbered files in `supabase/migrations/`, applied
in order. A new rule or table is a new numbered file, never an edit to an
applied one.

## Recovery

| Problem | What to do |
|---|---|
| The app opens empty after an update | Close every other Field CRM tab or window. If still empty, close the app fully and open it again |
| A fix isn't there | Get the latest version (above) |
| A phone is lost or replaced | Install the app on the new phone, sign in to cloud sync, enter the passphrase. Everything comes back except device-only settings and manual page images |
| The passphrase is forgotten | It cannot be recovered: the cloud copy cannot be read without it. Make a backup from a device that still has the data, then set up cloud sync again |
| Something was deleted by mistake | Restore from a backup file (Settings, Backup and restore). It adds back what is missing and never deletes. Cloud sync cannot undo it: a delete reaches every device |
| The AI says the day's limit is reached | It resets at midnight UTC (10 or 11 am in Australia, noon or 1 pm in New Zealand) |
| A device seems out of step | Check signal, then open Settings: **Cloud sync** says when it last synced |

Keep a backup file from time to time anyway, somewhere other than the phone.

## Known issues

- The Plant Audit Template **FORM v1.2** will not import (it has no
  `COLOR_IND` column, a separate dimension sheet, and a different sprocket
  layout). `Plant_Audit_Template_1.xlsm` still imports.
- `COLOR_IND` in the audit data is colours found in plants, not colours a belt
  can be ordered in; it does not restrict the colour picker. The same holds
  for materials.
- The Android back gesture moves back through history; the on-screen back
  button goes up the app's structure. Deliberate.
- pdf.js, used only when importing an engineering manual, loads from a CDN on
  first use.
- On an iPhone (v135 onwards): a file can't be shared into the app from another
  app (iOS has no share target for web apps), so imports use the app's own
  buttons; the microphone button depends on Safari's speech support and may
  not work in the home-screen app, where the keyboard microphone always does;
  text boxes keep their fixed size with their own scroll. The app must be
  added to the Home Screen: a Safari tab can lose its data after a week unused.
  Not yet tried on a real iPhone.
