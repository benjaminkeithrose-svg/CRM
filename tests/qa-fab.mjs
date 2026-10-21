// v168: the floating microphone - on every screen, hold still to talk, let go to
// stop, drag to move; the words go into Capture without leaving the screen.
// Microphone, recorder and speech engine are stand-ins (jsdom has none).
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
w.scrollTo = () => {}; w.alert = () => {};
let confirms = [], answer = false; w.confirm = m => { confirms.push(m); return answer; };
w.matchMedia = () => ({ matches: true, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
w.navigator.storage = { persist: async () => true, persisted: async () => true };
w.URL.createObjectURL = () => 'blob:stub'; w.URL.revokeObjectURL = () => {};
if (!w.HTMLDialogElement.prototype.showModal) w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
if (!w.HTMLDialogElement.prototype.close) w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new w.Event('close')); };
w.HTMLCanvasElement.prototype.getContext = () => null;
w.Element.prototype.setPointerCapture = () => {};
w.console.error = (...a) => errs.push(a.join(' ')); w.console.warn = () => {};
// live recognition exists, so the microphones are drawn
w.webkitSpeechRecognition = class { start(){ this.started = true; w.__live = true; } stop(){} abort(){} };
// a stand-in microphone and recorder
let tracksStopped = 0;
w.navigator.mediaDevices = { getUserMedia: async () => ({ getTracks: () => [{ stop: () => tracksStopped++ }] }) };
w.MediaRecorder = class {
  static isTypeSupported(t){ return t === 'audio/webm;codecs=opus'; }
  constructor(stream, o){ this.mimeType = (o && o.mimeType) || ''; this.state = 'inactive'; }
  start(){ this.state = 'recording'; }
  stop(){ this.state = 'inactive'; this.ondataavailable({ data: new Blob(['sound'], { type: this.mimeType }) }); setTimeout(() => this.onstop(), 0); }
};
for (const f of ['zones.js', 'manuals.js', 'healthlib.js', 'app.js']) {
  const el = d.createElement('script'); el.textContent = fs.readFileSync(f, 'utf8'); d.body.appendChild(el);
}
d.dispatchEvent(new w.Event('DOMContentLoaded'));
await tick(500);
const $ = id => d.getElementById(id);
const g = e => w.eval('(' + e + ')');
w.eval(`toast = m => { window.__t = m; }`);


const at = (type, x, y) => { const e = new w.Event(type, {bubbles: true, cancelable: true}); Object.defineProperty(e, 'clientX', {value: x}); Object.defineProperty(e, 'clientY', {value: y}); Object.defineProperty(e, 'pointerId', {value: 1}); return e; };
const fab = $('fab');
let sent = null;
w.eval(`recPcm = async () => new Float32Array(16000 * 5).map((_, i) => 0.3 * Math.sin(i / 7))`);
w.__spAsk = async (msg) => { sent = msg; return {type: 'done', text: 'Ring Sam at Example Foods about the trial on Friday.'}; };
w.eval(`spAsk = (m, on) => window.__spAsk(m, on)`);

// ---- on every screen, out of the way
ok(fab && !fab.hidden && fab.parentElement === d.body && fab.dataset.mic === 'capText', 'the floating microphone is on the page, outside every screen');
ok(fab.style.left === (1024 - 52 - 16) + 'px' && fab.style.top === (768 - 52 - 96) + 'px', 'it starts at the bottom right: ' + fab.style.left + ', ' + fab.style.top);
w.eval(`showScreen('settings')`); await tick(50);
ok(!fab.hidden, 'it stays on other screens');

// ---- Record mode: hold to record, let go to stop; the screen does not change
$('talkMode').querySelector('[data-v="record"]').click(); await tick(50);
w.eval(`showScreen('plan')`); await tick(50);
fab.dispatchEvent(at('pointerdown', 900, 640)); await tick(300);
ok(g(`micSession && micSession.btn === document.getElementById('fab') && micSession.recording`) && /Recording\. Let go/.test(w.__t), 'held still: it records, and says to let go when finished');
ok(/Recording 0:0\d/.test(fab.textContent) && fab.classList.contains('on'), 'its label shows Recording and the time');
fab.dispatchEvent(at('pointerup', 901, 641)); await tick(250);
ok(g(`screen`) === 'plan' && sent && sent.cmd === 'run', 'letting go stops it and writes it out, without leaving the screen');
ok(/Ring Sam at Example Foods/.test(g(`CAP.text`)) && /It is in Capture/.test(w.__t), 'the words go into Capture: ' + w.__t);
ok(!$('capBadge').hidden && $('capBadge').textContent === 'Words' && /waiting to be sorted/.test($('capBadge').title), 'Home\'s Capture tile says words are waiting');
fab.dispatchEvent(at('pointerdown', 900, 640)); await tick(300); fab.dispatchEvent(at('pointerup', 900, 640)); await tick(250);
ok((g(`CAP.text`).match(/Ring Sam/g) || []).length === 2, 'a second note is added after the first, not over it');

// ---- a quick tap does nothing but say how
sent = null;
fab.dispatchEvent(at('pointerdown', 900, 640)); await tick(60); fab.dispatchEvent(at('pointerup', 900, 640)); await tick(100);
ok(!sent && !g(`micSession`) && /Hold the microphone while you talk/.test(w.__t), 'a quick tap records nothing, and says to hold it');

// ---- drag to move it; it stays there
fab.dispatchEvent(at('pointerdown', 900, 640));
fab.dispatchEvent(at('pointermove', 860, 600)); fab.dispatchEvent(at('pointermove', 400, 300)); await tick(300);
ok(!g(`micSession`), 'moving it first drags it, and does not record');
fab.dispatchEvent(at('pointerup', 400, 300)); await tick(50);
const saved = JSON.parse(w.localStorage.getItem(g(`LS('fabPos')`)) || 'null');
ok(fab.style.left === '456px' && fab.style.top === '280px' && saved && Math.abs(saved.x - 456 / 1024) < 0.001, 'it moves with the finger, stays where it was dropped, and remembers it: ' + fab.style.left + ', ' + fab.style.top);
ok(fab.classList.contains('left'), 'on the left half, its label shows on the right');

// ---- Live mode: listens while held, through pauses
$('talkMode').querySelector('[data-v="live"]').click(); await tick(50);
fab.dispatchEvent(at('pointerdown', 420, 320)); await tick(300);
ok(w.__live && g(`micSession && !micSession.recording && micSession.pressing && micSession.after === null`), 'in Live, held: listens, carries on through pauses, and does not sort');
fab.dispatchEvent(at('pointerup', 420, 320)); await tick(50);
ok(g(`micSession && micSession.ending`) || !g(`micSession`), 'letting go finishes it');

const real = errs.filter(e => !/Not implemented|Could not parse CSS/i.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}` + (fail ? `  FAIL ${fail}` : ''));
process.exit(fail ? 1 : 0);
