// v161: application engineering evaluations, part of a call. Behind the ⋯ on
// the call; drawn from forms.js; the call fills who, where and when; answers
// show and hide questions; estimates; conveyors copy from and become belts;
// pasted pictures; its own A4 document and a line in the call notes.
// Everything here is made up.
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
for (const f of ['zones.js', 'manuals.js', 'healthlib.js', 'xlsx-0.18.5.full.min.js', 'forms.js', 'app.js']) {
  const el = d.createElement('script'); el.textContent = fs.readFileSync(f, 'utf8'); d.body.appendChild(el);
}
d.dispatchEvent(new w.Event('DOMContentLoaded'));
await tick(500);
const $ = id => d.getElementById(id);
const g = e => w.eval('(' + e + ')');
let confirms = [], answer = true; w.confirm = m => { confirms.push(m); return answer; };
w.eval(`toast = m => { window.__t = m; }`);
w.eval(`shrink = async f => new Blob([await f.arrayBuffer()], {type: 'image/jpeg'})`);
const A = 'Sample Foods - Northside';
await g(`(async () => {
  localStorage.setItem(LS('mgr'), 'Ben Example'); localStorage.setItem(LS('email'), 'ben@example.org');
  const list = [{a: '${A}', sub: 'Northside', z: 'Z1', foc: 'High', cad: CAD['High'], mgr: 'Ben Example', rep: '', c: []}];
  await accReplaceAll(list); indexAccounts(list);
  await peoplePut({id: 'sfB', kind: 'staff', n: 'Ben Example', pos: 'AM', boss: '', e: '', p: '', added: 1}); await loadLists();
  await startTestCall();
  call.customer = '${A}'; call.site = 'Plant 2, 1 Example Road';
  call.contacts = [{name: 'Kim Site', role: 'Engineering Manager', email: 'kim@example.org', mobile: '0400 000 000', crm: true}];
  call.entries.push({type: 'belt', asset: '61-555', series: 'S900', style: 'Flat Top', beltmat: 'Acetal', width: '600', frame: '640', beltlen: '12.5', clength: '6', sprdrive: '5', spridle: '5', sprocket: 'S900 12T 40 sq', photos: []});
  await saveCall(); showScreen('dash');
})()`);
await tick(200);
const val = id => $(id) && $(id).value;
const pick = (k, v, ci) => { const box = $('evBody').querySelector('[data-ep="' + k + '"]' + (ci == null ? ':not([data-ci])' : '[data-ci="' + ci + '"]')); box.querySelector('[data-v="' + v + '"]').click(); };
const type = (id, v) => { $(id).value = v; $(id).dispatchEvent(new w.Event('input', {bubbles: true})); };

// ---- behind the ⋯ on the call
ok(!$('barMore').hidden && g(`AE_FORMS.length`) >= 1, 'the call toolbar has a ⋯, and the forms are loaded');
$('barMore').click(); await tick(60);
const item = [...$('vmBody').querySelectorAll('[data-cm]')].find(b => /Evaluation: Freezing and chilling tunnel/.test(b.textContent));
ok(!!item, 'it offers the tunnel evaluation');
item.click(); await tick(100);
ok($('evaldlg').hasAttribute('open') && $('evHead').textContent === 'Freezing and chilling tunnel' && $('evDel').hidden, 'the form opens, with Done at the top and no bin yet');

// ---- what the call already knows
ok(val('ev_c_name') === 'Kim Site' && val('ev_c_title') === 'Engineering Manager' && val('ev_c_email') === 'kim@example.org' && val('ev_c_company') === A, 'the customer contact and company come from the call');
ok(val('ev_c_city') === 'Northside' && val('ev_c_country') === 'Australia' && val('ev_c_site') === 'Plant 2, 1 Example Road', 'the city and country from the account, the site from the call');
ok(val('ev_r_name') === 'Ben Example' && val('ev_r_pos') === 'Account manager' && val('ev_r_email') === 'ben@example.org' && /^\d{4}-\d{2}-\d{2}$/.test(val('ev_r_date')), 'entered by: you, your position, your email and the call date');

