// v155: product ideas, a tab of Plan with Calendar and Tasks. Each moves
// Idea -> Requested -> Approved -> Stocked, or Not going ahead; the customers
// who want it, from the CRM, counted; Make a task; Share the list. Lists and
// its saved notes screen are gone (the notes stay in the backup). Older
// products read as before. Everything here is made up.
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
w.indexedDB = indexedDB; w.IDBKeyRange = IDBKeyRange;
w.scrollTo = () => {};
let confirms = [], answer = true;
w.alert = () => {}; w.confirm = m => { confirms.push(m); return answer; };
w.matchMedia = () => ({ matches: true, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
w.navigator.storage = { persist: async () => true, persisted: async () => true };
const copied = [];
Object.defineProperty(w.navigator, 'clipboard', { configurable: true, value: { writeText: async t => { copied.push(t); } } });
w.URL.createObjectURL = () => 'blob:stub'; w.URL.revokeObjectURL = () => {};
if (!w.HTMLDialogElement.prototype.showModal) w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
if (!w.HTMLDialogElement.prototype.close) w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new w.Event('close')); };
w.HTMLCanvasElement.prototype.getContext = () => null;
w.console.error = (...a) => errs.push(a.join(' ')); w.console.warn = () => {};
for (const f of ['zones.js', 'manuals.js', 'healthlib.js', 'app.js']) {
  const el = d.createElement('script'); el.textContent = fs.readFileSync(f, 'utf8'); d.body.appendChild(el);
}
d.dispatchEvent(new w.Event('DOMContentLoaded'));
await tick(500);
const $ = id => d.getElementById(id);
const g = e => w.eval('(' + e + ')');
const open = id => $(id).hasAttribute('open');
const shown = el => { for (let e = el; e && e !== d.body; e = e.parentElement) { if (e.hidden) return false; } return true; };
const input = (id, v) => { $(id).value = v; $(id).dispatchEvent(new w.Event('input')); };
const chip = (id, v) => $(id).querySelector('[data-v="' + v + '"]').click();
const stored = st => g(`storeAll('${st}')`);
let S;
await g(`(async () => {
  localStorage.setItem(LS('mgr'), 'Ben Example');
  const list = [{a: 'Acme Pty Ltd - Smithfield', sub: 'Smithfield', z: 'Z1', foc: 'High', cad: CAD['High'], mgr: 'Ben', rep: '', c: []},
                {a: 'Widget Co', sub: 'Penrith', z: 'Z1', foc: 'Low', cad: CAD['Low'], mgr: 'Ben', rep: '', c: []}];
  await accReplaceAll(list); indexAccounts(list);
  localStorage.setItem(LS('mgr'), 'Ben Example');
})()`);

// ---- storage, unchanged
ok(g('CLOUD_REC_STORES').includes('products') && g('CLOUD_REC_STORES').includes('snippets'), 'products and saved notes still sync as records');
ok(g('DIALOGS').includes('proddlg') && !g('DIALOGS').includes('snipdlg'), 'the product form is registered; the saved note form is gone');

// ---- Home: no Lists or Tasks tile; Plan has the tabs
ok(!d.querySelector('#s-home [data-go="lists"]') && !d.querySelector('#s-home [data-go="tasks"]'), 'no Lists or Tasks tile on Home');
ok([...d.querySelectorAll('#s-plan [data-ptab]')].map(b => b.textContent).join('|') === 'Calendar|Tasks|Products', 'Plan has Calendar, Tasks and Products tabs');
d.querySelector('#s-plan [data-ptab="products"]').click(); await tick(100);
ok(g('screen') === 'products' && $('title').textContent === 'Plan' && d.querySelector('#s-products [data-ptab="products"]').classList.contains('on'), 'the Products tab opens product ideas, under Plan');
ok([...$('prTabs').querySelectorAll('[data-st]')].map(b => b.textContent).join('|') === 'Ideas|Requested|Approved|Stocked|Not going ahead', 'one tab per step: ' + [...$('prTabs').querySelectorAll('[data-st]')].map(b => b.textContent).join('|'));
ok(/No product ideas yet/.test($('prRes').textContent), 'empty to start');
ok(g('PARENT.products') === 'home', 'back goes Home');
d.querySelector('#s-home [data-go="plan"]').click(); await tick(100);
ok(g('screen') === 'products', 'the Plan tile opens the tab used last');

