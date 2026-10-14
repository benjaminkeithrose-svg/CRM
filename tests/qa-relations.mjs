// v140: relationships across a large account. Someone can report to a person
// in another box, the account manager covers everyone at their sites by
// default (unseen until tapped, counted only once rated, off site by site),
// and someone's relationships are listed by site, each editable in one tap.
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
  const mk = (a, sub) => ({a, sub, z: 'Z1', foc: 'High', cad: CAD['High'], mgr: 'Ben Example', rep: '', c: []});
  const list = [mk('${S.a}', 'Northside'), mk('${S.b}', 'Westside')];
  await accReplaceAll(list); indexAccounts(list);
  await kvSet('cloudSeeded', true);
  await plansPut({id: 'L1', kind: 'large', name: 'Sample Foods', sites: ['${S.a}', '${S.b}'], objectives: [], actions: [], updated: 1, sitesOn: true, autoCorpChecked: true,
    parties: [{id: 'pa', kind: 'end', name: '${S.a}', acct: '${S.a}', site: true}, {id: 'pb', kind: 'end', name: '${S.b}', acct: '${S.b}', site: true, eng: true, engFor: ['pa']},
      {id: 'pi', kind: 'ilx', name: 'Intralox'}],
    people: [{id: 'pp1', party: 'pa', side: 'cust', n: 'Pat Plant', title: 'Engineering Manager', stance: 'unknown'},
      {id: 'pp2', party: 'pa', side: 'cust', n: 'Sam Store', title: 'Purchasing', stance: 'unknown'},
      {id: 'pp3', party: 'pb', side: 'cust', n: 'Jo Group', title: 'Group Engineering Manager', stance: 'unknown'}],
    links: []});
  await loadLists();
})()`);
await tick(100);
g(`openLap('L1')`); await tick(250);
const ben = () => g(`(OPP.people.find(p => p.n === 'Ben Example') || {}).id`);

// ---- the account manager joins Intralox, and covers everyone at their sites, unseen
ok(!!ben() && g(`OPP.people.find(p => p.n === 'Ben Example').party`) === g(`OPP.parties.find(q => q.kind === 'ilx').id`), 'the sites\' account manager joins the Intralox box');
ok(g(`opImplied(OPP).length`) === 3, 'with a default link to each of the three people at their sites');
ok(g(`OPP.links.length`) === 0, 'which are not stored');
ok(![...$('opMap').querySelectorAll('.op-edge')].some(e => /not rated/.test(e.getAttribute('aria-label'))), 'nor drawn while nobody is tapped');
ok(g(`opCoverage(OPP.people.find(p => p.id === 'pp1')).length`) === 0, 'and not counted as coverage on the Blue Sheet');
g(`opSelect({t: 'p', id: '${ben()}'})`); await tick(80);
ok([...$('opMap').querySelectorAll('.op-edge')].filter(e => /not rated/.test(e.getAttribute('aria-label'))).length === 3, 'tapping them draws all three');

// v141: what is left to rate comes first, its sites open
ok(($('opPanel').querySelector('.oprtodo') || {}).textContent === '3 to rate', 'the panel says how many are left to rate');
ok([...$('opPanel').querySelectorAll('details.oprelg')].every(x => x.open), 'every site with some to rate is open');
ok($('opPanel').querySelectorAll('[data-rs][data-v="Unknown"]').length === 3, 'each row offers Unknown too');
// ---- their relationships, by site, each editable
const groups = [...$('opPanel').querySelectorAll('details.oprelg > summary')].map(s => s.textContent);
ok(groups.length === 2 && groups.some(t => t.startsWith(S.a) && / 2, 2 to rate$/.test(t)) && groups.some(t => t.startsWith(S.b) && / 1, 1 to rate$/.test(t)), 'their relationships are grouped by site, with how many', groups.join(' | '));
ok(/not rated yet/.test($('opPanel').textContent), 'marked not rated yet');
$('opPanel').querySelector('[data-rs^="im:"][data-rs$=":pp1"][data-v="Strong"]').click(); await tick(150);
ok(g(`OPP.links.some(l => l.a === '${ben()}' && l.b === 'pp1' && l.str === 'Strong' && l.kind === 'Our coverage')`), 'one tap on Strong makes it a real link');
ok(g(`opCoverage(OPP.people.find(p => p.id === 'pp1'))[0].str`) === 'Strong', 'which now counts as coverage');
ok(g(`opImplied(OPP).length`) === 2, 'and is no longer a default');
const real = g(`OPP.links.find(l => l.b === 'pp1').id`);
$('opPanel').querySelector('details.oprelg').open = true;
$('opPanel').querySelector('[data-rl="' + real + '"]').click(); await tick(80);
ok(/Link/.test($('opPanel').textContent) && !!$('opLback') && /Back to Ben Example/.test($('opLback').textContent), 'tapping a name opens that link, with Back to them');
d.querySelector('#opPanel [data-opchips="kind"] [data-v="Influences"]').click(); await tick(80);
ok(g(`OPP.links.find(l => l.id === '${real}').kind`) === 'Influences' && !!$('opLback'), 'it can be changed there, and Back stays');
$('opLback').click(); await tick(80);
ok(g(`opSel.t`) === 'p' && g(`opSel.id`) === ben(), 'Back returns to their relationships');
// an implied one opened from the list
const im = $('opPanel').querySelector('[data-rl^="im:"]');
im.click(); await tick(80);
ok(/not counted on the Blue Sheet until you rate it/.test($('opPanel').textContent), 'a default one opened says it is not counted until rated');
$('opSg').querySelector('[data-v="Weak"]').click(); await tick(120);
ok(g(`OPP.links.filter(l => l.a === '${ben()}').length`) === 2 && !!$('opLback'), 'rating it there makes it real, and Back is still offered');

// v141: Unknown - linked, strength not known: dotted, a gap, not coverage
g(`opSelect({t: 'p', id: '${ben()}'})`); await tick(80);
ok(/1 to rate/.test($('opPanel').querySelector('.oprtodo').textContent), 'one left to rate');
const left = $('opPanel').querySelector('[data-rs^="im:"][data-v="Unknown"]');
const leftP = left.dataset.rs.split(':')[2];
left.click(); await tick(120);
const ul = g(`OPP.links.find(l => l.b === '${leftP}')`);
ok(ul && ul.str === 'Unknown' && ul.kind === 'Our coverage', 'Unknown makes it a link of unknown strength');
ok(g(`opCoverage(OPP.people.find(p => p.id === '${leftP}')).length`) === 0, 'which is not coverage');
const who = g(`OPP.people.find(p => p.id === '${leftP}').n`);
ok(g(`opGaps().some(x => x.t === "Ben Example's relationship with ${who} is unknown")`), 'and is a gap on the Blue Sheet', g(`JSON.stringify(opGaps().map(x => x.t))`));
ok(/1 to rate/.test($('opPanel').querySelector('.oprtodo').textContent) && /strength unknown/.test($('opPanel').textContent), 'it stays on the list to rate, marked strength unknown');
ok([...$('opMap').querySelectorAll('.op-edge path.vis')].some(v => v.getAttribute('stroke-dasharray') === '2 5'), 'drawn dotted');

// ---- someone reports to a person at another site
g(`opSelect({t: 'p', id: 'pp1'})`); await tick(80);
const sel = $('opPboss');
ok(!!sel && [...sel.querySelectorAll('optgroup')].some(o => o.label === S.b) && !!sel.querySelector('option[value="x:pp3"]'), 'Reports to offers people at the other sites, by site');
sel.value = 'x:pp3'; sel.dispatchEvent(new w.Event('change')); await tick(120);
ok(g(`OPP.links.some(l => l.kind === 'Reports to' && l.a === 'pp1' && l.b === 'pp3')`) && g(`OPP.people.find(p => p.id === 'pp1').party`) === 'pa', 'it is a Reports to link across; they stay under their own site');
ok($('opPboss').value === 'x:pp3', 'and shows as their manager');
ok([...$('opPanel').querySelectorAll('details.oprelg > summary')].some(s => s.textContent.startsWith(S.b)), 'and in their relationships, under the other site');
// in the table, the same choice
g(`opTableOpen('pa')`); await tick(60);
const row = g(`opTbl.rows.find(r => r.id === 'pp1').boss`);
ok(row === 'x:pp3', 'the people table shows it', row);
ok(!!$('otBody').querySelector('select[data-k="boss"] option[value="x:pp3"]'), 'and offers the other sites');
g(`(() => { opTbl.rows.find(r => r.id === 'pp1').boss = 'pp2'; opTblFinish(); })()`); await tick(120);
ok(g(`OPP.people.find(p => p.id === 'pp1').boss`) === 'pp2' && !g(`OPP.links.some(l => l.kind === 'Reports to' && l.a === 'pp1')`), 'changing it to someone at the same site takes the line across away');
g(`opTableOpen('pa')`); await tick(60);
g(`(() => { opTbl.rows.find(r => r.id === 'pp2').boss = 'x:pp3'; opTblFinish(); })()`); await tick(120);
ok(g(`OPP.links.some(l => l.kind === 'Reports to' && l.a === 'pp2' && l.b === 'pp3')`), 'and the table can set one');

// ---- switched off for one site
g(`opSelect({t: 'party', id: 'pb'})`); await tick(80);
ok(!!$('opQam') && $('opQam').checked && /Ben Example, the account manager, covers everyone here/.test($('opPanel').textContent), 'a site says its account manager covers everyone, ticked');
$('opQam').checked = false; $('opQam').dispatchEvent(new w.Event('change')); await tick(120);
ok(g(`OPP.parties.find(q => q.id === 'pb').amOff`) === true && !g(`opImplied(OPP).some(l => l.b === 'pp3')`), 'untick it and that site has no default links');

// ---- taken off, stays off
g(`opDropPeople(['${ben()}'])`); await g(`oppSaveNow()`);
g(`renderOpp()`); await tick(150);
ok(!ben(), 'an account manager taken off the map does not come back by itself');
await tick(300);
const L = (await g(`plansAll()`)).find(r => r.id === 'L1');
ok((L.amGone || []).includes('ben example') && L.parties.find(q => q.id === 'pb').amOff, 'remembered on the plan');

await tick(700);
ok(errs.length === 0, 'no errors', errs.join(' | '));
console.log(`PASS ${pass}` + (fail ? `  FAIL ${fail}` : ''));
process.exit(fail ? 1 : 0);
