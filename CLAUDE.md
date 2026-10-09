# Field CRM

Offline PWA for Intralox field sales in ANZ: account planning, site calls, belt
and health-check logging, quote requests, and compiled call notes. Vanilla JS, no
framework, no build step. Deployed to GitHub Pages from this repo's root.

## Who you are working with

@PREFERENCES.md

That file is Ben's own, shared across his projects. Where it and this file
disagree, this file wins — in particular, the Intralox branding below replaces
its visual defaults.

## The repo is the only source of truth

Earlier work ran across several parallel chat sessions and repeatedly drifted —
changes were twice nearly built on stale copies. That problem ends here. Never
work from a copy of a file anywhere other than this checkout.

## Files

| File | Purpose |
|---|---|
| `index.html` | Every screen as a `<section class="scr">`, every dialog, all CSS |
| `app.js` | Everything else: storage (IndexedDB v4: `kv`, `calls`, `accounts`, `appts`, `tasks`), import, navigation, planner, calls, tasks, output, sync |
| `sw.js` | Service worker, cache-first, offline |
| `zones.js` | AU/NZ zone map. Ships in the repo, no replacement mechanism |
| `manuals.js`, `healthlib.js` | Reference data and the health-check library |
| `manifest.webmanifest`, icons, `logo.png` | Installability and branding |
| `supabase-2.117.1.js` | Supabase client library, shipped in the repo (not a CDN) for cloud sync. See `BACKEND-PLAN.md` |
| `supabase/migrations/` | Cloud database schema. Not served by the app |
| `tests/` | Headless test suites. Not served by the app |

## Hard rules

**Version strings live in three places and must always agree:**
`<meta name="build">` in `index.html`, `APP_BUILD` in `app.js`, `CACHE` in `sw.js`
(`fieldcrm-vNN`). Bump all three on every change to any served file. If the cache
is not bumped, Ben tests the old build on his phone and reports a fix as broken —
the single most likely source of confusion after an update.

**No customer data in the repo, ever.** The repo is public on GitHub Pages —
and GitHub Pages serves whatever it's given publicly regardless of whether the
source repo itself is public or private, so making the repo private would not
change this. Account names, contacts and CRM exports are loaded manually on
each device. The app is meant to be handed to colleagues who load their own.
`.gitignore` blocks spreadsheets as a backstop; do not rely on it.

**The belt/sprocket product catalogue is not in this repo either**, for the
same public-Pages reason, even though it isn't customer data — it's Intralox's
own part numbers. It is imported on a device and travels between devices
encrypted through cloud sync (dataset `beltref`). The old GitHub-repo and
OneDrive-folder syncs were removed in v78.

**Storage is promise-gated.** `openDB()` returns a cached promise and clears
itself on failure so the next call retries. Every store operation awaits it. Never
write a bare `db.transaction(...)` that assumes the global is populated — an
earlier build did, and it surfaced minutes later as an unrelated-looking import
failure.

**Cloud sync (Supabase) marks changes at the storage layer.** `kvSet()` on a
key in `CLOUD_KV`, and `accReplaceAll()`/`accMerge()`, mark that dataset as
waiting to send; `callsPut()`/`callsDel()`/`apptsPut()`/`apptsDel()`/
`tasksPut()`/`tasksDel()` mark that record. Bump `call.updated` /
`appointment.touchedAt` / `task.updated` on a real edit, or the change can
lose to an older copy. Photos stay Blobs in `entry.photos` and
`call.loose`; the sync names them by content hash on the way out. Write data only through those functions, or the change never
reaches the other devices. Anything applying a copy pulled from
the cloud must set `cloudQuiet`, or it bounces straight back up. Everything
leaving the device is encrypted with `sbSeal()` first. It runs automatically
(on open, on reconnect, after a change), by Ben's agreement in
`BACKEND-PLAN.md`.

**Service worker install caches each asset independently.** Never go back to
`cache.addAll()`: it is atomic, and a blocked CDN once took the whole app's
offline capability down with it.

**The service worker serves only the app's own files from its cache** (plus
the one CDN library in `ASSETS`). Supabase and GitHub API requests go straight
to the network. Before v69 it cached every GET, so a sync could be answered
with the first reply it ever got; `tests/qa-sw.mjs` guards this.

**Quote requests are marked `rectype:'quote'`, never `kind`.** The old GitHub
call sync (removed in v78) overwrote and stripped `kind`, and call files and
backups from that time still carry it, so a quote marked by `kind` would come
back as an ordinary call, land in Reports and reset account cadence. Reads go through `recordsAll()` → `callsAll()` (excludes
quotes) or `quotesAll()`. Backup and restore deliberately use `recordsAll()`.

**Status vocabulary is `open` / `compiled` / `done`** and they are independent.
Compiled means a document was produced; done means the call is finished. A call
closed with nothing to report is a normal finished state (`noReport`).

**Dialogs are registered in `DIALOGS`** so history navigation can close them.
Any new `<dialog>` must be added there. Guard `showModal` —
`if(d.showModal) d.showModal(); else d.setAttribute('open','')`.

