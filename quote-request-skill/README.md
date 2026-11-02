# Quote request skill

A Claude skill, separate from Field CRM, for Claude Enterprise on the PC. It
writes a request to customer service (a belt request for quote, or a
sprocket and parts request for quote) from an email or a conversation, in
the same layout as Field CRM's quote request (`buildRFQHTML` in `app.js`).
It looks up belts and sprockets in the catalogue it reads from the plant
audit workbook on the PC, as Field CRM's belt reference import does
(`importRef`), and checks widths with Field CRM's width check
(`runWidthCheck`). Each request comes out as a file to attach, an
inline-styled email body that keeps its tables in Outlook, and plain text.

- `quote-request/` is the skill itself, exactly as it goes into the zip. Start
  with its `README.md` (installing and using it) and `DOCUMENTATION.md`
  (everything else).
- `make_package.py` rebuilds the zip after a change: the documentation page,
  the example requests, the self-test, then the zip.

It is not part of the app: nothing in the app loads it and the service
worker does not cache it, so a change here needs no version bump. It
exchanges no files with the app, but it copies three things from it, which
should change with it:
- the belt fields and their order, from `beltSpecGroups` (in
  `templates/belt-quote.json`);
- the stylesheet, from `NOTES_CSS` (in `scripts/build_request.py`);
- the workbook reading, from `importRef` (in `scripts/catalogue.py`).

`tests/qa-quote-skill.mjs` runs its self-test with `npm test`.

Everything in it is made up (Example Foods, Jo Bloggs, Series 100 and 200,
part numbers EX-...). The made-up workbook is written by
`scripts/example_workbook.py` when the self-test runs, never kept, because
spreadsheets stay out of the repository. No customer data, CRM export or belt
catalogue goes in here.

## After changing the skill

1. Change the files in `quote-request/`.
2. Run `python3 quote-request-skill/make_package.py --out <folder>` (needs
   `pip install markdown openpyxl pillow`).
3. Check the self-test passed, and look at the example requests.
4. Add a line to the versions table at the end of `DOCUMENTATION.md`.
5. Upload the new `quote-request.zip` in Claude in place of the old one.
