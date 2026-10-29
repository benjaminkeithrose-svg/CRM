# Site walk report: documentation

Version 1.2, 29 October 2026.

A Claude skill that turns a conveyor site walk (a Plaud recording, phone
photos and handwritten notes) into Field CRM-style site walk notes and a
customer copy, as HTML and PDF. Everything in the examples is made up.

**Contents**

1. What it does
2. How it works
3. Setting it up
4. On site: habits that make good notes
5. After the visit: giving Claude the files
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

You walk a plant with the Plaud recorder running, say each conveyor's name
as you reach it, take photos and write notes. Afterwards you give Claude the
photos and notes and ask for the site walk notes. Claude:

- finds the customer in your CRM export, so the account name, account
  manager and contacts are the CRM's, not what the recording heard;
- works out which conveyor each photo shows, from when it was taken and what
  was being said at that moment, and captions it;
- reads the handwritten notes and uses them as the final word on specifics;
- condenses everything discussed (conveyors, projects, requests) into short
  bullet-point notes, ending with the agreed follow-ups;
- keeps anything internal (budgets, prices, competitors) in separate internal
  notes;
- puts each belt to quote into a quote request laid out as Field CRM's;
- draws two documents with a fixed template, and ends with a short list of
  things for you to check.

**The two documents**

| | Site walk notes (internal) | Site walk report (customer copy) |
|---|---|---|
| Details | Call details: date, call type, account manager, customer, site; "Not in CRM" flag | Visit details: date, customer, site, Intralox contact |
| People | Contacts: name, role, email, mobile, CRM status | People: name, role |
| Notes | Yes | Yes |
| Internal notes | Yes | No |
| Photos | Yes | Yes |
| Belts to quote | Field CRM's quote request: required fields shown even when empty, quantity first, TSG line | The same tables, only what was given, no TSG line |

Each comes as:

- **HTML**: one self-contained file (photos and logo inside it). Attach it
  to an email, or open it in Edge, select all and paste into Outlook.
- **PDF**: A4, for attaching or printing.

## 2. How it works

```
 CRM export (OneDrive) ─► find_customer.py ─► account, manager, contacts ─┐
                                                                         │
 Plaud recording ──► transcript with times ─┐                            │
                                            ├─► walk_timeline.py ─► timeline.json
 phone photos ─────► each photo's own time ─┘                            │
                                                                         ▼
 handwritten notes ─► read by Claude ─────────────────────────────► report.json
                                                                         │
                                                     build_report.py ◄───┘
                                                           │
                         Site walk notes (internal) + Site walk report (customer)
                                    each as HTML + PDF
```

**The customer comes from the CRM.** A recording hears "Smithfield" or
"Example Foods"; the CRM export says which account that is, who manages it,
and the contacts' details. The tool ranks the accounts against what was
heard and the people named, and Claude asks you when it is not clear.

**Times line everything up.** The transcript gives each remark's time into
the recording; add the recording's start time and you have the clock time
of every remark. Each photo carries the clock time it was taken (EXIF data,
written by the phone). So a photo taken at 09:03:55 sits next to whatever
was said at 09:03:55, and under whichever conveyor was last named before
then.

**Claude decides the words, the script decides the look.** Claude never
writes the documents' HTML. It fills in `report.json`, and `build_report.py`
draws it with Field CRM's own stylesheet and belt fields. That keeps every
document consistent, whoever runs it.

**A person checks it.** The matching is good, not perfect. Claude lists
anything doubtful.

## 3. Setting it up

### What is needed

- A Claude account (Pro, Team or Enterprise) with **Code execution and file
  creation** turned on. The skill runs small Python programs in Claude's own
  workspace; nothing is installed on your PC.
- **Skills** turned on for your account. On Team and Enterprise, an owner
  turns skills on for the organisation first.
- The **Microsoft 365** connector, so Claude can find your CRM export in
  OneDrive. Without it, attach the export to the chat.
