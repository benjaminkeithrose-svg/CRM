// v183: the order sheet. An account's favourites (belts and sprockets, each
// with the choices the customer may make), kept in the shared plans store;
// Send order form makes the customer's file from the ticked ones, with no
// catalogue and no sales note in it; the Belt Order Builder's favourites come
// in from its export. Then the customer's file itself: pick, add, copy.
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
for (const f of ['zones.js', 'manuals.js', 'healthlib.js', 'orderform.js', 'app.js']) {
  const el = d.createElement('script'); el.textContent = fs.readFileSync(f, 'utf8'); d.body.appendChild(el);
}
d.dispatchEvent(new w.Event('DOMContentLoaded'));
await tick(500);
const $ = id => d.getElementById(id);
const g = e => w.eval('(' + e + ')');
w.eval(`toast = m => { window.__t = m; }`);
let shared = null;
w.eval(`deliverFile = async (blob, name) => { window.__file = {name, text: await blob.text()}; }`);
const A = 'Example Foods - Smithfield';
await g(`(async () => {
  const list = [{a: '${A}', sub: 'Smithfield', z: 'Z1', foc: 'High', cad: CAD['High'], mgr: 'Ben', rep: '',
    c: [{n: 'Jo Bloggs', t: 'Engineer', e: ['jo@example.com'], p: ''}, {n: 'Sam Lee', t: 'Purchasing', e: [], p: ''}]}];
  await accReplaceAll(list); indexAccounts(list);
  REF = {combos: [['800', 'FLAT TOP', 'POLYPROPYLENE', 'WHITE'], ['800', 'FLAT TOP', 'POLYPROPYLENE', 'BLUE'], ['800', 'FLAT TOP', 'ACETAL', 'BLUE'],
      ['800', 'FLUSH GRID', 'POLYPROPYLENE', 'WHITE'], ['400', '45 DEG ANGLED ROLLER', 'POLYPROPYLENE', 'GREY']],
    geom: [['800', 'FLAT TOP', 'POLYPROPYLENE', 152.4, 1, 1, 0]],
    sprockets: [['800', '40 mm square', '11T 85 mm', 'ACETAL', 'SPR 800 11T AC 40SQ', 'P-0001'], ['800', '40 mm square', '11T 85 mm', 'POLYPROPYLENE', 'SPR 800 11T PP 40SQ', 'P-0002'],
      ['800', '40 mm square', '19T 154 mm', 'ACETAL', 'SPR 800 19T AC 40SQ', 'P-0003'], ['800', '1.5 in round', '11T 85 mm', 'ACETAL', 'SPR 800 11T AC 1.5R', 'P-0004']],
    pitch: {'800': 50.8}, indentGroups: [], materials: ['POLYPROPYLENE', 'ACETAL'], colours: [], rods: ['ACETAL', 'POLYPROPYLENE'], flightTypes: ['STREAMLINE'], sideguardTypes: ['STANDARD']};
  buildBeltRef();
  openAccount('${A}');
})()`); await tick(100);

// ---- the account's card
ok(/Order sheet/.test($('avOrders').textContent) && /No favourites yet/.test($('avOrders').textContent), 'the account has an Order sheet card');
$('avOrders').click(); await tick(50);
ok(g('screen') === 'orders' && $('osHead').textContent === A && $('osSend').disabled, 'it opens the sheet; nothing to send yet');

