// v179: fewer steps. Mark the call done right after sending the notes; the
// belts logged most as one-tap chips; a quote request opens its belt straight
// away; Create and share puts the way it was sent last first.
import { JSDOM } from 'jsdom';
import fs from 'fs';
import 'fake-indexeddb/auto';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  x ' + m); } };
const tick = (ms = 50) => new Promise(r => setTimeout(r, ms));
const errs = [];
const dom = new JSDOM(fs.readFileSync('index.html', 'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g, ''),
  { runScripts: 'dangerously', url: 'https://example.org/', pretendToBeVisual: true });
const w = dom.window, d = w.document;
w.indexedDB = indexedDB; w.IDBKeyRange = IDBKeyRange;
w.scrollTo = () => {}; w.alert = () => {};
let asked = ''; w.confirm = m => { asked = m; return true; };
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
w.eval(`toast = m => { window.__t = m; }`);
const A = 'Example Foods - Smithfield';
await g(`(async () => {
  const list = [{a: '${A}', sub: 'Smithfield', z: 'Z1', foc: 'High', cad: CAD['High'], mgr: 'Ben', rep: '', c: [{n: 'Jo Bloggs', t: 'Engineer', e: [], p: ''}]}];
  await accReplaceAll(list); indexAccounts(list);
  REF = {combos: [['800', 'Flat Top', 'PP', 'White'], ['800', 'Flush Grid', 'PP', 'White'], ['1100', 'Flush Grid', 'AC', 'Blue'], ['2400', 'Raised Rib', 'PP', 'Blue']],
    geom: [], sprockets: [], pitch: {}, indentGroups: [], materials: [], colours: [], rods: [], flightTypes: [], sideguardTypes: []};
  buildBeltRef();
  USE = {style: {'800': {'Flat Top': 7, 'Flush Grid': 1}, '1100': {'Flush Grid': 4}, '*': {'Flat Top': 7, 'Flush Grid': 5}}};
  call = {id: 'c1', customer: '${A}', date: '27/10/2026', type: 'Site call', mgr: 'Ben', contacts: [], entries: [], loose: [], status: 'open', updated: Date.now()};
  await saveCall(); go('dash');
})()`); await tick(100);

// ---- the usual belts, one tap
await g(`openEntry('belt', true)`); await tick(80);
const chips = [...d.querySelectorAll('#bUsual [data-us]')].map(b => b.textContent);
ok(!$('bUsual').hidden && chips.join('|') === 'S800 Flat Top|S1100 Flush Grid|S800 Flush Grid', 'the belts logged most, most first: ' + chips.join('|'));
d.querySelector('#bUsual [data-us="1100"]').click(); await tick(30);
ok($('bSeries').value === '1100' && $('bStyle').value === 'Flush Grid' && d.querySelector('#bUsual [data-us="1100"]').classList.contains('on'), 'one tap sets the series and the style');
ok([...d.querySelectorAll('#bMatChips [data-v]')].some(b => b.dataset.v === 'AC'), 'and the materials for it are offered');
g(`go('dash')`); await tick(50);

// ---- sent: Mark this call done, right there
ok(!d.querySelector('#outHint .outdone'), 'nothing to finish before the notes are sent');
await g(`(async () => { call.entries.push({type: 'note', topic: 'Other', text: 'x', photos: []}); await markShared('notes.html'); renderOutSummary(); })()`); await tick(50);
const btn = d.querySelector('#outHint .outdone');
ok(btn && btn.textContent === 'Mark this call done', 'once sent, Mark this call done is under Create and share');
asked = '';
btn.click(); await tick(200);
ok(!asked && !g('call') && g('screen') === 'home' && (await g(`callsAll()`)).find(c => c.id === 'c1').closed, 'one tap: done, no question, back home');

// ---- the way it was sent last comes first
w.localStorage.removeItem('fcrm.outLast');
await g(`(async () => { call = {id: 'c2', customer: '${A}', date: '27/10/2026', type: 'Site call', mgr: 'Ben', contacts: [], entries: [{type: 'note', topic: 'Other', text: 'x', photos: []}], loose: [], status: 'open', updated: Date.now()}; await saveCall(); go('dash'); })()`); await tick(80);
w.navigator.share = async () => {}; w.navigator.canShare = () => true;
$('doOutput').click(); await tick(50);
const first = () => d.querySelector('#outDestSeg button');
ok(first().dataset.v === 'share' && first().classList.contains('go'), 'at first, the share sheet leads');
w.eval(`sendNotes = async () => {}`);
d.querySelector('#outDestSeg [data-v="download"]').click(); await tick(80);
ok(w.localStorage.getItem('fcrm.outLast') === 'download', 'the way it was sent is remembered');
$('doOutput').click(); await tick(50);
ok(first().dataset.v === 'download' && first().classList.contains('go') && /Save to this phone/.test(first().textContent), 'next time, Save to this phone is first, as the main button');
g(`closeOutDlg()`);

// ---- a quote request opens its belt straight away
g(`go('home')`);
d.querySelector('[data-go="newcall"]').click(); await tick(50);
d.querySelector('#newPick [data-new="quote"]').click(); await tick(50);
g(`chooseAccount('${A}')`); await tick(80);
$('ctList').querySelector('input[data-i="0"]').checked = true;
$('openCall').click(); await tick(300);
ok(g('call && call.rectype') === 'quote' && g('screen') === 'belt', 'the quote request opens on its belt');
$('bAsset').value = 'P-12'; $('barDone').click(); await tick(300);
ok(g('screen') === 'dash' && g(`call.entries.length`) === 1, 'Done puts the belt on the request and shows it');

const real = errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/i.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
