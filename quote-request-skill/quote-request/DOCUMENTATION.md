# Quote request skill

A Claude skill for Claude Enterprise on the PC. It writes a request to
customer service from an email or a conversation, in the same layout as
Field CRM's belt request for quote. It looks up belts and sprockets in the
Intralox catalogue, which it reads from the plant audit workbook on the PC.
This page has everything about it. `README.md` covers installing and using it.

## What it makes

For each request, in the output folder (the quote requests folder unless the
settings say otherwise):

| File | What it is |
|---|---|
| `<Customer> - Belt RFQ - <date>.html` | The request to attach. Field CRM's stylesheet, the Intralox masthead and the photos are inside it, so it opens anywhere and prints on A4. |
| `<Customer> - Belt RFQ - <date> - email.html` | The same, for the body of an email. Every style is written on its element, because Outlook drops stylesheets. There are no pictures, because Outlook on the PC blocks pictures held in an email: a line says how many photos are in the attached file. |
| `<Customer> - Belt RFQ - <date> - email.txt` | The same as plain text, for anywhere formatting is lost. |

A sprocket and parts request says `Sprocket RFQ` instead. A template of your
own uses its own `file_label`.

## The quote requests folder

Everything about you lives in a folder on your PC, never in the skill's
folder, which Claude may only be able to read:

```
<quote requests folder>\
  quote-request settings.json   where things are (below)
  belt-catalogue.json           the catalogue read from the workbook, kept for speed
  templates\                    your own templates, which win over the built-in ones
  photos\                       photos from emails
  request.json                  the request being written
  <the requests it makes>
```

`quote-request settings.json`:

| Field | Meaning |
|---|---|
| `workbook` | The plant audit workbook (`Plant_Audit_Template_1.xlsm`). Needed. |
| `crm_export` | The CRM export Field CRM imports (.xlsx or .csv). Optional: lets Claude find the customer, the account manager and the contacts, and flag anyone not in the CRM. |
| `accessories` | Field CRM's OneTrack accessory list (.json), the same file Field CRM imports in Settings. Optional: for `lookup.py accessories`. |
| `customer_service_email` | Where requests go. Optional: used when Claude can make an email draft. |
| `out` | Where the requests are written. Default: the folder itself. |
| `templates` | Your own templates. Default: the folder's `templates` subfolder. |
| `catalogue` | Where the catalogue is kept. Default: `belt-catalogue.json` in the folder. |

Paths may be absolute or relative to the folder.

## The catalogue

`scripts/catalogue.py` reads the workbook the same way Field CRM's belt
reference import does (`importRef` in `app.js`), sheet for sheet:

- **Belt Audit Data**: every Series, Style, Material and Colour found, and
  the link geometry (link width, link increment, minimum links, edge
  protrusion) for the width check.
- **SPROCKET SPILL DATA**: belt series, bore, pitch diameter (size),
  material, description and part number.
- **BELT DATA**: the pitch of each series, and the master lists of
  materials, colours, rod materials, flight styles, sideguard styles and
  indents.

The result is kept as `belt-catalogue.json` and read again only when the
workbook is newer. It is Intralox's own catalogue: it stays on the PC.

Colours and materials per spec are the ones **found in plants**, not every
one Intralox makes (the same caution as in Field CRM). A colour not on file
goes on the request's "To confirm" list; it is not refused.

Like Field CRM, it reads `Plant_Audit_Template_1.xlsm`. The FORM v1.2
template, with a different layout, does not read yet.

## Looking things up

`scripts/lookup.py`, with `--settings "<folder>"` and, if wanted, `--json`:

