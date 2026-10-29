---
name: site-walk-report
description: Builds the Intralox site walk documents (HTML and PDF, in Field CRM's call notes and quote request style) from a conveyor site walk. Finds the customer in the person's CRM export, matches the Plaud recording's transcript and the phone photos by time, condenses everything discussed into bullet-point notes, puts the belts to quote into a Field CRM quote request, links each photo to its conveyor or belt, and draws an internal copy and a customer copy with a fixed template. Use when someone asks to build, write or prepare a site walk, plant walk, conveyor walk or visit report from a Plaud recording, photos and notes.
---

# Site walk report

You turn one site walk into two documents with the same layout every time:

- **Site walk notes** (internal): the customer and contacts as in the CRM, the
  notes, internal notes, photos, and the belts to quote laid out as Field
  CRM's quote request for customer service.
- **Site walk report** (customer copy): the same without the internal notes,
  CRM flags, contact details and the TSG line.

The engineer walked the plant with a Plaud recorder running, named each
conveyor out loud on reaching it, took photos on a phone, and wrote notes by
hand. You find the customer, line everything up by time, and fill in
`report.json`. A script draws both documents.

Read `DOCUMENTATION.md` in this folder when you need detail: the fields of
`report.json`, the tools' options, and what to do when something does not line
up.

## What you need from the person

Ask only for what you cannot find yourself:

1. **The visit's files**: the site photos and the photos of the note pages.
   Usually they attach the visit folder as one zip file (that keeps each
   photo's own time).
2. **Which recording**: usually the Plaud recording from the same day and time.
   Find it yourself (step 3); ask only if there is more than one candidate.
3. **Their CRM export**: find it yourself in their OneDrive (step 2). Ask
   where it is only if you cannot find it.

**Working folder.** Unzip or copy the visit into a folder of your own (for
example `visit/`, with the site photos in `visit/photos` and the note pages in
`visit/notes`) and do all the work there. This skill's own folder may be read
only. Never write into it.

**Test visit.** If they ask to test the skill, use `test-visit/` in this
skill's folder as the visit: copy it to your working folder. Its recording
started at 09:00:00 on 29 October 2026, and its CRM export is
`test-visit/crm-export-example.txt` (made up). Afterwards compare your
documents with the ones in `examples/` and with `test-visit/EXPECTED.md`, and
say how they differ.

## Steps

1. **Check the tools.** Run `python3 scripts/check_setup.py` from this skill's
   folder. If something is missing, install it with pip: `reportlab` for the
   PDF, `pillow` for photo times, `pillow-heif` for HEIC photos, `openpyxl`
   for an .xlsx export. The HTML works without any of them.

2. **Find the customer.**
   - Get the CRM export from the person's OneDrive through the Microsoft 365
     connector: search for their CRM contacts export (an .xlsx or .csv with an
     "Account Name" column; often named like "ANZ Active Food Contacts").
     Save it in your working folder, never in this skill's folder. If you
     cannot get the file itself, ask them to attach it.
   - Run, with what was heard or written about the customer, the site and the
     people on the walk:

     ```
     python3 scripts/find_customer.py "<export>" --name "<customer>" --site "<site or suburb>" --people "<name>" "<name>"
     ```

     It ranks the accounts. Pick the best one only if it clearly fits (the
     name, the site and the people agree); otherwise ask the person which it
     is, naming the two or three candidates. Then run it with
     `--account "<exact account name>"` for the account's manager and contacts.
   - If the customer is not in the export, use the name as said and set
     `"in_crm": false`; the internal copy then flags it for adding to Dynamics.

3. **Get the transcript.**
   - With the Plaud connector: list the recordings for the visit's date, pick
     the one that matches the visit, and get its transcript. Save it in the
     working folder as `transcript.json` exactly as it came, and note the
     recording's start time. Plaud's own summary may be used only to
     cross-check.
   - Without the connector: ask the person to export the transcript from the
     Plaud app as a .txt file with timestamps and attach it, and to tell you
     when the recording started (the Plaud app shows it on the recording).

4. **Line it up.** Run:

   ```
   python3 scripts/walk_timeline.py --transcript "<working folder>/transcript.json" --start "<recording start, local time>" --photos "<working folder>/photos"
   ```

   Use the folder that holds the site photos (not the note pages). It writes
   `timeline.json` next to the photos folder and prints the conveyors named,
   any project talked about, and each photo with its time, conveyor or
   project, and confidence. If the start time is in UTC, give it with its
   offset (for example `2026-10-28T22:00:00+00:00`).

5. **Read the notes.** Open each photo of a handwritten page and read it. The
   handwritten notes are the engineer's core record: where they say something
   specific (a width, a part, a decision), they win. Where you cannot read a
   word, do not guess: put it on the review list (step 8).

6. **Write `report.json`** in the working folder, following `DOCUMENTATION.md`
   and the worked example in `examples/example-report.json`.
   - **Customer and contacts**: from the CRM account (step 2): `customer` is
     the account name exactly as in the CRM, `account_manager` from the
     export. `contacts` are the people met on the walk, with role, email and
     mobile from the export; a person not in the export gets
     `"in_crm": false`.
   - **notes**: everything discussed, condensed into bullet points
     (`- ` at the start of each line). Conversations wander: people jump
     back to an earlier conveyor, raise a project halfway down a line, or
     settle something at the end. Use judgement rather than a fixed pattern.
     Group what belongs together by what it is about, not by when it was
     said, and infer where a remark belongs from its content and context
     ("that one" after talk of the spiral is CV-200). Usually that is a
     bullet for each conveyor or topic, roughly in the order walked, but
     merge, split or reorder wherever it reads better. Each bullet says what
     was found and what happens next. Finish with a "Follow-ups" bullet
     listing what was agreed, with who and when as said; leave who or when
     out rather than invent them. Keep it short: what a colleague needs, not
     what was said.
   - **internal_notes**: anything that must not go to the customer: budgets,
     prices, competitors, who decides, internal opinions, people to add to the
     CRM. The customer copy leaves these out, so `notes` must never carry them.
   - **belts**: every belt to quote, one entry each, with Field CRM's belt
     fields (`asset` for the conveyor name, `series`, `style`, `beltmat`,
     `width`, `sprocket`, `sprbore` and the rest; see `DOCUMENTATION.md`).
     Only what was said or written: never fill a field by inference, and
     never choose a sprocket or part number yourself. Leave a field out if it
     was not given; the internal copy shows the required ones as a dash so
     customer service sees the gap. `comment` says why the belt is needed and
     any date asked for. `tsg` stays false unless they said the belt ID was
     confirmed with TSG.
   - **Photos**: from `timeline.json` → `photos`. Its conveyor is only the
     last one named before the photo; if what was said around it
     (`said_near`), the picture itself or the notes show it is of something
     else, go by that. A photo of a belt to quote goes in that belt's
     `photos`; every other photo goes in `other_photos`, in the order taken.
     Each caption is one plain sentence starting with the conveyor ("CV-200:
     rods walking out on the left edge."). Leave out a photo with confidence
     `low` or `none` unless you can tell what it shows, and put it on the
     review list.
   - Where things go is a judgement; the facts are not. Facts only from the
     recording, the notes, the photos and the CRM export. Never infer a
     measurement, part, date or name that was not said or written. Never put the transcript
     itself or side remarks into either document.
   - Australian English. Plain words. Intralox and the product names written
     as Intralox writes them (S800 Flat Top, not "800 series flat-top").

7. **Draw it.** Run:

   ```
   python3 scripts/build_report.py "<working folder>/report.json"
   ```

   It saves four files in the working folder:
   `<Customer> - Site walk notes - <date>.html` and `.pdf` (internal), and
   `<Customer> - Site walk report - <date>.html` and `.pdf` (customer copy).
   Give all four to the person to download, and offer to save them into their
   OneDrive visit folder if you can. Never write or edit the documents' HTML
   yourself: to change anything, change `report.json` and run the script
   again. If it warns that a photo was not placed or not found, fix
   `report.json`.

8. **Report back** in a few lines: the files, which is internal and which is
   for the customer, then a short review list of anything to check first:
   - the customer match, if it was not certain;
   - photos left out or placed with low confidence;
   - words in the notes you could not read;
   - anything the notes and the recording disagree on, and which you used;
   - anything you placed by inference that matters (a finding or photo put
     with a conveyor that was not named at the time);
   - required belt fields not given (customer service will ask for them).

   Ask them to check the customer copy before it goes out.

## Rules

- Customer data (the CRM export, the visit, the documents) stays in the
  working folder, the person's OneDrive and this conversation. Never copy it
  into this skill's folder, and never anywhere public.
- The customer copy is for the customer: factual, courteous, nothing internal.
- If the recording, photos or export are missing, build from what there is
  and say what was missing; never fill the gap with guesses.