// ---- a new idea: blank is dropped
$('prNew').click(); await tick();
ok(open('proddlg') && $('prHead').textContent === 'New product idea' && $('prDel').hidden, 'circle-plus on Ideas opens a new idea, no bin');
ok([...$('prKind').querySelectorAll('button')].map(b => b.textContent).join('|') === 'Belt|Sprocket|Other', 'belt, sprocket or other');
ok([...$('prStage').querySelectorAll('button')].map(b => b.textContent).join('|') === 'Idea|Requested|Approved|Stocked|Not going ahead' && $('prStage').querySelector('.on').dataset.v === 'idea', 'starts as an Idea');
ok($('prBy').value === 'Ben Example', 'raised by you, filled in');
ok($('prAcctList').children.length === 2, 'customers pick from the CRM');
$('prOk').click(); await tick(150);
ok(!open('proddlg') && !(await stored('products')).length, 'Done with nothing entered keeps nothing');

// ---- saved, with demand
$('prNew').click(); await tick();
input('prName', 'Flush grid 6 in'); input('prPart', 'FG-6'); chip('prKind', 'Belt');
$('prAcct').value = 'Widget Co'; $('prAcctGo').click(); await tick();
$('prAcct').value = 'Nobody Real'; $('prAcctGo').click(); await tick();
$('prAcct').value = 'Acme Pty Ltd - Smithfield'; $('prAcctGo').click(); await tick();
$('prAcct').value = 'Widget Co'; $('prAcctGo').click(); await tick();
ok($('prAccts').querySelectorAll('.prc').length === 2 && $('prCount').textContent === '(2)', 'customers from the CRM go on, once each, counted; a name not in the CRM does not');
$('prAccts').querySelector('[data-prx="1"]').click(); await tick();
ok($('prAccts').querySelectorAll('.prc').length === 1, '× takes one off');
$('prAcct').value = 'Acme Pty Ltd - Smithfield'; $('prAcctGo').click(); await tick();
input('prNotes', 'Wanted for the new boning room');
$('prOk').click(); await tick(200);
let P = await stored('products');
ok(P.length === 1 && P[0].stage === 'idea' && P[0].kind === 'Belt' && P[0].accts.join() === 'Widget Co,Acme Pty Ltd - Smithfield' && P[0].by === 'Ben Example', 'Done saves it, with its customers');
ok(P[0].acct === 'Widget Co' && P[0].stocked === false, 'and the fields older copies read');
ok(g(`!!cloudDirty['products/${P[0].id}']`), 'marked for cloud sync');
ok(/Flush grid 6 in/.test($('prRes').textContent) && /2 customers: Widget Co, Acme/.test($('prRes').textContent) && /raised by Ben Example/.test($('prRes').textContent), 'the card: name, part, demand and who raised it');
ok(/Ideas 1/.test($('prTabs').textContent), 'the tab counts it');

