// v151: how relationships flow. A consultant works with the end user and the
// OEMs and knows us; an OEM can sell through a head contractor or another
// OEM or integrator (a chain), and work with others directly; head
// contractors on a large account pick their sites; an OEM that is one of our
// customers is covered by its account manager by default; the Blue Sheet
// flags anyone with a part in the decision whom nobody of ours covers.
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
const A = 'Sample Foods - Northside', B = 'Sample Foods - Westside', CB = 'Sample Conveyors';
await g(`(async () => {
  const C = (n, t, id) => ({n, t, r: '', p: '', e: [], id});
  const mk = (a, sub, mgr, c) => ({a, sub, z: 'Z1', foc: 'High', cad: CAD['High'], mgr, rep: '', c});
  const list = [mk('${A}', 'Northside', 'Ben Example', []), mk('${B}', 'Westside', 'Ben Example', []), mk('${CB}', 'Conveyors', 'Pat Other', [C('Bo Builder', 'Design Engineer', 'c-1')])];
  await accReplaceAll(list); indexAccounts(list);
  await kvSet('cloudSeeded', true);
  await oppsPut({id: 'o1', acct: '${A}', name: 'Line two', ox: 435, oy: 330, flags: [], strengths: [], links: [], updated: 1, lapOff: true,
    parties: [{id: 'pe', kind: 'end', name: '${A}', acct: '${A}'}, {id: 'ph', kind: 'head', name: 'Big Builders', status: 'Appointed'},
      {id: 'pg', kind: 'oem', name: 'Line Integrator', via: 'ph', belts: []}, {id: 'pb', kind: 'oem', name: '${CB}', acct: '${CB}', belts: []},
      {id: 'pc', kind: 'cons', name: 'Design Consultants'}, {id: 'pi', kind: 'ilx', name: 'Intralox'}],
    people: [{id: 'x1', party: 'pe', side: 'cust', n: 'Pat Plant', title: 'Engineering Manager'},
      {id: 'x2', party: 'pc', side: 'cons', n: 'Cass Consult', title: 'Lead Engineer', role: 'Checks the spec'},
      {id: 'x3', party: 'pb', side: 'oem', n: 'Bo Builder', title: 'Design Engineer', cid: 'c-1'}]});
  await loadLists();
})()`);
await tick(100);
g(`openOpp('o1')`); await tick(250);

// ---- consultants
ok(g(`opKind('cons').t`) === 'Consultants' && /Consultants/.test($('opBar').textContent) && !!d.querySelector('#opBar [data-addparty="cons"]'), 'Consultants have their own section in the list, with +');
ok(g(`OPP.people.find(p => p.id === 'x2').side`) === 'cons' && g(`OPP.people.find(p => p.id === 'x2').org`) === 'Design Consultants', 'their people are the consultant\'s');
g(`opSelect({t: 'party', id: 'pc'})`); await tick(80);
ok(!!$('opPanel').querySelector('[data-wk="pe"]') && !!$('opPanel').querySelector('[data-wk="pb"]') && !!$('opPanel').querySelector('[data-wk="ph"]'), 'a consultant ticks who they work with: the end user, OEMs, contractors');
$('opPanel').querySelector('[data-wk="pe"]').checked = true; $('opPanel').querySelector('[data-wk="pe"]').dispatchEvent(new w.Event('change')); await tick(60);
ok(/Specifies for/.test($('opPanel').querySelector('[data-wkhow="pe"]').textContent) && /Advises/.test($('opPanel').querySelector('[data-wkhow="pe"]').textContent), 'how includes Specifies for and Advises');
$('opPanel').querySelector('[data-wkhow="pe"] [data-v="spec"]').click(); await tick(60);
$('opPanel').querySelector('[data-wk="pb"]').checked = true; $('opPanel').querySelector('[data-wk="pb"]').dispatchEvent(new w.Event('change')); await tick(60);
$('opPanel').querySelector('[data-wkhow="pb"] [data-v="adv"]').click(); await tick(60);
let pl = g(`JSON.stringify(opPartyLinks(OPP))`);
ok(pl.includes('"a":"pe","b":"pc","t":"Specifies for"') && pl.includes('"a":"pb","b":"pc","t":"Advises"'), 'drawn to each, labelled how', pl);

