# 5. Data in and out

## Coming in

| What | From | Where it goes | Notes |
|---|---|---|---|
| **CRM export** | Dynamics, the ANZ Active Food Contacts view, as .xlsx (keeps the hidden sheet Dynamics needs for write-back) or .csv | `accounts`, and `meta` | Replaces the whole account list. Contacts added in the app survive it (they are in `people`). In a team, the admin imports it and it reaches everyone |
| **Belt reference** | `Plant_Audit_Template_1.xlsm` | `kv` `beltref` | Drives the belt form's pickers. The FORM v1.2 template does not import yet |
| **Plant audit register** | `Copy_of_Plant_Audit_Master_Database.xlsx` | `kv` `assets` | Installed belts by asset number. Replaced whole on each import |
| **Zone overrides** | A JSON file | `kv` `overrides` | Zone corrections and spellings |
| **CIP and MBO** | The CIP/MBO artifact's "Save HTML copy" | `cip` `me`, `mbo`, `ref` | Personal and private |
| **Blue Sheet** | A Miller Heiman Blue Sheet .xls or .xlsx | a new record in `opps` | Read by its labels, so a moved row still reads |
| **Task Slaughterer** | Its export, once | `tasks`, `snippets`, `products` | The old separate tasks page |
| **Engineering manuals** | intralox.com (found by the `intralox-manuals` function) or a PDF you pick | the browser's storage, as page images | pdf.js loads from a CDN the first time |
| **A shared file** | Android's share sheet | the call or form it was shared to | |

## Going out

| What | How | Format |
|---|---|---|
| **Call notes**, health check, belt requirements | Create and share on a call | Self-contained A4 HTML for the share sheet or a new tab; survives Outlook's renderer |
| **Quote request (RFQ)** | Create and share on a quote | A4 HTML |
| **Blue Sheet** | Create and share | PDF (the print screen's Save as PDF) or Excel in Miller Heiman's template layout |
| **Large account plan** | Create and share | A4 HTML in Dynamics' order |
| **Copy for Dynamics** | The large account plan | Each Dynamics field with its own Copy button |
| **Changes for Dynamics** (v144) | Settings | .xlsx for CAG: new contacts, moved contacts, changed details, left the company (v145) and account owners (account managers, ATL), a sheet each, then marked sent |
| **Visits to Outlook** | The calendar | .ics calendar file: subject "Type: Account", location, agenda, invitees, focus and zone as categories |
| **Email tasks to Outlook** | Open in Outlook | A new email (mailto): To, Subject (or the title), Body |
| **Planning weeks** | The planner | .ics calendar file of week markers |
| **PC folder** | Reports | Each done call saved as files in a folder on the PC |
| **Export for Claude** | Reports | Text files for a Claude Project |
| **Backup** | Settings | One JSON file of everything on the device, photos optional |

Rejected formats, by decision: EML (Outlook on Android opens it as a web page)
and PDF for call notes (the Blue Sheet is the exception).

## Backup and restore

**Back up** (Settings, Backup and restore) writes one file with every store, the settings that
matter, and optionally the photos. Contacts added in the app go in it
separately from the accounts.

**Restore** adds and updates records by their IDs; it never deletes anything
already on the device. With cloud sync on, a restored record then syncs like
any other change.

Cloud sync is itself a second copy of everything except device-only settings,
so a new or wiped device gets everything back by signing in and entering the
passphrase. It is not a backup, though: a delete reaches every device. The
backup file is the undo.
