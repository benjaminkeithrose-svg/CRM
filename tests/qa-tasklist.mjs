// v132: tasks in their own place - a Home tile, Open and Done, anything not
// done from an earlier day first as overdue, an Emails filter, the tick, the
// bin and a tap to open. Everything here is made up.
import { JSDOM } from 'jsdom';
import fs from 'fs';
import 'fake-indexeddb/auto';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  x ' + m); } };
const tick = (ms = 50) => new Promise(r => setTimeout(r, ms));
const errs = [];
let confirms = [];
const dom = new JSDOM(fs.readFileSync('index.html', 'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g, ''),
  { runScripts: 'dangerously', url: 'https://example.org/' });
const w = dom.window, d = w.document;
w.indexedDB = indexedDB; w.IDBKeyRange = IDBKeyRange; w.Blob = Blob;
w.scrollTo = () => {}; w.alert = () => {}; w.confirm = m => { confirms.push(m); return true; };
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
const day = n => g(`iso(new Date(Date.now() + ${n} * 864e5))`);
const T0 = day(0), Tm3 = day(-3), Tp2 = day(2);
await g(`(async () => {
  const mk = (id, title, date, extra) => Object.assign({id, type: 'Call', title, date, start: '09:00', dur: 30, acct: 'Example Meats', done: false, created: 1, updated: 1}, extra || {});
  await tasksPut(mk('t1', 'Call Tom back', '${Tm3}'));
  await tasksPut(mk('t2', 'Send the quote', '${T0}', {type: 'Write email', mailTo: 'tom@example.com', mailSubject: 'Quote'}));
  await tasksPut(mk('t3', 'Book travel', '${Tp2}', {type: 'Book travel'}));
  await tasksPut(mk('t4', 'Old one', '${Tm3}', {done: true, doneAt: Date.now() - 1000}));
  await loadLists(); TASKS = await tasksAll();
  await kvSet('cloudSeeded', true);
})()`);

// ---- the Home tile
const tile = d.querySelector('#s-home [data-go="tasks"]');
ok(tile && /Tasks/.test(tile.textContent) && tile.previousElementSibling.dataset.go === 'plan', 'Home has a Tasks tile, after Plan');
tile.click(); await tick(100);
ok(g(`screen`) === 'tasks' && $('title').textContent === 'Tasks', 'it opens Tasks');
const heads = () => [...$('tkRes').querySelectorAll('h2.tkh')].map(h => h.textContent).join();
const titles = () => [...$('tkRes').querySelectorAll('.tkrow .rn')].map(x => x.textContent.replace(' Email', '')).join();
ok(heads() === 'Overdue,Today,Coming up' && titles() === 'Call Tom back,Send the quote,Book travel', 'Open: overdue first, then today, then coming up: ' + titles());
ok($('tkRes').querySelector('.tkrow.late') && /3 open, 1 overdue/.test($('tkHint').textContent), 'the overdue one is marked, and counted');
ok(/Email/.test($('tkRes').querySelectorAll('.tkrow')[1].textContent), 'an email task says so');

// ---- the Emails filter
$('tkKinds').querySelector('[data-v="email"]').click(); await tick();
ok(titles() === 'Send the quote', 'Emails shows only the emails');
$('tkNewT').click(); await tick(100);
ok($('taskdlg').hasAttribute('open') && g(`taskEdit.type`) === 'Write email', 'circle-plus on the Emails filter starts an email');
g(`closeDialogsNow()`); await tick();
$('tkKinds').querySelector('[data-v="all"]').click(); await tick();

// ---- tick, open, bin
$('tkRes').querySelector('[data-tktick="t1"]').click(); await tick(150);
ok(g(`TASKS.find(t => t.id === 't1').done`) && !/Call Tom back/.test(titles()) && !$('tkRes').querySelector('.tkrow.late'), 'ticked: it leaves Open');
$('tkTabs').querySelector('[data-pane="done"]').click(); await tick();
ok(/Call Tom back/.test(titles()) && titles().indexOf('Call Tom back') < titles().indexOf('Old one') && $('tkRes').querySelector('.tkrow.done'), 'Done lists it, the latest first');
$('tkTabs').querySelector('[data-pane="open"]').click(); await tick();
$('tkRes').querySelector('[data-tkopen="t3"]').click(); await tick(100);
ok($('taskdlg').hasAttribute('open') && $('tkTitle').value === 'Book travel', 'tapping a task opens it');
g(`closeDialogsNow()`); await tick();
confirms = [];
$('tkRes').querySelector('[data-tkdel="t3"]').click(); await tick(200);
ok(/^Delete the task "Book travel"/.test(confirms[0] || '') && !g(`TASKS.some(t => t.id === 't3')`) && !/Book travel/.test(titles()), 'the bin asks, then it goes');
ok(g(`PARENT.tasks`) === 'home', 'back goes Home');

const real = errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
