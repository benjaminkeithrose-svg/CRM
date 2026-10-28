// v178: the camera inside the app. A camera button opens it instead of the
// phone's camera app; each tap of the shutter is a photo; Add puts them all
// where that button would have. If the camera cannot open, the phone's is used.
// Also v178's QA fixes: the open call is remembered, the call's ⋯ can mark it
// done, Missed/Cancel ask nothing, dates and day counts read right.
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
w.HTMLMediaElement.prototype.play = async function () {};
w.HTMLMediaElement.prototype.pause = function () {};
let stopped = 0, camMode = 'ok';
w.navigator.mediaDevices = { getUserMedia: async () => {
  if (camMode === 'denied') { const e = new Error('Permission denied'); e.name = 'NotAllowedError'; throw e; }
  return { getTracks: () => [{ stop: () => stopped++ }], getVideoTracks: () => [] };
} };
w.console.error = (...a) => errs.push(a.join(' ')); w.console.warn = () => {};
for (const f of ['zones.js', 'manuals.js', 'healthlib.js', 'app.js']) {
  const el = d.createElement('script'); el.textContent = fs.readFileSync(f, 'utf8'); d.body.appendChild(el);
}
d.dispatchEvent(new w.Event('DOMContentLoaded'));
await tick(500);
const $ = id => d.getElementById(id);
const g = e => w.eval('(' + e + ')');
w.eval(`toast = m => { window.__t = m; }`);
w.eval(`camGrab = async () => new Blob(['jpeg'], {type: 'image/jpeg'})`);
w.eval(`shrink = async f => f`);
let nativeClicks = 0;
$('camInput').addEventListener('click', e => { if (!e.defaultPrevented) nativeClicks++; });
const A = 'Example Foods - Smithfield';
await g(`(async () => {
  const list = [{a: '${A}', sub: 'Smithfield', z: 'Z1', foc: 'High', cad: CAD['High'], mgr: 'Ben', rep: '', c: []}];
  await accReplaceAll(list); indexAccounts(list);
  call = {id: 'c1', customer: '${A}', date: '27/10/2026', type: 'Site call', mgr: 'Ben', contacts: [], entries: [], loose: [], status: 'open', updated: Date.now()};
  await saveCall(); go('dash');
})()`); await tick(100);

// ---- the toolbar camera: the camera opens in the app
$('barCamera').click(); await tick(100);
ok($('camdlg').hasAttribute('open') && nativeClicks === 0 && g('CAM && CAM.stream') && !$('camShot').disabled, 'the camera opens inside the app, not the phone\'s camera');
ok(/Tap the button for each photo/.test($('camN').textContent) && $('camDone').disabled, 'it says what to do; nothing to add yet');
$('camShot').click(); await tick(30); $('camShot').click(); await tick(30); $('camShot').click(); await tick(30);
ok(d.querySelectorAll('#camStrip .camth').length === 3 && $('camN').textContent === '3 photos' && $('camDone').textContent === 'Add 3' && !$('camDone').disabled, 'three taps, three photos along the bottom, Add 3');
d.querySelector('#camStrip [data-camx="1"]').click(); await tick(20);
ok(d.querySelectorAll('#camStrip .camth').length === 2 && $('camDone').textContent === 'Add 2', 'one left out');
$('camDone').click(); await tick(150);
ok(!$('camdlg').hasAttribute('open') && g('call.loose.length') === 2 && stopped >= 1 && !g('CAM'), 'Add puts both on the call at once, and the camera is turned off');

// ---- a form's camera: the photos go to that form
await g(`(async () => { openEntry('belt', true); })()`); await tick(100);
$('bCam').click(); await tick(100);
ok($('camdlg').hasAttribute('open'), 'the belt form\'s camera opens it too');
$('camShot').click(); await tick(30); $('camShot').click(); await tick(30);
$('camDone').click(); await tick(150);
ok(g(`SHOTS.belt.length`) === 2, 'and both go to the belt being written');

// ---- Cancel with photos taken asks first, naming how many
$('barCamera').click(); await tick(100);
$('camShot').click(); await tick(30);
const before = g('call.loose.length');
w.confirm = m => { asked = m; return false; };
$('camCancel').click(); await tick(50);
ok(/Leave out the 1 photo just taken/.test(asked) && $('camdlg').hasAttribute('open'), 'Cancel asks before leaving photos out, and No keeps the camera open');
w.confirm = m => { asked = m; return true; };
$('camCancel').click(); await tick(100);
ok(!$('camdlg').hasAttribute('open') && g('call.loose.length') === before, 'Yes leaves them out');

// back closes it but keeps what was taken
$('barCamera').click(); await tick(100);
$('camShot').click(); await tick(30);
w.history.back(); await tick(200);
ok(g('call.loose.length') === before + 1, 'closed by the back gesture: the photo is kept');

// ---- not allowed: the phone's camera instead, from then on
camMode = 'denied';
$('barCamera').click(); await tick(150);
ok(!$('camdlg').hasAttribute('open') && /not allowed/.test(w.__t) && nativeClicks === 1 && w.localStorage.getItem('fcrm.camPhone') === '1', 'not allowed: it says so and opens the phone\'s camera');
$('barCamera').click(); await tick(50);
ok(nativeClicks === 2 && !$('camdlg').hasAttribute('open'), 'and the phone\'s camera next time too');
w.localStorage.removeItem('fcrm.camPhone'); camMode = 'ok';

// ---- QA fixes
ok(w.localStorage.getItem('fcrm.openCall') === 'c1', 'the open call is remembered');
await g(`(async () => { call = null; await restoreCall(); })()`);
ok(g('call && call.id') === 'c1', 'and open again when the app starts afresh');
$('barMore').click(); await tick(50);
const done = [...d.querySelectorAll('#vmBody [data-cm]')].find(b => /Mark this call done/.test(b.textContent));
ok(done, 'the call\'s ⋯ has Mark this call done');
done.click(); await tick(200);
ok(!g('call') && g('screen') === 'home' && !w.localStorage.getItem('fcrm.openCall') && (await g(`callsAll()`)).find(c => c.id === 'c1').closed, 'it is done, closed, and no longer remembered as open');
ok(g(`daysAgo(1)`) === '1 day ago' && g(`daysAgo(0)`) === 'today' && g(`daysAgo(5)`) === '5 days ago', 'one day, not one days');
ok(!/toLocaleDateString\(\)/.test(fs.readFileSync('app.js', 'utf8')), 'every date is written the Australian way, whatever the phone\'s language');
await g(`(async () => { const ap = {id: 'ap1', acct: '${A}', type: 'Intralox site visit', date: todayISOdate(), start: '09:00', dur: 60, agenda: '', contacts: [], status: 'planned'}; APPTS.push(ap); await apptsPut(ap); go('today'); })()`); await tick(100);
asked = '';
await g(`setVisitStatus('ap1', 'missed')`); await tick(50);
ok(!asked && g(`APPTS.find(a => a.id === 'ap1').status`) === 'missed' && /Reopen/.test(w.__t), 'Missed asks nothing, and says it can be reopened');

const real = errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/i.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
