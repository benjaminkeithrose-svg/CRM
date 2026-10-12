// v130: the large account plan in Dynamics' own tabs - Key info, Objectives,
// Activities, Accounts, SWOT, Success factors, Team - and Copy for Dynamics,
// each field with its own Copy. An older plan's content keeps its place.
// Everything here is made up.
import { JSDOM } from 'jsdom';
import fs from 'fs';
import 'fake-indexeddb/auto';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  x ' + m); } };
const tick = (ms = 50) => new Promise(r => setTimeout(r, ms));
const errs = [];
const dom = new JSDOM(fs.readFileSync('index.html', 'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g, ''),
  { runScripts: 'dangerously', url: 'https://example.org/' });
const w = dom.window, d = w.document;
w.indexedDB = indexedDB; w.IDBKeyRange = IDBKeyRange; w.Blob = Blob;
w.scrollTo = () => {}; w.alert = () => {}; w.confirm = () => true;
w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
w.navigator.storage = { persist: async () => true, persisted: async () => true };
let copied = null;
Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async t => { copied = t; } }, configurable: true });
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
const A = 'Sample Poultry - Tamworth', B = 'Sample Poultry - Hanwood', H = 'Sample Poultry - Head Office';
await g(`(async () => {
  const mk = (a, sub) => ({a, sub, z: 'Z1', foc: 'High', cad: CAD['High'], mgr: 'Ben', rep: '', c: []});
  const list = [mk('${A}', 'Tamworth'), mk('${B}', 'Hanwood'), mk('${H}', 'Head Office')];
  await accReplaceAll(list); indexAccounts(list);
  localStorage.setItem(LS('mgr'), 'Ben Example');
  await kvSet('cloudSeeded', true);
  // an older plan: an objective with a measure and a month, strengths and vulnerabilities
  await plansPut({id: 'L1', kind: 'large', name: 'Sample Poultry', sites: ['${A}', '${B}'], updated: 1, business: 'Five poultry plants', today: 'Strong site positions', vision: 'Level 4 partnership',
    objectives: [{id: 'ob1', t: 'Install base reliability', measure: '$400,000', by: '2026-12'}], strengths: [{id: 's1', t: 'Strong site positions'}], flags: [{id: 'f1', t: 'Limited reach into group operations'}],
    actions: [], strategies: [],
    parties: [{id: 'pc', kind: 'corp', name: '${H}', acct: '${H}'}, {id: 'pi', kind: 'ilx', name: 'Intralox'}],
    people: [{id: 'u1', party: 'pi', side: 'us', n: 'Ben Example', title: 'Account Manager'}, {id: 'u2', party: 'pi', side: 'us', n: 'Sasha', title: 'Application Engineer'}], links: [], ox: 435, oy: 330, sitesOn: true});
  await callsPut({id: 'c1', customer: '${A}', date: '20/08/2026', type: 'Site call', when: Date.parse('2026-08-20'), entries: [], contacts: [], closed: true, status: 'done', updated: 1});
  await callsPut({id: 'c2', customer: 'Somebody Else', date: '21/08/2026', type: 'Site call', when: Date.parse('2026-08-21'), entries: [], contacts: [], updated: 1});
  await apptsPut({id: 'ap1', acct: '${H}', type: 'Intralox site visit', date: '2026-09-25', start: '11:00', dur: 60, agenda: 'Engineering conference', contacts: [], touchedAt: 1});
  await loadLists(); APPTS = await apptsAll();
  LAP = PLANS.find(p => p.id === 'L1'); lapTab = 'key'; go('lap'); renderLap();
})()`);
await tick(150);
const body = () => $('lapBody').textContent;
const tab = async k => { $('lapBody').querySelector('[data-laptab="' + k + '"]').click(); await tick(80); };
const type = (el, v) => { el.value = v; el.dispatchEvent(new w.Event('input')); };

// ---- Key info: Dynamics' fields, and the description's five parts
ok($('lapRev') && $('lapYear').value === String(new Date().getFullYear()) && $('lapSp') && $('lapGoals') && $('lapIns'), 'Key info: revenue, year (this year to start), SharePoint link, business goals, key insights');
ok($('lapBiz').value === 'Five poultry plants' && $('lapToday').value === 'Strong site positions' && $('lapVision').value === 'Level 4 partnership', 'the older plan\'s content is in its place: overview, position, vision');
type($('lapRev'), '$1,500,000'); type($('lapYear'), '2026'); type($('lapSp'), 'https://example.sharepoint.com/plan');
type($('lapGoals'), 'Lead in food safety'); type($('lapIns'), 'High maintenance turnover');
await tick(900);
const L = (await g(`plansAll()`)).find(p => p.id === 'L1');
ok(L.revenue === '$1,500,000' && L.year === '2026' && L.sharepoint === 'https://example.sharepoint.com/plan' && L.goals === 'Lead in food safety' && L.insights === 'High maintenance turnover', 'saved');
const desc = g(`lapDescription(LAP)`);
ok(/^Intralox Vision:\nLevel 4 partnership\n\nAccount Overview:\nFive poultry plants\n\nBusiness Goals:\nLead in food safety\n\nKey Insights:\nHigh maintenance turnover\n\nIntralox Position:\nStrong site positions$/.test(desc), 'Dynamics\' Description, in its five headed parts: ' + JSON.stringify(desc));

