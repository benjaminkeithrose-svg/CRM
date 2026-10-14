// v124: the layered opportunity map. Parties around the opportunity (end
// user, head contractors, OEMs and integrators, Intralox), people under each
// as an organisation chart, built from the list down the side and a table of
// people; the Intralox spec on every party; belting preferences on OEMs; a
// person in focus fades the rest; links faint and switchable; the test
// project and Delete tests; an old three-lane map turned into parties.
// Everything here is made up.
import { JSDOM } from 'jsdom';
import fs from 'fs';
import 'fake-indexeddb/auto';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  x ' + m); } };
const tick = (ms = 50) => new Promise(r => setTimeout(r, ms));
const errs = [];
let confirms = [];
const dom = new JSDOM(fs.readFileSync('index.html', 'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g, ''),
  { runScripts: 'dangerously', url: 'https://example.org/' });
const w = dom.window, d = w.document;
w.indexedDB = indexedDB; w.IDBKeyRange = IDBKeyRange; w.Blob = Blob;
w.scrollTo = () => {}; w.alert = () => {}; w.confirm = m => { confirms.push(m); return true; };
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
const panel = () => $('opPanel').textContent;
const bar = sel => d.querySelector('#opBar ' + sel);
const A = 'Example Meats - Dandenong', O = 'Northfield Conveyors';
await g(`(async () => {
  const mk = (a, sub, c) => ({a, sub, z: 'Z1', foc: 'High', cad: CAD['High'], mgr: 'Ben', rep: '', c});
  const list = [mk('${A}', 'Dandenong', [{n: 'Tom Ward', r: 'Operations Manager', t: '', p: '', pk: '', e: []}]),
    mk('${O}', 'Bayswater', [{n: 'Greta Holm', r: 'Design Engineer', t: '', p: '', pk: '', e: []}])];
  await accReplaceAll(list); indexAccounts(list);
  localStorage.setItem(LS('mgr'), 'Ben Example');
  await kvSet('cloudSeeded', true);
})()`);

// ---- an old three-lane map becomes parties
await g(`(async () => {
  await oppsPut({id: 'old', acct: '${A}', name: 'Line 3 upgrade', ox: 460, oy: 60, updated: 1, flags: [], strengths: [], links: [{id: 'k1', a: 'u1', b: 'c1', kind: 'Our coverage', str: 'Strong'}],
    people: [{id: 'c1', side: 'cust', n: 'Tom Ward', x: 40, y: 60}, {id: 'o1', side: 'oem', n: 'Greg Holt', org: 'Riverbend', x: 420, y: 200}, {id: 'o2', side: 'oem', n: 'Ash Line', org: 'riverbend', x: 420, y: 300},
      {id: 'u1', side: 'us', n: 'Ben', x: 800, y: 60}]});
  await loadLists(); openAccount('${A}'); openOpp('old');
})()`); await tick(300);
ok(g(`screen`) === 'opp' && g(`OPP.parties.map(q => q.kind + ':' + q.name).join('|')`) === 'end:' + A + '|oem:Riverbend|ilx:Intralox', 'an old map is turned into parties: the account, each OEM company once, Intralox');
ok(g(`OPP.people.map(p => p.party).join()`) === 'pe,po1,po1,pi' && g(`OPP.parties[0].acct`) === A, 'everyone under their party; the end user is the account');
ok($('opMap').querySelectorAll('.op-party').length === 3 && $('opMap').querySelectorAll('.op-card').length === 4 && $('opMap').querySelector('.op-edge'), 'drawn: three parties, four people, their link');

// ---- the list down the side
ok(bar('[data-addparty="end"]') && bar('[data-addparty="head"]') && bar('[data-addparty="oem"]') && !bar('[data-addparty="ilx"]'), 'each kind of party has a circle-plus; Intralox is there already');
bar('[data-addparty="head"]').click(); await tick();
ok($('opNewParty') && $('opNewParty').getAttribute('list') === 'opAcctList' && [...$('opAcctList').options].map(o => o.value).join() === A + ',' + O, 'a new party\'s name can be picked from the customer list');
$('opNewParty').value = 'Northgate D&C'; $('opNewPartyGo').click(); await tick(100);
const head = g(`OPP.parties.find(q => q.kind === 'head').id`);
ok(g(`opSel.t`) === 'party' && /Head contractor/.test(panel()) && /Bidding/.test(d.querySelector('#opPanel [data-opchips="qstatus"] .on').textContent), 'a new head contractor opens on its own, bidding');
d.querySelector('#opPanel [data-opchips="qstatus"] [data-v="Appointed"]').click(); await tick();
ok(g(`opPartyLinks(OPP).find(l => l.b === '${head}').t`) === 'Engaged', 'appointed, its link to the end user reads Engaged');
bar('[data-addparty="oem"]').click(); await tick();
$('opNewParty').value = O; $('opNewPartyGo').click(); await tick(100);
const oem = g(`OPP.parties.find(q => q.name === '${O}').id`);
ok(g(`OPP.parties.find(q => q.id === '${oem}').acct`) === O && g(`OPP.parties.find(q => q.id === '${oem}').via`) === head, 'an OEM picked from the customer list keeps the account, and works for the head contractor');
ok(/Subcontracts/.test($('opMap').textContent), 'drawn under the head contractor');
// belting
const belts = () => [...d.querySelectorAll('#opQbelts button')];
ok(belts().map(b => b.textContent).join() === 'Intralox,Habasit,Uni-chains,Ammeraal Beltech,Safari,Forbo,Scanbelt,Hongsbelt' && belts()[0].classList.contains('on'), 'belting preference: the usual suppliers, Intralox ticked');
belts().find(b => b.textContent === 'Habasit').click(); await tick();
$('opQbeltN').value = 'Volta'; $('opQbeltGo').click(); await tick();
ok(g(`OPP.parties.find(q => q.id === '${oem}').belts.join()`) === 'Intralox,Habasit,Volta' && belts().some(b => b.textContent === 'Volta'), 'chips toggle, and another supplier becomes a chip');
$('opQvia').value = ''; $('opQvia').dispatchEvent(new w.Event('change')); await tick();
ok(g(`opPartyLinks(OPP).find(l => l.b === '${oem}').t`) === 'Direct', 'an OEM can work for the end user directly');

// ---- the Intralox spec, on every party
const spec = id => g(`OPP.parties.find(q => q.id === '${id}').spec || ''`);
ok(!bar('[data-spec="pi"]') && bar('[data-spec="' + oem + '"]').textContent === '–', 'every party but ours shows its spec, not known to start');
bar('[data-spec="' + oem + '"]').click(); await tick();
ok(spec(oem) === 'yes' && bar('[data-spec="' + oem + '"]').classList.contains('yes'), 'one tap: specced');
bar('[data-spec="' + oem + '"]').click(); await tick(); bar('[data-spec="' + oem + '"]').click(); await tick();
ok(spec(oem) === 'no' && $('opMap').querySelector('.op-party.spec-no'), 'then unsure, then not specced, which stands out on the map');
const pp = () => d.querySelector('#opMap .op-party[aria-label*="' + O + '"]');
ok(/Not specced/.test(pp().getAttribute('aria-label')), 'and says so');

// ---- people as a table, with who reports to whom
bar('[data-tbl="pe"]').click(); await tick();
ok($('optbl').hasAttribute('open') && [...$('otNames').options].map(o => o.value).join() === 'Tom Ward', 'the end user\'s table offers its CRM contacts');
const type = async (name, title, boss, code, stance) => {
  const n = [...$('otBody').querySelectorAll('input[data-k="n"]')].pop();
  n.value = name; n.dispatchEvent(new w.Event('input')); n.dispatchEvent(new w.Event('change')); await tick();
  const row = [...$('otBody').querySelectorAll('tbody tr')].find(x => x.querySelector('[data-k="n"]').value === name);
  const set = (k, v) => { const e = row.querySelector('[data-k="' + k + '"]'); e.value = v; e.dispatchEvent(new w.Event(e.tagName === 'SELECT' ? 'change' : 'input')); };
  if (title) set('title', title);
  if (boss) set('boss', g(`opTbl.rows.find(r => r.n === '${boss}').id`));
  if (code) set('code', code);
  if (stance) set('stance', stance);
};
await type('Kim Site', 'Site Engineer', 'Tom Ward', 'T/C', 'helps');
await type('Jordan Flow', 'Process Engineer', 'Tom Ward', 'T');
$('otDone').click(); await tick(200);
const kim = g(`OPP.people.find(p => p.n === 'Kim Site')`);
ok(kim && kim.boss === 'c1' && kim.role === 'Checks the spec' && kim.role2 === 'On our side' && kim.stance === 'helps' && kim.side === 'cust', 'a row brings a person: title, reports to, both parts, helping us');
ok(g(`opTreeOrder(OPP.parties[0]).map(x => x.p.n + x.d).join()`) === 'Tom Ward0,Kim Site1,Jordan Flow1', 'the end user\'s people form an organisation chart');
ok(g(`opPos['${kim.id}'].x - opPos.c1.x`) === 18, 'drawn indented under their manager');
bar('[data-tbl="' + oem + '"]').click(); await tick();
ok([...$('otNames').options].map(o => o.value).includes('Greta Holm'), 'a party from the customer list offers that account\'s contacts');
await type('Greta Holm');
$('otDone').click(); await tick(200);
ok(g(`OPP.people.find(p => p.n === 'Greta Holm').title`) === 'Design Engineer' && g(`OPP.people.find(p => p.n === 'Greta Holm').org`) === O, 'with their title, under their company');

// ---- focus on one person
const card = n => d.querySelector('#opMap .op-card[aria-label^="' + n + '"]');
card('Ben').dispatchEvent(new w.KeyboardEvent('keydown', {key: 'Enter', bubbles: true})); await tick();
ok(!card('Ben').classList.contains('op-faded') && !card('Tom Ward').classList.contains('op-faded') && card('Greta Holm').classList.contains('op-faded'), 'tapping someone keeps them and whoever they are linked to bright, and fades the rest');
ok(/Their relationships/.test(panel()) && /Tom Ward/.test(panel()) && /Our coverage/.test(panel()), 'their panel lists their relationships (v140: by site, each editable)');
card('Kim Site').dispatchEvent(new w.KeyboardEvent('keydown', {key: 'Enter', bubbles: true})); await tick();
ok($('opPboss').value === 'c1' && !card('Tom Ward').classList.contains('op-faded') && !card('Ben').classList.contains('op-faded') && card('Greta Holm').classList.contains('op-faded'), 'their manager stays bright too, as does the account manager who covers them by default (v140), and they can be moved under someone else');
ok(d.querySelector('#opPanel details.opmore') && !d.querySelector('#opPanel details.opmore').open, 'the finer detail waits behind More detail');
g(`opSelect(null)`); await tick();

// ---- links faint, and switchable; people hidden
ok($('opMap').querySelector('.op-edge.op-faint'), 'with nobody chosen, links are faint');
bar('[data-tg="links"]').click(); await tick();
ok(!$('opMap').querySelector('.op-edge') && !g(`opLinksOn`), 'Links off hides them');
bar('[data-tg="links"]').click(); await tick();
bar('[data-eye="pe"]').click(); await tick();
ok(!card('Tom Ward') && /3 people/.test(d.querySelector('#opMap .op-party').textContent), 'a party\'s people can be hidden; it says how many');
bar('[data-eye="pe"]').click(); await tick();
bar('[data-tg="people"]').click(); await tick();
ok(!$('opMap').querySelector('.op-card') && $('opMap').querySelectorAll('.op-party').length === 5, 'People hidden leaves only the parties');
bar('[data-tg="people"]').click(); await tick();

// ---- removing a party
g(`opSelect({t: 'party', id: 'po1'})`); await tick();
$('opQrm').click(); await tick();
ok(/Remove Riverbend, its 2 people and their 0 links/.test(panel()), 'removing a party names its people and links');
$('opQrmY').click(); await tick(200);
ok(!g(`OPP.parties.some(q => q.id === 'po1')`) && !g(`OPP.people.some(p => p.party === 'po1')`), 'gone, with its people');
const savedOld = (await g(`oppsAll()`)).find(o => o.id === 'old');
ok(savedOld.parties.length === 4 && savedOld.people.length === 5, 'all of it saved with the opportunity');

// ---- the coach reads the parties
const t = g(`oppText(OPP)`);
ok(/Parties:\n- Example Meats - Dandenong \(end user\); Intralox spec: spec not known/.test(t) && /Northfield Conveyors \(OEM or integrator, direct to the end user, prefers Intralox, Habasit, Volta\); Intralox spec: not specced/.test(t) &&
  /Kim Site \(customer, Site Engineer, Example Meats - Dandenong\); reports to Tom Ward; helping us/.test(t), 'the coach reads the parties, the spec, the belting and who reports to whom');

// ---- the test project, and Delete tests
await g(`(async () => { go('strategy'); })()`); await tick(150);
d.querySelector('#stTabs [data-new="opps"]').click(); await tick(150);
const tb = $('fsRes').querySelector('[data-sttest]');
ok(tb && /Start a test project/.test(tb.textContent), 'New opportunity offers a test project');
tb.click(); await tick(400);
ok(g(`screen`) === 'opp' && g(`OPP.test`) && g(`OPP.parties.filter(q => q.kind === 'oem').length`) === 3 && g(`OPP.parties.filter(q => q.kind === 'head').length`) === 1, 'a test project: one head contractor and three OEMs');
ok(g(`OPP.parties.filter(q => q.kind === 'oem').every(q => OPP.people.filter(p => p.party === q.id).length === 4)`) && g(`OPP.people.some(p => p.boss)`), 'four people each, and an organisation chart under the end user');
$('back').click(); await tick(150);
ok(g(`screen`) === 'strategy' && /TEST/.test($('stRes').textContent), 'back on Strategy, it is marked TEST');
confirms = [];
await g(`deleteTestCalls()`); await tick(200);
ok(/0 test calls with 0 photos, and 1 test project\?/.test(confirms[0] || '') && !g(`OPPS.some(o => o.test)`) && g(`OPPS.some(o => o.id === 'old')`), 'Delete tests removes the test project and nothing else: ' + (confirms[0] || '').split('\n')[0]);

const real = errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
