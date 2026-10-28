// v118: the sales coach on an opportunity. What it is sent (the Blue Sheet
// and map as text, with coverage read from the links, and the account's
// records); the coaching shown without its suggestions as text; the
// suggested red flags, strengths and actions ticked onto the sheet, never
// added unasked, never twice; kept on the opportunity and shown again without
// asking. The ai-tidy function is stubbed: this proves the app's side.
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
w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
w.navigator.storage = { persist: async () => true, persisted: async () => true };
w.URL.createObjectURL = () => 'blob:stub'; w.URL.revokeObjectURL = () => {};
if (!w.HTMLDialogElement.prototype.showModal) w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
if (!w.HTMLDialogElement.prototype.close) w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new w.Event('close')); };
w.Element.prototype.setPointerCapture = () => {};
w.HTMLCanvasElement.prototype.getContext = () => null;
w.console.error = (...a) => errs.push(a.join(' ')); w.console.warn = () => {};
for (const f of ['zones.js', 'manuals.js', 'healthlib.js', 'app.js']) {
  const el = d.createElement('script'); el.textContent = fs.readFileSync(f, 'utf8'); d.body.appendChild(el);
}
d.dispatchEvent(new w.Event('DOMContentLoaded'));
await tick(500);
const $ = id => d.getElementById(id);
const g = e => w.eval('(' + e + ')');
const toast = () => $('toast').textContent;

const sent = [];
const COACHING = 'Where this stands\n• Position +2 looks generous: the economic buyer is weakly covered.\n\nBiggest risks\n• Priya Nair is not covered.\n\nWho to see next\n• Jo to see Priya about the spec.\n\nQuestions to ask\n• [P] What does a stoppage on Line 3 cost?\n\n' +
  'Sheet changes\n• Red flag: Tom Ward only weakly covered\n• Strength: Northfield draws the layout\n• Action: Jo to meet Priya before the spec is set\n• Red flag: FY27 budget not confirmed';
w.__invoke = async (name, opts) => { sent.push({ name, body: opts && opts.body }); return { data: { text: COACHING, used: 1 }, error: null }; };

const A = 'Example Meats - Dandenong';
await g(`(async () => {
  const list = [{a: '${A}', sub: 'Dandenong', z: 'Z1', foc: 'High', cad: CAD['High'], mgr: 'Ben', rep: '', c: []}];
  await accReplaceAll(list); indexAccounts(list);
  await callsPut({id: 'c1', customer: '${A}', date: '10/10/2026', type: 'Site call', contacts: [], loose: [], entries: [{type: 'note', text: 'Tom wants the cost per year'}], closed: true, status: 'done', updated: 1});
  indexCalls(await callsAll());
  await oppsPut({id: 'o1', acct: '${A}', name: 'Line 3 upgrade', obj: '12 S800 belts by March', value: 'AUD 180k', close: '2027-03', pos: 2, posWhy: 'Sam backs us', comp: 'A cheaper acetal belt', ox: 460, oy: 60,
    people: [{id: 'a', side: 'cust', n: 'Tom Ward', title: 'Operations Manager', role: 'Signs the order', infl: 'High', mode: 'Steady', rate: 1, win: 'His uptime bonus', x: 90, y: 90},
      {id: 'b', side: 'cust', n: 'Priya Nair', title: 'Engineering Lead', role: 'Checks the spec', mode: 'Trouble', rate: -2, x: 20, y: 250},
      {id: 'd', side: 'oem', n: 'Greg Holt', org: 'Northfield Conveyors', role: 'Checks the spec', rate: 2, x: 470, y: 300},
      {id: 'e', side: 'us', n: 'Ben', title: 'Account Manager', x: 860, y: 200}],
    links: [{id: 'l1', a: 'e', b: 'a', kind: 'Our coverage', str: 'Weak'}, {id: 'l2', a: 'd', b: 'b', kind: 'Influences', str: 'Strong', note: 'draws the layout'}],
    flags: [{id: 'f1', t: 'FY27 budget not confirmed', pin: ''}], strengths: [], actions: [{id: 'x1', t: 'Run a trial belt', best: true}], updated: 1});
  OPPS = await oppsAll();
  sbClient = {functions: {invoke: (n, o) => window.__invoke(n, o)}}; sbUser = {id: 'u1'};
  openAccount('${A}'); openOpp('o1'); opSetMode('sheet');
})()`);
await tick(100);

ok(!$('opCoach').hidden, 'the Blue Sheet has a Coach button');
g(`opSetMode('map')`); await tick();
ok($('opCoach').hidden, 'the map does not');
g(`opSetMode('sheet')`); await tick();

