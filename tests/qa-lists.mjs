// v97: the Lists tile - saved notes and the Not stocked products list, brought
// across from Task Slaughterer. Storage (IndexedDB v5), the screen and its
// tabs, the two editors (Done saves, blank is dropped, the bin asks first),
// the card menus, search, cloud marking, backup and the import.
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

await g(`(async () => {
  const list = [{a: 'Acme Pty Ltd - Smithfield', sub: 'Smithfield', z: 'Z1', foc: 'High', cad: CAD['High'], mgr: 'Ben', rep: '', c: []},
                {a: 'Widget Co', sub: 'Penrith', z: 'Z1', foc: 'Low', cad: CAD['Low'], mgr: 'Ben', rep: '', c: []}];
  await accReplaceAll(list); indexAccounts(list);
})()`);

// ---- storage
const stores = await g(`ready().then(d => [...d.objectStoreNames].sort().join(','))`);
ok(g('DB_VER') === 5 && stores === 'accounts,appts,calls,kv,products,snippets,tasks', 'database v5 with snippets and products stores: ' + stores);
ok(g('CLOUD_REC_STORES').includes('snippets') && g('CLOUD_REC_STORES').includes('products'), 'both sync through the cloud as record stores');
ok(g('DIALOGS').includes('snipdlg') && g('DIALOGS').includes('proddlg'), 'both editors registered in DIALOGS');

// ---- the tile and the screen
const tile = d.querySelector('.tiles [data-go="lists"]');
ok(tile && /Lists/.test(tile.textContent) && tile.querySelector('svg'), 'Lists tile on Home');
tile.click(); await tick();
ok(g('screen') === 'lists', 'the tile opens Lists');
const tabs = [...$('lsTabs').querySelectorAll('button')].map(b => b.textContent);
ok(tabs.join('|') === 'Saved notes|Products', 'two tabs: ' + tabs.join('|'));
ok(shown($('paneNotes')) && !shown($('paneProds')) && /No saved notes yet/.test($('snRes').textContent), 'starts on Saved notes, empty');
ok(g('PARENT.lists') === 'home', 'back goes Home');

// ---- a new saved note: blank is dropped
$('snNew').click(); await tick();
ok(open('snipdlg') && $('snHead').textContent === 'New saved note' && $('snDel').hidden, 'new note opens, no bin');
ok([...$('snReason').querySelectorAll('button')].map(b => b.textContent).join('|') === 'Won|Lost|Not Qualified|Other', 'reason chips: Won, Lost, Not Qualified, Other');
$('snOk').click(); await tick(100);
ok(!open('snipdlg') && !(await stored('snippets')).length, 'Done with nothing entered: nothing kept');

// ---- saved
$('snNew').click(); await tick();
input('snLabel', 'Close: went with another supplier');
chip('snReason', 'Lost');
input('snText', 'Opportunity closed. Customer went with another supplier on price.');
$('snOk').click(); await tick(100);
let S = await stored('snippets');
ok(S.length === 1 && S[0].label === 'Close: went with another supplier' && S[0].reason === 'Lost' && /on price/.test(S[0].text) && S[0].updated, 'Done saves it');
ok(g(`!!cloudDirty['snippets/${S[0].id}']`), 'and marks it for cloud sync');
ok(/Close: went with another supplier/.test($('snRes').textContent) && /Lost/.test($('snRes').textContent), 'card shows label and reason');

// ---- Other reason
$('snNew').click(); await tick();
input('snLabel', 'Close: budget pulled');
chip('snReason', 'Other');
ok(shown($('snOther')), 'Other opens a box for the reason');
input('snOther', 'Budget cut'); input('snText', 'Closed. No budget this year.');
$('snOk').click(); await tick(100);
S = await stored('snippets');
ok(S.some(x => x.reason === 'Budget cut'), 'a typed reason is kept');
const budget = S.find(x => x.reason === 'Budget cut');
await g(`openSnip('${budget.id}')`); await tick();
ok($('snReason').querySelector('button.on').dataset.v === 'Other' && $('snOther').value === 'Budget cut', 'reopens on Other with the text');
chip('snReason', 'Other');
ok(!$('snReason').querySelector('button.on') && $('snOther').hidden, 'tap again to deselect');
chip('snReason', 'Other');
$('snOk').click(); await tick(100);