// ---- Objectives: each with name, description, revenue, period and owner
await tab('obj');
const o = k => $('lapBody').querySelector('[data-lapo="' + k + ':0"]');
ok(o('t').value === 'Install base reliability' && o('revenue').value === '$400,000' && o('period').value === 'Fiscal Year 2026', 'an older objective\'s measure is its revenue, its month its fiscal year');
type(o('desc'), 'DPE health checks across the sites'); type(o('owner'), 'Ben Example');
$('lapObjNew').click(); await tick(60);
ok($('lapBody').querySelectorAll('.lapobj').length === 2 && $('lapBody').querySelector('[data-lapo="period:1"]').value === 'Fiscal Year 2026' && $('lapBody').querySelector('[data-lapo="owner:1"]').value === 'Ben Example', 'a new objective starts with this year and you as owner');

// ---- SWOT
await tab('swot');
ok(/Strengths/.test(body()) && /Strong site positions/.test(body()) && /Weaknesses/.test(body()) && /Limited reach into group operations/.test(body()) && /Opportunities/.test(body()) && /Threats/.test(body()), 'SWOT: strengths and weaknesses carried over, opportunities and threats new');
$('lapNswopps').value = 'OEM triangulation'; $('lapBody').querySelector('[data-lapadd2="swopps"]').click(); await tick(60);
$('lapNthreats').value = 'High maintenance turnover'; $('lapBody').querySelector('[data-lapadd2="threats"]').click(); await tick(60);
ok(g(`LAP.swopps.map(x => x.t).join()`) === 'OEM triangulation' && g(`LAP.threats.map(x => x.t).join()`) === 'High maintenance turnover', 'opportunities and threats added');

// ---- Critical success factors
await tab('csf');
ok($('lapBody').querySelectorAll('[data-csf]').length === 6, 'six critical success factors');
type($('lapCsf1'), 'Corporate engineering specifies Intralox'); await tick(900);
ok(g(`LAP.csf[1]`) === 'Corporate engineering specifies Intralox' && g(`LAP.csf[0]`) === '', 'the second one saved, the first left empty');

// ---- Accounts and Team
await tab('acc');
ok(/Tamworth/.test(body()) && /Hanwood/.test(body()) && /Corporate/.test(body()) && /Head Office/.test(body()) && $('lapCorpMap'), 'Accounts: the sites, and the corporate account from the map');
await tab('team');
ok(/Ben Example/.test(body()) && /Sasha/.test(body()) && /Application Engineer/.test(body()), 'Team: our people on the map');

// ---- Activities: calls and visits at the sites and the corporate account
await tab('act'); await tick(200);
const acts = [...$('lapActs').querySelectorAll('[data-lapactv]')].map(b => b.textContent);
ok(acts.length === 2 && /Engineering conference/.test(acts[0]) && /Head Office/.test(acts[0]) && /Site call/.test(acts[1]) && /Tamworth/.test(acts[1]) && !acts.some(t => /Somebody Else/.test(t)),
  'Activities: the visit at the corporate account and the call at a site, newest first, nobody else\'s: ' + acts.join(' | '));

// ---- Copy for Dynamics
$('lapDyn').click(); await tick(100);
ok($('dyndlg').hasAttribute('open') && /Key plan information/.test($('dynBody').textContent) && /Objective 1/.test($('dynBody').textContent) && /Critical Success Factor 2/.test($('dynBody').textContent), 'Copy for Dynamics lists Dynamics\' fields');
const copyFor = label => [...$('dynBody').querySelectorAll('.dynrow')].find(r => r.querySelector('b').textContent === label);
copyFor('Plan Revenue').querySelector('[data-dyncopy]').click(); await tick(50);
ok(copied === '$1,500,000' && /Plan Revenue copied/.test($('toast').textContent), 'each field copies on its own');
copyFor('Description').querySelector('[data-dyncopy]').click(); await tick(50);
ok(copied === desc, 'the Description copies whole, headed as in Dynamics');
copyFor('Opportunities').querySelector('[data-dyncopy]').click(); await tick(50);
ok(copied === 'OEM triangulation', 'SWOT boxes copy one per line');
ok(!copyFor('Critical Success Factor 1').querySelector('[data-dyncopy]') && /Empty/.test(copyFor('Critical Success Factor 1').textContent), 'an empty field says so, with nothing to copy');
$('dynClose').click(); await tick(100);
ok(!$('dyndlg').hasAttribute('open'), 'Done closes it');

// ---- the document follows the same order
const doc = g(`buildLapHTML(LAP, '')`);
ok(/<h2>Key plan information<\/h2>/.test(doc) && /Plan revenue<\/td><td class="v">\$1,500,000/.test(doc) && /<h2>SWOT<\/h2>/.test(doc) && /OEM triangulation/.test(doc) && /Critical success factor 2<\/td><td class="v">Corporate engineering/.test(doc) && !/N\/A/.test(doc),
  'Create and share follows Dynamics\' order');
ok(/Key insights: High maintenance turnover/.test(g(`cxLapBlock(LAP, {})`)) && /Threats: High maintenance turnover/.test(g(`cxLapBlock(LAP, {})`)), 'and the Export for Claude carries the new parts');

const real = errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