$('opCoach').click(); await tick(300);
ok(sent.length === 1 && sent[0].name === 'ai-tidy' && sent[0].body.kind === 'opp', 'Coach asks the coach, as an opportunity');
const a = sent[0].body.a, b = sent[0].body.b;
ok(/Opportunity: Line 3 upgrade at Example Meats - Dandenong/.test(a) && /Objective: 12 S800 belts by March/.test(a) && /Our position, -5 panic to \+5 euphoria: \+2 - Sam backs us/.test(a) && /Competition: A cheaper acetal belt/.test(a), 'it is sent the objective, position and competition');
ok(/- Tom Ward \(customer, Operations Manager(, Example Meats - Dandenong)?\); part: Signs the order; influence: High; sees it as: Steady; base covered \+1; covered by: Ben \(weak\); personal win: His uptime bonus/.test(a), 'each person with their part, view, rating, coverage and win');
ok(/- Priya Nair .*covered by: nobody/.test(a) && /- Greg Holt \(OEM or integrator, Northfield Conveyors\)/.test(a) && /- Ben \(ours, Account Manager\)/.test(a), 'the uncovered, the OEM\'s and ours');
ok(/Greg Holt influences Priya Nair \(strong\): draws the layout/.test(a) && !/Ben our coverage/.test(a), 'the links, coverage already said per person');
ok(/Red flags:\n- FY27 budget not confirmed/.test(a) && /Run a trial belt \(best action\)/.test(a), 'the red flags and actions');
ok(/Tom wants the cost per year/.test(b), 'and the account\'s records');

ok($('coachdlg').hasAttribute('open') && /Where this stands/.test($('coBody').textContent) && /Who to see next/.test($('coBody').textContent), 'the coaching opens in the coach\'s sheet');
ok(!/Sheet changes/.test($('coBody').querySelector('.coach, div') ? $('coBody').textContent.split('Suggested for the Blue Sheet')[0] : ''), 'the suggestions are not shown as text');
const labels = () => [...$('coBody').querySelectorAll('.plch label')].map(l => l.textContent);
ok(labels().length === 4 && /Red flag: Tom Ward only weakly covered/.test(labels()[0]) && /Action: Jo to meet Priya/.test(labels()[2]), 'they are offered as ticks: ' + labels().join(' / '));
ok(/already on the sheet/.test(labels()[3]) && $('coBody').querySelector('[data-sch="3"]').disabled, 'one the sheet already has is greyed out');
ok($('coSheetApply').disabled, 'nothing is added until something is ticked');
const saved = (await g(`oppsAll()`))[0];
ok(saved.coaching && /Where this stands/.test(saved.coaching.text) && saved.flags.length === 1 && saved.actions.length === 1, 'the coaching is kept on the opportunity; the sheet is unchanged');

// tick two
const t0 = $('coBody').querySelector('[data-sch="0"]'), t2 = $('coBody').querySelector('[data-sch="2"]');
t0.checked = true; t0.dispatchEvent(new w.Event('change'));
t2.checked = true; t2.dispatchEvent(new w.Event('change'));
$('coSheetApply').click(); await tick(300);
const after = (await g(`oppsAll()`))[0];
ok(after.flags.map(f => f.t).join('|') === 'FY27 budget not confirmed|Tom Ward only weakly covered' && after.actions.map(x => x.t).join('|') === 'Run a trial belt|Jo to meet Priya before the spec is set' && after.strengths.length === 0, 'the ticked red flag and action are added, nothing else: ' + /2 added/.test(toast()));
ok(/added\)/.test(labels()[0]) && $('coBody').querySelector('[data-sch="0"]').disabled && !$('coBody').querySelector('[data-sch="1"]').disabled, 'they now show as added');
ok(/Tom Ward only weakly covered/.test($('opSheet').textContent) && /Jo to meet Priya/.test($('opSheet').textContent), 'and the Blue Sheet behind shows them');

// close; Coach again shows the kept coaching without asking
g(`closeDialogsNow()`); await tick();
$('opCoach').click(); await tick(200);
ok(sent.length === 1 && /Written /.test($('coSub').textContent) && /added\)/.test(labels()[0]), 'Coach again shows the kept coaching, no new request');
$('coAgain').click(); await tick(300);
ok(sent.length === 2 && /Tom Ward only weakly covered/.test(sent[1].body.a), 'Write it again sends the sheet as it is now');
ok(/already on the sheet/.test(labels()[0]), 'and what was added last time is not offered again');

// the Blue Sheet document leaves the coaching out
const doc = g(`buildBlueSheetHTML(OPP, '')`);
ok(!/Where this stands/.test(doc) && !/Who to see next/.test(doc), 'the coaching is not in the Blue Sheet document');

// signed out: said, nothing sent
g(`closeDialogsNow()`); await tick();
await g(`(async () => { sbUser = null; OPP.coaching = null; await oppSaveNow(); })()`);
$('opCoach').click(); await tick(100);
ok(sent.length === 2 && /Sign in to cloud sync first/.test(toast()), 'signed out, it says so and sends nothing');

const real = errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