// ---- answers drive questions
ok(!$('ev_0_today'), 'Belt you run today is not asked on a new build');
pick('projtype', 'Retrofit of an existing conveyor'); await tick(30);
ok(!!$('ev_0_today'), 'picking retrofit asks it on each conveyor');
ok(!$('ev_icedetail'), 'the ice question\'s detail waits');
pick('ice', 'Yes — it affects the line today'); await tick(30);
ok(!!$('ev_icedetail'), 'and appears when ice is a problem');
pick('apptype', 'Crust freezer'); type('ev_line', 'Freezer Line 3'); type('ev_rate', '1200');
$('evBody').querySelector('.evest[data-ek="rate"]:not([data-ci])').click();
ok(g(`EV.e.est.rate`) === true && $('evBody').querySelector('.evest[data-ek="rate"]:not([data-ci])').classList.contains('on'), 'a number can be ticked as an estimate');
pick('apptype', 'Crust freezer'); await tick(10);
ok(!g(`EV.e.v.apptype`), 'tap a picked answer again to clear it');
pick('apptype', 'Crust freezer');

// ---- conveyors and belts
const sel = $('evBody').querySelector('[data-evcopy="0"]');
sel.value = [...sel.options].find(o => o.textContent === '61-555').value; sel.dispatchEvent(new w.Event('change', {bubbles: true})); await tick(30);
ok(val('ev_0_width') === '600' && val('ev_0_frame') === '640' && val('ev_0_length') === '12.5' && val('ev_0_centres') === '6' && val('ev_0_today') === 'S900 Flat Top Acetal' && val('ev_0_desc') === '61-555', 'Copy from a belt logged fills the conveyor from that belt');
ok(g(`EV.e.conv[0].v.sprk_drive_qty`) === '5' && /nothing you typed was changed/.test(w.__t), 'with the sprocket counts, and says it changed nothing typed');
type('ev_0_speed', '8');
$('evBody').querySelector('[data-evdup="0"]').click(); await tick(30);
ok(g(`EV.e.conv.length`) === 2 && val('ev_1_width') === '600', 'Duplicate copies a conveyor block');
type('ev_1_desc', 'Bottom conveyor'); type('ev_1_width', '900');
const nBelts = () => g(`call.entries.filter(e => e.type === 'belt').length`), nb0 = nBelts();
$('evBody').querySelector('[data-evbelt="1"]').click(); await tick(200);
ok(nBelts() === nb0 + 1 && g(`call.entries.find(e => e.type === 'belt' && e.asset === 'Bottom conveyor').width`) === '900', 'Log it as a belt puts a conveyor in the call log as a belt, for a quote');
confirms = [];
$('evBody').querySelector('[data-evrm="1"]').click(); await tick(30);
ok(/Remove Conveyor 2 \(Bottom conveyor\)/.test(confirms[0] || '') && g(`EV.e.conv.length`) === 1, 'removing a conveyor names it and asks first');
const bore = $('evBody').querySelector('select[data-ek="sprk_drive_boresh"]'); bore.value = 'Square'; bore.dispatchEvent(new w.Event('change', {bubbles: true}));

// ---- a picture pasted while the form is open goes to it
const pic = new w.File([new Uint8Array([1, 2, 3])], 'shot.png', {type: 'image/png'});
const pe = new w.Event('paste', {bubbles: true, cancelable: true}); Object.defineProperty(pe, 'clipboardData', {value: {items: [{kind: 'file', type: 'image/png', getAsFile: () => pic}], files: [pic]}});
d.body.dispatchEvent(pe); await tick(200);
ok(pe.defaultPrevented && g(`EV.e.photos.length`) === 1 && g(`(call.loose || []).length`) === 0, 'Ctrl+V with a picture goes into the evaluation, not loose photos');

