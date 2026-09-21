# Field CRM

Offline PWA for Intralox field sales in ANZ: account planning, site calls, belt
and health-check logging, quote requests, and compiled call notes. Vanilla JS, no
framework, no build step. Deployed to GitHub Pages from this repo's root.

## Who you are working with

Ben is an engineer, not a developer. He reads code and follows the logic, but he
does not run a build toolchain and has not used git from a terminal before this.

- Direct and efficient. No preamble.
- He often dictates. Turn rough input into precise output; do not ask him to
  restate things that are clear enough to act on.
- **When he gives a series of design notes, summarise them back and ask before
  building.** Do not start building off a list of notes.
- Flag ambiguities rather than waiting for complete information.
- Do not raise interpretations that are his technical call (belt engineering,
  sales practice). Capture what he provides.
- He does not use Android back or swipe gestures. Navigation must be on-screen
  buttons.
- The app must not push tasks at him. No suggestions on empty screens; overdue
  accounts stay in their own place.

## The repo is the only source of truth

Earlier work ran across several parallel chat sessions and repeatedly drifted —
changes were twice nearly built on stale copies. That problem ends here. Never
work from a copy of a file anywhere other than this checkout.

## Files

| File | Purpose |
|---|---|
| `index.html` | Every screen as a `<section class="scr">`, every dialog, all CSS |
| `app.js` | Everything else: storage, import, navigation, planner, calls, output, sync |
| `sw.js` | Service worker, cache-first, offline |
| `zones.js` | AU/NZ zone map. Ships in the repo, no replacement mechanism |
| `manuals.js`, `healthlib.js` | Reference data and the health-check library |
| `manifest.webmanifest`, icons, `logo.png` | Installability and branding |
| `tests/` | Headless test suites. Not served by the app |

## Hard rules

**Version strings live in three places and must always agree:**
`<meta name="build">` in `index.html`, `APP_BUILD` in `app.js`, `CACHE` in `sw.js`
(`fieldcrm-vNN`). Bump all three on every change to any served file. If the cache
is not bumped, Ben tests the old build on his phone and reports a fix as broken —
the single most likely source of confusion after an update.

**No customer data in the repo, ever.** The repo is public on GitHub Pages.
Account names, contacts and CRM exports are loaded manually on each device. The
app is meant to be handed to colleagues who load their own. `.gitignore` blocks
spreadsheets as a backstop; do not rely on it.

**Storage is promise-gated.** `openDB()` returns a cached promise and clears
itself on failure so the next call retries. Every store operation awaits it. Never
write a bare `db.transaction(...)` that assumes the global is populated — an
earlier build did, and it surfaced minutes later as an unrelated-looking import
failure.

**Service worker install caches each asset independently.** Never go back to
`cache.addAll()`: it is atomic, and a blocked CDN once took the whole app's
offline capability down with it.

**Quote requests are marked `rectype:'quote'`, never `kind`.** `slimCall()` sets
`kind` for the sync repo and `pullCall()` deletes it on the way back, so a quote
marked by `kind` would return from sync as an ordinary call, land in Reports and
reset account cadence. Reads go through `recordsAll()` → `callsAll()` (excludes
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

In the pull request description, say in plain language what changed, which files,
and what he should test on the phone. He is new to git and reads the PR on
github.com. Never force-push. Never rewrite history.

After he merges, remind him the service worker needs a reload on the phone before
he sees the new build.

## Known issues, not yet fixed

- `bookUnplanned()` tests `c.type === 'Phone call'`, but the call-type dropdown
  offers Site call / Phone / Teams / Quote request. Nothing produces
  `'Phone call'`, so a phone call books as a site visit. His call to fix.
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
