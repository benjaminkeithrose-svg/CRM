# Field CRM intake skill

A Claude skill, separate from Field CRM, for Claude Enterprise on the PC. It
works through the tickets Field CRM (v193) leaves in the Intake folder of the
PC folder: each finished call or quote request gets its jobs done with the
other skills (end-game for the report, quote-request, visit-planner), its
emails made as Outlook drafts that are never sent, and a review page; then
the ticket moves to `Intake\Done`.

- `field-crm-intake/` is the skill itself, exactly as it goes into the zip.
  Start with its `DOCUMENTATION.md`.
- `make_package.py` rebuilds the zip: the documentation page, the self-test,
  then the zip.

It exchanges files with the app, each with a `kind` and a version: the
ticket (`inTicket` in `app.js`, kind `field-crm-intake-ticket`), the call
file (`clCallFile`, `field-crm-call-for-claude`) and Claude's report
(`clApply`, `field-crm-claude-report`, written by the end-game skill). Change
both sides together; `tests/qa-intake-skill.mjs` runs the self-test and
checks the kinds and the ticket's fields still match the app.

Everything in it is made up (Example Foods, Jo Bloggs). No customer data goes
in here.

## After changing the skill

1. Run `python3 intake-skill/make_package.py --out <folder>`.
2. Upload `field-crm-intake.zip` in Claude: Settings, Capabilities, Skills.
