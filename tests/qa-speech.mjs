// v166: record, then write it out on the phone (a trial). With Talking set to
// Record in Settings, every microphone records instead of live recognition;
// Finish cuts the recording at quiet moments and the speech engine writes it
// out. jsdom has no microphone, recorder or speech engine: they are stand-ins
// here, so this proves the app's side - the setting, where the cuts fall, the
// words into the box (or Capture), the failure path - not Whisper itself,
// which only a phone can show.
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

// ---- Settings: Talking into the app
ok($('sxTalk') && /Live/.test($('sumTalk').textContent) && $('talkRec').hidden, 'Settings has Talking into the app, Live to start with');
$('talkMode').querySelector('[data-v="record"]').click(); await tick(80);
ok(g(`talkMode()`) === 'record' && !$('talkRec').hidden && $('talkMode').querySelector('[data-v="record"]').classList.contains('on'), 'Record, then write it out: switched on, with the model choice');
ok(/Not downloaded yet \(about 80 MB\)/.test($('talkStat').textContent) && !$('talkGet').hidden, 'it says the model is not downloaded yet, and offers to download it');
$('talkModel').querySelector('[data-v="quick"]').click(); await tick(80);
ok(g(`TALK_MODELS[talkModel()].id`) === 'Xenova/whisper-tiny.en' && /about 40 MB/.test($('talkStat').textContent), 'Quicker picks the small model');
$('talkModel').querySelector('[data-v="better"]').click(); await tick(50);

// ---- where the cuts fall: quiet moments, never a word cut in half; silence left out
const R = 16000;
const make = (secs, quiet) => { const p = new w.Float32Array(secs * R); for (let i = 0; i < p.length; i++) { const t = i / R; p[i] = quiet.some(([a, b]) => t >= a && t < b) ? 0.001 * Math.sin(i) : 0.3 * Math.sin(i / 7); } return p; };
const pcm = make(70, [[24, 24.6], [51, 51.5], [66, 70]]);
const pieces = g(`recPieces`)(pcm);
const lens = [...pieces].map(p => p.length / R);
ok(pieces.length === 3 && Math.abs(lens[0] - 24.3) < 0.4 && Math.abs(lens[1] - 27) < 0.6, 'a 70 s recording is cut at its quiet moments: ' + lens.map(x => x.toFixed(1)).join(', '));
ok(lens.every(x => x <= 30), 'every piece is under 30 seconds, which is what Whisper hears');
ok(g(`recPieces`)(make(40, [[0, 40]])).length === 0, 'a recording with nothing said gives nothing to write out');

// ---- record into a box, then the words go in and Sort it follows
w.eval(`openCapture(false)`); await tick(80);
const mic = d.querySelector('#capTalk .micbtn');
ok(!!mic, 'Capture has its microphone');
let sent = null, sorted = 0;
w.eval(`recPcm = async () => new Float32Array(16000 * 5).map((_, i) => 0.3 * Math.sin(i / 7))`);
w.__spAsk = async (msg, on) => { sent = msg; on({ type: 'piece', i: 0, n: 1 }); return { type: 'done', text: 'Task for Sam at Example Foods, send the survey on Friday.' }; };
w.eval(`spAsk = (m, on) => window.__spAsk(m, on)`);
w.eval(`aiBlocked = () => ''`);
w.eval(`captureSort = async () => { window.__sorted = (window.__sorted || 0) + 1; }`);
mic.click(); await tick(80);
ok(g(`micSession && micSession.recording`) && !w.__live && /Recording/.test(w.__t), 'tapping it records, rather than live listening');
ok(/Finish 0:0\d/.test(mic.textContent), 'the button shows Finish and the time');
mic.click(); await tick(150);
ok(sent && sent.cmd === 'run' && sent.model === 'Xenova/whisper-base.en' && sent.pieces.length === 1, 'Finish sends the pieces to the speech engine, with the chosen model');
ok($('capText').value === 'Task for Sam at Example Foods, send the survey on Friday.' && w.__sorted === 1, 'the words land in the box and Sort it follows');
ok(tracksStopped >= 1 && !g(`micSession`) && mic.textContent === '' && /of speech written out in/.test(w.__t), 'the microphone is released, and it says how long it took: ' + w.__t);

// ---- the box went away while recording: the words go to Capture, not lost
w.eval(`showScreen('home')`); await tick(50);
const tmic = d.querySelector('#tkNotesActs .micbtn');
w.eval(`openTask()`); await tick(80);
tmic.click(); await tick(80);
w.eval(`(() => { const t = document.getElementById('taskdlg'); t.close(); })()`); await tick(250);
ok(/Task for Sam/.test(g(`CAP.text`)) && /It is in Capture/.test(w.__t), 'a recording whose box closed is written out into Capture');

// ---- it fails: say why, and offer to keep the recording
w.__spAsk = async () => { throw new Error('Failed to fetch'); };
w.eval(`openCapture(false)`); await tick(80);
confirms = []; answer = false;
mic.click(); await tick(80); mic.click(); await tick(200);
ok(/the speech model could not be downloaded\. It needs signal the first time/.test(confirms[0] || '') && /Save the recording to this phone/.test(confirms[0] || ''), 'a failed download says so, and offers to save the recording');
ok(!g(`micSession`) && g(`recBusy`) === 0, 'and nothing is left half-done');

// ---- Live is unchanged
$('talkMode').querySelector('[data-v="live"]').click(); await tick(50);
mic.click(); await tick(50);
ok(w.__live && !g(`micSession.recording`), 'set back to Live, the microphone listens live as before');

const real = errs.filter(e => !/Not implemented|Could not parse CSS/i.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}` + (fail ? `  FAIL ${fail}` : ''));
process.exit(fail ? 1 : 0);
