---
name: visit-planner
description: Books customer meetings for Intralox field sales in Australia and New Zealand from what the person says, as standard invites (site visit, health check or site walk, Teams or phone call) with the agenda, follow-ups and people, in the customer's own time zone; adds, moves and cancels them in Outlook through the Outlook connection, or gives a calendar file (.ics); and plans a week of visits from the CRM export by focus cadence and zone. Use when someone asks to book, plan, schedule, invite, move or cancel a visit, call or meeting with a customer, or asks who is due a visit.
---

# Visit planner: standard invites, into Outlook

One meeting becomes, in the person's visits folder:

- **`meetings/<date> <customer>.json`**: what the meeting is (Claude writes it);
- **`<date> <Title> - <Customer>.ics`**: the calendar file, which opens in Outlook;
- and, with the Outlook connection, the event in their calendar.

A script turns the meeting into the invite, so every invite looks the same:
Field CRM's layout, with the agenda, follow-ups and people, and the customer's
time zone. `DOCUMENTATION.md` has every field and option.

## Settings

The person's **visits folder** on the PC holds `visit-planner settings.json`:

```json
{"me": "Jo Bloggs", "email": "jo.bloggs@intralox.com",
 "crm_export": "C:/.../CRM export.xlsx", "home_tz": "Australia/Sydney"}
```

`me` is their name as the CRM export spells the account manager. `crm_export`
is the export Field CRM imports. `home_tz` is used when a customer's site is
not known. If there is no settings file, ask once and offer to save it. Pass
`--settings "<folder>"` to every script. **Test:** if asked to test the skill,
run `python3 scripts/self_test.py` (made-up data only) and show `examples/`.

## The one rule about invites

**Nothing goes to a customer without the person saying yes to that meeting.**

- By default a meeting is the person's own appointment: the contacts are
  listed in its notes, and nobody is emailed. The calendar file never has an
  organiser or attendees (Outlook would then email the customers on every
  change).
- Only when the person says to invite them, set `"invite": true`. Before
  creating, moving or cancelling an event with attendees through the Outlook
  connection, show who will be emailed and what, and wait for a yes. Moving
  or cancelling one emails them too.
- Without the connection, say: open the file in Outlook, add the people,
  then press Send.

## Book a meeting

1. **Check the tools:** `python3 scripts/check_setup.py --settings "<folder>"`.
2. **What, who, when.** From what they said: the kind (site visit, health
   check, Teams or phone call), the customer, the day and time, how long if
   said, the agenda, follow-ups, the lines to walk. Ask for a day or time
   that was not given; never guess one.
3. **The customer.** `python3 scripts/find_customer.py "<crm_export>" --name "..." --people "..."`,
   then `--account "<exact name>"` for the account manager and contacts. Use
   the account name as the CRM has it ("Example Foods - Smithfield"): the site
   after " - " gives the zone and time zone. Ask if the match is not clear.
4. **Pick the template:** `site-visit`, `health-check` or `teams-call`
   (`make_meeting.py --list-templates` shows the person's own too). A phone
   call is `teams-call` with `"changes": {"title": "Phone call", "subject":
   "Phone call: {customer}", "location": ""}`.
5. **Write the meeting** in `meetings/` in the visits folder (fields in
   `DOCUMENTATION.md`; examples in `examples/`).
6. **Check the calendar** through the connection for a clash at that time.
   Say if there is one, and what it is.
7. **Make it:** `python3 scripts/make_meeting.py "<meeting.json>" --settings "<folder>" --json`.
   It writes the calendar file and prints the event.
8. **Into Outlook.**
   - With the connection: show the subject, day, time (and time zone if not
     theirs) and whether anyone is invited. On yes, create the event with the
     printed fields: subject, start and end (the IANA or Windows time zone,
     whichever the connection takes, or the UTC times), location, the HTML
     body, show as, reminder, categories, an online meeting for a Teams call,
     and the attendees only when `invite` is true. Keep the event's id in the
     meeting file as `"outlook_id"`.
   - Without it: give the calendar file. Opened in Outlook, Save & Close
     puts it in the calendar.

## Change, move or cancel

- **Change or move:** change the meeting file and run `make_meeting.py`
  again. It raises the `sequence`. Update the Outlook event by its
  `outlook_id` (asking first if it has attendees), or give the new file:
  opened in Outlook it replaces the old one, because the UID is the same.
- **Cancel:** delete the event through the connection, asking first if it
  has attendees (they get a cancellation). Without the connection, they
  delete it in Outlook. Mark the meeting file `"cancelled": true`.

## Plan a week

1. `python3 scripts/plan_week.py --settings "<folder>" --week <Monday>`
   lists their accounts due a visit, by zone: past the cadence their focus
   sets (High quarterly, Medium half-yearly, Low yearly), or never seen.
   `--zones` narrows it.
2. Look at their calendar for that week through the connection: what is
   already booked, and where.
3. Propose the week as a short table: day, zone, the accounts in it (two or
   three a day in one zone, the most overdue High focus first), a time for
   each. Travel between zones takes a day; say so.
4. Nothing is booked until they say. Then book each as above, one meeting
   file each.

## Changes on the fly

- For one meeting: `changes` in the meeting file (`title`, `subject`,
  `minutes`, `busy`, `reminder`, `location`, `hide`, `rename`, `sections`).
- For every meeting from now on: copy the template
  (`--show-template site-visit`) into their `templates` folder and change the
  copy. Never change this skill's own templates. A new kind of meeting is a
  new template file there.

## Rules

- The CRM export stays where it is on the PC. Never copy it, or anything
  from it, into this skill's folder or anywhere public.
- Facts only from what was said, the CRM export and the calendar.
- Times are the customer's local time; say the zone when it is not theirs.
- Australian English; short, factual agendas.
