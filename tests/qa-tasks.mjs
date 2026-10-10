// Tasks (v74): the database upgrade keeps existing data; the form follows the
// Done rule; a new task lands on today at the next half hour for 30 minutes;
// account, contact and the email/mobile fill; the calendar shows it; tick done;
// a task from inside a call is linked to it; delete; backup carries tasks.
import { JSDOM } from 'jsdom';
import fs from 'fs';
import 'fake-indexeddb/auto';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  x ' + m); } };
const tick = (ms = 50) => new Promise(r => setTimeout(r, ms));

// ---- an existing v3 database, as on Ben's phone before this update
await new Promise((res, rej) => {
  const r = indexedDB.open('fieldcrm', 3);
  r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('kv'); d.createObjectStore('calls', {keyPath: 'id'});
    d.createObjectStore('accounts', {keyPath: 'a'}); d.createObjectStore('appts', {keyPath: 'id'}); };
  r.onsuccess = () => {
    const d = r.result, tx = d.transaction(['calls', 'appts'], 'readwrite');
    tx.objectStore('calls').put({id: 'c-old', customer: 'Old Co', date: '01/09/2026', contacts: [], entries: [], loose: [], updated: 1});
    tx.objectStore('appts').put({id: 'ap-old', acct: 'Old Co', date: '2026-09-01', start: '09:00', dur: 25, type: 'Intralox site visit', touchedAt: 1});
    tx.oncomplete = () => { d.close(); res(); }; tx.onerror = () => rej(tx.error);
  };
  r.onerror = () => rej(r.error);
});

