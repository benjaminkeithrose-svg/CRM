# Ideas backlog

Rough ideas to build later. Nothing on this list has been built — the app
doesn't change until an idea here is turned into real work in `index.html`,
`app.js`, etc.

---

## Built (v62): Neater comment fields — line breaks, bullets
*Added 2026-09-24, built 2026-09-25*

**The ask:** The "General comments" field on the belt call and health-check
forms needs to read like real meeting notes — line breaks or bullet points,
not a wall of text. Also wants voice input into that field, on a Samsung
phone.

**Current state (checked in code, not on a phone):**
- Both comment fields (`bComment`, `hComment` in `index.html`) are already
  `<textarea>`, and `commentHTML()` in `app.js` already turns `\n` into
  `<br>` when building the compiled-notes output. Plain Enter-key line
  breaks may already survive into the report today — test on the phone
  before assuming this needs building.
- There's no bullet handling. Typing `-` or `•` is just a literal
  character, not a real list.

**Options for line breaks / bullets:**
1. Test today's `\n` → `<br>` behaviour on the phone first. This may
   already solve half the ask for free.
2. Treat blank lines as paragraph breaks (one `<p>` per block) instead of a
   flat run of `<br>`, so multi-line notes get real spacing in the output
   document.
3. Auto-detect list lines: if a line starts with `-`, `*`, or `•`, render
   consecutive lines as a real `<ul><li>` in the output HTML, while still
   storing plain text in the textarea. Keeps storage simple and stays
   inside what Word's renderer will keep (`<ul>`/`<li>` aren't stripped the
   way stylesheets and classes are).
4. A small on-screen "bullet" button above the textarea that inserts "• "
   at the cursor — no parsing logic needed, works even if he doesn't type
   the character himself.

(3) and (4) aren't mutually exclusive.

**Options for speech-to-text on the Samsung phone:**
1. **Free, zero-code:** the Samsung Keyboard and Gboard both put a
   microphone icon on the keyboard itself, usable in any text field
   including a `<textarea>` — dictation into `bComment`/`hComment` may
   already work today with no app change. Test this before building
   anything.
2. **In-app mic button:** add the Web Speech API (`SpeechRecognition`) next
   to the comment field. Tradeoff: on Android Chrome/WebView this
   typically needs an internet connection to reach the speech service,
   which cuts against this being an offline field app — would need
   checking at a site with no signal before relying on it.
3. If (1) already covers it, (2) would just duplicate a feature the
   keyboard gives for free, and probably isn't worth building.

**What was built (options 2 + 3 + 4 from above):**
- `commentHTML()` in `app.js` now treats a blank line as a paragraph break
  (each becomes its own `<p>`), and a line starting with `-`, `*` or `•`
  as a bullet, rendered as a real `<ul><li>` rather than a flat `<br>`
  run. Text and bullets can mix within one comment.
- Both comment fields (`bComment` on the belt form, `hComment` on the
  health-check form) got an "Insert bullet •" button that drops a bullet
  character onto a new line at the cursor, for typing lists on a phone
  keyboard without hunting for the `•` character.
- The field itself is still a plain `<textarea>` — no rich-text editor —
  so this is all in how the compiled output reads the plain text back,
  same approach as the existing line-break handling.

**Not built — speech-to-text (option 1 stands, options 2/3 dropped):**
The Samsung Keyboard / Gboard microphone already works in any text field
including these two, for free, with no app change. An in-app mic button
(the Web Speech API) was not built because it typically needs an internet
connection on Android, which fights this app's offline design, and would
just duplicate what the keyboard already gives for nothing. If dictation
via the keyboard turns out not to work well enough in practice, revisit
this as a new idea with that specific problem named, rather than the
mic button being built pre-emptively.

**Verification:** headless jsdom script exercising `commentHTML()` directly
(paragraph breaks, bullet lists, mixed content, escaping, empty input) and
the bullet button's DOM behaviour. Not tested on a phone — the on-screen
keyboard, dictation, and touch target feel all need that.

---

## Built (v62): Brand the saved output HTML with the app icon
*Added 2026-09-25, built 2026-09-25*

**The ask:** Have the compiled call notes / RFQ HTML files carry the same
icon as the app (the Intralox Call Log icon), so they look less "dodgy"
handed to a corporate recipient.

**Checked in code — this splits into two different things, and only one
of them is possible from inside the HTML file:**

1. **The browser-tab icon, once the file is opened — possible.** The
   output builders (`notesHtml()` and the RFQ builder, `app.js` around
   line 7425/7571) already write `<!DOCTYPE html><html><head>...` and
   already embed the letterhead logo as an inline base64 image
   (`NOTES_LOGO`) so the document stays fully self-contained, matching the
   "no external resources" rule for shared output. Adding
   `<link rel="icon" href="data:image/png;base64,...">` to that same
   `<head>`, built from `icon-192.png` (already in the repo), is the same
   technique already in use — no new network request, nothing that
   changes how Outlook/Word renders the body. This would make the tab
   show the Intralox icon instead of a blank page icon once someone opens
   the file.

2. **The file icon shown in Explorer, an Outlook attachment list, or the
   Android share sheet before it's opened — not possible from the HTML
   itself.** That icon comes from what the receiving computer/phone has
   registered as the handler for the `.html` extension (usually the
   default browser), and is the same for every `.html` file on that
   machine regardless of what's inside it. No content embedded in the
   file can override it. If the "dodgy" concern is specifically about
   what a colleague sees *before* opening the attachment, this idea can't
   fix that — a `.html` attachment will look like every other `.html`
   attachment either way.