**No output format that has already been rejected.** EML was tried and dropped:
on Android, Outlook opens it in a browser rather than as a draft. PDF was dropped
deliberately. Output is self-contained HTML handed to the share sheet.

## Output documents (compiled notes, RFQ)

Anything pasted into or opened by Outlook must survive Word's renderer, which
discards stylesheets, classes and scripts and squares off `border-radius`. Built
documents use A4 (`@page{size:A4;margin:14mm}`), `print-color-adjust:exact`, and
the spec-table palette in `NOTES_CSS`. Empty cells are omitted or an em dash,
never "N/A". The per-contact document tick governs every output.

## Branding

Intralox Global Brand Guidelines, digital specification. White dominant, dark
grey and cyan secondary, red about 5%. **Red is never a button** — brand colours
carry no action meaning. Primary action `#00287B`, destructive `#B2232F`. Type is
Helvetica Neue, then Roboto, then Arial; no monospace. Never recolour, distort,
crop or outline the logo. Where a guideline and an existing spec disagree, follow
the guideline and say what changed.

## Testing

```
npm install     # installs jsdom and fake-indexeddb; each cloud session starts clean
npm test        # runs every suite in tests/
```

Suites load the real `index.html` and scripts into jsdom with
`runScripts:'dangerously'` and real `<script>` elements — indirect `eval` cannot
reach top-level `let`/`const`, so read lexicals with `w.eval('(expr)')`.

The pre-existing referenced-but-absent IDs are harmless and guarded:
`pastList, looseCam, looseGal, indentAllLnk, detachBtn`.

`tests/browser-cloud.mjs` drives the real app in Playwright's Chromium with two
browser profiles as two devices (not part of `npm test`; how to run it is at
the top of the file). `tests/browser-cloud-live.mjs` runs the same against the
real Supabase project with a throwaway test account passed in the environment —
never Ben's own account, and never written to the repo. Both are real-browser
tests, still not phone tests.

**Say which kind of verification applies.** Headless tests catch runtime errors,
escaping faults and broken flows. They cannot test the camera, the share sheet,
gesture hit areas, launcher icons, the clipboard under corporate policy, or
SheetJS parsing a real 5,700-row export. Never imply something was verified on a
phone.

Tests were written against v58–v60. If the repo has moved on, a failing assertion
may be a stale test rather than a bug. Check which before changing code, and fix
the test when the behaviour changed deliberately.

## Git and deployment

Ben runs Claude Code **on the web**, not locally. Sessions clone this repo from
GitHub into a cloud machine; there is no local copy. Anything not committed to
GitHub does not exist to the next session.

Work on a branch and open a pull request. **Never push to `main` directly** — a
merge to `main` deploys to GitHub Pages immediately and reaches his phone on next
load, so merging the pull request is his decision and his deploy step.

**Ben doesn't want to log into GitHub to merge** (his instruction, 2026-10-09).
When a pull request is ready, end your message with a tap-to-answer options
box (the AskUserQuestion tool) asking whether to merge it, with "Merge it" as
the first option and a line or two saying what it changes. When he picks it,
merge it yourself through the GitHub tools and remind him to reload the app.
Never merge without that answer for that pull request.

In the pull request description, say in plain language what changed, which files,
and what he should test on the phone. He is new to git and reads the PR on
github.com. Never force-push. Never rewrite history.

After he merges, remind him the service worker needs a reload on the phone before
he sees the new build.

## Known issues, not yet fixed

- The Plant Audit Template **FORM v1.2** will not import. It has no `COLOR_IND`
  column, moved the dimension block to its own sheet, and replaced
  `SPROCKET SPILL DATA` with a per-series pitch-diameter layout. The importer
  expects the older structure. `Plant_Audit_Template_1.xlsm` still imports.
- `COLOR_IND` in the audit data records colours found in plants, not colours a
  belt can be ordered in. Do not use it to restrict a colour picker. The same is
  true of materials.
- The Android back gesture moves through history chronologically; the on-screen
  back button is hierarchical via `PARENT`. Deliberate — he does not use gestures.
- SheetJS is still loaded from a CDN. If first load fails and the phone goes
  offline, import will not work until jsDelivr is reachable once.
- Reopening a saved belt whose flight material differs from its belt material
  can fail to restore it: `fillBeltFromEntry()` sets `bSprMat`'s value directly
  as an option, but `bFlMat` is a `<select>` and `syncFlightMaterial()` (run
  earlier in the same reload, via the cascade) only ever adds an `<option>` for
  the *current* belt material, not the saved flight material. If they differ,
  the direct `.value =` assignment silently no-ops and the field falls back to
  matching the belt material instead of the value that was actually saved.
  Found while fixing the sprocket/flight "touched" staleness bug below; not
  fixed, since it's a different kind of bug (a missing `<option>`, not a stale
  flag) and belt material and flight material differing is presumably rare.