const errs = [], toasts = [];
const dom = new JSDOM(fs.readFileSync('index.html', 'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g, ''),
  { runScripts: 'dangerously', url: 'https://example.org/' });
const w = dom.window, d = w.document;
w.indexedDB = indexedDB; w.IDBKeyRange = IDBKeyRange;
w.scrollTo = () => {}; w.alert = () => {}; w.confirm = () => true;
w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
w.navigator.storage = { persist: async () => true, persisted: async () => true };
w.URL.createObjectURL = () => 'blob:stub'; w.URL.revokeObjectURL = () => {};
if (!w.HTMLDialogElement.prototype.showModal) w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
if (!w.HTMLDialogElement.prototype.close) w.HTMLDialogElement.prototype.close = function () {
  if (!this.hasAttribute('open')) return; this.removeAttribute('open'); this.dispatchEvent(new w.Event('close')); };
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
const dlgOpen = () => $('taskdlg').hasAttribute('open');

// ---- the upgrade
const stores = await g(`ready().then(d => [...d.objectStoreNames])`);
ok(stores.includes('tasks'), 'database upgraded with a tasks store: ' + stores.join(','));
ok((await g('recordsAll()')).some(c => c.id === 'c-old') && g('APPTS').some(a => a.id === 'ap-old'), 'existing calls and appointments kept through the upgrade');

// ---- an account to pick
await g(`(async () => {
  const list = [{a: 'Acme Pty Ltd - Smithfield', sub: 'Smithfield', z: 'Z1', foc: 'High', cad: CAD['High'], mgr: 'Ben', rep: '', c: [
    {n: 'Jo Bloggs', r: 'Engineer', t: 'Maintenance Engineer', p: '0400 111 222', pk: 'ok', e: ['jo@acme.example']},
    {n: 'Sam Smith', r: 'Manager', t: 'Plant Manager', p: '0400 333 444', pk: 'ok', e: ['sam@acme.example']}]}];
  await accReplaceAll(list); indexAccounts(list);
})()`);

// ---- Home → Task: opens on today, next half hour, 30 minutes
// Task lives under New (v77): New -> "What would you like to do?" -> Task
ok(!d.querySelector('#s-home [data-go="newtask"]'), 'no separate Task tile on Home');
const tile = { click(){ d.querySelector('[data-go="newcall"]').click(); d.querySelector('#newPick [data-new="task"]').click(); } };
tile.click(); await tick();
ok(dlgOpen(), 'task form opens');
const now = new Date(), mins = now.getHours() * 60 + now.getMinutes();
const expect = Math.min(Math.ceil((mins + 1) / 30) * 30, 23 * 60 + 30);
const hh = n => String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
ok($('tkDate').value === g('todayISOdate()'), 'date is today: ' + $('tkDate').value);
ok($('tkTime').value === hh(expect), 'start is the next half hour: ' + $('tkTime').value + ' expected ' + hh(expect));
ok($('tkType').querySelectorAll('button').length === 8, 'eight task types as chips');
ok($('tkDel').hidden, 'no delete on a task not yet saved');
ok(!/Save/.test($('taskdlg').textContent.replace(/Saved?/g, m => m)) || !$('taskdlg').querySelector('button#tkSave'), 'no Save button');

// the placement rule at the edges of the day
ok(g(`nextHalfHour(new Date('2026-10-09T21:12'))`) === '21:30', 'added at 9:12pm: 9:30pm - no boundaries');
ok(g(`nextHalfHour(new Date('2026-10-09T05:40'))`) === '06:00', 'added at 5:40am: 6:00am');
ok(g(`nextHalfHour(new Date('2026-10-09T10:12'))`) === '10:30', 'added at 10:12am: 10:30am');
ok(/Completed/.test($('tkDone').closest('label').textContent), 'the tick box says Completed, not Done');

// nothing entered: Done discards
$('tkOk').click(); await tick(150);
ok(!dlgOpen() && g('TASKS.length') === 0 && (await g('tasksAll()')).length === 0, 'nothing entered: no empty task left behind');

// a real task
tile.click(); await tick();
$('tkType').querySelector('[data-v="Write email"]').click();
$('tkTitle').value = 'Send belt survey summary';
$('tkAcct').value = 'Acme Pty Ltd - Smithfield'; $('tkAcct').dispatchEvent(new w.Event('change'));
ok($('tkContact').options.length === 3, 'contact list filled from the account');
$('tkContact').value = 'Jo Bloggs'; $('tkContact').dispatchEvent(new w.Event('change'));
ok($('tkEmail').value === 'jo@acme.example' && $('tkMobile').value === '0400 111 222', 'email and mobile filled from the contact');
$('tkEmail').value = 'jo.bloggs@acme.example';                     // typed over
$('tkContact').value = 'Sam Smith'; $('tkContact').dispatchEvent(new w.Event('change'));
ok($('tkEmail').value === 'jo.bloggs@acme.example' && $('tkMobile').value === '0400 333 444', 'a typed email is not overwritten; the untouched mobile follows the contact');
$('tkProject').value = 'Line 3 upgrade'; $('tkRevenue').value = '12000'; $('tkNotes').value = 'Include photos';
$('tkOk').click(); await tick(200);
let T = g('TASKS[0]');
ok(g('TASKS.length') === 1 && T.title === 'Send belt survey summary' && T.type === 'Write email' && T.contact === 'Sam Smith', 'task saved with its fields');
ok(T.dur === 30 && T.start === hh(expect) && T.date === g('todayISOdate()'), 'on today at the next half hour for 30 minutes');
ok(/Task on the calendar/.test(toast()), 'says where it went: ' + toast());
ok((await g('tasksAll()')).length === 1, 'stored on the device');

// type chip: tap again to deselect
g(`openTask(TASKS[0].id)`); await tick();
const chip = $('tkType').querySelector('button.on');
chip.click();
ok(!$('tkType').querySelector('button.on'), 'tapping the chosen type again clears it');
$('tkType').querySelector('[data-v="Write email"]').click();     // and back to how it was
const upd = g('TASKS[0].updated');
await tick(20);
$('tkOk').click(); await tick(150);
ok(g('TASKS[0].updated') === upd, 'opened and closed without a change: not re-saved');

// Escape (or the back gesture) keeps what was typed
g(`openTask(TASKS[0].id)`); await tick();
$('tkNotes').value = 'Include photos and the survey PDF';
$('taskdlg').dispatchEvent(new w.Event('cancel', { cancelable: true })); await tick(150);
ok(g('TASKS[0].notes') === 'Include photos and the survey PDF' && !dlgOpen(), 'Escape counts as Done: the edit is kept');
g(`openTask(TASKS[0].id)`); await tick();
$('tkNotes').value = 'closed by the back gesture';
$('taskdlg').close(); await tick(150);
ok(g('TASKS[0].notes') === 'closed by the back gesture', 'closed any other way: the edit is kept');

// half filled with no title: kept as a draft, and says so
tile.click(); await tick();
$('tkNotes').value = 'ring about the quote';
$('tkOk').click(); await tick(150);
ok(g('TASKS.length') === 2 && /draft/.test(toast()), 'no title: kept as a draft and says so: ' + toast());

// ---- calendar
const id1 = g('TASKS.find(t => t.title).id');
g(`(() => { showScreen('plan'); plan.view = 'week'; plan.anchor = startOfWeek(new Date()); renderPlan(); })()`);
await tick();
const wd = new Date().getDay();
if (wd >= 1 && wd <= 5) {
  const card = [...d.querySelectorAll('#calBody .appt.task')].find(e => /Send belt survey summary/.test(e.textContent));
  ok(!!card, 'task shown in the week view');
  ok(card && card.style.height === (30 * 0.8) + 'px', 'drawn 30 minutes tall: ' + (card && card.style.height));
  ok([...d.querySelectorAll('#calBody .add')].some(b => b.textContent === '+ Task'), 'each day has + Task');
  card.querySelector('.tick').click(); await tick(150);
  ok(g(`TASKS.find(t => t.id === '${id1}').done`) === true && g(`!!TASKS.find(t => t.id === '${id1}').doneAt`), 'tick marks it done');
  const again = [...d.querySelectorAll('#calBody .appt.task')].find(e => /Send belt survey summary/.test(e.textContent));
  ok(again && again.classList.contains('done'), 'shown as done');
  again.querySelector('.tick').click(); await tick(150);
  ok(g(`TASKS.find(t => t.id === '${id1}').done`) === false, 'tick again: not done');
  g(`(() => { plan.view = 'month'; renderPlan(); })()`); await tick();
  ok([...d.querySelectorAll('#calBody .pill.task')].some(e => /Send belt survey summary/.test(e.textContent)), 'task shown in the month view');
} else {
  console.log('  (weekend: the Mon-Fri calendar has no today column, calendar checks skipped)');
}
// the desktop grid stretches to show a task outside 7am-5pm
await g(`(async () => { const t = {id: 'tlate', type: '', title: 'Late task', date: '2026-10-08', start: '21:30', dur: 30, acct: '', contact: '', email: '', mobile: '',
  project: '', revenue: '', notes: '', done: false, doneAt: null, callId: null, updated: Date.now()}; await tasksPut(t); TASKS.push(t);
  plan.view = 'day'; plan.anchor = new Date('2026-10-08T12:00'); renderPlan(); })()`);
await tick();
const late = [...d.querySelectorAll('#calBody .appt.task')].find(e => /Late task/.test(e.textContent));
const body = d.querySelector('#calBody .dbody.hours');
ok(late && body && parseFloat(late.style.top) + 24 <= parseFloat(body.style.height), 'a 9:30pm task fits inside the day, which now runs to ' + g('DAY_TO') + ':00');
ok([...d.querySelectorAll('#calBody .gh')].some(e => e.textContent === '9pm'), 'the hour labels run to 9pm');

// the phone's Day and Week lists (Plan on a phone opens these, not the grid)
g(`(() => { showScreen('today'); tvCursor = '2026-10-08'; todayView = 'today'; renderToday(); })()`); await tick();
ok(/Late task/.test($('tvBody').textContent) && /task/.test($('tvHint').textContent), 'phone Day list shows the task: ' + $('tvHint').textContent);
const tc = [...$('tvBody').querySelectorAll('.vis.task')].find(e => /Late task/.test(e.textContent));
tc.querySelector('[data-ttick]').click(); await tick(150);
ok(g(`TASKS.find(t => t.id === 'tlate').done`) === true, 'phone: tick marks it completed');
ok([...$('tvBody').querySelectorAll('.vis.task.done')].some(e => /Late task/.test(e.textContent)), 'phone: shown as completed');
[...$('tvBody').querySelectorAll('.vis.task')].find(e => /Late task/.test(e.textContent)).querySelector('[data-topen]').click(); await tick();
ok(dlgOpen() && $('tkTitle').value === 'Late task', 'phone: tapping it opens the task');
$('tkOk').click(); await tick(100);
g(`(() => { todayView = 'week'; renderToday(); })()`); await tick();
ok(/Late task/.test($('tvBody').textContent), 'phone Week list shows the task');
await g(`(async () => { const t = {id: 'tsat', title: 'Saturday task', date: '2026-10-10', start: '09:00', dur: 30, done: false, updated: Date.now()}; await tasksPut(t); TASKS.push(t); renderToday(); })()`);
await tick();
ok(/Saturday/.test($('tvBody').textContent) && /Saturday task/.test($('tvBody').textContent), 'a weekend day shows when something is on it');

// the phone's Month grid: counts per day, tap a day to open its list
ok([...$('tvView').querySelectorAll('button')].map(b => b.textContent).join() === 'Day,Week,Month', 'phone views are Day, Week and Month');
$('tvView').querySelector('[data-v="month"]').click(); await tick();
ok(g('todayView') === 'month' && $('tvView').querySelector('[data-v="month"]').classList.contains('on'), 'Month is selected');
ok($('title').textContent === 'October 2026', 'title is the month: ' + $('title').textContent);
const cells = $('tvBody').querySelectorAll('.pm-cell[data-mday]');
ok(cells.length === 31, 'October has 31 day cells: ' + cells.length);
ok($('tvBody').querySelectorAll('.pm-cell.pad').length === 3, 'October 2026 starts on a Thursday, so three blank cells');
const c8 = $('tvBody').querySelector('[data-mday="2026-10-08"]');
ok(c8 && c8.querySelector('.pm-t') && c8.querySelector('.pm-t').textContent === '1', 'the 8th shows one task');
ok(/task/.test($('tvHint').textContent) && /October/.test($('tvHint').textContent), 'hint counts the month: ' + $('tvHint').textContent);
$('tvNext').click(); await tick();
ok($('title').textContent === 'November 2026' && $('tvBody').querySelectorAll('.pm-cell[data-mday]').length === 30, 'next goes to November');
$('tvPrev').click(); $('tvPrev').click(); await tick();
ok($('title').textContent === 'September 2026', 'previous goes back a month at a time');
$('tvNext').click(); await tick();
$('tvBody').querySelector('[data-mday="2026-10-08"]').click(); await tick();
ok(g('todayView') === 'today' && g('tvCursor') === '2026-10-08' && $('tvView').querySelector('[data-v="today"]').classList.contains('on'), 'tapping a day opens that day');
ok(/Late task/.test($('tvBody').textContent), 'and its list shows the task');
g(`(() => { todayView = 'week'; tvCursor = '2026-10-08'; })()`);

// + Task on a given day
g(`openTask(null, {date: '2026-10-14'})`); await tick();
ok($('tkDate').value === '2026-10-14', '+ Task on a day starts on that day');
$('tkTitle').value = 'Book travel to Perth'; $('tkOk').click(); await tick(150);
g(`(() => { plan.view = 'week'; plan.anchor = startOfWeek(new Date('2026-10-14T12:00')); renderPlan(); })()`); await tick();
ok([...d.querySelectorAll('#calBody .appt.task')].some(e => /Book travel to Perth/.test(e.textContent)), 'shown on that day');
[...d.querySelectorAll('#calBody .appt.task')].find(e => /Book travel to Perth/.test(e.textContent)).click(); await tick();
ok(dlgOpen() && $('tkTitle').value === 'Book travel to Perth', 'tapping it opens it');
$('tkOk').click(); await tick(100);

// ---- from inside a call
await g(`(async () => { call = {id: 'c-now', customer: 'Acme Pty Ltd - Smithfield', date: '09/10/2026', type: 'Site call', mgr: 'Ben', site: '',
  contacts: [{name: 'Jo Bloggs', crm: true, email: 'jo@acme.example', mobile: '0400 111 222'}], entries: [], loose: [], status: 'open', closed: false, updated: Date.now()};
  await saveCall(); showScreen('dash'); })()`);
await tick();
d.querySelector('#s-dash [data-go="calltask"]').click(); await tick();
ok(dlgOpen() && $('tkAcct').value === 'Acme Pty Ltd - Smithfield' && $('tkContact').value === 'Jo Bloggs', 'task from a call starts with its account and first contact');
ok(!$('tkFrom').hidden && /Raised in the call/.test($('tkFrom').textContent), 'says which call it came from');
$('tkTitle').value = 'Update contact details in Dynamics'; $('tkOk').click(); await tick(150);
ok(g(`TASKS.find(t => t.title === 'Update contact details in Dynamics').callId`) === 'c-now', 'linked to the call');
ok(!$('dashTasksHead').hidden && /Update contact details in Dynamics/.test($('dashTasks').textContent), 'listed under the call');

// ---- delete
const nTasks = g('TASKS.length');
g(`openTask(TASKS.find(t => t.title === 'Book travel to Perth').id)`); await tick();
ok(!$('tkDel').hidden, 'bin shown on a saved task');
$('tkDel').click(); await tick(150);
ok(g('TASKS.length') === nTasks - 1 && !(await g('tasksAll()')).some(t => t.title === 'Book travel to Perth'), 'deleted');

// ---- backup carries tasks; restore brings them back
const bk = await g('buildBackup(false)');
ok(Array.isArray(bk.tasks) && bk.tasks.length === g('TASKS.length'), 'backup includes tasks');
await g(`(async () => { for (const t of await tasksAll()) await tasksDel(t.id); TASKS = []; })()`);
w.__bk = new w.File([JSON.stringify(bk)], 'b.json', { type: 'application/json' });
await g('doRestore(window.__bk)'); await tick(200);
ok(g('TASKS.length') === bk.tasks.length, 'restore brings tasks back');

// ---- v86: quote requests on the calendar, on the day made ----
{
  const made = new Date(2026, 9, 13, 14, 7).getTime();   // Tue 13 Oct 2026, 2:07pm
  await g(`(async () => { call = {id: 'q${made}', rectype: QUOTE, type: QUOTE_TYPE, date: '13/10/2026', customer: 'Acme Pty Ltd - Smithfield',
    contacts: [], entries: [{type: 'belt', asset: 'CV-1', photos: []}], loose: [], status: 'in progress', closed: false}; await saveCall(); call = null; })()`);
  const Q = g(`QUOTES.find(q => q.id === 'q${made}')`);
  ok(Q && Q.date === '2026-10-13' && Q.start === '14:00' && Q.belts === 1, 'a new quote request is on the calendar the day it was made, at the time: ' + JSON.stringify(Q));
  ok(!g(`APPTS.some(a => a.acct === 'Acme Pty Ltd - Smithfield' && a.date === '2026-10-13')`), 'it is not an appointment, so nothing goes to Outlook');
  g(`(() => { plan.view = 'week'; plan.anchor = startOfWeek(new Date('2026-10-13T12:00')); renderPlan(); })()`); await tick();
  const qel = [...d.querySelectorAll('#calBody .appt.quote')].find(e => /RFQ Acme/.test(e.textContent));
  ok(!!qel, 'PC week view shows it');
  g(`(() => { plan.view = 'month'; plan.anchor = new Date('2026-10-13T12:00'); renderPlan(); })()`); await tick();
  ok([...d.querySelectorAll('#calBody .pill.quote')].some(e => /RFQ Acme/.test(e.textContent)), 'PC month view shows it');
  g(`(() => { plan.view = 'week'; plan.anchor = startOfWeek(new Date('2026-10-13T12:00')); renderPlan(); })()`); await tick();
  [...d.querySelectorAll('#calBody .appt.quote')].find(e => /RFQ Acme/.test(e.textContent)).click(); await tick(100);
  ok(g('screen') === 'dash' && g('call && call.id') === `q${made}`, 'clicking it opens the quote request');
  g(`(() => { call = null; showScreen('today'); tvCursor = '2026-10-13'; todayView = 'today'; renderToday(); })()`); await tick();
  ok(!!$('tvBody').querySelector('.vis.quote [data-qopen]') && /1 quote request/.test($('tvHint').textContent), 'phone Day list shows it: ' + $('tvHint').textContent);
  g(`(() => { todayView = 'month'; renderToday(); })()`); await tick();
  const c13 = $('tvBody').querySelector('[data-mday="2026-10-13"]');
  ok(c13 && c13.querySelector('.pm-q') && c13.querySelector('.pm-q').textContent === '1', 'phone Month counts it');
  ok(/quotes/.test($('tvBody').querySelector('.pm-key').textContent), 'and the key names quotes');
  g(`(() => { todayView = 'today'; renderToday(); })()`); await tick();
  $('tvBody').querySelector('[data-qopen]').click(); await tick(100);
  ok(g('screen') === 'dash' && g('call && call.id') === `q${made}`, 'tapping it on the phone opens it');
  g(`call = null`);
  const qrec = await g(`recordsAll().then(r => r.find(c => c.id === 'q${made}'))`);
  w.__q = qrec;
  await g(`deleteCallRecord(window.__q)`); await tick(50);
  ok(!g(`QUOTES.some(q => q.id === 'q${made}')`), 'a deleted quote request leaves the calendar');
  g(`(() => { todayView = 'week'; tvCursor = null; showScreen('home'); })()`);
}

// ---- v86: Start the call on a planned visit ----
{
  await g(`(async () => { const ap = {id: 'apS', acct: 'Acme Pty Ltd - Smithfield', type: 'Intralox site visit', date: '2026-10-14', start: '10:00', dur: 60,
    agenda: 'Belt survey', contacts: [0], touchedAt: Date.now(), status: 'planned'}; APPTS.push(ap); await saveAppt(ap); })()`);
  g(`openDialog(null, {acct: 'Acme Pty Ltd - Smithfield', date: '2026-10-15'})`); await tick();
  ok($('dStart').hidden, 'a new appointment has no Start the call yet');
  g(`(() => { const d = document.getElementById('dlg'); d.removeAttribute('open'); dlgAppt = null; editingAppt = null; })()`);
  g(`openDialog('apS')`); await tick();
  ok(!$('dStart').hidden && $('dStart').textContent === 'Start the call', 'a saved planned visit has Start the call');
  ok($('dAgenda').value === 'Belt survey', 'with all its details still there');
  $('dAgenda').value = 'Belt survey and sprocket check';
  $('dStart').click(); await tick(300);
  ok(!$('dlg').hasAttribute('open') && g('screen') === 'dash' && g('call && call.customer') === 'Acme Pty Ltd - Smithfield', 'Start the call goes into the call');
  ok(g(`APPTS.find(a => a.id === 'apS').agenda`) === 'Belt survey and sprocket check', 'and keeps the edit made just before');
  const cid = g('call.id');
  ok(g(`APPTS.find(a => a.id === 'apS').callId`) === cid, 'the visit is linked to its call');
  g(`(() => { call = null; showScreen('home'); })()`);
  g(`openDialog('apS')`); await tick();
  ok($('dStart').textContent === 'Open the call', 'once started it offers Open the call');
  $('dStart').click(); await tick(200);
  ok(g('call && call.id') === cid, 'which opens the same call, not a second one');
  g(`(() => { call = null; showScreen('today'); })()`);
  g(`openVisitMenu('apS')`); await tick();
  const first = $('vmBody').querySelector('.vmacts button');
  ok(first && first.textContent === 'Open the call', 'phone ⋯ menu leads with it: ' + (first && first.textContent));
  g(`closeVisitMenu()`);
  await g(`(async () => { const ap = {id: 'apT', acct: 'Acme Pty Ltd - Smithfield', type: 'Intralox site visit', date: '2026-10-16', start: '09:00', dur: 30,
    agenda: '', contacts: [], touchedAt: Date.now(), status: 'planned'}; APPTS.push(ap); await saveAppt(ap); })()`);
  g(`openVisitMenu('apT')`); await tick();
  ok($('vmBody').querySelector('.vmacts button').textContent === 'Start the call', 'a visit not yet started says Start the call');
  $('vmBody').querySelector('.vmacts button').click(); await tick(300);
  ok(!$('vmdlg').hasAttribute('open') && g('screen') === 'dash' && g(`APPTS.find(a => a.id === 'apT').callId`) === g('call.id'), 'and it starts the call');
  g(`(() => { call = null; showScreen('home'); })()`);
}

// ---- v87: calendar filter (All / Visits / Tasks / Quotes) and calendar search ----
{
  ok(g('calKind') === 'all', 'the filter starts on All');
  await g(`(async () => { for (const t of [{id: 'tc1', title: 'Book travel to Perth', date: '2026-10-14', start: '15:00', dur: 30, done: false, updated: Date.now()},
    {id: 'tc2', title: 'Send drawing', acct: 'Acme Pty Ltd - Smithfield', date: '2026-10-20', start: '10:00', dur: 30, done: false, updated: Date.now()}]) {
    await tasksPut(t); TASKS = TASKS.filter(x => x.id !== t.id).concat([t]); } })()`);
  const made = new Date(2026, 9, 14, 9, 0).getTime();
  await g(`(async () => { call = {id: 'q${made}', rectype: QUOTE, type: QUOTE_TYPE, date: '14/10/2026', customer: 'Acme Pty Ltd - Smithfield',
    contacts: [], entries: [], loose: [], status: 'in progress', closed: false}; await saveCall(); call = null; })()`);
  g(`(() => { showScreen('today'); tvCursor = '2026-10-14'; todayView = 'today'; renderToday(); })()`); await tick();
  const chips = [...$('tvKinds').querySelectorAll('[data-kind]')].map(b => b.textContent);
  ok(chips.join() === 'All,Visits,Tasks,Quotes' && $('tvKinds').querySelector('[data-kind="all"]').classList.contains('on'), 'phone: All, Visits, Tasks, Quotes chips, All on');
  ok(!!$('tvKinds').querySelector('[data-calsearch] svg'), 'and a search icon at the end of the row');
  const kinds = () => ({v: $('tvBody').querySelectorAll('.vis:not(.task):not(.quote)').length, t: $('tvBody').querySelectorAll('.vis.task').length, q: $('tvBody').querySelectorAll('.vis.quote').length});
  const all = kinds();
  ok(all.v >= 1 && all.t >= 1 && all.q === 1, 'All shows every kind on the 14th: ' + JSON.stringify(all));
  $('tvKinds').querySelector('[data-kind="task"]').click(); await tick();
  const onlyT = kinds();
  ok(onlyT.v === 0 && onlyT.q === 0 && onlyT.t === all.t, 'Tasks shows only tasks: ' + JSON.stringify(onlyT));
  ok(/task/.test($('tvHint').textContent) && !/visit|quote/.test($('tvHint').textContent), 'and the count says only tasks: ' + $('tvHint').textContent);
  g(`(() => { todayView = 'month'; renderToday(); })()`); await tick();
  const c14 = $('tvBody').querySelector('[data-mday="2026-10-14"]');
  ok(c14.querySelector('.pm-t') && !c14.querySelector('.pm-v') && !c14.querySelector('.pm-q'), 'Month counts follow the filter');
  g(`(() => { todayView = 'today'; renderToday(); })()`); await tick();
  $('tvKinds').querySelector('[data-kind="task"]').click(); await tick();
  ok(g('calKind') === 'all' && kinds().v === all.v, 'tapping Tasks again goes back to All');
  $('tvKinds').querySelector('[data-kind="quote"]').click(); await tick();
  ok(kinds().q === 1 && kinds().v === 0 && kinds().t === 0, 'Quotes shows only quote requests');
  // PC
  g(`(() => { showScreen('plan'); plan.view = 'week'; plan.anchor = startOfWeek(new Date('2026-10-14T12:00')); renderPlan(); })()`); await tick();
  ok($('pKinds').querySelector('[data-kind="quote"]').classList.contains('on'), 'PC shows the same filter');
  ok(d.querySelectorAll('#calBody .appt.quote').length >= 1 && !d.querySelector('#calBody .appt:not(.quote)'), 'PC week shows only quote requests');
  $('pKinds').querySelector('[data-kind="all"]').click(); await tick();
  ok(d.querySelector('#calBody .appt.task') && d.querySelector('#calBody .appt:not(.task):not(.quote)'), 'All brings everything back on the PC');
  // search, tasks only
  g(`(() => { showScreen('today'); calKind = 'task'; tvCursor = null; todayView = 'week'; renderToday(); })()`); await tick();
  $('tvKinds').querySelector('[data-calsearch]').click(); await tick();
  ok($('srchdlg').hasAttribute('open') && $('fsQ').placeholder === 'Search tasks', 'with Tasks on, the search is for tasks: ' + $('fsQ').placeholder);
  $('fsQ').value = 'perth'; $('fsQ').dispatchEvent(new w.Event('input')); await tick(80);
  ok($('fsHint').textContent === '1 found' && /Book travel to Perth/.test($('fsRes').textContent), 'finds the task: ' + $('fsHint').textContent);
  $('fsQ').value = 'acme'; $('fsQ').dispatchEvent(new w.Event('input')); await tick(80);
  ok(![...$('fsRes').querySelectorAll('.fs-acct')].some(b => b.classList.contains('cal-visit') || b.classList.contains('cal-quote')), 'and only tasks, even where visits match');
  $('fsQ').value = 'perth'; $('fsQ').dispatchEvent(new w.Event('input')); await tick(80);
  $('fsRes').querySelector('.fs-acct').click(); await tick();
  ok(!$('srchdlg').hasAttribute('open') && dlgOpen() && $('tkTitle').value === 'Book travel to Perth', 'tapping it opens the task');
  ok(g('tvCursor') === '2026-10-14' && g('todayView') === 'today', 'and the calendar is on its day');
  $('tkOk').click(); await tick(100);
  // search, everything
  g(`(() => { calKind = 'all'; renderToday(); })()`); await tick();
  $('tvKinds').querySelector('[data-calsearch]').click(); await tick();
  $('fsQ').value = 'acme'; $('fsQ').dispatchEvent(new w.Event('input')); await tick(80);
  const cls = [...$('fsRes').querySelectorAll('.fs-acct')].map(b => b.className);
  ok(cls.some(c => /cal-visit/.test(c)) && cls.some(c => /cal-quote/.test(c)), 'with All on, it finds visits and quote requests too');
  const vb = [...$('fsRes').querySelectorAll('.fs-acct.cal-visit')].find(b => /16 Oct/.test(b.textContent));
  vb.click(); await tick();
  ok(!$('srchdlg').hasAttribute('open') && g('tvCursor') === '2026-10-16' && g('screen') === 'today', 'a visit takes the calendar to its day, without starting it');
  g(`(() => { calKind = 'all'; tvCursor = null; todayView = 'week'; showScreen('home'); })()`);
}

// ---- v89: Task Slaughterer import (invented records in its format) ----
{
  const made = Date.UTC(2026, 8, 30, 0, 0);
  const ts = {source: 'task-slaughterer-9000', exported: '2026-10-09T00:00:00Z', tasks: [
    {id: 'a1', kind: 'update_project', title: 'Update freezer project', account: 'Acme Pty Ltd - Smithfield', contact: 'Jo Bloggs', email: null, mobile: null,
     project: 'Freezer', revenue: 25000, notes: 'Quote sent', done: false, createdAt: made + 2000, doneAt: null},
    {id: 'a2', kind: 'email', title: 'Email Jo the drawings', account: 'acme smithfield', contact: null, email: 'jo@acme.example', mobile: null,
     project: null, revenue: null, notes: null, done: false, createdAt: made + 1000, doneAt: null},
    {id: 'a3', kind: 'call', title: 'Ring Sam', account: 'Riverside Foods', contact: 'Sam', email: null, mobile: '0400 000 000',
     project: null, revenue: null, notes: null, done: true, createdAt: made, doneAt: Date.UTC(2026, 9, 7, 3, 40)},
    {id: 'a4', kind: 'mystery', title: 'Something else', account: null, contact: null, email: null, mobile: null,
     project: null, revenue: null, notes: null, done: false, createdAt: made + 3000, doneAt: null}
  ]};
  w.__ts = ts;
  const rep = await g('importTaskSlaughterer(window.__ts)');
  ok(rep.added === 4 && rep.open === 3 && rep.done === 1, 'all four come in, three open and one done: ' + rep.line);
  const T = id => g(`TASKS.find(t => t.id === '${id}')`);
  const today = g('todayISOdate()');
  ok(T('ts-a2').date === today && T('ts-a2').start === '08:00' && T('ts-a1').start === '08:30' && T('ts-a4').start === '09:00',
    'open tasks go on today from 8am, half an hour apart, oldest first');
  const a3 = T('ts-a3');
  ok(a3.done && a3.date === g(`iso(new Date(${Date.UTC(2026, 9, 7, 3, 40)}))`), 'a done task goes on the day it was done');
  const a1 = T('ts-a1');
  ok(a1.type === 'Update project' && a1.project === 'Freezer' && a1.revenue === '25000' && a1.notes === 'Quote sent' && a1.contact === 'Jo Bloggs' && a1.dur === 30,
    'fields carry across one to one: ' + JSON.stringify({type: a1.type, revenue: a1.revenue}));
  ok(T('ts-a2').type === 'Write email' && T('ts-a2').email === 'jo@acme.example' && T('ts-a4').type === 'Other', 'types map to the CRM list; an unknown one is Other');
  ok(a1.acct === 'Acme Pty Ltd - Smithfield' && T('ts-a2').acct === 'Acme Pty Ltd - Smithfield', 'account names are matched to the CRM account, exactly or by its words');
  ok(a3.acct === 'Riverside Foods' && rep.kept.includes('Riverside Foods') && /kept as typed: Riverside Foods/.test(rep.line), 'a name not in the CRM is kept as typed and reported');
  ok(Object.keys(await g('cloudDirtyLoad()')).some(k => k === 'tasks/ts-a1'), 'imported tasks are marked for cloud sync');
  // edited here since: a second import must not touch it
  await g(`(async () => { const t = TASKS.find(x => x.id === 'ts-a1'); t.title = 'Changed in the CRM'; t.updated = Date.now(); await tasksPut(t); })()`);
  const rep2 = await g('importTaskSlaughterer(window.__ts)');
  ok(rep2.added === 0 && rep2.skipped === 4 && /Nothing new/.test(rep2.line), 'the same file again adds nothing');
  ok(T('ts-a1').title === 'Changed in the CRM', 'and leaves a task edited here alone');
  // shared to the app, the file is recognised
  const f = new w.File([JSON.stringify(Object.assign({}, ts, {tasks: [Object.assign({}, ts.tasks[0], {id: 'b1'})]}))], 'task-slaughterer-tasks.json', {type: 'application/json'});
  w.__f = f;
  const msg = await g('routeIncomingFile(window.__f, {silent: true})');
  ok(/1 task brought in/.test(msg) && !!T('ts-b1'), 'shared to Field CRM, the file is recognised: ' + msg);
  ok(!!$('tsFile') && !!$('tsBtn'), 'Update data has the Task Slaughterer import');
  for (const id of ['ts-a1', 'ts-a2', 'ts-a3', 'ts-a4', 'ts-b1']) await g(`tasksDel('${id}')`);
  await g('tasksAll().then(l => { TASKS = l; })');
}

// ---- v90: the PC month shows all seven days ----
{
  await g(`(async () => { const t = {id: 'twk', title: 'Weekend task', date: '2026-10-17', start: '10:00', dur: 30, done: false, updated: Date.now()};
    await tasksPut(t); TASKS = TASKS.filter(x => x.id !== t.id).concat([t]); })()`);
  g(`(() => { showScreen('plan'); calKind = 'all'; plan.view = 'month'; plan.anchor = new Date('2026-10-13T12:00'); renderPlan(); })()`); await tick();
  const heads = [...d.querySelectorAll('#calBody .month .mh')].map(e => e.textContent);
  ok(heads.join() === 'Mon,Tue,Wed,Thu,Fri,Sat,Sun', 'PC month has seven day columns: ' + heads.join());
  const cells = d.querySelectorAll('#calBody .month .mcell');
  ok(cells.length % 7 === 0 && d.querySelectorAll('#calBody .month .mcell.wknd').length === cells.length / 7 * 2, 'every week row has its Saturday and Sunday, shaded');
  ok([...d.querySelectorAll('#calBody .pill.task')].some(e => /Weekend task/.test(e.textContent)), 'a task on a Saturday shows in the month');
  await g(`tasksDel('twk')`); await g('tasksAll().then(l => { TASKS = l; })');
  g(`showScreen('home')`);
}

// ---- v91: Write email tasks carry the draft ----
{
  const hrefs = [], clips = [];
  w.HTMLAnchorElement.prototype.click = function () { hrefs.push(this.href); };
  w.navigator.clipboard = { writeText: async t => { clips.push(t); } };
  g(`openTask(null, {date: '2026-10-21'})`); await tick();
  ok($('tkMail').hidden, 'a new task does not show the email fields');
  [...$('tkType').querySelectorAll('button')].find(b => b.textContent === 'Write email').click(); await tick();
  ok(!$('tkMail').hidden, 'picking Write email shows To, Subject and Body');
  $('tkAcct').value = 'Acme Pty Ltd - Smithfield'; $('tkAcct').dispatchEvent(new w.Event('change')); await tick();
  $('tkContact').value = 'Jo Bloggs'; $('tkContact').dispatchEvent(new w.Event('change')); await tick();
  ok($('tkTo').value === 'jo@acme.example' && !$('tkToAuto').hidden, 'To fills from the contact and is badged: ' + $('tkTo').value);
  $('tkTo').value = 'jo.bloggs@acme.example'; $('tkTo').dispatchEvent(new w.Event('input'));
  ok($('tkToAuto').hidden, 'typing over it takes the badge off');
  $('tkContact').value = 'Sam Smith'; $('tkContact').dispatchEvent(new w.Event('change')); await tick();
  ok($('tkTo').value === 'jo.bloggs@acme.example', 'and a later contact change does not overwrite what was typed');
  $('tkTitle').value = 'Send Jo the drawings';
  $('tkBody').value = 'Hi Jo,\nDrawings attached.\nBen';
  $('tkOutlook').click(); await tick();
  const h = hrefs.pop() || '';
  ok(h.startsWith('mailto:jo.bloggs%40acme.example?') || h.startsWith('mailto:jo.bloggs@acme.example?'), 'Open in Outlook is a mailto link to the To address: ' + h.slice(0, 60));
  ok(/subject=Send%20Jo%20the%20drawings/.test(h), 'an empty subject uses the title');
  ok(/body=Hi%20Jo%2C%0D%0ADrawings%20attached\.%0D%0ABen/.test(h), 'the body goes with it, line breaks kept');
  $('tkSubject').value = 'Drawings';
  $('tkBody').value = 'x'.repeat(2500);
  $('tkOutlook').click(); await tick(50);
  const h2 = hrefs.pop() || '';
  ok(!/body=/.test(h2) && /subject=Drawings/.test(h2) && clips.pop() === 'x'.repeat(2500), 'a body too long for the link is copied instead, To and Subject still go');
  $('tkBody').value = 'Hi Jo, sprocket drawings for line 2';
  $('tkCopy').click(); await tick(50);
  ok(clips.pop() === 'Hi Jo, sprocket drawings for line 2', 'Copy copies the body');
  $('tkOk').click(); await tick(150);
  const saved = g(`TASKS.find(t => t.title === 'Send Jo the drawings')`);
  ok(saved && saved.type === 'Write email' && saved.mailTo === 'jo.bloggs@acme.example' && saved.mailSubject === 'Drawings' && /line 2/.test(saved.mailBody), 'the draft is saved with the task');
  g(`openTask('${saved.id}')`); await tick();
  ok(!$('tkMail').hidden && $('tkSubject').value === 'Drawings' && $('tkToAuto').hidden, 'reopening shows the draft as saved');
  $('tkOk').click(); await tick(100);
  g(`(() => { showScreen('today'); calKind = 'all'; renderToday(); })()`); await tick();
  $('tvKinds').querySelector('[data-calsearch]').click(); await tick();
  $('fsQ').value = 'sprocket drawings'; $('fsQ').dispatchEvent(new w.Event('input')); await tick(80);
  ok(/Send Jo the drawings/.test($('fsRes').textContent), 'the calendar search looks in the email body');
  g(`closeSearch()`);
  // Task Slaughterer email drafts come in as Write email tasks
  w.__tsm = {source: 'task-slaughterer-9000', tasks: [], emails: [
    {id: 'm1', to: 'sam@acme.example', subject: 'Line 2 quote', body: 'Hi Sam,\nQuote attached.', used: false, createdAt: Date.UTC(2026, 9, 1), usedAt: null},
    {id: 'm2', to: 'someone@else.example', subject: 'Old one', body: 'Sent already', used: true, createdAt: Date.UTC(2026, 8, 30), usedAt: Date.UTC(2026, 9, 2, 1)}]};
  const rep = await g('importTaskSlaughterer(window.__tsm)');
  const m1 = g(`TASKS.find(t => t.id === 'ts-mail-m1')`), m2 = g(`TASKS.find(t => t.id === 'ts-mail-m2')`);
  ok(rep.added === 2 && rep.mails === 2 && /2 of them email drafts/.test(rep.line), 'both drafts come in: ' + rep.line);
  ok(m1 && m1.type === 'Write email' && m1.mailSubject === 'Line 2 quote' && m1.mailBody === 'Hi Sam,\nQuote attached.' && m1.title === 'Line 2 quote' && !m1.done && m1.date === g('todayISOdate()'),
    'an unused draft is an open Write email task on today, the draft on it');
  ok(m1.acct === 'Acme Pty Ltd - Smithfield' && m1.contact === 'Sam Smith', 'its To address finds the CRM contact and account');
  ok(m2 && m2.done && m2.acct === '', 'a used draft comes in done, with no account when the address is unknown');
  for (const id of [saved.id, 'ts-mail-m1', 'ts-mail-m2']) await g(`tasksDel('${id}')`);
  await g('tasksAll().then(l => { TASKS = l; })');
  g(`showScreen('home')`);
}

// ---- marked for cloud sync
ok(Object.keys(await g('cloudDirtyLoad()')).some(k => k.startsWith('tasks/')), 'task changes are marked for cloud sync');

const real = errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/i.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