// ---- an OEM through a head contractor, and an OEM through an integrator
ok(pl.includes('"a":"ph","b":"pg","t":"Subcontracts"'), 'an integrator selling through the head contractor is drawn from it');
g(`opSelect({t: 'party', id: 'pb'})`); await tick(80);
ok(!!$('opQvia').querySelector('option[value="pg"]') && /Line Integrator \(OEM or integrator\)/.test($('opQvia').textContent), 'an OEM can work for an integrator, not only a head contractor');
$('opQvia').value = 'pg'; $('opQvia').dispatchEvent(new w.Event('change')); await tick(80);
pl = g(`JSON.stringify(opPartyLinks(OPP))`);
ok(pl.includes('"a":"pg","b":"pb","t":"Subcontracts"'), 'the chain is drawn: head contractor, integrator, conveyor builder');
g(`opSelect({t: 'party', id: 'pg'})`); await tick(80);
ok(!$('opQvia').querySelector('option[value="pb"]'), 'and cannot loop back on itself');

// ---- an OEM that is one of our customers: its account manager covers its people by default
g(`renderOpp()`); await tick(200);
ok(g(`OPP.people.some(p => p.n === 'Pat Other' && p.side === 'us')`) && g(`opImplied(OPP).some(l => l.b === 'x3' && OPP.people.find(p => p.id === l.a).n === 'Pat Other')`), 'the OEM\'s account manager joins Intralox, covering its people by default');
g(`opSelect({t: 'party', id: 'pb'})`); await tick(80);
ok(/Pat Other, the account manager, covers everyone here/.test($('opPanel').textContent) && /Account manager/.test($('opPanel').textContent), 'which the OEM\'s box says, with Change');

// ---- the Blue Sheet: anyone with a part in the decision, covered or not
ok(g(`opGaps().some(x => x.t === 'Cass Consult is not covered by anyone on our team')`), 'a consultant who checks the spec, whom nobody of ours covers, is a gap', g(`JSON.stringify(opGaps().map(x => x.t))`));
ok(g(`bsPeople(OPP).some(p => p.n === 'Cass Consult')`), 'and is on the Blue Sheet');

// ---- a large account: a head contractor at its sites; an OEM via the head contractor and at a site
await g(`(async () => {
  await plansPut({id: 'L1', kind: 'large', name: 'Sample Foods', sites: ['${A}', '${B}'], objectives: [], actions: [], updated: 1, sitesOn: true, autoCorpChecked: true,
    parties: [{id: 'sa', kind: 'end', name: '${A}', acct: '${A}', site: true}, {id: 'sb', kind: 'end', name: '${B}', acct: '${B}', site: true},
      {id: 'hh', kind: 'head', name: 'Big Builders', status: 'Appointed', works: [{to: 'sb', how: 'site', who: '', note: ''}]},
      {id: 'oo', kind: 'oem', name: 'Line Integrator', via: 'hh', works: [{to: 'sb', how: 'eng', who: '', note: ''}], belts: []},
      {id: 'cc', kind: 'cons', name: 'Design Consultants', works: [{to: 'sa', how: 'spec', who: '', note: ''}]}, {id: 'pi', kind: 'ilx', name: 'Intralox'}],
    people: [], links: []});
  await loadLists();
})()`);
g(`openLap('L1')`); await tick(250);
const ll = g(`JSON.stringify(opPartyLinks(OPP))`);
ok(ll.includes('"a":"sb","b":"hh"') && !ll.includes('"a":"sa","b":"hh"'), 'a head contractor hangs from the site it works at, not the first one', ll);
ok(ll.includes('"a":"sb","b":"oo","t":"Group engineering"') && ll.includes('"a":"hh","b":"oo","t":"Subcontracts"'), 'an OEM shows both: the site it works with and the head contractor it sells through');
ok(ll.includes('"a":"sa","b":"cc","t":"Specifies for"'), 'and a consultant the site it specifies for');
g(`opSelect({t: 'party', id: 'hh'})`); await tick(80);
ok(!!$('opPanel').querySelector('[data-wk="sa"]') && !!$('opPanel').querySelector('[data-wk="sb"]'), 'a head contractor\'s panel ticks its sites');
ok(g(`[...lapScope(PLANS.find(p => p.id === 'L1'), '${A}').ids].includes('cc')`), 'a consultant over a site comes in with the large account on its Blue Sheets');

await tick(900);
ok(errs.length === 0, 'no errors', errs.join(' | '));
console.log(`PASS ${pass}` + (fail ? `  FAIL ${fail}` : ''));
process.exit(fail ? 1 : 0);
