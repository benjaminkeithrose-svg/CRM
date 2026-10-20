// v164: a contact who has left their company, marked from the contact lists:
// struck through, kept off every picker, on the CAG list; Not left and Joined
// another company; marked during a call, a red line in its notes. Made up.
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
      {id: 'd1', n: 'Kim Old', r: 'Engineer', t: 'Maintenance Engineer', p: '0400 000 001', pk: 'ok', e: ['kim@example.org']},
      {id: 'd2', n: 'Sam Stay', r: 'Manager', t: 'Plant Manager', p: '0400 000 002', pk: 'ok', e: ['sam@example.org']},
      {id: 'd3', n: 'Lee Gone', r: 'Buyer', t: 'Purchasing', p: '', pk: 'none', e: ['lee@example.org']}]},
    {a: '${B}', sub: 'Penrith', z: 'Z1', foc: 'Medium', cad: CAD['Medium'], mgr: 'Ben', rep: '', c: [
      {id: 'd9', n: 'Pat Here', r: 'Engineer', t: 'Engineer', p: '', pk: 'none', e: []}]}];
  await accReplaceAll(list); indexAccounts(list); peopleMerge();
})()`);
await tick(100);
const acc = n => g(`ACC_BY_NAME.get('${n}')`);
const ct = (a, n) => acc(a).c.find(c => c.n === n);
const leftRecs = () => g(`CHG.filter(r => r.type === 'left' && !r.done)`);

// ---- the account's screen: Left on each contact
g(`openAccount('${A}')`); await tick(100);
const row = n => [...$('avContacts').querySelectorAll('.ct')].find(r => r.querySelector('.cn').textContent.startsWith(n));
ok(row('Kim Old') && row('Kim Old').querySelector('[data-ctleft]'), 'the account screen has Left on each contact');
row('Kim Old').querySelector('[data-ctleft]').click(); await tick(200);
ok(/Kim Old has left Acme Foods - Smithfield\?/.test(confirms[0] || '') && /list for CAG to remove from Dynamics/.test(confirms[0]), 'it asks first, naming them and the account');
ok(ct(A, 'Kim Old').left && leftRecs().length === 1 && leftRecs()[0].n === 'Kim Old', 'they are marked, and on the CAG list');
ok(row('Kim Old').classList.contains('gone') && /Left/.test(row('Kim Old').querySelector('.tag.left').textContent) && row('Kim Old').querySelector('[data-ctrej]') && row('Kim Old').querySelector('[data-ctback]'), 'struck through, tagged Left, with Joined another company and Not left');
ok(g(`cagItems().some(i => i.kind === 'left' && i.n === 'Kim Old')`), 'the Changes for CAG list has them');

// ---- Not left undoes it while it has not gone to CAG
row('Kim Old').querySelector('[data-ctback]').click(); await tick(200);
ok(!ct(A, 'Kim Old').left && leftRecs().length === 0 && !row('Kim Old').classList.contains('gone'), 'Not left takes it back');

// ---- the People page
g(`peView = 'all'`);
const res = d.createElement('div'), hint = d.createElement('div');
g(`renderPeople`)('kim', res, hint);
ok(res.querySelector('[data-peleft]'), 'the People page has Left');
res.querySelector('[data-peleft]').click(); await tick(200);
ok(ct(A, 'Kim Old').left && res.querySelector('.pcard.gone') && res.querySelector('[data-perej]'), 'and marks them there, struck through, with Joined another company');

// ---- they can no longer be picked
ok(g(`ctLive(ACC_BY_NAME.get('${A}'))`).join() === '1,2', 'a new visit ticks only people still there');
g(`openDialog(null, {acct: '${A}', date: iso(new Date())})`); await tick(80);
ok(![...$('dCts').querySelectorAll('.cn')].some(x => x.textContent === 'Kim Old') && $('dCts').querySelectorAll('.cn').length === 2, 'Who to see on a visit leaves them out');
g(`(() => { const d = document.getElementById('dlg'); if(d.close) d.close(); else d.removeAttribute('open'); })()`);
g(`taskFillContacts('${A}', '')`);
ok(![...$('tkContact').options].some(o => o.value === 'Kim Old'), 'a task cannot pick them');
ok(!/Kim Old/.test(g(`accountText('${A}')`)), 'the sales coach is not told about them');

// ---- choosing who is on a new call: Left there goes in the call's notes
g(`chooseAccount('${A}')`); await tick(80);
const prow = n => [...$('ctList').querySelectorAll('.pick')].find(r => r.querySelector('.nm').textContent.startsWith(n));
ok(prow('Kim Old').classList.contains('gone') && prow('Kim Old').querySelector('input').disabled, 'on the new call: struck through and cannot be ticked');
prow('Sam Stay').querySelector('input').checked = true;
prow('Lee Gone').querySelector('[data-ctleft]').click(); await tick(200);
ok(ct(A, 'Lee Gone').left && prow('Sam Stay').querySelector('input').checked && prow('Lee Gone').querySelector('input').disabled, 'Left on the new call screen marks them, and keeps the other ticks');
$('cDate').value = '2026-10-20'; $('cType').value = 'Site call';
$('openCall').click(); await tick(300);
ok(g(`call && call.customer`) === A && g(`call.contacts.length`) === 1 && g(`(call.leftPeople || []).map(x => x.n).join()`) === 'Lee Gone', 'the call starts with Sam, and notes Lee as left');
ok(/Left: Lee Gone/.test($('dashStat').textContent), 'the call says so');
let html = await g(`buildNotesHTML('full', 'none')`);
ok(/<h2>Left the business<\/h2>/.test(html) && /<p style="color:#B2232F[^"]*"><b>Lee Gone<\/b>, Purchasing, has left Acme Foods - Smithfield<\/p>/.test(html), 'the call notes have a red line for them');

// ---- during the call: People on this call
g(`renderCallContacts()`);
const crow = n => [...$('ccAdd').querySelectorAll('.ccrow')].find(r => r.querySelector('.nm').textContent.startsWith(n));
ok(crow('Kim Old').classList.contains('gone') && !crow('Kim Old').querySelector('[data-add]'), 'during the call: someone who left cannot be added');
crow('Kim Old').querySelector('[data-ctback]').click(); await tick(200);
ok(!ct(A, 'Kim Old').left && crow('Kim Old').querySelector('[data-add]'), 'Not left there brings them back');
crow('Kim Old').querySelector('[data-ctleft]').click(); await tick(200);
ok(g(`call.leftPeople.map(x => x.n).sort().join()`) === 'Kim Old,Lee Gone', 'Left during the call adds them to its notes');
html = await g(`buildNotesHTML('full', 'none')`);
ok(/Kim Old<\/b>, Maintenance Engineer, has left/.test(html), 'both are in the notes');
ok(!/Left the business/.test(await g(`buildNotesHTML('health', 'none')`)), 'only the full call notes carry it');

// ---- a removal already sent to CAG: Not left asks first
await g(`(async () => { const r = CHG.find(x => x.type === 'left' && x.n === 'Lee Gone'); r.sent = Date.now(); await chgSave(r); })()`);
answer = false; confirms = [];
await g(`contactBack(ACC_BY_NAME.get('${A}').c.find(c => c.n === 'Lee Gone'))`);
ok(/went to CAG on/.test(confirms[0] || '') && ct(A, 'Lee Gone').left, 'once sent to CAG, Not left asks first; Cancel keeps it');
answer = true;

// ---- Joined another company: not sent yet, so it becomes a move
g(`contactRejoin('${A}', ACC_BY_NAME.get('${A}').c.find(c => c.n === 'Kim Old'))`); await tick(80);
ok($('ctdlg').hasAttribute('open') && /joined another company/.test($('ctHead').textContent), 'Joined another company opens the contact, asking where they are now');
$('ctTo').value = B; $('ctOk').click(); await tick(250);
ok(g(`CHG.some(r => r.type === 'move' && r.n === 'Kim Old' && r.to === '${B}' && !r.done)`) && !g(`CHG.some(r => r.type === 'left' && r.n === 'Kim Old' && !r.done)`), 'not sent yet: the removal becomes a move for CAG');
ok(ct(B, 'Kim Old') && !ct(B, 'Kim Old').left && ct(B, 'Kim Old').movedFrom === A, 'and they are active at the new account');

// ---- sent already: they start at the new account as a new contact
g(`contactRejoin('${A}', ACC_BY_NAME.get('${A}').c.find(c => c.n === 'Lee Gone'))`); await tick(80);
$('ctTo').value = B; $('ctOk').click(); await tick(250);
ok(g(`PEOPLE.some(r => r.n === 'Lee Gone' && r.acct === '${B}')`) && ct(A, 'Lee Gone').left && ct(B, 'Lee Gone') && !ct(B, 'Lee Gone').left, 'removal already sent: a new contact at the new account, the old one stays struck through');

// ---- someone only added in the app: no CAG, and Not left clears it
await g(`peopleAdd('${B}', 'Jo New', 'Engineer')`);
await g(`contactLeft('${B}', ACC_BY_NAME.get('${B}').c.find(c => c.n === 'Jo New'))`);
ok(/only added in the app/.test(confirms[confirms.length - 1]) && ct(B, 'Jo New').left && g(`PEOPLE.find(r => r.n === 'Jo New').left`) > 0, 'added in the app: marked on its own record');
ok(!g(`cagItems().some(i => i.kind === 'new' && i.n === 'Jo New')`), 'and not sent to CAG as a new contact');
g(`peopleMerge()`);
ok(ct(B, 'Jo New').left, 'the mark survives the contact list being rebuilt');
await g(`contactBack(ACC_BY_NAME.get('${B}').c.find(c => c.n === 'Jo New'))`);
ok(!ct(B, 'Jo New').left && g(`cagItems().some(i => i.kind === 'new' && i.n === 'Jo New')`), 'Not left: active, and back on the CAG list');

// ---- a map: struck through, until taken off
const o = {kind: 'opp', acct: A, parties: [{id: 'q1', kind: 'end', name: A}], people: [{id: 'p1', party: 'q1', n: 'Lee Gone'}, {id: 'p2', party: 'q1', n: 'Sam Stay'}]};
ok(g(`opLeftOf`)(o, o.parties[0], o.people[0]) === true && g(`opLeftOf`)(o, o.parties[0], o.people[1]) === false, 'on a map, the person who left is known');

ok(errs.length === 0, 'no errors', errs.join(' | '));
console.log(`PASS ${pass}` + (fail ? `  FAIL ${fail}` : ''));
process.exit(fail ? 1 : 0);
