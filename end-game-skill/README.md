# End game skill

A Claude skill, separate from Field CRM, for Claude Enterprise on the PC. It
writes the call report for a site call from the call Field CRM saved (Save
for Claude), the Plaud recording, the phone photos and the handwritten
notes; files everything in the visit's PC folder; and writes
`fieldcrm-import.json`, which Field CRM's Import call report (v186) lays back
into the same call. It is the sibling of `site-walk-skill/`, which stays as
it is for the colleagues already using it.

- `end-game/` is the skill itself, exactly as it goes into the zip. Start
  with its `README.md` (installing and using it) and `DOCUMENTATION.md`
  (everything else).
- `make_package.py` rebuilds the zip after a change: the documentation page,
  the example documents, the self-test, then the zip.

It is not part of the app: nothing in the app loads it and the service
worker does not cache it, so a change here needs no version bump on its
own. The files it exchanges with Field CRM are, though: `fieldcrm_call.py`
and `make_import.py` here, `clCallFile` and `clApply` in `app.js`, each with
a `kind` and a version. Change both sides together and keep
`tests/qa-claude.mjs` passing (it runs this skill's `make_import.py`).
Everything in it is made up (Example Foods, Jo Bloggs); no customer data,
CRM export or belt catalogue goes in here.

## After changing the skill

1. Change the files in `end-game/`.
2. Run `python3 end-game-skill/make_package.py --out <folder>` (needs
   `pip install markdown reportlab pillow openpyxl`).
3. Check the self-test passed, and look at the example documents.
4. Add a line to the versions table at the end of `DOCUMENTATION.md`.
5. Upload the new `end-game.zip` in Claude in place of the old one.
