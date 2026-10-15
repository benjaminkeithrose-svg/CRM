// v152: Arrange Home (move and hide tiles, kept per person in the private cip
// store), the Performance tile with CIP and MBO tabs, and What's new.
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
const names = () => [...d.querySelectorAll('#s-home .tiles > button[data-go]')].filter(b => !b.hidden).map(b => b.dataset.go);
const rows = () => [...$('homeArrList').querySelectorAll('li:not(.arrhid)')];

// ---- Arrange Home from the ⋯ menu
const before = names();
ok(before.includes('perf') && !before.includes('cip') && !before.includes('mbo'), 'one Performance tile, no separate CIP and MBO');
$('hdMenu').click(); await tick();
const first = [...$('vmBody').querySelectorAll('button')][0];
ok(first && /Arrange Home/.test(first.textContent), 'Arrange Home is first in the ⋯ menu');
first.click(); await tick();
ok(!$('homeArr').hidden && d.querySelector('#s-home .tiles').hidden, 'arranging replaces the tiles with a list');
ok(rows().length === before.length && $('homeArrList').querySelector('[data-up]').disabled, 'one row per tile; the top one cannot move up');
const second = before[1];
$('homeArrList').querySelector('[data-up="' + second + '"]').click(); await tick();
$('homeArrList').querySelector('[data-hide="perf"]').click(); await tick();
ok(/Hidden/.test($('homeArrList').textContent) && $('homeArrList').querySelector('[data-show="perf"]'), 'Hide moves a tile under Hidden, with Show');
ok((await g(`cipAll()`)).length === 0, 'nothing saved until Done');
$('homeArrDone').click(); await tick(300);
const after = names();
ok(after[0] === second && after[1] === before[0] && !after.includes('perf'), 'Done puts the tiles in the new order and hides the hidden one');
ok(!$('homeArr').hidden === false && !d.querySelector('#s-home .tiles').hidden, 'and the tiles come back');
const rec = (await g(`cipAll()`)).find(r => r.id === 'home');
ok(rec && rec.order[0] === second && rec.hidden.includes('perf') && rec.updated > 0, 'kept in the private cip store as record home');
ok(g(`!!cloudDirty['cip/home']`), 'and marked to sync to your other devices');
ok(g(`CIP`) === null, 'it is not taken for a CIP');
ok(JSON.parse(w.localStorage.getItem(g(`LS('homeLayout')`))).hidden.includes('perf'), 'and remembered on this device for a fast start');

// ---- leaving Home mid-arrange keeps it
$('hdMenu').click(); await tick();
[...$('vmBody').querySelectorAll('button')][0].click(); await tick();
$('homeArrList').querySelector('[data-show="perf"]').click(); await tick();
w.showScreen('settings'); await tick(200);
w.showScreen('home'); await tick();
ok($('homeArr').hidden && !d.querySelector('#s-home .tiles').hidden && names().includes('perf'), 'leaving Home while arranging keeps the change and shows the tiles again');

// ---- a newer layout from another device
await g(`cipPut({id:'home', order:['perf'], hidden:[], updated: Date.now() + 1000})`);
await g(`homeLayoutLoad()`);
ok(names()[0] === 'perf', 'a newer layout synced in from another device is applied');
await g(`cipPut({id:'home', order:['${second}'], hidden:['perf'], updated: 5})`);
await g(`homeLayoutLoad()`);
ok(names()[0] === 'perf', 'an older one is not');

// ---- Performance: one tile, CIP and MBO tabs
d.querySelector('.tiles [data-go="perf"]').click(); await tick(200);
ok(g('screen') === 'cip', 'Performance opens on CIP');
$('s-cip').querySelector('[data-perf="mbo"]').click(); await tick(200);
ok(g('screen') === 'mbo' && $('s-mbo').querySelector('[data-perf="mbo"]').classList.contains('on'), 'the MBO tab opens MBOs');
w.showScreen('home'); await tick();
d.querySelector('.tiles [data-go="perf"]').click(); await tick(200);
ok(g('screen') === 'mbo', 'and the tile goes back to the tab last used');
$('s-mbo').querySelector('[data-perf="cip"]').click(); await tick(200);
ok(g('screen') === 'cip', 'the CIP tab goes back');

// ---- What's new under the version in Settings
w.showScreen('settings'); await tick(100);
const notes = $('chgNotes');
ok(notes && /What's new/.test(notes.textContent) && notes.querySelector('details[open] summary').textContent.includes(g('APP_BUILD')), "Settings has What's new, this version open at the top");
ok(g(`CHANGES.every(c => /^v\\d+$/.test(c[0]) && c[1].length > 10)`), 'every note has a version and words');
ok(g(`CHANGES[0][0]`) === g('APP_BUILD'), 'the newest note is for this build');
ok(!/Baiada|JBS/i.test(notes.textContent), 'no customer names in the notes');

ok(errs.length === 0, 'no console errors: ' + errs.join(' | '));
console.log(`PASS ${pass}` + (fail ? ` FAIL ${fail}` : ''));
process.exit(fail ? 1 : 0);
