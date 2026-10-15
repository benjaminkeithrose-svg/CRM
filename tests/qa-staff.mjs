// v142: Intralox people. A shared list (store 'people', kind 'staff') with
// name, position, reports to, email and phone, on the Lists screen; offered
// for the Intralox box on every map, tied to the record there; their manager
// in the box becomes who they report to (drawn as a chart); their record lists
// their relationships on every map, each strength one tap away.
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
for (const f of ['zones.js', 'manuals.js', 'healthlib.js', 'app.js']) {
  const el = d.createElement('script'); el.textContent = fs.readFileSync(f, 'utf8'); d.body.appendChild(el);
}
d.dispatchEvent(new w.Event('DOMContentLoaded'));
await tick(500);
const $ = id => d.getElementById(id);
const g = e => w.eval('(' + e + ')');
const S = { a: 'Sample Foods - Northside' };
await g(`(async () => {
  const mk = (a, sub) => ({a, sub, z: 'Z1', foc: 'High', cad: CAD['High'], mgr: 'Ben Example', rep: '', c: []});
  const list = [mk('${S.a}', 'Northside')];
  await accReplaceAll(list); indexAccounts(list);
  await kvSet('cloudSeeded', true);
  await plansPut({id: 'L1', kind: 'large', name: 'Sample Foods', sites: ['${S.a}'], objectives: [], actions: [], updated: 1, sitesOn: true, autoCorpChecked: true,
    parties: [{id: 'pa', kind: 'end', name: '${S.a}', acct: '${S.a}', site: true}, {id: 'pi', kind: 'ilx', name: 'Intralox'}],
    people: [{id: 'pp1', party: 'pa', side: 'cust', n: 'Pat Plant', title: 'Engineering Manager', stance: 'unknown'}], links: []});
  await loadLists();
})()`);
await tick(100);

// ---- the list, in Settings (v155: Lists is gone)
g(`go('settings')`); await tick(80);
ok($('sxStaff') && g(`STAFF.map(s => s.n).join()`) === 'Ben Example' && /In the CRM: account manager of 1 account/.test($('sfRes').textContent), 'Settings has Intralox people; v157: it starts with the CRM\'s account manager, no position yet');
$('sfNew').click(); await tick(80);
ok($('staffdlg').hasAttribute('open') && $('sfPos').querySelectorAll('button').length === 7, 'its + opens a new person, with the six positions and Other');
ok([...$('sfPos').querySelectorAll('button')].map(b => b.dataset.v).join() === 'AM,ATL,ITL,SS,AE,TSG,Other', 'AM, ATL, ITL, SS, AE, TSG');
$('sfOk').click(); await tick(150);
ok(g(`STAFF.length`) === 1, 'Done with nothing typed keeps nothing');
$('sfNew').click(); await tick(80);
$('sfName').value = 'Ita Leader'; $('sfPos').querySelector('[data-v="ITL"]').click();
$('sfOk').click(); await tick(150);
$('sfNew').click(); await tick(80);
$('sfName').value = 'Ben Example'; $('sfPos').querySelector('[data-v="AM"]').click();
const ita = g(`STAFF.find(s => s.n === 'Ita Leader').id`);
ok(!!$('sfBoss').querySelector('option[value="' + ita + '"]'), 'Reports to offers the others');
$('sfBoss').value = ita;
$('sfEmail').value = 'ben@example.org';
$('sfOk').click(); await tick(150);
const ben = g(`STAFF.find(s => s.n === 'Ben Example')`);
ok(g(`STAFF.filter(s => s.n === 'Ben Example').length`) === 1 && ben.id === 'sf-ben-example', 'typing someone already on the list updates them, not a second record');
ok(ben && ben.pos === 'AM' && ben.boss === ita && ben.e === 'ben@example.org' && ben.kind === 'staff', 'saved with position, manager and email');
const stored = await g(`peopleAll()`);
ok(stored.filter(r => r.kind === 'staff').length === 2, 'kept in the shared people store, as staff');
ok(g(`PEOPLE.length`) === 0 && /Nothing waiting/.test((renderPeopleStat(), $('pplStat').textContent)), 'not counted as contacts missing from Dynamics');
function renderPeopleStat(){ g(`renderPeopleStat()`); }
ok(/Ben Example/.test($('sfRes').textContent) && /reports to Ita Leader/.test($('sfRes').textContent) && $('sfRes').querySelectorAll('.sfpos').length === 2, 'listed with position and manager');

// ---- on a map
g(`openLap('L1')`); await tick(250);
const mp = () => g(`OPP.people.find(p => p.n === 'Ben Example')`);
ok(mp() && mp().sid === ben.id && mp().title === 'Account manager', 'the account manager joins Intralox tied to their record, with their position');
ok(g(`opSuggest('us')[0].n`) === 'Ben Example' || g(`opSuggest('us')[0].n`) === 'Ita Leader', 'the Intralox box is offered the Intralox people first');
g(`opTableOpen(OPP.parties.find(q => q.kind === 'ilx').id)`); await tick(60);
g(`(() => { opTbl.rows.push({id: 'ppI', n: 'Ita Leader', title: 'Industry team leader', boss: '', code: '', stance: 'unknown'}); opTblFinish(); })()`); await tick(150);
g(`renderOpp()`); await tick(150);
ok(g(`OPP.people.find(p => p.id === 'ppI').sid`) === ita, 'someone added from the list is tied to their record');
ok(mp().boss === 'ppI', 'their manager in the box becomes who they report to');
ok(g(`!opIlxRow(OPP.parties.find(q => q.kind === 'ilx'))`) && g(`opPos['${mp().id}'].y`) > g(`opPos['ppI'].y`), 'and the box is drawn as a chart, the manager above');
g(`opSelect({t: 'p', id: '${mp().id}'})`); await tick(80);
ok(/Their Intralox record \(AM\)/.test($('opStaff').textContent), 'their panel opens their Intralox record');

// ---- their relationships, from their record
$('opStaff').click(); await tick(100);
ok($('staffdlg').hasAttribute('open') && /Sample Foods \(large account\)/.test($('sfRels').textContent) && /1 to rate/.test($('sfRels').textContent), 'their record lists the maps they are on, with what is left to rate');
$('sfRels').querySelector('[data-sfrs][data-v="Strong"]').click(); await tick(200);
const L = (await g(`plansAll()`)).find(r => r.id === 'L1');
ok(L.links.some(l => l.b === 'pp1' && l.str === 'Strong' && l.kind === 'Our coverage'), 'rating one there saves it on that map');
ok(!/to rate/.test($('sfRels').textContent), 'and it is no longer left to rate');
$('sfOk').click(); await tick(150);

// ---- delete
g(`go('settings')`); await tick(80);
const del = $('sfRes').querySelector('[data-sfdel="' + ita + '"]');
del.click(); await tick(200);
ok(!g(`STAFF.some(s => s.id === '${ita}')`) && g(`STAFF.find(s => s.n === 'Ben Example').boss`) === '', 'deleting someone leaves those who reported to them reporting to nobody');
ok(g(`PLANS.find(p => p.id === 'L1').people.some(p => p.n === 'Ita Leader')`), 'and leaves them on the maps they are on');

await tick(700);
ok(errs.length === 0, 'no errors', errs.join(' | '));
console.log(`PASS ${pass}` + (fail ? `  FAIL ${fail}` : ''));
process.exit(fail ? 1 : 0);
