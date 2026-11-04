// v192: accessories. The OneTrack list (wearstrips, retainer rings, tools...)
// loaded in Settings with the belt data; a line picked with a row of chips per
// choice, the wearstrip starting on the snap-on, 500 ft, 1/4 in frame; lines on
// a belt and as the call's own Accessories; printed in the quote request and the
// call notes; a OneTrack tab in Reference; accessory favourites on the order
// sheet and in the customer's form. Made-up list and part numbers (EX-...) only.
import { JSDOM } from 'jsdom';
import fs from 'fs';
import 'fake-indexeddb/auto';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  x ' + m); } };
const tick = (ms = 50) => new Promise(r => setTimeout(r, ms));
const errs = [];
const html = fs.readFileSync('index.html', 'utf8');
const dom = new JSDOM(html.replace(/<script[^>]*src=[^>]*><\/script>/g, ''), { runScripts: 'dangerously', url: 'https://example.org/', pretendToBeVisual: true });
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
for (const f of ['zones.js', 'manuals.js', 'healthlib.js', 'orderform.js', 'app.js']) {
  const el = d.createElement('script'); el.textContent = fs.readFileSync(f, 'utf8'); d.body.appendChild(el);
}
d.dispatchEvent(new w.Event('DOMContentLoaded'));
await tick(500);
const $ = id => d.getElementById(id);
const g = e => w.eval('(' + e + ')');
w.eval(`toast = m => { window.__t = m; }`);
w.eval(`deliverFile = async (blob, name) => { window.__file = {name, text: await blob.text()}; }`);
const chip = (sel, text) => [...d.querySelectorAll(sel + ' button')].find(b => b.textContent.trim() === text);
const tap = async (sel, text) => { const b = chip(sel, text); if (b) b.click(); await tick(20); return !!b; };
const done = async () => { $('axOk').click(); await tick(150); };
const menu = async (sel, label) => { d.querySelector(sel).click(); await tick(30);
  const b = [...d.querySelectorAll('#vmBody [data-cm]')].find(x => x.textContent.includes(label)); if (b) b.click(); await tick(150); return !!b; };

