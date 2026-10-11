// v108: a microphone beside Tidy on every free-text box of a call, and on a
// task's notes and an email task's body. The phone's speech recognition is a
// stand-in here (jsdom has none): this proves the app's side - words into the
// box as they come, Claude's version straight after, errors, leaving the
// screen - not real recognition, which only a phone can show.
import { JSDOM } from 'jsdom';
import fs from 'fs';
import 'fake-indexeddb/auto';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  x ' + m); } };
const tick = (ms = 50) => new Promise(r => setTimeout(r, ms));
const errs = [];
function load(withSpeech){
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
  if (withSpeech) {
    w.__recs = [];
    w.webkitSpeechRecognition = class {
      constructor(){ w.__recs.push(this); }
      start(){ this.started = true; }
      stop(){ this.stopped = true; setTimeout(() => this.onend && this.onend(), 0); }
      abort(){ this.aborted = true; setTimeout(() => this.onend && this.onend(), 0); }
    };
  }
  for (const f of ['zones.js', 'manuals.js', 'healthlib.js', 'app.js']) {
    const el = d.createElement('script'); el.textContent = fs.readFileSync(f, 'utf8'); d.body.appendChild(el);
  }
  d.dispatchEvent(new w.Event('DOMContentLoaded'));
  return { w, d };
}

// ---- no speech recognition: no microphones
const bare = load(false);
await tick(400);
ok(!bare.d.querySelector('.micbtn'), 'a browser without speech recognition shows no microphone');

const { w, d } = load(true);
await tick(500);
const $ = id => d.getElementById(id);
const g = e => w.eval('(' + e + ')');
const toast = () => $('toast').textContent;
const rec = () => w.__recs[w.__recs.length - 1];
const R = (t, fin) => Object.assign([{ transcript: t }], { isFinal: fin });
const say = (results, from = 0) => rec().onresult({ resultIndex: from, results });

// ---- where they are
const mics = [...d.querySelectorAll('.micbtn')];
const tidies = [...d.querySelectorAll('[data-ai]')];
ok(tidies.every(t => t.previousElementSibling && t.previousElementSibling.classList.contains('micbtn') && t.previousElementSibling.dataset.mic === t.dataset.ai),
  'a microphone just before every Tidy, for the same box');
ok(mics.some(m => m.dataset.mic === 'tkNotes') && mics.some(m => m.dataset.mic === 'tkBody' && m.dataset.after === 'draft' && m.nextElementSibling === $('tkDraft')),
  'and on a task\'s notes, and beside Draft it on an email body');
ok(mics.length === tidies.length + 2, 'nowhere else: ' + mics.length);
ok(mics.every(m => m.getAttribute('aria-label') === 'Talk into this box' && m.querySelector('svg')), 'each is an icon with an accessible name');

// ---- the stand-in for supabase.functions.invoke
const sent = [];
let answer = { data: { text: '• Line 2 belt is stretched.\n• Sprockets are worn.', used: 1 }, error: null };
w.__invoke = async (name, opts) => { sent.push({ name, body: opts && opts.body }); return answer; };
g(`(() => { sbClient = {functions: {invoke: (n, o) => window.__invoke(n, o)}}; sbUser = {id: 'u1'}; })()`);

// ---- a call's note: talk, words appear, stop, Claude's version
await g(`(async () => { call = {id: 'c1', customer: 'Acme', date: '10/10/2026', type: 'Site call', contacts: [], entries: [], loose: [], updated: 1}; await saveCall(); openEntry('note', true); })()`);
await tick();
$('nText').value = 'Earlier line.';
const nMic = d.querySelector('.micbtn[data-mic="nText"]');
nMic.click(); await tick();
ok(rec().started && rec().lang === 'en-AU' && rec().continuous && rec().interimResults, 'tapping starts listening, Australian English');
ok(nMic.classList.contains('on') && nMic.getAttribute('aria-pressed') === 'true' && /Listening/.test(toast()), 'the button shows it is listening');
say([R('so line two the belt', false)]);
ok($('nText').value === 'Earlier line.\nso line two the belt', 'words appear as you speak, after what was there: ' + JSON.stringify($('nText').value));
say([R('so line two the belt is stretched', true)]);
// some Android builds repeat the earlier words in the next result
say([R('so line two the belt is stretched', true), R('so line two the belt is stretched sprockets worn make that a bullet list', true)], 1);
ok($('nText').value === 'Earlier line.\nso line two the belt is stretched sprockets worn make that a bullet list', 'repeated words are not doubled: ' + JSON.stringify($('nText').value));
ok(sent.length === 0, 'nothing sent while talking');
nMic.click(); await tick(150);
ok(rec().stopped && !nMic.classList.contains('on'), 'a second tap stops listening');
ok(sent.length === 1 && sent[0].body.kind === 'tidy' && sent[0].body.field === 'note' && /make that a bullet list/.test(sent[0].body.text) && /^Earlier line\./.test(sent[0].body.text),
  'then the whole box goes to Claude straight away, spoken instruction and all');
