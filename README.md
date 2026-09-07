# Field CRM

An offline progressive web app for planning and logging belt quoting calls. Plan on a desktop, work on an Android phone, exchange files between the two.

Merges the Belt Call Log (phone call logging) and the Zone Call Planner (desktop scheduling) into one app. Both source projects stay frozen in their own repos.

**See [MANUAL.md](MANUAL.md) for how to use it.**

---

## The repository holds no customer data

The app ships empty. Account names, contacts and the zone overrides are loaded on each device by the user. This repository is public, so:

**Never commit** a CRM export, a backup file, `zone-overrides.json`, the Zone Call Planner HTML, or the plant audit workbook.

Anyone can install this and load their own data.

---

## Deploying

No build step. No npm. Upload these eight files to the repository root:

| File | What it is |
|---|---|
| `index.html` | Every screen, and all the CSS |
| `app.js` | Everything else |
| `zones.js` | The zone map — geography only, no customer names |
| `sw.js` | Service worker, makes it work offline |
| `manifest.webmanifest` | Makes it installable |
| `icon-192.png` | Home screen icon |
| `icon-512.png` | Home screen icon |
| `icon-maskable-512.png` | Padded variant, survives launcher cropping |

Then: Settings → Pages → deploy from `main`, root folder. Open the URL in Chrome and **Add to Home screen**.

Filenames are case-sensitive on GitHub Pages, and the manifest must agree with what's actually in the repo.

### Bump the cache on every change

`sw.js` line 6:

```js
const CACHE = 'fieldcrm-v16';
```

**Increment this whenever any file changes**, or the old version is what gets tested and a fix will be reported as broken. This is the single most likely source of confusing behaviour after an update.

---

## How it is built

Eight files, no framework, no bundler. One external library: SheetJS from jsDelivr, for reading the Dynamics `.xlsx`. Cached by the service worker on first load.

**Storage.** IndexedDB, database `fieldcrm`, version 3.

| Store | Holds |
|---|---|
| `kv` | Import metadata, zone overrides, territory weeks, manager reassignments, the OneDrive folder handle |
| `calls` | Every call, open or closed, with photos as Blobs |
| `accounts` | One record per account, keyed on the CRM account name |
| `appts` | The schedule |

`localStorage` is used only for small preferences, all under an `fcrm.` prefix.

**Storage names are load-bearing.** GitHub Pages puts every repository on one origin, so this app shares an origin with the Belt Call Log. Database `fieldcrm`, cache prefix `fieldcrm-`, localStorage `fcrm.` — never the `beltcall` names.

**Navigation** uses `history.pushState`, so the Android back gesture moves back a screen instead of closing the app. Dialogs get their own history entry.

**Share target.** The manifest registers the app as an Android share target for `.json`, `.xlsx` and `.csv`. The service worker catches the POST to `./share-target`, parks the file in a separate unversioned cache (`fieldcrm-share`) and redirects with a 303 so a reload cannot re-post. The page collects the file on boot, deletes it from the cache, and routes it. Every incoming file — shared, or chosen with the Receive button — goes through one function that sniffs content rather than filename, so a plan file renamed by OneDrive to `plan (1).json` still works.

**Layout** switches at 900px. Below that the app routes to Today and This Week; above, to the planner. The same breakpoint is used by the routing and the CSS so the two cannot disagree.

---

## Testing

Thirteen harnesses plus a QA pass, all headless with jsdom and fake-indexeddb.

```
npm install jsdom fake-indexeddb xlsx
node qa.mjs          # wiring, ids, assets, a full walkthrough, bad input
node test.mjs        # ... through test14.mjs
```

Roughly 970 assertions. They cover storage, the importer, ICS output, the exchange merge, cadence, navigation and the compiled notes.

**They cannot cover:** the camera, the share sheet, whether Blobs really persist in IndexedDB (fake-indexeddb does not preserve Blob identity), `showDirectoryPicker` against a real folder, SheetJS at full scale, or anything Outlook actually does with an `.ics`.

---

## Known limits

- **Import parses on the main thread.** The UI locks while it works. Never run against the full 5,723-row export on a phone; a worker may become necessary.
- **SheetJS is a CDN dependency.** If it fails on first load and the device then goes offline, `.xlsx` import won't work until jsDelivr is reachable once. `.csv` still will.
- **N/A and blank both render as an em dash.** "Checked, there are none" and "never got to it" read identically — worse when read back from account history months later.
- **Silent defaults.** Belt and rod material default to Unknown; Retrofit and Severity are empty if never tapped. These log as answers when they are non-answers.
- **No validation** on width, length or sprocket fields. They are free text by design, but nothing catches a mistyped 6060 mm belt.
- **The health check field set** has not been confirmed against how walkarounds are actually recorded.
- **The zone map is Australia and New Zealand only.** Installing this elsewhere puts every account in Z12. See the note at the top of `zones.js`.
- **Regarding.** Dynamics server-side sync pulls the appointment in but cannot attach it to the account, so Last Activity Date does not move on its own. The invite subject carries the exact CRM account name, which a Power Automate flow can match on. Outside this app, but it is what makes the monthly push land.

---

## Brand

Follows the Intralox Global Brand Guidelines. Light layout ratio: white dominant, grey and cyan secondary, red used sparingly. Red is the primary action colour here — a deliberate departure from the Belt Call Log, which kept red off buttons entirely. The red box logo is the first-instance mark, embedded in `index.html` and in the compiled notes.

Type: Roboto, then Arial. No webfont is fetched — the app has to work offline.