**If (2) is the real concern**, the actual fix is a different output
format entirely (e.g. something that opens in Word rather than a browser)
— but CLAUDE.md already records that PDF and EML were both tried and
dropped for this app, so that trade-off would need revisiting deliberately
rather than assumed.

**What was built (option 1 only, as recommended):** a 32×32 favicon
generated from `icon-192.png`, embedded as inline base64 (`NOTES_FAVICON`
in `app.js`) and added via `<link rel="icon">` to both output builders'
`<head>` — the compiled call notes and the RFQ document. The tab now shows
the app icon once the file is opened, same technique as the existing
inline letterhead logo.

**Still true, not built, and not fixable from inside the file:** the icon
shown on the file itself before it's opened (Explorer, an Outlook
attachment list, the Android share sheet) is controlled by the OS's
`.html` file association, not by anything in the file. If that turns out
to be the actual "looks dodgy" problem, this idea doesn't solve it — see
option 2 above for why, and CLAUDE.md's known issues for the output-format
trade-offs already ruled out (PDF, EML).

**Verification:** headless jsdom script confirming both `buildNotesHTML()`
and `buildRFQHTML()` output include the `<link rel="icon">` tag. Not
checked in an actual browser tab or on a phone.

---

## Open: Photo-to-belt-spec from a hand-filled paper sheet
*Added 2026-09-28*

**The ask:** Ben often works from paper — a hand-written spec, or a printed
table with cells filled in by hand. Wants to photograph it and have Field
CRM translate it into a belt spec on the form, to check over before sending
a quote request or call report.

**What already exists to build on:** the app already captures photos fully
offline today (belt/health-check photos go straight into IndexedDB as
blobs, no network needed) — the "take a picture" half of this is solved.
What's new is "read the photo and fill in fields."

