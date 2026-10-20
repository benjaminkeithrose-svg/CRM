// v165: Capture on Home - talk or type, Sort it (Claude, faked here), cards to
// check, Add all onto the calendar; a note held for its customer goes into the
// next call there. Everything here is made up.
import { JSDOM } from 'jsdom';
import fs from 'fs';
import 'fake-indexeddb/auto';

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log('  x ' + m + (x !== undefined ? ' -> ' + x : '')); } };
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
for (const f of ['zones.js', 'manuals.js', 'healthlib.js', 'xlsx-0.18.5.full.min.js', 'app.js']) {
  const el = d.createElement('script'); el.textContent = fs.readFileSync(f, 'utf8'); d.body.appendChild(el);
}
d.dispatchEvent(new w.Event('DOMContentLoaded'));
await tick(500);
const $ = id => d.getElementById(id);
const g = e => w.eval('(' + e + ')');
let confirms = [], answer = true; w.confirm = m => { confirms.push(m); return answer; };
w.eval(`toast = m => { window.__t = m; }`);
const A = 'Acme Foods - Smithfield', B = 'Example Dairy - Penrith';
await g(`(async () => {
  localStorage.setItem(LS('mgr'), 'Ben');
  const list = [
    {a: '${A}', sub: 'Smithfield', z: 'Z1', foc: 'High', cad: CAD['High'], mgr: 'Ben', rep: '', c: [
      {id: 'd1', n: 'Gavin Example', r: 'Engineer', t: 'Project Engineer', p: '0400 000 001', pk: 'ok', e: ['gavin@example.org']},
      {id: 'd2', n: 'Sam Stay', r: 'Manager', t: 'Plant Manager', p: '0400 000 002', pk: 'ok', e: ['sam@example.org']}]},
    {a: '${B}', sub: 'Penrith', z: 'Z1', foc: 'Medium', cad: CAD['Medium'], mgr: 'Ben', rep: '', c: [
      {id: 'd9', n: 'Pat Here', r: 'Engineer', t: 'Engineer', p: '', pk: 'none', e: []}]}];
  await accReplaceAll(list); indexAccounts(list); peopleMerge();
})()`);
await tick(100);
const D = n => g(`iso(addDays(new Date(), ${n}))`);
let asked = null, reply = null, fails = false;
w.eval(`aiBlocked = () => ''`);
w.__ask = async p => { asked = p; if (fails) throw new Error('No signal'); return reply; };
w.eval(`aiAsk = p => window.__ask(p)`);

// ---- Home: Capture at the top
ok($('homeCap') && $('homeCap').compareDocumentPosition(d.querySelector('#s-home .tiles')) & 4 && /Capture/.test($('homeCap').textContent), 'Home has Capture above the tiles');
$('homeCap').click(); await tick(150);
ok(g(`screen`) === 'capture' && !$('capGo').hidden && $('capAdd').hidden, 'it opens Capture, with Sort it at the top');

// ---- Sort it: only the words and today go to Claude; the cards come back
const said = 'Task for Gavin at Acme, write up the trial, due Friday. Call Pat Here on Tuesday at 10. Visit Unknown Co on the 4th. Note for Acme: line 3 down in December. Task book travel to Perth.';
$('capText').value = said; $('capText').dispatchEvent(new w.Event('input'));
reply = {items: [
  {type: 'task', taskType: 'Write email', title: 'Write up the trial', company: 'Acme', person: 'Gavin', date: D(3), time: '', minutes: 0, details: '', said: 'Task for Gavin at Acme, write up the trial, due Friday.'},
  {type: 'call', taskType: '', title: 'Call about the trial', company: '', person: 'Pat Here', date: D(4), time: '10:00', minutes: 0, details: 'Ask about the trial', said: 'Call Pat Here on Tuesday at 10.'},
  {type: 'visit', taskType: '', title: 'Visit the site', company: 'Unknown Co', person: '', date: D(10), time: '', minutes: 60, details: '', said: 'Visit Unknown Co on the 4th.'},
  {type: 'note', taskType: '', title: 'Line 3 is down in December', company: 'Acme', person: '', date: '', time: '', minutes: 0, details: '', said: 'Note for Acme: line 3 down in December.'},
  {type: 'task', taskType: 'Book travel', title: 'Book travel to Perth', company: '', person: '', date: '', time: '', minutes: 0, details: '', said: 'Task book travel to Perth.'}]};
$('capGo').click(); await tick(300);
ok(asked && asked.kind === 'capture' && asked.text === said && /^\d{4}-\d{2}-\d{2}, \w+day$/.test(asked.today) && asked.types.includes('Write email') && !JSON.stringify(asked).includes('Smithfield'),
  'Claude gets the words, today and the task types - not the customer list');
const cards = () => [...$('capCards').querySelectorAll('.capcard')];
const it = i => g(`CAP.items[${i}]`);
ok(cards().length === 5 && $('capText').value === '', 'five cards; the words move out of the box into them');
ok(it(0).acct === A && it(0).contact === 'Gavin Example' && it(0).time === '08:00' && it(0).est.includes('time') && /estimate/.test(cards()[0].textContent),
  'the account and contact matched here; a time it filled in is badged as an estimate');
ok(it(1).acct === B && it(1).est.includes('acct') && it(1).contact === 'Pat Here', 'no company said: found by the person, as an estimate');
ok(/"Unknown Co" is not in your customer list/.test(cards()[2].textContent), 'a company not in the list is flagged');
ok(/Held for the next call there/.test(cards()[3].textContent), 'a note says where it goes');
ok(/No date: tap to set/.test(cards()[4].textContent), 'a task with no date is flagged');
ok(!$('capAdd').hidden && $('capAdd').textContent === 'Add 3 of 5' && $('capAdd').className === 'big', 'Add shows how many are ready, as the main button');

