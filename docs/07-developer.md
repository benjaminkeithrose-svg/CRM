# 7. Developer guide

Read `CLAUDE.md` first: it holds the project's hard rules, and it wins over
anything here.

## Shape of the code

There is no framework and no build step. The browser loads the files as they
are in the repository.

| File | What is in it |
|---|---|
| `index.html` | Every screen as a `<section class="scr" id="s-NAME">`, every `<dialog>`, all the CSS, and the Help screen (`s-help`) |
| `app.js` | Everything else, about 17,000 lines in one file, in titled sections (below) |
| `sw.js` | The service worker: caches `ASSETS` one at a time, serves the app's own files cache-first, lets Supabase and GitHub go to the network |
| `zones.js`, `manuals.js`, `healthlib.js`, `health-seed.json` | Reference data: the AU/NZ zone map, the manual list, the health-check fault library |
| `forms.js` (v161) | The application engineering evaluation forms, each described once: sections, questions (`k`, `l`, `t`, `req`, `u`, `o`, `h`, `ph`, `when`, `fill`), a repeating group (the conveyors) and its sprocket table, and which conveyor answers a logged belt shares. A new form is a new entry here; the screen, the call log card and the document draw from it |
| `supabase-2.117.1.js`, `xlsx-0.18.5.full.min.js` | The two libraries, shipped in the repo so they work offline |
| `speech/`, `speech-worker.js` (v166, a trial) | Writing out a recording on the phone: transformers.js 3.8.1 and the ONNX Runtime engine (`speech/`, about 22 MB, licences in `speech/LICENSES.txt`), fetched only when first used and kept by the service worker in a cache of their own (`fieldcrm-speech-3.8.1`) that app updates leave alone; and the worker that runs Whisper on them (`speech-worker.js`, cached with the app). The Whisper model comes from huggingface.co on first use and the browser keeps it (`transformers-cache`) |
| `supabase/` | The cloud schema (`migrations/`) and server functions (`functions/`) |
| `tests/` | Headless suites (`qa-*.mjs`, run by `tests/run.mjs`) and the browser tests |
| `tools/` | `help-to-manual.py` (Help screen to `MANUAL.md`), `docs-to-print.py` (these documents to one printable page) |

### Where things are in `app.js`

Each part starts with a comment banner such as
`/* ================= cloud sync (Supabase) =================`. Search for
the banner text. In order:

| Part | Banner |
|---|---|
| Device storage: `openDB`, `kvGet`/`kvSet`, `storePut`/`storeDel`, `recordsAll`/`callsAll`/`quotesAll` | `storage` |
| Belt reference and plant audit import | `belt reference data`, `the plant audit register`, `one importer` |
| Screens and the back button: `TITLES`, `go(name)`, `PARENT`, `DIALOGS`, `pushDialog` | `navigation`, `back goes up, not backwards` |
| Accounts, the planner, calendar, visits, ICS | `the account record` to `ICS export` |
| Today, the device exchange, incoming files, Task Slaughterer import, tasks, email tasks | `Today and This Week` to `Write email tasks` |
| Saved notes (no screen since v155) and product ideas | `Saved notes and products`, `Product ideas (v155)` |
| Cloud sync: sign-in, passphrase, team, datasets, live updates, records, photos, push, pull | `cloud sync (Supabase)` to `pull` |
| Reports, PC folder, photo archive | `reports` to `photo archive` |
| Home, New, the call dashboard, search, photos, test call | `home` to `Test call` |
| The call's entry forms: belt, project, note, health check, people, photos | `entry: belt` to `photos` |
| The compiled document and the belt spec table | `compile` to `the belt specification table` |
| AI: Tidy, Draft it, summary, the coach, account plans | `AI tidy-up and Draft it` to `the account plan` |
| Opportunities, the map, people, set up from a description, Tasks screen, Blue Sheet | `opportunities and the relationship map` to `Import a Blue Sheet` |
| Large account plan, Copy for Dynamics, Strategy | `the large account plan` to `Strategy` |
| CIP and MBOs | `CIP and MBOs` |
| Create and share, Prepare tomorrow, coaching actions, the microphone, the RFQ | `Create and share` to `the belt RFQ` |
| Account history, the output block, backup and restore, Export for Claude | `account history` to `Export for Claude` |
| Boot, updates, manuals from intralox.com, Outlook calendar files | `boot` onwards |

## Rules that bite

- **Write only through the store functions** (`callsPut`, `oppsPut`,
  `kvSet` and so on). They mark the change for cloud sync; a direct write
  never reaches the other devices.
- **Bump `updated`** (`touchedAt` on a visit) on a real edit, or an older copy
  on another device can win.
- **Never assume the database is open.** Every operation awaits `ready()`.
- **Quote requests are `rectype:'quote'`**, never `kind`. Read calls through
  `callsAll()` and quotes through `quotesAll()`.
- **Applying a record from the cloud sets `cloudQuiet`**, or it is marked as a
  change and sent straight back.
- **No customer data, belt catalogue, CIP/MBO wording or keys** in the repo,
  tests included. Tests use made-up names.

## Checklist: adding a new kind of record (a store)

1. `app.js`, `openDB`: raise `DB_VER` by one and add the store in
   `onupgradeneeded` with a comment naming the app version.
2. `app.js`: add `xAll`, `xPut`, `xDel` beside the others
   (`storeAll`/`storePut`/`storeDel`).
3. Cloud sync, all in the `cloud sync` part: add the store to
   `CLOUD_REC_STORES`; to the store list in `cloudSeed`; to both lookup tables
   in `cloudApplyRec` (delete and put); and to each `stats` and `up` counter
   object (search for `people: 0`).