**The real trade-off, not a small one:** printed, hand-filled tables might
work reasonably with on-device OCR (there's precedent — SheetJS is already
loaded from a CDN for spreadsheet parsing, so a similar offline-capable OCR
library isn't a structural stretch). Free-hand handwriting is a different
problem: on-device OCR is poor at it, and the only realistic way to get
usable accuracy is sending the photo to a cloud AI vision service. That
breaks two things this app currently is:
- **Fully offline** — a cloud call needs a live connection at the moment
  it's used. Workable if the photo can be taken offline and processed
  later when back in signal (the app already defers other things similarly
  in spirit, e.g. sync), but not instant in the field with no reception.
- **Free to run** — nothing else in this app has an ongoing per-use cost or
  needs an API key. A cloud vision call would be the first thing that does,
  which is a real decision (who pays, how the key is kept out of a public
  GitHub Pages repo) not a coding detail.

**Recommended shape when this is picked up:** never trust the result blind.
Snap the photo, send it off when next online, pre-fill the belt form
fields from what comes back, leave every field editable, and let Ben check
and correct before saving or sending — matches what he asked for ("so I
can check it before sending"), and means imperfect handwriting recognition
is a rough first draft, not a silent error.

**Not investigated yet:** which cloud vision service, cost per call at his
likely volume, and exactly where an API key would live for a static,
no-backend GitHub Pages app (probably needs a small proxy of some kind,
which is new infrastructure this project has never had before).

---

## Open: One app for tasks, emails, call notes and products (replaces Task Slaughterer 9000)
*Added 2026-10-09*

**The ask:** Ben wants to work from one place on his phone and PC. The CRM should generate his emails, call notes and tasks, and take voice input. Outlook should work with it more easily. The same data must exist on both devices. He is worried about data security. He currently runs a separate web page called Task Slaughterer 9000 (a Claude artifact) for tasks, emails, saved notes, appointments and the "Not stocked" product list, and wants those features inside the CRM instead.

**Current state (read in code, not tested on a phone):**
- The CRM is an offline app with IndexedDB stores `kv`, `calls`, `accounts` and `appts`. It has calls, compiled notes and appointments already.
- Phone and PC exchange the schedule and calls through a private GitHub repository using a token stored on the device (`GH` in `app.js`), or through files. Sync is deliberate button presses, and account names are hashed before they leave the device.
- Decisions already made that this idea must respect: dictation uses the phone keyboard's mic (an in-app mic button was dropped), `.eml` output was rejected, Outlook output is HTML via the share sheet, no customer data in the repo, no API keys in a public GitHub Pages app.
- **"No Save buttons" is Ben's stated preference** (PREFERENCES.md: a Done button leaves the screen and saves; nothing entered is discarded silently; half-filled is kept as a draft). The app doesn't follow it yet — `index.html` has explicit Save/Add buttons: `dSave` (appointment), `bSave` (belt), `pSave` (project), `nSave` (note), `hSave` (fault). New screens should follow the preference; converting the existing ones is a separate change.

**What Task Slaughterer 9000 holds today (to bring across):**
- **Tasks:** type (add project to Dynamics, update project, update contact details, write email, book travel, book customer call, call, other), title, contact, account, email, mobile, project, estimated revenue, notes, done and done date. Open and Done lists. Edit with the sword button.
- **Emails:** drafts with To, Subject and Body, ticked off when used, with copy and Outlook export.
- **Saved notes:** reusable text, such as closing notes for Dynamics opportunities, with a status reason.
- **Appointments:** title, date, start time, minutes, invitees, body, exported to Outlook as a calendar file.
- **New products and not stocked:** product, part number, status (Not stocked, New product, Requested to stock), account, details, ticked when stocked.

**Proposed order of work (each step usable on its own):**
1. **Add the new stores to the CRM.** Tasks, Emails, Saved notes and Not stocked, linked to the CRM's own accounts and contacts. Bump the database version with a migration. Reuse the existing sync, with account names hashed as now.
2. **Generate from a call.** When a call is finished, offer follow-up tasks and an email draft from templates, using the call's own details. No AI service needed.
3. **AI clean-up of dictated notes.** Keep it in chat for now: a "Copy for Claude" button, then paste the result back. Do not put an API key in the app.
4. **One-time import of the Task Slaughterer data** (tasks, emails, notes, appointments, products) as a JSON file, then retire the artifact.
5. **Outlook.** Keep the share sheet and calendar-file route. Direct Outlook integration (Microsoft Graph) needs Intralox IT to approve an app registration, so treat it as a later option.

**Sync and security (the open concern):**
- Today's sync works but is manual, and the GitHub token on the phone is the weak point. A fine-grained token limited to the one private repository is the minimum.
- A safer home for the data is Intralox's own Microsoft 365 (OneDrive or SharePoint), which would also help with Outlook. This needs IT approval and has not been checked.
- Before changing the sync, find out what actually causes the phone and website to disagree. That has not been investigated yet.

**Follow-up 2026-10-09 — hosting and encryption:**

Ben raised running the app as a Claude artifact instead of GitHub Pages, to get "the AI extras" directly and keep data in that account rather than a repo. He talked himself out of it in the same message, correctly: the app's explicit design is "meant to be handed to colleagues who load their own" (CLAUDE.md), and an artifact hosted in one person's Claude account isn't something a colleague can pick up the same way a public URL is. Recorded here so the idea doesn't come back around without the reason it was dropped. The ask underneath it is unchanged: phone and desktop, same data, as safe as practical.

He also raised moving customer data and belt data into "a proper database... so we can encrypt it." Worth separating two different things that got bundled together there:
- **Swapping IndexedDB for a different storage engine** (e.g. SQLite via sql.js/wasm) doesn't add encryption by itself — it's a different place to put the same unencrypted bytes. A browser-embedded SQLite build with real at-rest encryption (SQLCipher-equivalent) is not a mature, drop-in option today.
- **Encrypting the data itself**, independent of what stores it, is the part that actually buys safety — the Web Crypto API (`SubtleCrypto`, AES-GCM) can encrypt a record before it goes into IndexedDB and before it goes up to the private repo, with the key derived from a passphrase Ben holds (never stored alongside the data). This is a smaller change than swapping storage engines and targets the actual question ("is the data safe") rather than where it technically lives. The call-report sync in particular is worth a second look under this: it currently sends account names, contact names and call notes in full to the private repo (unlike the appointment sync, which only ever sends a hashed account key) — if anything in this app should be encrypted first, it's probably that, not a storage-engine migration.
- This needs a decision on **threat model** before it's buildable: what is the encryption actually defending against — a lost/stolen phone, a leaked GitHub token, someone else gaining access to the private repo, something else? The right design differs a lot depending on the answer (e.g. a device-held key defends against a leaked token or compromised repo but not a stolen *and unlocked* phone; OS-level device encryption, which a modern Android phone already has by default, already covers a stolen-but-locked phone).

On voice-to-text specifically: Ben's message asks whether an online step can be avoided here. Worth being precise, since two different things are easy to conflate:
- **Plain dictation** into the existing comment fields is already free today via the phone keyboard's own mic (see the first entry in this file) — no app change, no network call from this app's side. Whether *that* itself runs fully offline depends on the keyboard's own settings (Gboard/Samsung voice typing can use an on-device language model, but may default to a cloud one) — worth checking on his phone rather than assumed either way.
- **AI clean-up of what was dictated** (tidying rambling voice notes into structured call notes) is a different, heavier task that a phone keyboard cannot do, and does need a real model — there is no offline way around that part. This is exactly what step 3 above ("Copy for Claude" button, pasted back, no API key in the app) already proposes, specifically so the one piece that must be online stays a deliberate, occasional action rather than something the whole app depends on.

**Follow-up 2026-10-09 (second message) — restated in plain terms:**

Ben restated the actual complaints, which sharpen two things above rather than add new ones:

1. **"I don't want to jump out of the app to clean up call notes via Claude copy/paste."** This answers the first "Not decided" item below: chat-based AI (step 3's "Copy for Claude" button) is *not* acceptable after all — the round trip itself is the complaint, not just whether it's online. That means the small backend/key-holding proxy is the real requirement, not an optional upgrade: there is no way to call an AI model **from inside the app**, without ever leaving it, without something other than the static site holding the API key — a key embedded in the page is public the instant it ships (same reasoning as the belt-catalogue block earlier: GitHub Pages serves whatever it's given to anyone). A small serverless function (e.g. a Cloudflare Worker) that holds the key and the app calls directly is the standard way to do this, and fits "lightweight" — but it is new infrastructure this project has never had: something to create, host, and keep an eye on, even on a free tier. Worth being upfront that "AI inside the app, no copy/paste" and "no backend, ever" cannot both be true at once; one of them has to give.

2. **"Call reports should be visible on the PC almost instantly, not after a manual sync tap."** Two different answers depending on how literal "instant" needs to be:
   - **Fast, still no new infrastructure:** change call-report sync from a manual button press to automatic polling of the existing private repo every 15–30 seconds while the app is open on both ends — not real-time, but close, and it's the same GitHub-repo mechanism already built, just triggered on a timer instead of a tap. This is a real departure from this app's existing "nothing happens automatically, every sync is a deliberate button press" pattern (MANUAL.md), which was presumably chosen on purpose — worth Ben confirming he's fine trading that away specifically for call-report sync, not assuming it.
   - **Genuinely instant (push, not poll):** needs a backend that can notify the other device the moment something changes — GitHub's API has no push mechanism for this. That means a realtime-capable service (e.g. Supabase/Firebase's free tiers) in place of, or alongside, the GitHub repo — a bigger architecture change than the polling option, and a second new moving part on top of the AI proxy above.

Both the AI piece and true-instant sync point the same direction: this app moving from "fully static, no backend, ever" to "mostly static, with one small piece of infrastructure behind it." That's a real line to cross, not a detail — worth deciding deliberately rather than drifting into it one feature at a time.

**Follow-up 2026-10-09 (third message) — sync question narrowed, AI cost priced out:**

Ben clarified sync: he doesn't need live updates while the PC app sits open, only fresh data at the moment he opens it — a deliberate button press (what already exists today) is actually what he wants, not background polling. **This removes sync from the "needs new infrastructure" list entirely.** The only change worth considering here, and it's small: auto-trigger the existing pull once when the PC app loads, so reports are already there instead of needing a tap first thing — same GitHub-repo mechanism, no new infrastructure, and it keeps (rather than breaks) the app's "nothing happens unless triggered" pattern, since "loading the app" is itself the trigger. That leaves **the AI piece as the only part of this whole entry that actually needs a backend.**

On cost, since Ben was clear he doesn't want to spend more than necessary — priced against current Claude API rates (checked via the pricing skill, not recalled from memory):
- **Hosting:** a Cloudflare Worker's free tier covers 100,000 requests/day. A few call-note cleanups a day is nowhere near that — **$0** for hosting, indefinitely, at this volume.
- **The AI calls themselves cost per use, separately from hosting, and this is the one genuinely unavoidable cost** — there's no way around paying for model usage somewhere if the model runs at all. Using Claude Haiku 5.5 ($0.10 per million input tokens, $0.50 per million output tokens — the right-sized model for tidying short dictated text, not a complex reasoning task): even a generously long call note (~3,000 words in, ~1,500 words cleaned up out) costs **roughly a tenth of a cent per call**. At "a few call notes a day" that's realistically **a few cents a month, well under a dollar** — even heavy use (dozens of calls a day) would land under a dollar or two. This needs an Anthropic API account with a payment method or prepaid credit attached (separate from a normal claude.ai subscription, which has no programmatic access) — small amount of setup, not a recurring bill of any real size at Ben's stated use.

So: the backend decision is now just about the AI piece, and the honest cost answer is "free hosting, a few cents a month in actual AI usage." Worth Ben knowing the real number rather than deciding on a vague worry about cost.

**Follow-up 2026-10-09 (fourth message) — what sync actually does today, and the repo question:**

Ben asked what call-report sync currently does (hasn't used it in a while, assumed it was a lightweight document only) and whether the sync repo is public or private. Checked against the actual code rather than guessed:

- **Call-report sync already sends everything** — full customer name, contacts, notes, and photos — not just a lightweight document. The one real limit: photos go up resized to 800px at reduced quality ("for reading a report on a laptop, where the difference is invisible" per the code comment), not full camera resolution. Appointment sync is the lightweight one (only a hashed account key, date, time, status, agenda) — these are two separate mechanisms Ben may have been conflating.
- **Two different repos, not one.** This app's own repo (public, has to be for GitHub Pages, never carries customer data) is not the same thing as the separate private repo Ben set up for sync, where call reports/appointments/photos actually land. The sync repo's privacy is enforced in code, every push: `ghCheckRepo()` reads the repo's real status from GitHub's API and **refuses to sync at all** if it isn't private ("that repository is PUBLIC. Appointments must go to a private one."). That setting lives only on Ben's device, not anywhere accessible from a session here, so it can't be verified remotely — Ben can check it himself in ten seconds via **Exchange → Test the connection**, which runs that exact check.

**New ask: full-size images on the PC, not the current 800px compressed copies.** Technically simple, but a real tradeoff worth deciding first: GitHub repos don't prune, and anything ever pushed stays in history even after deletion, so switching to full camera resolution makes the private repo grow considerably faster over time. Asked Ben whether he needs true original resolution or just better-than-800px (e.g. the 1400px copy already held on the phone) before building this.

**This connects back to the still-open encryption question** (see the threat-model note above) rather than being separate from it: if sync is about to carry *more* data through that same private repo, whether to encrypt what's sitting in it matters more, not less. Asked Ben directly whether to bundle encryption into this round of sync work or treat "private repo + the app's enforced check" as sufficient for now.

**Order confirmed:** sync (and the open "does it actually work reliably" question) before AI cleanup — cleanup only matters once the data lands where Ben wants it first.

**Not decided:**
- Whether IT allows Microsoft 365 storage or Graph permissions.
- Whether it is only Ben using the app or the team.
- What the encryption is actually meant to defend against (see threat model above) — this decides the design, so it has to come before any encryption work starts.
- Whether "full-size images" means true original resolution or just bigger than the current 800px sync copy.
- Whether encryption gets bundled into this sync round or deferred.

**Questions for Ben before building:**
1. Is steps 1 to 4 the right scope, in that order?
2. ~~Is the chat-based AI step acceptable?~~ **Answered 2026-10-09: no** — Ben wants AI cleanup inside the app, no copy/paste round trip.
3. ~~Is Ben fine with the one small backend piece this requires?~~ **Answered 2026-10-09: yes, conditionally** — fine with it as long as it's free or very close to it. Priced out above: realistically a few cents a month. On that basis this is a go, pending him confirming the actual number is acceptable.
4. ~~Should the sync investigation come first?~~ **Answered 2026-10-09: yes** — sync before AI cleanup.
5. Should IT be asked about Microsoft 365 storage?
6. For encryption: what's the threat model — a lost/stolen phone, a leaked GitHub token, a compromised private repo, something else? And does call-report sync (which currently sends full customer names and notes, not just a hashed key like appointments do) need encrypting before anything else does?
7. ~~What image resolution does "full-size" actually need to be?~~ **Answered 2026-10-09: 1400px** — the resolution already held on the phone, not a further-compressed sync copy. No quality loss from what's already on the device.
8. ~~Bundle encryption into the sync work now, or keep relying on the app's enforced privacy check?~~ **Answered 2026-10-09: yes, encrypt it** — see the new entry below, which this answer fed into directly.

---

## Open: Replace GitHub-repo sync with a real shared backend
*Added 2026-10-09*

> **Agreed with Ben and turned into a step-by-step build plan: see
> `BACKEND-PLAN.md`.** That file is now the source of truth for this work;
> what follows is the reasoning that led to it. One correction carried
> there: the "relational model fits this app's data" point below doesn't
> hold once everything is encrypted on the device (the server can't read
> fields to relate them). Supabase is still the choice — for sign-in, file
> storage, realtime, functions and access rules under one account.

**Why this is its own entry, not another paragraph on the one above:** Ben's answers to the questions above (keep full 1400px image quality, encrypt everything moving between phone/repo/PC in both directions, and — new — stop holding the same data in two places per-device) add up to more than a tweak to the existing GitHub-repo sync. They describe replacing the sync mechanism itself. Recorded separately so it doesn't get lost inside the "one app" entry's threads on tasks/emails/products, which are a different problem.

**The three things Ben asked for, read together:**
1. **No quality loss on synced photos** — 1400px, matching what's already held on the phone (`shrink()` already uses 1400/0.72 on-device; sync currently re-compresses down to 800/0.6 — see the entry above). Straightforward on its own; mentioned here because it affects how much data the next two points have to move and store.
2. **Encrypt data moving phone → repo → PC, and back**, with the key living on each device/"platform," not in the repo. This is buildable against the current GitHub-repo sync largely as-is (encrypt before `putFile()`, decrypt after `getFile()`/`getBlob()`, Web Crypto AES-GCM, key never stored alongside the ciphertext) — this part doesn't by itself require a new backend.
3. **Stop storing the same data twice — once in each device's local copy, once in the sync repo — and make it one real, shared store.** This is the one that changes the architecture. Ben's reasoning: loading a CRM export and the belt catalogue into every device separately is tedious now, and won't work at all once more than one person uses this. A git repo being hand-poked by a button press was never meant to be a real multi-client database, and he's right that it won't carry a team.

**What this actually means: the private GitHub repo stops being the sync mechanism, and a real backend takes its place.**

**Recommendation: Supabase** (hosted Postgres + file storage + authentication + realtime + small serverless functions, one provider, generous free tier). Reasoning:
- It replaces three separate things this project currently has or was about to need — the GitHub-repo sync, a home for the AI-cleanup proxy from the entry above, and (eventually) multi-user accounts — with **one** piece of infrastructure instead of three. Fewer moving parts for someone who's said plainly they want to go carefully here.
- **Realtime is built in and free** — tables can push changes to every connected device the moment something changes, which happens to be the "almost instantaneous" sync Ben asked about a few messages ago, solved as a side effect rather than a separate project.
- **Storage** (for photos) is a separate bucket from the database itself, which is the right shape for 1400px photos rather than stuffing them into database rows.
- **Row-level security and auth are first-class**, so "built for one user, ready for a team later" is a real option from day one rather than a rebuild — create every table with an owner/user column now, even while only Ben's account exists.
- **Encryption still works the same way as planned above** — encrypt client-side with Web Crypto before anything is written to Supabase, decrypt after reading it back. Supabase never needs to see plaintext for this to work; it's just a better-built destination for the ciphertext than a git repo was.
- The main alternative is Firebase (Google's equivalent) — similar shape, similar free tier, mentioned for completeness; Supabase's relational (Postgres) model fits this app's already-relational data (accounts → contacts, calls → entries → photos) more naturally than Firebase's document model would.

**What offline means under this plan, since it still matters:** IndexedDB doesn't go away — it stays exactly what it is today, the on-device working copy the app actually reads and writes while offline. What changes is what it syncs *with*: instead of a device periodically reading and writing files in a git repo by hand, it syncs with Supabase, automatically when online (realtime) and seamlessly, matching what Ben asked for. Supabase becomes the one real copy; IndexedDB becomes a local cache of it, not a second independent copy of the truth — which is the actual fix for "it is very tedious loading the data into the phone or the computer app": the CRM export and the belt catalogue get loaded **once**, into Supabase, by Ben, from whichever device is doing it — every other device and future teammate just reads from there, nothing to re-import per device ever again.

**What retires:** the private GitHub repo and everything built on `GH`/`ghHeaders()`/`getFile()`/`putFile()` for appointments, call reports, and belt reference sync (`pullBeltRefGh()`/`pushBeltRefGh()`, built earlier this project) — all of that becomes Supabase reads and writes instead. The GitHub repo itself can stay as a one-time export/backup if useful, but stops being the live sync path.

**Cost:** Supabase's free tier (as I understand it; worth confirming current limits before committing to this, since they're not something I have a verified, current source for the way Anthropic's own API pricing was checked a few messages ago) covers a single user's database and auth comfortably, and a meaningful amount of file storage and monthly data transfer — photos at 1400px are the one thing likely to be worth watching as call volume grows or a team gets added, since images are what actually consumes storage and bandwidth at any real volume. Realistic expectation: free for quite a while at Ben's stated usage, with a small, predictable bill only once storage or a team's combined usage genuinely outgrows the free tier — not something that creeps up unnoticed.

**Proposed order of work, each step usable on its own:**
1. Stand up the Supabase project, design the schema (accounts, contacts, calls, appointments — and the tasks/emails/notes/products stores from the entry above, since this is the natural time to add them together), with an owner/user column on every table from the start.
2. Migrate existing data: one-time load of the CRM export and belt catalogue into Supabase; existing devices' local IndexedDB data uploaded once rather than re-entered.
3. Replace appointment sync and call-report sync (photos included, at 1400px) with Supabase reads/writes, keeping IndexedDB as the offline-first local cache.
4. Add the client-side encryption layer across what's now flowing to/from Supabase.
5. Turn on realtime so sync becomes automatic rather than a button press, closing the loop on "almost instantaneous."
6. Add the AI-cleanup proxy as a Supabase Edge Function, now that there's a real backend to host it on — this is the earlier "one app" entry's AI piece, built on this foundation instead of a separate Cloudflare Worker.

**Not decided:**
- Exact schema design (left for when this is actually built, not guessed at here).
- Where the encryption key is created and how a new device gets it for the first time without the key itself ever traveling in the clear — likely a passphrase Ben types in once per device, same pattern as the GitHub token today, but worth deciding deliberately rather than assumed.
- Whether the old GitHub repo gets decommissioned once this is live, or kept around as a backup.
- Exact current Supabase free-tier limits — worth a direct check against their current pricing page before committing, not taken on faith from training knowledge.

**This is a genuinely bigger piece of work than anything built in this project so far** — a new account to create, a schema to design, a real migration, and several existing features (appointment sync, call sync, belt-ref sync) all moving to a new mechanism at once. Worth Ben confirming this plan and the order above before any of it starts.

---

## In progress: The calendar as the backbone — everything lives under a call
*Added 2026-10-09. Part A (tasks) built in v74; B and C to come.*

**The ask:** every task, call and quote request Ben adds is placed in the
calendar. When he goes to a planned call, he opens it from the calendar and
everything from that visit is saved under it — documenting as he goes — so
the calendar shows what's coming *and*, afterwards, what was done. The call
becomes the main item everything else hangs off.

**To settle before building (Ben's answers needed):**
1. A **task** with no date — does it go on the calendar on the day it's
   added, on a due date he picks, or stay off the calendar until it has one?
2. A **quote request** — is it its own calendar item, or always under the
   call it came out of? (Today a quote request is its own record.)
3. A call added **without** an appointment (an unplanned visit or a phone
   call) — create the calendar item automatically, at the time it was
   started?
4. Opening a planned appointment from the calendar — straight into the call
   (creating it the first time), rather than via Start call today?
5. What "everything" under the call covers: belts, health checks, projects,
   notes, photos, quotes and tasks raised in the meeting?

**Ben's answers (2026-10-09):**
1. A task with no date lands on the day it's added; he moves it from there.
   He wants to search for tasks only, show tasks only, and have different
   ways of viewing the calendar.
2. A quote request lands on the day it's made.
3. Starting an unplanned visit or phone call puts it on the calendar
   automatically.
4. A planned appointment keeps all its details (for sending invites) and
   gets a **Start call** button that opens the call log.
5. Under the call: belts, health checks, projects, notes, photos, and the
   quotes and tasks raised in the meeting. Tasks don't exist yet — start
   adding them.
- Task fields: the same as Task Slaughterer. Every task is **30 minutes**.
- Order: A (tasks), then B (calendar links), then C (views and search).
  Importing the old Task Slaughterer tasks comes later, separately.

**Built — A, tasks (v74):**
- A Task tile on Home and on the call screen; **+ Task** on every day in the
  week and day views.
- The task form uses chips for the eight types, plus title, date, start
  (30 minutes), account (picked from the CRM), contact (that account's),
  email and mobile (filled from the contact, never over something typed),
  project, estimated revenue, notes and Done. The form has a **Done**
  button, not Save. Nothing entered is discarded silently; no title is
  kept as a draft and says so; Escape or the back gesture counts as Done.
  The bin is on the far left, in the warning colour.
- A new task lands on today at the next half hour (added 10:12 → 10:30).
- On the calendar, a task is a one-line card in the right half of the day
  column (appointments keep the full width underneath), with a tick box.
  Drag it in the week or day view to move it; it shows in the month view
  too. Done tasks are greyed and struck through.
- A task added from inside a call carries the call, its account and first
  contact, and is listed under the call as "Tasks from this call".
- Tasks are in backup/restore and sync through cloud sync like everything
  else. Database version 4 adds a `tasks` store; existing data is kept.

**B built (v86):** quote requests show on the calendar (PC day, week and
month; phone Day, Week and Month counts) on the day made, at the time made,
in orange, read from the quote records rather than made into appointments, so
nothing goes to Outlook or the cadence. Tapping one opens it. A saved planned
visit has **Start the call** in the PC appointment window (saves edits first)
and at the top of the phone's ⋯ menu; once started it reads **Open the call**.
The phone-call booking fix went in with the New screen (v77).

**C built (v87):** All / Visits / Tasks / Quotes chips under Day / Week / Month
on the phone and the PC; tap again to go back to All; in memory only, so every
app open starts on All. Counts and the phone's Month numbers follow it. A
search icon on that row opens the full-screen search over tasks, visits and
quote requests (only the filtered kind when one is picked); a task or quote
opens, a visit takes the calendar to its day.

The calendar backbone (A, B, C) is built. Still open from the original idea:
Task Slaughterer import.

**Task Slaughterer import — Ben's answers (2026-10-09):**
- **Tasks only** for now. Emails, saved notes and the Not stocked list stay in
  Task Slaughterer. Nothing else from it is rebuilt in the CRM as part of the
  import — the worry is losing function or making the CRM clunky.
- **Open tasks with no date land on the day they were created** (Task
  Slaughterer's created date if it has one, otherwise the import day). Ben
  floated two alternatives to decide later: split the day so undated tasks run
  down one side of their created day, or put them all on that week's Saturday
  to keep them out of the way.
- He asked whether Task Slaughterer could write straight into Supabase and
  have it pushed down to the apps. Not cleanly: everything in the cloud copy is
  encrypted on the device with the passphrase (sbSeal), so a writer would need
  the CRM's encryption code and the passphrase, and a Claude artifact cannot
  reach other sites anyway. The equivalent that works: export a file from
  Task Slaughterer, share it to Field CRM on one device (the share target
  already takes .json), the import writes through tasksPut(), and cloud sync
  pushes it to every other device by itself.
- **Built (v91):** a Write email task carries its draft (To, Subject, Body).
  To follows the task's email (from the contact) until typed over, badged
  while it does. Open in Outlook is a mailto link (new message in the default
  mail app, nothing downloaded); a body that would make the link longer than
  1,800 characters is copied instead and the link carries To and Subject.
  Copy copies the body. Done stays a manual tick. The calendar search looks
  in the draft. Task Slaughterer's 6 email drafts came across as Write email
  tasks (unused open on the import day, used as done), linked to the CRM
  contact and account when the To address matches.
- **Built (v95), waiting on the API key:** a "Draft it" button where Claude
  writes the email from dictated points and the task's details, through the
  `ai-tidy` function (BACKEND-PLAN.md Step 8). Dictation itself stays with the
  phone keyboard's microphone.
- **Built (v89).** Task Slaughterer keeps its data in the artifact's own
  database (collections tasks, emails, appointments, products, templates); it
  has no task export. The session read the tasks collection directly (53
  tasks, every one with a created date, 39 of them made on 30 Sep), wrote
  them to a file in the shape {source: 'task-slaughterer-9000', tasks: [...]}
  and gave Ben the file. The file is never committed.
- **Placement changed after seeing the data** (Ben, 2026-10-09): every task
  had a created date and most were from one day last week, so "the day
  created" would have hidden the open ones. Open tasks go on the import day
  from 8am, half an hour apart, oldest first; done tasks on the day done.
- Import: Settings → Update data → Tasks from Task Slaughterer, or share the
  file to Field CRM. Ids become 'ts-<id>', so a second import adds nothing and
  never overwrites a task edited in the CRM. Accounts match exactly, then by
  the one CRM account holding every word typed; otherwise kept as typed and
  listed in the report.

**Worth knowing:** the app already links an appointment to its call in
places (`callSummary`, `bookUnplanned()`). The known `'Phone call'` bug in
`bookUnplanned()` (CLAUDE.md) sits right in this path and would need deciding
as part of it. Tasks don't exist yet — they're in the "One app" entry above —
so this and that entry are one piece of design. Cloud sync (Step 5) already
carries calls, quote requests and appointments, so nothing here needs new
sync work.

---

## Open: App review against PREFERENCES.md
*Reviewed 2026-10-09 at phone width in real Chromium (v76), screen by screen. Ben chose all of it, as four updates: (1) navy buttons and bigger bins, (2) forms, (3) cards, (4) search. Search stays a box on New, where it is the screen's whole purpose (Ben, 2026-10-09).*

*Done: 3 (New chooser, v77), 10 and 11 (v78–v79), 12 and 13 (v81), 1, 2 and 4 (v82: call toolbar and Done at the top; chips for note topic, project status, fault type, visit type and length, account manager); 9 (v84: full-screen search on Reports and the planner; New keeps its box); 6, 7 and 8 (v83: call log and Reports cards open on a tap, everything else behind ⋯, Delete last and apart; Duplicate on call log entries). 14 needed nothing: every place that builds a document already turns "N/A" into an em dash.*

**Entering data**
1. **Main action at the bottom.** Belt, note, project and fault forms put **Done** at the very end of the form (the belt form is about 2,700px tall), under everything. Preference: the main action at the top.
2. **Dropdowns for known answers.** Call type (Site call / Phone / Teams / Quote request), note topic (Staffing / Production / Plant / Commercial / Other), appointment type, account manager. Preference: chips for anything with a known set of answers. (29 dropdowns in the app in all; some — belt series and style from the catalogue — are long lists where a dropdown is right.)
3. **The New screen** asks date, call type and account manager before the account, in separate boxes. Ben's own redesign below (the "What would you like to do?" chooser) covers this.

**Layout**
4. **Controls split between top and bottom.** Inside a call, **Create and share** is at the top while a fixed bar of Camera / Photos / Manuals / Call menu sits at the bottom of every call screen. Preference: never split a screen's controls between top and bottom.
5. **Long scrolling.** The belt form and Settings (about 6,000px) are long single columns. Preference: condense rather than stack.

**Lists and cards**
6. **Rows of buttons on cards.** Call-log entries show camera, gallery, edit and delete buttons on every card; Reports cards show a tick and a bin. Preference: tap the card to open it; secondary actions in a ⋯ menu. (The phone's visit cards already do this right — tap to open, ⋯ for the rest.)
7. **Delete next to other actions.** The bin sits beside edit (call log) and beside the tick (Reports). Preference: never next to the primary action.
8. **No Duplicate action** on call-log entries (a belt, a fault). Preference: anything you'd reasonably copy gets Duplicate, which opens the copy for editing.

**Menus and search**
9. **Permanent search bars** on Reports, Plan (desktop) and New. Preference: an icon that opens a full-screen search.
10. **Settings is a big button on Home.** Preference: admin and setup in a ⋯ menu at the top right.

**Don't push work at me**
11. **Home shows "Never backed up." in red**, and the desktop calendar says "Click an account, or drag it onto a day" when empty. Preference: no nudges on screens; outstanding items live in their own place.

**Branding (CLAUDE.md)**
12. **Red buttons.** Create and share, Done on the entry forms, and Call menu are Intralox red. CLAUDE.md: red is never a button; the primary action is navy `#00287B`. (The task form's Done already is.)

**Small**
13. **Small touch targets.** The bins on calendar cards are 16px (13px in the month view). Preference: at least 40px.
14. **"N/A"** appears in four places in the code that builds output. Worth checking none reach a document. (CLAUDE.md: em dash or omit.)

**Already right:** back chevron and home icon on every screen; tabs on Reports (All / Open / Compiled / Done); "done with nothing to report" is a normal state; output is HTML through the share sheet; delete confirmations name what's lost.

---

## Built (v94): Save done calls to a folder structure on the PC
*Added 2026-10-09; built 2026-10-10. Ben chose: notes file plus photos as
separate files; done calls, new or changed since last saved (a changed call
replaces its old copy); 2026-10-09 date folders; quote requests in their own
folder.*

- Reports → **Save to PC folder**, PC only (Chrome or Edge; the File System
  Access API). Hidden on the phone and in browsers without the API.
- First time picks the folder (e.g. inside OneDrive). The folder is
  remembered on that device only (kv `pcFolder`, never synced); Chrome asks
  once a session to allow it again. Later taps open a menu naming the folder:
  **Save new and changed** or **Choose a different folder** (which saves
  everything done again into the new one).
- Layout `Customer\Site\2026-10-09\`. The account name is split at its first
  " - "; with none, the call's Site field; with neither, the date folder sits
  straight under the customer. Quote requests go in
  `Customer\Quote requests\2026-10-09\`. Two calls at one site on one day get
  `2026-10-09 (2)`.
- In each: the full call notes (or the RFQ), the same HTML Create and share
  makes, plus every photo as its own JPG, named for its entry
  (`Belt 1 <asset> - 1.jpg`, `Additional - 1.jpg`).
- What was saved, and when it was last changed, is kept on the device (kv
  `pcSaved`). A changed call removes only the files the app wrote for it last
  time, then writes again; anything else in the folder is never touched.

## Built (v88): Download manuals and reference files from the Intralox website
*Added 2026-10-09; Ben gave the links and chose "button + new-edition check"
and "links, plus save the installation manual offline".*

- The PDFs sit on Intralox's file host (kc-usercontent.com), which sends
  `access-control-allow-origin: *`, so the app downloads them itself. Only
  reading intralox.com's pages is blocked, so the `intralox-manuals` Supabase
  function (supabase/functions/) reads the two resource pages and returns the
  current link, title, date and size of the MPB and ThermoDrive engineering
  manuals, the MPB installation manual and the ThermoLace HDE instructions.
- Settings → Update data → Engineering manuals: Download for each of the
  three, through the same importer. The installation manual has no series, so
  it is kept whole as one section under its title.
- A signed-in device asks the function once a week; a newer link or file date
  than the one downloaded flags that row and the Update data line.
- Reference → Intralox website: the resource pages, ThermoLace instructions,
  technical resources, Belt Finder and how-to videos, opened in the browser.
- Manuals are still per device (not in cloud sync); downloading on each
  device is now one tap.

---

<!-- Add new ideas above this line. -->