ok($('aidlg').hasAttribute('open') && /Sprockets are worn/.test($('aiOut').value), 'and Claude\'s version is shown to check');
$('aiUse').click(); await tick(150);
ok($('nText').value === '• Line 2 belt is stretched.\n• Sprockets are worn.', 'Use this puts it in the box');

// ---- stopping by silence works the same as the button
const before = sent.length;
const bMic = d.querySelector('.micbtn[data-mic="nText"]');
bMic.click(); await tick();
say([R('rods are fine', true)]);
rec().onend(); await tick(150);
ok(sent.length === before + 1 && !bMic.classList.contains('on'), 'stopping talking also goes straight to Claude');
$('aiKeep').click(); await tick(100);

// ---- nothing heard, microphone blocked, no signal
let n0 = sent.length;
bMic.click(); await tick(); rec().onend(); await tick(100);
ok(sent.length === n0 && /Nothing was heard/.test(toast()), 'nothing heard: says so, sends nothing');
bMic.click(); await tick(); rec().onerror({ error: 'not-allowed' }); rec().onend(); await tick(100);
ok(sent.length === n0 && /not allowed/.test(toast()), 'microphone blocked: says how to allow it');
bMic.click(); await tick(); rec().onerror({ error: 'network' }); rec().onend(); await tick(100);
ok(sent.length === n0 && /needs signal/.test(toast()), 'no signal: says so');

// ---- signed out: the words stay, nothing sent
g(`(() => { sbUser = null; })()`);
const kept = $('nText').value;
bMic.click(); await tick(); say([R('extra words', true)]); bMic.click(); await tick(150);
ok(sent.length === n0 && $('nText').value === kept + '\nextra words' && /Your words are in the box/.test(toast()), 'signed out: words in the box, nothing sent: ' + toast());
g(`(() => { sbUser = {id: 'u1'}; })()`);

// ---- leaving the screen mid-sentence: stop, send nothing
bMic.click(); await tick(); say([R('half a thought', false)]);
const r1 = rec();
g(`go('dash')`); await tick(150);
ok(r1.aborted && sent.length === n0 && !d.querySelector('.micbtn.on'), 'leaving the screen stops listening and sends nothing');

// ---- a one-line box keeps one line
await g(`(async () => { openEntry('project', true); })()`); await tick();
$('pNext').value = '';
const pMic = d.querySelector('.micbtn[data-mic="pNext"]');
pMic.click(); await tick(); say([R('send the quote friday', true)]); pMic.click(); await tick(150);
ok(sent[sent.length - 1].body.field === 'short' && sent[sent.length - 1].body.text === 'send the quote friday', 'a one-line box goes as a one-line field');
$('aiKeep').click(); await tick(100);
g(`go('dash')`); await tick();

// ---- an email task: say the points, the draft comes straight back
answer = { data: { subject: 'Line 2 quote', body: 'Hi Sam,\n\nThe quote is attached.\n\nKind regards,', used: 5 }, error: null };
g(`openTask(null, {})`); await tick();
d.querySelector('#tkType [data-v="Write email"]').click(); await tick();
$('tkTitle').value = 'Line 2 quote';
const eMic = d.querySelector('.micbtn[data-mic="tkBody"]');
eMic.click(); await tick(); say([R('tell sam the quote is attached keep it short', true)]); eMic.click(); await tick(200);
const last = sent[sent.length - 1].body;
ok(last.kind === 'email' && last.points === 'tell sam the quote is attached keep it short', 'email body: the points go to Draft it straight away');
ok($('aidlg').hasAttribute('open') && $('aiSubj').value === 'Line 2 quote', 'and the draft is shown to check');
$('aiKeep').click(); await tick(150);
// task notes: Tidy
answer = { data: { text: 'Ring Sam on Friday.', used: 6 }, error: null };
const tMic = d.querySelector('.micbtn[data-mic="tkNotes"]');
tMic.click(); await tick(); say([R('ring sam on friday', true)]); tMic.click(); await tick(200);
ok(sent[sent.length - 1].body.kind === 'tidy' && sent[sent.length - 1].body.text === 'ring sam on friday', 'task notes: Tidy straight away');
$('aiKeep').click(); await tick(150);
// closing the task form mid-sentence stops listening
tMic.click(); await tick();
const r2 = rec();
$('tkOk').click(); await tick(200);
ok(r2.aborted && !d.querySelector('.micbtn.on'), 'closing the task form stops listening');

// ---- Help
ok(/Talk into a box, or tidy a note/.test($('s-help').textContent) && /make that a bullet list/.test($('s-help').textContent), 'Help covers the microphone and spoken instructions');

const real = errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/i.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
