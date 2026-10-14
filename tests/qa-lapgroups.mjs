// v136: a large account's structure. Sites are added with + beside Sites; a
// site can be where group engineering sits and say which sites it engineers
// for (with a tick-a-state shortcut); divisions with their own engineering;
// group functions report to the top or a division; an OEM says which boxes it
// works with and how; the map lays engineering above the sites it serves.
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
// sites in VIC (Z7, Z8), QLD (Z13, Z15) and TAS (Z24)
const S = { a: 'Sample Meats - Brooklyn', b: 'Sample Meats - Warragul', c: 'Sample Meats - Dinmore', e: 'Sample Meats - Biloela', f: 'Sample Meats - Longford', n: 'Sample Meats - Wacol' };
await g(`(async () => {
  const mk = (a, sub, z) => ({a, sub, z, foc: 'High', cad: CAD['High'], mgr: 'Ben', rep: '', c: []});
  const list = [mk('${S.a}', 'Brooklyn', 'Z7'), mk('${S.b}', 'Warragul', 'Z8'), mk('${S.c}', 'Dinmore', 'Z13'), mk('${S.e}', 'Biloela', 'Z15'), mk('${S.f}', 'Longford', 'Z24'), mk('${S.n}', 'Wacol', 'Z13')];
  await accReplaceAll(list); indexAccounts(list);
  await kvSet('cloudSeeded', true);
  await plansPut({id: 'L1', kind: 'large', name: 'Sample Meats', sites: ['${S.a}', '${S.b}', '${S.c}', '${S.e}', '${S.f}'], objectives: [], actions: [], updated: 1});
  await loadLists();
})()`);
g(`openLap('L1')`); await tick(200);
const id = acct => g(`(OPP.parties.find(q => q.acct === '${acct}') || {}).id`);
const panel = () => $('opPanel');
const links = () => g(`JSON.stringify(opPartyLinks(OPP))`);
const has = (a, b) => new RegExp('"a":"' + a + '","b":"' + b + '"').test(links());

// ---- 1. + beside Sites adds one to the plan ----
const plus = d.querySelector('#opBar [data-addsite]');
ok(!!plus, 'Sites has a + in the list');
plus.click(); await tick();
ok(!!$('opNewSite'), 'it asks which customer');
$('opNewSite').value = S.n; $('opNewSiteGo').click(); await tick(150);
ok(g(`OPP.sites.includes('${S.n}')`) && !!id(S.n), 'the site joins the plan and gets its box');
ok(g(`PLANS.find(p => p.id === 'L1').sites.includes('${S.n}')`), 'and the plan is saved with it');
plus.isConnected; d.querySelector('#opBar [data-addsite]').click(); await tick();
$('opNewSite').value = 'Not a customer'; $('opNewSiteGo').click(); await tick();
ok(g(`OPP.sites.length`) === 6, 'something not in the customer list is refused');

// ---- 2. group engineering at a site, and the sites it engineers for ----
g(`opSelect({t: 'party', id: '${id(S.a)}'})`); await tick();
const hq = $('opQhq'), eng = $('opQeng');
ok(!!eng && hq.compareDocumentPosition(eng) & w.Node.DOCUMENT_POSITION_FOLLOWING, 'Group engineering here sits under Head office here');
eng.checked = true; eng.dispatchEvent(new w.Event('change')); await tick();
ok(g(`OPP.parties.find(q => q.id === '${id(S.a)}').eng`) === true && !!$('opQengFor'), 'ticked, it asks which sites it engineers for');
ok(/Group engineering/.test($('opMap').textContent), 'its box says Group engineering');
$('opQengFor').querySelector('[data-v="' + id(S.b) + '"]').click(); await tick();
ok(has(id(S.a), id(S.b)), 'a line runs from it to the site it engineers for');
// a second engineering site, its sites ticked by state
g(`opSelect({t: 'party', id: '${id(S.c)}'})`); await tick();
$('opQeng').checked = true; $('opQeng').dispatchEvent(new w.Event('change')); await tick();
const qld = $('opQengSt') && $('opQengSt').querySelector('[data-st="QLD"]');
ok(!!qld, 'the sites can be ticked a state at a time');
qld.click(); await tick();
ok(g(`OPP.parties.find(q => q.id === '${id(S.c)}').engFor.sort().join()`) === [id(S.e), id(S.n)].sort().join(), 'QLD ticks every QLD site but itself', g(`OPP.parties.find(q => q.id === '${id(S.c)}').engFor.join()`));

