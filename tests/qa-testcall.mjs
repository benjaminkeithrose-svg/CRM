// v107: Test call on New (a made-up customer with a belt already logged,
// marked test, off the calendar), Delete test calls in Settings (only those,
// with a confirm that counts them), and App version as a plain button.
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
w.indexedDB = indexedDB; w.IDBKeyRange = IDBKeyRange; w.Blob = Blob;
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
const open = id => $(id).hasAttribute('open');
const toast = () => $('toast').textContent;

// ---- App version: a plain button
ok($('sxVer') && $('sxVer').tagName !== 'DETAILS' && !$('sxVer').closest('details') && $('sxVer').contains($('upBtn')), 'App version is a plain button, not a section to open');
ok(!$('sumVer'), 'no folded summary line left');
g(`renderSettingsSummary()`);
ok($('upBtn').textContent === 'Get the latest version (' + g('APP_BUILD') + ')', 'the button shows the version: ' + $('upBtn').textContent);
ok($('delTests') && !$('delTests').closest('details') && $('delTests').classList.contains('danger'), 'Delete test calls is a plain button in the warning colour');

// ---- a real call first, to prove it is never touched
await g(`callsPut({id: 'creal', customer: 'Real Foods', date: '01/10/2026', type: 'Site call', contacts: [], entries: [{type: 'note', text: 'real'}], loose: [], closed: true, status: 'done', updated: 1})`);
const apptsBefore = g('APPTS.length');

// ---- Test call
ok([...d.querySelectorAll('#newPick [data-new]')].map(b => b.textContent).includes('Test call'), 'Test call is on New');
g(`go('account')`); await tick();
d.querySelector('#newPick [data-new="test"]').click(); await tick(200);
ok(g('screen') === 'dash' && g('call.test') === true && g('call.customer') === 'Test customer', 'one tap opens a test call');
ok(g('call.entries.length') === 1 && g('call.entries[0].type') === 'belt' && g('call.entries[0].width') === '600' && /test belt/.test(g('call.entries[0].comment')),
  'with a belt already logged');
ok(/TEST/.test($('dashStat').innerHTML) && $('dashStat').querySelector('.tag.test'), 'marked TEST at the top of the call');
ok(g('APPTS.length') === apptsBefore, 'nothing put on the calendar');
ok((await g(`callsAll()`)).some(c => c.id === g('call.id') && c.test), 'saved, so it syncs like a call');
const notes = await g(`buildNotesHTML('full', 'html', call)`);
ok(/Test customer/.test(notes) && /S800 Flat Top/.test(notes), 'the report builds from it');
const testId = g('call.id');
g(`go('reports')`); await tick(300);
const row = d.querySelector('[data-rpt="' + testId + '"]');
ok(row && row.querySelector('.tag.test'), 'Reports marks it TEST');
ok(!d.querySelector('[data-rpt="creal"] .tag.test'), 'and not the real call');

// a second one, with a photo on it
await tick(5);
g(`go('account')`); await tick();
d.querySelector('#newPick [data-new="test"]').click(); await tick(200);
await g(`(async () => { call.loose.push(new Blob(['x'], {type: 'image/jpeg'})); await saveCall(); })()`);
ok(g('call.id') !== testId, 'a second test call is its own call');

// ---- Delete test calls: cancel keeps them
let asked = '';
w.confirm = m => { asked = m; return false; };
$('delTests').click(); await tick(150);
ok(/Delete 2 test calls and 1 photo\?/.test(asked) && /Only calls started with Test call go/.test(asked) && /cannot be undone/.test(asked), 'the confirm counts them: ' + asked.split('\n')[0]);
ok((await g(`recordsAll()`)).filter(c => c.test).length === 2, 'Cancel deletes nothing');
// OK removes only the tests, and leaves the screen
g(`(() => { sbUser = {id: 'u1'}; })()`);
w.confirm = m => { asked = m; return true; };
$('delTests').click(); await tick(200);
ok(/other devices/.test(asked), 'signed in: says it goes from the other devices too');
const left = await g(`recordsAll()`);
ok(!left.some(c => c.test) && left.some(c => c.id === 'creal'), 'every test call gone, the real call kept');
ok(g('call') === null && g('screen') === 'home', 'the open test call is closed and you are back on Home');
ok(g(`cloudDirty['calls/${testId}'] && cloudDirty['calls/${testId}'].del`), 'the deletion is queued for the other devices');
// nothing left
$('delTests').click(); await tick();
ok(/no test calls/.test($('toast').textContent), 'none left: says so');

// ---- Help
ok(/Try things out with a test call/.test($('s-help').textContent) && /Delete test calls/.test($('s-help').textContent), 'Help covers it');
ok(!/then <b>App version<\/b>/.test($('s-help').innerHTML), 'Help no longer sends you to an App version section');

const real = errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/i.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
