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

<!-- Add new ideas above this line. -->
