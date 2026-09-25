# Ideas backlog

Rough ideas to build later. Nothing on this list has been built — the app
doesn't change until an idea here is turned into real work in `index.html`,
`app.js`, etc.

---

## Open: Neater comment fields — line breaks, bullets, speech-to-text
*Added 2026-09-24*

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

**Recommendation when this is picked up:** test both (1) options on the
phone first — this may turn out to need little or no code. Then decide
whether the bullet handling (3/4) and an in-app mic (2) are worth doing.

---

## Open: Brand the saved output HTML with the app icon
*Added 2026-09-25*

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

**Recommendation when this is picked up:** do (1) — cheap, consistent with
how the logo is already embedded, and a real (if partial) improvement.
Confirm with Ben whether that's the perception problem he's solving, or
whether it's actually the pre-open attachment icon, before spending any
more time on this.

---

<!-- Add new ideas above this line. -->
