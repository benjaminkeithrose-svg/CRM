# Field CRM intake

A Claude skill for Claude Enterprise on the PC. Field CRM hands it each
finished call or quote request through a folder; it does the jobs each one
needs with the other skills, makes every email as an Outlook draft, and
leaves a review page. **Nothing is sent**: the person reads each draft in
Outlook and presses Send.

## How it fits together

1. A call is finished in Field CRM, on the phone or the PC, and syncs.
2. Field CRM on the PC (v193 and later) files it in the PC folder, as Save
   to PC folder does: `Customer\Site\date` (a quote request in
   `Customer\Quote requests\date`), with Field CRM's document (the call
   notes, or the quote request), the photos, and `Field CRM call.json`, the
   file Save for Claude writes. Then it writes a ticket in `Intake\`. It does
   this after each sync, when a call is marked done on the PC, and from
   Reports, Send to intake.
3. The person says "Work through my intake". This skill lists the tickets
   and does their jobs: the call report (end-game skill), the quote email,
   a quote request from the call (quote request skill), the customer's
   follow-up email, booking a follow-up visit (visit planner skill).
4. Each ticket goes to `Intake\Done\` with what was done for it. A review
   page lists it all.
5. In Field CRM, Reports, Bring in from Claude lays each report back into
   its call (the documents kept on the call, the summary, the follow-ups).

Only the person's own calls go to the intake, never a colleague's from the
team, and not a call closed with nothing to report. The first time Field
CRM sends, it sends the last fortnight's.

## Files in the PC folder

| File | Written by | What it is |
|---|---|---|
| `Intake\<date> <customer> (<id>).json` | Field CRM | The ticket: one per call, replaced if the call changes |
| `Intake\` (any picture, any subfolder) | the person | Photos downloaded from Google Photos. The call report collects each visit's by the time it was taken; they are never moved or deleted |
| `Intake\intake settings.json` | the person (or Claude, asked) | `me`, `email`, `customer_service` (where quote requests go), `signature` |
| `Intake\Done\<ticket>.json` | `done.py` | The ticket, with `handled`: what was done |
| `Intake\Review <date>.html` | `review.py` | The day's review page |
| `<visit folder>\Field CRM call.json` | Field CRM | The call: every entry, its contacts, the account's contacts |
| `<visit folder>\<Field CRM document>.html` | Field CRM | The call notes, or the quote request |
| `<visit folder>\from Field CRM\` | Field CRM | The call's photos |
| `<visit folder>\fieldcrm-import.json` | end-game skill | Claude's report, for Bring in from Claude |
| `<visit folder>\<date> Email - <kind> - <customer>.html` | `draft_email.py` | The email itself, filed beside the call report: to, cc, subject, attachments, then the body. For the next pre-call |
| `<visit folder>\drafts\<kind> - <customer>.json` | `draft_email.py` | An email draft: what went into Outlook, and its `outlook_id` |
| `<visit folder>\request.json` | `to_quote.py` | A call's belts as a quote request, for the quote request skill |

## The ticket

Kind `field-crm-intake-ticket`, version 1. Made by `inTicket` in Field
CRM's `app.js`; change both together.

| Field | What it is |
|---|---|
| `made`, `app` | When Field CRM wrote it (ms), and its version |
| `again` | true when the call changed after it was first sent |
| `callId`, `customer`, `site`, `date`, `type`, `quote`, `noReport`, `mgr` | The call: its id, the account name, the site typed on it, the day (ISO), the call type, a quote request or not, closed with nothing to report, the account manager |
| `folder`, `folderParts` | Its visit folder inside the PC folder, as a Windows path and as parts |
| `files` | `call` (`Field CRM call.json`), `notes` (Field CRM's document), `photos` (`from Field CRM`), `report` (`fieldcrm-import.json`) |
| `contacts` | The people on the call ticked for documents: `name`, `email`, `role` |
| `steps` | The call's open next steps (they live in Field CRM's planner, not in the call file): `what`, `type`, `project`, `date` |

## The jobs

`list_tickets.py` proposes them; Claude does them, asking where the skill says.

| Job | When | What Claude does |
|---|---|---|
| `report` | A call with no report newer than its ticket | Follows the end-game skill on the visit folder |
| `quote_email` | A quote request | A draft to customer service with Field CRM's quote request attached |
| `quote_ask` | A call with belts and a next step about a quote | Asks; on yes, `to_quote.py`, then the quote request skill, then a quote draft |
| `customer_email` | A call with a contact ticked for documents who has an email | After the report is checked, a draft to them with the customer copy |
| `follow_ups` | Dated next steps | Offers to book a visit or call with the visit planner skill |
| `projects` | Projects raised on a call | Lists them in `handled`, for the weekly Dynamics file (next round) |

## The scripts

| Script | What it does |
|---|---|
| `check_setup.py --root <PC folder>` | Python, the folders, the settings |
| `list_tickets.py --root <PC folder> [--json] [--done]` | The tickets, what is in each folder, and the jobs. Changes nothing |
| `to_quote.py <call file> [--belts 0,2] [--out] [--ref]` | The call's belts (with their accessories and photos), contacts and notes as the quote request skill's `request.json` |
| `draft_email.py --root --ticket --kind quote\|customer\|other [--to] [--cc] [--subject] [--body] [--attach]` | An email for Outlook as a draft file: inline-styled HTML and text, the attachments, the signature; made again, it keeps its `outlook_id` so the same draft is updated |
| `done.py --root --ticket --handled handled.json` | Moves the ticket to `Intake\Done` with what was done; a ticket that came again keeps the first time under `handled_before`; a newer ticket that arrived meanwhile stays in the intake |
| `review.py --root [--date] [--out]` | The review page: per call the folder, what was made, the drafts (to, subject, not sent), meetings booked, what to check, what was left; then what is still waiting. Inline styles, A4 |
| `self_test.py` | Everything above on a made-up PC folder; nothing is left behind |

## handled.json

What Claude did for one ticket (`examples/handled.json`): `made` (files in
the visit folder), `drafts` (each `kind`, `to`, `subject`, `outlook_id`,
`file`), `booked` (each `what`, `date`, `outlook_id`), `skipped` (each `job`
and `why`), `to_check`, `projects`, `note`. `done.py` adds `at` and `kind`
(`field-crm-intake-handled`).

## What leaves the PC

The skill reads the PC folder where it is. What reaches Claude is what is
in the visit folders and what the person says, under Intralox's Claude
agreement. The drafts go to the person's own Outlook through the Outlook
connection and stay there. Field CRM's database is never touched: the
reports reach it when Bring in from Claude saves them, encrypted like any
change.

## Changes

| Version | Date | What changed |
|---|---|---|
| 1 | 2026-11-04 | First version, with Field CRM v193: tickets, jobs, drafts, done, review. Photos downloaded from Google Photos into the Intake folder are counted, and the call report collects each visit's from there. Every email is filed as HTML in the visit folder, beside the call report. |
