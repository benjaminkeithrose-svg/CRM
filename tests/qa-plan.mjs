// v106: the sales coach, second round. The account plan (a card on the
// account, a form behind it, synced as its own record); coaching that suggests
// plan changes to tick and adds Task buttons to its next steps; Prepare
// tomorrow; and the brief's questions ticked off in the call. The ai-tidy
// function is stubbed: this proves the app's side, not the model.
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
const st = () => ({ dialog: w.history.state && w.history.state.dialog, open: g('DIALOGS').filter(id => $(id).hasAttribute('open')).join(',') });
const back = async (ms = 150) => { w.history.back(); await tick(ms); };
const tap = el => { el.click(); };
const chip = (row, label) => [...row.querySelectorAll('button')].find(b => b.textContent === label).click();
const input = (el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };

const ACCT = 'Example Meats - Dandenong';
const TOMORROW = g(`iso(addDays(parseIso(todayISOdate()), 1))`);
await g(`(async () => {
  const list = [{a: '${ACCT}', sub: 'Dandenong', z: 'Z1', foc: 'High', cad: CAD['High'], mgr: 'Ben', rep: '', seg: 'Meat',
    c: [{n: 'Sam Lee', r: 'Maintenance Manager', t: '', p: '', pk: '', e: []}, {n: 'Tom Ward', r: 'Purchasing', t: '', p: '', pk: '', e: []}]},
    {a: 'Other Foods', sub: 'X', z: 'Z1', foc: 'High', cad: CAD['High'], mgr: 'Ben', rep: '', c: []}];
  await accReplaceAll(list); indexAccounts(list);
  closeDialogsNow(); go('home');
})()`);
await tick();

// ---- storage and sync
ok(g('DB_VER') === 6 && (await g(`ready().then(d => [...d.objectStoreNames].includes('plans'))`)), 'database v6 has a plans store');
ok(g('CLOUD_REC_STORES').includes('plans'), 'plans sync through the cloud as record stores');
ok(g('DIALOGS').includes('plandlg'), 'the plan form is registered in DIALOGS');

// ---- the card, empty
await g(`openAccount('${ACCT}')`); await tick();
ok(/Account plan/.test($('avPlan').textContent) && /None yet/.test($('avPlan').textContent), 'the account shows a plan card: ' + $('avPlan').textContent);
ok($('avPlan').compareDocumentPosition($('avPrep')) & w.Node.DOCUMENT_POSITION_FOLLOWING, 'the card sits above Prepare for a visit');

// ---- opened and closed with nothing entered: nothing kept
tap($('avPlan')); await tick();
ok(st().open === 'plandlg' && st().dialog === 'plandlg', 'tapping the card opens the plan, with its own history entry');
ok($('plSub').textContent === ACCT && $('plDel').hidden, 'a new plan: the account named, no bin');
ok([...$('plNames').querySelectorAll('option')].map(o => o.value).join('|') === 'Sam Lee|Tom Ward', 'names offered from the account contacts');
$('plOk').click(); await tick(150);
ok(st().open === '' && !g('PLANS').length, 'Done on an empty plan keeps nothing');

// ---- filled in
tap($('avPlan')); await tick();
input($('plGoal'), 'Replace the Line 2 belt before the December shutdown');
$('plAdd').click(); await tick();
let rows = $('plPeople').querySelectorAll('.plp');
ok(rows.length === 1, 'Add a person adds a row');
input(rows[0].querySelector('.plname'), 'Sam Lee');
chip(rows[0].querySelector('.plrole'), 'Uses it');
chip(rows[0].querySelector('.plmode'), 'Trouble');
input(rows[0].querySelector('.plnote'), 'wants it fixed before Christmas');
$('plAdd').click(); await tick();
rows = $('plPeople').querySelectorAll('.plp');
ok(rows.length === 2 && rows[0].querySelector('.plname').value === 'Sam Lee' && rows[0].querySelector('.plrole .on').textContent === 'Uses it',
  'adding a second row keeps the first');