// ---- 3. corporate, a division and its engineering ----
g(`opAddParty('corp', 'Sample Meats Corporate')`); await tick();
const corp = g(`OPP.parties.find(q => q.kind === 'corp').id`);
ok(has(corp, id(S.f)) && !has(corp, id(S.b)) && !has(corp, id(S.e)), 'a site nobody engineers for hangs from corporate; the others hang from their engineering');
g(`opAddParty('div', 'Pork division')`); await tick();
const div = g(`OPP.parties.find(q => q.kind === 'div').id`);
ok(has(corp, div), 'a division reports to corporate');
g(`opSelect({t: 'party', id: '${id(S.f)}'})`); await tick();
ok(!!$('opQdiv'), 'a site can be put in a division');
$('opQdiv').value = div; $('opQdiv').dispatchEvent(new w.Event('change')); await tick();
ok(has(div, id(S.f)) && !has(corp, id(S.f)), 'the site now hangs from its division');
g(`opAddParty('grp', 'Pork engineering')`); await tick();
const grp = g(`OPP.parties.find(q => q.kind === 'grp').id`);
ok(!!$('opQunder'), 'a group function says who it reports to');
$('opQunder').value = div; $('opQunder').dispatchEvent(new w.Event('change')); await tick();
ok(has(div, grp) && has(grp, id(S.f)) && !has(div, id(S.f)), 'under the division, it covers the division\'s sites');
ok(!has(grp, id(S.a)) && !has(grp, id(S.c)), 'and none of the other divisions\'');
ok(/All its division's sites/.test(panel().textContent), 'its Covers says so');

// ---- 4. the layout: engineering above the sites it serves ----
const pos = g(`JSON.stringify(opLayout())`), P = JSON.parse(pos);
const at = acct => P[id(acct)];
ok(at(S.b).x === at(S.a).x && at(S.b).y > at(S.a).y, 'a site sits under the engineering that serves it');
ok(at(S.e).y > at(S.c).y && at(S.c).x !== at(S.a).x, 'each engineering site has its own column');
ok(P[grp].y < at(S.f).y && P[div].y < P[grp].y && P[corp].y < P[div].y, 'corporate, then the division, then its engineering, then its site');

// ---- 5. an OEM says who it works with, and how ----
g(`opAddParty('oem', 'Sample Conveyors')`); await tick();
const oem = g(`OPP.parties.find(q => q.kind === 'oem').id`);
ok(!!panel().querySelector('[data-wk="' + id(S.a) + '"]'), 'an OEM\'s panel lists who it can work with');
const wk = panel().querySelector('[data-wk="' + id(S.a) + '"]');
wk.checked = true; wk.dispatchEvent(new w.Event('change')); await tick();
panel().querySelector('[data-wkhow="' + id(S.a) + '"] [data-v="eng"]').click(); await tick();
ok(/"a":"[^"]+","b":"/.test(links()) && JSON.parse(links()).some(l => l.a === id(S.a) && l.b === oem && l.t === 'Group engineering'), 'the line to it says Group engineering');
await g(`(async () => { OPP.people.push({id: 'pz', party: '${id(S.c)}', side: 'cust', n: 'Robin Maint', title: 'Maintenance Manager'}); })()`);
g(`opSelect({t: 'party', id: '${oem}'})`); await tick();
const wk2 = panel().querySelector('[data-wk="' + id(S.c) + '"]');
wk2.checked = true; wk2.dispatchEvent(new w.Event('change')); await tick();
panel().querySelector('[data-wkhow="' + id(S.c) + '"] [data-v="person"]').click(); await tick();
const who = panel().querySelector('[data-wkwho="' + id(S.c) + '"]');
ok(!!who && /Robin Maint/.test(who.textContent), 'A person offers that site\'s people');
who.value = 'pz'; who.dispatchEvent(new w.Event('change')); await tick();
ok(JSON.parse(links()).some(l => l.a === id(S.c) && l.b === oem && l.t === 'Robin Maint'), 'the line is labelled with the person');
const note = panel().querySelector('[data-wknote="' + id(S.c) + '"]');
note.value = 'Weekly site walk'; note.dispatchEvent(new w.Event('input')); await tick(800);
ok(g(`OPP.parties.find(q => q.id === '${oem}').works.find(x => x.to === '${id(S.c)}').note`) === 'Weekly site walk', 'and how it works is kept');
ok(!JSON.parse(links()).some(l => l.b === oem && (l.t === 'Direct' || l.t === 'Subcontracts')), 'no guessed Direct line once its links are set');

// ---- 6. taking things out leaves nothing pointing at them ----
g(`opSelect({t: 'party', id: '${div}'})`); await tick();
$('opQrm').click(); await tick(); $('opQrmY').click(); await tick(100);
ok(!g(`OPP.parties.some(q => q.div === '${div}' || q.under === '${div}')`), 'removing a division clears it from its sites and functions');
g(`opSelect({t: 'party', id: '${id(S.b)}'})`); await tick();
ok(!!$('opQout'), 'a site can be taken out from its panel');
const bId = id(S.b);
$('opQout').click(); await tick(150);
ok(!g(`OPP.sites.includes('${S.b}')`) && !g(`PLANS.find(p => p.id === 'L1').sites.includes('${S.b}')`), 'taken out of the plan');
ok(!g(`OPP.parties.find(q => q.id === '${id(S.a)}').engFor.includes('${bId}')`), 'and out of the engineering site\'s list');

// ---- 7. an ordinary opportunity map has no divisions or + for sites ----
await g(`(async () => { await oppsPut({id: 'o1', acct: '${S.a}', name: 'Line 3', people: [], links: [], flags: [], strengths: [], updated: 1}); await loadLists(); })()`);
g(`openOpp('o1')`); await tick(200);
ok(!d.querySelector('#opBar [data-addparty="div"]') && !d.querySelector('#opBar [data-addsite]'), 'an opportunity map has no divisions and no site +');

ok(errs.length === 0, 'no errors', errs.join(' | '));
console.log(`PASS ${pass}` + (fail ? `  FAIL ${fail}` : ''));
process.exit(fail ? 1 : 0);
