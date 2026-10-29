# End game: documentation

Version 1.1, 29 October 2026.

A Claude skill for Claude Enterprise on the PC. It writes the call report
for a site call from the call in Field CRM, the Plaud recording, the phone
photos and the handwritten notes, files everything in the visit's folder,
and hands the report back to Field CRM. Everything in the examples is made
up. It is the sibling of the `site-walk-report` skill and shares its tools
for matching photos and drawing documents; the two do not touch each other.

**Contents**

1. What it does
2. How it works
3. Setting it up
4. On site: habits that make good notes
5. After the call
6. What Claude does
7. The tools
8. report.json, field by field
9. The documents' look
10. Troubleshooting
11. Customer data and privacy
12. What has and has not been tested
13. Changing the skill
14. Versions

---

## 1. What it does

You log the call in Field CRM as usual and walk the plant with the Plaud
recording. Back at the PC you press **Save for Claude** on the call, then
type **Do the call report** in Claude. Claude:

- reads the call Field CRM saved: the customer as the CRM account, the
  contacts, the belts you logged (with their photos) and your notes;
- fetches the Plaud recording, and collects the visit's photos from your
  camera roll by the time they were taken;
- works out which conveyor each photo shows, from when it was taken and what
  was being said, and captions it;
- reads the handwritten notes, data sheets and drawings;
- condenses everything discussed into short bullet-point notes, with the
  agreed follow-ups, and keeps anything internal apart;
- completes the belts to quote: what you logged in Field CRM, plus what the
  walk added (a width said out loud, the sprockets);
- draws the documents and saves everything in the visit's folder;
- writes `fieldcrm-import.json`, which Field CRM's **Import call report**
  lays back into the same call;
- ends with a short list of things for you to check.

**What you get, in the visit's folder**

| | Site walk notes (internal) | Site walk report (customer copy) |
|---|---|---|
| Details | Call details: date, call type, account manager, customer, site; "Not in CRM" flag | Visit details: date, customer, site, Intralox contact |
| People | Contacts: name, role, email, mobile, CRM status | People: name, role |
| Notes | Yes | Yes |
| Internal notes | Yes | No |
| Photos | Yes | Yes |
| Belts to quote | Field CRM's quote request: required fields shown even when empty, quantity first, TSG line | The same tables, only what was given |

Each as HTML (to email) and PDF (A4). And `fieldcrm-import.json` for Field
CRM: the report, its belts, photos, contacts and follow-ups, and the two
documents to keep with the call.

## 2. How it works

```
 Field CRM: Save for Claude ─► Field CRM call.json + from Field CRM\ (belts, photos, contacts)
 Plaud recording ──────────► transcript with times ─┐
 camera roll ─► collect_photos.py ─► photos\ ───────┼─► walk_timeline.py ─► timeline.json
 handwritten notes, data sheets ─► read by Claude    │
                                                     ▼
                                             source\report.json
                                     │                              │
                            build_report.py                  make_import.py
                                     │                              │
              Site walk notes + Site walk report          fieldcrm-import.json
                    (HTML + PDF)                                    │
                                                Field CRM: Import call report
                                                (the same call; syncs encrypted)
```

**The visit folder is the meeting point.** Field CRM's PC folder already
files each call as `Customer\Site\YYYY-MM-DD`. Save for Claude writes the
call there; Claude reads it there and leaves its files beside it; Import call
report reads Claude's file from there. Nothing passes between Claude and
Field CRM's database: files only. Claude never needs Field CRM's key, and the
imported call syncs encrypted like any other change.

**Field CRM is the record; the folder holds the documents.** The import puts
the report into the call as data (the notes, real belt entries, photos,
contacts, next steps), so it is kept permanently with every other call and
can be searched and reported on later. The documents are kept with the call
too, without their photos (those are on the call already).

**Times line the walk up.** The recording's start time plus each remark's
offset is the clock time of every remark; each phone photo carries the clock
time it was taken. A photo sits with whatever was said at that moment, under
whichever conveyor was last named before then. Photos taken in Field CRM are
already on their belt.

**Claude decides the words, the scripts decide the look.** Claude fills in
`report.json`; `build_report.py` draws it with Field CRM's own stylesheet and
belt fields, so every report looks the same.

