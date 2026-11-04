# Visit planner skill

A Claude skill, separate from Field CRM, for Claude Enterprise on the PC, made
for colleagues who do not use Field CRM. It books customer meetings from what
the person says, as standard invites (site visit, health check or site walk,
Teams or phone call) in Field CRM's invite layout (`inviteParts` in `app.js`),
in the customer's own time zone; puts them in Outlook through the Outlook
connection, or as a calendar file written the way Field CRM's planner writes
them (`buildIcs`: folded at 75 octets, VTIMEZONE, stable UID and SEQUENCE, no
organiser or attendees, ever); and plans a week from the CRM export by focus
cadence (`CAD_DAYS`) and zone.

- `visit-planner/` is the skill itself, exactly as it goes into the zip. Start
  with its `README.md` and `DOCUMENTATION.md`.
- `make_package.py` rebuilds the zip: the documentation page, the self-test,
  then the zip.

It is not part of the app and exchanges no files with it, so a change here
needs no version bump. It carries copies of three things from the app, which
should change with it:
- the zone map, `data/zones.json` from `zones.js` (`tests/qa-visit-skill.mjs`
  fails if they differ; regenerate it with the one-liner in that test's header);
- the cadence days by focus (`plan_week.py`, from `CAD_DAYS` and `CAD`);
- the calendar file rules and the time zone rules (`scripts/ics.py`, from
  `buildIcs`, `fold` and `TZDB`).

Everything in it is made up (Example Foods, Jo Bloggs); its CRM export is a
`.txt` because `.gitignore` blocks `.csv`. No customer data goes in here.

## After changing the skill

1. Change the files in `visit-planner/`.
2. Run `python3 visit-planner-skill/make_package.py --out <folder>` (needs
   `pip install markdown`).
3. Check the self-test passed.
4. Add a line to the versions table at the end of `DOCUMENTATION.md`.
5. Upload the new `visit-planner.zip` in Claude in place of the old one.
