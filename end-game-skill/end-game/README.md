# End game: start here

A Claude skill for Claude Enterprise on the PC. After a site call, you type
**Do the call report** and Claude writes it from everything the call left
behind:
- the call in Field CRM, with its belts and photos;
- the Plaud recording;
- the phone photos;
- your handwritten notes.

It puts everything in the visit's folder on the PC:
- **Site walk notes** (internal, with the quote request for customer service);
- **Site walk report** (the customer copy), each as HTML and PDF;
- a file Field CRM imports back into the same call.

The full guide is `DOCUMENTATION.html` (open it in Edge).

This is the newer sibling of the `site-walk-report` skill. Both can be
installed at once; they do not touch each other.

## 1. Install the skill

1. Open Claude and sign in with your Intralox account.
2. Click your name at the bottom left, then **Settings**, then **Capabilities**.
3. Make sure **Code execution and file creation** is turned on.
4. Under **Skills**, click **Upload skill**, and choose the zip file as you
   received it.
5. Check that **end-game** shows in the list, turned on.

## 2. Let Claude reach your PC folders

The skill works best when Claude Desktop can open the folders on your PC.

1. Open the Claude desktop app on the PC.
2. Give it access to your Field CRM PC folder (the folder Field CRM's
   **Save to PC folder** uses) and to your OneDrive camera roll folder.

If the desktop app doesn't offer folder access, ask your Claude
administrator. Until then, you can zip the visit's folder, attach it to the
chat, and save the files Claude gives you back into it.

## 3. Test it

1. Start a new chat in Claude.
2. Type: **Test the end-game skill with its test visit.**
3. Wait a few minutes while Claude works through it.
4. Compare its documents with those in `examples/`. `test-visit/EXPECTED.md`
   lists what should be there.

## 4. After a site call

1. In Field CRM, log the call as usual: belts, notes, photos.
2. On the PC, open the call in Field CRM. Click **⋯** beside **Create and
   share**, then **Save for Claude**. (Or on the phone: **Save for Claude**
   opens the share sheet; tap **OneDrive** and save it in your `_Inbox`
   folder. Claude finds it there.)
3. In Claude, type: **Do the call report** (add the customer if you did more
   than one call that day).
4. Read Claude's review list and check those points.
5. Send the customer copy to the customer, and the site walk notes to
   customer service with the quote.
6. In Field CRM, open the call, click **⋯**, then **Import call report**,
   then **OK**.
7. Log the call in Dynamics with the site walk notes attached.

## What is in this zip

| | |
|---|---|
| `SKILL.md` | The instructions Claude follows |
| `README.md` | This page |
| `DOCUMENTATION.md`, `DOCUMENTATION.html` | The full guide, twice: one for Claude, one to read |
| `scripts/` | The tools Claude runs |
| `assets/intralox-logo.png` | The logo in the documents |
| `examples/` | Finished example documents and the data behind them |
| `test-visit/` | A made-up visit, with a made-up Field CRM call and CRM export |

Everything in the test visit and the examples is made up. No customer data
is in this zip; keep it that way.
