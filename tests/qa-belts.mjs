// v170: belts at a customer - every belt logged in its calls and quote requests,
// one row per belt (the latest), a status kept on the belt, ticks for the list,
// and the list as a document and an Excel file. Everything here is made up.
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
w.eval(`toast = m => { window.__t = m; }`);
const A = 'Acme Foods - Smithfield', B = 'Example Dairy - Penrith';
const belt = (o) => Object.assign({type: 'belt', asset: '', beltdesc: '', series: '', style: '', beltmat: '', colour: '', rodmat: '', width: '', beltlen: '', clength: '', comment: '', qty: '', photos: []}, o);
await g(`(async () => {
  const list = [{a: '${A}', sub: 'Smithfield', z: 'Z1', foc: 'High', cad: CAD['High'], mgr: 'Ben', rep: '', c: []},
                {a: '${B}', sub: 'Penrith', z: 'Z1', foc: 'High', cad: CAD['High'], mgr: 'Ben', rep: '', c: []}];
  await accReplaceAll(list); indexAccounts(list);
})()`);
const rec = (id, cust, date, when, entries, extra) => Object.assign({id, customer: cust, date, type: 'Site call', mgr: 'Ben', contacts: [], entries, loose: [], status: 'done', when, closed: true, updated: when}, extra || {});
w.__recs = [
  rec('c1', A, '03/03/2026', Date.parse('2026-03-03'), [belt({asset: '61-555', series: '800', style: 'Flat Top', beltmat: 'PP', colour: 'White', rodmat: 'PP', width: '600', beltlen: '18', comment: 'Edge wear'}), belt({beltdesc: 'Infeed belt', width: '300', comment: 'Tracking off'})]),
  rec('c2', A, '12/10/2026', Date.parse('2026-10-12'), [belt({asset: '61 555', series: '800', style: 'Flat Top', beltmat: 'PP', colour: 'White', rodmat: 'PP', width: '600', beltlen: '18', comment: 'Worse now, quote for a replacement'})]),
  rec('q1', A, '01/09/2026', Date.parse('2026-09-01'), [belt({asset: 'P-12', series: '1100', style: 'Flush Grid', beltmat: 'AC', width: '450', beltlen: '9.5', qty: '2', comment: 'Spare belt'})], {rectype: 'quote'}),
  rec('c3', B, '01/10/2026', Date.parse('2026-10-01'), [belt({asset: 'B-1', comment: 'Other customer'})]),
  rec('c4', A, '02/10/2026', Date.parse('2026-10-02'), [belt({asset: 'T-1', comment: 'A test'})], {test: true})];
await g(`(async () => { for(const r of window.__recs) await callsPut(r); indexCalls(await callsAll()); })()`);

// ---- the account shows a Belts card
g(`openAccount('${A}')`); await tick(300);
ok(!$('avBelts').hidden && /3 belts reported on, 3 open/.test($('avBelts').textContent), 'the account has a Belts card: ' + $('avBelts').textContent);
$('avBelts').click(); await tick(300);
ok(g(`screen`) === 'belts' && $('btHead').textContent === A, 'tapping it opens the Belts list for the customer');
const rows = () => [...$('btList').querySelectorAll('.btrow')];
const row = n => rows().find(r => r.querySelector('b').textContent === n);
ok(rows().length === 3 && rows()[0].querySelector('b').textContent === '61 555', 'one row per belt, newest first; another customer\'s and test calls left out: ' + rows().map(r => r.querySelector('b').textContent).join(', '));
ok(/Worse now/.test(row('61 555').textContent) && /also logged 3 Mar 2026/.test(row('61 555').textContent) && /From the call of 12 Oct 2026/.test(row('61 555').textContent), 'a belt logged twice shows the latest note, and when it was logged before');
ok(/S800 Flat Top PP White, PP rods/.test(row('61 555').textContent) && /600 mm wide · 18 m long/.test(row('61 555').textContent), 'with the belt and its size');
ok(/From the quote request of 1 Sep 2026/.test(row('P-12').textContent) && /qty 2/.test(row('P-12').textContent), 'quote requests are included, and say so');
ok(row('Infeed belt') && /Tracking off/.test(row('Infeed belt').textContent) && ![...row('Infeed belt').querySelectorAll('.btm')].some(x => x.textContent === 'Infeed belt'), 'a belt with no asset number is a row of its own, named once');
ok(/3 of 3 belts ticked/.test($('btCount').textContent) && /All 3/.test($('btFilter').textContent), 'all ticked to start');