// ---- a belt favourite
$('osAdd').click(); await tick(50);
ok(g('screen') === 'ofav' && !$('ofBelt').hidden && !$('ofKindW').hidden, 'Add favourite opens a new belt');
$('ofSeries').value = '800'; $('ofSeries').dispatchEvent(new w.Event('change')); await tick(20);
$('ofStyle').value = 'FLAT TOP'; $('ofStyle').dispatchEvent(new w.Event('change')); await tick(20);
const chip = (id, v) => [...$(id).querySelectorAll('button')].find(b => b.dataset.v === v);
ok([...$('ofMats').querySelectorAll('[data-v]')].map(b => b.dataset.v).join('|') === 'ACETAL|POLYPROPYLENE', 'materials made in that style are offered');
chip('ofMats', 'POLYPROPYLENE').click(); await tick(20);
ok([...$('ofCols').querySelectorAll('[data-v]')].map(b => b.dataset.v).join('|') === 'BLUE|WHITE', 'colours for the material picked');
chip('ofMats', 'ACETAL').click(); await tick(20);
chip('ofCols', 'WHITE').click(); await tick(20);
chip('ofCols', 'BLUE').click(); await tick(20);
d.querySelector('#ofWQuick [data-qw="450"]').click(); await tick(20);
ok(g('OF.f.widths').join() === '457' && /457 mm added/.test($('ofWMsg').textContent), '+ 450 adds the nearest width it is built at: ' + $('ofWMsg').textContent);
$('ofW').value = '600'; $('ofWAdd').click(); await tick(20);
ok(g('OF.f.widths').join() === '457,600' && /not a standard built width/.test($('ofWMsg').textContent), 'a typed width is added and checked');
$('ofSprOn').click(); await tick(20);
ok(g('OF.f.bore') === '40 mm square', 'sprockets with it start at 40 mm square');
$('ofSprPd').value = '11T 85 mm'; $('ofSprPd').dispatchEvent(new w.Event('change')); await tick(20);
$('ofSprMat').value = 'ACETAL'; $('ofSprMat').dispatchEvent(new w.Event('change')); await tick(20);
ok(g('OF.f.sprPn') === 'P-0001' && /SPR 800 11T AC 40SQ/.test($('ofSprDesc').textContent), 'the sprocket is matched in the catalogue');
$('ofNote').value = 'Check the side transfer before quoting'; $('ofNote').dispatchEvent(new w.Event('input'));
$('ofLabel').value = 'Infeed belt'; $('ofLabel').dispatchEvent(new w.Event('input'));
$('ofDone').click(); await tick(800);
const sheet = () => g(`osFor('${A}')`);
ok(g('screen') === 'orders' && sheet() && sheet().belts.length === 1 && sheet().belts[0].label === 'Infeed belt' && sheet().kind === 'orders', 'Done: on the sheet, in the plans store');
ok(sheet().belts[0].materials.join() === 'POLYPROPYLENE,ACETAL' && sheet().belts[0].colours.length === 2, 'with every choice given');
ok(/Infeed belt/.test($('osList').textContent) && /Series 800/.test($('osList').textContent) && /Sales: Check the side transfer/.test($('osList').textContent), 'listed under its series, the sales note shown here');
ok((await g(`plansAll()`)).some(p => p.kind === 'orders' && p.acct === '${A}'.replace('${A}', A)), 'saved on the device');
ok(!g(`planFor('${A}')`), 'and it is not taken for the account plan');

// ---- a sprocket favourite, half done
$('osAdd').click(); await tick(50);
d.querySelector('#ofKind [data-v="sprocket"]').click(); await tick(20);
$('ofSSeries').value = '800'; $('ofSSeries').dispatchEvent(new w.Event('change')); await tick(20);
ok($('ofSBore').value === '40 mm square', 'a sprocket starts at 40 mm square');
chip('ofSPds', '11T 85 mm').click(); await tick(20);
g(`go('orders')`); await tick(800);
ok(sheet().sprockets.length === 1 && /Still needs a material/.test($('osList').textContent) && /still needs a material/.test(w.__t), 'left half done: kept, and it says what it still needs');
// finish it from the list
d.querySelector('#osList [data-osopen="' + sheet().sprockets[0].id + '"]').click(); await tick(50);
ok($('ofKindW').hidden, 'an existing favourite stays the kind it is');
chip('ofSPds', '19T 154 mm').click(); await tick(20);
ok([...$('ofSMats').querySelectorAll('[data-v]')].map(b => b.dataset.v).join('|') === 'ACETAL|POLYPROPYLENE', 'materials for every pitch diameter picked');
chip('ofSMats', 'ACETAL').click(); await tick(20);
$('ofDone').click(); await tick(800);
ok(!/Still needs/.test($('osList').textContent) && !$('osSend').disabled, 'finished, and the form can be sent');

// ---- an empty new one leaves nothing
const n0 = g(`osList(osFor('${A}')).length`);
$('osAdd').click(); await tick(50); $('ofDone').click(); await tick(800);
ok(g(`osList(osFor('${A}')).length`) === n0, 'opened and left empty: nothing added');