input(rows[1].querySelector('.plname'), 'Priya Shah');
chip(rows[1].querySelector('.plrole'), 'Signs the order');
$('plAdd').click(); await tick();     // a third, left blank
input($('plFlags'), 'Purchasing not met');
$('plOk').click(); await tick(150);
let plan = g(`planFor('${ACCT}')`);
ok(plan && plan.goal === 'Replace the Line 2 belt before the December shutdown' && plan.people.length === 2, 'saved: goal and two people (the blank row dropped): ' + JSON.stringify(plan && plan.people));
ok(plan.people[0].role === 'Uses it' && plan.people[0].mode === 'Trouble' && plan.people[0].note === 'wants it fixed before Christmas', 'role, view and note kept');
ok(plan.updated && plan.acct === ACCT, 'stamped and tied to the account');
ok((await g(`plansAll()`)).some(p => p.id === plan.id), 'and in storage, so it syncs');
ok(/December shutdown/.test($('avPlan').textContent) && /Sam Lee \(Uses it\)/.test($('avPlan').textContent) && /Priya Shah \(Signs the order\)/.test($('avPlan').textContent),
  'the card shows the goal and who is who: ' + $('avPlan').textContent);
const backup = await g(`buildBackup(false)`);
ok(backup.plans && backup.plans.some(p => p.id === plan.id), 'backups carry the plans');

// ---- reopened, changed, closed with back: saved
tap($('avPlan')); await tick();
ok(!$('plDel').hidden && $('plPeople').querySelectorAll('.plp').length === 2, 'reopened: the bin shows, the people are there');
input($('plStrengths'), 'Our belt lasted 3 years');
await back();
ok(st().open === '' && g(`planFor('${ACCT}').strengths`) === 'Our belt lasted 3 years', 'back counts as Done');

// remove a person (confirm names them)
let asked = '';
w.confirm = m => { asked = m; return true; };
tap($('avPlan')); await tick();
$('plPeople').querySelectorAll('.plx')[1].click(); await tick();
ok(/Remove Priya Shah/.test(asked) && $('plPeople').querySelectorAll('.plp').length === 1, 'removing a person asks, naming them');
$('plOk').click(); await tick(150);
ok(g(`planFor('${ACCT}').people.length`) === 1, 'and the plan keeps the one left');

// ---- the brief reads the plan
g(`(() => { sbClient = {functions: {invoke: (n, o) => window.__invoke(n, o)}}; sbUser = {id: 'u1'}; })()`);
answer = { data: { text: BRIEF, used: 1 }, error: null };
$('avPrep').click(); await tick(150);
let b = sent[sent.length - 1].body;
ok(b.kind === 'brief' && /^Account plan, kept by the engineer:/.test(b.b) && /Goal: Replace the Line 2 belt/.test(b.b) &&
  /Person: Sam Lee - Uses it, sees it as Trouble, wants it fixed/.test(b.b) && /Red flags: Purchasing not met/.test(b.b), 'the brief gets the plan first: ' + b.b.slice(0, 200));
$('coClose').click(); await tick(150);

// ---- the brief's questions, in the call
const QBRIEF = 'Where things stand\n• x\n\nQuestions to ask\n• [S] How many hours does Line 2 run?\n• [P] What has the worn belt done to line stops?\n• [I] What does a stop cost?\n\nWatch for\n• y';
await g(`(async () => {
  const ap = {id: 'ap1', acct: '${ACCT}', date: todayISOdate(), start: '09:00', dur: 60, type: 'Site call', agenda: '', contacts: [0],
    touchedAt: Date.now(), status: 'planned', brief: {text: ${JSON.stringify(QBRIEF)}, at: 1}};
  APPTS.push(ap); await saveAppt(ap);
  await startVisit('ap1');
})()`);
await tick(200);
ok(g('screen') === 'dash' && g(`APPTS.find(a => a.id === 'ap1').callId`) === g('call.id'), 'started the call from the visit');
ok(!$('dashQs').hidden && $('qsList').querySelectorAll('input').length === 3 && $('qsCount').textContent === '0 of 3 asked',
  'the call shows the brief\'s three questions, folded: ' + $('qsCount').textContent);
ok(!$('dashQs').open, 'folded until tapped');
const qbox = $('qsList').querySelectorAll('input')[1];
qbox.checked = true; qbox.dispatchEvent(new w.Event('change', { bubbles: true })); await tick(100);
ok(g('call.asked').length === 1 && /line stops/.test(g('call.asked[0]')) && $('qsCount').textContent === '1 of 3 asked', 'ticking one marks it asked on the call');
ok((await g(`callsAll()`)).find(c => c.id === g('call.id')).asked.length === 1, 'and it is saved');
const notes = await g(`buildNotesHTML('full', 'html', call)`);
ok(!/How many hours|line stops/.test(notes), 'the questions are never in the notes');

