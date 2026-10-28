// v145: clear actions on each person. Hide: not relevant (kept, not drawn,
// rated or on the Blue Sheet, shown again from their box); Moved site (the
// contact dialog, for CAG); Left the company (asks, off the map, on the CAG
// list to remove from Dynamics). OEMs and contractors that are customers
// fill from the CRM; a typed box can be matched to a customer; Known by makes
// one of ours' relationship with someone in one tap.
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
const S = { a: 'Sample Foods - Northside', b: 'Sample Foods - Westside', o: 'Sample Conveyors' };
await g(`(async () => {
  const C = (n, t, id) => ({n, t, r: '', p: '', e: [], id});
  const mk = (a, sub, c) => ({a, sub, z: 'Z1', foc: 'High', cad: CAD['High'], mgr: 'Ben Example', rep: '', c});
  const list = [mk('${S.a}', 'Northside', [C('Pat Plant', 'Engineering Manager', 'c-1'), C('Rae Desk', 'Receptionist', 'c-2'), C('Mark Mover', 'Production Manager', 'c-3'), C('Lou Gone', 'Buyer', 'c-5')]),
    mk('${S.b}', 'Westside', [C('Jo Group', 'Group Engineering Manager', 'c-4')]),
    mk('${S.o}', 'Conveyors', [C('Owen Owner', 'Owner', 'c-7'), C('Ed Eng', 'Engineer', 'c-8')]), mk('Builders Co', 'Builders', [C('Bo Build', 'Project Manager', 'c-9')])];
  await accReplaceAll(list); indexAccounts(list);
  await kvSet('cloudSeeded', true);
  await plansPut({id: 'L1', kind: 'large', name: 'Sample Foods', sites: ['${S.a}', '${S.b}'], objectives: [], actions: [], updated: 1, sitesOn: true, autoCorpChecked: true,
    parties: [{id: 'pa', kind: 'end', name: '${S.a}', acct: '${S.a}', site: true}, {id: 'pb', kind: 'end', name: '${S.b}', acct: '${S.b}', site: true},
      {id: 'po', kind: 'oem', name: '${S.o}', acct: '${S.o}', belts: []}, {id: 'ph', kind: 'head', name: 'Typed Builders', status: 'Bidding'}, {id: 'pi', kind: 'ilx', name: 'Intralox'}],
    people: [], links: []});
  await loadLists();
})()`);
await tick(100);
g(`openLap('L1')`); await tick(250);
const P = n => g(`OPP.people.find(p => p.n === '${n}')`);

// ---- OEMs fill from the CRM like sites
ok(g(`OPP.people.filter(p => p.party === 'po').map(p => p.n + ':' + p.side).sort().join()`) === 'Ed Eng:oem,Owen Owner:oem', 'an OEM that is a customer fills with its contacts, as OEM people');
ok(g(`OPP.parties.find(q => q.id === 'po').show`) === false, 'listed, off the map until its eye');

// ---- a typed box matched to a customer
g(`opSelect({t: 'party', id: 'ph'})`); await tick(80);
ok(!!$('opQmatch'), 'a box typed by name offers Match to a customer');
$('opQmatch').value = 'Nowhere Pty'; $('opQmatchGo').click(); await tick(80);
ok(!g(`OPP.parties.find(q => q.id === 'ph').acct`), 'only an account on the list is matched');
$('opQmatch').value = 'Builders Co'; $('opQmatchGo').click(); await tick(150);
ok(g(`OPP.parties.find(q => q.id === 'ph').acct`) === 'Builders Co' && g(`OPP.people.filter(p => p.party === 'ph').map(p => p.n + ':' + p.side).join()`) === 'Bo Build:head' && /Matched to Builders Co/.test($('opPanel').textContent), 'matched, its contacts come in, as the contractor\'s people');

// ---- the site's People: three clear actions each
g(`opSelect({t: 'party', id: 'pa'})`); await tick(80);
const row = n => [...$('opPanel').querySelectorAll('.oppl li')].find(li => li.querySelector('[data-qp]') && li.querySelector('[data-qp]').textContent === n);
ok(row('Rae Desk') && /Hide: not relevant/.test(row('Rae Desk').textContent) && /Moved site/.test(row('Rae Desk').textContent) && /Left the company/.test(row('Rae Desk').textContent), 'each person has Hide: not relevant, Moved site and Left the company');
row('Rae Desk').querySelector('[data-phide]').click(); await tick(120);
ok(P('Rae Desk').hidden && !row('Rae Desk'), 'Hide: not relevant takes them out of the list');
ok(/Hidden: not relevant \(1\)/.test($('opPanel').textContent), 'into a Hidden list on the site');
ok(!g(`opTheirs().some(p => p.n === 'Rae Desk')`) && !g(`bsPeople(OPP).some(p => p.n === 'Rae Desk')`), 'not on the Blue Sheet either');
ok(!g(`CHG.length`), 'nothing goes to CAG');
$('opPanel').querySelector('[data-pshow]').click(); await tick(120);
ok(!P('Rae Desk').hidden && !!row('Rae Desk'), 'Show again brings them back');