// ---- Duplicate opens a copy
d.querySelector('#osList [data-osmenu="' + sheet().belts[0].id + '"]').click(); await tick(30);
[...d.querySelectorAll('#vmBody [data-cm]')].find(b => /Duplicate/.test(b.textContent)).click(); await tick(50);
ok(g('screen') === 'ofav' && g('OF.f.id') !== sheet().belts[0].id && g('OF.f.series') === '800' && !g('OF.f.label'), 'Duplicate opens a copy to change');
chip('ofCols', 'BLUE').click(); await tick(20);
$('ofDone').click(); await tick(800);
ok(sheet().belts.length === 2, 'and it is saved as a second favourite');
// Remove asks, naming it
d.querySelector('#osList [data-osmenu="' + sheet().belts[1].id + '"]').click(); await tick(30);
[...d.querySelectorAll('#vmBody [data-cm]')].find(b => /Remove/.test(b.textContent)).click(); await tick(300);
ok(/Remove S800 FLAT TOP from the order sheet for Example Foods/.test(asked) && sheet().belts.length === 1, 'Remove asks, naming it, then takes it off');

// ---- send the form
$('osSend').click(); await tick(50);
ok(g('screen') === 'osend' && d.querySelector('#osTo .on').dataset.to === 'Jo Bloggs', 'the form goes to the contact with an email');
ok(d.querySelectorAll('#osPick input:checked').length === 2 && /the sales note stays out/.test($('osPick').textContent), 'both favourites ticked; the sales note says it stays out');
$('osGo').click(); await tick(800);
const file = w.__file;
ok(file && /^Example-Foods.*_order-form_\d{4}-\d{2}-\d{2}\.html$/.test(file.name) || (file && /order-form/.test(file.name)), 'a file is made: ' + (file && file.name));
ok(!/side transfer/.test(file.text) && !/internalNote/.test(file.text), 'the sales note is not in the file at all');
ok(!/FLUSH GRID/.test(file.text) && !/P-0004/.test(file.text) && !/45 DEG/.test(file.text), 'nor any of the catalogue beyond what was picked');
ok(/Jo Bloggs/.test(file.text) && /jo@example.com/.test(file.text) && /Infeed belt/.test(file.text), 'made out to Jo, with the favourites');
ok(!/background:\s*var\(--red\);\s*border/.test(file.text) && !/btn-primary/.test(file.text), 'no red buttons in it');
ok(g('screen') === 'orders' && /form last sent to Jo Bloggs/.test($('osHint').textContent), 'back on the sheet, which says when it was sent');

// ---- the customer's file works on its own
const cust = new JSDOM(file.text, { runScripts: 'dangerously', url: 'file:///order-form.html', pretendToBeVisual: true });
await tick(100);
const cw = cust.window, cd = cw.document, c$ = id => cd.getElementById(id);
const belt = sheet().belts[0], spr = sheet().sprockets[0];
ok(c$('orderNumber').disabled && cd.querySelector('#orderType .on').dataset.v === 'quote', 'it starts as a quote, with the PO number locked');
cd.querySelector('#orderType [data-v="order"]').click();
ok(!c$('orderNumber').disabled, 'Order unlocks the PO number');
c$('hd_' + belt.id).click();
ok(!c$('body_' + belt.id).classList.contains('hide'), 'a belt opens');
const cchips = id => [...c$(id).querySelectorAll('button')].map(b => b.dataset.v);
ok(cchips('mat_' + belt.id).join('|') === 'POLYPROPYLENE|ACETAL' && cchips('col_' + belt.id).join('|') === 'BLUE|WHITE', 'its materials, and the colours made in the first');
c$('mat_' + belt.id).querySelector('[data-v="ACETAL"]').click();
ok(cchips('col_' + belt.id).join('|') === 'BLUE', 'Acetal: only the colour it is made in');
c$('len_' + belt.id).value = '24';
c$('add_' + belt.id).click();
c$('hd_' + spr.id).click();
c$('pd_' + spr.id).querySelector('[data-v="19T 154 mm"]').click();
ok(/SPR 800 19T AC 40SQ/.test(c$('desc_' + spr.id).textContent), 'a sprocket shows its description for what is picked');
c$('qty_' + spr.id).value = '6'; c$('add_' + spr.id).click();
ok(c$('itemCount').textContent === '2 items' && /ACETAL/.test(c$('itemList').textContent), 'two items in the request');
let copied = null;
cw.ClipboardItem = function (o) { this.o = o; };
Object.defineProperty(cw.navigator, 'clipboard', { value: { write: async items => { copied = items; } }, configurable: true });
c$('copyBtn').click(); await tick(100);
const preview = c$('previewHolder').innerHTML;
ok(copied && /Belt Order Request/.test(preview) && /P-0003/.test(preview) && /24/.test(preview), 'Copy order for email: the request, as tables');
ok(/Copied/.test(c$('copyMsg').textContent), 'and it says so');

