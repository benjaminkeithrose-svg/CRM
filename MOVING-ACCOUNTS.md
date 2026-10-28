# Moving Field CRM to another Claude account

A checklist for moving this project from Ben's personal Claude account to his
Intralox Claude account. Written 2026-10-27.

The project does not live in Claude. It lives in two places Ben owns, and both
stay where they are:

- **GitHub** (`benjaminkeithrose-svg/CRM`) holds the app, the instructions
  Claude follows (`CLAUDE.md`, `PREFERENCES.md`), the ideas list and the docs.
- **Supabase** holds the cloud sync, and the Anthropic key behind the app's AI
  features (Tidy, the summary, Capture).

The Claude account only does the work. Moving means connecting the new account
to the same GitHub and Supabase.

## What carries over by itself

- Everything in the repository. A new session reads `CLAUDE.md` when it starts,
  so it knows the rules, the branding, how merging works and the decisions made.
- The app on the phone, its data, its web address and cloud sync. Nothing
  changes there.
- The AI features in the app. They use the key stored in Supabase, not the
  Claude account.

## What does not carry over

- The chat history. Anything that mattered is written into the repository.
- Artifacts published from the personal account.
- The Gmail connector. It belongs to the personal account.

## Before you switch

- [ ] Check with Intralox's rules that a work Claude account may connect to a
      personal GitHub repository and a personal Supabase project.
- [ ] Ask Claude in the old account whether anything is unmerged. Everything
      should be merged before you switch.

## Switching

- [ ] 1. Sign in to claude.ai with the Intralox account.
- [ ] 2. Go to claude.ai/connect-github.
- [ ] 3. Sign in with the existing GitHub account, `benjaminkeithrose-svg`.
- [ ] 4. If it asks to install the Claude GitHub App, install it on the CRM
      repository.
- [ ] 5. Go to claude.ai/customize/connectors.
- [ ] 6. Connect **Supabase** and sign in with the existing Supabase login.
      This is only needed for changes to the AI features.
- [ ] 7. Go to claude.ai/code.
- [ ] 8. Start a new session with the CRM repository selected.

## Checking it works

- [ ] 9. Ask for something small, such as a wording change.
- [ ] 10. Check that Claude opens a pull request and asks whether to merge it.
- [ ] 11. Tap **Merge it**.
- [ ] 12. Reload the app twice on the phone and check that the change is there.

## Afterwards (optional)

- [ ] Disconnect GitHub and Supabase from the personal Claude account, so only
      one account can change the project.

## Do not

- **Do not move the repository to an Intralox GitHub organisation.** The app's
  web address would change. The phone would treat the new address as a fresh
  app and start empty. Cloud sync would bring the data back, but only after
  you set it up again with your passphrase. Leaving the repository where it is
  avoids all of that.
