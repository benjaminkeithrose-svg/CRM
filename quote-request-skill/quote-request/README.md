# Quote request: start here

A Claude skill for Claude Enterprise on the PC. When an email comes in that
needs a request to customer service, you tell Claude, for example, **Write a
quote request for this email**. Claude then:
- reads the email and what you tell it;
- looks up the belts and sprockets in the Intralox catalogue, from the plant
  audit workbook on your PC;
- writes the request in the same layout as Field CRM's quote request.

You get:
- **the request** as a file to attach;
- **an email version** that keeps its tables when pasted into Outlook;
- **a "To confirm" list** of anything the catalogue could not confirm.

It starts with two kinds: the **belt request for quote**, and the
**sprocket and parts request for quote**. Each is a template you can change
by asking Claude, for one request or for good.

The full guide is `DOCUMENTATION.html` (open it in Edge).

## 1. Install the skill

1. Open Claude and sign in with your Intralox account.
2. Click your name at the bottom left, then **Settings**, then **Capabilities**.
3. Make sure **Code execution and file creation** is turned on.
4. Under **Skills**, click **Upload skill**, and choose `quote-request.zip`.
5. Check that **quote-request** shows in the list, turned on.

## 2. Make your quote requests folder

1. In File Explorer, make a folder for your quote requests, for example
   `OneDrive\Quote requests`.
2. Open the Claude desktop app and give it access to that folder.
3. Also give it access to the folder that holds `Plant_Audit_Template_1.xlsm`.
4. In Claude, type: **Set up the quote request skill.**
5. When Claude asks, tell it where the folder and the workbook are, and
   where your CRM export is (the one Field CRM imports), and where you keep
   the OneTrack accessory list. Claude saves these
   as `quote-request settings.json` in the folder.

The catalogue and your CRM export stay where they are on your PC. Nothing
from them goes into the skill.

## 3. Test it

1. Start a new chat in Claude.
2. Type: **Test the quote request skill.**
3. Claude runs the self-test with made-up data and shows you the examples.

## 4. Use it

1. Paste the email into Claude, or attach it (with its photos).
2. Type: **Write a quote request to customer service for this.** Say
   anything the email doesn't, such as the quantity or the width.
3. Answer Claude's questions, if it has any.
4. Read the **To confirm** list.
5. Open the email version in Edge, press **Ctrl+A**, then **Ctrl+C**.
6. In Outlook, start the email to customer service and press **Ctrl+V**.
7. Attach the request file.

To change the layout for one request, just say so: "add a delivery address",
"leave out the photos". To change it for good, say "always do that": Claude
saves your own copy of the template in your folder.
