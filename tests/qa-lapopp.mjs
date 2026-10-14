// v139: an opportunity at one of a large account's sites brings in the
// account's boxes over that site, live. Corporate, the site's division, the
// group functions over it, the site that engineers for it and the OEMs that
// work with them come in with their people and a chain; changes to their
// people and spec go back to the plan; positions stay the opportunity's own;
// the opportunity's record never carries them; Unlink takes them off.
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
const S = { a: 'Sample Foods - Northside', b: 'Sample Foods - Southside', c: 'Sample Foods - Westside', x: 'Other Customer' };
await g(`(async () => {
  const mk = (a, sub) => ({a, sub, z: 'Z1', foc: 'High', cad: CAD['High'], mgr: 'Ben', rep: '', c: []});
  const list = [mk('${S.a}', 'Northside'), mk('${S.b}', 'Southside'), mk('${S.c}', 'Westside'), mk('${S.x}', 'Elsewhere')];
  await accReplaceAll(list); indexAccounts(list);
  await kvSet('cloudSeeded', true);
  // the large account: corporate, a division, group engineering at Southside for Northside, an OEM working with it
  await plansPut({id: 'L1', kind: 'large', name: 'Sample Foods', sites: ['${S.a}', '${S.b}', '${S.c}'], objectives: [], actions: [], updated: 1, sitesOn: true, autoCorpChecked: true,
    parties: [{id: 'pc', kind: 'corp', name: 'Sample Foods Corporate'}, {id: 'pd', kind: 'div', name: 'Chicken division'},
      {id: 'pa', kind: 'end', name: '${S.a}', acct: '${S.a}', site: true, div: 'pd'},
      {id: 'pb', kind: 'end', name: '${S.b}', acct: '${S.b}', site: true, eng: true, engFor: ['pa'], div: 'pd'},
      {id: 'pw', kind: 'end', name: '${S.c}', acct: '${S.c}', site: true},
      {id: 'po', kind: 'oem', name: 'Sample Conveyors', belts: ['Intralox'], works: [{to: 'pb', how: 'eng', who: '', note: ''}]},
      {id: 'pq', kind: 'oem', name: 'Westside Fabrication', belts: [], works: [{to: 'pw', how: 'site', who: '', note: ''}]},
      {id: 'pi', kind: 'ilx', name: 'Intralox'}],
    people: [{id: 'c1', party: 'pc', side: 'cust', n: 'Corin Chief', title: 'Group Operations Manager', stance: 'unknown'},
      {id: 'c2', party: 'pb', side: 'cust', n: 'Eng Lead', title: 'Group Engineering Manager', stance: 'unknown'},
      {id: 'c3', party: 'pc', side: 'cust', n: 'Fin Lead', title: 'CFO', boss: '', stance: 'unknown'},
      {id: 'c4', party: 'pw', side: 'cust', n: 'West Only', title: 'Site Manager', stance: 'unknown'}],
    links: [{id: 'lk1', a: 'c1', b: 'c3', kind: 'Influences', str: 'Neutral', note: ''}]});
  await oppsPut({id: 'o1', acct: '${S.a}', name: 'Line two', ox: 435, oy: 330,
    parties: [{id: 'pe', kind: 'end', name: '${S.a}', acct: '${S.a}'}, {id: 'pi', kind: 'ilx', name: 'Intralox'}],
    people: [{id: 'x1', party: 'pe', side: 'cust', n: 'Pat Plant', title: 'Plant Engineer'}], links: [], flags: [], strengths: [], updated: 1});
  await oppsPut({id: 'o2', acct: '${S.x}', name: 'Elsewhere job', people: [], links: [], flags: [], strengths: [], updated: 1});
  await loadLists();
})()`);
await tick(100);

// ---- an opportunity elsewhere is not offered the link
g(`openOpp('o2')`); await tick(150);
ok(!$('opLapIn') && !/Large account/.test($('opPanel').textContent), 'an opportunity at a customer in no large account is not offered it');