**A person checks it.** Claude lists anything doubtful before you send.

## 3. Setting it up

### What is needed

- **Claude Enterprise** with **Code execution and file creation** turned on,
  and **Skills** turned on (an owner turns skills on for the organisation).
- **Claude Desktop with access to your PC folders**: the Field CRM PC folder
  and the OneDrive camera roll folder. This is what lets Claude read the call
  and the photos and save the documents where they belong. Without it, see
  section 5, "Without folder access".
- **Field CRM v186 or later**, with its PC folder set up (Reports, Save to
  PC folder, on the PC in Chrome or Edge).
- **OneDrive camera upload** on the phone, so the photos reach the camera
  roll folder on the PC with their own times.
- The **Plaud** connector, so Claude can fetch the recording. Without it,
  export the transcript from the Plaud app.
- Your **CRM export** in a PC folder, only for calls not logged in Field CRM.

### Installing it

1. In Claude, click your name, then **Settings**, then **Capabilities**.
2. Turn on **Code execution and file creation**.
3. Under **Skills**, click **Upload skill** and choose this zip file, as it
   came (not unzipped).
4. Check **end-game** shows in the list, turned on.

An organisation owner can add it once for everyone instead, from the
organisation's admin settings (Skills).

### The settings file

The first time, Claude asks for four places and offers to remember them in
`end-game settings.json` in your Field CRM PC folder:

```
{"pc_folder": "C:\\Users\\you\\OneDrive - Intralox\\Field CRM",
 "camera_roll": "C:\\Users\\you\\OneDrive - Intralox\\Pictures\\Camera Roll",
 "inbox": "C:\\Users\\you\\OneDrive - Intralox\\_Inbox",
 "crm_export": "C:\\Users\\you\\OneDrive - Intralox\\CRM export\\contacts.xlsx"}
```

The paths are examples. Change the file whenever one moves.

### Checking it works

Ask Claude: **Test the end-game skill with its test visit.** To test only the
tools, run `python3 scripts/self_test.py` from the skill's folder: it prints
`ok` or `FAIL` for each check, through to the file for Field CRM.

## 4. On site: habits that make good notes

These matter more than anything else. The tools can only match what the
recording and the photos give them.

1. **Start the Plaud before the first conveyor**, and leave it running for
   the whole walk. One recording per walk.
2. **Say the customer, the site and who you are with** at the start:
   "Site walk at Example Foods, Smithfield, with Jo Bloggs." That is what
   finds the account in the CRM.
3. **Say each conveyor's name as you reach it**, in a set phrase:
   "**Now at CV-200**, the spiral exit." The tools look for "now at", "now
   on", "we're at", "moving to", "next is" or "this is", followed by a
   conveyor name (CV-200, Line 3, Conveyor 12, PK-4).
4. **Say when you move to a project**: "**Now talking about the** new
   packing line **project**." Photos taken then are kept apart from the last
   conveyor.
5. **Say what you are photographing**, just before or after the photo:
   "Photo of the drive sprocket." This gives the caption and makes the match
   certain (high confidence means speech within 10 seconds of the photo).
6. **Log belts in Field CRM, or read them out in full**: series, style, material, colour,
   rod, width, length, quantity, sprocket and bore. Anything not said
   shows as a gap on the quote request, and customer service will ask.
7. **Say decisions out loud with who and when**: "Quote by Friday", "Jo's
   team will check the take-up at the next service." Follow-ups come only
   from what was said or written.
8. **Leave the phone's clock on automatic.** If the phone's clock and the
   recorder's are out, every match is out (section 10).
9. **Photograph each page of handwritten notes** flat, in good light, at the
   end of the walk. Write conveyor names as you said them.
10. **Ask before recording.** Tell the people walking with you that you are
    recording for your notes, and follow the site's rules on photos.

## 5. After the call

1. In Field CRM, log the call as usual: belts (the specification is easier
   there than said), notes, photos.
2. On the PC, open the call in Field CRM. Click **⋯** beside **Create and
   share**, then **Save for Claude**. The first time, pick your PC folder.