4. Backup and restore: add it to `buildBackup` and to `doRestore`.
5. If it is shared with the team: a new numbered migration in
   `supabase/migrations/` with read, add and change policies on `records`
   for that store (copy `0008_team_people.sql`). If it is private, nothing:
   private is the default. Never add `cip` or `tasks` to a team rule.
6. `CLAUDE.md`: the IndexedDB version and store list in the Files table, and
   the store functions in the cloud sync rule. These documents:
   `02-database.md` (the store table and its field list) and, if shared,
   the sharing table in `03-sync-and-security.md`.
7. Tests: `tests/qa-upgrade.mjs` opens an old database version and checks the
   upgrade; add the new store to what it checks. Add a suite for the feature.

## Checklist: adding a dialog

1. Add the `<dialog id="...">` to `index.html`.
2. Add its id to `DIALOGS` in `app.js`, so history navigation can close it.
3. Open it with the guard, then name the history entry:
   `if(d.showModal) d.showModal(); else d.setAttribute('open',''); pushDialog(id);`
   Never a bare `history.pushState`.

## Checklist: adding a screen

1. Add `<section class="scr" id="s-NAME">` to `index.html`.
2. Add `NAME` to `TITLES` (header title) and `PARENT` (where back goes) in
   `app.js`.
3. Open it with `go('NAME')`.
4. Add the Help section (`s-help`), then run `python3 tools/help-to-manual.py`.

## The microphone on a text box

Mark the box `data-talk="FIELD"`, where FIELD is the kind of box Tidy should
expect (`note`, `sales`, `line`, `self` and the others listed in
`supabase/functions/ai-tidy/index.ts`, `FIELD`). If the box is inside one of
the watched containers (search `micAuto`), the microphone appears by itself,
also for boxes drawn later. Read-only boxes are skipped.

Since v166, Talking in Settings can be set to **Record, then write it out** (a trial, per device, `localStorage` `talkMode` and `talkModel`). Then `micStart` hands the button to `recStart`: `MediaRecorder` records with the screen kept on, up to 10 minutes; Finish decodes it to 16 kHz mono (`recPcm`); `recPieces` finds the speech in 100 ms frames against the recording's own background (above three times the quietest tenth, never above a quarter of the loudest tenth, at least 0.008), keeps 300 ms either side, cuts the pauses out (v167: Whisper stopped writing at a long silence, so what followed a pause was lost), cuts any stretch over 28 seconds at its quietest moment, and joins the speech into pieces of up to 28 seconds with 300 ms between; the worker (`spAsk`) runs Whisper on each, small.en, base.en or tiny.en (v167 added small.en), 8-bit, one thread. The text goes into the box, or into Capture if the box has gone from the screen; then the button's usual follow-on (Tidy, Draft it, Sort it) runs. The live session's recogniser is `micSession.rec`; a recording is marked `micSession.recording`. A failure offers to save the recording as a file. `tests/qa-speech.mjs` covers the app's side with stand-ins; Whisper itself is only proven on a phone.

Moving on the phone (v172): the Week view's cards carry `data-mv` (`v:` and the visit's id, or `t:` and the task's; not on settled visits or done tasks) and each day block `data-day`. `tvDragWire` arms a card on `pointerdown`; held still for `TV_HOLD` (450 ms) it lifts, a finger that moves more than 8 px first is left to scroll. Once lifted, a non-passive `touchmove` on the card stops the page scrolling, the card follows the finger by `transform`, the page scrolls itself near the top and bottom edges, and the day under the finger (`elementFromPoint`, the card has no pointer events) is marked and stays marked over a gap. Letting go moves it (`apMove` for a visit, `taskMoved` for a task) and swallows the click that follows. `apMove(ap, date, start, dur)` is shared with the Change date and time sheet (`mvdlg`): it stamps `movedAt`/`movedOn`, saves, and moves the date of a started call that is not compiled or done.

The floating microphone (v168, `#fab`, outside every screen) is a microphone button with `data-mic="capText"` and `data-after="none"`: its words go into Capture's box and nothing is sorted until Ben does it. Held still for 200 ms it starts (`micStart`, so it follows Talking into the app; in Live it holds `pressing` so it listens through pauses), and letting go finishes it; moved first, it is dragged, and its place is kept as fractions of the screen in `localStorage` `fabPos`. A recording written out while another screen is showing goes to `CAP.text`, as before.

## Changing what the AI does

The instructions to Claude are in `supabase/functions/ai-tidy/index.ts`: the
shared `METHOD` (the books, the mission and commitments), one entry per
feature in `KINDS`, and one per kind of text box in `FIELD`. A change there
needs the function deployed again (see [Running it](06-running-it.md#the-server-functions)).
`tests/qa-ai.mjs` and the coach suites check the app's side with a stand-in
for the function.

## Writing a test

Copy the top of an existing suite (`tests/qa-people.mjs` is a short one). It
loads `index.html` into jsdom with `runScripts:'dangerously'`, adds the
scripts as real `<script>` elements, and uses `fake-indexeddb`. Top-level
`let` and `const` are not on `window`: read them with `w.eval('(NAME)')`.
Print `PASS n` and `FAIL n` and exit non-zero on a failure; `tests/run.mjs`
picks the suite up by its `qa-` name.

Some element IDs are referred to but absent, harmlessly and guarded:
`pastList`, `looseCam`, `looseGal`, `indentAllLnk`, `detachBtn`.
