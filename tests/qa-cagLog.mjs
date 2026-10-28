// v158: Changes for CAG, its own section at the back of Settings: To send,
// Sent and Done; an account manager change is on it as soon as it is made,
// dated; each change shows what Dynamics has and what it changes to; job
// roles and titles pick from Dynamics' own values, anything else flagged.
// Everything here is made up.
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
const S = { a: 'Sample Foods - Northside', b: 'Sample Foods - Westside' };
await g(`(async () => {
  localStorage.setItem(LS('mgr'), 'Ben Rose');
  const C = (n, t, r, id) => ({n, t, r, p: '', e: [], id});
  const mk = (a, mgr, c) => ({a, sub: '', z: 'Z1', foc: 'High', cad: CAD['High'], mgr, rep: '', c});
  const list = [mk('${S.a}', 'Alex Other', [C('Gerald Grant', 'Engineering Manager', 'Engineering', 'c-1'), C('Sam Store', 'Purchasing Officer', 'Purchasing', 'c-2')]),
    mk('${S.b}', 'Alex Other', [C('Jo Group', 'Plant Manager', 'Operations', 'c-3')])];
  await accReplaceAll(list); indexAccounts(list);
  await kvSet('cloudSeeded', true);
  await plansPut({id: 'L1', kind: 'large', name: 'Sample Foods', sites: ['${S.a}', '${S.b}'], objectives: [], actions: [], updated: 1, sitesOn: true, autoCorpChecked: true,
    parties: [{id: 'pa', kind: 'end', name: '${S.a}', acct: '${S.a}', site: true}, {id: 'pb', kind: 'end', name: '${S.b}', acct: '${S.b}', site: true}, {id: 'pi', kind: 'ilx', name: 'Intralox'}],
    people: [], links: []});
  await loadLists();
})()`);
await tick(200);
const pick = (id, v, typed) => { const el = $(id); const s = el.querySelector('select'); s.value = v; s.dispatchEvent(new w.Event('change')); if (typed) el.querySelector('input').value = typed; el.querySelector('button').click(); };
const owners = () => g(`CHG.filter(r => r.type === 'owner')`);

// ---- its own section, at the back of Settings
g(`go('settings')`); await tick(80);
const secs = [...d.querySelectorAll('#s-settings > details.sx')].map(x => x.id);
ok(secs[secs.length - 1] === 'sxCag' && /Changes for CAG/.test($('sxCag').querySelector('summary').textContent), 'Changes for CAG is the last section of Settings: ' + secs.join());
ok(!$('sxData').contains($('pplStat')) && $('sxCag').contains($('pplShare')), 'moved out of CRM and belt data');
ok([...$('cagTabs').querySelectorAll('button')].map(b => b.textContent).join('|') === 'To send|Sent|Done' && /Nothing to send/.test($('cagRes').textContent), 'To send, Sent and Done; nothing yet');

// ---- an account manager changed in Strategy goes on the list at once, dated
g(`openLap('L1')`); await tick(300);
g(`opSelect({t: 'party', id: 'pa'})`); await tick(80);
$('opOwnCh').click(); await tick(20);
pick('opOwnPick', '__new__', 'Ben Rose'); await tick(250);
ok(owners().length === 1 && owners()[0].to === 'Ben Rose' && owners()[0].from === 'Alex Other' && owners()[0].at > 0 && owners()[0].by === 'Ben Rose' && !owners()[0].sent, 'changing the account manager in Strategy puts it on the list straight away, dated, with who did it');
ok(g(`!!cloudDirty['people/' + CHG.find(r => r.type === 'owner').id]`), 'and syncs');
g(`opSelect({t: 'party', id: 'pa'})`); await tick(80);
$('opOwnCh').click(); await tick(20);
pick('opOwnPick', '__new__', 'Pat Other'); await tick(250);
ok(owners().length === 1 && owners()[0].to === 'Pat Other', 'changed again before it is sent: the same row, the new owner');
g(`opSelect({t: 'party', id: 'pa'})`); await tick(80);
$('opOwnCh').click(); await tick(20);
pick('opOwnPick', 'Alex Other'); await tick(250);
ok(owners().length === 0, 'back to the owner Dynamics has: off the list');
g(`opSelect({t: 'party', id: 'pa'})`); await tick(80);
$('opOwnCh').click(); await tick(20);
pick('opOwnPick', '__new__', 'Ben Rose'); await tick(250);