3. In Claude Desktop, type **Do the call report**, with the customer if you
   did more than one call that day.
4. Read Claude's review list and check those points in the documents.
5. Send the customer copy to the customer, and the site walk notes to
   customer service with the quote request.
6. In Field CRM, open the call, click **⋯**, then **Import call report**.
   Read the message saying what it adds, and click **OK**.
7. Log the call in Dynamics with the site walk notes attached.

**Saving from the phone instead.** On the phone, Save for Claude opens the
share sheet: tap **OneDrive** and save it in your Inbox (a folder at the top
of OneDrive named `_Inbox` is first in the list). Claude finds it there,
copies it into the visit folder and takes the photos out of it. The file is
named `<Customer> - <date> - Field CRM call.txt`: the share sheet takes only
certain file types, so the JSON goes as text.

Phone photos reach the PC through OneDrive camera upload, which keeps their
time. Photos sent through WhatsApp, Teams chat or email lose it.

**Without folder access.** If Claude cannot open your PC folders:

1. In Field CRM, Save for Claude (it saves into the visit's folder, or on a
   phone downloads one file).
2. Copy the visit's phone photos into the same folder.
3. Right-click the folder, **Send to**, **Compressed (zipped) folder**.
4. Drag the zip into the Claude chat and type **Do the call report**.
5. Save the files Claude gives you back into the visit's folder, then carry
   on from step 4 above.

## 6. What Claude does

`SKILL.md` holds Claude's instructions; in short:

1. Checks the tools (`check_setup.py`).
2. Finds the visit's folder and reads `Field CRM call.json`
   (`fieldcrm_call.py`). With no Field CRM call, finds the customer in the
   CRM export (`find_customer.py`) and asks if it is not clear.
3. Fetches the Plaud transcript and its start time.
4. Copies the visit's photos from the camera roll by time
   (`collect_photos.py`), and sets aside photos of note pages and data
   sheets to read.
5. Lines up the transcript and the photos (`walk_timeline.py`).
6. Reads the handwritten notes, data sheets and drawings.
7. Writes `source\report.json`.
8. Draws the documents (`build_report.py`) and writes the file for Field CRM
   (`make_import.py`).
9. Tells you where everything is, gives you the review list, and the next
   steps: send, import, Dynamics.

How it sorts the notes: conversations never go the same way twice, so
Claude groups what belongs together by what it is about, not strictly by when
it was said, and infers where a remark belongs from its context. Where it
placed something that matters by inference, it says so on the review list.

Rules it follows: where things go is a judgement, the facts are not; facts
only from the recording, notes, photos, Field CRM and the CRM export; never
a guessed measurement, part, sprocket, date or name; belts keep Field CRM's
values; anything internal only in the internal notes; Australian English;
Intralox product names as Intralox writes them. It never changes Field CRM's
files and never moves or deletes anything in your folders.

## 7. The tools

All are in `scripts/`, plain Python 3.8 or later. Each prints its options
with `--help`.

### check_setup.py

```
python3 scripts/check_setup.py
```

Says what this computer has: Python, the logo, Pillow (for reading photo
times and shrinking photos), pillow-heif (for iPhone HEIC photos), openpyxl
(for an .xlsx CRM export) and which PDF engines are available.

### self_test.py

```
python3 scripts/self_test.py
```

Runs the tools on the test visit and checks the results against the known
answers: the Field CRM call read with its belt's `ref`, the right photos
collected by time, the right customer found, three conveyors and the
project, each photo's conveyor and confidence, both documents made with
nothing internal in the customer copy, and the file for Field CRM. Output goes to
`self-test-output/` in the skill's folder. Exit code 0 means passed.

### fieldcrm_call.py

```
python3 scripts/fieldcrm_call.py "<visit folder>/Field CRM call.json" [--photos-out FOLDER] [--json]
```

Reads the call Field CRM's Save for Claude wrote (kind
`field-crm-call-for-claude`, version 1) and prints it: the call's id, the
customer (the CRM account) and whether it is in the CRM, the date, the
account manager, the people on the call, every belt with its `ref` (its place
in the call), the notes, other entries and the photos. `--json` prints the
same as JSON. A file saved on a phone holds its photos inside it;
`--photos-out` writes them out as files.

