# Visit planner skill

A Claude skill for Claude Enterprise on the PC. It books customer meetings as
standard invites, in Field CRM's invite layout, and puts them in Outlook. It
also plans a week of visits from the CRM export. This page has everything
about it; `README.md` covers installing and using it.

## What it makes

For each meeting, in the visits folder:

| File | What it is |
|---|---|
| `meetings/<date> <customer>.json` | The meeting, written by Claude (fields below). Kept, so a meeting can be changed, moved or cancelled later |
| `<date> <Title> - <Customer>.ics` | The calendar file. Opened in Outlook, Save & Close puts it in the calendar; a later file for the same meeting replaces it |

With `--json`, `make_meeting.py` also prints the event for the Outlook
connection: `subject`; `start` and `end`, each with `dateTime` (the
customer's local time), `timeZone` (IANA), `windowsTimeZone` and `utc` (when
the PC has a time zone database); `location`; `body_html` (every style on its
element, for Outlook) and `body_text`; `show_as` (`oof` for a visit, `busy` for
a call); `reminder_minutes`; `categories`; `is_online_meeting` (a Teams call);
`invite`; and `attendees`, empty unless `invite` is true.

## Invites and attendees

The calendar file never has an organiser or attendees, whatever the meeting
says. With them, Outlook takes the item as a meeting you called and offers to
email the customers on every change; Field CRM dropped them for that reason in
v163. So a meeting is the person's own appointment, with the contacts listed in
its notes.

A meeting with `"invite": true` carries its contacts as `attendees` in the
event for the Outlook connection. Creating, moving or cancelling such an event
emails them, so Claude shows who and what first and waits for a yes. Without
the connection, the person opens the file in Outlook, adds the people and
presses Send.

## The visits folder

`visit-planner settings.json`:

| Field | Meaning |
|---|---|
| `me` | Your name as the CRM export spells the account manager. Needed to plan a week |
| `email` | Your email |
| `crm_export` | The CRM export Field CRM imports (.xlsx or .csv). For finding customers and planning a week |
| `home_tz` | Your time zone (IANA, e.g. `Australia/Sydney`), for a meeting whose site is not known |
| `out` | Where the calendar files go. Default: the folder itself |
| `templates` | Your own templates. Default: the folder's `templates` subfolder |
| `day_start`, `day_end` | Your working day, for proposing times. Default 08:00 and 17:00 |

## The meeting

| Field | Meaning |
|---|---|
| `template` | `site-visit`, `health-check`, `teams-call`, or one of your own |
| `customer` | The CRM account name, as in Field CRM ("Example Foods - Smithfield"). The site after " - " gives the zone and the time zone |
| `site`, `location` | Overrides for the site and the location line |
| `zone`, `tz` | Overrides for the zone (`Z1`) and time zone (IANA) |
| `date`, `start` | `YYYY-MM-DD` and `HH:MM`, the customer's local time |
| `minutes` | How long; default the template's |
| `topic` | What a call is about |
| `agenda` | Free text |
| `follow_ups` | A list: what to close or cover |
| `lines` | A list: the lines to walk (health check) |
| `bring` | A list, in place of the template's |
| `teams_link` | A Teams link to put in, when there is one already |
| `contacts` | `name`, `role`, `email`, `mobile` |
| `invite` | `true` only when the person said to invite them |
| `notes` | Free text |
| `changes` | Changes for this meeting only (below) |
| `uid`, `sequence`, `built` | Written by `make_meeting.py`: its identity, its version, and what it was made from. A changed meeting gets a higher `sequence` |
| `outlook_id` | The event's id in Outlook, kept by Claude when the connection made it |
| `cancelled` | `true` once cancelled |

## Templates

`templates/site-visit.json`, `health-check.json` and `teams-call.json` are
built in. A file of the same name in your templates folder wins, and a new
name there is a new kind of meeting. `make_meeting.py --list-templates` and
`--show-template <name>` show them.

| Field | Meaning |
|---|---|
| `id`, `title`, `about` | Its name, the heading in the invite, one line on what it is for |
| `subject` | The subject, with `{customer}` and other meeting fields in braces. Field CRM's is "Site visit: Customer" |
| `minutes`, `busy`, `reminder` | Default length; `oof`, `busy`, `tentative` or `free`; reminder minutes before |
| `location` | The location line, e.g. `{site_full}` or `Microsoft Teams` |
| `categories`, `online` | Outlook categories; whether it is an online meeting |
| `sections` | In order: `rows` (label and field pairs), `text` (`key`, `empty` when not given), `list` (`key`, `default`), `contacts` |

Changes for one meeting (`changes`): `title`, `subject`, `minutes`, `busy`,
`reminder`, `location`, `categories`; `hide` (section headings); `rename`
(`{"old": "new"}`); `sections` (`[{"heading", "rows" or "items" or "text", "after"}]`).

## Planning a week

`plan_week.py` reads the CRM export, as Field CRM does: one account per
Account Name, its Account Focus setting the cadence (High quarterly, 91 days;
Medium half-yearly, 182; Low yearly, 365; No Focus none). An account is due
when its last visit is older than that, or it was never seen. The last visit is
the export's **Last Appointment**, or without one its **Last Activity Date**.
Field CRM itself also counts the calls it has logged, which the export does
not have, so the two can differ for an account visited recently and not yet
in Dynamics. Dates are read as the export gives them: an Excel date, ISO, or
day first (12/03/2026).

Only accounts with you as Account Manager, unless `--all`. Grouped by zone, in
Field CRM's zone order, the High focus and most overdue first. `--zones Z1,Z2`
keeps only those. Field CRM's account zone overrides are not here (they name
customers and stay on the device), so an account it has moved to another zone
shows in its suburb's zone.

## The zone map

`data/zones.json` is a copy of Field CRM's `zones.js`: 31 zones of Australia
and New Zealand, each with its hub, suburbs and time zone. Geography only.
`tests/qa-visit-skill.mjs` in the Field CRM repository checks the copy still
matches.

## The scripts

| Script | Does |
|---|---|
| `check_setup.py --settings F` | Says what this PC has and what is missing |
| `find_customer.py EXPORT ...` | Finds the account in the CRM export, and prints one as JSON |
| `make_meeting.py meeting.json --settings F [--json]` | Makes the calendar file, and prints the event for Outlook |
| `plan_week.py --settings F --week YYYY-MM-DD [--zones ..]` | The accounts due a visit, by zone |
| `self_test.py` | Checks everything with made-up data |

Python 3.8 or later. `openpyxl` reads an .xlsx export; `tzdata` gives the UTC
times on Windows. Everything else is the standard library.

## Data

The CRM export (customer data) is read where it is on the PC; neither it nor
anything read from it goes into the skill's folder. What reaches Claude is
what the person says, the export rows it reads and their calendar through the
connection, under Intralox's Claude agreement. The skill holds made-up
examples only (Example Foods, Jo Bloggs).

## Versions

| Version | Date | What changed |
|---|---|---|
| 1 | 2026-11-04 | First version: site visit, health check and Teams call invites; the Outlook connection or a calendar file; invites only when asked; a week planned from the CRM export by cadence and zone. |