- Your **CRM export** in OneDrive: the same contacts export Field CRM
  imports (an .xlsx or .csv with an "Account Name" column). Each person uses
  their own. Replace it whenever you take a fresh export; Claude reads the
  latest one it finds.
- Optional: the **Plaud** connector, so Claude can fetch the recording
  itself. Without it, export the transcript from the Plaud app.

### Installing it for yourself

1. In Claude, click your name, then **Settings**, then **Capabilities**.
2. Turn on **Code execution and file creation**.
3. Under **Skills**, click **Upload skill** and choose this zip file, as it
   came (not unzipped).
4. Check **site-walk-report** shows in the list, turned on.

Menu names move from time to time; if these do not match, search Claude's
help for "upload a skill".

### Installing it for the whole team (Claude administrator)

An organisation owner can add the skill once for everyone, from the
organisation's admin settings (Skills), uploading the same zip. Then each
person finds it already in their list.

### Connecting Microsoft 365 and Plaud

1. In Claude: **Settings**, then **Connectors**.
2. Find **Microsoft 365**, click **Connect**, and sign in with your work
   account.
3. Find **Plaud**, click **Connect**, sign in to Plaud and allow access.

On Enterprise, the administrator may need to add these connectors to the
organisation first.

### Checking it works

Ask Claude: **Test the site walk report skill with its test visit.** Claude
runs everything on the made-up visit in `test-visit/` (which has its own
made-up CRM export), builds both documents and compares them with
`test-visit/EXPECTED.md`.

To test only the tools (no AI involved), ask Claude to run
`python3 scripts/self_test.py` from the skill's folder, or run it yourself
on any computer with Python 3.8 or later. It prints `ok` or `FAIL` for each
check and makes the example documents into `self-test-output/`.

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
6. **Read out a belt to quote in full**: series, style, material, colour,
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

## 5. After the visit: giving Claude the files

1. Get the photos off the phone **by OneDrive camera upload or a cable**.
   Photos sent by WhatsApp, Teams chat or email usually lose their time, and
   then they cannot be matched.
2. Put the site photos and the note-page photos in one folder, for example
   `Site visits\Example Foods\2026-10-29`. A subfolder `notes` for the note
   pages helps but is not needed.
3. Right-click the folder, **Send to**, **Compressed (zipped) folder**.
4. In a new Claude chat, drag the zip in and ask, for example: "Build the
   site walk notes for this morning's walk."

If the Plaud connector is not set up, also attach the transcript: in the
Plaud app open the recording, export the transcript as a text file with
timestamps, and attach it. Tell Claude the time the recording started (the
Plaud app shows it on the recording).

## 6. What Claude does

`SKILL.md` holds Claude's instructions; in short:

1. Checks the tools (`check_setup.py`).
2. Finds your CRM export in OneDrive and the customer in it
   (`find_customer.py`). Asks you if the match is not clear.
3. Fetches the transcript from Plaud (or uses the attached one), and the
   recording's start time.
4. Lines up the transcript and the photos (`walk_timeline.py`), giving
   `timeline.json`.
5. Reads the handwritten notes.
6. Writes `report.json`: the account and contacts, the notes as bullet
   points, the internal notes, the belts to quote, the photos and captions.
7. Draws both documents (`build_report.py`): HTML and PDF each.
8. Gives you the four files and a review list: the customer match if not
   certain, photos left out or doubtful, words it could not read, places
   where the notes and the recording disagree, and belt fields not given.

How it sorts the notes: conversations never go the same way twice, so
Claude groups what belongs together by what it is about, not strictly by
when it was said, and infers where a remark belongs from its context. It
usually comes out as a bullet for each conveyor or topic, roughly in the
order walked, but that is a guide, not a rule. Where it placed something
that matters by inference, it says so on the review list.

Rules it follows: where things go is a judgement, the facts are not; facts
only from the recording, notes, photos and the CRM export; never a guessed
measurement, part, sprocket, date or name; never the
transcript itself or side remarks; anything internal only in the internal
notes; the notes win on specifics; Australian English; Intralox product
names as Intralox writes them.

