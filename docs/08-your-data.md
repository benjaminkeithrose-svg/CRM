# 8. Your data

A short page for anyone using Field CRM.

## Where it is kept

- **On your phone and your PC.** Everything you enter is saved on the device
  the moment you enter it, and works with no signal.
- **In the cloud, encrypted**, if you sign in to cloud sync. That is what keeps
  your phone and PC in step. It is scrambled on your device before it leaves,
  with a key only your passphrase unlocks, so the cloud provider (Supabase)
  cannot read it.
- **Nowhere else.** The app's code is public on GitHub; none of your data is
  ever in it.

## Who can see it

| What | Who sees it |
|---|---|
| Your call reports, visits, account plans, opportunities, saved notes, products, contacts you added | You, and your team if you are in one |
| Your tasks and emails, planning weeks | You only |
| Your CIP and MBOs | You only |
| The CRM export, belt reference, audit register | Your team; the admin keeps them up to date |

In a team, colleagues can read and change the shared records; only the
person who wrote a record, or the admin, can delete it.

## AI

AI only runs when you tap for it (Tidy, Draft it, Write summary, Prepare,
Coach me, reading a spec sheet photo, setting up an opportunity from a
description). What you tapped on is sent to Claude, the answer comes back,
and nothing is kept: not by the app's server, not by Claude. You always see
the answer before anything changes. Each person has 200 a day.

The microphone uses your phone's own speech recognition (Google's, on
Android), which needs signal.

## Keeping it safe

1. Keep your phone locked. The data on it is protected by the phone's own
   lock.
2. Keep your cloud sync passphrase in a password manager. It cannot be
   recovered; without it the cloud copy cannot be read.
3. Make a backup now and then: tap **⋯** on Home, then **Settings**, then
   **Backup and restore**, then **Back up**. Keep the file somewhere other
   than the phone. Cloud sync is not a backup: a delete reaches every device.
4. Never put an export, a backup or a Dynamics file anywhere public.

## Getting it back

On a new or wiped phone, install the app, sign in to cloud sync and enter
your passphrase. Your records come back. To undo a mistake, restore from a
backup file: it adds back what is missing and never deletes anything.

Leaving the team: the admin removes your sign-in. What you wrote stays with
the team.
