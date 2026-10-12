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
// v127: the Blue Sheet's boxes (marked data-talk) and the two description boxes have one too
const bs = mics.filter(m => ['osText', 'odDesc'].includes(m.dataset.mic) || ($(m.dataset.mic) && $(m.dataset.mic).dataset.talk));
ok(bs.length === 3 && mics.length === tidies.length + 2 + bs.length, 'nowhere else, beyond the Blue Sheet\'s: ' + mics.length);
ok(mics.every(m => m.getAttribute('aria-label') === 'Talk into this box' && m.querySelector('svg') && !m.textContent), 'each is an icon with an accessible name');

// ---- the stand-in for supabase.functions.invoke
const sent = [];
let answer = { data: { text: '• Line 2 belt is stretched.\n• Sprockets are worn.', used: 1 }, error: null };
// only the AI calls are counted: the app's own manuals check also goes through invoke a few seconds after it opens
w.__invoke = async (name, opts) => { if (name !== 'ai-tidy') return { data: null, error: new Error('not stubbed') }; sent.push({ name, body: opts && opts.body }); return answer; };
g(`(() => { sbClient = {functions: {invoke: (n, o) => window.__invoke(n, o)}}; sbUser = {id: 'u1'}; })()`);

const press = (b, type) => b.dispatchEvent(new w.MouseEvent(type, { bubbles: true, cancelable: true, detail: 1 }));
// a touch tap's click can arrive with detail 0, like a keyboard's (Chromium does this): it must not count twice
const tap = async b => { press(b, 'pointerdown'); press(b, 'pointerup'); b.dispatchEvent(new w.MouseEvent('click', { bubbles: true, detail: 0 })); await tick(); };
const silence = async () => { rec().onerror({ error: 'no-speech' }); rec().onend(); await tick(); };   // the phone's recogniser gives up on a pause

// ---- a call's note: tap, talk, pause, carry on, Finish
await g(`(async () => { call = {id: 'c1', customer: 'Acme', date: '10/10/2026', type: 'Site call', contacts: [], entries: [], loose: [], updated: 1}; await saveCall(); openEntry('note', true); })()`);
await tick();
$('nText').value = 'Earlier line.';
const nMic = () => d.querySelector('.micbtn[data-mic="nText"]');
await tap(nMic());
ok(rec().started && rec().lang === 'en-AU' && rec().continuous && rec().interimResults, 'a tap starts listening, Australian English');
ok(nMic().classList.contains('on') && nMic().textContent === 'Finish' && nMic().getAttribute('aria-label') === 'Finish talking' && /Tap Finish when you are done/.test(toast()),
  'the button turns into Finish: ' + nMic().textContent);
say([R('so line two the belt', false)]);
ok($('nText').value === 'Earlier line.\nso line two the belt', 'words appear as you speak, after what was there: ' + JSON.stringify($('nText').value));
say([R('so line two the belt is stretched', true)]);
// some Android builds repeat the earlier words in the next result
say([R('so line two the belt is stretched', true), R('so line two the belt is stretched sprockets worn', true)], 1);
ok($('nText').value === 'Earlier line.\nso line two the belt is stretched sprockets worn', 'repeated words are not doubled: ' + JSON.stringify($('nText').value));
// a pause to think: the recogniser ends itself; it stops quietly (no restart, so no alert), keeps the words, sends nothing
const runs = w.__recs.length;
await silence();
const fin = () => nMic().nextElementSibling && nMic().nextElementSibling.classList.contains('micfin') ? nMic().nextElementSibling : null;
ok(w.__recs.length === runs && sent.length === 0 && !g('micSession.rec.stopped') && nMic().classList.contains('paused') && !nMic().classList.contains('on'),
  'a pause stops quietly: not started again, nothing sent');