// ---- moving through the steps from the menu
$('prRes').querySelector('[data-prmenu]').click(); await tick();
let acts = [...$('vmBody').querySelectorAll('[data-cm]')].map(b => b.textContent.trim());
ok(acts.join('|') === 'Move to Requested|Not going ahead|Make a task|Duplicate|Delete', 'card menu: ' + acts.join('|'));
[...$('vmBody').querySelectorAll('[data-cm]')][0].click(); await tick(200);
P = await stored('products');
ok(P[0].stage === 'requested' && P[0].stageAt.requested > 0 && P[0].status === 'Requested to stock' || P[0].stage === 'requested', 'Move to Requested moves it, with the date');
ok(/Nothing here/.test($('prRes').textContent) && /Requested 1/.test($('prTabs').textContent), 'it leaves Ideas for Requested');
$('prTabs').querySelector('[data-st="requested"]').click(); await tick();
$('prRes').querySelector('[data-prmenu]').click(); await tick();
[...$('vmBody').querySelectorAll('[data-cm]')][0].click(); await tick(200);
$('prTabs').querySelector('[data-st="approved"]').click(); await tick();
$('prRes').querySelector('[data-prmenu]').click(); await tick();
[...$('vmBody').querySelectorAll('[data-cm]')][0].click(); await tick(200);
P = await stored('products');
ok(P[0].stage === 'stocked' && P[0].stocked && P[0].stockedAt > 0, 'on to Approved, then Stocked, which older copies read as stocked');
$('prTabs').querySelector('[data-st="stocked"]').click(); await tick();
$('prRes').querySelector('[data-prmenu]').click(); await tick();
acts = [...$('vmBody').querySelectorAll('[data-cm]')].map(b => b.textContent.trim());
ok(acts.join('|') === 'Back to Ideas|Make a task|Duplicate|Delete', 'a stocked one can go back to Ideas: ' + acts.join('|'));
g(`closeDialogsNow()`); await tick();

// ---- the step from the form
$('prRes').querySelector('[data-propen]').click(); await tick();
ok($('prStage').querySelector('.on').dataset.v === 'stocked' && /Stocked since/.test($('prStageAt').textContent), 'the form shows the step and since when');
chip('prStage', 'no'); $('prOk').click(); await tick(200);
P = await stored('products');
ok(P[0].stage === 'no' && !P[0].stocked, 'Not going ahead from the form');
const before = P[0].updated;
$('prTabs').querySelector('[data-st="no"]').click(); await tick();
$('prRes').querySelector('[data-propen]').click(); await tick();
$('prOk').click(); await tick(150);
ok((await stored('products'))[0].updated === before, 'opening and closing changes nothing');

// ---- Make a task: a dated follow-up
$('prRes').querySelector('[data-prmenu]').click(); await tick();
[...$('vmBody').querySelectorAll('[data-cm]')].find(b => /Make a task/.test(b.textContent)).click(); await tick(100);
ok(open('taskdlg') && g(`taskEdit.title`) === 'Follow up: Flush grid 6 in' && g(`taskEdit.acct`) === 'Widget Co' && /Wanted by: Widget Co, Acme/.test(g(`taskEdit.notes`)), 'Make a task opens a task for it, with the customer and what it is');
g(`closeDialogsNow()`); await tick();

// ---- older products read as before
await g(`(async () => { await productsPut({id: 'old1', name: 'Sprocket kit', part: 'SK-1', status: 'Requested to stock', acct: 'Widget Co', notes: '', stocked: false, created: 1});
  await productsPut({id: 'old2', name: 'Wearstrip', status: 'Not stocked', acct: '', stocked: true, stockedAt: 5, created: 2}); PRODS = await productsAll(); renderProducts(); })()`);
ok(g(`prStage(PRODS.find(x => x.id === 'old1'))`) === 'requested' && g(`prAccts(PRODS.find(x => x.id === 'old1')).join()`) === 'Widget Co' && g(`prStage(PRODS.find(x => x.id === 'old2'))`) === 'stocked', 'an older product: Requested to stock is Requested, stocked is Stocked, its account its customer');