The file itself holds: `call` (`id`, `customer`, `site`, `type`, `date` and
`iso`, `mgr`, `manualAccount`, `summary`, `contacts` with `in_crm`,
`entries` each with its `ref` and its photos by file name, `loose`) and
`account` (the CRM account's `name`, `mgr` and all its `contacts`).

### collect_photos.py

```
python3 scripts/collect_photos.py --from CAMERA_ROLL --start TIME (--end TIME | --minutes N) --to FOLDER [--margin 600] [--dry-run]
```

Copies (never moves) every photo whose own time (EXIF) falls between
`--margin` seconds before the start and after the end, default 10 minutes
either side, into the visit's `photos` folder. A photo already there is not
copied again. Photos with no time of their own that might be from the visit
are named, not copied. `--dry-run` says what it would copy.

### make_import.py

```
python3 scripts/make_import.py "<visit folder>/source/report.json" --out "<visit folder>"
```

Writes `fieldcrm-import.json` (kind `field-crm-claude-report`, version 1)
for Field CRM's Import call report:

| Field | From report.json | In Field CRM |
|---|---|---|
| `callId` | `fieldcrm.call_id` | The call it goes into; a different call asks first |
| `summary` | `notes` | The call's summary, which heads Field CRM's own call notes |
| `internal_notes` | `internal_notes` | A note, Internal notes, replaced on a later import |
| `contacts` | `contacts` | Added to the call if not there; `in_crm` false flags it |
| `belts` | `belts` | With `ref`: that belt's empty fields filled, nothing typed changed. Without: a new belt, updated (not duplicated) on a later import |
| `photos`, `other_photos` | `photos` | Inside the file, longest side 1600 px; under their belt, or the call's loose photos; one already on the call is skipped |
| `follow_ups` | `follow_ups` | `task` true: a next step on the planner, on `date` if given |
| `review` | `review` | Kept with the call |
| `documents` | drawn again without photos | Kept with the call: Open Claude's notes, Open Claude's customer copy |

### find_customer.py

```
python3 scripts/find_customer.py EXPORT --name TEXT --site TEXT --people NAME [NAME ...] [--top 5]
python3 scripts/find_customer.py EXPORT --account "Exact Account Name"
```

| Option | Meaning |
|---|---|
| `EXPORT` | The CRM contacts export: .xlsx, .xlsm, or .csv (also read from a .txt holding CSV) |
| `--name` | The customer as heard or written |
| `--site` | The site or suburb as heard or written |
| `--people` | People named on the walk |
| `--top` | How many matches to show (default 5) |
| `--account` | Print this one account as JSON: account, customer, site, account manager, contacts with role, email and mobile |

**The export it reads** is the one Field CRM imports: one row per contact,
with columns `Account Name`, `Full Name` (or `First Name` and `Last Name`),
`Job Role` or `Job Title`, `Email 1`, `Mobile` and `Account Manager`. Column
names are matched loosely, as Field CRM matches them. The site is the part
of the account name after " - " ("Example Foods - Smithfield"). In a
workbook, the first visible sheet with an "Account Name" column is used.

**Matching** forgives mishearing and word order. Scores: the customer name
counts 3, the site 2, and each person heard who matches a contact at the
account (0.8 or better) counts 1.5. The scores are for Claude to weigh; when
two accounts are close, Claude asks you.

### walk_timeline.py

```
python3 scripts/walk_timeline.py --transcript FILE --start TIME --photos FOLDER
         [--out timeline.json] [--window 30] [--photo-shift SECONDS]
```

| Option | Meaning |
|---|---|
| `--transcript` | The transcript, as text or JSON (formats below) |
| `--start` | When the recording started, local time: `2026-10-29 09:00:00`, `2026-10-29T09:00`, `29/10/2026 09:00`. A time with a zone (`2026-10-28T22:00:00Z`, `+00:00`) is turned into the computer's local time |
| `--photos` | The folder of site photos. Subfolders are included. JPEG, PNG, HEIC, TIFF |
| `--out` | Where to write the result. Default: `timeline.json` next to the photos folder |
| `--window` | Seconds either side of a photo to collect speech from for its caption, and the limit for medium confidence. Default 30 |
| `--photo-shift` | Seconds added to every photo's time, to correct a phone clock that was out (section 10) |

**Transcript formats read:**

- Text, one remark per line starting with its time: `00:01:23 Speaker 1:
  words`, `[00:01:23] words`, `01:23 words`, or a time and speaker on one
  line with the words on the lines below (the Plaud app's text export).
- JSON: a list of segments, or an object holding the list under `segments`,
  `transcript`, `items`, `data`, `utterances` or `sentences`. Each segment
  has its words in `text`, `content`, `sentence` or `words`, and its start
  in `start`, `start_time`, `startTime`, `begin`, `offset` or `t` (seconds,
  or `hh:mm:ss`), or `start_ms`, `startMs`, `start_time_ms`, `begin_ms`
  (milliseconds). Very large plain numbers are taken as milliseconds.

**Where the walk is.** A conveyor starts with "now at", "now on", "we're
at", "moving to", "next is" or "this is" and a conveyor name. A project
starts with "now talking about the … project" (also "discussing" or "onto").
Each photo is put with whichever was named last before it. That is a
starting point: Claude moves a photo when what was said, the picture or the
notes show it is of something else.

**Photo times** come from the photo's own EXIF date (DateTimeOriginal). If a
photo has none, the file's modified date is used and the photo is noted
"time from the file date, not the photo": treat its match as doubtful.

**Confidence** for each photo:

| | Rule |
|---|---|
| high | Speech within 10 seconds of the photo |
| medium | Speech within the window (30 seconds) |
| low | No speech within the window |
| none | Taken more than a minute before the recording or after it ended |

**timeline.json** holds:

| Field | Meaning |
|---|---|
| `recording_start` | Start time used, local |
| `recording_length` | Time of the last remark, h:mm:ss |
| `window_s` | The window used |
| `conveyors[]` | Each conveyor named: `conveyor`, `description` (words after the name), `at` (into the recording), `clock` (time of day), `said` (the remark) |
| `projects[]` | Each project named: `project`, `at`, `clock`, `said` |
| `photos[]` | Each photo: `file`, `taken`, `into_recording`, `conveyor` or `project` (last named before it), `said_near` (remarks within the window, each with its time), `nearest_speech_s`, `confidence`, `note` |
| `transcript[]` | Every remark: `at`, `clock`, `speaker`, `text` |

### build_report.py

```
python3 scripts/build_report.py report.json [--out FOLDER] [--only internal|customer]
         [--html-only] [--pdf-engine auto|chromium|weasyprint|reportlab]
```

| Option | Meaning |
|---|---|
| `report.json` | The content (section 8). Photo paths in it are relative to this file's folder |
| `--out` | Folder for the files. Default: the folder `report.json` is in |
| `--only` | Make one of the two documents only |
| `--html-only` | Make only the HTML |
| `--pdf-engine` | Which PDF engine to use. Default `auto`: the first that works, in the order below |

Files are named `<Customer> - Site walk notes - <date>` (internal) and
`<Customer> - Site walk report - <date>` (customer copy), each `.html` and
`.pdf`. It warns when a photo listed in `photos` is not used anywhere, or a
photo used cannot be found or opened. The documents are still made, without
it.

**PDF engines**, in the order tried:

1. **Chromium**: Playwright for Python if installed, otherwise Edge, Chrome
   or Chromium if found. Prints the HTML itself, so the PDF matches the HTML
   exactly.
2. **WeasyPrint**, if installed. Also prints the HTML.
3. **ReportLab**: draws the same document natively, close to the HTML but
   not identical (fonts are Helvetica). In Claude's workspace this is
   usually the one used.

If none works, the HTML is still made: open it in Edge or Chrome, press
Ctrl+P, choose **Save as PDF**, paper **A4**, and tick **Background
graphics**.

## 8. report.json, field by field

See `examples/example-report.json` for a complete one. Text fields take
plain text: a blank line starts a new paragraph, and lines starting with
`- ` become a bulleted list. Leave out any field you have nothing for.
Nothing is ever shown as "N/A".

### The visit

| Field | Type | Meaning |
|---|---|---|
| `customer` | text | The account name exactly as in the CRM: "Example Foods - Smithfield" |
| `in_crm` | true/false | false when the customer is not in the CRM export: the internal copy flags "Not in CRM — needs adding to Dynamics" |
| `site` | text | Site or area walked: "Infeed to packing" |
| `type` | text | Default "Site walk" |
| `date` | `YYYY-MM-DD` | Date of the walk; shown as "29 October 2026" |
| `account_manager` | text | From the CRM export. Internal copy: "Account manager"; customer copy: "Intralox contact" |
| `contacts` | list | People met: `name`, `role`, `email`, `mobile`, `in_crm` (false flags "Needs adding to Dynamics"). The customer copy shows name and role only |
| `notes` | text | Everything discussed, as bullet points grouped by what they are about (usually a conveyor or topic each), ending with the follow-ups. In both copies |
| `internal_notes` | text | Budgets, prices, competitors, who decides, internal opinions. Internal copy only |
| `other_photos` | list of photo ids | Photos not of a belt to quote, in the order taken |
| `belts` | list | Belts to quote (below) |
| `photos` | object | Every photo, by id (below) |
| `fieldcrm` | object | `call_id`: the Field CRM call this report is for, from `Field CRM call.json` |
| `follow_ups` | list | Each agreed action: `what`, `who`, `when` (as said), `date` (YYYY-MM-DD, when a day was named), `task` (true only for Intralox's own actions, which become next steps in Field CRM) |
| `review` | list of text | The review list, kept with the call in Field CRM |

### A belt to quote

A belt already in Field CRM carries `ref`, its place in the call from
`Field CRM call.json`, and keeps Field CRM's values as they are (series as a
number, "800"); the import fills only its empty fields. A belt without `ref`
is a new belt.

The fields are Field CRM's own belt fields, so the table matches Field
CRM's quote request row for row. All are text; give only what was said or
written.

| Group | Field | Shown as | Required on the quote request |
|---|---|---|---|
| | `asset` | The belt's heading: "Belt 1 — CV-200" | |
| Belt | `qty` | Quantity | Yes |
| | `beltdesc` | Line / description | |
| | `series` | Series | Yes |
| | `style` | Style / surface | Yes |
| | `beltmat` | Belt material | Yes |
| | `colour` | Colour | |
| | `rodmat` | Rod material | Yes |
| | `width` | Belt width (mm) | Yes |
| | `beltlen` | Belt length (m) | |
| | `clength` | Conveyor length (m) | |
| | `frame` | Inside frame width (mm) | |
| | `retrofit` | Retrofit | |
| | `qcontact` | Quote contact (internal copy only) | |
| Sprockets | `sprocket` | Description | |
| | `sprpn` | Part number | |
| | `sprbore` | Bore | |
| | `sprpd` | Pitch diameter | |
| | `sprmat` | Material | |
| | `sprvar` | Build type or variant | |
| | `sprdrive` | Drive quantity | |
| | `spridle` | Idle quantity | |
| Flights and sideguards | `fstyle`, `flmat`, `fheight`, `frows`, `fspacing`, `findent`, `cnotch`, `sgtype`, `sgmat`, `sgheight` | Flight type, Flight material, Flight height (mm), Every N rows, Flight spacing (mm), Indent (mm), Centre notch (mm), Sideguard type, Sideguard material, Sideguard height (mm) | |
| Other | `other` | Any further label → value pairs | |

Plus:

- `comment`: why the belt is needed and any date asked for; shown as
  "General comments".
- `tsg`: true only when the belt ID was confirmed with TSG. The internal copy
  says "Belt ID confirmed with TSG" or flags "not yet confirmed".
- `photos`: photo ids shown under the belt.

On the internal copy (the quote request for customer service), the required
fields show even when not given, as a dash, so the gap is seen. The
customer copy shows only what was given.

### A photo

`photos` maps an id (any short name: `p1`, `cv200-edge`) to:

| Field | Meaning |
|---|---|
| `file` | Path to the photo, relative to `report.json` |
| `time` | When it was taken, `2026-10-29T09:03:55`; shown as 09:03 before the caption |
| `caption` | One plain sentence starting with the conveyor: "CV-200: rods walking out on the left edge." |
| `confidence` | From `timeline.json`; kept for the record, not shown |

## 9. The documents' look

The documents use Field CRM's own stylesheet (its compiled call notes and
belt request for quote), so they look like the documents you already send:

- A4 page, white, with the Intralox logo on the red band at the top. The
  logo is never recoloured, stretched or cropped.
- Type: Roboto, then Arial, then Helvetica Neue, as Field CRM.
- Section headings in Intralox cyan, uppercase, letter-spaced.
- Ruled tables, label column in grey, cyan header bands on the belt table.
- Each belt to quote in a block with a cyan stripe down its left edge.
- Flags ("Needs adding to Dynamics", "not yet confirmed with TSG") in
  Intralox dark red text, on the internal copy only.
- Photos two to a row, each with its time and caption.
- A dark grey footer: document, customer, date.

The sections always come in this order: details, people, notes, internal
notes (internal copy), photos, belts to quote.

**Changing the look.** The HTML's style is the `CSS` text in
`build_report.py`, copied from Field CRM's `NOTES_CSS`; the ReportLab PDF
has its own colours and sizes in `pdf_reportlab()`. Change both together,
then run `self_test.py` and compare the HTML and the PDF. The logo is
`assets/intralox-logo.png`; replace it only with an official Intralox file.

## 10. Troubleshooting

**Claude cannot find the call.** Check you clicked Save for Claude on the
call, and that the PC folder Claude uses is the one Field CRM saves to (the
settings file, section 3). The visit's folder is `Customer\Site\date`.

**Collect photos found nothing, or the wrong ones.** Check the camera roll
path in the settings file, that OneDrive camera upload has finished on the
phone, and that the recording's start time is right (local time).

**Import call report says "Nothing new".** The call already has everything
in the report: it was imported before. A changed report imports the
changes.

**Import call report says it was made for another call.** The report's call
id is not this call's. Check you opened the right call; if it is right, click
OK to import it anyway.

**Claude picked the wrong customer, or asks which one.** Say the customer
and site clearly at the start of the walk (section 4), and check the export
is a recent one. Tell Claude the right account; it draws the documents
again.

**Claude cannot find the CRM export** (only needed for a call not in Field CRM). Check the Microsoft 365 connector is
connected, and tell Claude the file's name or folder. Or attach the export
to the chat.

**"Reading .xlsx needs openpyxl".** Ask Claude to run `pip install openpyxl`,
or save the export as CSV.

**Photos land under the wrong conveyor, all shifted the same way.** The
phone's clock and the recorder's were out. Find one photo whose true moment
you know from the recording ("Photo of the drive sprocket" at 0:04:41, so
09:04:41), compare with the photo's time, and ask Claude to run
`walk_timeline.py` again with `--photo-shift` set to the difference in
seconds (positive if the photo's time is early).

**Every photo says "time from the file date".** The photos lost their EXIF
data, usually by going through WhatsApp, Teams chat or email. Copy them off
the phone again by OneDrive camera upload or a cable. If that is not
possible, Claude places them by what they show and by the notes, and marks
them all for checking.

**"No conveyors found".** The conveyor names were not said in one of the set
phrases (section 4), or the transcript spelled them differently ("see V
200"). Claude can still sort the photos by what was said, with lower
confidence. Tell Claude the conveyor names and roughly when you reached each.

**A photo "could not be opened" and HEIC is mentioned.** The photos are
iPhone HEIC files. Ask Claude to run `pip install pillow-heif` and build
again. To avoid it: on the iPhone, **Settings**, **Camera**, **Formats**,
**Most Compatible**.

**"PDF: not made".** No PDF engine is available. Ask Claude to run
`pip install reportlab` and build again; or use the HTML's Save as PDF
(section 7). If Claude says it cannot install anything, your administrator
has limited its network access for code execution; ask them to allow the
Python package index (pypi.org), or use Save as PDF.

**Claude cannot find the recording.** Check the Plaud connector is
connected (section 3), and that the recording has finished transcribing in
the Plaud app. Or export the transcript and attach it.

**The pasted document looks plain in Outlook.** Outlook drops some styling
when pasting. Attach the HTML or the PDF instead.

**The handwriting was misread.** Claude lists words it could not read; it
can still misread one confidently. Check measurements and part numbers
against your notes before sending.

## 11. Customer data and privacy

- The call, the recording, the photos, the notes and the documents are
  customer information. They stay in your PC folders (synced to your work
  OneDrive), Field CRM (encrypted on the device before it syncs) and the
  Claude conversation (under Intralox's Claude agreement). The recording is
  also in Plaud's cloud under Plaud's terms.
- Claude never reaches Field CRM's database: files in the visit folder are
  the only link, in both directions.
- Field CRM calls are shared with your team, so the imported report,
  internal notes included, is seen by your team like the rest of the call.
- This package contains no customer data: the test visit, its Field CRM call,
  its CRM export, the example and all names in them are made up. Do not add
  real visits, a real export or the belt catalogue to it.
- Ask before recording, and follow each site's rules on photographs.

## 12. What has and has not been tested

Tested (on Linux, Python 3.11, and Field CRM's own test suite):

- `self_test.py` passes: it reads the made-up Field CRM call and its belt's
  `ref`; it collects the right photos by time; it finds the customer in the
  made-up export ahead of the near misses; it matches the photos; it draws
  both documents (the customer copy without anything internal); and it writes
  `fieldcrm-import.json` for the right call, with the belt's `ref`, five
  photos, two next steps and documents without photos.
- Field CRM's test suite (`tests/qa-claude.mjs`) runs this skill's
  `make_import.py` on the example and imports the result into a call: the
  logged belt is filled in from the walk without changing what was typed, the
  photos, contact and next steps come in, and importing again adds nothing.
- Save for Claude writes the call and its photos into the visit's folder (a
  stand-in folder in the test, not real disk), or a download on a phone.

Not yet tested:

- Running inside Claude Enterprise, and Claude Desktop's folder access.
- The Plaud connector and a real Plaud transcript.
- A real camera roll, real phone photos (HEIC, OneDrive's naming), real
  handwriting, a real visit.
- The browser's real folder picker and Windows paths.

Check the first real reports carefully, and feed back what did not line up.

## 13. Changing the skill

- **Claude's behaviour** (what goes where, wording rules, what to ask):
  `SKILL.md`.
- **The look**: `build_report.py` (section 9).
- **The belt fields**: `BELT_GROUPS` in `build_report.py`, kept the same as
  Field CRM's `beltSpecGroups`.
- **The CRM export's columns**: `COL` in `find_customer.py`, kept the same
  as Field CRM's.
- **The files Field CRM and Claude exchange**: `fieldcrm_call.py` and
  `make_import.py` here, and `clCallFile`, `clApply` in Field CRM's `app.js`.
  Both carry a `kind` and a version `v`; change them together, and keep
  `tests/qa-claude.mjs` passing.
- **Conveyor and project phrases**: `MARK` and `PROJECT` in
  `walk_timeline.py`. Add a line to `test-visit/transcript.txt` and a check
  in `self_test.py` for any phrase you add.
- **Confidence limits**: `build()` in `walk_timeline.py` (10 seconds for
  high; `--window` for medium).
- **Planned: choosing sprockets.** Suggesting sprockets and part numbers for
  a belt needs the belt catalogue. Like the CRM export it is Intralox's own
  data and stays out of this zip: it would live in each person's OneDrive
  and be read the same way.

After any change: run `self_test.py`, compare the example documents with
those in `examples/`, then zip the `end-game` folder again (`end-game-skill/make_package.py`) (the
folder itself at the top of the zip) and upload it in place of the old one.
Add a line to section 14.

## 14. Versions

| Version | Date | Change |
|---|---|---|
| 1.1 | 29 October 2026 | The call saved from the phone (Field CRM v187's share sheet) is found in the Inbox, as `… - Field CRM call.txt`; the settings file has the Inbox |
| 1.0 | 29 October 2026 | First version, from site-walk-report 1.2: reads the call Field CRM saved for Claude, collects photos from the camera roll by time, works in the visit's PC folder, follow-ups and review list, and writes fieldcrm-import.json for Field CRM's Import call report (Field CRM v186) |