ok(nMic().textContent === 'Continue' && fin() && fin().textContent === 'Finish' && /Paused/.test(toast()), 'the button reads Continue, with Finish beside it');
ok($('nText').value === 'Earlier line.\nso line two the belt is stretched sprockets worn', 'the words so far stay in the box');
await tap(nMic());
ok(w.__recs.length === runs + 1 && rec().started && nMic().classList.contains('on') && nMic().textContent === 'Finish' && !fin(), 'Continue listens again (one alert, because you asked)');
say([R('rods are fine make that a bullet list', true)]);
ok($('nText').value === 'Earlier line.\nso line two the belt is stretched sprockets worn rods are fine make that a bullet list', 'and the words carry on in the same box: ' + JSON.stringify($('nText').value));
await silence();
ok(sent.length === 0 && fin(), 'paused again');
fin().click(); await tick(150);
ok(!nMic().classList.contains('on') && nMic().textContent === '', 'Finish stops listening');
ok(sent.length === 1 && sent[0].body.kind === 'tidy' && sent[0].body.field === 'note' && /sprockets worn rods are fine make that a bullet list/.test(sent[0].body.text) && /^Earlier line\./.test(sent[0].body.text),
  'then the whole box goes to Claude straight away, spoken instruction and all');
ok($('aidlg').hasAttribute('open') && /Sprockets are worn/.test($('aiOut').value), 'and Claude\'s version is shown to check');
$('aiUse').click(); await tick(150);
ok($('nText').value === '• Line 2 belt is stretched.\n• Sprockets are worn.', 'Use this puts it in the box');

// ---- hold to talk: talk while pressed, let go to finish
const bMic = nMic();
let n0 = sent.length;
press(bMic, 'pointerdown'); await tick();
ok(rec().started && bMic.classList.contains('on'), 'pressing starts listening');
await tick(500);
say([R('rods are fine', true)]);
const heldRuns = w.__recs.length;
await silence();                                   // a pause while held: keeps listening
ok(w.__recs.length === heldRuns + 1 && bMic.classList.contains('on'), 'while held, a pause keeps listening');
say([R('chains are fine', true)]);
press(bMic, 'pointerup'); press(bMic, 'click'); await tick(150);
ok(sent.length === n0 + 1 && /rods are fine chains are fine$/.test(sent[sent.length - 1].body.text) && !bMic.classList.contains('on'), 'letting go after a hold finishes and goes to Claude: ' + sent[sent.length - 1].body.text.slice(-40));
$('aiKeep').click(); await tick(100);

// ---- a long press must not open the text menu
const cm = new w.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
bMic.dispatchEvent(cm);
ok(cm.defaultPrevented, 'a long press does not open the text menu');

// ---- held for two minutes with nothing heard: finishes by itself
n0 = sent.length;
press(bMic, 'pointerdown'); await tick(500); say([R('one more thing', true)]);
g(`(() => { micSession.lastHeard = Date.now() - 121000; })()`);
await silence(); await tick(150);
ok(sent.length === n0 + 1 && !bMic.classList.contains('on'), 'held through two minutes of quiet, it finishes and goes to Claude');
press(bMic, 'pointerup'); await tick();
$('aiKeep').click(); await tick(100);

// ---- a keyboard Enter (a click with no press before it) works as a tap
n0 = sent.length;
await tick(1600);
bMic.click(); await tick();
ok(bMic.classList.contains('on'), 'Enter starts it');
say([R('keyboard words', true)]);
await tick(1600);
bMic.click(); await tick(150);
ok(sent.length === n0 + 1 && !bMic.classList.contains('on'), 'and Enter again finishes');
$('aiKeep').click(); await tick(100);

// ---- nothing heard, microphone blocked, no signal
n0 = sent.length;
await tap(bMic); await tap(bMic); await tick(100);
ok(sent.length === n0 && /Nothing was heard/.test(toast()), 'nothing heard: says so, sends nothing');
await tick(1600);
await tap(bMic); await silence(); await tick(100);
ok(sent.length === n0 && /Nothing was heard/.test(toast()) && !g('micSession') && !bMic.classList.contains('paused'), 'a pause before anything is said: ends, not paused');
await tap(bMic); rec().onerror({ error: 'not-allowed' }); rec().onend(); await tick(100);
ok(sent.length === n0 && /not allowed/.test(toast()) && !bMic.classList.contains('on'), 'microphone blocked: says how to allow it, and stops');
await tap(bMic); say([R('half said', true)]); rec().onerror({ error: 'network' }); rec().onend(); await tick(100);
ok(sent.length === n0 && /needs signal/.test(toast()) && /words so far are in the box/.test(toast()), 'signal lost: says so, keeps the words: ' + toast());
// held, a recogniser that will not stay up does not spin for ever
await tick(1600);
press(bMic, 'pointerdown'); await tick(500);
for (let i = 0; i < 6 && g('micSession'); i++) { rec().onend(); await tick(); }
ok(!g('micSession') && !bMic.classList.contains('on'), 'a recogniser that keeps dying straight away stops trying');
press(bMic, 'pointerup'); await tick();

