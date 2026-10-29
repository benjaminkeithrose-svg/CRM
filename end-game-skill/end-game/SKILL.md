---
name: end-game
description: Writes the Intralox call report for a site call or plant walk and hands it back to Field CRM. Works in the visit's folder on the PC (the Field CRM PC folder, Customer\Site\date): reads the call Field CRM saved there (customer, contacts, belts, photos), fetches the Plaud recording, collects the visit's photos from the camera roll by time, matches photos to conveyors, reads handwritten notes and data sheets, and writes the site walk notes (internal, with the quote request) and the customer copy as HTML and PDF, plus fieldcrm-import.json for Field CRM's Import call report. Use when someone asks to do, write, build or prepare the call report, site walk report or visit report.
---

# End game: the call report, from walk to Field CRM

One site call becomes, in the visit's folder on the PC:

- **Site walk notes** (internal): customer and contacts as in the CRM, notes,
  internal notes, photos, and the belts to quote laid out as Field CRM's
  quote request, for customer service;
- **Site walk report** (customer copy): the same without anything internal;
- **fieldcrm-import.json**: the same report for Field CRM, which the person
  imports into the call with one tap (call ⋯, Import call report).

Each document as HTML (to email) and PDF. A script draws them, so every report
looks the same. Read `DOCUMENTATION.md` for the fields of `report.json`, the
tools' options, and what to do when something does not line up.

## Where you work

