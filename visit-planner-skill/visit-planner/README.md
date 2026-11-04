# Visit planner: start here

A Claude skill for Claude Enterprise on the PC. Tell Claude, for example,
**Book a site visit at Example Foods Smithfield next Tuesday at 10, seeing Pat
about the infeed belts**. Claude then:
- finds the customer and the people in your CRM export;
- writes a standard invite: the agenda, the follow-ups to close, who you are
  seeing, the zone, in the customer's own time zone;
- puts it in your Outlook calendar through the Outlook connection, or gives
  you a calendar file to open in Outlook.

Three standard invites to start with: **site visit**, **health check or site
walk** (with what to bring and the lines to walk), and **Teams or phone call**.
Each is a template you can change, for one meeting or for good.

Ask **Who's due a visit next week?** and it lists your accounts past their
cadence, by zone, and proposes the week around what is already in your
calendar. Nothing is booked until you say.

**Nobody is emailed unless you say so for that meeting.** A meeting is your
own appointment with the people listed in it. Say "invite them" and Claude
shows you who will get the invite and waits for your yes.

The full guide is `DOCUMENTATION.html` (open it in Edge).

## 1. Install the skill

1. Open Claude and sign in with your Intralox account.
2. Click your name at the bottom left, then **Settings**, then **Capabilities**.
3. Make sure **Code execution and file creation** is turned on.
4. Under **Skills**, click **Upload skill**, and choose `visit-planner.zip`.
5. Check that **visit-planner** shows in the list, turned on.
6. Check that the Outlook (Microsoft 365) connection is turned on for your
   chats.

## 2. Make your visits folder

1. In File Explorer, make a folder for your visits, for example
   `OneDrive\Visits`.
2. Open the Claude desktop app and give it access to that folder, and to the
   folder with your CRM export.
3. In Claude, type: **Set up the visit planner.**
4. When Claude asks, give your name as the CRM spells it, your email, where
   your CRM export is, and your home time zone. Claude saves these as
   `visit-planner settings.json` in the folder.

Your CRM export stays where it is on your PC. Nothing from it goes into the
skill.

## 3. Test it

1. Start a new chat in Claude.
2. Type: **Test the visit planner skill.**
3. Claude runs the self-test with made-up data and shows you the examples.

## 4. Use it

1. Type what you want booked, for example **Teams call with Example Snacks
   Thursday at 2 about the seasoning line quote**.
2. Check what Claude shows you: the subject, the day and time, and whether
   anyone is invited.
3. Say **yes** to put it in your calendar.

To move it, say **Move the Example Snacks call to Friday at 10**. To cancel,
say **Cancel it**. If anyone was invited, Claude asks first, because they will
be emailed.
