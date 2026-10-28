// v177: text or a .txt file shared into Field CRM from another app (a Plaud
// transcript, an email): with a call open, into the call as a note or sorted
// into cards; otherwise sorted into cards in Capture. A long one in pieces.
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
w.scrollTo = () => {}; w.alert = () => {}; w.confirm = () => true;
w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
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
w.eval(`toast = m => { window.__t = m; }`);
w.eval(`aiBlocked = () => ''`);
let asks = [];
w.__ask = async p => { asks.push(p); return {items: [{type: 'task', taskType: 'Write email', title: 'Email George', company: null, person: 'George', date: null, time: null, said: 'email George'}]}; };
w.eval(`aiAsk = p => window.__ask(p)`);
const A = 'Example Foods - Smithfield';
await g(`(async () => {
  const list = [{a: '${A}', sub: 'Smithfield', z: 'Z1', foc: 'High', cad: CAD['High'], mgr: 'Ben', rep: '', c: [{n: 'George Smith', t: 'Engineer', e: [], p: ''}]}];
  await accReplaceAll(list); indexAccounts(list);
})()`);

// ---- no call open: into Capture, sorted
await g(`sharedWords('We agreed I would email George the trial results.', 'Plaud recording')`); await tick(150);
ok(asks.length === 1 && /email George/.test(asks[0].text) && g('CAP.items.length') === 1 && !String(g('CAP.text')).trim(), 'with no call open, shared words go into Capture and are sorted into cards');
ok(/Sorted into 1 card/.test(w.__t), 'and it says so: ' + w.__t);

// ---- a call open: a choice; into the call as a note
await g(`(async () => { CAP.items = []; await capSave();
  call = {id: 'c1', customer: '${A}', date: '27/10/2026', type: 'Site call', mgr: 'Ben', contacts: [], entries: [], loose: [], status: 'open', updated: Date.now()};
  await saveCall(); go('dash'); })()`); await tick(100);
asks = [];
await g(`sharedWords('George wants the trial on line 3. I will email him on Friday.', 'Plaud recording')`); await tick(50);
const btns = [...d.querySelectorAll('#vmBody [data-cm]')].map(b => b.textContent);
ok($('vmdlg').hasAttribute('open') && btns.join('|') === 'Add to this call as a note|Sort into cards' && /words · the call with Example Foods/.test($('vmWhen').textContent), 'a call open: it asks, note or cards');
d.querySelector('#vmBody [data-cm="0"]').click(); await tick(150);
const note = g(`call.entries.find(e => e.type === 'note')`);
ok(note && note.topic === 'Other' && /^From Plaud recording:\nGeorge wants the trial/.test(note.text) && !asks.length && g('screen') === 'dash', 'Add to this call: a note on the call, nothing sent to the AI');
ok(/Project|Note/.test($('logList').textContent) && /George wants the trial/.test($('logList').textContent), 'it is in the call log');

// or sorted, "this customer" being the call's
await g(`sharedWords('Email George about the trial.', 'shared text')`); await tick(50);
d.querySelector('#vmBody [data-cm="1"]').click(); await tick(200);
ok(asks.length === 1 && g('CAP.items.length') === 1 && g('CAP.items[0].acct') === A && g('CAP.items[0].callId') === 'c1', 'Sort into cards: sorted with the call as its customer');

// ---- a .txt file shared or opened goes the same way
await g(`(async () => { call = null; CAP.items = []; await capSave(); })()`);
asks = [];
await g(`routeIncomingFile(new File(['Email George on Monday.'], 'Recording 27 Oct.txt', {type: 'text/plain'}))`); await tick(150);
ok(asks.length === 1 && /Email George on Monday/.test(asks[0].text) && g('CAP.items.length') === 1, 'a .txt file is read and sorted');

// ---- a long transcript goes in pieces, none cut off
const para = 'This is a sentence of the conversation about belts and sprockets on the line. '.repeat(20);
const long = Array.from({length: 12}, (_, i) => 'Part ' + i + '. ' + para).join('\n\n');
const parts = g(`capChunks(${JSON.stringify(long)})`);
ok(long.length > 15000 && parts.length >= 3 && parts.every(p => p.length <= 5500) && parts.join('\n\n').replace(/\s+/g, ' ').trim() === long.replace(/\s+/g, ' ').trim(), 'a long transcript is cut into pieces under the limit, nothing lost: ' + parts.length);
asks = [];
await g(`sharedWords(${JSON.stringify(long)}, 'Plaud recording')`); await tick(300);
ok(asks.length === parts.length, 'and each piece is sorted: ' + asks.length);

const real = errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/i.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
