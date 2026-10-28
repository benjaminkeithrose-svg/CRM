// v156: pictures pasted (Ctrl+V) or dragged into a call on the PC go to the
// entry open, or the call's loose photos; a Bullets button under each long
// text box puts bullets on and takes them off, Enter continues them, and the
// documents print them as lists. Everything here is made up.
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
for (const f of ['zones.js', 'manuals.js', 'healthlib.js', 'xlsx-0.18.5.full.min.js', 'app.js']) {
  const el = d.createElement('script'); el.textContent = fs.readFileSync(f, 'utf8'); d.body.appendChild(el);
}
d.dispatchEvent(new w.Event('DOMContentLoaded'));
await tick(500);
const $ = id => d.getElementById(id);
const g = e => w.eval('(' + e + ')');
const toasts = []; w.eval(`toast = m => { window.__toasts = (window.__toasts || []).concat([m]); }`);
const lastToast = () => (w.__toasts || []).slice(-1)[0] || '';
// jsdom cannot decode or draw images: shrink() hands the picture back as it is
w.eval(`shrink = async f => new Blob([await f.arrayBuffer()], {type: 'image/jpeg'})`);
const pic = (name = 'shot.png') => new w.File([new Uint8Array([137, 80, 78, 71, 1, 2, 3])], name, {type: 'image/png'});
const clip = files => ({items: files.map(f => ({kind: 'file', type: f.type, getAsFile: () => f})), files});
const paste = (dt, target = d.body) => { const e = new w.Event('paste', {bubbles: true, cancelable: true}); Object.defineProperty(e, 'clipboardData', {value: dt}); target.dispatchEvent(e); return e; };
const drop = (files, target = d.body) => { const e = new w.Event('drop', {bubbles: true, cancelable: true}); Object.defineProperty(e, 'dataTransfer', {value: {files, types: ['Files']}}); target.dispatchEvent(e); return e; };

// ---- pictures: nothing outside a call
let e = paste(clip([pic()]));
ok(!e.defaultPrevented, 'outside a call a paste is left alone');

// ---- on the call itself: loose photos
await g(`startTestCall()`); await tick(300);
g(`showScreen('dash')`); await tick(50);
const loose0 = g(`(call.loose || []).length`);
e = paste(clip([pic()])); await tick(200);
ok(e.defaultPrevented && g(`(call.loose || []).length`) === loose0 + 1, 'Ctrl+V with a picture on the call adds it to the loose photos');
ok(/loose photos/.test(lastToast()), 'and says so: ' + lastToast());
e = paste({items: [{kind: 'string', type: 'text/plain', getAsFile: () => null}], files: []});
ok(!e.defaultPrevented, 'text pastes as usual');

// ---- in an entry: that entry's photos
g(`showScreen('note')`); await tick(50);
e = paste(clip([pic(), pic('b.png')])); await tick(200);
ok(e.defaultPrevented && g(`SHOTS.note.length`) === 2 && /2 pictures pasted: saved with this note when you tap Done/.test(lastToast()), 'in a note, two pasted pictures wait with the note: ' + lastToast());
// pasted into the note's text box: still a picture, not text
paste(clip([pic()]), $('nText')); await tick(200);
ok(g(`SHOTS.note.length`) === 3, 'pasted while typing in the note, it is still added as a picture');
$('nTopic').value = 'Pasted'; $('nText').value = 'With pictures';
g(`showScreen('project')`); await tick(50);
e = drop([pic('drag.png'), new w.File(['x'], 'notes.txt', {type: 'text/plain'})]); await tick(200);
ok(e.defaultPrevented && g(`SHOTS.project.length`) === 1, 'a picture dragged onto a project is added; a text file is not');

// ---- bullets: on the long boxes, not the spec fields
const btn = id => d.querySelector('[data-bul="' + id + '"]');
ok(['vSummary', 'nText', 'pNotes', 'bComment', 'hComment', 'hAction', 'tkNotes', 'dAgenda', 'odDesc'].every(id => btn(id) && /Bullets/.test(btn(id).textContent)), 'a Bullets button under each long box');
ok(!btn('bAsset') && !btn('hFault') && d.querySelectorAll('.bulbtn').length === 9 && !d.getElementById('bCommentBullet'), 'and nowhere else; the old Insert bullet buttons are gone');
const T = $('pNotes');
const set = (v, s, en = s) => { T.value = v; T.setSelectionRange(s, en); };
set('Conveyor 3 tracking', 5); btn('pNotes').click();
ok(T.value === '• Conveyor 3 tracking' && T.selectionStart === 7, 'on one line: a bullet goes on, the cursor stays where it was');
btn('pNotes').click();
ok(T.value === 'Conveyor 3 tracking' && T.selectionStart === 5, 'tap again: it comes off');
set('Intro\nfirst\n\nsecond\nEnd', 6, 20); btn('pNotes').click();
ok(T.value === 'Intro\n• first\n\n• second\nEnd', 'a selection: every line in it gets one, blank lines stay blank: ' + JSON.stringify(T.value));
T.setSelectionRange(6, 21); btn('pNotes').click();
ok(T.value === 'Intro\nfirst\n\nsecond\nEnd', 'and they all come off together: ' + JSON.stringify(T.value));
set('- dash one\nplain', 0, 16); btn('pNotes').click();
ok(T.value === '- dash one\n• plain', 'a line already marked with - keeps it: ' + JSON.stringify(T.value));
let typed = 0; T.addEventListener('input', () => typed++);
set('', 0); btn('pNotes').click();
ok(T.value === '• ' && typed === 1, 'an empty box starts a bullet, and the change counts as typing');
const enter = () => { const k = new w.KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true}); T.dispatchEvent(k); return k; };
set('• one', 5); let k = enter();
ok(k.defaultPrevented && T.value === '• one\n• ' && T.selectionStart === 8, 'Enter on a bullet starts the next one');
k = enter();
ok(T.value === '• one\n' && T.selectionStart === 6, 'Enter on an empty bullet ends the list');
set('plain', 5); k = enter();
ok(!k.defaultPrevented, 'Enter on a plain line is a plain Enter');

// ---- the documents print them as lists
const c = g(`call`);
await g(`(async () => { call.loose = []; call.summary = 'Visit went well\\n• line 3 trial agreed\\n• quote by Friday';
  call.entries.push({type: 'note', topic: 'Hygiene', text: 'Two points:\\n• open hinge\\n• wash-down'});
  call.entries.push({type: 'project', project: 'Line 3', status: 'Discovery', notes: 'Para one\\n\\n- dryer\\n- spiral'}); })()`);
const html = await g(`buildNotesHTML('full', 'none')`);
ok(/<li>line 3 trial agreed<\/li><li>quote by Friday<\/li>/.test(html), 'the summary\'s bullets print as a list');
ok(/<td><p>Two points:<\/p><ul><li>open hinge<\/li><li>wash-down<\/li><\/ul><\/td>/.test(html), 'a note\'s too');
ok(/<p>Para one<\/p><ul><li>dryer<\/li><li>spiral<\/li><\/ul>/.test(html), 'and a project\'s notes, with their paragraphs');

await tick(500);
const real = errs.filter(x => !/Not implemented|Could not parse CSS/.test(x));
ok(real.length === 0, 'no errors', real.join(' | '));
console.log(`PASS ${pass}` + (fail ? `  FAIL ${fail}` : ''));
process.exit(fail ? 1 : 0);
