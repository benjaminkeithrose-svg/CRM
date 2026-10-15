// v159: Create and share as buttons, not dropdowns, and Copy for email on the
// PC: the notes on the clipboard, styled in place, without pictures, to paste
// into Outlook. The real copy was tried in Chromium; this is jsdom.
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
// a clipboard that keeps what it is given, as Chrome's does
let clip = null;
w.ClipboardItem = class { constructor(o){ this.o = o; } };
Object.defineProperty(w.navigator, 'clipboard', { configurable: true, value: {
  write: async items => { const out = {}; for (const [t, p] of Object.entries(items[0].o)) out[t] = await (await p).text(); clip = out; },
  writeText: async t => { clip = {'text/plain': t}; } } });
w.eval(`toast = m => { window.__t = m; }`);
await g(`startTestCall()`); await tick(300);
await g(`(async () => { call.summary = 'Went well\\n• trial agreed\\n• quote Friday'; await saveCall(); })()`);

// ---- buttons, not dropdowns
g(`openOutDlg()`); await tick(100);
const seg = id => [...$(id).querySelectorAll('button')].map(b => b.textContent + (b.classList.contains('on') ? '*' : '')).join('|');
ok($('outScope').hidden && $('outImg').hidden && $('outDest').hidden, 'the three dropdowns are out of sight');
ok(seg('outScopeSeg') === 'Full call notes*|Health check only|Belt requirements only', 'Include is a row of buttons: ' + seg('outScopeSeg'));
ok(/^Full size\*\|Thumbnails, expandable\|Thumbnails only/.test(seg('outImgSeg')), 'so is Images: ' + seg('outImgSeg'));
ok(seg('outDestSeg') === 'Copy for email*|Open in a new tab|Download to this PC', 'Send to leads with Copy for email on the PC: ' + seg('outDestSeg'));
ok($('outGo').textContent === 'Copy for email' && /paste into an email in Outlook/.test($('outDlgHint').textContent), 'the main button and the line under it say so');
$('outDestSeg').querySelector('[data-v="download"]').click(); await tick(30);
ok($('outDest').value === 'download' && $('outGo').textContent === 'Create and save' && /\*$/.test(seg('outDestSeg').split('|')[2]), 'tapping a button picks it');
$('outScopeSeg').querySelector('[data-v="health"]').click(); await tick(30);
ok($('outScope').value === 'health' && /This is for handing to the customer/.test($('outDlgHint').textContent), 'and the hint follows');
$('outScopeSeg').querySelector('[data-v="full"]').click();
$('outDestSeg').querySelector('[data-v="copy"]').click(); await tick(30);

// ---- Copy for email
$('outGo').click(); await tick(800);
const h = (clip || {})['text/html'] || '', t = (clip || {})['text/plain'] || '';
ok(h.length > 200 && t.length > 50, 'the notes go to the clipboard as formatted text and plain text');
ok(!/<img/i.test(h) && !/<style/i.test(h) && !/<script/i.test(h) && !/class="/.test(h), 'no pictures, stylesheet, scripts or classes: Outlook keeps what is there');
ok(/style="/.test(h) && /<li[^>]*>trial agreed<\/li>/.test(h), 'each part styled in place, and the summary\'s bullets as a list');
ok(/Copied: paste it into the email with Ctrl\+V/.test(w.__t || ''), 'and says how to use it: ' + w.__t);
ok(g(`!!call.shared`) && g(`call.status`) === 'compiled', 'the call notes count as issued');

ok(errs.length === 0, 'no errors', errs.join(' | '));
console.log(`PASS ${pass}` + (fail ? `  FAIL ${fail}` : ''));
process.exit(fail ? 1 : 0);