// ---- status: kept on the latest logging
row('61 555').querySelector('[data-bts="ordered"]').click(); await tick(300);
const c2 = (await g(`callsAll()`)).find(c => c.id === 'c2');
ok(c2.entries[0].bstat === 'ordered' && c2.entries[0].bstatAt > 0 && c2.updated > Date.parse('2026-10-12'), 'Ordered is kept on the belt in its latest call');
ok(/Ordered/.test(row('61 555').querySelector('.tag').textContent) && /61 555: Ordered/.test(w.__t), 'and shows on the row');
row('P-12').querySelector('[data-bts="gone"]').click(); await tick(300);
ok((await g(`recordsAll()`)).find(c => c.id === 'q1').entries[0].bstat === 'gone', 'No longer needed is kept on the quote request\'s belt');
$('btFilter').querySelector('[data-btf="open"]').click(); await tick(200);
ok(rows().length === 1 && row('Infeed belt'), 'the Open filter shows only what is still open');
$('btFilter').querySelector('[data-btf="all"]').click(); await tick(200);
row('61 555').querySelector('[data-bts="open"]').click(); await tick(300);
ok(!(await g(`callsAll()`)).find(c => c.id === 'c2').entries[0].bstat, 'Open again clears it');
row('61 555').querySelector('[data-bts="ordered"]').click(); await tick(300);
await g(`renderBeltsCard()`);
ok(/3 belts reported on, 1 open/.test($('avBelts').textContent), 'the account card counts follow: ' + $('avBelts').textContent);

// ---- untick, then the outputs carry only what is ticked
row('Infeed belt').querySelector('[data-btk]').click(); await tick(200);
ok(/2 of 3 belts ticked/.test($('btCount').textContent) && row('Infeed belt').classList.contains('off'), 'unticking leaves it out of the list, and greys it');
let doc = null; w.__doc = (h, n) => { doc = {h, n}; };
w.eval(`deliverDoc = async (h, n) => window.__doc(h, n)`);
$('btDoc').click(); await tick(200);
ok(doc && /Belts reported — Acme Foods - Smithfield/.test(doc.h) && /2 belts reported on, as at/.test(doc.h) && /_belts_\d{4}-\d{2}-\d{2}\.html$/.test(doc.n), 'Document: the customer, how many, the date');
ok(/Worse now, quote for a replacement/.test(doc.h) && /<td>Ordered<\/td>/.test(doc.h) && /<td>No longer needed<\/td>/.test(doc.h) && !/Tracking off/.test(doc.h) && !/N\/A/.test(doc.h), 'each ticked belt with its note and status; the unticked one left out; no N/A');
let file = null; w.__file = (b, n) => { file = {b, n}; };
w.eval(`deliverFile = async (b, n) => window.__file(b, n)`);
$('btXls').click(); await tick(300);
const wb = w.XLSX.read(new Uint8Array(await file.b.arrayBuffer()), {type: 'array'});
const aoa = w.XLSX.utils.sheet_to_json(wb.Sheets['Belts'], {header: 1, defval: ''});
ok(/\.xlsx$/.test(file.n) && /Acme Foods - Smithfield: belts reported/.test(aoa[0][0]) && aoa[2][0] === 'Asset or line' && aoa.length === 5 && aoa[3][0] === '61 555' && aoa[3][7] === 'Ordered' && aoa[4][4] === '2', 'Excel: a heading, the columns, and the ticked belts with qty and status');

const real = errs.filter(x => !/Not implemented|Could not parse CSS/.test(x));
ok(real.length === 0, 'no errors', real.join(' | '));
console.log(`PASS ${pass}` + (fail ? `  FAIL ${fail}` : ''));
process.exit(fail ? 1 : 0);
