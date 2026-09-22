# Ben's preferences

These apply to every project. A project's own CLAUDE.md wins where the two
disagree — for example, a project with a corporate brand overrides the visual
defaults below.

## How to work with me

- I'm an engineer, not a developer. I read code and follow the logic. I don't
  use a terminal and I'm new to git.
- Be direct and efficient. No preamble, no recap of what I just said.
- I often dictate. Turn rough, spoken input into precise output. Don't ask me to
  restate something that's clear enough to act on.
- **When I give a series of design notes, summarise them back and ask before
  building.** Don't start building off a list of notes.
- Flag ambiguities early rather than waiting until you have everything.
- Don't raise opinions on things that are my technical or business call. Capture
  what I give you.
- **Instructions for me are numbered, plain English, one action per step.** "Click
  this. Type this. Click that." No jargon without saying what it means, no jumping
  between options, no "just do X" where X is itself several steps. Give me one way
  to do it, not three.
- Before building something big, say plainly what you'll build and ask. For
  small, clear fixes, just do them.
- Tell me which files changed and what I should check.
- Say what was actually tested and what wasn't. Headless tests are not a phone
  test. Never imply something was checked on a device when it wasn't.
- If you find a bug next to the one I asked about, tell me — don't silently fix
  it unless it's in the code you're already changing.
- If I've asked for something and you notice a real problem with it, say so once,
  briefly, then do what I decide.

## How I like apps to behave

### Navigation

- **On-screen buttons for everything.** I don't use Android back or swipe
  gestures and find them confusing.
- A header with a back chevron and a home icon. Back goes up one level in the
  app's structure, not back through history.
- Icons rather than text labels in headers and toolbars. Give every icon an
  accessible name. If an icon isn't obvious, a short word is fine — "Today"
  beats any calendar icon.

### Layout

- **The main action goes at the top of the screen, not the bottom.** I don't want
  to scroll past everything to reach the one button I came for.
- **Never split a screen's controls between the top and the bottom.** I lose track
  of where things are.
- Avoid long scrolling. Condense rather than stack.
- Phone versions of screens are lighter versions of the desktop ones, not the same
  screen squashed. Cut what isn't needed on the road.

### Lists and cards

- Cards carry the minimum: the name, and the one or two things I need to
  recognise it. Everything else goes behind a tap.
- **Tap the card to open or edit it.** No separate Edit button on the card.
- Secondary actions go in a **⋯ menu** on the card, not a row of buttons.
- Separate states with tabs (e.g. Open / Compiled / Done) rather than mixing them
  in one list.
- Every list item I'd reasonably want to copy gets a **Duplicate** action that
  opens the copy for editing, rather than saving it straight away.

### Menus, dialogs and search

- Options I only need occasionally go in a menu or a pop-up sheet, not as
  permanent controls on the screen.
- Admin and setup functions hide in a **⋯ menu at the top right**.
- **No permanent search bar.** An icon opens a full-screen search, and the
  searching happens there.

### Entering data

- **No Save buttons on entry screens.** A **Done** button leaves the screen and
  saves. If nothing was entered, discard silently — no empty ghost entries. If it's
  half-filled, keep it as a draft and tell me.
- **Dropdowns and chips for anything with a known set of answers.** Free text only
  where the answer really is free.
- Chips (pill buttons) for short option sets like material or colour. Tap again
  to deselect.
- **Auto-filled or estimated values are badged as estimates**, and never overwrite
  something I typed. Once I type over one, the badge goes off.
- Related fields stay independent. Don't link two fields so tightly that editing
  one rewrites the other.
- For anything customer-facing, restrict choices to an agreed list, with a flagged
  "other" route rather than a hard block.
- Photos attach straight away and get checked in a viewer that zooms.

### Destructive actions

- Delete gets a confirmation that names exactly what will be lost — which
  record, how many entries, how many photos. Cancel is the safe default.
- Delete is a bin icon, in the warning colour, never next to the primary action.

### Don't push work at me

- No suggestions or nudges on an empty screen.
- Overdue or outstanding items live in their own place, not surfaced where I'm
  trying to do something else.
- "Done with nothing to report" is a normal finished state, not an incomplete one.

## How I like apps to look

Defaults for personal projects. A project with its own brand replaces these.

- Light layout: pale background, white cards, lots of white space.
- Cards: white, 1px light-grey border, **3px coloured stripe down the left edge**,
  8px rounded corners, very faint shadow.
- **One accent colour for actions.** Primary buttons are full width, solid accent
  fill, white bold text. Secondary buttons are outlined in the accent colour.
- **Red is only for destructive actions and errors.** Never on a normal button.
- Section headings: small, uppercase, letter-spaced, grey.
- Segmented controls (joined buttons) for two to four mutually exclusive options,
  with the selected one tinted.
- Messages under a field in tinted boxes: green for OK, amber for a warning, blue
  for information.
- Touch targets at least 40px.
- System sans-serif font. Body text 15px, inputs 16px so phones don't zoom in.

## How I like apps built

Unless a project says otherwise:

- Vanilla HTML, CSS and JavaScript. No framework, no build step.
- As few external libraries as possible. Say so before adding one.
- Works offline. Data stays on the device unless I've asked for it to go
  somewhere.
- Never commit customer or personal data to a repo.
- Output documents that go into Outlook use inline styles only — Outlook strips
  stylesheets, classes and scripts. Print-ready on A4.
- In output tables, leave empty fields out or show an em dash. Never write "N/A".
