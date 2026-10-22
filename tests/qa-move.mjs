// v172: moving a planned visit on the phone. Hold a card on the Week view and
// slide it to another day (visits and tasks); Change date and time from the
// visit's ⋯ menu and from the call it became.
import { JSDOM } from 'jsdom';
import fs from 'fs';
import 'fake-indexeddb/auto';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  x ' + m); } };
const tick = (ms = 50) => new Promise(r => setTimeout(r, ms));
const errs = [];
const dom = new JSDOM(fs.readFileSync('index.html', 'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g, ''),
  { runScripts: 'dangerously', url: 'https://example.org/', pretendToBeVisual: true });
const w = dom.window, d = w.document;
w.indexedDB = indexedDB; w.IDBKeyRange = IDBKeyRange;
w.scrollTo = () => {}; w.alert = () => {}; w.confirm = () => true;
w.matchMedia = () => ({ matches: true, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });   // a phone
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
w.eval(`toast = m => { window.__t = m; }`);

// a week with a visit on Monday and a task on Tuesday
const mon = g(`iso(weekViewStart())`), day = n => g(`iso(addDays(parseIso('${mon}'), ${n}))`);
await g(`(async () => {
  const list = [{a: 'Acme Foods - Smithfield', sub: 'Smithfield', z: 'Z1', foc: 'High', cad: CAD['High'], mgr: 'Ben', rep: '', c: []}];
  await accReplaceAll(list); indexAccounts(list);
  const ap = {id: 'ap1', acct: 'Acme Foods - Smithfield', type: 'Intralox site visit', date: '${mon}', start: '09:00', dur: 60, agenda: '', contacts: [], status: 'planned'};
  APPTS.push(ap); await apptsPut(ap);
  const t = {id: 'tk1', title: 'Send the quote', date: '${day(1)}', start: '10:00', done: false, updated: Date.now()};
  TASKS.push(t); await tasksPut(t);
  go('today'); tvSetView('week');
})()`);
await tick(200);
const card = mv => d.querySelector('#tvBody [data-mv="' + mv + '"]');
const blk = k => d.querySelector('#tvBody .dayblk[data-day="' + k + '"]');
ok(card('v:ap1') && card('t:tk1') && blk(day(3)), 'the Week view: visits and tasks can be moved, each day is a place to drop');

// hold, slide onto Thursday, let go
const ptr = (el, type, y) => el.dispatchEvent(new w.MouseEvent(type, {bubbles: true, cancelable: true, clientX: 100, clientY: y, button: 0}));
async function slide(mv, toDay){
  const c = card(mv);
  ptr(c.querySelector('.vopen'), 'pointerdown', 200);
  await tick(g(`TV_HOLD`) + 60);
  const lifted = c.classList.contains('lift');
  d.elementFromPoint = () => blk(toDay).querySelector('h3');
  ptr(d, 'pointermove', 400);
  const over = blk(toDay).classList.contains('over');
  ptr(d, 'pointerup', 400);
  const opened = g(`screen`);
  c.querySelector('.vopen').click();   // the click that follows a lift
  await tick(300);
  return {lifted, over, opened: g(`screen`) !== 'today' || opened !== 'today'};
}
let r = await slide('v:ap1', day(3));
ok(r.lifted && r.over, 'holding lifts the card, and the day under the finger is marked');
ok(!r.opened, 'letting go does not open the call');
const ap = g(`APPTS.find(x => x.id === 'ap1')`);
ok(ap.date === day(3) && ap.start === '09:00' && ap.movedAt > 0 && ap.touchedAt > 0, 'the visit is on Thursday, same time, stamped as changed');
ok(/Moved to Thu/.test(w.__t) && blk(day(3)).querySelector('[data-mv="v:ap1"]'), 'it says so, and the list shows it there: ' + w.__t);
r = await slide('t:tk1', day(4));
const tk = g(`TASKS.find(x => x.id === 'tk1')`);
ok(tk.date === day(4) && tk.start === '10:00' && tk.updated > 0, 'a task slides the same way');

// a finger that moves first is scrolling, not lifting
const c = card('v:ap1');
ptr(c.querySelector('.vopen'), 'pointerdown', 200);
ptr(d, 'pointermove', 240);
await tick(g(`TV_HOLD`) + 60);
ok(!c.classList.contains('lift') && !g(`tvDrag`), 'moving straight away scrolls the page, nothing lifts');
ptr(d, 'pointerup', 240);

// ---- Change date and time from the ⋯ menu
card('v:ap1').querySelector('[data-vmenu]').click(); await tick();
const mvb = d.querySelector('#vmBody [data-move]');
ok(mvb && mvb.textContent === 'Change date and time', 'the menu offers Change date and time');
mvb.click(); await tick(100);
ok($('mvdlg').hasAttribute('open') && $('mvDate').value === day(3) && $('mvTime').value === '09:00' && $('mvDur').value === '60', 'it opens with the date, start and length');
const far = g(`iso(addDays(parseIso('${mon}'), 23))`);
$('mvDate').value = far; $('mvTime').value = '14:30'; $('mvDur').value = '90';
$('mvOk').click(); await tick(300);
ok(!$('mvdlg').hasAttribute('open'), 'Done closes it');
const ap2 = (await g(`apptsAll()`)).find(x => x.id === 'ap1');
ok(ap2.date === far && ap2.start === '14:30' && ap2.dur === 90, 'and saves a date weeks away, a new start and length');
const before = ap2.touchedAt;
g(`openMoveDialog('ap1')`); await tick();
$('mvCancel').click(); await tick(100);
ok(!$('mvdlg').hasAttribute('open') && g(`APPTS.find(x => x.id === 'ap1')`).touchedAt === before, 'Cancel changes nothing');

// ---- from inside the call the visit became
await g(`(async () => { await startVisit('ap1'); })()`); await tick(300);
ok(g(`screen`) === 'dash' && g(`call.apptId`) === 'ap1', 'the visit opens as a call');
$('barMore').click(); await tick();
const item = [...d.querySelectorAll('#cmdlg button, dialog[open] button')].find(b => /Change date and time/.test(b.textContent));
ok(item, 'the call\'s ⋯ menu has Change date and time');
if (item) { item.click(); await tick(100); }
ok($('mvdlg').hasAttribute('open'), 'and it opens the same sheet');
const today = g(`todayISOdate()`);
$('mvDate').value = today; $('mvTime').value = '11:15';
$('mvOk').click(); await tick(300);
ok(g(`APPTS.find(x => x.id === 'ap1').date`) === today && g(`call.date`) === g(`ddmmyyyy('${today}')`), 'the visit moves, and the open call\'s date follows');
ok(g(`screen`) === 'dash', 'you stay in the call');

const real = errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/i.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
