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

<!-- Add new ideas above this line. -->