// ---- Copy from the sheet and from the menu
await g(`openSnip('${budget.id}')`); await tick();
$('snCopy').click(); await tick(50);
ok(copied[copied.length - 1] === 'Closed. No budget this year.', 'Copy the text copies it');
$('snOk').click(); await tick(100);
ok(((await stored('snippets')).find(x => x.id === budget.id).lastUsed || 0) > 0, 'and counts as used');
ok($('snRes').querySelector('.rn').textContent === 'Close: budget pulled', 'the last one copied is at the top');
const other = (await stored('snippets')).find(x => x.reason === 'Lost');
d.querySelector('[data-snmenu="' + other.id + '"]').click(); await tick();
const acts = [...$('vmBody').querySelectorAll('[data-cm]')].map(b => b.textContent.trim());
ok(acts.join('|') === 'Copy the text|Duplicate|Delete', 'card menu: Copy the text, Duplicate, Delete');
$('vmBody').querySelector('[data-cm="0"]').click(); await tick(100);
ok(copied[copied.length - 1] === other.text && $('snRes').querySelector('.rn').textContent === other.label, 'copying from the menu works and moves it up');

// ---- Duplicate opens an unsaved copy
d.querySelector('[data-snmenu="' + other.id + '"]').click(); await tick();
$('vmBody').querySelector('[data-cm="1"]').click(); await tick();
ok(open('snipdlg') && $('snHead').textContent === 'Copy of saved note' && $('snLabel').value === other.label + ' (copy)', 'Duplicate opens a copy');
ok((await stored('snippets')).length === 2, 'not saved yet');
$('snOk').click(); await tick(100);
ok((await stored('snippets')).length === 3, 'Done keeps the copy');

// ---- delete asks, Cancel keeps
const dup = (await stored('snippets')).find(x => /\(copy\)/.test(x.label));
await g(`openSnip('${dup.id}')`); await tick();
answer = false; confirms = [];
$('snDel').click(); await tick(100);
ok(confirms.length === 1 && /Delete the saved note "Close: went with another supplier \(copy\)"/.test(confirms[0]) && open('snipdlg'), 'bin names it and Cancel keeps it open');
answer = true;
$('snDel').click(); await tick(150);
ok(!open('snipdlg') && (await stored('snippets')).length === 2, 'OK deletes it');
ok(g(`!!(cloudDirty['snippets/${dup.id}'] && cloudDirty['snippets/${dup.id}'].del)`), 'and the delete goes to the cloud');

// ---- products
d.querySelector('#lsTabs [data-pane="prods"]').click(); await tick();
ok(shown($('paneProds')) && !shown($('paneNotes')) && /No products yet/.test($('prRes').textContent), 'Products tab');
$('prNew').click(); await tick();
ok(open('proddlg') && [...$('prStatus').querySelectorAll('button')].map(b => b.textContent).join('|') === 'Not stocked|New product|Requested to stock', 'status chips');
ok($('prStatus').querySelector('button.on').dataset.v === 'Not stocked', 'Not stocked is the default');
ok($('prAcctList').children.length === 2, 'account picks from the CRM');
$('prOk').click(); await tick(100);
ok(!(await stored('products')).length, 'blank product dropped');
$('prNew').click(); await tick();
input('prName', 'Flush grid 6 in'); input('prPart', 'FG-6'); chip('prStatus', 'Requested to stock');
input('prAcct', 'Widget Co'); input('prNotes', 'Two a month');
$('prOk').click(); await tick(100);
let P = await stored('products');
ok(P.length === 1 && P[0].status === 'Requested to stock' && P[0].acct === 'Widget Co' && !P[0].stocked, 'product saved');
ok(/Flush grid 6 in/.test($('prRes').textContent) && /FG-6/.test($('prRes').textContent) && /Requested to stock/.test($('prRes').textContent), 'card: name, part, status');
ok(/1 open, 0 stocked/.test($('prHint').textContent), 'counts: ' + $('prHint').textContent);

