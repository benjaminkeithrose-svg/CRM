---
name: field-crm-intake
description: Works through the Field CRM intake for Intralox field sales. Field CRM puts a ticket in the Intake folder of the person's PC folder for each finished call or quote request; this skill lists them, does each call's jobs with the other skills (the call report with end-game, a quote request with quote-request, booking follow-ups with visit-planner), makes the emails as Outlook drafts that are never sent, writes a review page, and moves each ticket to Intake\Done. Use when someone asks to work through, process, clear or check their intake, their finished calls, or what Field CRM has sent to Claude.
---

# Field CRM intake: one way in, nothing sent

Field CRM (v193 and later) files each finished call in the person's **PC
folder** (for example `OneDrive\Field CRM`), in its visit folder
`Customer\Site\date` (a quote request: `Customer\Quote requests\date`), with
Field CRM's document, photos and `Field CRM call.json`. Then it puts a small
ticket in `Intake\` there. This skill works through those tickets.

`DOCUMENTATION.md` has every file, field and option.

## The one rule

**Nothing is sent.** Every email is made as a **draft** in Outlook through the
Outlook connection and left there. The person reads it in Outlook and presses
Send. Never call a send action, never reply or forward. Meetings: as the visit
planner skill says (their own appointment; invitees only after a yes).

## Settings

`Intake\intake settings.json` in the PC folder:

```json
{"me": "Jo Bloggs", "email": "jo.bloggs@intralox.com",
 "customer_service": "...", "signature": "Jo Bloggs\nAccount Manager\n0400 000 000"}
```

If it is not there, ask once for the customer service address and their
signature, and offer to save it. Pass `--root "<PC folder>"` to every script.
**Test:** if asked to test the skill, run `python3 scripts/self_test.py`
(made-up data only) and show `examples/`.

## Work through the intake

1. **Check:** `python3 scripts/check_setup.py --root "<PC folder>"`.
2. **List:** `python3 scripts/list_tickets.py --root "<PC folder>"` (add
   `--json` for every field). Show the person the list: each call, what it
   needs, and any problem (a missing file, a newer ticket version). Ask
   whether to do them all, or which.
3. **For each ticket, oldest first, do its jobs:**
   - `report`: the call report. Follow the **end-game** skill on that visit
     folder (`folder` in the list): it reads `Field CRM call.json`, the
     recording and the photos, writes the site walk notes, the customer copy
     and `fieldcrm-import.json`. If end-game is not installed, say so and
     leave this job. **Photos from Google Photos:** the person downloads them
     into the Intake folder (anywhere in it). When the list says photos were
     dropped there, use `<PC folder>\Intake` as the camera roll in end-game's
     collect-photos step (`--from`); it copies each visit's by the time they
     were taken and leaves the rest. Never move or delete them.
   - `quote_email`: `python3 scripts/draft_email.py --root ... --ticket "<ticket>" --kind quote`,
     then create the Outlook draft with exactly the printed fields (to,
     subject, the HTML body, the attachments). Keep the draft's id: put it
     in the draft file as `"outlook_id"`.
   - `quote_ask`: the call has belts and a next step about a quote. Ask
     whether to make a quote request, and which belts. On yes:
     `python3 scripts/to_quote.py "<folder>/Field CRM call.json" [--belts 0,2]`,
     then follow the **quote-request** skill with that `request.json` (it
     checks the belts against the catalogue and draws the request), then a
     `quote` draft with the request it made attached (`--attach`).
   - `customer_email`: after the report is checked, write what the email
     says (short: thanks, what was found, what happens next and when, from
     the report and the next steps; no prices, no internal notes) into a
     text file, then `draft_email.py ... --kind customer --body "<file>"`.
     It attaches the customer copy. Create the Outlook draft.
   - **Every email is filed.** `draft_email.py` saves each email as HTML in
     the visit folder, beside the call report (`<date> Email - <kind> - <customer>.html`),
     so the next pre-call has it. An email another skill makes for this call
     (the quote request skill's email body) is copied into the visit folder
     too. If the person changed an email in Outlook before sending and asks,
     save the sent one again from Sent Items through the connection.
   - `follow_ups`: the dated next steps. For a visit or call, offer to book
     it with the **visit-planner** skill; ask first. Others stay on Field
     CRM's planner: nothing to do.
   - `projects`: projects raised in the call. Nothing to make yet: list them
     in handled.json, so the weekly Dynamics file can be made from Done.
4. **Record and move:** write `handled.json` for the ticket (what was made,
   the drafts with their Outlook ids, meetings booked, what was left and
   why, what to check, the projects; `examples/handled.json`), then
   `python3 scripts/done.py --root ... --ticket "<ticket>" --handled handled.json`.
   A ticket whose jobs were not all done can still be moved: say what was
   left in `skipped`.
5. **Review page:** `python3 scripts/review.py --root "<PC folder>"`. Give
   the person the page (`Intake\Review <date>.html`) and say, in a few lines:
   what was made, how many drafts are waiting in Outlook, what to check.
6. **Back into Field CRM:** say "In Field CRM on the PC, open Reports and
   click Bring in from Claude." That lays the reports into the calls.

## Rules

- Facts only from the visit folder, the call file, the recording and what
  the person says. Never guess a date, a price or a part number.
- The PC folder holds customer data. Read it where it is; never copy any of
  it into this skill's folder or anywhere public.
- Never change Field CRM's own files in the visit folder (`Field CRM call.json`,
  its document, `from Field CRM\`). Claude's own files go beside them.
- A ticket that came again (`again`) is a call changed after it was sent:
  look at what changed; make again only what it affects.
- Australian English; short, factual emails.