// ---- Done keeps it, with what is still to fill
$('evOk').click(); await tick(250);
const ev = () => g(`call.entries.find(e => e.type === 'eval')`);
ok(ev() && ev().form === 'tunnel' && ev().v.line === 'Freezer Line 3' && ev().conv.length === 1 && ev().photos.length === 1, 'Done keeps the evaluation in the call');
ok(/Freezing and chilling tunnel evaluation saved: \d+ starred answers still to fill/.test(w.__t), 'and says how many starred answers are still to fill: ' + w.__t);
ok(/Evaluation - Freezing and chilling tunnel - Freezer Line 3/.test($('logList').textContent) && /starred still to fill/.test($('logList').textContent), 'the call log shows it');

// ---- opening a new one and leaving it untouched keeps nothing
$('barMore').click(); await tick(40);
[...$('vmBody').querySelectorAll('[data-cm]')].find(b => /Evaluation:/.test(b.textContent)).click(); await tick(60);
$('evOk').click(); await tick(150);
ok(g(`call.entries.filter(e => e.type === 'eval').length`) === 1, 'a form opened and left as the call filled it keeps nothing');

// ---- reopening and Duplicate
const i = g(`call.entries.findIndex(e => e.type === 'eval')`);
$('logList').querySelector('[data-edit="' + i + '"]').click(); await tick(80);
ok($('evaldlg').hasAttribute('open') && val('ev_line') === 'Freezer Line 3' && !$('evDel').hidden, 'tapping it in the call log opens it again, with its bin');
type('ev_line', 'Freezer Line 4'); $('evOk').click(); await tick(200);
ok(ev().v.line === 'Freezer Line 4' && g(`call.entries.filter(e => e.type === 'eval').length`) === 1, 'changes save to the same evaluation');
g(`openLogged(${i}, true)`); await tick(80);
ok(g(`EV.idx`) === null && g(`EV.e.photos.length`) === 0 && val('ev_line') === 'Freezer Line 4', 'Duplicate opens a copy, without the photos');
type('ev_line', 'Freezer Line 5'); $('evOk').click(); await tick(200);
ok(g(`call.entries.filter(e => e.type === 'eval').length`) === 2, 'and Done adds it');

// ---- the document
g(`openOutDlg()`); await tick(60);
ok([...$('outScopeSeg').querySelectorAll('button')].some(b => b.textContent === 'Evaluation only'), 'Create and share offers Evaluation only');
w.eval(`photoDataURL = async () => 'data:image/jpeg;base64,AAAA'`);   // jsdom cannot read these stand-in photos
const html = await g(`buildEvalHTML(call, 'full')`);
ok(/<h1>Conditioning Evaluation Form — Freezing and Chilling Tunnels<\/h1>/.test(html) && /Crust freezer/.test(html) && /1200 kg\/h <i>\(estimate\)<\/i>/.test(html), 'the evaluation document: the form, the answers, an estimate marked');
ok(/Conveyor 1 — 61-555/.test(html) && /<td class="l">Drive end<\/td>/.test(html) && /Square/.test(html), 'each conveyor with its sprocket table');
ok(/Not yet known/.test(html) && /Still to come:/.test(html) && !/N\/A/.test(html), 'starred answers still to come are said so; no N/A');
ok(/@page\{size:A4/.test(html) && /<h2>Photos<\/h2>/.test(html), 'A4, with the photos');
const notes = await g(`buildNotesHTML('full', 'thumbonly')`);
ok(/<h2>Evaluations<\/h2>/.test(notes) && /Freezer Line 4/.test(notes) && /Each evaluation is its own document/.test(notes), 'the full call notes list the evaluations, and say each is its own document');
g(`closeOutDlg()`);

// ---- delete
$('logList').querySelector('[data-edit="' + i + '"]').click(); await tick(80);
confirms = [];
$('evDel').click(); await tick(200);
ok(/Delete this freezing and chilling tunnel evaluation and its 1 photo/.test(confirms[0] || '') && g(`call.entries.filter(e => e.type === 'eval').length`) === 1, 'the bin names it and its photos, then deletes it');

ok(errs.length === 0, 'no errors', errs.join(' | '));
console.log(`PASS ${pass}` + (fail ? `  FAIL ${fail}` : ''));
process.exit(fail ? 1 : 0);
