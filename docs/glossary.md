# Glossary

| Term | Meaning |
|---|---|
| **Account** | A customer site, as named in the Dynamics export. The key for everything recorded against it |
| **Account plan** | The sales coach's plan for one account: goal, people, red flags, strengths. Store `plans` |
| **Admin** | The team member who created the team. Keeps the shared CRM export and reference data, and can delete anyone's shared record |
| **Belt reference** | Intralox's belt and sprocket options, imported from the plant audit template. Drives the belt form's pickers. Never in the repository |
| **Blue Sheet** | Miller Heiman's Strategic Selling worksheet for one opportunity. Here, an opportunity's details plus its map |
| **Bump (the version)** | Raise the version number in the three places it lives, so devices take the new build |
| **Cache** | The copy of the app the service worker keeps on the device |
| **Call** | One site visit's record: belts, projects, health checks, notes, photos, people seen. Store `calls` |
| **CIP** | The personal performance plan: periods and four pillars. Private |
| **Compiled** | A call whose document has been produced. Separate from Done |
| **CRM export** | The account and contact list exported from Dynamics and imported into the app |
| **Data key** | The random key that encrypts your records. Locked in your vault by your passphrase |
| **Dataset** | Something synced whole rather than record by record: the CRM export, belt reference, audit register, overrides, reassignments, planning weeks |
| **Done** | A finished call. "Done with nothing to report" is a normal finished state |
| **Dynamics** | Intralox's CRM (Microsoft Dynamics). The master account and contact list |
| **Edge function** | A small program that runs on Supabase's servers: `ai-tidy`, `team-admin`, `intralox-manuals` |
| **Encryption (AES-GCM)** | The scrambling applied on the device before anything leaves it |
| **GitHub Pages** | Where the app is published from the repository's `main` branch |
| **IndexedDB** | The browser's own database on each device, where all the data lives |
| **jsdom** | A simulated browser the tests run in. Not a phone |
| **kv** | The store of settings and whole datasets, one value per name |
| **Large account plan** | The plan for a customer with several sites, in Dynamics' tabs, with a map of the sites |
| **Live update** | Supabase Realtime telling an open device that something changed, so it syncs at once |
| **Main** | The branch GitHub Pages publishes. Changes reach it only by a merged pull request |
| **MBO** | Management by objectives: the year's goals and their entries. Private |
| **Migration** | A numbered file in `supabase/migrations/` that changes the cloud database |
| **Opportunity** | A sale being pursued at an account, with its map and Blue Sheet. Store `opps` |
| **Passphrase** | What unlocks your data key. Never leaves the device; cannot be recovered |
| **Pull request (PR)** | A proposed change on GitHub, read and approved before it goes live |
| **PWA** | Progressive web app: a web page installed like an app, working offline |
| **Quote request (RFQ)** | A request for a quote, kept in the calls store marked `rectype:'quote'` |
| **Record** | One item synced on its own: a call, visit, task, plan, opportunity and so on |
| **Repository (repo)** | The project's files and history on GitHub. Public |
| **RLS (row-level security)** | The cloud database's rules about who can read, write and delete each row |
| **Service worker** | The part of the app that keeps its files on the device so it opens offline |
| **Store** | One kind of record in the device database (`calls`, `opps` and so on) |
| **Supabase** | The cloud service holding the encrypted records, sign-ins and server functions |
| **Sync** | Sending this device's changes up and fetching other devices' changes down |
| **Team** | Four to ten people sharing calls, visits, plans, opportunities and reference data |
| **Tidy** | The AI tidying one text box, following any spoken instructions in it |
| **Vault** | Your row in the cloud holding your data key, locked by your passphrase |
| **Visit (appointment)** | A planned call on the calendar. Store `appts` |
