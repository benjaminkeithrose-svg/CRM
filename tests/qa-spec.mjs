// v101: Read a spec sheet. A photographed belt spec is read by the ai-tidy
// function (stubbed here) and fills only the empty boxes on the belt form,
// tinted until changed, with a line saying what was filled, kept and missed.
// jsdom cannot decode images, so shrink() is stubbed; the photo reading
// itself was checked against the real server separately, not here.
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
const tinted = id => $(id).classList.contains('fromphoto');

// a small stand-in for the belt reference data, so the series cascade has something to match
await g(`(async () => {
  REF = {combos: [['800', 'Flat Top', 'PP', 'White'], ['800', 'Flat Top', 'PP', 'Blue'], ['1100', 'Flush Grid', 'PE', 'Natural']],
    geom: [], sprockets: [], pitch: {}, indentGroups: [], materials: [], colours: [], rods: ['PP', 'Acetal', 'Nylon'],
    flightTypes: ['Streamline', 'Impact Resistant'], sideguardTypes: ['Standard']};
  buildBeltRef();
})()`);
w.shrink = async (b) => b;
w.blobToDataURL = async () => 'data:image/jpeg;base64,QUJD';
const sent = [];
let reply = null;
g(`(() => { sbClient = {functions: {invoke: (n, o) => window.__inv(n, o)}}; sbUser = {id: 'u1'}; })()`);
w.__inv = async (name, opts) => { sent.push({ name, body: opts.body }); return reply; };

await g(`(async () => { call = {id: 'c1', customer: 'Acme', date: '10/10/2026', type: 'Site call', contacts: [], entries: [], loose: [], updated: 1}; openEntry('belt', true); })()`);
await tick(100);
ok($('bScan') && /Read a spec sheet/.test($('bScan').textContent) && !$('bScan').closest('details'), 'Read a spec sheet sits up with the asset');

// typed before the photo: kept
input('bWidth', '600');
reply = { data: { spec: { asset: 'Line 3 infeed', desc: 'S800 Flat Top', series: 'S800', style: 'flat top', material: 'PP', colour: 'white',
  rod: 'PP', cvlen: '9.1', frame: '620', width: '606', beltlen: '18.4', sprdesc: '6.4" PD 20T 40mm sq', sprdrive: '5', spridle: '3',
  fltype: 'none', qty: '2', comment: 'Edge modules cracked on the drive side.' }, unread: ['sprocket part number'], used: 1 }, error: null };
const photo = new w.Blob(['jpeg'], { type: 'image/jpeg' });
await g(`readSpecSheet`)(photo); await tick(150);

ok(sent.length === 1 && sent[0].body.kind === 'spec' && sent[0].body.image === 'QUJD' && sent[0].body.media === 'image/jpeg', 'the photo goes as a spec request');
ok($('bAsset').value === 'Line 3 infeed' && tinted('bAsset'), 'asset filled and tinted');
ok($('bSeries').value === '800' && tinted('bSeries'), 'S800 on the sheet finds series 800');
ok($('bStyle').value === 'Flat Top' && tinted('bStyle'), 'style matched loosely');
ok(g('beltMat()') === 'PP' && g('beltColour()') === 'White' && $('bColourChips').classList.contains('fromphoto'), 'material and colour chips picked (white matched White)');
ok(g('rodValue()') === 'PP', 'rod picked');
ok($('bCvLen').value === '9.1' && $('bFrame').value === '620' && $('bLen').value === '18.4', 'measurements filled');
ok($('bWidth').value === '600' && !tinted('bWidth'), 'a width already typed is left as it was');
ok($('bSprDesc').value === '6.4" PD 20T 40mm sq' && $('bSprDrive').value === '5' && $('bSprIdle').value === '3' && !$('bSkipSpr').checked, 'sprockets filled: ' + [$('bSprDesc').value, $('bSprDrive').value, $('bSprIdle').value, $('bSkipSpr').checked].join('|'));
ok($('bSprDrvAuto').classList.contains('off') && $('bLenAuto').classList.contains('off'), 'values from the sheet lose the estimate badges');
ok($('bSkipAcc').checked, '"none" for flights leaves flights skipped');
ok($('bQty').value === '', 'quantity is only filled on a quote request');
ok($('bComment').value === 'Edge modules cracked on the drive side.' && tinted('bComment'), 'comment filled');
ok($('bxBelt').open && $('bxSpr').open && $('bxPho').open && !$('bxAcc').open, 'sections holding filled boxes open');
const msg = $('bScanMsg').textContent;
ok(/Filled from the photo/.test(msg) && /series/.test(msg) && /Already filled, so left as you had them: belt width/.test(msg) && /Could not read: sprocket part number/.test(msg),
  'the line says what was filled, kept and unread: ' + msg);
