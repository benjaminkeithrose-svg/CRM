// v150: the large account leads. A Blue Sheet at one of its sites starts
// linked and says which of the plan's objectives it delivers; a site's
// account plan shows the large account above it, says which objective it
// supports and is offered the map's people with their part filled in; the
// plan's Objectives tab lists both under each objective; the coach is told.
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
const S = { a: 'Sample Foods - Northside', b: 'Sample Foods - Westside' };
await g(`(async () => {
  const C = (n, t, id) => ({n, t, r: '', p: '', e: [], id});
  const mk = (a, sub, c) => ({a, sub, z: 'Z1', foc: 'High', cad: CAD['High'], mgr: 'Ben Example', rep: '', c});
  const list = [mk('${S.a}', 'Northside', [C('Pat Plant', 'Engineering Manager', 'c-1')]), mk('${S.b}', 'Westside', [])];
  await accReplaceAll(list); indexAccounts(list);
  await kvSet('cloudSeeded', true);
  await plansPut({id: 'L1', kind: 'large', name: 'Sample Foods', sites: ['${S.a}', '${S.b}'], updated: 1, sitesOn: true, autoCorpChecked: true,
    objectives: [{id: 'ob1', t: 'Standardise the chicken lines'}, {t: 'Win the freezer upgrades'}], strategies: ['Lead with downtime data'], flags: [{id: 'f1', t: 'Group engineering prefers another supplier'}], actions: [],
    parties: [{id: 'pc', kind: 'corp', name: 'Sample Foods Corporate'}, {id: 'pa', kind: 'end', name: '${S.a}', acct: '${S.a}', site: true}, {id: 'pb', kind: 'end', name: '${S.b}', acct: '${S.b}', site: true}, {id: 'pi', kind: 'ilx', name: 'Intralox'}],
    people: [{id: 'q1', party: 'pa', side: 'cust', n: 'Pat Plant', title: 'Engineering Manager', role: 'Checks the spec', mode: 'Trouble', stance: 'helps'},
      {id: 'q2', party: 'pc', side: 'cust', n: 'Corin Chief', title: 'COO', role: 'Signs the order', mode: 'Growth'}], links: []});
  await loadLists();
})()`);
await tick(100);

// ---- A: Strategy leads with the large accounts
g(`go('strategy')`); await tick(150);
ok($('stTabs').querySelector('button.on[data-v]').dataset.v === 'laps', 'Strategy opens on Large accounts');

// ---- B: a new Blue Sheet from a site on the large account's map
g(`openLap('L1')`); await tick(250);
g(`opSelect({t: 'party', id: 'pa'})`); await tick(80);
ok(!!$('opQnewBs'), 'a site offers New Blue Sheet here');
$('opQnewBs').click(); await tick(100);
ok($('oppdlg').hasAttribute('open') && $('odSub').textContent === S.a, 'it starts a Blue Sheet at that site');
$('odName').value = 'Line two'; $('odOk').click(); await tick(400);
ok(g(`OPP.name`) === 'Line two' && g(`OPP.lap`) === 'L1', 'which opens linked to the large account');
const sel = $('opLapObj');
ok(!!sel && [...sel.options].map(o => o.textContent).join('|') === 'Not tied to one yet|Standardise the chicken lines|Win the freezer upgrades', 'and asks which of its objectives it delivers');
ok(g(`PLANS.find(p => p.id === 'L1').objectives.every(o => o.id)`), 'every objective is given an id to point at');
sel.value = 'ob1'; sel.dispatchEvent(new w.Event('change')); await tick(200);
ok(g(`OPP.lapObj`) === 'ob1' && (await g(`oppsAll()`)).find(r => r.name === 'Line two').lapObj === 'ob1', 'the choice is kept');
const oid = g(`OPP.id`);

// ---- C: the site's account plan takes its lead
g(`openPlan('${S.a}')`); await tick(100);
ok(!$('plLap').hidden && /From the large account plan Sample Foods/.test($('plLap').textContent) && /Standardise the chicken lines/.test($('plLap').textContent) && /Lead with downtime data/.test($('plLap').textContent) && /Group engineering prefers another supplier/.test($('plLap').textContent),
  'a site\'s account plan shows the large account\'s objectives, strategies and weaknesses');
ok([...$('plNames').options].map(o => o.value).includes('Corin Chief'), 'its people are offered from the large account map, those over the site too');
$('plAdd').click(); await tick(30);
const row = [...$('plPeople').querySelectorAll('.plp')].pop();
row.querySelector('.plname').value = 'Corin Chief'; row.querySelector('.plname').dispatchEvent(new w.Event('change', {bubbles: true})); await tick(30);
ok(row.querySelector('.plrole button.on') && row.querySelector('.plrole button.on').dataset.v === 'Signs the order' && row.querySelector('.plmode button.on').dataset.v === 'Growth', 'picking one fills in their part and how they see it');
$('plLapObj').value = 'ob1'; $('plGoal').value = 'Both lines on the same belt by June';
$('plOk').click(); await tick(300);
ok(g(`planFor('${S.a}').lapObj`) === 'ob1', 'and it says which objective it supports');

// ---- the plan's Objectives tab lists both under the objective
g(`openLap('L1')`); await tick(200);
g(`lapShowPlan()`); await tick(100);
d.querySelector('[data-laptab="obj"]').click(); await tick(100);
const first = d.querySelector('.lapobj');
ok(/Blue Sheet: Line two/.test(first.textContent) && /Site plan: Northside/.test(first.textContent), 'the Objectives tab lists the Blue Sheet and site plan under the objective they serve: ' + first.textContent.replace(/\s+/g, ' ').slice(-80));
ok(/No Blue Sheet or site plan is tied to this yet/.test(d.querySelectorAll('.lapobj')[1].textContent), 'and says so where nothing is');

// ---- D: the coach is told
const ot = g(`oppText(OPPS.find(o => o.id === '${oid}'))`);
ok(/delivering its objective: Standardise the chicken lines/.test(ot), 'the coach is told which objective the Blue Sheet delivers');
const h = g(`accountHistory('${S.a}')`);
ok(/Supports the large account objective: Standardise the chicken lines/.test(h) && /Standardise the chicken lines.*Blue Sheet Line two and site plan for Sample Foods - Northside/.test(h), 'and which the site plan supports, and what serves each objective');

await tick(900);
ok(errs.length === 0, 'no errors', errs.join(' | '));
console.log(`PASS ${pass}` + (fail ? `  FAIL ${fail}` : ''));
process.exit(fail ? 1 : 0);
