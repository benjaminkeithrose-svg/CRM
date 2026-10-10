// v103: a menu that closes itself when one of its actions is tapped (the visit
// menu, the card menu, Create and share) used to leave its history entry
// behind. Move opened over it, and Cancel on Move went back onto it and left
// the Move sheet open; after Missed, Cancel or closing the menu, the first back
// did nothing. Now the next screen or dialog takes the entry over, and a back
// off it steps past. jsdom's history fires popstate like a browser; this is
// still not a phone test of the gesture.
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
w.indexedDB = indexedDB; w.IDBKeyRange = IDBKeyRange;
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
const input = (id, v) => { $(id).value = v; $(id).dispatchEvent(new w.Event('input', { bubbles: true })); };
const isOpen = id => $(id).open;

const st = () => ({ screen: g('screen'), dialog: w.history.state && w.history.state.dialog,
  open: g('DIALOGS').filter(id => $(id).hasAttribute('open')).join(',') });
const back = async () => { w.history.back(); await tick(80); };

async function setup(){
  await g(`(async () => {
    const list = [{a: 'Example Meats', sub: 'X', z: 'Z1', foc: 'High', cad: CAD['High'], mgr: 'Ben', rep: '', c: []}];
    await accReplaceAll(list); indexAccounts(list);
    APPTS = APPTS.filter(a => a.id !== 'ap1');
    const ap = {id: 'ap1', acct: 'Example Meats', date: todayISOdate(), start: '09:00', dur: 60, type: 'Site call', agenda: '', contacts: [], touchedAt: Date.now(), status: 'planned'};
    APPTS.push(ap); await saveAppt(ap);
    closeDialogsNow(); go('home'); go('plan');
  })()`);
  await tick(80);
}
const menu = async () => { g(`openVisitMenu('ap1')`); await tick(); };
const tap = async sel => { d.querySelector(sel).click(); await tick(80); };

// ---- Move, then Cancel: the Move sheet closes
await setup(); await menu();
ok(st().dialog === 'vmdlg' && st().open === 'vmdlg', 'the visit menu has a named entry: ' + JSON.stringify(st()));
await tap('#vmBody [data-move]');
ok(st().open === 'mvdlg' && st().dialog === 'mvdlg', 'Move opens in place of the menu: ' + JSON.stringify(st()));
await tap('#mvCancel');
ok(st().open === '' && st().screen === 'plan', 'Cancel on Move closes it: ' + JSON.stringify(st()));
await back();
ok(st().screen === 'home', 'and one back goes home: ' + JSON.stringify(st()));

// ---- Missed, then one back
await setup(); await menu();
await tap('#vmBody [data-missed]'); await tick(150);
ok(g(`APPTS.find(a => a.id === 'ap1').status`) === 'missed' && st().open === '', 'Missed closes the menu');
await back(); await tick(80);
ok(st().screen === 'home' && st().open === '', 'one back after Missed goes home: ' + JSON.stringify(st()));

// ---- the menu closed by its own button, then one back
await setup(); await menu();
$('vmClose').click(); await tick();
await back(); await tick(80);
ok(st().screen === 'home', 'one back after closing the menu goes home: ' + JSON.stringify(st()));

// ---- Start the call from the menu: back goes to the planner, not onto the menu's entry
await setup(); await menu();
await tap('#vmBody [data-open]'); await tick(300);
ok(st().screen === 'dash' && st().open === '', 'Start the call opens the call');
await back();
ok(st().screen === 'plan' && st().open === '', 'one back from the call: the planner: ' + JSON.stringify(st()));
await back();
ok(st().screen === 'home', 'one more: home');

// ---- the card menu: an action that opens something, and one that stays put
await setup();
g(`(() => { call = {id: 'c9', rectype: 'call', customer: 'Example Meats', date: '10/10/2026', type: 'Site call', contacts: [], entries: [{type: 'note', topic: 'Other', text: 'x'}], loose: [], updated: 1}; go('dash'); })()`);
await tick();
g(`openCardMenu('Note', '', [{label: 'Open', run: () => openLogged(0)}, {label: 'Stay', run: () => {}}])`); await tick();
await tap('#vmBody [data-cm="0"]');
ok(st().screen === 'note' && st().open === '', 'card menu Open goes into the entry');
await back();
ok(st().screen === 'dash', 'one back: the call: ' + JSON.stringify(st()));
g(`openCardMenu('Note', '', [{label: 'Open', run: () => openLogged(0)}, {label: 'Stay', run: () => {}}])`); await tick();
await tap('#vmBody [data-cm="1"]');
await back(); await tick(80);
ok(st().screen === 'plan', 'an action that stays put, then one back: up from the call: ' + JSON.stringify(st()));

// ---- Create and share: Cancel, then one back
g(`go('dash')`); await tick();
g(`openOutDlg()`); await tick();
ok(st().dialog === 'outdlg' && st().open === 'outdlg', 'Create and share has a named entry');
$('outCancel').click(); await tick();
await back(); await tick(80);
ok(st().screen === 'plan' && st().open === '', 'Cancel, then one back: up from the call: ' + JSON.stringify(st()));

// ---- unchanged: the visit editor still closes on back, and stacks the brief
await setup();
g(`openDialog('ap1')`); await tick();
ok(st().dialog === 'dlg' && st().open === 'dlg', 'visit editor open');
await back();
ok(st().open === '' && st().screen === 'plan', 'back closes it and stays on the planner: ' + JSON.stringify(st()));

// ---- v104: the task form has its own entry
await setup();
g(`(() => { closeDialogsNow(); go('home'); })()`); await tick();
g(`openTask(null, {})`); await tick();
ok(st().dialog === 'taskdlg' && st().open === 'taskdlg', 'the task form has a named entry: ' + JSON.stringify(st()));
$('tkTitle').value = 'Ring Sam about the quote';
await back(); await tick(150);
ok(st().screen === 'home' && st().open === '', 'back on Home closes the form and stays in the app: ' + JSON.stringify(st()));
ok(g(`TASKS.some(t => t.title === 'Ring Sam about the quote')`), 'and the back counted as Done: the task is saved');
// Done by the button, from the planner, then one back goes home
g(`go('plan')`); await tick();
g(`openTask(null, {})`); await tick();
$('tkTitle').value = 'Book travel';
$('tkOk').click(); await tick(150);
ok(st().open === '' && st().screen === 'plan' && !st().dialog, 'Done closes the form and takes its entry with it: ' + JSON.stringify(st()));
ok(g(`TASKS.some(t => t.title === 'Book travel')`), 'Done saves');
await back();
ok(st().screen === 'home', 'then one back goes home');
// Delete
g(`go('plan')`); await tick();
const tid = g(`TASKS.find(t => t.title === 'Book travel').id`);
g(`openTask('${tid}')`); await tick();
$('tkDel').click(); await tick(150);
ok(st().open === '' && !st().dialog && !g(`TASKS.some(t => t.title === 'Book travel')`), 'Delete closes the form and takes its entry: ' + JSON.stringify(st()));
await back();
ok(st().screen === 'home', 'then one back goes home');
// an empty form, closed by back: nothing kept
const n = g(`TASKS.length`);
g(`go('plan')`); await tick();
g(`openTask(null, {})`); await tick();
await back(); await tick(150);
ok(st().open === '' && st().screen === 'plan' && g(`TASKS.length`) === n, 'an empty form closed by back keeps nothing');

const real = errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/i.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