// ---- Add: tasks and visits on the calendar, the note held
const nT = g(`TASKS.length`), nA = g(`APPTS.length`);
$('capAdd').click(); await tick(300);
const t = g(`TASKS.find(t => t.title === 'Write up the trial')`);
ok(t && t.type === 'Write email' && t.acct === A && t.contact === 'Gavin Example' && t.email === 'gavin@example.org' && t.date === D(3) && t.start === '08:00' && g(`TASKS.length`) === nT + 1, 'the task is on the calendar, with the contact\'s email');
const ap = g(`APPTS.find(a => a.acct === '${B}')`);
ok(ap && ap.type === 'Planned phone call' && ap.date === D(4) && ap.start === '10:00' && ap.contacts.join() === '0' && /Call about the trial/.test(ap.agenda) && /Ask about the trial/.test(ap.agenda) && g(`APPTS.length`) === nA + 1, 'the phone call is on the calendar with Pat ticked');
ok(g(`CAP_HELD.length`) === 1 && g(`CAP_HELD[0].acct`) === A && /Line 3 is down/.test($('capHeld').textContent), 'the note is held for the customer, and listed');
ok(cards().length === 2 && /Added 1 task, 1 phone call, 1 note held for the next call\. 2 still need something/.test(w.__t), 'two left to fix, and it says so: ' + w.__t);

// ---- correct a card
cards()[0].click(); await tick(80);
ok($('capdlg').hasAttribute('open') && $('cdHead').textContent === 'Site visit' && $('cdTTw').hidden && /What you said: .Visit Unknown Co/.test($('cdSaid').textContent), 'tapping a card opens it to check, with what was said');
$('cdAcct').value = B; $('cdAcct').dispatchEvent(new w.Event('change'));
ok([...$('cdCt').options].some(o => o.value === 'Pat Here'), 'picking the customer offers their contacts');
$('cdCt').value = 'Pat Here'; $('cdTime').value = '13:30';
$('cdOk').click(); await tick(200);
ok(it(0).acct === B && it(0).contact === 'Pat Here' && it(0).time === '13:30' && !it(0).est.includes('time') && !/not in your customer list/.test(cards()[0].textContent), 'Done keeps the corrections; a time typed over the estimate loses its badge');
cards()[1].click(); await tick(80);
$('cdDate').value = D(5); $('cdOk').click(); await tick(200);
ok($('capAdd').textContent === 'Add all (2)', 'both ready now: Add all');
$('capAdd').click(); await tick(300);
ok(g(`APPTS.some(a => a.acct === '${B}' && a.type === 'Intralox site visit' && a.start === '13:30' && a.dur === 60)`) && g(`TASKS.some(t => t.title === 'Book travel to Perth' && t.type === 'Book travel' && t.date === '${D(5)}')`), 'the visit and the travel task are added');
ok(cards().length === 0 && $('capAdd').hidden, 'nothing left to add');

// ---- Capture's own records stay out of the task list, and come back after a restart
const stored = await g(`tasksAll()`);
ok(stored.some(r => r.id === 'capture' && r.kind === 'capture') && stored.some(r => r.kind === 'capnote') && g(`TASKS.every(t => !t.kind)`), 'the draft and the held note are in the private tasks store, not in the task list');
$('capText').value = 'Half a thought'; $('capText').dispatchEvent(new w.Event('input')); await tick(800);
await g(`(async () => { CAP = {id: 'capture', kind: 'capture', text: '', items: []}; await capLoad(); })()`);
ok(g(`CAP.text`) === 'Half a thought', 'leaving with words in the box keeps them');

// ---- no signal: the words are kept
fails = true; $('capGo').click(); await tick(200);
ok(/That did not work: No signal\. What you said is kept here/.test($('capMsg').textContent) && $('capText').value === 'Half a thought', 'if it fails, the words stay');
fails = false;

// ---- a card can be binned
reply = {items: [{type: 'task', taskType: 'Other', title: 'Ring the depot', company: '', person: '', date: D(1), time: '09:00', minutes: 0, details: '', said: 'Half a thought'}]};
$('capGo').click(); await tick(300);
confirms = [];
$('capCards').querySelector('[data-cdel]').click(); await tick(150);
ok(/Bin this task: "Ring the depot"/.test(confirms[0] || '') && cards().length === 0, 'the bin asks, naming it');

// ---- the held note goes into the next call at that customer
g(`chooseAccount('${A}')`); await tick(80);
$('ctList').querySelector('input[data-i="1"]').checked = true;
$('cDate').value = g(`todayISOdate()`); $('cType').value = 'Site call';
$('openCall').click(); await tick(300);
ok(g(`call.customer`) === A && g(`call.entries.some(e => e.type === 'note' && e.topic === 'Noted in Capture' && /Line 3 is down/.test(e.text))`), 'the next call at the customer gets the held note');
ok(g(`CAP_HELD.length`) === 0 && !(await g(`tasksAll()`)).some(r => r.kind === 'capnote') && /1 note from Capture added/.test(w.__t), 'and it is no longer held: ' + w.__t);

ok(errs.length === 0, 'no errors', errs.join(' | '));
console.log(`PASS ${pass}` + (fail ? `  FAIL ${fail}` : ''));
process.exit(fail ? 1 : 0);
