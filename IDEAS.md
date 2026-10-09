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
- **Checked against the actual app and not accurate as stated: "no Save buttons."** `index.html` has several — `dSave` (the appointment dialog), `bSave` ("Add belt to call log"), `pSave` ("Add project"), `nSave` ("Add note"), `hSave` ("Add fault"). Explicit Save/Add buttons per entry type are this app's existing convention, not something it avoids. Whatever this point in the original note was trying to capture, it needs re-checking against the real app before new screens are designed around it.

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
7. What image resolution does "full-size" actually need to be?
8. Bundle encryption into the sync work now, or keep relying on "private repo + the app's enforced privacy check" for the time being?

---

<!-- Add new ideas above this line. -->