// ---- a job role from Dynamics' own list, from the map
await g(`(async () => { OPP.people.push({id: 'gg', n: 'Gerald Grant', title: 'Engineering Manager', party: 'pa', side: 'cust', cid: 'c-1', stance: 'unknown'}); await oppSaveNow(); })()`);
g(`opSelect({t: 'p', id: 'gg'})`); await tick(80);
$('opCtChg').click(); await tick(80);
ok($('ctdlg').hasAttribute('open') && [...$('ctR').options].map(o => o.textContent).join('|') === 'Not set|Engineering|Operations|Purchasing|Something else…', 'Job role offers the roles Dynamics has: ' + [...$('ctR').options].map(o => o.textContent).join('|'));
ok($('ctR').value === 'Engineering' && [...$('ctTitles').options].map(o => o.value).join('|') === 'Engineering Manager|Plant Manager|Purchasing Officer', 'his role is picked, and titles come from Dynamics too');
$('ctR').value = 'Operations'; $('ctR').dispatchEvent(new w.Event('change'));
$('ctT').value = 'Plant Manager'; $('ctT').dispatchEvent(new w.Event('input'));
ok($('ctRflag').hidden && $('ctTflag').hidden, 'values from Dynamics are not flagged');
$('ctT').value = 'Reliability Lead'; $('ctT').dispatchEvent(new w.Event('input'));
ok(!$('ctTflag').hidden, 'a title Dynamics does not hold is flagged as you type');
$('ctOk').click(); await tick(250);
const ed = g(`CHG.find(r => r.type === 'edit' && r.n === 'Gerald Grant')`);
ok(ed && ed.role === 'Operations' && ed.t === 'Reliability Lead' && ed.was.role === 'Engineering' && ed.was.t === 'Engineering Manager', 'kept with what Dynamics has: role and title, then and now');
ok(g(`ACC_BY_NAME.get('${S.a}').c.find(c => c.n === 'Gerald Grant').r`) === 'Operations', 'the contact list shows the new role until Dynamics has it');
// Something else
g(`opSelect({t: 'p', id: 'gg'})`); await tick(80);
$('opCtChg').click(); await tick(80);
ok($('ctR').value === 'Operations', 'opening again shows the role as changed');
$('ctR').value = '__other__'; $('ctR').dispatchEvent(new w.Event('change'));
ok(!$('ctRo').hidden, 'Something else… opens a box to type it');
$('ctRo').value = 'Reliability'; $('ctRo').dispatchEvent(new w.Event('input'));
ok(!$('ctRflag').hidden, 'and flags it');
$('ctOk').click(); await tick(250);
ok(g(`CHG.find(r => r.type === 'edit' && r.n === 'Gerald Grant').role`) === 'Reliability', 'a typed role is kept');

// ---- the list in Settings shows exactly what will go
g(`go('settings')`); await tick(100);
const txt = $('cagRes').textContent;
ok(/Account manager: Alex Other → Ben Rose/.test(txt), 'the owner change: from what Dynamics has to the new one');
ok(/Job role: Engineering → Reliability \(not in Dynamics' list\)/.test(txt) && /Job title: Engineering Manager → Reliability Lead \(not in Dynamics' list\)/.test(txt), 'Gerald: each field from Dynamics to the new, flagged where Dynamics does not have it');
ok(/Made \d.*by Ben Rose/.test(txt) && /Not sent yet/.test(txt), 'when, who, and not sent yet');
ok(/To send 2/.test($('cagTabs').textContent) && /2 to send/.test($('sumCag').textContent), 'the tab and the section header count them');

// ---- the spreadsheet carries the same
let sent = null; w.deliverFile = async (blob, name) => { sent = {blob, name}; };
w.confirm = () => true;
$('pplShare').click(); await tick(400);
const wb = w.XLSX.read(new Uint8Array(await sent.blob.arrayBuffer()), {type: 'array'});
const rows = n => w.XLSX.utils.sheet_to_json(wb.Sheets[n], {header: 1});
const gr = rows('Changed details').find(r => r[2] === 'Gerald Grant');
ok(gr[0] === 'c-1' && gr[1] === S.a && gr[3] === 'Engineering' && gr[4] === 'Reliability' && gr[5] === 'Engineering Manager' && gr[6] === 'Reliability Lead', 'Gerald: contact id, account, role and title as Dynamics has them and what they change to');
ok(/Job role not in Dynamics' list/.test(gr[13]) && /Job title not in Dynamics' list/.test(gr[13]), 'the Check column flags both');
const ow = rows('Account owners').find(r => r[0] === S.a);
ok(ow && ow[2] === 'Alex Other' && ow[3] === 'Ben Rose' && ow[4] && ow[5] === 'Ben Rose', 'the owner: in Dynamics, change to, recorded, by');

// ---- sent, then removed by hand
g(`cagDraw()`); $('cagTabs').querySelector('[data-v="sent"]').click(); await tick(50);
ok(/Account manager: Alex Other → Ben Rose/.test($('cagRes').textContent) && /Sent/.test($('cagRes').textContent), 'once sent, they are under Sent');
$('cagTabs').querySelector('[data-v="send"]').click(); await tick(50);
ok(/Nothing to send/.test($('cagRes').textContent), 'and To send is empty');
$('cagTabs').querySelector('[data-v="sent"]').click(); await tick(50);
const bin = [...$('cagRes').querySelectorAll('[data-cagrm]')].find(b => /Account manager:/.test(b.closest('li').textContent));
bin.click(); await tick(250);
ok(g(`effMgr(ACC_BY_NAME.get('${S.a}'))`) === 'Ben Rose', 'removing the owner change from the list leaves the account with the new manager');
$('cagTabs').querySelector('[data-v="done"]').click(); await tick(50);
ok(/Taken off the list/.test($('cagRes').textContent), 'it shows under Done as taken off the list, and does not come back');
g(`renderPeopleStat()`); $('cagTabs').querySelector('[data-v="send"]').click(); $('cagTabs').querySelector('[data-v="sent"]').click(); await tick(50);
ok(!/Account manager:/.test($('cagRes').textContent), 'and it is not listed again while the account stays with the new manager');

await tick(700);
ok(errs.length === 0, 'no errors', errs.join(' | '));
console.log(`PASS ${pass}` + (fail ? `  FAIL ${fail}` : ''));
process.exit(fail ? 1 : 0);