**The visit folder.** Field CRM's PC folder holds one folder per call:
`<PC folder>\<Customer>\<Site>\<YYYY-MM-DD>` (the account name split at its
first " - "; with no " - ", the call's site or nothing). Field CRM's Save for
Claude puts `Field CRM call.json` there, and its photos in `from Field CRM\`.
Everything you make goes in the same folder:

```
<visit folder>\
  Field CRM call.json         from Field CRM (read it, never change it)
  from Field CRM\             its photos
  photos\                     the visit's phone photos (step 4)
  source\                     transcript.json, timeline.json, report.json
  <Customer> - Site walk notes - <date>.html / .pdf
  <Customer> - Site walk report - <date>.html / .pdf
  fieldcrm-import.json
```

**Settings.** The PC folder, the camera roll folder and the CRM export are
the same every time, and so is the Inbox, the OneDrive folder the person
saves things into from the phone. Look for `end-game settings.json` in the
PC folder: `{"pc_folder": "...", "camera_roll": "...", "inbox": "...",
"crm_export": "..."}`. If it is not there, ask for them once and offer to save
the file.

**Two ways to reach the files.**
1. You can open the person's PC folders (Claude Desktop with folder access):
   work in the visit folder directly. This is the normal way.
2. You cannot: ask them to zip the visit folder (with the photos) and attach
   it; work in a folder of your own; at the end give them the files to put
   back in the visit folder.

This skill's own folder may be read only: never write into it.

**Test.** If they ask to test the skill, copy `test-visit/` to a working
folder and use it as the visit folder: it has a made-up Field CRM call, its
recording started at 09:00:00 on 29 October 2026, its photos folder stands in
for the camera roll, and `crm-export-example.txt` for the CRM export. Then
compare with `examples/` and `test-visit/EXPECTED.md`, and say how yours
differs.

## Steps

1. **Check the tools.** Run `python3 scripts/check_setup.py` from this skill's
   folder. Install what it says is missing with pip (`reportlab` for the PDF,
   `pillow` for photo times, `pillow-heif` for HEIC, `openpyxl` for an .xlsx
   export). The HTML works without any of them.

2. **Find the call.** Usually the person names the customer or says "today's".
   Find the visit folder in the PC folder by customer and date. If it holds
   `Field CRM call.json`, run:

   ```
   python3 scripts/fieldcrm_call.py "<visit folder>/Field CRM call.json"
   ```

   It prints the call: customer (the CRM account), date, account manager,
   people, each belt with its `ref`, notes and photos. That is the customer:
   no lookup needed. If it says the photos are inside the file (saved on a
   phone), run it again with `--photos-out "<visit folder>/from Field CRM"`.

   Not there? Look in the Inbox for the call saved from the phone: a file
   named `<Customer> - <date> - Field CRM call.txt` (or `.json`; the phone's
   share sheet only takes text, the contents are the same). Copy it into the
   visit folder as `Field CRM call.json` (make the folder by the rule above
   if it is not there yet), then run `fieldcrm_call.py` on it with
   `--photos-out "<visit folder>/from Field CRM"`: its photos are inside it.
   Leave the Inbox copy where it is.

   No Field CRM call (they did not log one): find the customer in the CRM
   export with `scripts/find_customer.py` (see `DOCUMENTATION.md`), and make
   the visit folder by the rule above. Ask if the match is not clear.

3. **Get the transcript.** With the Plaud connector, find the recording that
   matches the visit's date and time, get its transcript and start time, and
   save the transcript as `source/transcript.json`. Without it, ask for the
   Plaud transcript exported as a text file with timestamps, and the start
   time. No recording at all: build from the rest and say so.

4. **Collect the photos.** From the camera roll, by time:

   ```
   python3 scripts/collect_photos.py --from "<camera roll>" --start "<recording start>" --minutes <recording length> --to "<visit folder>/photos"
   ```

   It copies (never moves) every photo taken from 10 minutes before to 10
   minutes after the recording, by the photo's own time. Look at what it
   took: photos of handwritten note pages, data sheets or drawings are not
   site photos. Move those into `source/` and read them in step 6.

5. **Line it up.**

   ```
   python3 scripts/walk_timeline.py --transcript "<visit folder>/source/transcript.json" --start "<recording start>" --photos "<visit folder>/photos" --out "<visit folder>/source/timeline.json"
   ```

   It gives each photo the conveyor (or project) being talked about when it
   was taken, what was said around it, and a confidence.

6. **Read everything else.** Handwritten note pages, data sheets, drawings
   (as PDF), anything the customer gave. The handwritten notes and what was
   typed in Field CRM are the engineer's own record: where they say something
   specific (a width, a part, a decision), they win over the recording.
   Where you cannot read a word, do not guess: put it on the review list.

7. **Write `source/report.json`** (fields in `DOCUMENTATION.md`; a worked
   example in `examples/example-report.json`).
   - **customer**, **contacts**, **account_manager**, **in_crm**: from Field
     CRM's call (or the CRM export). People met who are not in the CRM get
     `"in_crm": false`.
   - **fieldcrm.call_id**: the call's id from `Field CRM call.json`, so the
     import goes into that call.
   - **notes**: everything discussed, condensed into bullet points. Use
     judgement, not a fixed pattern: conversations wander, so group what
     belongs together by what it is about, not by when it was said. Usually a
     bullet for each conveyor or topic, roughly in the order walked. Each says
     what was found and what happens next. End with a "Follow-ups" bullet.
   - **internal_notes**: what must not reach the customer: budgets, prices,
     competitors, who decides, internal opinions, people to add to the CRM.
   - **belts**: every belt to quote. A belt already in Field CRM keeps its
     `ref` and its values as Field CRM has them (series as a number, "800");
     add only what the walk added (a width said out loud, the sprockets).
     A belt not in Field CRM has no `ref`. Only what was said, written or
     logged: never fill a field by inference, never choose a sprocket or part
     number yourself. `comment`: why it is needed and any date asked for.
   - **follow_ups**: each agreed action as `what`, `who`, `when`, and `date`
     (YYYY-MM-DD) when a day was named. `"task": true` only for the person's
     own actions (Intralox's), which become next steps on their planner in
     Field CRM; the customer's actions stay `false`.
   - **photos**: every photo by id, with `file` (relative to report.json),
     `time` and a one-sentence `caption` starting with the conveyor. A photo
     of a belt to quote goes in that belt's `photos` (Field CRM's own belt
     photos too); every other photo in `other_photos`, in the order taken.
     The conveyor from `timeline.json` is a starting point: move a photo when
     what was said, the picture or the notes show it is of something else.
     Leave out a photo with confidence `low` or `none` unless you can tell
     what it shows.
   - **review**: the review list (step 9), as short sentences.
   - Facts only from the recording, the notes, the photos, Field CRM and the
     CRM export. Never invent a measurement, part, date or name. Never put the
     transcript itself or side remarks into either document. Australian
     English; Intralox product names as Intralox writes them.

8. **Make the files.**

   ```
   python3 scripts/build_report.py "<visit folder>/source/report.json" --out "<visit folder>"
   python3 scripts/make_import.py "<visit folder>/source/report.json" --out "<visit folder>"
   ```

   The first draws the two documents, HTML and PDF; the second writes
   `fieldcrm-import.json`. Never write or edit the documents yourself: change
   `report.json` and run both again. Fix any warning about a photo.

9. **Report back**, in a few lines: where the files are (which is internal,
   which goes to the customer), then the review list:
   - the customer match, if it was not certain;
   - photos left out or placed with low confidence, or moved by judgement;
   - words you could not read;
   - where the notes, Field CRM and the recording disagree, and which you used;
   - required belt fields not given (customer service will ask).

   Then the next steps for them, numbered:
   1. Check the customer copy, and send it to the customer.
   2. Send the site walk notes to customer service with the quote request.
   3. In Field CRM on the PC, open the call, click ⋯, then Import call report.
   4. Log the call in Dynamics with the site walk notes attached.

## Rules

- Customer data stays in the person's PC folders and this conversation. Never
  copy it into this skill's folder or anywhere public.
- Never change `Field CRM call.json` or anything in `from Field CRM\`.
- Never delete or move anything in the camera roll or the PC folder.
- The customer copy is for the customer: factual, courteous, nothing internal.
- If something is missing, build from what there is and say what was missing.