// ---- at a site: offered, nothing brought in until asked
g(`openOpp('o1')`); await tick(150);
ok(!!$('opLapIn') && /Sample Foods/.test($('opPanel').textContent), 'at one of the sites: Bring in the large account is offered, with its name');
ok(g(`OPP.parties.length`) === 2, 'nothing comes in until asked');
$('opLapIn').click(); await tick(200);
const kinds = g(`OPP.parties.filter(q => q.lk).map(q => q.kind + ':' + opQName(q)).sort().join('|')`);
ok(kinds === 'corp:Sample Foods Corporate|div:Chicken division|end:' + S.b + '|oem:Sample Conveyors', 'corporate, the division, the site that engineers for it and its OEM come in', kinds);
ok(!/Westside/.test(kinds), 'not another site, nor an OEM that only works with another site');
ok(g(`OPP.people.filter(p => lapPersonIn(p)).map(p => p.n).sort().join()`) === 'Corin Chief,Eng Lead,Fin Lead', 'with their people');
ok(g(`OPP.links.some(l => l.lk && l.id === 'lk1')`), 'and the links between them');
ok($('opMap').querySelectorAll('.op-chain').length === 4, 'each brought-in box carries a chain on the map');
ok(d.querySelectorAll('#opBar .nm .ic').length === 4 && /Divisions/.test($('opBar').textContent), 'the list shows them with a chain, divisions included');
ok(!d.querySelector('#opBar [data-addparty="div"]'), 'but a division cannot be added to an opportunity from the list');
const pl = g(`JSON.stringify(opPartyLinks(OPP))`);
ok(pl.includes('"a":"lk-pb","b":"pe","t":"Engineers for it"') && pl.includes('"a":"lk-pd","b":"lk-pb"') && pl.includes('"a":"lk-pc","b":"lk-pd"') && pl.includes('"a":"lk-pb","b":"lk-po"'),
  'drawn as the plan has it: corporate to the division to the engineering site, which engineers for this site; the OEM off engineering', pl);
ok(/3 of its boxes|4 of its boxes/.test($('opPanel').textContent) && !!$('opLapOff'), 'the panel says how many are on the map, and offers Unlink');
await tick(300);
const stored = await g(`oppsAll()`);
const rec = stored.find(r => r.id === 'o1');
ok(rec.lap === 'L1' && rec.parties.length === 2 && rec.people.length === 1 && !rec.links.length, 'the opportunity keeps only the link, never the plan\'s boxes', JSON.stringify(rec).slice(0, 300));

// ---- a change here goes back to the plan
const corp = 'lk-pc';
g(`(() => { const p = OPP.people.find(x => x.id === 'c1'); p.stance = 'helps'; p.title = 'Chief Operating Officer'; opParty('${corp}').spec = 'unsure'; })()`);
await g(`oppSaveNow()`); await tick(100);
let L = (await g(`plansAll()`)).find(r => r.id === 'L1');
ok(L.people.find(p => p.id === 'c1').stance === 'helps' && L.people.find(p => p.id === 'c1').title === 'Chief Operating Officer', 'a change to one of its people is saved on the plan');
ok(L.parties.find(q => q.id === 'pc').spec === 'unsure', 'and its spec');
ok(L.people.find(p => p.id === 'c1').party === 'pc' && !('lk' in L.people.find(p => p.id === 'c1')), 'under the plan\'s own box, unmarked');
// add someone under corporate through the table
g(`opTableOpen('${corp}')`); await tick(50);
g(`(() => { opTbl.rows.push({id: 'nn1', n: 'New Buyer', title: 'Procurement', boss: '', code: '', stance: 'unknown'}); opTblFinish(); })()`); await tick(300);
L = (await g(`plansAll()`)).find(r => r.id === 'L1');
ok(L.people.some(p => p.n === 'New Buyer' && p.party === 'pc'), 'someone added under it here joins the plan');
ok(!(await g(`oppsAll()`)).find(r => r.id === 'o1').people.some(p => p.n === 'New Buyer'), 'and not the opportunity');
// a position is the opportunity's own
g(`(() => { const q = opParty('${corp}'); q.x = 600; q.y = 40; })()`);
await g(`oppSaveNow()`); await tick(100);
L = (await g(`plansAll()`)).find(r => r.id === 'L1');
ok(L.parties.find(q => q.id === 'pc').x == null && (await g(`oppsAll()`)).find(r => r.id === 'o1').lapPos.pc.x === 600, 'moving its box here moves it here only');

