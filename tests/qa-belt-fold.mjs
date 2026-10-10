// v98: the belt form folds into sections, each with a line saying what is in
// it; a new belt opens on Belt data, a logged one opens folded. Settings'
// Update data is three sections.
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
w.scrollTo = () => {}; w.alert = () => {}; w.confirm = () => true;
w.matchMedia = () => ({ matches: true, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
w.navigator.storage = { persist: async () => true, persisted: async () => true };
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
const input = (id, v) => { $(id).value = v; $(id).dispatchEvent(new w.Event('input', { bubbles: true })); };
const isOpen = id => $(id).open;

// ---- the sections
const secs = [...d.querySelectorAll('#s-belt details.bsx')];
ok(secs.map(x => x.querySelector('summary b').textContent).join('|') === 'Belt data|Sprockets|Flights and sideguards|Photos and comments|Quote contact',
  'five sections: ' + secs.map(x => x.querySelector('summary b').textContent).join('|'));
ok(!d.querySelector('#s-belt h2'), 'no loose headings left');
ok(!$('bAsset').closest('details'), 'the asset field sits above them, always showing');

// ---- a new belt: Belt data open, the rest folded, each with a line
await g(`(async () => { call = {id: 'c1', customer: 'Acme', date: '10/10/2026', type: 'Site call', contacts: [], entries: [], loose: [], updated: 1}; openEntry('belt', true); })()`);
await tick(100);
ok(g('screen') === 'belt', 'belt form open');
ok(isOpen('bxBelt') && !isOpen('bxSpr') && !isOpen('bxAcc') && !isOpen('bxPho') && !isOpen('bxQuo'), 'new belt: Belt data open, the rest folded');
ok($('sumBelt').textContent === 'Not filled in' && $('sumAcc').textContent === 'None on this belt' && $('sumPho').textContent === 'None yet' &&
  $('sumQuo').textContent === 'Uses the call contacts', 'empty lines read sensibly: ' + ['sumBelt', 'sumSpr', 'sumAcc', 'sumPho', 'sumQuo'].map(i => $(i).textContent).join(' / '));

// typing updates the lines
input('bAsset', 'Line 3 infeed');
input('bDesc', 'S800 FT');
input('bWidth', '606'); input('bLen', '18.4');
input('bComment', 'Edge modules worn on the drive side');
$('bSkipSpr').checked = true; $('bSkipSpr').dispatchEvent(new w.Event('change', { bubbles: true }));
input('bQc', 'Jo Bloggs');
await tick(120);
ok(/S800 FT/.test($('sumBelt').textContent) && /606 mm × 18.4 m/.test($('sumBelt').textContent), 'Belt data line: ' + $('sumBelt').textContent);
ok($('sumSpr').textContent === 'Not assessed', 'Sprockets line follows the Skip tick');
ok(/Edge modules worn/.test($('sumPho').textContent), 'Photos and comments line: ' + $('sumPho').textContent);
ok($('sumQuo').textContent === 'Contact: Jo Bloggs', 'Quote contact line');

// saved, then reopened: folded
$('bSave').click(); await tick(200);
const n = g('call.entries.length');
ok(n === 1 && g('call.entries[0].width') === '606', 'Done still saves the belt');
await g(`openLogged(0)`); await tick(100);
ok(secs.every(x => !x.open), 'a logged belt opens with every section folded');
ok(/S800 FT/.test($('sumBelt').textContent) && $('sumSpr').textContent === 'Not assessed' && /Edge modules/.test($('sumPho').textContent),
  'and the lines show what is in it: ' + $('sumBelt').textContent);
// opening a section by tapping its name still works and keeps the values
$('bxBelt').querySelector('summary').click(); await tick();
ok(isOpen('bxBelt') && $('bWidth').value === '606', 'tapping a section name opens it, values intact');
// a copy also opens folded
await g(`openLogged(0, true)`); await tick(100);
ok(secs.every(x => !x.open), 'a copy opens folded too');

// on a quote request the last section is For the quote
await g(`(async () => { call = {id: 'q1', rectype: 'quote', customer: 'Acme', date: '10/10/2026', contacts: [], entries: [], loose: [], updated: 1}; openEntry('belt', true); })()`);
await tick(100);
ok($('bxQuoHead').textContent === 'For the quote' && !$('bQuoteRow').hidden && /ID not confirmed/.test($('sumQuo').textContent),
  'quote request: For the quote, with the TSG line: ' + $('sumQuo').textContent);
input('bQty', '2'); $('bTsg').checked = true; $('bTsg').dispatchEvent(new w.Event('change', { bubbles: true })); await tick(120);
ok(/Qty 2/.test($('sumQuo').textContent) && /ID confirmed with TSG/.test($('sumQuo').textContent), 'and follows them: ' + $('sumQuo').textContent);

// ---- Settings: Update data is three sections
const sx = [...d.querySelectorAll('#s-settings details.sx')].map(x => x.querySelector('summary b').textContent);
ok(['CRM and belt data', 'Engineering manuals', 'Other imports'].every(t => sx.includes(t)) && !sx.includes('Update data'), 'Settings sections: ' + sx.join(' | '));
ok($('sxData').contains($('xlsxFile')) && $('sxData').contains($('assetFile')) && $('sxData').contains($('refFile')), 'CRM and belt data holds the CRM, register and belt reference imports');
ok($('sxMan').contains($('ixList')) && $('sxMan').contains($('manFile')), 'Engineering manuals holds the downloads and the PDF import');
ok($('sxOther').contains($('tsFile')) && $('sxOther').contains($('ovFile')), 'Other imports holds Task Slaughterer and zone overrides');
ok(!/Update data/.test($('s-help').textContent), 'Help no longer sends you to Update data');

const real = errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/i.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
