// v117: the large account plan. One plan across a customer's sites: the tick
// on a site's account plan starts it (sites grouped by the export's group
// column, else by the name before " - "), or joins one another site started,
// or takes the site out. The card on each site; the screen's sections saved
// and synced; the open opportunities and the relationship map read from the
// sites' opportunities; the document; delete. The import picks up a group
// column whatever it is called.
import { JSDOM } from 'jsdom';
import fs from 'fs';
import 'fake-indexeddb/auto';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  x ' + m); } };
const tick = (ms = 50) => new Promise(r => setTimeout(r, ms));
const errs = [];
let confirms = [], confirmAnswer = true;
const dom = new JSDOM(fs.readFileSync('index.html', 'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g, ''),
  { runScripts: 'dangerously', url: 'https://example.org/' });
const w = dom.window, d = w.document;
w.indexedDB = indexedDB; w.IDBKeyRange = IDBKeyRange; w.Blob = Blob;
w.scrollTo = () => {}; w.alert = () => {}; w.confirm = m => { confirms.push(m); return confirmAnswer; };
w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
w.navigator.storage = { persist: async () => true, persisted: async () => true };
w.URL.createObjectURL = () => 'blob:stub'; w.URL.revokeObjectURL = () => {};
w.open = () => ({ document: {} });
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
const toast = () => $('toast').textContent;
const body = () => $('lapBody').textContent;

// ---- the import keeps a group column, whatever it is called
const built = g(`buildAccounts([
  {'Account Name': 'Acme Group - Site A', 'Full Name': 'A One', 'Parent Account': 'ACME HOLDINGS'},
  {'Account Name': 'Acme Group - Site B', 'Full Name': 'B One', 'Parent Account': 'ACME HOLDINGS'},
  {'Account Name': 'Other - Site C', 'Full Name': 'C One'}])`);
ok(built.find(a => a.a === 'Acme Group - Site A').grp === 'ACME HOLDINGS' && built.find(a => a.a === 'Other - Site C').grp === '', 'a Parent Account column is kept as the group');
ok(g(`buildAccounts([{'Account Name': 'X - Y', 'Full Name': 'Z', 'Group Code (Account)': 'G42'}])`)[0].grp === 'G42', 'so is a Group Code column');

const A = 'Example Meats - Dandenong', B = 'Example Meats - Bendigo', C = 'Other Foods - Ringwood', D = 'Coded Site - Geelong';
await g(`(async () => {
  const mk = (a, grp) => ({a, sub: a.split(' - ')[1], z: 'Z1', foc: 'High', cad: CAD['High'], mgr: 'Ben', rep: '', grp: grp || '', c: [{n: 'Tom Ward', r: 'Operations Manager', t: '', p: '', pk: '', e: []}]});
  const list = [mk('${A}'), mk('${B}'), mk('${C}'), mk('${D}', 'EXAMPLE MEATS PTY'), mk('Plain Co - Mildura', 'EXAMPLE MEATS PTY')];
  await accReplaceAll(list); indexAccounts(list);
  await oppsPut({id: 'o1', acct: '${A}', name: 'Line 3 upgrade', value: 'AUD 180k', close: '2027-03', pos: 2, ox: 460, oy: 60,
    people: [{id: 'a', side: 'cust', n: 'Tom Ward', title: 'Operations Manager', role: 'Signs the order', rate: 1, x: 90, y: 90}, {id: 'e', side: 'us', n: 'Ben', x: 860, y: 200}],
    links: [{id: 'l1', a: 'e', b: 'a', kind: 'Our coverage', str: 'Weak'}], flags: [], strengths: [], updated: 1});
  await oppsPut({id: 'o2', acct: '${B}', name: 'Spiral freezer belts', value: 'AUD 90k', close: '2026-12', ox: 460, oy: 60,
    people: [{id: 'x', side: 'cust', n: 'Tom Ward', title: 'Operations Manager', rate: 1, x: 90, y: 90}, {id: 'y', side: 'cust', n: 'Ana Silva', rate: 3, x: 90, y: 250}],
    links: [{id: 'm2', a: 'y', b: 'x', kind: 'Reports to', str: 'Neutral'}], flags: [], strengths: [], updated: 1});
  await oppsPut({id: 'o3', acct: '${C}', name: 'Elsewhere', ox: 460, oy: 60, people: [], links: [], flags: [], strengths: [], updated: 1});
  OPPS = await oppsAll();
  await kvSet('cloudSeeded', true);
  openAccount('${A}');
})()`);
await tick(100);
ok(g(`groupSites('${A}').join('|')`) === B + '|' + A, 'sites group by the name before " - " when there is no group column');
ok(g(`groupSites('${D}').join('|')`) === D + '|Plain Co - Mildura', 'and by the group column when there is one');
ok($('avLap').hidden, 'a site in no large account shows no card');

// ---- the tick on the account plan starts one
$('avPlan').click(); await tick();
ok(!$('plLarge').checked, 'the plan\'s Large account tick starts off');
$('plLarge').checked = true; $('plOk').click(); await tick(400);
ok(g(`screen`) === 'opp' && g(`OPP === LAP`) && g(`LAP && LAP.sites.join('|')`) === B + '|' + A && g(`LAP.name`) === 'Example Meats', 'ticking it starts a plan across the customer\'s sites, and opens on its map (v123)');
ok($('title').textContent === 'Example Meats' && $('subtitle').textContent === '2 sites', 'named for the customer');
ok(g(`OPP.people.map(p => p.n).sort().join('|')`) === 'Ana Silva|Ben|Tom Ward' && g(`OPP.links.length`) === 2, 'the map starts with everyone from the sites\' opportunities, once each, and their links');
ok($('opView').querySelector('[data-v="sheet"]').textContent === 'Plan' && $('opEdit').hidden && $('opShare').hidden && $('opCoach').hidden && /Large account/.test($('opPanel').textContent) && /Vulnerabilities/.test($('opPanel').textContent), 'Map / Plan, a large account\'s panel, no Blue Sheet tools');
$('opView').querySelector('[data-v="sheet"]').click(); await tick(150);
ok(g(`screen`) === 'lap' && $('lapView').querySelector('.on').dataset.v === 'plan', 'Plan opens the plan behind the map');
ok(g(`PLANS.filter(p => p.kind === 'large').length`) === 1 && g(`planFor('${A}')`) === null, 'it is not taken for the site\'s own plan');
ok(g(`Object.keys(cloudDirty).some(k => k.startsWith('plans/la'))`), 'marked to sync');
ok(/Line 3 upgrade/.test(body()) && /Spiral freezer belts/.test(body()) && !/Elsewhere/.test(body()), 'open opportunities come from both sites, no others');
ok(/position \+2/.test(body()), 'with our position from the Blue Sheet');

// ---- the sections
const type = (id, v) => { $(id).value = v; $(id).dispatchEvent(new w.Event('input')); };
type('lapBiz', 'Two meat plants, growing poultry');
type('lapUs', 'AUD 250k'); type('lapAll', 'AUD 1m');
ok($('lapShareLine').textContent === 'About 25% of their belting spend', 'the share works itself out: ' + $('lapShareLine').textContent);
type('lapVision', 'The standard on every line');
await tick(900);
$('lapBody').querySelector('[data-opchips="ladder"] [data-v="Service provider"]').click(); await tick(50);
$('lapObj').value = 'Win both retrofits'; $('lapObjM').value = 'AUD 270k'; $('lapObjBy').value = '2027-06'; $('lapObjGo').click(); await tick(50);
$('lapStr').value = 'Lead with hygiene'; $('lapStrGo').click(); await tick(50);
$('lapNs').value = 'Strong at Bendigo'; $('lapNsGo').click(); await tick(50);
$('lapNf').value = 'Purchasing changes in 2027'; $('lapNfGo').click(); await tick(50);
$('lapAct').value = 'Meet Tom at Bendigo'; $('lapOwn').value = 'Ben'; $('lapDue').value = '2026-11-05'; $('lapActGo').click(); await tick(50);
$('lapReviewed').click(); await tick(100);
const L = (await g(`plansAll()`)).find(p => p.kind === 'large');
ok(L.business === 'Two meat plants, growing poultry' && L.ladder === 'Service provider' && L.spendUs === 'AUD 250k' && L.vision === 'The standard on every line', 'where we are and the vision saved');
ok(L.objectives[0].t === 'Win both retrofits' && L.objectives[0].measure === 'AUD 270k' && L.objectives[0].by === '2027-06' && L.strategies.length === 1 && L.strengths.length === 1 && L.flags.length === 1, 'objectives, strategies, strengths and vulnerabilities saved');
ok(L.actions[0].owner === 'Ben' && L.actions[0].due === '2026-11-05' && !L.actions[0].done && L.reviewed > 0, 'the action with its owner and date, and the review date');
$('lapBody').querySelector('[data-lapdone="0"]').checked = true; $('lapBody').querySelector('[data-lapdone="0"]').dispatchEvent(new w.Event('change')); await tick(100);
ok(g(`LAP.actions[0].done`) === true, 'an action ticked done');
$('lapBody').querySelector('[data-laptask="0"]').click(); await tick(100);
ok($('taskdlg').hasAttribute('open') && $('tkTitle').value === 'Meet Tom at Bendigo', 'Make a task opens the task form, filled in');
g(`closeDialogsNow()`); await tick();

// ---- the relationship map: everyone on the sites' opportunities, once each
const map = g(`lapMapData(LAP)`);
ok(map.people.map(p => p.n).sort().join() === 'Ana Silva,Ben,Tom Ward' && map.links.length === 2, 'Tom Ward is on both opportunities and appears once; their links come with them');
ok(!$('lapMap') && !/Relationship map/.test(body()), 'the plan no longer carries a map at its foot: the map is the Map view (v123)');
// ---- the large account's own map: built on it, saved with the plan
$('lapView').querySelector('[data-v="map"]').click(); await tick(150);
ok(g(`screen`) === 'opp' && g(`OPP === LAP`) && $('opMap').querySelectorAll('g.op-card').length === 3 && /2 sites/.test($('opMap').querySelector('.op-node').textContent), 'Map shows the account\'s own map, with the account at the centre');
ok(g(`OPP.parties.find(q => q.kind === 'end').name`) === 'Example Meats' && g(`OPP.people.filter(p => p.side === 'cust').every(p => p.party === OPP.parties[0].id)`), 'the customer\'s people sit under the large account as the end user (v124)');
d.querySelector('#opBar [data-tbl="' + g(`OPP.parties[0].id`) + '"]').click(); await tick();
{ const n = [...$('otBody').querySelectorAll('input[data-k="n"]')].pop(); n.value = 'Lee Group'; n.dispatchEvent(new w.Event('input')); }
$('otDone').click(); await tick(200);
ok(g(`LAP.people.some(p => p.n === 'Lee Group')`) && (await g(`plansAll()`)).find(p => p.kind === 'large').people.some(p => p.n === 'Lee Group'), 'someone added on the account\'s map is saved with the plan');
ok(g(`OPPS.every(o => !(o.people || []).some(p => p.n === 'Lee Group'))`), 'and stays off the sites\' opportunities');
g(`opSelect(null)`); await tick();
$('opPanel').querySelector('#opToPlan').click(); await tick(150);
ok(g(`screen`) === 'lap', 'Open the plan goes back to the plan');

// ---- sites: add from the suggestions or by name, take one out
ok(!$('lapBody').querySelector('[data-lapadd]'), 'no more sites to suggest when the group is all in');
$('lapSite').value = 'Not a real site'; $('lapSiteGo').click(); await tick();
ok(/Pick a site from the list/.test(toast()) && g(`LAP.sites.length`) === 2, 'a site that is not in the CRM is refused');
$('lapSite').value = C; $('lapSiteGo').click(); await tick(100);
ok(g(`LAP.sites.includes('${C}')`) && /Elsewhere/.test(body()), 'another site added by name brings its opportunities');
confirms = [];
[...$('lapBody').querySelectorAll('[data-lapsite]')].find(b => /Ringwood/.test(b.getAttribute('aria-label'))).click(); await tick(100);
ok(!g(`LAP.sites.includes('${C}')`) && /Take Other Foods - Ringwood out/.test(confirms[0]), 'and taken out again, asked first');

// ---- the card on each site, and the tick from another site
$('back').click(); await tick(100);
ok(g(`screen`) === 'acct' && !$('avLap').hidden && /Large account: Example Meats/.test($('avLap').textContent) && /2 sites · 2 opportunities · reviewed/.test($('avLap').textContent), 'back on the site, its Large account card');
g(`openAccount('${B}')`); await tick();
ok(!$('avLap').hidden, 'the other site shows the card too');
$('avPlan').click(); await tick();
ok($('plLarge').checked, 'and its plan\'s tick is on');
confirms = [];
$('plLarge').checked = false; $('plOk').click(); await tick(300);
ok(/Take Example Meats - Bendigo out of the large account Example Meats/.test(confirms[0]) && g(`PLANS.find(p => p.kind === 'large').sites.join()`) === A, 'unticking takes the site out, asked first');
ok($('avLap').hidden, 'and its card goes');
$('avPlan').click(); await tick();
$('plLarge').checked = true; $('plOk').click(); await tick(300);
ok(g(`PLANS.filter(p => p.kind === 'large').length`) === 1 && g(`LAP.sites.join('|')`) === B + '|' + A && /added to the large account/.test(toast()), 'ticking it again joins the existing plan, not a second one');

// ---- the document
const doc = g(`buildLapHTML(LAP, '')`);
ok(/<title>Large account plan/.test(doc) && /@page\{size:A4/.test(doc) && /Their business<\/td><td class="v">Two meat plants/.test(doc) && /About 25% of their belting spend/.test(doc), 'the document has where we are');
ok(/Line 3 upgrade/.test(doc) && /Win both retrofits/.test(doc) && /Meet Tom at Bendigo<\/td><td>Ben<\/td>/.test(doc) && /<td>Done<\/td>/.test(doc) && !/N\/A/.test(doc), 'the opportunities, objectives and action plan, with no N/A');
$('lapShare').click(); await tick(300);
ok(/new tab/.test(toast()), 'Create and share opens it in a tab on the PC: ' + toast());

// ---- delete
confirms = [];
$('lapDel').click(); await tick(300);
ok(/Delete the large account plan Example Meats\?/.test(confirms[0]) && /2 sites, with 1 objective and 1 action/.test(confirms[0]) && /their opportunities stay/.test(confirms[0]), 'delete says what goes and what stays');
ok(g(`PLANS.filter(p => p.kind === 'large').length`) === 0 && g(`screen`) === 'acct' && g(`OPPS.length`) === 3, 'gone, back on the site, the opportunities untouched');

const real = errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
