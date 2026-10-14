// v143: a large account's sites fill from the Dynamics contacts. Each site
// box gets every CRM contact for its account (and new ones from a later
// import), listed beside the map and hidden on it until the eye is tapped;
// one tap on the cross takes someone off, and they are not brought back.
// Each arrives to rate under the account manager's default cover.
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
  const list = [mk('${S.a}', 'Northside', [C('Pat Plant', 'Engineering Manager', 'c-1'), C('Sam Store', 'Purchasing', 'c-2'), C('Lee Line', 'Production', 'c-3')]),
    mk('${S.b}', 'Westside', [C('Jo Group', 'Group Engineering Manager', 'c-4')])];
  await accReplaceAll(list); indexAccounts(list);
  await kvSet('cloudSeeded', true);
  await plansPut({id: 'L1', kind: 'large', name: 'Sample Foods', sites: ['${S.a}', '${S.b}'], objectives: [], actions: [], updated: 1, sitesOn: true, autoCorpChecked: true,
    parties: [{id: 'pa', kind: 'end', name: '${S.a}', acct: '${S.a}', site: true}, {id: 'pb', kind: 'end', name: '${S.b}', acct: '${S.b}', site: true}, {id: 'pi', kind: 'ilx', name: 'Intralox'}],
    people: [{id: 'pp1', party: 'pa', side: 'cust', n: 'Pat Plant', title: 'Engineering Manager', stance: 'helps'}], links: []});
  await loadLists();
})()`);
await tick(100);
g(`openLap('L1')`); await tick(250);
const at = q => g(`OPP.people.filter(p => p.party === '${q}').map(p => p.n).sort().join('|')`);
ok(at('pa') === 'Lee Line|Pat Plant|Sam Store' && at('pb') === 'Jo Group', 'each site has its Dynamics contacts', at('pa') + ' / ' + at('pb'));
ok(g(`OPP.people.filter(p => p.n === 'Pat Plant').length`) === 1 && g(`OPP.people.find(p => p.n === 'Pat Plant').stance`) === 'helps', 'nobody twice: someone already there stays as they were');
ok(g(`OPP.people.find(p => p.n === 'Sam Store').cid`) === 'c-2' && g(`OPP.people.find(p => p.n === 'Sam Store').title`) === 'Purchasing', 'with their title and Dynamics id');
ok(g(`OPP.parties.find(q => q.id === 'pb').show`) === false && g(`OPP.parties.find(q => q.id === 'pa').show`) !== false, 'a site filled from nothing is hidden on the map; one that had people is not');
ok(g(`opImplied(OPP).length`) === 4, 'each arrives to rate under the account manager');
await tick(900);
const saved = (await g(`plansAll()`)).find(r => r.id === 'L1');
ok(saved.people.length >= 5, 'and it is saved');

// ---- one tap takes someone off, for good
g(`opBarExp.add('pa'), renderOpBar()`); await tick(50);
const x = d.querySelector('#opBar [data-out="' + g(`OPP.people.find(p => p.n === 'Lee Line').id`) + '"]');
ok(!!x && x.getAttribute('aria-label') === 'Take Lee Line off this map', 'a cross beside each name in the list');
let asked = 0; w.confirm = () => { asked++; return true; };
x.click(); await tick(150);
ok(!g(`OPP.people.some(p => p.n === 'Lee Line')`) && asked === 0, 'one tap takes them off, with nothing to confirm when they have no relationships');
ok(g(`OPP.parties.find(q => q.id === 'pa').crmOut.includes('lee line')`), 'remembered');
g(`renderOpp()`); await tick(150);
ok(!g(`OPP.people.some(p => p.n === 'Lee Line')`), 'so they are not brought back');
// someone with a relationship asks first
g(`(() => { const s = OPP.people.find(p => p.n === 'Sam Store'); const b = OPP.people.find(p => p.n === 'Ben Example'); OPP.links.push({id: 'l1', a: b.id, b: s.id, kind: 'Our coverage', str: 'Strong', note: ''}); opBarExp.add('pa'); renderOpBar(); })()`);
w.confirm = () => { asked++; return false; };
d.querySelector('#opBar [data-out="' + g(`OPP.people.find(p => p.n === 'Sam Store').id`) + '"]').click(); await tick(100);
ok(asked === 1 && g(`OPP.people.some(p => p.n === 'Sam Store')`), 'someone with relationships is asked about first, and Cancel keeps them');
w.confirm = () => true;

// ---- a later import brings new contacts in
g(`(() => { ACC_BY_NAME.get('${S.b}').c.push({n: 'New Starter', t: 'Maintenance', r: '', p: '', e: [], id: 'c-9'}); renderOpp(); })()`); await tick(150);
ok(at('pb') === 'Jo Group|New Starter', 'someone new in Dynamics joins their site');

// ---- a site leaving the plan takes its untouched contacts with it
g(`(() => { OPP.sites = ['${S.a}']; opEnsure(OPP); })()`);
ok(!g(`OPP.parties.some(q => q.id === 'pb')`) && !g(`OPP.people.some(p => p.n === 'Jo Group')`), 'a site taken out of the plan goes, with its Dynamics contacts');

await tick(700);
ok(errs.length === 0, 'no errors', errs.join(' | '));
console.log(`PASS ${pass}` + (fail ? `  FAIL ${fail}` : ''));
process.exit(fail ? 1 : 0);
