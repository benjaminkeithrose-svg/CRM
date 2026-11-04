---
name: quote-request
description: Writes a request to Intralox customer service (a belt request for quote, or a sprocket and parts request for quote) in the same layout as Field CRM's quote request, from an email, an attachment or what the person says. Looks up belts and sprockets in the Intralox catalogue read from the plant audit workbook on the PC (series, style, material, colours on file, built widths, sprocket bore, pitch diameter, material, part number) so the specification is right, and lists anything that needs confirming. Gives a file to attach and an email body that keeps its tables in Outlook. Use when someone asks to write, raise, draft or send a quote request, RFQ or request to customer service, or asks which belt or sprocket fits.
---

# Quote request: to customer service, in Field CRM's layout

One request becomes, in the quote requests folder on the PC:

- **`<Customer> - Belt RFQ - <date>.html`** (or `Sprocket RFQ`): the request
  to attach, laid out as Field CRM's quote request, photos inside it;
- **`... - email.html`**: the same for the body of an email, styles written
  on every element so Outlook keeps the tables, no pictures;
- **`... - email.txt`**: the same as plain text.

A script draws them from `request.json` and a template, so every request
looks the same. `DOCUMENTATION.md` has every field, the template format and
the lookup commands.

## Settings

Everything about the person lives in their **quote requests folder** on the
PC, never in this skill's folder (it may be read only):
`quote-request settings.json` there holds

```json
{"workbook": "C:/.../Plant_Audit_Template_1.xlsm",
 "crm_export": "C:/.../CRM export.xlsx",
 "accessories": "C:/.../OneTrack accessories.json",
 "customer_service_email": "...",
 "out": "", "templates": ""}
```

Only `workbook` is needed. `crm_export` (the Field CRM CRM export) lets you
check the customer and contacts. `out` defaults to the folder itself,
`templates` to its `templates` subfolder. If there is no settings file, ask
for the folder and the workbook once, and offer to save the file. Pass
`--settings "<folder>"` to every script.

Can't reach the PC's folders? Ask them to attach the workbook, work in a
folder of your own, and give them the files at the end.

**Test.** If they ask to test the skill, run `python3 scripts/self_test.py`
(made-up data only), then show `examples/` and say what each file is.

## Steps

1. **Check the tools.** `python3 scripts/check_setup.py --settings "<folder>"`.
   Install what it says is missing with pip (`openpyxl` is needed; `pillow`
   for smaller photos).

2. **Read what came in.** The email pasted or attached (an .msg or .eml,
   or through an email connector if there is one), its attachments
   (photos, drawings, a spec sheet), and what the person says. Note the
   customer, who asked, what they want, quantities, dates, and anything
   said about the belt or sprocket now fitted.

3. **The customer.** With a CRM export in the settings:
   `python3 scripts/find_customer.py "<crm_export>" --name "..." --people "..."`,
   then `--account "<exact name>"` for the account manager and contacts.
   Ask if the match is not clear. Not in the CRM: `"in_crm": false`. A person
   who is not a contact there: that contact's `"in_crm": false`.

4. **Pick the template.** `belt-quote` for belts (with their sprockets in
   the belt's Sprockets band); `sprocket-quote` for sprockets or other parts
   on their own. `python3 scripts/build_request.py --list-templates --settings "<folder>"`
   shows them, including the person's own. Ask if unsure.

5. **Specify each item with the catalogue.** Never from memory.
   - Belt: `lookup.py belt --series ... --style ... --material ... --colour ... --width ...`
     walks series, style and material, says the colours on file and checks
     the width against built widths, as Field CRM's belt form does. Use
     `styles`, `materials`, `colours` and `search` to find the names.
   - Sprocket: `lookup.py sprockets --series ...`, then add `--bore`,
     `--pd` and `--material` as they are known; it lists the description and
     part number of each that fits. `lookup.py part <number>` finds a part
     number from the email.
   - `lookup.py lists` gives rod materials, flight and sideguard types and indents.
   - Accessories (wearstrips, retainer rings, CleanLock sprockets, rollers,
     shafts, spacers, scrapers, tools): `lookup.py accessories` reads Field CRM's
     OneTrack accessory list (`accessories` in the settings). `--group` and
     `--series` narrow it; words search it. The usual wearstrip is the snap-on,
     500 ft, for a 1/4 in frame, unless the email says otherwise. A belt's go in
     its `accessories`; on their own, in the sprocket and parts request's `parts`.
   - Write the catalogue's own names, spelt as it spells them.
   - Only what the email, the person or the catalogue establishes. Never pick
     between several that fit (split or solid, two pitch diameters): ask, or
     put the choice in `checks`. Never invent a dimension or part number.
   - Colours and materials "on file" are those found in plants, not all that
     are made: one not on file is a question for customer service (`checks`),
     not an error.
   - Every warning from the lookups (a width between built widths, a colour
     not on file, a name not found) goes in `checks`, in a plain sentence.

6. **Write `request.json`** in the quote requests folder (a worked example:
   `examples/example-belt-request.json`). Photos from the email go in a
   `photos` subfolder, each named in `photos` with a one-line `caption`.
   Comments and notes in Australian English, short and factual.

7. **Changes on the fly.**
   - For this request only: `changes` in `request.json` (`hide`, `rename`,
     `require`, `optional`, `add_rows`, `add_fields`, `sections`, `title`,
     `footer`; see `DOCUMENTATION.md`). An item's own extra rows go in its
     `other`.
   - For every request from now on: copy the template
     (`--show-template belt-quote`) into the person's `templates` folder,
     change the copy, and say so. Never change this skill's own templates.
     A new kind of request is a new template file there.

8. **Make the files.**
   `python3 scripts/build_request.py "<folder>/request.json" --settings "<folder>"`.
   Never write or edit the documents yourself: change `request.json` and run
   it again. It lists required fields not given (they print as a dash, so
   customer service sees them); ask the person for them first if they can
   answer, and fix any warning.

9. **Hand it over**, in a few lines: the files, the "To confirm" list, any
   required field still missing. Then, numbered:
   1. If you can make an email draft (an email connector), offer one to
      customer service (`customer_service_email`), with `email.html` as the
      body and the request file attached. Otherwise:
   2. Open the `email.html` file in Edge, press Ctrl+A, then Ctrl+C.
   3. In Outlook, start the email to customer service and press Ctrl+V.
   4. Attach the request file (the `.html` without "email").

## Rules

- The catalogue and the CRM export stay where they are on the PC. Never copy
  them, or anything read from them, into this skill's folder or anywhere public.
- Facts only from the email, the person, the catalogue and the CRM export.
- Field CRM's layout: keep the template's field names and order unless the
  person asks for a change.
- If something is missing, build from what there is and say what is missing.