// ---- signed out: the words stay, nothing sent
g(`(() => { sbUser = null; })()`);
const kept = $('nText').value;
await tap(bMic); say([R('extra words', true)]); await tap(bMic); await tick(150);
ok(sent.length === n0 && $('nText').value === kept + '\nextra words' && /Your words are in the box/.test(toast()), 'signed out: words in the box, nothing sent: ' + toast());
g(`(() => { sbUser = {id: 'u1'}; })()`);

// ---- leaving the screen while paused: the words stay, nothing sent
await tick(1600);
await tap(bMic); say([R('paused words', true)]); await silence();
const pausedBox = $('nText').value;
g(`go('dash')`); await tick(150);
ok(sent.length === n0 && !g('micSession') && /paused words$/.test(pausedBox) && g(`call.entries.length`) >= 0, 'leaving the screen while paused sends nothing');
await g(`(async () => { openEntry('note', true); })()`); await tick();

// ---- leaving the screen mid-sentence: stop, send nothing
await tap(bMic); say([R('half a thought', false)]);
const r1 = rec();
g(`go('dash')`); await tick(150);
ok(r1.aborted && sent.length === n0 && !d.querySelector('.micbtn.on') && !g('micSession'), 'leaving the screen stops listening and sends nothing');

// ---- a one-line box keeps one line
await g(`(async () => { openEntry('project', true); })()`); await tick();
$('pNext').value = '';
const pMic = d.querySelector('.micbtn[data-mic="pNext"]');
await tap(pMic); say([R('send the quote friday', true)]); await tap(pMic); await tick(150);
ok(sent[sent.length - 1].body.field === 'short' && sent[sent.length - 1].body.text === 'send the quote friday', 'a one-line box goes as a one-line field');
$('aiKeep').click(); await tick(100);
g(`go('dash')`); await tick();

// ---- an email task: say the points, the draft comes straight back
answer = { data: { subject: 'Line 2 quote', body: 'Hi Sam,\n\nThe quote is attached.\n\nKind regards,', used: 5 }, error: null };
g(`openTask(null, {})`); await tick();
d.querySelector('#tkType [data-v="Write email"]').click(); await tick();
$('tkTitle').value = 'Line 2 quote';
const eMic = d.querySelector('.micbtn[data-mic="tkBody"]');
await tap(eMic); say([R('tell sam the quote is attached', true)]); await silence();
await tick(1600); await tap(eMic); say([R('keep it short', true)]); await tap(eMic); await tick(200);
const last = sent[sent.length - 1].body;
ok(last.kind === 'email' && last.points === 'tell sam the quote is attached keep it short', 'email body: the points, pause and all, go to Draft it straight away: ' + last.points);
ok($('aidlg').hasAttribute('open') && $('aiSubj').value === 'Line 2 quote', 'and the draft is shown to check');
$('aiKeep').click(); await tick(150);
// task notes: Tidy
answer = { data: { text: 'Ring Sam on Friday.', used: 6 }, error: null };
const tMic = d.querySelector('.micbtn[data-mic="tkNotes"]');
await tap(tMic); say([R('ring sam on friday', true)]); await tap(tMic); await tick(200);
ok(sent[sent.length - 1].body.kind === 'tidy' && sent[sent.length - 1].body.text === 'ring sam on friday', 'task notes: Tidy straight away');
$('aiKeep').click(); await tick(150);
// closing the task form mid-sentence stops listening
await tap(tMic);
const r2 = rec();
$('tkOk').click(); await tick(200);
ok(r2.aborted && !d.querySelector('.micbtn.on') && !g('micSession'), 'closing the task form stops listening');

// ---- Help
ok(/Talk into a box, or tidy a note/.test($('s-help').textContent) && /make that a bullet list/.test($('s-help').textContent) && /hold the microphone while you talk/i.test($('s-help').textContent), 'Help covers the microphone, holding it, and spoken instructions');

const real = errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/i.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