// ---- the Belt Order Builder's export comes in
const exp = {belts: [{id: 'f1', label: 'Old builder belt', series: '800', style: 'FLUSH GRID', material: 'POLYPROPYLENE', colour: 'WHITE', width: 300}],
  sprockets: [], accessories: [{id: 'a1'}]};
const fileIn = new w.File([JSON.stringify(exp)], 'favourites.json', {type: 'application/json'});
Object.defineProperty($('osFile'), 'files', { value: [fileIn], configurable: true });
$('osFile').dispatchEvent(new w.Event('change')); await tick(300);
const old = sheet().belts.find(f => f.id === 'f1');
ok(old && old.materials.join() === 'POLYPROPYLENE' && old.widths.join() === '300', 'its favourites join the sheet, older single choices made into lists');
ok(/Brought in 1 favourite; 1 accessories wait/.test(w.__t), 'and it says what came in: ' + w.__t);

// ---- v184: a new belt favourite from a belt logged at the customer
await g(`(async () => { await callsPut({id: 'c9', customer: '${A}', date: '12/10/2026', when: Date.now() - 86400000 * 15, type: 'Site call', mgr: 'Ben', contacts: [], loose: [], status: 'done', closed: true, updated: Date.now(),
  entries: [{type: 'belt', asset: 'CV-200 spiral exit', series: '800', style: 'FLAT TOP', beltmat: 'POLYPROPYLENE', colour: 'WHITE', rodmat: 'ACETAL', width: '457.2',
    fstyle: 'STREAMLINE', flmat: 'POLYPROPYLENE', fheight: '75', sprbore: '40 mm square', sprpd: '11T 85 mm', sprmat: 'ACETAL', sprocket: 'SPR 800 11T AC 40SQ', sprpn: 'P-0001', photos: []}]}); })()`);
$('osAdd').click(); await tick(300);
ok(!$('ofFromW').hidden && /CV-200/.test($('ofFrom').textContent) && /call of/.test($('ofFrom').textContent), 'a new belt offers the belts logged at the customer');
d.querySelector('#ofFrom [data-from="0"]').click(); await tick(50);
const ff = g('OF.f');
ok(ff.series === '800' && ff.style === 'FLAT TOP' && ff.materials.join() === 'POLYPROPYLENE' && ff.colours.join() === 'WHITE' && ff.rods.join() === 'ACETAL' && ff.widths.join() === '457.2', 'tapped: the belt as logged is the first of each choice');
ok(ff.hasFlights && ff.flightType === 'STREAMLINE' && ff.hasSprocket && ff.sprPn === 'P-0001' && ff.label === 'spiral exit' && /From CV-200/.test(ff.internalNote), 'with its flights, sprocket, name and where it came from');
ok(d.querySelector('#ofFrom .on') && /POLYPROPYLENE/.test(d.querySelector('#ofMats .on').textContent), 'shown picked, and the choices on screen');
chip('ofMats', 'ACETAL').click(); await tick(20);
$('ofDone').click(); await tick(800);
ok(sheet().belts.some(f => f.label === 'spiral exit' && f.materials.length === 2), 'and it goes on the sheet with what was added');
$('osAdd').click(); await tick(100);
d.querySelector('#ofKind [data-v="sprocket"]').click(); await tick(20);
ok($('ofFromW').hidden, 'a sprocket does not offer them');
g(`go('orders')`); await tick(300);

const real = errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/i.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
