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
const tile = d.querySelector('#s-home [data-go="newtask"], [data-go="newtask"]');
ok(!!tile, 'Task tile on Home');
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

// ---- marked for cloud sync
ok(Object.keys(await g('cloudDirtyLoad()')).some(k => k.startsWith('tasks/')), 'task changes are marked for cloud sync');

const real = errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/i.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
