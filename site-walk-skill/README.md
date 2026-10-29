# Site walk report skill

A Claude skill, separate from Field CRM, that turns a site walk (a Plaud
recording, phone photos and handwritten notes) into Field CRM-style site walk
notes and a customer copy, HTML and PDF. It lives in this repository for now;
it may move to its own later.

- `site-walk-report/` is the skill itself, exactly as it goes into the zip.
  Start with its `README.md` (for the person installing it) and
  `DOCUMENTATION.md` (everything else).
- `make_package.py` rebuilds the zip after a change: the documentation page,
  the example documents, the self-test, then the zip.

It is not part of the app: nothing in the app loads it and the service
worker does not cache it, so a change here needs no version bump.
Everything in it is made up (Example Foods, Jo Bloggs); no customer data,
CRM export or belt catalogue goes in here, as for the rest of the repository.

## After changing the skill

1. Change the files in `site-walk-report/`.
2. Run `python3 site-walk-skill/make_package.py --out <folder>` (needs
   `pip install markdown reportlab pillow openpyxl`).
3. Check the self-test passed, and look at the example documents.
4. Add a line to the versions table at the end of `DOCUMENTATION.md`.
5. Send the new `site-walk-report.zip` to whoever uses the skill; they upload
   it in Claude in place of the old one.