| Command | What it answers |
|---|---|
| `series` | Every series, with its number of styles, pitch and sprocket rows |
| `styles --series 100` | The styles on file for a series |
| `materials --series 100 --style "flat top"` | The materials on file for that style |
| `colours --series 100 --style "flat top" --material acetal` | The colours on file for that spec |
| `belt --series ... --style ... --material ... --colour ... --width 600` | The whole belt checked: names resolved, pitch, colours on file, the width against built widths (nearest either side when it isn't one), and the lines for "To confirm" |
| `sprockets --series 100 [--bore ...] [--pd ...] [--material ...]` | The sprockets for a series. Without enough to narrow it, the choices at the next step (bores, then pitch diameters, then materials); once narrowed, each that fits with its description and part number |
| `part EX-100-0013` | The sprocket with that part number, or one containing it |
| `search 200 raised rib` | Belts and sprockets matching the words, best first |
| `lists` | Rod materials, flight types, sideguard types, materials, colours, indents |
| `accessories [--group G] [--series S] [words]` | Field CRM's OneTrack accessory list: without a group or words, the groups with what each is chosen by and its usual choice; otherwise the items, with part numbers and notes, those for the series first |

Names match loosely: case, spaces and punctuation don't matter, and "S800",
"Series 800" and "800" are the same series. A name that is part of one name
on file finds it. A name that matches nothing gives the nearest names on
file, and the command ends with code 2. Nothing is guessed.

The width check is Field CRM's: from the link width, the protrusion, the link
increment and the minimum link count for that series, style and material, a
width is a built width, or lies between the two nearest built widths. Without
link data for the spec, it cannot be checked, and it says so.

## request.json

A worked example is in `examples/example-belt-request.json`, and one for
sprockets in `examples/example-sprocket-request.json`.

| Field | Meaning |
|---|---|
| `template` | `belt-quote`, `sprocket-quote`, or the name of one of your own |
| `customer` | The CRM account name, as in Field CRM ("Example Foods - Smithfield") |
| `site` | Site or area |
| `date` | YYYY-MM-DD; printed as "2 November 2026" |
| `account_manager` | From the CRM export |
| `customer_ref` | Their reference or the email it came from |
| `required_by` | YYYY-MM-DD, when they need it |
| `in_crm` | `false` flags the account as needing adding to Dynamics |
| `contacts` | Who asked: `name`, `role`, `email`, `mobile`, `in_crm` (`true` On file, `false` flagged, left out: a dash) |
| `checks` | Sentences for the "To confirm" list: what the catalogue could not confirm, choices left open |
| `belts` | The belt template's items (fields below) |
| `sprockets`, `parts` | The sprocket template's items (fields below) |
| `notes` | `[{"topic": "...", "text": "..."}]`, or one piece of text |
| `photos` | `{"p1": {"file": "photos/x.jpg", "caption": "..."}}`; paths relative to request.json |
| `customer_photos` | Photo ids for "Photos from the customer" |
| `changes` | Changes to the template for this request only (below) |

Every item can have `comment` (free text; a blank line starts a paragraph,
lines starting with - are a list), `photos` (ids), and `other` (extra rows:
`{"Old belt": "Brand X"}`).

**A belt** (`belts`), Field CRM's fields in Field CRM's order: `asset` (names
the belt; else `beltdesc`), `qty`, `beltdesc`, `series`, `style`, `beltmat`,
`colour`, `rodmat`, `width` (mm), `beltlen` (m), `clength` (m), `frame` (mm),
`retrofit`, `qcontact`; sprockets `sprocket`, `sprpn`, `sprbore`, `sprpd`,
`sprmat`, `sprvar`, `sprdrive`, `spridle`, `sprspacers`, `sprhdret`
(`sprhdretqty`); flights and sideguards `fstyle`, `flmat`, `fheight`, `frows`,
`fspacing`, `findent`, `cnotch`, `sgtype`, `sgmat`, `sgheight`; `accessories`, a list
of `{desc, part_number, qty, note}` from the accessory list, printed as an Accessories
band under the belt as Field CRM does; and `tsg`
(`true` when the belt ID was confirmed with TSG, which the request then says; otherwise it
says nothing about TSG).

**A sprocket** (`sprockets`): `qty`, `line`, `series`, `bore`, `pd`, `material`,
`description`, `part_number`, `variant`, `drive_qty`, `idle_qty`, `shaft`,
`qcontact`. **A part** (`parts`): `qty`, `description`, `part_number`,
`series`, `material`, `size`, `line`.

Required fields (marked in the template) print an em dash when not given, so
customer service sees what is missing, and `build_request.py` lists them.
Other empty fields are left out. Nothing prints "N/A".

## Templates

A template is a JSON file: `templates/belt-quote.json` and
`templates/sprocket-quote.json` are built in. A file of the same name in your
templates folder wins, and a new name there is a new kind of request.
`build_request.py --list-templates` lists them all, and
`--show-template <name>` prints one.

| Field | Meaning |
|---|---|
| `id` | The name, the same as the file's |
| `title` | The heading: "Belt request for quote" |
| `file_label` | In the file names: "Belt RFQ" |
| `about` | One line saying what it is for |
| `sections` | In order (below) |
| `footer` | The line at the foot; empty for none |

Sections, by `type`:

| Type | What it draws |
|---|---|
| `details` | A two-column table. `rows`: `{"label", "key", "required", "format"}`, where `key` is a field of request.json, and `format` is `date` or `yes` |
| `contacts` | Requested by, from `contacts`: each person a band, with their role, email, mobile and CRM below |
| `checks` | The "To confirm" list, from `checks`; left out when empty |
| `items` | One block per item in request.json's `items` list (`belts`, `sprockets`, ...). `item_label` ("Belt 1 — ..."), `name_from` (fields that name the item, first given wins), `unnamed`, `empty` (a line when there are none; empty to leave the section out), `comment_label`, `tsg` (the TSG line), `photos`, and `groups`: bands of `fields`, each `{"label", "key", "required", "format"}` |
| `notes` | The Notes table, from `notes` |
| `photos` | "Photos from the customer", from `customer_photos` |

## Changes for one request

`changes` in request.json changes the template for that request only:

| Change | Example | What it does |
|---|---|---|
| `title` | `"Belt quote, urgent"` | A different heading |
| `footer` | `""` | A different foot line, or none |
| `hide` | `["Notes", "Belt: Retrofit", "Sprockets"]` | Leaves out a section (by heading), a band (by name) or a field (by label, by key, or "Band: Label" to be exact) |
| `rename` | `{"Belts to quote": "Belts wanted"}` | Renames a section, band or field |
| `require`, `optional` | `["Colour"]` | Makes a field required (printed, and listed when missing) or not |
| `add_rows` | `[{"section": "Request", "label": "Delivery address", "value": "...", "after": "Site or area"}]` | A row in a details section, with its value (or a `key` of request.json) |
| `add_fields` | `[{"group": "Belt", "label": "Splice type", "key": "splice", "after": "Rod material"}]` | A field in a band of every item; each item gives its value under `key` |
| `sections` | `[{"heading": "Delivery", "rows": [["Address", "..."]], "text": "...", "after": "Request"}]` | A section of your own: rows, text or both; without `after`, before the notes |

A change that names nothing in the template is listed as a warning.

## The scripts

| Script | Does |
|---|---|
| `check_setup.py --settings F` | Says what this PC has and what is missing, and reads the catalogue once |
| `catalogue.py WORKBOOK` | Reads the catalogue from the workbook (the lookups do this themselves when needed) |
| `lookup.py ...` | The lookups above |
| `find_customer.py EXPORT ...` | Finds the account in the CRM export (`--name`, `--site`, `--people`), and prints one (`--account`) as JSON |
| `build_request.py request.json --settings F` | Draws the three files; lists required fields not given and any warning |
| `self_test.py` | Checks everything with a made-up workbook and the examples |
| `example_workbook.py FOLDER` | Writes the made-up workbook the self-test uses |

Python 3.8 or later, with `openpyxl`. `pillow` makes photos smaller in the
request, and `pillow-heif` opens iPhone HEIC photos.

## Data

The catalogue (Intralox's part numbers) and the CRM export (customer data)
are read where they are on the PC. Neither, nor anything read from them, is
copied into the skill's folder. The skill holds only made-up examples:
Example Foods, Jo Bloggs, Series 100 and 200, part numbers EX-....

## Versions

| Version | Date | What changed |
|---|---|---|
| 1 | 2026-11-02 | First version: belt request for quote and sprocket and parts request for quote; catalogue lookups with Field CRM's width check; file, email body and plain text. |
| 3 | 2026-11-04 | Accessories, as Field CRM v192: `lookup.py accessories` reads the OneTrack accessory list; a belt's `accessories` print as a band under it. |
| 2 | 2026-11-03 | As Field CRM v190: no "not yet confirmed with TSG" line (only a confirmed belt ID is mentioned), contacts one under another instead of five columns, and long words wrap inside the page. |
