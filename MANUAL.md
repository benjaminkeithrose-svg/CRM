# Field CRM — how to use it

Plan your week on the PC. Do the calls on your phone. Cloud sync keeps the two in step.

Everything is kept on the device you're using, and — once you've signed in to cloud sync — copied, encrypted with your passphrase, to your own Supabase project so your other devices get it too.

---

## Contents

1. [Setting it up the first time](#1-setting-it-up-the-first-time)
2. [Loading your accounts](#2-loading-your-accounts)
3. [Planning a week](#3-planning-a-week)
4. [Outlook, and keeping phone and PC in step](#4-outlook-and-keeping-phone-and-pc-in-step)
5. [Doing a call](#5-doing-a-call)
6. [Sending the notes out](#6-sending-the-notes-out)
7. [Cloud sync](#7-cloud-sync)
8. [Back up](#8-back-up)
10. [When something goes wrong](#10-when-something-goes-wrong)

---

## 1. Setting it up the first time

You need to do this on **both** the PC and the phone.

**On the PC**

1. Open the app's web address in Chrome or Edge.
2. That's it. Bookmark it.

**On the phone**

1. Open the same address in Chrome.
2. Tap the three dots, then **Add to Home screen**.
3. Open it from the home screen icon from now on, not from Chrome.

The app works with no signal once it has been opened once.

> **The icon says CALL LOG.** If you still have the old Belt Call Log installed, the two icons look identical. They are separate apps with separate data.

---

## 2. Loading your accounts

The app arrives empty. It has no customer names in it at all. You load your own.

**Do this on the PC first.**

1. In Dynamics, open the **ANZ Active Food Contacts** view.
2. Export it to Excel.
3. In Field CRM, scroll to **Data** and choose the file under **Contact database**.
4. Tap **Import CRM export**.

You'll get a short report: how many accounts and contacts came in, how many are missing an email or a mobile, and anything that didn't look right.

**Export as .xlsx, not .csv.** The .xlsx carries a hidden sheet that the app needs later to get notes back into Dynamics. A .csv works for looking things up, but that route closes.

**Then load the belt reference data.** Under **Belt reference data**, choose `Plant_Audit_Template_1.xlsm` and tap **Import plant audit workbook**. This is what fills the series, style, material, sprocket and flight pickers on the belt form. Without it the belt form still works but every picker is empty, and it tells you so at the top of the screen.

It takes a few seconds and the app will sit still while it reads. Leave the screen on.

If you've already set up GitHub sync (below) on another device and pushed the belt data from there, you can instead tap **Pull belt reference data** under **Exchange** to bring it down that way — no workbook needed on this device.

**Optionally, load the engineering manuals.** Under **Engineering manuals**, pick a PDF and tap **Import engineering manual**. One at a time, several minutes each, screen left on — every page becomes an image so it works with no reception. Then **Manuals** on the home screen searches them by series or by any term.

These are stored separately from the Belt Call Log's copy, so loading them here doesn't touch that app. It also means you load them once for each.

**Then load the zone pins.** Under **Zone overrides**, choose `zone-overrides.json` and tap **Load zone overrides**. This is the file that puts particular accounts in the right zone. It is kept out of the app on purpose, because it contains customer names.

You don't need to import on the phone. The plan file carries the accounts across — see step 4.

**Do this again whenever the CRM data changes.** Monthly is plenty.

---

## 3. Planning a week

On the PC, tap **Plan**.

The left side is your account list, the right side is the calendar.

**Finding accounts**

- Pick a **Zone** and a **Manager** to see that patch.
- Or just type in the search box. Search ignores the zone and manager and looks at every account you have — because equipment builders and head offices are often in somebody else's patch and you still have to call on them.
- The coloured chips filter by focus. **Needs booking** shows only accounts past their call cycle with nothing already in the diary.

**Booking a call**

- Drag an account onto a day, or click it, or click **+ Add call** on a day.
- Set the time, how long, what the call is for, and tick who you want to see.
- Save.

Drag an appointment to a different day to move it.

**Territory weeks**

Above the calendar, pick the zone you'll be working that week. This publishes a Monday-to-Friday banner into your Outlook calendar so colleagues can see where you are. It shows as **free**, so it never blocks anyone booking time with you.

---

## 4. Outlook, and keeping phone and PC in step

**Put the appointments in Outlook**

Tap **Download to Outlook**. You get an `.ics` file — open it and accept it. Only appointments that have changed since last time are included.

The coloured dot on each appointment tells you where it stands:

| Dot | Meaning |
|---|---|
| Blue | Not in Outlook yet |
| Green | In Outlook, unchanged |
| Orange | Changed here since you last downloaded — download again |

Downloading again **updates** the Outlook entry. It does not create a second one.

**The phone and the PC** don't need anything sent between them. Cloud sync (section 7) carries the plan, the calls, tasks, photos and the account data both ways, by itself.

---

## 5. Doing a call

On the phone, tap **Plan**. You get **Today**.

Each visit shows the time, the site, what the call is for, and who you said you'd see. Tap a name to ring them.

Four things you can do:

- **Start** — begins the call. Everything is filled in already.
- **Close out** — you went, there's nothing to write up. It still counts as a visit.
- **Move** — pick another day.
- **Cancel** or **Missed** — it didn't happen.

**This week** shows Monday to Friday.

### A call that wasn't planned

Tap **Log an unplanned call** and search for the account. The call opens the same way.

It also books itself into the plan, on today's date and at the time you started it, so when you send the week back the PC sees it on the calendar as well as in the account history. It's tagged **unplanned** so you can tell it apart from something you scheduled.

If you type in an account that isn't in the CRM, you still get the call — it just doesn't get a calendar entry, because there's no account for it to hang on.

### Booking a visit for later

Tap **Book a visit for later**, pick the account, pick the day. Nothing is started — it just goes in the diary, and travels to the PC with your calls.

### Going back to the same site

If you already have a call at that account **this week**, the app says so and offers to continue it. Say yes and everything already on it is kept — the belts, the notes, the photos. Anyone new you ticked this time is added.

Say no and you get a separate call. Both are fine; one call is usually what you want, because two trips to the same plant in a week are normally one job.

### Once a call is started

You're on the call screen. Four buttons:

| Button | Use it for |
|---|---|
| **Belt** | Asset number, line, width, length, materials, sprockets, flights |
| **Project** | Something in the pipeline, with a status and a target. If that project is already running at this account, it offers it &mdash; update it rather than logging a second copy |
| **Note** | Anything else — turnover, kill rate, plant conditions, competitors |
| **Health check** | A fault or a wear observation. Camera is on the form. Severity has to be answered |

Add them in any order, whenever suits.

**Projects carry forward.** Open the Project form at an account with something already running and it offers it at the top. Tap it and the form fills in — change the status and the next action, and the move is recorded, so the report can say *Scoping → Awaiting quote* rather than showing you two unrelated entries. **Start a different project** is there for when it genuinely is one. Setting a project to **Complete** or **Not proceeding** stops it being offered again.

**Health checks remember.** Type an asset number that's been logged here before and it tells you: when, what it was, at what severity, and what was recommended. If the last one was Urgent it says so in red. Take the photo on the form — the camera is right under the fault description — and it goes with the entry when you save.

Severity has to be answered. An unanswered one used to save quietly and then print as if nothing was wrong. Urgent items come first in the report.

### Photos

Every entry in the list has its own **Camera** and **Photos** buttons. Take the photo whenever you like and attach it to the right belt afterwards — it doesn't have to be in order.

The camera and photos icons in the toolbar at the top of the call attach to whatever you logged last. Photos with nothing to attach them to go in **Loose photos** at the bottom, and come out at the end of the notes.

Tap a photo to delete it.

### Finishing

**Close call** when you're done. If there was nothing to write up, that's fine — a visit with no report is a finished visit, not an unfinished one.

---

## 6. Sending the notes out

Tap **Compile**, then **Generate and share**.

You get one HTML file with everything in it, photos included. Send it to OneDrive, Outlook or Teams from the share sheet.

At the bottom of the notes you'll see **Previous calls at this account** — the last six visits, what was found, and which file each went out in.

### Free up the space afterwards

Once the notes have been shared, the compile screen offers **Drop the photos, keep the record**. The photos are already in the file you sent, and the phone is holding a second copy. Dropping them takes a call from around 25 MB to about 20 KB.

It keeps the record of how many photos there were and which file they went out in. It can't be undone, so only do it after the file has actually gone.

---

## 7. Cloud sync

Set up once on each device, under **⋯** (top right of Home) → **Cloud sync**:

1. Paste the project address and the publishable key.
2. Sign in with your email and password.
3. On the first device, set your passphrase (twice). On every other device, type it once to unlock.

After that it runs by itself — when the app opens, when signal comes back, and a few seconds after you change anything. **Sync now** is there if you want it straight away. Calls (with full-size photos), quote requests, appointments, tasks, the CRM accounts, belt reference data, the plant register, zone overrides, planning weeks and reassignments all travel. Everything is locked with your passphrase before it leaves the device.

**Keep the passphrase in your password manager.** Without it nobody — including you — can read the cloud copy.

> **Sharing a file still works** — a backup, the zone overrides or a CRM export. Share it to Field CRM and the app works out what it is.

---

## 8. Back up

Under **⋯ → Backup and restore**, tap **Back up**. You get one file with your calls, quote requests, tasks, appointments, accounts and settings — not the photos, which are in the cloud. Put it somewhere that isn't the phone.

Cloud sync isn't a backup: a delete reaches every device, and without the passphrase nobody can read the cloud copy. This file is the undo.

**Restore** adds and updates records. It never deletes anything already there.

---

## 10. When something goes wrong

**A fix I asked for isn't there.** The old version is cached. Close the app completely and reopen it. If it's still wrong, the `sw.js` file didn't get its version bumped when it was uploaded.

**Nothing appears on Today.** Either nothing is planned, or this device hasn't synced yet. Check **⋯ → Cloud sync** — it says when it last synced.

**Did that file actually load?** The message along the bottom says what it loaded, or why it couldn't.

**Sync says it failed.** The line under **⋯ → Cloud sync** says why — usually no signal. It tries again by itself when signal comes back.

**Field CRM isn't in the Android share sheet.** It only appears once the app is installed to the home screen. Open it in Chrome, three dots, **Add to Home screen**, then try again. If you've just updated the app, close it fully and reopen it once so the new version registers.

**I shared a file and nothing happened.** Look at the message along the bottom — it says what the file was, or why it couldn't be used. Sharing a photo, a PDF or a Word document will be refused; it takes `.json`, `.xlsx` and `.csv`.

**An account isn't in the search.** Search covers everything you've imported. If it's genuinely missing, it wasn't in the export — check the view in Dynamics, then re-import.

**A phone number won't format.** Some don't. They print exactly as they're stored and are flagged as *check*. Nothing is lost.

**An account is in the wrong zone.** Load the zone overrides file (step 2). If it's still wrong, that account needs adding to the overrides.

**Appointments turned orange on their own.** They didn't. Something that goes into the invite changed — the day, the time, who's listed, the agenda, or the notes. Download again.

**Import is slow.** It's working. The whole file is parsed in one go and the screen won't respond until it's finished. Do it on the PC where you can.

**Reinstalling on the phone.** Removing the home screen icon isn't enough — it's a real app. Long-press → **App info** → **Uninstall**. Then type the address into Chrome again. Tapping the old link takes you back into the old install.

> **Back up before you uninstall.** Uninstalling deletes everything on that device.

---

## Two things to remember

**Never put an export, a backup, or the zone overrides file into the GitHub repository.** It's public. Customer data lives on your devices and, encrypted, in your own Supabase project.

**Plan on the PC, work on the phone.** Cloud sync keeps them in step; the newest edit wins.