To change something, tell Claude ("move the second photo to the CV-200 belt",
"the width is 610 mm", "that's the Lidcombe site"); it changes `report.json`
and draws the documents again.

**Not yet:** Claude does not choose sprockets, part numbers or belt
specifications. It records what was said. Choosing them needs the belt
catalogue, which is a later addition (section 13).

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
answers: the right customer found, three conveyors and the project, each
photo's conveyor and confidence, both documents made, every photo placed,
and nothing internal in the customer copy. Output goes to
`self-test-output/` in the skill's folder. Exit code 0 means passed.

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

### A belt to quote

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

**Claude picked the wrong customer, or asks which one.** Say the customer
and site clearly at the start of the walk (section 4), and check the export
is a recent one. Tell Claude the right account; it draws the documents
again.

**Claude cannot find the CRM export.** Check the Microsoft 365 connector is
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

- The CRM export, recording, photos, notes and the documents are customer
  information. They go to Claude under your organisation's Claude agreement,
  and to Plaud under its own. Nothing goes anywhere else.
- **The CRM export lives in your work OneDrive, never in this skill.** The
  skill zip is passed between colleagues; each person keeps their own export
  in their own OneDrive. Claude reads it from there for each visit and never
  copies it into the skill's folder.
- Keep visit folders in your work OneDrive, not on personal storage.
- This package contains no customer data: the test visit, its CRM export,
  the example and all names in them (Example Foods, Jo Bloggs, Pat Example,
  Alex Example) are made up. Do not add real visits, real names, a real
  export or the belt catalogue to it before passing it on.
- Ask before recording, and follow each site's rules on photographs.
- The customer copy never includes the internal notes, CRM flags, contact
  details, the transcript or side remarks. Check it before sending.

## 12. What has and has not been tested

Tested (on Linux, Python 3.11):

- `self_test.py` passes: the right customer is found in the made-up export
  ahead of the planted near misses; the three conveyors and the project are
  found; the four photos taken while talking are matched with high
  confidence and the fifth, taken in silence after the walk, comes out low;
  both documents are made, every photo is placed, and the customer copy
  carries none of the internal notes, flags or contact details.
- Both documents draw as HTML and as three-page A4 PDFs, both with Chromium
  and with ReportLab.
- A photo that cannot be opened gives a warning and the documents are still
  made.

Not yet tested:

- Running inside Claude (Enterprise) as an installed skill.
- The Microsoft 365 connector finding and handing over the CRM export, and a
  real export's columns.
- The Plaud connector and a real Plaud transcript's exact format.
- A real site walk, real photos from a phone, and real handwriting.
- Windows paths and Edge as the PDF engine.

The first real use should be checked carefully, and anything that did not
line up fed back so the skill can be adjusted.

## 13. Changing the skill

- **Claude's behaviour** (what goes where, wording rules, what to ask):
  `SKILL.md`.
- **The look**: `build_report.py` (section 9).
- **The belt fields**: `BELT_GROUPS` in `build_report.py`, kept the same as
  Field CRM's `beltSpecGroups`.
- **The CRM export's columns**: `COL` in `find_customer.py`, kept the same
  as Field CRM's.
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
those in `examples/`, then zip the `site-walk-report` folder again (the
folder itself at the top of the zip) and upload it in place of the old one.
Add a line to section 14.

## 14. Versions

| Version | Date | Change |
|---|---|---|
| 1.0 | 29 October 2026 | First version: time matching, report template, HTML and PDF, test visit, self-test |
| 1.2 | 29 October 2026 | Notes sorted by judgement rather than a fixed pattern: grouped by what they are about, with placement inferred from context and flagged when it matters. Facts stay strict |
| 1.1 | 29 October 2026 | Customer found in the CRM export from OneDrive. Notes condensed into bullet points. Belts to quote in Field CRM's quote request layout and fields. Two documents: internal notes and a customer copy. Field CRM's own stylesheet. Projects recognised in the recording |