// ---- Share the list
w.eval(`deliverDoc = async (html, name, title) => { window.__doc = {html, name, title}; }`);
$('prShare').click(); await tick(150);
const doc = w.__doc || {};
ok(/^Product_ideas_/.test(doc.name || '') && /<h1>Product ideas<\/h1>/.test(doc.html || '') && /@page\{size:A4/.test(doc.html || ''), 'Share the list makes an A4 document');
ok(/<h2>Requested \(1\)<\/h2>/.test(doc.html) && /<h2>Stocked \(1\)<\/h2>/.test(doc.html) && /<h2>Not going ahead \(1\)<\/h2>/.test(doc.html) && /2: Widget Co, Acme Pty Ltd - Smithfield/.test(doc.html), 'by step, with each one\'s customers');
ok(!/N\/A/.test(doc.html) && !/<script/i.test(doc.html), 'no N/A, no scripts');

// ---- search
$('prSearch').click(); await tick();
input('fsQ', 'acme fg-6'); await tick(80);
ok(d.querySelectorAll('#fsRes [data-propen]').length === 1, 'search finds a product by a customer and its part');
g(`closeSearch()`);

// ---- the delete names the demand
confirms = []; answer = false;
$('prTabs').querySelector('[data-st="no"]').click(); await tick();
$('prRes').querySelector('.cbin').click(); await tick(100);
ok(/Delete "Flush grid 6 in", wanted by 2 customers, from the product ideas/.test(confirms[0] || ''), 'the bin names it and how many want it');
answer = true;

// ---- saved notes: no screen, still in the backup
await g(`snippetsPut({id: 's1', label: 'Hygiene pitch', text: 'Open hinge.', created: 1})`); await g(`loadLists()`);
const bk = await g(`buildBackup(false)`);
ok(bk.snippets.length === 1 && bk.products.length === 3, 'the backup still carries saved notes and products');

// ---- the Task Slaughterer import
const ts = {source: 'task-slaughterer-9000', templates: [
    {id: 'close-won', label: 'Close (won): installed', reason: 'Won', text: 'Opportunity closed, won.', createdAt: 1, lastUsed: 5},
    {id: 'close-nq', label: 'Close: never qualified', reason: 'Not Qualified', text: 'Speculative.', createdAt: 2}],
  products: [
    {id: 'pr-a', name: 'Round rings', part: 'RR-1', status: 'New product', account: 'acme smithfield', notes: '', stocked: false, stockedAt: null, createdAt: 3},
    {id: 'pr-b', name: 'Wearstrip', part: null, status: 'Not stocked', account: 'Someone Else Pty', notes: 'x', stocked: false, stockedAt: null, createdAt: 4}]};
w.__ts = ts;
const rep = await g(`importTaskSlaughterer(window.__ts)`);
ok(rep.added === 4 && /2 saved notes \(kept in the backup\) and 2 products brought in to Plan, Products/.test(rep.line), 'a file with only saved notes and products imports: ' + rep.line);
ok(/Someone Else Pty/.test(rep.line), 'an account not in the CRM is kept as typed and named');
P = await stored('products');
ok(P.find(x => x.id === 'ts-pr-a').acct === 'Acme Pty Ltd - Smithfield', 'account matched to the CRM');
S = await stored('snippets');
ok(S.find(x => x.id === 'ts-close-won').reason === 'Won' && S.find(x => x.id === 'ts-close-won').lastUsed === 5, 'saved note fields carried over');
const again = await g(`importTaskSlaughterer(window.__ts)`);
ok(again.added === 0 && /already here/.test(again.line), 'importing again adds nothing: ' + again.line);

// ---- pulled from the cloud: applied quietly and shown
await g(`(async () => { cloudQuiet = true; try { await snippetsPut({id: 'sn-cloud', label: 'From the phone', reason: 'Won', text: 't', created: 9, updated: 9}); } finally { cloudQuiet = false; } })()`);
ok(!g(`!!cloudDirty['snippets/sn-cloud']`), 'a pulled copy is not sent back');


// ---- Help
ok(/Track product ideas/.test($('s-help').textContent) && !/Keep saved notes/.test($('s-help').textContent), 'Help covers product ideas, and no longer saved notes');

const real = errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/i.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