ok(g('SHOTS.belt.length') === 1, 'the photo of the sheet is kept with the belt');
ok(/summary/i.test('summary') && /S800 Flat Top/.test($('sumBelt').textContent), 'section summaries updated: ' + $('sumBelt').textContent);

// changing a tinted box takes the tint off; tapping into one does not
$('bFrame').dispatchEvent(new w.Event('click', { bubbles: true }));
ok(tinted('bFrame'), 'tapping into a tinted box leaves the tint');
input('bFrame', '625');
ok(!tinted('bFrame'), 'changing it takes the tint off');

// Done saves what is on the form
$('bSave').click(); await tick(200);
const E = g('call.entries[0]');
ok(E && E.series === '800' && E.width === '600' && E.frame === '625' && E.photos.length === 1, 'Done saves the checked belt with the sheet photo');

// a new belt starts clean
await g(`openEntry('belt', true)`); await tick(100);
ok(!d.querySelector('#s-belt .fromphoto') && !$('bScanMsg').textContent, 'a new belt has no tint and no message');

// a series not in the reference data is reported, not forced
reply = { data: { spec: { series: '9000', style: 'Mystery', width: '500' }, unread: [] }, error: null };
await g(`readSpecSheet`)(photo); await tick(150);
ok(!$('bSeries').value && $('bWidth').value === '500', 'unknown series left empty, the rest filled');
ok(/Not in the belt reference data, so left for you: series 9000, style Mystery/.test($('bScanMsg').textContent), 'and named: ' + $('bScanMsg').textContent);

// on a quote request quantity is filled
await g(`(async () => { call = {id: 'q1', rectype: 'quote', customer: 'Acme', date: '10/10/2026', contacts: [], entries: [], loose: [], updated: 1}; openEntry('belt', true); })()`);
await tick(100);
reply = { data: { spec: { qty: '2' }, unread: [] }, error: null };
await g(`readSpecSheet`)(photo); await tick(150);
ok($('bQty').value === '2' && tinted('bQty') && $('bxQuo').open, 'quote request: quantity filled');

// an error fills nothing and says so
await g(`openEntry('belt', true)`); await tick(100);
reply = { data: null, error: Object.assign(new Error('x'), { context: { json: async () => ({ message: 'The AI key has not been added in Supabase yet.' }) } }) };
await g(`readSpecSheet`)(photo); await tick(150);
ok(/not been added/.test($('bScanMsg').textContent) && /Nothing was filled in/.test($('bScanMsg').textContent) && !$('bAsset').value, 'an error fills nothing and says why');

// signed out: says so and sends nothing
const n0 = sent.length;
g(`(() => { sbUser = null; })()`);
$('bScan').click(); await tick();
ok(sent.length === n0 && /Sign in to cloud sync/.test($('toast').textContent), 'signed out: a message, nothing sent');

// ---- the title says Belt when changing a logged one
g(`(() => { sbUser = {id: 'u1'}; })()`);
await g(`(async () => { call = {id: 'c2', customer: 'Acme', date: '10/10/2026', type: 'Site call', contacts: [], entries: [{type: 'belt', asset: 'Line 1', photos: []}], loose: [], updated: 1}; openEntry('belt', true); })()`);
await tick(100);
ok($('title').textContent === 'Add belt', 'a new belt is Add belt');
await g(`openLogged(0)`); await tick(100);
ok($('title').textContent === 'Belt', 'a logged belt being changed is Belt: ' + $('title').textContent);

ok(/Read a paper spec sheet/.test($('s-help').textContent), 'Help covers it');
const real = errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/i.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