ok(!(html.match(/id="[^"]+"/g) || []).some((x, i, a) => a.indexOf(x) !== i), 'no id is used twice in the page (v192 found four)');

const A = 'Example Foods - Smithfield';
await g(`(async () => {
  const list = [{a: '${A}', sub: 'Smithfield', z: 'Z1', foc: 'High', cad: CAD['High'], mgr: 'Ben', rep: '', c: [{n: 'Jo Bloggs', t: 'Engineer', e: ['jo@example.com'], p: ''}]}];
  await accReplaceAll(list); indexAccounts(list);
  REF = {combos: [['800', 'FLAT TOP', 'POLYPROPYLENE', 'WHITE'], ['1600', 'FLUSH GRID', 'POLYPROPYLENE', 'BLUE']], geom: [], sprockets: [],
    pitch: {'800': 50.8}, indentGroups: [], materials: ['POLYPROPYLENE'], colours: [], rods: ['POLYPROPYLENE'], flightTypes: [], sideguardTypes: [],
    counts: {combos: 2, series: 2, sprockets: 0, geom: 0}, imported: Date.now()};
  buildBeltRef();
})()`); await tick(50);

// ---- the list, loaded in Settings
const LIST = {kind: 'field-crm-accessories', version: 1, source: 'Made-up test list',
  groups: [
    {id: 'wearstrip', name: 'Wearstrip', fields: ['Type', 'Length', 'Frame size', 'Colour'], note: 'UHMW-PE', defaults: {'Type': 'Snap-on', 'Frame size': '1/4 in'}},
    {id: 'retainer', name: 'Retainer ring', fields: ['Type', 'Shaft size'], note: 'Stainless'},
    {id: 'tool', name: 'Tool', fields: ['Type', 'For']},
    {id: 'shaft', name: 'Stainless shaft', fields: ['Type', 'Square size'], note: 'Machined to order'}],
  items: [
    {group: 'wearstrip', desc: 'Flat wearstrip, 10 ft, natural', opts: {'Type': 'Flat', 'Length': '10 ft', 'Colour': 'Natural'}, item: 'EX-W1'},
    {group: 'wearstrip', desc: 'Flat wearstrip, 10 ft, blue', opts: {'Type': 'Flat', 'Length': '10 ft', 'Colour': 'Blue'}, item: 'EX-W2'},
    {group: 'wearstrip', desc: 'Snap-on wearstrip, 500 ft, for a 3/16 in frame', opts: {'Type': 'Snap-on', 'Length': '500 ft', 'Frame size': '3/16 in', 'Colour': 'Natural'}, item: 'EX-W3'},
    {group: 'wearstrip', desc: 'Snap-on wearstrip, 500 ft, for a 3/8 in frame', opts: {'Type': 'Snap-on', 'Length': '500 ft', 'Frame size': '3/8 in', 'Colour': 'Natural'}, item: 'EX-W4'},
    {group: 'wearstrip', desc: 'Snap-on wearstrip, 500 ft, for a 1/4 in frame', opts: {'Type': 'Snap-on', 'Length': '500 ft', 'Frame size': '1/4 in', 'Colour': 'Natural'}, item: 'EX-W5'},
    {group: 'retainer', desc: 'Split retainer ring, square shaft, 40 mm', opts: {'Type': 'Split, square shaft', 'Shaft size': '40 mm'}, item: 'EX-R1'},
    {group: 'retainer', desc: 'Split retainer ring, square shaft, 60 mm', opts: {'Type': 'Split, square shaft', 'Shaft size': '60 mm'}, item: 'EX-R2'},
    {group: 'retainer', desc: 'Snap ring, square shaft, 1 in', opts: {'Type': 'Snap ring', 'Shaft size': '1 in'}, item: 'EX-R3'},
    {group: 'tool', desc: '3-link belt puller set', opts: {'Type': 'Belt puller', 'For': '3-link set'}, item: 'EX-T1', series: ['800']},
    {group: 'tool', desc: '5-link belt puller set', opts: {'Type': 'Belt puller', 'For': '5-link set'}, item: 'EX-T2', series: ['1600']},
    {group: 'tool', desc: 'Belt replacement ruler', opts: {'Type': 'Ruler', 'For': 'All belts'}, item: 'EX-T3'},
    {group: 'shaft', desc: 'Square shaft, 40 mm, machined to order', opts: {'Type': 'Square shaft', 'Square size': '40 mm'}, item: '', note: 'Machined to order: give the length'}]};
Object.defineProperty($('axFile'), 'files', { value: [new w.File([JSON.stringify(LIST)], 'accessories.json', {type: 'application/json'})], configurable: true });
$('axBtn').click(); await tick(200);
ok(g('axList() && axList().items.length') === 12 && /Loaded 12 accessories in 4 groups/.test(w.__t), 'the list loads in Settings: ' + w.__t);
ok(/12<\/b> accessories in <b>4<\/b> groups/.test($('axStat').innerHTML), 'Settings says what is loaded');
ok((await g(`kvGet('beltref')`)).accessories.items.length === 12, 'kept with the belt data, so it syncs with it');
Object.defineProperty($('axFile'), 'files', { value: [new w.File(['{"kind":"something-else"}'], 'x.json')], configurable: true });
$('axBtn').click(); await tick(100);
ok(/did not load: that is not an accessory list/.test(w.__t) && g('axList().items.length') === 12, 'another file is refused and the list kept');
errs.splice(0, errs.length);   // the refusal is logged on purpose
ok(/accessories: \(REF && REF\.accessories\) \|\| undefined/.test(fs.readFileSync('app.js', 'utf8')), 'a workbook re-import keeps it (importRef carries it over)');

// ---- the OneTrack tab in Reference
await g(`showRef('ot')`); await tick(50);
ok(!$('paneOt').hidden && d.querySelectorAll('#otList details').length === 4 && /EX-W5/.test($('otList').textContent) && /Machined to order/.test($('otList').textContent),
  'Reference, OneTrack: each group folded, with part numbers and notes');

// ---- the call's own accessories
await g(`(async () => {
  call = {id: 'q1', rectype: 'quote', customer: '${A}', date: '03/11/2026', type: 'Quote request', mgr: 'Ben', contacts: [], loose: [], status: 'open', updated: 1,
    entries: [{type: 'belt', asset: 'CV-1', series: '800', style: 'FLAT TOP', beltmat: 'POLYPROPYLENE', width: '600', photos: []}]};
  await saveCall(); go('dash');
})()`); await tick(100);
ok(!!d.querySelector('#s-dash [data-go="acc"]') && $('cntAcc').textContent === '', 'the call has an Accessories tile');
d.querySelector('#s-dash [data-go="acc"]').click(); await tick(100);
ok(g('screen') === 'acc' && $('axdlg').hasAttribute('open') && g('AXD.isNew'), 'it opens the call\'s accessories, and the picker straight away when there are none');
ok([...d.querySelectorAll('#axGroup button')].map(b => b.textContent).join() === 'Wearstrip,Retainer ring,Tool,Stainless shaft', 'the groups as chips');
await tap('#axGroup', 'Wearstrip');
ok(/EX-W5/.test($('axHit').textContent) && /1\/4 in frame/.test($('axHit').textContent), 'a wearstrip starts on the snap-on, 500 ft, 1/4 in frame: ' + $('axHit').textContent);
ok(d.querySelector('#axSteps [data-axf="1"] .on') && d.querySelector('#axSteps [data-axf="1"] .on').textContent === '500 ft', 'its length follows, the only one for a snap-on');
$('axQty').value = '3'; $('axNote').value = 'Line 2';
await done();
const lines = () => g(`(call.entries.find(e => e.type === 'acc') || {lines: []}).lines`);
ok(!$('axdlg').hasAttribute('open') && lines().length === 1 && lines()[0].item === 'EX-W5' && lines()[0].qty === '3' && lines()[0].note === 'Line 2', 'Done adds the line');
ok(/Snap-on wearstrip/.test($('acList').textContent) && /Qty 3 · EX-W5 · Line 2/.test($('acList').textContent), 'and it is listed');
// a frame size changes the item
$('acAdd').click(); await tick(80);
await tap('#axGroup', 'Wearstrip'); await tap('#axSteps [data-axf="2"]', '3/8 in');
ok(/EX-W4/.test($('axHit').textContent), 'another frame size, another part number');
await tap('#axSteps [data-axf="0"]', 'Flat');
ok(!d.querySelector('#axSteps [data-axf="2"]') || ![...d.querySelectorAll('#axSteps label')].some(l => l.textContent === 'Frame size') , 'a flat wearstrip has no frame size to choose');
ok(/2 fit/.test($('axHit').textContent), 'two flat ones fit until a colour is picked');
await tap('#axSteps [data-axf="2"]', 'Blue');
ok(/EX-W2/.test($('axHit').textContent), 'blue: one part number');
await done();
ok(lines().length === 2 && lines()[1].item === 'EX-W2', 'the second line');

// tools: the belts' series first
$('acAdd').click(); await tick(80);
await tap('#axGroup', 'Tool'); await tap('#axSteps [data-axf="0"]', 'Belt puller');
ok(/EX-T1/.test($('axHit').textContent) && !$('axAllW').hidden, 'a belt puller for the S800 belt on the call, the others behind a tick: ' + $('axHit').textContent);
$('axAll').checked = true; $('axAll').dispatchEvent(new w.Event('change')); await tick(20);
ok(/2 fit/.test($('axHit').textContent), 'ticked, the 5-link set shows too');
await tap('#axSteps [data-axf="1"]', '5-link set');
await done();
ok(lines()[2].item === 'EX-T2', 'and can be picked');
// no part number: made to order
$('acAdd').click(); await tick(80);
await tap('#axGroup', 'Stainless shaft');
ok(/none: Machined to order/.test($('axHit').textContent), 'a shaft says it has no part number and why');
await done();
ok(lines()[3].item === '' && lines()[3].info === 'Machined to order: give the length', 'the line keeps the note for customer service');

// change, duplicate, remove
d.querySelector('#acList [data-axo="0"]').click(); await tick(80);
ok($('axdlg').hasAttribute('open') && !$('axDel').hidden && $('axQty').value === '3', 'tap a line to change it; it can be removed from there');
$('axQty').value = '4'; await done();
ok(lines()[0].qty === '4' && lines().length === 4, 'the change is kept, no line added');
ok(await menu('#acList [data-axm="1"]', 'Duplicate') && $('axdlg').hasAttribute('open') && lines().length === 4, 'Duplicate opens a copy, not saved yet');
await done();
ok(lines().length === 5 && lines()[2].item === 'EX-W2' && lines()[2].id !== lines()[1].id, 'Done adds the copy after it');
asked = '';
ok(await menu('#acList [data-axm="2"]', 'Remove') && /Remove Flat wearstrip, 10 ft, blue \(quantity 1\)/.test(asked) && lines().length === 4, 'Remove names it and asks');

// on the call log and in the documents
await g(`go('dash')`); await tick(80);
ok(/Accessories/.test($('logList').textContent) && /4 × Snap-on wearstrip/.test($('logList').textContent) && $('cntAcc').textContent === '4 listed', 'one card on the request for all of them');
const rfq = await w.buildRFQHTML('full');
ok(/<h2>Accessories to quote<\/h2>/.test(rfq) && /EX-W5/.test(rfq) && /EX-T2/.test(rfq) && /Machined to order: give the length/.test(rfq) && /Line 2/.test(rfq), 'the quote request has them, with part numbers and notes');
const notes = await w.buildNotesHTML('belts', 'full');
ok(/<h2>Accessories<\/h2>/.test(notes) && /EX-W5/.test(notes), 'and the belt requirements');
ok(/4 accessories/.test(g(`histLine(call)`)), 'the call history counts them');

// ---- a belt's own accessories
await g(`openEntry('belt', true)`); await tick(100);
$('bAsset').value = 'CV-2';
w.eval(`serSel().value = '800'; onSeries()`); await tick(20);
$('bAxAdd').click(); await tick(80);
await tap('#axGroup', 'Retainer ring'); await tap('#axSteps [data-axf="0"]', 'Split, square shaft'); await tap('#axSteps [data-axf="1"]', '40 mm');
$('axQty').value = '10'; await done();
ok(g('BAX.length') === 1 && $('sumAx').textContent === '1 accessory' && /EX-R1/.test($('bAxList').textContent), 'on the belt form, held with the belt');
$('bSave').click(); await tick(200);
const cv2 = g(`call.entries.find(e => e.asset === 'CV-2')`);
ok(cv2 && cv2.acc && cv2.acc.length === 1 && cv2.acc[0].item === 'EX-R1' && cv2.acc[0].qty === '10', 'Done saves them on the belt');
const rfq2 = await w.buildRFQHTML('full');
ok(/<th class="grp" colspan="2">Accessories<\/th>/.test(rfq2) && /Split retainer ring, square shaft, 40 mm/.test(rfq2) && /Qty 10 · EX-R1/.test(rfq2), 'and print as a band under that belt');
const i2 = g(`call.entries.findIndex(e => e.asset === 'CV-2')`);
await g(`openLogged(${i2})`); await tick(100);
ok(g('BAX.length') === 1, 'opening the belt again brings them back');
await g(`openEntry('belt', true)`); await tick(50);
ok(g('BAX.length') === 0 && $('sumAx').textContent === '', 'a new belt starts with none');

// ---- order sheet: an accessory favourite, and the customer's form
await g(`(async () => { call = null; openAccount('${A}'); })()`); await tick(80);
$('avOrders').click(); await tick(50);
$('osAdd').click(); await tick(50);
await tap('#ofKind', 'Accessory');
ok(!$('ofAcc').hidden && $('ofAccNone').hidden && d.querySelectorAll('#ofAxGroup button').length === 4, 'Accessory is a third kind of favourite');
await tap('#ofAxGroup', 'Wearstrip'); await tick(700);
const fav = () => g(`(osFor('${A}').accessories || [])[0]`);
ok(fav() && fav().choices.length === 1 && fav().choices[0].item === 'EX-W5', 'the usual wearstrip comes ticked');
d.querySelector('#ofAxItems [data-axi="3"]').click(); await tick(700);
ok(fav().choices.length === 2 && fav().choices.map(c => c.item).join() === 'EX-W5,EX-W4', 'tap another to let them choose it too');
ok(/Wearstrip/.test(g(`ofLine('accessory', osFor('${A}').accessories[0])`)) || /or/.test(g(`ofLine('accessory', osFor('${A}').accessories[0])`)), 'its line says the choices');
const fd = g(`osFormData('${A}', 'Jo Bloggs', osList(osFor('${A}')).filter(x => x.kind === 'accessory'))`);
ok(fd.accessories.length === 1 && fd.accessories[0].choices.length === 2 && fd.accessories[0].label === 'Wearstrip' && !('internalNote' in fd.accessories[0]), 'baked for the form, with no sales note');
const form = g(`orderFormHTML(${JSON.stringify(fd)})`);
ok(/<h2>Accessories<\/h2>|Accessories<\/h2>/.test(form) && /EX-W5/.test(form) && /belts, sprockets and accessories/.test(form), 'the customer\'s form has an Accessories card');
// the customer's file, on its own
const cdom = new JSDOM(form, { runScripts: 'dangerously', url: 'https://example.org/form.html', pretendToBeVisual: true });
await tick(100);
const cd = cdom.window.document, c$ = id => cd.getElementById(id), fid = fd.accessories[0].id;
c$('hd_' + fid).click();
const two = [...cd.querySelectorAll('#ch_' + fid + ' button')];
ok(two.length === 2 && /EX-W5/.test(c$('desc_' + fid).textContent), 'the customer sees both, the first chosen, with its part number');
two[1].click(); c$('qty_' + fid).value = '2'; c$('add_' + fid).click();
ok(/Accessory/.test(c$('itemList').textContent) && /3\/8 in frame/.test(c$('itemList').textContent) && /2 off/.test(c$('itemList').textContent), 'and adds one to the request');

ok(!errs.length, 'no errors: ' + errs.slice(0, 3).join(' | '));
console.log(`accessories: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
