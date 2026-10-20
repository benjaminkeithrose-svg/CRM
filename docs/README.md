# Field CRM documentation

How Field CRM is built and how its data is kept. Written from the code as it
stands, version v163 (2026-10-19). No customer data and no keys appear here.

| Document | What it covers | Mainly for |
|---|---|---|
| [1. Overview](01-overview.md) | What the app is and the parts it is made of | Everyone |
| [2. Database architecture](02-database.md) | Every store on the device, the cloud tables, how they relate | Ben, developers |
| [3. Sync and security](03-sync-and-security.md) | What leaves the device, encryption, conflicts, the team | Ben, developers |
| [4. AI](04-ai.md) | Each AI feature: what is sent, the model, the limits | Ben, developers |
| [5. Data in and out](05-data-in-and-out.md) | Imports, documents, exports, backups | Ben, developers |
| [6. Running it](06-running-it.md) | Releasing a change, tests, recovery, known issues | Ben, developers |
| [7. Developer guide](07-developer.md) | Code map and the checklists for common changes | Developers |
| [8. Your data](08-your-data.md) | A short page for colleagues using the app | Colleagues |
| [Glossary](glossary.md) | Plain-English meanings of the terms used | Everyone |

A printable copy of all of it is [field-crm-documentation.html](field-crm-documentation.html),
published at https://benjaminkeithrose-svg.github.io/CRM/docs/field-crm-documentation.html.
Open it in a browser and print, or save as PDF from the print screen; the
diagrams need signal to draw. It is made from these files by
`python3 tools/docs-to-print.py`. On a device with the app installed, the
browser may show the copy from the last app update until the next one.

**Keeping this current.** A change to the data, sync or AI updates the
matching document here in the same pull request, and the printable copy is
made again (project rule in `CLAUDE.md`). The Help screen and `MANUAL.md`
remain the user's guide to the screens; these documents explain what is
underneath.

Related files in the repo: `CLAUDE.md` (the project's rules), `BACKEND-PLAN.md`
(how the cloud sync was planned and agreed), `IDEAS.md` (what was built when,
and what is parked), `MANUAL.md` (the user guide).
