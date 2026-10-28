// v121: CIP and MBOs. Two Home tiles. The continuous improvement plan with
// its periods, comparison, pickers and locks; the four pillars; the reference;
// the MBO grid with its quarterly cap, carry and Mega MBO; an import from the
// CIP and MBO page's file; Create and share; private sync and backup.
// Every name and figure here is made up.
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
let phone = false;
w.matchMedia = () => ({ matches: phone, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
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
const typeIn = (el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
const pick = (el, v) => { el.value = v; el.dispatchEvent(new w.Event('change', { bubbles: true })); };
const body = () => $('cipBody');
const field = path => body().querySelector('[data-cp="' + path + '"]');
const btn = (sel, root = body()) => root.querySelector(sel);
w.eval(`deliverDoc = async (html, name, title) => { window.__doc = {html, name, title}; }`);
const docOut = () => w.__doc || {};

// ---- the tiles
// v152: one Performance tile, with CIP and MBO as tabs
const tCip = d.querySelector('.tiles [data-go="perf"]');
ok(tCip && /Performance/.test(tCip.textContent) && !d.querySelector('.tiles [data-go="cip"]') && !d.querySelector('.tiles [data-go="mbo"]'), 'Home has one Performance tile for CIP and MBOs');
ok(g(`DB_VER`) >= 8 && g(`CLOUD_REC_STORES.includes('cip')`), 'a store of its own, synced like the others');
const sql = ['0004_teams.sql', '0007_team_opps.sql'].map(f => fs.readFileSync('supabase/migrations/' + f, 'utf8')).join('\n');
ok(!/'cip'/.test(sql), 'and not one the team rules share, so it stays private');

// ---- starting from nothing
tCip.click(); await tick(150);
const now = g(`cipNowPeriod()`);
ok(g('screen') === 'cip' && $('title').textContent === 'Performance' && /hasn't been started/.test(body().textContent) && $('cipPeriod').value === now, 'CIP opens on this half-year, not started');
ok((await g(`cipAll()`)).length === 0, 'looking saves nothing');
btn('[data-cipstart="blank"]').click(); await tick(300);
ok(g(`CIP.periods['${now}'].goals.length`) === 1 && field('self.accomplishments') && field('goals.0.goal'), 'Start makes the period, with one goal, one strength and one gap to fill');
typeIn(field('name'), 'Alex Example'); typeIn(field('self.accomplishments'), 'Ran two trials');
await tick(800);
const saved = (await g(`cipAll()`)).find(r => r.id === 'me');
ok(saved && saved.employee.name === 'Alex Example' && saved.periods[now].self.accomplishments === 'Ran two trials', 'typing saves a moment later');
ok(g(`!!cloudDirty['cip/me']`), 'and marks it to sync');
ok($('subtitle').textContent === 'Alex Example', 'the name shows under the title');
const pick0 = body().querySelector('[data-pick="ind"]');
ok(pick0.disabled && /No reference on this device/.test(pick0.textContent), 'with no reference the lists say so, and the boxes still take typing');

// ---- import: the CIP and MBO page's own file first (no reference in it)
const page = {version: 1, employee: {name: 'Sam Sample', title: 'Account Manager', hireDate: '2020-02-03', supervisor: 'Pat Boss'},
  periods: {
    '2025-H1': {locked: true, reviewer: 'Pat Boss', reviewDate: '', self: {accomplishments: 'Old wins', notMet: '', learned: '', support: '', comments: ''},
      goals: [{goal: 'Plan the week', indicant: 'Old indicant', indicantId: '', lci: '', lciId: '', measure: '', progress: ''}], strengths: [{text: 'Curious', link: '', linkId: '', plan: 'Ask more'}],
      gaps: [{text: 'Reporting', link: '', linkId: '', plan: 'Habit'}], manager: {rating: 'acceptable', comments: 'Good half'}},
    '2025-H2': {locked: false, reviewer: 'Pat Boss', reviewDate: '', self: {accomplishments: 'Newer wins', notMet: '', learned: '', support: '', comments: ''},
      goals: [{goal: 'Plan the month', indicant: '', indicantId: '', lci: '', lciId: '', measure: 'Plans in CRM', progress: 'Half done', locked: true}], strengths: null, gaps: null, manager: {rating: '', comments: ''}}},
  mbo: {years: {'2025': {cap: 4000, setupLocked: true, items: [
    {id: 'm1', cat: 'Coverage', title: 'New account visit', value: 500, buId: 'b1', logLabel: '', books: false, proof: 'Logged in CRM', def: 'A first visit'},
    {id: 'm2', cat: 'LCI', title: 'Professional development', value: 250, buId: '', logLabel: 'Objective or book', books: true, proof: '', def: ''}],
    mega: [{id: 'g1', title: 'Team grows 10%', pct: 10, met: 'no', def: 'All products'}],
    quarters: {Q1: {locked: false, log: {m1: [{site: 'Acme Foods'}, {site: 'Beta Meats'}, {site: 'Gamma Dairy'}]}}}}}},
  pillars: {boxes: [{id: 'p1', title: 'Coverage', pct: 60, items: ['Visits', 'Leads']}, {id: 'p2', title: 'Triangulation', pct: 20, items: []},
    {id: 'p3', title: 'Value', pct: 10, items: []}, {id: 'p4', title: 'Improvement', pct: 5, items: [{t: 'Reading', note: 'A book a quarter'}]}]}};
const file = (obj, name) => new w.File([JSON.stringify(obj)], name, {type: 'application/json'});
confirms = [];
await g(`cipImport`)(file(page, 'CIP_Sam_Sample.json')); await tick(200);
ok(/Replace your CIP \(1 period\)/.test(confirms[0] || ''), 'importing over a plan asks first, naming what is replaced: ' + (confirms[0] || '').split('\n')[0]);
ok(g(`cipStored().join()`) === '2025-H1,2025-H2' && g(`CIP.employee.name`) === 'Sam Sample' && g(`mboYears().join()`) === '2025', 'the page\'s file brings the plan and the MBOs');
ok(g(`typeof CIP.pillars.boxes[0].items[0]`) === 'object' && g(`CIP.pillars.boxes[0].items[0].t`) === 'Visits', 'old pillar bubbles come in as items');
ok(g(`cipUi.cur`) === '2025-H2' && g(`cipUi.cmp.join()`) === '2025-H1', 'it opens on the latest period, compared with the one before');

// ---- then a reference file
const ref = {format: 'fieldcrm-cip', reference: {
  ind: [{area: 'Business Development', result: 'Territory', items: [{id: 'i1', b: 'Plan the territory', s: 'Visits ⟦15–20 a month?⟧'}]}],
  lci: [{group: 'Highly Productive', items: [{id: 'l4', t: 'Works on right things'}]}],
  buYear: '2025', bu: [{csf: 'CSF 1 – Coverage', items: [{id: 'b1', t: 'Protect annuity', subs: ['Visit high focus accounts']}]}],
  books: ['A Useful Book – A. Author'], extra: [{title: 'Team summary', note: 'Made up', blocks: [{h: 'Goals', table: {head: ['Goal', 'Focus'], rows: [['1', 'Grow']]}}]}]}};
confirms = [];
await g(`cipImport`)(file(ref, 'ref.json')); await tick(200);
ok(!confirms.length && g(`CIPREF.ind.length`) === 1 && g(`CIPREF.books.length`) === 1 && g(`cipStored().length`) === 2, 'a reference file adds the reference and leaves the plan alone');

w.eval(`go('home'); go('cip')`); await tick(150);
ok($('cipPeriod').value === '2025-H2' && /2025 H2 year-end review · editing/.test(body().textContent), 'the plan shows the period being worked on');
ok(/Newer wins/.test(field('self.accomplishments').value) && /2025 H1 MID-YEAR|2025 H1 mid-year/i.test(body().querySelector('.cippast .tag').textContent) && /Old wins/.test(body().textContent), 'what was written in the period compared with shows under each box');
ok(/Plan the week/.test(body().textContent) && btn('[data-cipcopy]'), 'past goals show too, with Copy');
// the pickers
// that goal is locked on its own: its boxes are read-only
ok(field('goals.0.goal').readOnly && body().querySelector('[data-pick="ind"]').disabled && btn('[data-cipblk="goals.0"]').textContent === 'Edit', 'a locked goal is read-only, with Edit');
btn('[data-cipblk="goals.0"]').click(); await tick();
ok(!field('goals.0.goal').readOnly, 'Edit opens it again');
const ind = body().querySelector('[data-pick="ind"]');
ok(!ind.disabled && /Plan the territory/.test(ind.textContent), 'the indicant list comes from the reference');
pick(ind, 'i1'); await tick();
ok(g(`CIP.periods['2025-H2'].goals[0].indicantId`) === 'i1' && /Territory: Plan the territory\nStandard: Visits 15–20 a month\? \[to confirm\]/.test(g(`CIP.periods['2025-H2'].goals[0].indicant`)), 'picking drops the wording into the box, marked where it needs confirming');
// add and remove a goal
btn('[data-cipadd="goals"]').click(); await tick();
ok(g(`CIP.periods['2025-H2'].goals.length`) === 2, 'Add goal adds one');
typeIn(field('goals.1.goal'), 'Win the trial');
confirms = []; btn('[data-cipdel="goals.1"]').click(); await tick();
ok(/Remove Goal 2 \(Win the trial\) from 2025 H2\?/.test(confirms[0] || '') && g(`CIP.periods['2025-H2'].goals.length`) === 1, 'removing names the goal and asks');
// strengths start empty in that period: add one
btn('[data-cipadd="strengths"]').click(); await tick();
const dev = body().querySelector('[data-target="strengths.0.link"]');
ok(dev && /Works on right things/.test(dev.textContent) && /Plan the territory/.test(dev.textContent), 'a strength links to an indicant or an LCI principle');
// manager's rating
const rate = body().querySelector('input[name="ciprate"][value="issues"]');
rate.checked = true; rate.dispatchEvent(new w.Event('change', {bubbles: true}));
ok(g(`CIP.periods['2025-H2'].manager.rating`) === 'issues', 'the manager\'s rating is kept');
// compare: none
d.querySelector('.cipcmp').open = true;
btn('[data-cipcmp="2025-H1"]').click(); await tick();
ok(!body().querySelector('.cippast .tag') && /Compare with: none/.test(body().textContent), 'comparing can be switched off');
btn('[data-cipcmp="2025-H1"]').click(); await tick();

// ---- lock the period from ⋯
$('cipMore').click(); await tick();
ok($('cipmenu').hasAttribute('open') && $('cmLock').textContent === 'Lock 2025 H2' && $('cmEdit').hidden && /yours alone/.test($('cmNote').textContent), 'the ⋯ menu offers the lock and says the CIP is private');
$('cmLock').click(); await tick(150);
ok(g(`CIP.periods['2025-H2'].locked`) && field('self.accomplishments').readOnly && !btn('[data-cipadd]') && /locked/.test(body().querySelector('.cipstat').textContent), 'a locked period is read-only');
$('cipMore').click(); await tick(); $('cmLock').click(); await tick(150);

// ---- the next period carries forward
pick($('cipPeriod'), '2026-H1'); await tick();
ok(/2026 H1 mid-year hasn't been started/.test(body().textContent) && btn('[data-cipstart="carry"]'), 'an unstarted period offers to carry forward');
btn('[data-cipstart="carry"]').click(); await tick(300);
ok(g(`CIP.periods['2026-H1'].goals[0].goal`) === 'Plan the month' && g(`CIP.periods['2026-H1'].goals[0].progress`) === '' && !g(`CIP.periods['2026-H1'].goals[0].locked`) &&
  g(`CIP.periods['2026-H1'].self.accomplishments`) === '' && g(`CIP.periods['2026-H1'].reviewer`) === 'Pat Boss', 'goals and the development plan carry, progress and self-evaluation start empty, unlocked');

// ---- four pillars
btn('[data-v="pillars"]', $('cipTabs')).click(); await tick();
ok($('cipPeriod').hidden && body().querySelectorAll('.pbox').length === 4 && /Now adds up to 95% \(should be 100%\)/.test(body().textContent), 'four pillars, with the split adding up');
typeIn(body().querySelector('[data-pf="pct"][data-bi="3"]'), '10');
ok($('ptNow').textContent === 'Now adds up to 100%' && g(`CIP.pillars.boxes[3].pct`) === 10, 'changing a share updates the total as you type');
ok(body().querySelector('[data-pb="3|0"]').classList.contains('hasnote'), 'a bubble with a plan is marked');
btn('[data-padd="1"]').click(); await tick();
ok($('cipbubdlg').hasAttribute('open') && $('cbDel').hidden && $('cbHead').textContent === 'New bubble', '+ opens a new bubble');
$('cbOk').click(); await tick(100);
ok(g(`CIP.pillars.boxes[1].items.length`) === 0 && !$('cipbubdlg').hasAttribute('open'), 'nothing typed, nothing kept');
btn('[data-padd="1"]').click(); await tick();
$('cbT').value = 'OEM relationships'; $('cbNote').value = 'Meet two OEMs'; $('cbOk').click(); await tick(100);
ok(g(`CIP.pillars.boxes[1].items[0].t`) === 'OEM relationships' && body().querySelector('[data-pb="1|0"]'), 'Done keeps a new bubble');
btn('[data-pb="0|1"]').click(); await tick();
ok($('cbT').value === 'Leads' && !$('cbDel').hidden, 'tapping a bubble opens it');
$('cbBox').value = '2'; $('cbOk').click(); await tick(100);
ok(g(`CIP.pillars.boxes[0].items.length`) === 1 && g(`CIP.pillars.boxes[2].items[0].t`) === 'Leads', 'and moves it to another pillar');
btn('[data-pb="2|0"]').click(); await tick();
confirms = []; $('cbDel').click(); await tick(100);
ok(/Remove the bubble "Leads" from Value\?/.test(confirms[0] || '') && g(`CIP.pillars.boxes[2].items.length`) === 0, 'the bin asks, naming it');

// ---- the reference
btn('[data-v="ref"]', $('cipTabs')).click(); await tick();
ok(/Job specific indicants/.test(body().textContent) && body().querySelector('mark.cipconfirm') && /Highly Productive/.test(body().textContent) &&
  /BU goals 2025/.test(body().textContent) && /Visit high focus accounts/.test(body().textContent) && /Team summary/.test(body().textContent) && /A Useful Book/.test(body().textContent), 'the reference shows all of it');
$('cipShare').click(); await tick(100);
ok(docOut().title === 'CIP reference' && /Job specific indicants/.test(docOut().html), 'Create and share on the reference makes the reference document');

// ---- Create and share the plan
btn('[data-v="plan"]', $('cipTabs')).click(); await tick();
pick($('cipPeriod'), '2025-H2'); await tick();
$('cipShare').click(); await tick();
ok($('cipoutdlg').hasAttribute('open') && $('coQWrap').hidden && !$('coRefWrap').hidden && /compared with 2025 H1/.test($('coNote').textContent), 'Create and share asks about the reference and says what it compares');
$('coRef').checked = true; $('coGo').click(); await tick(300);
const cd = docOut().html || '';
ok(/Sam_Sample_CIP_2025-H2_/.test(docOut().name) && /<title>Continuous Improvement Plan/.test(cd) && /@page\{size:A4/.test(cd), 'an A4 document, named for the person and period');
ok(/Newer wins/.test(cd) && /2025 H1:<\/b> Old wins/.test(cd) && /&#9746; Performance issues/.test(cd) && /Job specific indicants/.test(cd) && !/N\/A/.test(cd), 'with the answers, the period compared, the rating ticked and the reference; no N/A');

// ---- MBOs
w.eval(`go('mbo')`); await tick(150);
ok(g('screen') === 'mbo' && $('title').textContent === 'Performance' && d.body.classList.contains('planning'), 'MBOs open full width on a PC');
pick($('mboYear'), '2025'); await tick();
const mb = () => $('mboBody');
ok(/Annual cap \$4,000, up to \$1,000 paid a quarter · list agreed and locked/.test(mb().textContent), 'the cap and the quarter\'s share');
const cell = (id, q) => mb().querySelector('td[data-q="' + q + '"] [data-madd="' + id + '|' + q + '"]').closest('td');
ok(cell('m1', 'Q1').querySelectorAll('.mchip').length === 3 && /3 × \$500 = \$1,500/.test(cell('m1', 'Q1').textContent), 'completions show in their quarter, counted');
const foot = () => [...mb().querySelectorAll('tfoot tr')].map(r => [...r.children].map(c => c.textContent.trim()).filter(Boolean).join(' '));
ok(foot()[2].startsWith('Paid $1,000 $500 $0 $0 $1,500') && /Carried out \$500/.test(foot()[3]), 'a quarter pays up to its cap and carries the rest: ' + foot()[2]);
// add a completion
mb().querySelector('[data-madd="m2|Q2"]').click(); await tick();
ok($('mboentdlg').hasAttribute('open') && $('meSiteL').textContent === 'Objective or book' && $('meSite').getAttribute('list') === 'mboBooks' && /A Useful Book/.test($('mboBooks').innerHTML), 'a book MBO offers the booklist');
$('meOk').click(); await tick(100);
ok(!g(`mboYear().quarters.Q2`) || !g(`(mboYear().quarters.Q2.log.m2 || []).length`), 'nothing typed, nothing logged');
mb().querySelector('[data-madd="m2|Q2"]').click(); await tick();
$('meSite').value = 'A Useful Book – A. Author'; $('meDate').value = '2025-05-02'; $('meOk').click(); await tick(150);
ok(g(`mboYear().quarters.Q2.log.m2.length`) === 1 && foot()[2].startsWith('Paid $1,000 $750'), 'Done logs it and the totals follow');
// the Mega MBO
mb().querySelector('[data-mega="0"][data-v="yes"]').click(); await tick();
ok(/2025 total paid \$2,150/.test(foot().slice(-1)[0]), 'a Mega MBO met pays its share of the cap on top: ' + foot().slice(-1)[0]);
// lock Q1, then change a value: Q1 keeps its value
confirms = [];
mb().querySelector('[data-qlock="Q1"]').click(); await tick();
ok(/Lock Q1 as submitted\?/.test(confirms[0] || '') && g(`mboYear().quarters.Q1.snap.values.m1`) === 500 && !mb().querySelector('[data-madd="m1|Q1"]'), 'locking a quarter keeps its values and closes it to new entries');
// edit the list: unlock it from ⋯ first
$('mboMore').click(); await tick();
ok($('cmEdit').hidden && $('cmListLock').textContent === 'Unlock the 2025 MBO list' && $('cmLock').hidden, 'a locked list must be unlocked before editing');
$('cmListLock').click(); await tick(100);
$('mboMore').click(); await tick(); $('cmEdit').click(); await tick(100);
ok($('mboEditDone') && mb().querySelector('[data-mp="items.0.value"]'), 'Edit the MBO list shows the list to change, Done editing at the top');
typeIn(mb().querySelector('[data-mp="items.0.value"]'), '600');
ok(g(`mboYear().items[0].value`) === 600, 'values change');
mb().querySelector('[data-madditem]').click(); await tick();
typeIn(mb().querySelector('[data-mp="items.2.title"]'), 'Trade show leads');
$('mboEditDone').click(); await tick();
ok(/Trade show leads/.test(mb().textContent) && /3 × \$500 = \$1,500/.test(mb().querySelector('td[data-q="Q1"].lk').textContent), 'a locked quarter keeps the value it was locked at');
ok(/1 × \$250 = \$250/.test(cell('m2', 'Q2').textContent), 'open quarters follow the list');
// info
mb().querySelector('[data-minfo="m1"]').click(); await tick();
ok($('mboinfodlg').hasAttribute('open') && /Proof required:<\/b> Logged in CRM/.test($('miBody').innerHTML) && /Supports BU goal:<\/b> Protect annuity/.test($('miBody').innerHTML), 'the i shows proof, the BU goal and the definition');
$('miClose').click(); await tick();
// a new year copies the list
pick($('mboYear'), '2026'); await tick();
mb().querySelector('[data-ystart="copy"]').click(); await tick(100);
ok(g(`MBO.years['2026'].items.length`) === 3 && g(`MBO.years['2026'].mega[0].met`) === 'no' && !g(`MBO.years['2026'].quarters.Q1`) && $('mboEditDone'), 'a new year copies last year\'s list, quarters empty, ready to edit');
$('mboEditDone').click(); await tick();
// phone: one quarter at a time
pick($('mboYear'), '2025'); await tick();
mb().querySelector('#mboQ [data-v="Q2"]').click(); await tick();
ok(mb().querySelector('.mgrid').classList.contains('sq-Q2') && g(`cipUi.mq`) === 'Q2', 'on a phone the quarter buttons pick which quarter shows');
// the claim
$('mboShare').click(); await tick();
ok($('cipoutdlg').hasAttribute('open') && !$('coQWrap').hidden && $('coRefWrap').hidden && $('coQ').querySelector('.on').dataset.v === 'Q2', 'Create and share asks which quarter, defaulting to the last with entries');
$('coGo').click(); await tick(300);
const md = docOut().html || '';
ok(/MBO_claim_2025_Q2/.test(docOut().name) && /<title>MBO claim/.test(md) && /Q2, \$750 paid/.test(md) && /A Useful Book/.test(md) && /proof of completion/.test(md) && /02\/05\/2025/.test(md) && !/N\/A/.test(md), 'the claim has the grid, what is paid, and the quarter\'s proof');

// ---- sync and backup
await w.eval(`cipSaveNow()`); await tick(100);
ok(g(`['cip/me','cip/mbo','cip/ref'].every(k => cloudDirty[k])`), 'all three records are marked to sync');
const bk = await g(`buildBackup(false)`);
ok(Array.isArray(bk.cip) && bk.cip.length === 3, 'the backup carries them');
await g(`(async () => { for(const r of await cipAll()) await cipDel(r.id); await cipLoad(); })()`);
ok(!g(`CIP`) && !g(`MBO`), 'gone');
await g(`doRestore(new File([${JSON.stringify(JSON.stringify(bk))}], 'b.json'))`); await tick(200);
ok(g(`CIP && CIP.employee.name`) === 'Sam Sample' && g(`MBO.years['2025'].items.length`) === 3 && g(`CIPREF.books.length`) === 1, 'a restore brings them back');

// ---- the CIP and MBO page's "Save HTML copy": the plan as JSON, the lists as code that is read, never run
let ran = 0; w.alert = () => { ran++; };
const recH = {employee: {name: 'Jo Html', title: 'AM', hireDate: '', supervisor: 'Pat'}, periods: {'2026-H1': {locked: false, reviewer: 'Pat', reviewDate: '',
  self: {accomplishments: 'Shipped </b> and <!-- this', notMet: '', learned: '', support: '', comments: ''}, goals: [], strengths: [], gaps: [], manager: {rating: '', comments: ''}}},
  mbo: {years: {'2027': {cap: 8000, setupLocked: false, items: [], mega: [], quarters: {}}}}, pillars: {boxes: [{id: 'p1', title: 'Only', pct: 100, items: ['One']}]}};
const htmlCopy = '<!DOCTYPE html><html><body><script>/* lists */\nconst IND = [\n {area:"Area A", result:"Result A", items:[\n  {id:"i1", b:"Do the thing, well", s:"Often ⟦enough?⟧"}]}\n];\n' +
  'const LCI = [{group:"Group", items:[{id:"l1", t:\'Works "well"\'}]}];\nconst BU_YEAR = "2027";\nconst BU = [{csf:"CSF 1 – Grow", items:[{id:"b1", t:"Grow it", subs:["One","Two",]}]}];\n' +
  'const BOOKS = ["Book – Author",\n "Another"];\nconst REF=[{id:"r-fy26",title:"Team summary"}];\nconst FY26={fc:"Forecast up", goals:[["1","Grow"]], h1:["Done"], acc:[["Acme","X","Y","fine"]], g2:[["Area","ok"]]};\n' +
  'alert("never run");</script><script>window.__INIT_REC__=' + JSON.stringify({stamp: '9', rec: recH}).replace(/<\//g, '<\\/').replace(/<!--/g, '<\\!--') + ';</script></body></html>';
confirms = [];
await g(`cipImport`)(new w.File([htmlCopy], 'CIP_Form_2026-10-11.html', {type: 'text/html'})); await tick(200);
ok(/Replace your CIP/.test(confirms[0] || '') && /the reference/.test(confirms[0] || ''), 'the HTML copy replaces the plan, the MBOs and the reference, after asking');
ok(g(`CIP.employee.name`) === 'Jo Html' && g(`CIP.periods['2026-H1'].self.accomplishments`) === 'Shipped </b> and <!-- this' && g(`mboYears().join()`) === '2027' && g(`CIP.pillars.boxes[0].items[0].t`) === 'One', 'the plan comes out of the page whole, its escaping undone');
ok(g(`CIPREF.ind[0].items[0].b`) === 'Do the thing, well' && g(`CIPREF.ind[0].items[0].s`) === 'Often ⟦enough?⟧' && g(`CIPREF.lci[0].items[0].t`) === 'Works "well"' && g(`CIPREF.buYear`) === '2027' &&
  g(`CIPREF.bu[0].items[0].subs.join()`) === 'One,Two' && g(`CIPREF.books.length`) === 2 && g(`CIPREF.extra[0].title`) === 'Team summary' && g(`CIPREF.extra[0].blocks.length`) === 5, 'and the page\'s lists become the reference');
ok(ran === 0, 'nothing in the page is run');
let notPage = '';
try { await g(`cipImport`)(new w.File(['<html><body>hello</body></html>'], 'x.html')); } catch(e){ notPage = e.message; }
ok(/not the CIP and MBO page/.test(notPage), 'any other page is refused');
w.alert = () => {};

// ---- not a CIP file
let msg = '';
try { await g(`cipImport`)(file({hello: 1}, 'x.json')); } catch(e){ msg = e.message; }
ok(/not a CIP and MBO file/.test(msg), 'any other file is refused');

const real = errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