// tick stocked in the sheet
await g(`openProd('${P[0].id}')`); await tick();
$('prStocked').checked = true; $('prStocked').dispatchEvent(new w.Event('change'));
ok(/Stocked today/.test($('prStockedAt').textContent), 'says when');
$('prOk').click(); await tick(100);
P = await stored('products');
ok(P[0].stocked && P[0].stockedAt > 0, 'stocked with a date');
ok(/Nothing here/.test($('prRes').textContent), 'gone from Open');
d.querySelector('#prView [data-v="stocked"]').click(); await tick();
ok(/Flush grid 6 in/.test($('prRes').textContent) && /stocked/.test($('prRes').textContent), 'on the Stocked tab');
// back via the menu
d.querySelector('[data-prmenu="' + P[0].id + '"]').click(); await tick();
ok(/Not stocked after all/.test($('vmBody').textContent), 'menu offers to undo it');
$('vmBody').querySelector('[data-cm="0"]').click(); await tick(100);
P = await stored('products');
ok(!P[0].stocked && P[0].stockedAt === null, 'back on the open list');
d.querySelector('#prView [data-v="open"]').click(); await tick();
d.querySelector('[data-prmenu="' + P[0].id + '"]').click(); await tick();
ok([...$('vmBody').querySelectorAll('[data-cm]')].map(b => b.textContent.trim()).join('|') === 'Mark stocked|Duplicate|Delete', 'open product menu: Mark stocked, Duplicate, Delete');
g(`closeVisitMenu()`);
// opened and closed with no change: not written again
const before = (await stored('products'))[0].updated;
await g(`openProd('${P[0].id}')`); await tick();
$('prOk').click(); await tick(100);
ok((await stored('products'))[0].updated === before, 'opening and closing changes nothing');

// ---- search
d.querySelector('#lsTabs [data-pane="notes"]').click(); await tick();
$('snSearch').click(); await tick();
input('fsQ', 'budget'); await tick(80);
ok(d.querySelectorAll('#fsRes [data-snopen]').length === 1 && /1 of 2/.test($('fsHint').textContent), 'search finds a saved note by its text');
d.querySelector('#fsRes [data-snopen]').click(); await tick();
ok(!$('srchdlg').hasAttribute('open') && open('snipdlg'), 'tapping a result closes search and opens it');
$('snOk').click(); await tick(100);
d.querySelector('#lsTabs [data-pane="prods"]').click(); await tick();
$('prSearch').click(); await tick();
input('fsQ', 'widget fg-6'); await tick(80);
ok(d.querySelectorAll('#fsRes [data-propen]').length === 1, 'search finds a product by account and part');
g(`closeSearch()`);

// ---- backup and restore carry them
const bk = await g(`buildBackup(false)`);
ok(bk.snippets.length === 2 && bk.products.length === 1, 'backup includes saved notes and products');

// ---- the Task Slaughterer import
const ts = {source: 'task-slaughterer-9000', templates: [
    {id: 'close-won', label: 'Close (won): installed', reason: 'Won', text: 'Opportunity closed, won.', createdAt: 1, lastUsed: 5},
    {id: 'close-nq', label: 'Close: never qualified', reason: 'Not Qualified', text: 'Speculative.', createdAt: 2}],
  products: [
    {id: 'pr-a', name: 'Round rings', part: 'RR-1', status: 'New product', account: 'acme smithfield', notes: '', stocked: false, stockedAt: null, createdAt: 3},
    {id: 'pr-b', name: 'Wearstrip', part: null, status: 'Not stocked', account: 'Someone Else Pty', notes: 'x', stocked: false, stockedAt: null, createdAt: 4}]};
w.__ts = ts;
const rep = await g(`importTaskSlaughterer(window.__ts)`);
ok(rep.added === 4 && /2 saved notes and 2 products brought in to Lists/.test(rep.line), 'a file with only saved notes and products imports: ' + rep.line);
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
ok(/Keep saved notes/.test($('s-help').textContent) && /Keep the Not stocked list/.test($('s-help').textContent), 'Help covers both');

const real = errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/i.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