// Moved site
row('Mark Mover').querySelector('[data-pmove]').click(); await tick(80);
ok($('ctdlg').hasAttribute('open') && /moved site/.test($('ctHead').textContent), 'Moved site opens the contact, asking where they are now');
$('ctTo').value = S.b; $('ctOk').click(); await tick(200);
ok(P('Mark Mover').party === 'pb' && g(`CHG.some(r => r.type === 'move' && r.n === 'Mark Mover' && r.to === '${S.b}')`), 'they move to the other site on the map, and the move goes to CAG');

// Left the company
g(`opSelect({t: 'party', id: 'pa'})`); await tick(80);
let msg = ''; w.confirm = m => { msg = m; return false; };
row('Lou Gone').querySelector('[data-pleft]').click(); await tick(120);
ok(/Lou Gone has left Sample Foods - Northside\?/.test(msg) && /list for CAG to remove from Dynamics/.test(msg) && !!P('Lou Gone'), 'Left the company asks first, saying what happens; Cancel keeps them');
w.confirm = () => true;
row('Lou Gone').querySelector('[data-pleft]').click(); await tick(200);
ok(!P('Lou Gone') && g(`CHG.some(r => r.type === 'left' && r.n === 'Lou Gone' && r.cid === 'c-5')`), 'OK takes them off the map, on the list for CAG');
ok(g(`ACC_BY_NAME.get('${S.a}').c.find(c => c.n === 'Lou Gone').left`) && !g(`opPartySuggest(OPP.parties.find(q => q.id === 'pa')).some(x => x.n === 'Lou Gone')`), 'the contact list says they left, and they are not offered again');
g(`renderOpp()`); await tick(150);
ok(!P('Lou Gone'), 'and the next fill does not bring them back');

// ---- the person's own panel
g(`opSelect({t: 'p', id: '${P('Pat Plant').id}'})`); await tick(80);
ok(!!$('opCtChg') && !!$('opPmv') && !!$('opPhide') && !!$('opPleft') && /Take off this map/.test($('opRm').textContent), 'a person\'s panel has the same actions, and Take off this map for mistakes');

// ---- Known by
const ben = g(`OPP.people.find(p => p.n === 'Ben Example').id`);
g(`opSelect({t: 'p', id: '${P('Owen Owner').id}'})`); await tick(80);
const kb = $('opPanel').querySelector('[data-kb="' + ben + '"]');
ok(!!kb && !kb.classList.contains('on'), 'Known by lists our people on the map');
kb.click(); await tick(120);
ok(g(`OPP.links.some(l => l.a === '${ben}' && l.b === '${P('Owen Owner').id}' && l.kind === 'Our coverage' && l.str === 'Unknown')`), 'one tap makes the relationship, strength Unknown');
ok($('opPanel').querySelector('[data-kb="' + ben + '"]').classList.contains('on') && /1 to rate/.test($('opPanel').textContent), 'shown as known, and left to rate');
$('opPanel').querySelector('[data-kb="' + ben + '"]').click(); await tick(80);
ok(g(`opSel.t`) === 'l' && !!$('opLback'), 'tapping it again opens that relationship, with Back');

// ---- CAG list
g(`showScreen('settings')`); await tick(80);
ok(/1 left the company/.test($('pplStat').textContent), 'Settings counts who left: ' + $('pplStat').textContent);
let sent = null; w.deliverFile = async (blob, name) => { sent = {blob, name}; };
$('pplShare').click(); await tick(400);
const wb = w.XLSX.read(new Uint8Array(await sent.blob.arrayBuffer()), {type: 'array'});
const lr = w.XLSX.utils.sheet_to_json(wb.Sheets['Left the company'], {header: 1});
ok(lr[0][0] === '(Do Not Modify) Contact' && lr[1][0] === 'c-5' && lr[1][1] === 'Lou Gone' && lr[1][2] === S.a, 'a Left the company sheet, with their Dynamics id');
g(`(() => { const a = ACC_BY_NAME.get('${S.a}'); a.c = a.c.filter(c => c.n !== 'Lou Gone'); peopleMerge(); })()`); await tick(150);
ok(g(`CHG.find(r => r.type === 'left').done`) > 0, 'done once the export no longer has them');

await tick(700);
ok(errs.length === 0, 'no errors', errs.join(' | '));
console.log(`PASS ${pass}` + (fail ? `  FAIL ${fail}` : ''));
process.exit(fail ? 1 : 0);
