# The test visit: what good documents show

Everything in this visit is made up: Example Foods, the CRM export, Jo
Bloggs, Pat Example and Alex Example are not real. The recording started at
**09:00:00 on 29 October 2026**.

## What is in the folder

| File | What it is |
|---|---|
| `transcript.txt` | The walk's transcript, as exported from the Plaud app (time, speaker, words) |
| `photos/IMG_4101.jpg` … `IMG_4105.jpg` | Five site photos. Each is a labelled placeholder carrying a real photo time |
| `notes/notes-page-1.jpg` | A photo of a handwritten notes page |
| `crm-export-example.txt` | A made-up CRM contacts export, standing in for yours (only needed when there is no Field CRM call) |
| `Field CRM call.json`, `from Field CRM/` | The call as Field CRM's Save for Claude writes it: Example Foods - Smithfield, Jo Bloggs, one belt logged (CV-200, ref 0: S800 Flat Top, acetal, white, no width yet) with one photo, and a note |
| `photos/` | Also stands in for the camera roll |

## Reading the Field CRM call (fieldcrm_call.py)

Call c1793299000000, Example Foods - Smithfield, 29 October 2026, account
manager Alex Example. One belt: ref 0, CV-200. The customer comes from here,
so the CRM export is not needed.

## Collecting the photos (collect_photos.py)

From `photos/`, with the recording starting at 09:00 and lasting about 9½
minutes: the default 10 minutes either side takes all five; 30 seconds either
side takes four (IMG_4105 at 09:10:10 falls outside).

## Finding the customer without a Field CRM call (find_customer.py)

The best match is **Example Foods - Smithfield**: name, site and Jo Bloggs all
agree. The near misses are there on purpose: Example Foods - Lidcombe (same
customer, other site, a "Jo Blogs") and Example Bakeries - Smithfield (same
suburb). Pat Example is not in the export, so the internal copy flags Pat
"Needs adding to Dynamics".

## Lining up (walk_timeline.py)

| | Expected |
|---|---|
| Conveyors named | CV-100 at 0:00:48, CV-200 at 0:03:30, CV-300 at 0:07:40 |
| Project talked about | new packing line at 0:08:42 |
| IMG_4101, 09:01:15 | CV-100, high |
| IMG_4102, 09:03:55 | CV-200, high |
| IMG_4103, 09:04:43 | CV-200, high |
| IMG_4104, 09:07:42 | CV-300, high |
| IMG_4105, 09:10:10 | project: new packing line, **low**: taken after the talking stopped |

## The documents

Compare with the two in `examples/`. The words will differ; the facts should
not.

**Notes** (both copies). The grouping and order may differ from this; the
facts should not. Roughly:

- three conveyors walked with Jo Bloggs, infeed to packing;
- CV-100: carryway wear strips worn at the transfer end, about half left;
  customer maintenance replaces them at the next shutdown; the rest fine;
- CV-200: rods walking out on the left about every third row, worn hinges,
  for about six weeks since the wash-down change; drive sprocket teeth
  hooked; new belt and sprockets recommended;
- CV-300: tracking right, rubbing the side frame near the outfeed; check the
  take-up at the next service; hygiene good;
- second packing line: planned next year, about 30 m of conveyor, design from
  March, install over the Christmas shutdown; Intralox to help with the
  layout;
- follow-ups: quote by Friday; case studies to Pat Example next week.

**Internal notes** (internal copy only): the budget of about $400k, and that
they are also talking to another supplier. Neither may appear in the
customer copy.

**Photos**: IMG_4101 (CV-100) and IMG_4104 (CV-300) in the photo section;
IMG_4102 and IMG_4103 under the CV-200 belt. IMG_4105 left out, and on
Claude's review list.

**Belts to quote**: Belt 1, CV-200, the belt logged in Field CRM (`ref` 0), with Field CRM's photo first: series 800, Flat Top, Acetal, White, 457 mm
wide, about 24 m; sprockets 11 tooth, 40 mm square bore. Quantity and rod
material were not given, so the internal copy shows them as a dash. "Belt ID
not yet confirmed with TSG" on the internal copy only.

## Signs something is wrong

- A measurement, part, sprocket or date that is not in the transcript or the
  notes.
- The budget or the other supplier in the customer copy.
- A photo under the wrong belt, or a caption naming the wrong conveyor.
- The transcript copied in, or remarks like "That's the lot".
- No review list at the end of Claude's reply.

## The file for Field CRM (make_import.py)

`fieldcrm-import.json` for call c1793299000000: one belt with `ref` 0 and the
width 457 from the walk; five photos inside it; four follow-ups, two of them
(the quote by Friday 30 October, the case studies next week) as next steps;
three review points; the two documents without photos. Imported into the call
in Field CRM, it fills in the belt's empty fields only.