// ---- coaching: plan changes, Task buttons
await g(`(async () => { call.entries.push({type: 'note', topic: 'Other', text: 'Sam likes the quote; Tom in purchasing will push on price'}); await saveCall(); renderVisitSummary(); })()`);
const COACH6 = COACH + '\n\nPlan changes\n• Goal: Win the Line 2 order\n• Person: Tom Ward | Signs the order | Overconfident | pushes on price\n• Person: Sam Lee | Checks the spec | Growth | -\n• Red flag: Copy belt is cheaper\n• Strength: Purchasing not met\n• Next steps for you';
answer = { data: { text: COACH6, used: 2 }, error: null };
$('vCoach').click(); await tick(200);
const cb = sent[sent.length - 1].body;
ok(cb.kind === 'coach' && /Questions from the brief that were asked: \[P\] What has the worn belt done to line stops\?/.test(cb.a) &&
  /not asked: \[S\] How many hours does Line 2 run\?; \[I\] What does a stop cost\?/.test(cb.a), 'Coach me is told which questions were asked');
ok(/^Account plan, kept by the engineer:/.test(cb.b), 'and gets the plan');
const heads = [...$('coBody').querySelectorAll('h3')].map(h => h.textContent);
ok(heads.join('|') === 'What went well|Still unknown|Next steps|Ask next time|Suggested plan changes', 'coaching headings, then the suggestions: ' + heads.join('|'));
const tasks = $('coBody').querySelectorAll('.mktask');
ok(tasks.length === 1 && tasks[0].closest('li').firstChild.textContent === 'Send Tom the cost per year.', 'a Task button on each next step, nowhere else');
const labels = [...$('coBody').querySelectorAll('.plch label')].map(l => l.textContent);
ok(labels.length === 5, 'five suggestions read (the junk line ignored): ' + labels.join(' / '));
ok(/Goal: Win the Line 2 order \(your plan has a goal already/.test(labels[0]) && $('coBody').querySelector('[data-ch="0"]').disabled, 'a goal never replaces yours');
ok(/^Tom Ward: Signs the order, sees it as Overconfident, pushes on price$/.test(labels[1]) && !$('coBody').querySelector('[data-ch="1"]').disabled, 'a new person can be ticked');
ok(/already in the plan/.test(labels[2]) && $('coBody').querySelector('[data-ch="2"]').disabled, 'Sam Lee already has a role, view and note: nothing to add');
ok(/already in the plan/.test(labels[4]) === false && /Strength: Purchasing not met/.test(labels[4]), 'a strength not in the strengths can be ticked');
ok($('coApply').disabled, 'Add ticked is off until something is ticked');

// a task from a next step, over the coaching; back closes only the task
tasks[0].click(); await tick();
ok(st().open.includes('taskdlg') && st().open.includes('coachdlg') && $('tkTitle').value === 'Send Tom the cost per year.' &&
  $('tkAcct').value === ACCT && g('taskEdit.callId') === g('call.id'), 'Task opens the task form filled in, over the coaching');
await back();
ok(st().open === 'coachdlg', 'back closes the task form and leaves the coaching: ' + JSON.stringify(st()));
ok(g(`TASKS.some(t => t.title === 'Send Tom the cost per year.' && t.callId === call.id)`), 'and the task is kept (back counts as Done)');

// tick two, add them
for (const i of [1, 3]) { const x = $('coBody').querySelector('[data-ch="' + i + '"]'); x.checked = true; x.dispatchEvent(new w.Event('change', { bubbles: true })); }
ok(!$('coApply').disabled, 'Add ticked is on');
$('coApply').click(); await tick(150);
plan = g(`planFor('${ACCT}')`);
ok(plan.people.length === 2 && plan.people[1].n === 'Tom Ward' && plan.people[1].role === 'Signs the order' && plan.people[1].mode === 'Overconfident', 'Tom Ward added to the plan');
ok(plan.flags === 'Purchasing not met\nCopy belt is cheaper' && plan.goal === 'Replace the Line 2 belt before the December shutdown', 'the red flag added on its own line; the goal untouched');
ok(!/Purchasing not met/.test(plan.strengths), 'unticked suggestions left alone');
ok(JSON.stringify(g('call.coaching.applied')) === '[1,3]', 'the call remembers what was added');
const after = [...$('coBody').querySelectorAll('.plch label')].map(l => l.textContent);
ok(/\(added\)/.test(after[1]) && /\(added\)/.test(after[3]) && $('coBody').querySelector('[data-ch="1"]').disabled, 'and shows them as added');
$('coClose').click(); await tick(150);
// reopened from the call: same state, nothing sent
const n0 = sent.length;
$('vCoach').click(); await tick(150);
ok(sent.length === n0 && /\(added\)/.test($('coBody').querySelector('.plch').textContent), 'reopened: kept coaching, additions still marked');
$('coClose').click(); await tick(150);
// the next brief reads the coaching without its suggestions
answer = { data: { text: BRIEF, used: 3 }, error: null };
await g(`openAccount('${ACCT}')`); await tick();
$('avPrep').click(); await tick(150);       // today's visit already has a brief: it shows, so write it again
$('coAgain').click(); await tick(150);
b = sent[sent.length - 1].body;
ok(/Coaching after that call:\nWhat went well/.test(b.b) && !/Plan changes/.test(b.b) && /Person: Tom Ward - Signs the order/.test(b.b), 'the next brief: coaching without the suggestions, and the updated plan: ' + JSON.stringify(b.b.slice(0, 900)));
$('coClose').click(); await tick(150);

// ---- Prepare tomorrow
await g(`(async () => {
  for(const ap of [{id: 'ap2', acct: '${ACCT}', date: '${TOMORROW}', start: '13:00'}, {id: 'ap3', acct: 'Other Foods', date: '${TOMORROW}', start: '08:00'},
      {id: 'ap4', acct: 'Other Foods', date: '${TOMORROW}', start: '15:00', status: 'cancelled'}]){
    const x = Object.assign({dur: 60, type: 'Site call', agenda: '', contacts: [], touchedAt: Date.now(), status: 'planned'}, ap);
    if(x.id === 'ap2') x.brief = {text: 'Where things stand\\n• already', at: 1};
    APPTS.push(x); await saveAppt(x);
  }
  closeDialogsNow(); go('today');
})()`);
await tick();
g(`(() => { todayView = 'week'; renderToday(); })()`);
ok($('tvPrepTom').hidden, 'Prepare tomorrow hides on the Week view');
d.querySelector('#tvView [data-v="today"]').click(); await tick();
ok(!$('tvPrepTom').hidden, 'and shows on the Day view');
const n1 = sent.length;
answer = { data: { text: 'Where things stand\n• new brief', used: 4 }, error: null };
$('tvPrepTom').click(); await tick(300);
ok(sent.length === n1 + 1 && /Other Foods/.test(sent[sent.length - 1].body.a), 'one brief written: the visit without one; the cancelled one skipped');
ok(g(`APPTS.find(a => a.id === 'ap3').brief.text`) === 'Where things stand\n• new brief' && g(`APPTS.find(a => a.id === 'ap2').brief.text`) === 'Where things stand\n• already',
  'saved on its visit; the one that had a brief kept it');
const rowsT = [...$('coBody').querySelectorAll('.prow')].map(r => r.textContent);
ok(rowsT.length === 2 && /08:00 Other Foods/.test(rowsT[0]) && /Written/.test(rowsT[0]) && /Already has a brief/.test(rowsT[1]), 'the sheet lists them in time order with what happened: ' + rowsT.join(' / '));
ok(/1 written/.test($('coSub').textContent), 'and sums up: ' + $('coSub').textContent);
$('coBody').querySelector('.prow').click(); await tick();
ok(/Brief: Other Foods/.test($('coHead').textContent) && /new brief/.test($('coBody').textContent), 'tapping a visit opens its brief');
$('coClose').click(); await tick(150);
// the PC planner: on its Day view only
g(`(() => { plan.view = 'week'; renderCalendar(); })()`);
ok($('calPrepTom').hidden, 'planner: hidden on Week');
g(`(() => { plan.view = 'day'; renderCalendar(); })()`);
ok(!$('calPrepTom').hidden, 'planner: shown on Day');
// nothing tomorrow
await g(`(async () => { for(const id of ['ap2','ap3']){ const a = APPTS.find(x => x.id === id); a.date = '2099-01-01'; await saveAppt(a); } })()`);
const n2 = sent.length;
$('tvPrepTom').click(); await tick();
ok(sent.length === n2 && /No visits booked tomorrow/.test(toast()), 'no visits tomorrow: says so, sends nothing');

// ---- delete the plan
await g(`openAccount('${ACCT}')`); await tick();
tap($('avPlan')); await tick();
asked = '';
$('plDel').click(); await tick(150);
ok(/Delete the account plan for Example Meats/.test(asked) && /2 people/.test(asked) && /cannot be undone/.test(asked), 'delete asks, naming what goes: ' + asked.split('\n')[0]);
ok(st().open === '' && !g(`planFor('${ACCT}')`) && /None yet/.test($('avPlan').textContent), 'and the plan is gone');

const real = errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/i.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
