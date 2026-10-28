// v128: a bin on the card itself - Strategy (all three tabs), an account's
// Opportunities card, Reports, the calendar's visits and tasks, Lists, and a
// call's entries. Each asks first and names what goes; Cancel keeps it.
// Also the Mission tab under Reference. Everything here is made up.
import { JSDOM } from 'jsdom';
import fs from 'fs';
import 'fake-indexeddb/auto';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  x ' + m); } };
const tick = (ms = 50) => new Promise(r => setTimeout(r, ms));
const errs = [];
let confirms = [], answer = true;
const dom = new JSDOM(fs.readFileSync('index.html', 'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g, ''),
  { runScripts: 'dangerously', url: 'https://example.org/' });
const w = dom.window, d = w.document;
w.indexedDB = indexedDB; w.IDBKeyRange = IDBKeyRange; w.Blob = Blob;
w.scrollTo = () => {}; w.alert = () => {}; w.confirm = m => { confirms.push(m); return answer; };
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
const A = 'Example Meats - Dandenong';
const today = g(`todayISOdate()`);
await g(`(async () => {
  const list = [{a: '${A}', sub: 'Dandenong', z: 'Z1', foc: 'High', cad: CAD['High'], mgr: 'Ben', rep: '', c: [{n: 'Tom Ward', r: 'Ops', t: '', p: '', pk: '', e: []}]}];
  await accReplaceAll(list); indexAccounts(list);
  localStorage.setItem(LS('mgr'), 'Ben Example');
  await kvSet('cloudSeeded', true);
  await apptsPut({id: 'a1', acct: '${A}', type: 'Intralox site visit', date: '${today}', start: '09:00', dur: 60, agenda: '', contacts: [], touchedAt: Date.now()});
  await tasksPut({id: 't1', type: 'Phone call', title: 'Call Tom back', date: '${today}', start: '11:00', dur: 30, acct: '${A}', done: false, created: Date.now(), updated: Date.now()});
  await snippetsPut({id: 's1', label: 'Hygiene pitch', text: 'Open hinge.', created: Date.now()});
  await productsPut({id: 'p1', name: 'S800 flat top', acct: '${A}', status: 'Requested', created: Date.now()});
  await plansPut({id: 'pl1', acct: '${A}', goal: 'Belt standard', people: [], flags: [], strengths: [], updated: Date.now()});
  await plansPut({id: 'lp1', kind: 'large', name: 'Example Meats group', sites: ['${A}'], objectives: [], actions: [], people: [], updated: Date.now()});
  await oppsPut({id: 'o1', acct: '${A}', name: 'Line 3 upgrade', people: [], links: [], flags: [], strengths: [], updated: 2});
  await oppsPut({id: 'o2', acct: '${A}', name: 'Packing hall', people: [], links: [], flags: [], strengths: [], updated: 1});
  await loadLists();
  APPTS = await apptsAll(); TASKS = await tasksAll();
})()`);
const bin = sel => d.querySelector(sel);

// ---- Strategy: a bin on every card, Cancel keeps it
await g(`(async () => { stTab = 'opps'; go('strategy'); await renderStrategy(); })()`); await tick(100);
ok($('stRes').querySelectorAll('.rprow .cbin[data-stdel]').length === 2 && bin('[data-stdel="o1"]').getAttribute('aria-label') === 'Delete the opportunity Line 3 upgrade',
  'Strategy: each opportunity card has its own bin, named for it');
answer = false; confirms = [];
bin('[data-stdel="o1"]').click(); await tick(200);
ok(/^Delete the opportunity Line 3 upgrade at Example Meats - Dandenong\?/.test(confirms[0] || '') && g(`OPPS.length`) === 2, 'it asks, naming it; Cancel keeps it');
answer = true;
bin('[data-stdel="o1"]').click(); await tick(300);
ok(!g(`OPPS.some(o => o.id === 'o1')`) && !(await g(`oppsAll()`)).some(o => o.id === 'o1') && $('stRes').querySelectorAll('[data-stdel]').length === 1 && /Opportunity deleted/.test($('toast').textContent),
  'OK: gone from the list and the device, and it says so');
await g(`(async () => { stTab = 'laps'; await renderStrategy(); })()`); await tick();
confirms = []; bin('[data-stdel="lp1"]').click(); await tick(300);
ok(/^Delete the large account plan Example Meats group\?/.test(confirms[0] || '') && !g(`PLANS.some(p => p.id === 'lp1')`), 'a large account plan, from its card');
await g(`(async () => { stTab = 'plans'; await renderStrategy(); })()`); await tick();
confirms = []; bin('[data-stdel="pl1"]').click(); await tick(300);
ok(/^Delete the account plan for Example Meats - Dandenong\?/.test(confirms[0] || '') && !g(`PLANS.some(p => p.id === 'pl1')`) && /No account plans yet/.test($('stRes').textContent), 'an account plan, from its card');

// ---- an account's Opportunities card
await g(`(async () => { openAccount('${A}'); })()`); await tick(100);
ok(d.querySelector('#avOpps .opprw [data-oppdel="o2"]'), 'the account\'s Opportunities card: a bin beside each');
confirms = []; bin('[data-oppdel="o2"]').click(); await tick(300);
ok(/Packing hall/.test(confirms[0] || '') && !g(`OPPS.length`) && /None yet/.test($('avOpps').textContent), 'deleted from there, and the card redraws');
ok(d.querySelector('#avHead + #avStart'), 'Start a call here is at the top, under the account (QA)');

// ---- the calendar: a visit and a task
await g(`(async () => { go('today'); })()`); await tick(150);
ok(bin('[data-vdel="a1"]') && bin('[data-tdel="t1"]') && bin('[data-vdel="a1"]').previousElementSibling.classList.contains('vmore'), 'today: a bin on the visit (after its ⋯) and on the task');
confirms = []; bin('[data-vdel="a1"]').click(); await tick(300);
ok(/^Delete the visit to Example Meats - Dandenong on/.test(confirms[0] || '') && !g(`APPTS.length`) && !(await g(`apptsAll()`)).length && !bin('[data-vdel="a1"]'), 'the visit is gone, and off the list');
confirms = []; bin('[data-tdel="t1"]').click(); await tick(300);
ok(/^Delete the task "Call Tom back"/.test(confirms[0] || '') && !g(`TASKS.length`) && !(await g(`tasksAll()`)).length, 'the task too');

// ---- v155: Products, a tab of Plan (saved notes have no screen now; they stay in the backup)
await g(`showProducts()`); await tick(100);
confirms = []; bin('[data-prdel="p1"]').click(); await tick(300);
ok(/S800 flat top/.test(confirms[0] || '') && !g(`PRODS.length`), 'a product, from its card');

// ---- a call: its entries, then the call from Reports
await g(`startTestCall()`); await tick(300);
const cid = g(`call.id`);
ok(bin('[data-edel="0"]') && bin('[data-edel="0"]').previousElementSibling.classList.contains('emore'), 'a call\'s entry: a bin after its ⋯');
confirms = []; bin('[data-edel="0"]').click(); await tick(300);
ok(/^Delete /.test(confirms[0] || '') && g(`call.entries.length`) === 0, 'the entry is deleted from the card');
await g(`(async () => { go('reports'); await renderReports(); })()`); await tick(200);
ok(bin('[data-rpdel="' + cid + '"]'), 'Reports: a bin on the call');
confirms = []; bin('[data-rpdel="' + cid + '"]').click(); await tick(400);
ok(/^Delete Test customer on/.test(confirms[0] || '') && !(await g(`callsAll()`)).some(c => c.id === cid) && !bin('[data-rpdel="' + cid + '"]'), 'and the call goes from Reports');

// ---- Reference: the mission
await g(`showRef('mis')`); await tick(100);
ok(!$('paneMis').hidden && $('paneMan').hidden && /To create significant economic value for our customers by optimizing their conveying systems\./.test($('paneMis').textContent) &&
  /Minimize customer downtime\./.test($('paneMis').textContent) && /Self-managed people are our greatest resource\./.test($('paneMis').textContent),
  'Reference has a Mission tab: the mission, the commitment and the business philosophy');

const real = errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
