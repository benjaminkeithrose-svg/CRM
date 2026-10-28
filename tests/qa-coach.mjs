// v102: the sales coach. Prepare for a visit writes a brief from the account's
// records and keeps it on the visit; Coach me writes coaching on a call, keeps
// it on the call, never in a report, and feeds it into the next brief. The
// ai-tidy function is stubbed: this proves the app's side (what it sends, what
// it keeps, the sheet, errors), not the function or the model.
import { JSDOM } from 'jsdom';
import fs from 'fs';
import 'fake-indexeddb/auto';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  x ' + m); } };
const tick = (ms = 50) => new Promise(r => setTimeout(r, ms));
const errs = [];
const dom = new JSDOM(fs.readFileSync('index.html', 'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g, ''),
  { runScripts: 'dangerously', url: 'https://example.org/' });
const w = dom.window, d = w.document;
w.indexedDB = indexedDB; w.IDBKeyRange = IDBKeyRange; w.Blob = Blob;
w.scrollTo = () => {}; w.alert = () => {}; w.confirm = () => true;
w.matchMedia = () => ({ matches: true, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
w.navigator.storage = { persist: async () => true, persisted: async () => true };
w.URL.createObjectURL = () => 'blob:stub'; w.URL.revokeObjectURL = () => {};
if (!w.HTMLDialogElement.prototype.showModal) w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
if (!w.HTMLDialogElement.prototype.close) w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new w.Event('close')); };
w.HTMLCanvasElement.prototype.getContext = () => null;
w.console.error = (...a) => errs.push(a.join(' ')); w.console.warn = () => {};
for (const f of ['zones.js', 'manuals.js', 'healthlib.js', 'app.js']) {
  const el = d.createElement('script'); el.textContent = fs.readFileSync(f, 'utf8'); d.body.appendChild(el);
}
d.dispatchEvent(new w.Event('DOMContentLoaded'));
await tick(500);
const $ = id => d.getElementById(id);
const g = e => w.eval('(' + e + ')');
const open = id => $(id).hasAttribute('open');
const toast = () => $('toast').textContent;

// ---- the stand-in for supabase.functions.invoke
const sent = [];
let answer = null;
w.__invoke = async (name, opts) => { sent.push({ name, body: opts && opts.body }); return answer; };
const fnErr = (message) => ({ data: null, error: Object.assign(new Error('Edge Function returned a non-2xx status code'),
  { context: { json: async () => ({ error: 'x', message }) } }) });

const BRIEF = 'Where things stand\n• Line 2 belt is stretched.\n\nAim for this visit\n• Confirm the quote reached Sam.\n\nQuestions to ask\n• [S] How many hours does Line 2 run?\n\nPromised last time\n• The Line 2 quote.\n\nWatch for\n• Purchasing not yet met.';
const COACH = 'What went well\n• Sam gave a real life comparison.\n\nStill unknown\n• Who signs the order.\n\nNext steps\n• Send Tom the cost per year.\n\nAsk next time\n• [I] What does an hour of Line 2 down cost?';

// ---- the buttons
ok(g('DIALOGS').includes('coachdlg'), 'the coach sheet is registered in DIALOGS');
ok($('avPrep') && /Prepare for a visit/.test($('avPrep').textContent), 'Prepare for a visit on the account');
ok($('dPrep') && $('dPrep').hidden, 'Prepare in the visit editor, hidden for a new visit');
ok($('vCoach') && $('vCoach').textContent.trim() === 'Coach me', 'Coach me on the visit summary');

// ---- an account, an earlier call, a booked visit
const ACCT = 'Example Meats - Dandenong';
await g(`(async () => {
  const list = [{a: '${ACCT}', sub: 'Dandenong', z: 'Z1', foc: 'High', cad: CAD['High'], mgr: 'Ben', rep: '', seg: 'Meat',
    c: [{n: 'Sam Lee', r: 'Maintenance Manager', t: '', p: '', pk: '', e: []}, {n: 'Tom Ward', r: 'Purchasing', t: '', p: '', pk: '', e: []}]}];
  await accReplaceAll(list); indexAccounts(list);
  await callsPut({id: 'c1', rectype: 'call', customer: '${ACCT}', date: '12/09/2026', type: 'Site call', contacts: [0],
    entries: [{type: 'note', text: 'Line 2 belt stretched, sprockets worn'}], loose: [], closed: true, status: 'done',
    summary: 'Walked the boning room with Sam.', coaching: {text: 'Next steps\\n• Meet purchasing before the quote.', at: 1}, updated: 1});
  indexCalls(await callsAll());
  const ap = {id: 'ap1', acct: '${ACCT}', date: '2099-10-14', start: '09:00', dur: 60, type: 'Site call',
    agenda: 'Follow up Line 2 quote', contacts: [0], touchedAt: Date.now(), status: 'planned'};
  APPTS.push(ap); await saveAppt(ap);
})()`);
await tick();

// ---- signed out: a message, nothing sent
await g(`openAccount('${ACCT}')`); await tick();
$('avPrep').click(); await tick();
ok(!open('coachdlg') && /Sign in to cloud sync/.test(toast()) && !sent.length, 'signed out: a message, nothing sent: ' + toast());

g(`(() => { sbClient = {functions: {invoke: (n, o) => window.__invoke(n, o)}}; sbUser = {id: 'u1'}; })()`);

// ---- offline
Object.defineProperty(w.navigator, 'onLine', { configurable: true, get: () => false });
$('avPrep').click(); await tick();
ok(!open('coachdlg') && /signal/.test(toast()) && !sent.length, 'offline: a message, nothing sent');
Object.defineProperty(w.navigator, 'onLine', { configurable: true, get: () => true });

// ---- Prepare from the account: the next booked visit, its brief kept on it
answer = { data: { text: BRIEF, used: 1 }, error: null };
$('avPrep').click(); await tick(150);
ok(open('coachdlg') && /Brief: Example Meats/.test($('coHead').textContent), 'the sheet opens with the account name');
const b = sent[0] && sent[0].body;
ok(sent.length === 1 && sent[0].name === 'ai-tidy' && b.kind === 'brief', 'sends one brief request');
ok(/Account: Example Meats/.test(b.a) && /Sam Lee, Maintenance Manager/.test(b.a) && /Focus: High/.test(b.a), 'a: who the account is: ' + b.a);
ok(/Call on 12\/09\/2026/.test(b.b) && /Walked the boning room/.test(b.b) && /Line 2 belt stretched/.test(b.b),
  'b: the earlier call, its summary and its entries');
ok(/Coaching after that call:\nNext steps/.test(b.b), 'b: and the coaching written after it');
ok(/09:00/.test(b.visit) && /Follow up Line 2 quote/.test(b.visit) && /Seeing: Sam Lee/.test(b.visit), 'visit: when, agenda, who: ' + b.visit);
ok([...$('coBody').querySelectorAll('h3')].map(h => h.textContent).join('|') === 'Where things stand|Aim for this visit|Questions to ask|Promised last time|Watch for',
  'headings shown as headings: ' + $('coBody').innerHTML.slice(0, 120));
ok($('coBody').querySelectorAll('li').length === 5 && /\[S\] How many hours/.test($('coBody').textContent), 'bullets shown as a list');
ok(g(`APPTS.find(a => a.id === 'ap1').brief.text`) === BRIEF, 'the brief is kept on the visit');
ok(/Saved with the visit/.test($('coSub').textContent), 'and says so: ' + $('coSub').textContent);
ok(!$('coAgain').disabled, 'Write it again is ready');
const stored = await g(`apptsAll()`);
ok(stored.find(a => a.id === 'ap1').brief.text === BRIEF, 'the brief is in storage, so it syncs');

// ---- closing goes back, reopening shows the kept brief without asking again
$('coClose').click(); await tick(100);
ok(!open('coachdlg'), 'Close shuts the sheet');
$('avPrep').click(); await tick(100);
ok(open('coachdlg') && sent.length === 1 && /^Written .*, for the visit on/.test($('coSub').textContent) && $('coBody').querySelectorAll('h3').length === 5,
  'reopened: the kept brief, nothing sent');
// Write it again asks afresh and replaces it
answer = { data: { text: BRIEF.replace('stretched', 'cracked'), used: 2 }, error: null };
$('coAgain').click(); await tick(150);
ok(sent.length === 2 && sent[1].body.kind === 'brief' && g(`APPTS.find(a => a.id === 'ap1').brief.text`).includes('cracked'), 'Write it again replaces it');
$('coClose').click(); await tick(100);

// ---- from the visit editor, over the editor: closing the brief leaves the editor open
await g(`openDialog('ap1')`); await tick();
ok(!$('dPrep').hidden, 'Prepare shows on a saved visit');
$('dPrep').click(); await tick(100);
ok(open('coachdlg') && open('dlg') && sent.length === 2, 'the kept brief opens over the editor');
$('coClose').click(); await tick(150);
ok(!open('coachdlg') && open('dlg'), 'closing the brief leaves the visit editor open');

// ---- an error is shown, nothing kept
await g(`(async () => { const ap = APPTS.find(a => a.id === 'ap1'); delete ap.brief; await saveAppt(ap); })()`);
answer = fnErr('The AI is busy right now');
$('dPrep').click(); await tick(150);
ok(open('coachdlg') && /That did not work/.test($('coMsg').textContent) && !g(`APPTS.find(a => a.id === 'ap1').brief`),
  'an error: said in the sheet, nothing kept: ' + $('coMsg').textContent);
$('coClose').click(); await tick(150);
g(`closeDialogsNow()`); await tick();

// ---- Coach me on a call
await g(`(async () => {
  call = {id: 'c2', rectype: 'call', customer: '${ACCT}', date: '14/10/2026', type: 'Site call', contacts: [0],
    entries: [{type: 'note', text: 'Sam likes the quote, purchasing will push on price'}], loose: [], updated: 1};
  await saveCall(); renderVisitSummary();
})()`);
answer = { data: { text: COACH, used: 3 }, error: null };
$('vCoach').click(); await tick(150);
const cb = sent[sent.length - 1].body;
ok(cb.kind === 'coach' && /Sam likes the quote/.test(cb.a), 'sends the call as a coach request');
ok(/Call on 12\/09\/2026/.test(cb.b) && !/14\/10\/2026/.test(cb.b), 'with the account history, not the call itself');
ok(open('coachdlg') && /Coaching: Example Meats/.test($('coHead').textContent) && $('coBody').querySelectorAll('h3').length === 4, 'coaching shown');
ok(g(`call.coaching.text`) === COACH && /not in any report/.test($('coSub').textContent), 'kept on the call: ' + $('coSub').textContent);
const sc = (await g(`callsAll()`)).find(c => c.id === 'c2');
ok(sc && sc.coaching && sc.coaching.text === COACH, 'and in storage, so it syncs');
ok($('vCoach').textContent === 'Coaching', 'the button now reads Coaching');
$('coClose').click(); await tick(150);

// never in a report
const html = await g(`buildNotesHTML('full', 'html', call)`).catch(e => 'ERR ' + e.message);
ok(typeof html === 'string' && /Sam likes the quote/.test(html) && !/cost per year|What went well|Ask next time/.test(html), 'the coaching is never in the notes');

// the next brief reads it
answer = { data: { text: BRIEF, used: 4 }, error: null };
await g(`openAccount('${ACCT}')`); await tick();
$('avPrep').click(); await tick(150);
const nb = sent[sent.length - 1].body;
ok(nb.kind === 'brief' && /Call on 14\/10\/2026/.test(nb.b) && /Send Tom the cost per year/.test(nb.b), 'the next brief includes the new call and its coaching');
$('coClose').click(); await tick(150);

// nothing logged: nothing sent
const before = sent.length;
await g(`(async () => { call = {id: 'c3', rectype: 'call', customer: '${ACCT}', date: '15/10/2026', type: 'Site call', contacts: [], entries: [], loose: [], updated: 1}; renderVisitSummary(); })()`);
$('vCoach').click(); await tick();
ok(sent.length === before && !open('coachdlg') && /Log something/.test(toast()), 'an empty call: nothing sent');

// ---- Help
ok(/Prepare for a visit, and get coaching after it/.test($('s-help').textContent), 'Help has the section');
ok(/never in/i.test($('s-help').textContent.match(/Prepare for a visit, and get coaching after it[\s\S]{0,3000}/)[0]), 'Help says coaching is never in a report');

const real = errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/i.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
