# Site walk report: start here

This is a Claude skill. After a site walk, you give Claude your photos and
handwritten notes; it fetches your Plaud recording, finds the customer in
your CRM export, and gives back two documents in the Field CRM style, each
as HTML (to email or paste into Outlook) and PDF:

- **Site walk notes** (internal): customer and contacts as in the CRM, the
  notes as bullet points, internal notes, photos, and the belts to quote as a
  quote request for customer service.
- **Site walk report** (customer copy): the same without anything internal.

It takes about fifteen minutes to set up and test. The full guide is
`DOCUMENTATION.html` (open it in Edge); this page is just the steps.

## 1. Install the skill

1. Open Claude (claude.ai or the Claude desktop app) and sign in with your
   Intralox account.
2. Click your name at the bottom left, then **Settings**.
3. Click **Capabilities**.
4. Make sure **Code execution and file creation** is turned on.
5. Under **Skills**, click **Upload skill**.
6. Choose the zip file you were sent, exactly as you received it. Do not
   unzip it first.
7. Check that **site-walk-report** now shows in the list of skills, turned on.

If there is no Skills section or no Upload button, your Claude administrator
has not turned skills on yet. Send them this zip and ask them to add the
skill for you (DOCUMENTATION.html, section 3, says how).

## 2. Test it

1. Start a new chat in Claude.
2. Type: **Test the site walk report skill with its test visit.**
3. Wait. Claude works through the steps; it takes a few minutes.
4. Download the four files Claude gives you and open them.
5. Compare them with the four in the `examples` folder of this zip. The
   words can differ; the customer, notes, belt details and photos should
   match. `test-visit/EXPECTED.md` lists exactly what should be there.
6. Check the customer copy has no internal notes (the budget and the other
   supplier).
7. Check Claude's reply ends with a short list of things to review. In the
   test it should mention photo IMG_4105, which was taken after the walk.

## 3. Connect Microsoft 365 and Plaud (once)

1. In Claude, click your name, then **Settings**, then **Connectors**.
2. Find **Microsoft 365** and click **Connect**. Sign in with your work
   account.
3. Find **Plaud** and click **Connect**. Sign in with your Plaud account and
   allow access.

If either is not in the list, ask your Claude administrator to add it. Until
then, the skill still works: attach the CRM export and the Plaud transcript
(exported from the Plaud app as a text file with timestamps) to the chat.

## 4. Put your CRM export in OneDrive (once, then keep it fresh)

1. Export your contacts from the CRM, the same export you load into Field
   CRM.
2. Save it in your work OneDrive, for example in a folder called
   `CRM export`.
3. When you take a new export, replace the old file.

Never put the export in the skill's zip: the zip gets passed to colleagues,
and each person uses their own export.

## 5. Use it after a site walk

1. On site, start the Plaud first and say the customer, the site and who you
   are with. Say "Now at …" at each conveyor, and read out any belt to quote
   in full.
2. Back at your PC, put the visit's photos and the photos of your note pages
   in one folder. Copy them off the phone by OneDrive camera upload or a
   cable, not by WhatsApp or email, which strip the photo's time.
3. Right-click the folder, click **Send to**, then **Compressed (zipped)
   folder**.
4. Start a new chat in Claude and drag the zip file into it.
5. Type: **Build the site walk notes for this morning's walk.**
6. Read Claude's review list and check those points.
7. Download the files. Send the customer copy to the customer, and the
   internal notes to customer service with the quote.

## What is in this zip

| | |
|---|---|
| `SKILL.md` | The instructions Claude follows |
| `README.md` | This page |
| `DOCUMENTATION.md`, `DOCUMENTATION.html` | The full guide (the same words twice: one for Claude, one to read) |
| `scripts/` | The tools Claude runs: find the customer, line up times, draw the documents, check setup, self-test |
| `assets/intralox-logo.png` | The logo in the documents' header |
| `examples/` | Finished example documents (internal and customer copy, HTML and PDF) and the data behind them |
| `test-visit/` | A made-up site walk to test with, including a made-up CRM export, and what the result should be |

Everything in the test visit and the examples is made up. No customer data
is in this zip; keep it that way if you pass it on.