// ---- the plan's map shows it, and a change there shows here
g(`openLap('L1')`); await tick(200);
ok(g(`OPP.kind`) === 'large' && g(`OPP.people.find(p => p.id === 'c1').stance`) === 'helps' && g(`OPP.people.some(p => p.n === 'New Buyer')`), 'the large account\'s map has the change');
g(`(() => { OPP.people.find(p => p.id === 'c2').n = 'Eng Lead Renamed'; })()`);
await g(`oppSaveNow()`); await tick(100);
g(`openOpp('o1')`); await tick(200);
ok(g(`OPP.people.some(p => p.n === 'Eng Lead Renamed')`), 'back on the opportunity, a change made on the plan\'s map shows');
ok(g(`opParty('${corp}').x`) === 600, 'and its box is where it was put here');
ok(g(`OPP.people.filter(p => lapPersonIn(p)).length`) === 4, 'still four of its people, nobody twice');

// ---- removing one of its people here takes them off the plan
g(`opDropPeople(['c3'])`);
await g(`oppSaveNow()`); await tick(100);
L = (await g(`plansAll()`)).find(r => r.id === 'L1');
ok(!L.people.some(p => p.id === 'c3') && !L.links.some(l => l.id === 'lk1'), 'removing one of its people here takes them, and their links, off the plan');

// ---- a fresh copy from the cloud never reads as everyone taken off
g(`(() => { const f = JSON.parse(JSON.stringify(oppPlain(OPP))); f.updated = Date.now() + 5000; OPPS = OPPS.filter(x => x.id !== 'o1').concat([f]); oppCloudIn(); })()`); await tick(300);
L = (await g(`plansAll()`)).find(r => r.id === 'L1');
ok(L.people.some(p => p.id === 'c1') && L.people.some(p => p.id === 'c2'), 'a newer copy from the cloud leaves the plan\'s people alone');
ok(g(`OPP.parties.filter(q => q.lk).length`) === 4, 'and the boxes are brought in again on it');

// ---- the Blue Sheet reads them
g(`opSetMode('sheet')`); await tick(150);
ok(/Corin Chief/.test($('opSheet').textContent), 'the Blue Sheet lists their people');
g(`opSetMode('map')`); await tick(100);

// ---- the large account's own map is not touched by opportunities' links
ok(!g(`lapMapData(PLANS.find(p => p.id === 'L1')).people.some(p => /Corin|Eng Lead/.test(p.n))`), 'the plan\'s people are not counted again as the opportunity\'s');

// ---- unlink
g(`opSelect(null)`); await tick(50);
$('opLapOff').click(); await tick(300);
ok(g(`OPP.parties.length`) === 2 && !g(`OPP.lap`), 'Unlink takes the boxes off the map');
L = (await g(`plansAll()`)).find(r => r.id === 'L1');
ok(L.people.some(p => p.id === 'c1') && L.parties.some(q => q.id === 'pc'), 'and leaves them on the plan');
ok(!(await g(`oppsAll()`)).find(r => r.id === 'o1').lap && !!$('opLapIn'), 'it can be brought in again');

await tick(700);
ok(errs.length === 0, 'no errors', errs.join(' | '));
console.log(`PASS ${pass}` + (fail ? `  FAIL ${fail}` : ''));
process.exit(fail ? 1 : 0);
