// v182: a Capture card's words go with it. Added as a task, a visit or a held
// note, what was said is kept ("What you said: ..."), and a task carries the
// project the AI picked out. Ben lost a call's project details when Capture
// made them a task: only the title and a short detail went across.
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
const A = 'Example Foods - Smithfield';
const SAID1 = 'Update the line 3 upgrade project, they have approved stage one, next action is the layout drawing, Jo wants it by the 14th';
w.__ask = async () => ({items: [
  {type: 'task', taskType: 'Update project', title: 'Update the line 3 upgrade project', company: null, person: 'Jo', date: '2026-11-06', time: null,
    project: 'Line 3 upgrade', details: 'Stage one approved', said: SAID1},
  {type: 'visit', taskType: null, title: 'Visit to measure the spiral', company: 'Example Foods', person: null, date: '2026-11-10', time: '10:00',
    details: null, said: 'Visit Example Foods on the 10th at 10 to measure the spiral, bring the tape and the gauge'},
  {type: 'note', taskType: null, title: 'Line 3 is down in December', company: 'Example Foods', person: null, date: null, time: null,
    details: null, said: 'line 3 is down in December'}]});
w.eval(`aiAsk = p => window.__ask(p)`);
await g(`(async () => {
  const list = [{a: '${A}', sub: 'Smithfield', z: 'Z1', foc: 'High', cad: CAD['High'], mgr: 'Ben', rep: '', c: [{n: 'Jo Bloggs', t: 'Engineer', e: ['jo@x.example'], p: ''}]}];
  await accReplaceAll(list); indexAccounts(list);
  call = {id: 'c1', customer: '${A}', date: '27/10/2026', type: 'Site call', mgr: 'Ben', contacts: [], entries: [], loose: [], status: 'open', updated: Date.now()};
  await saveCall(); go('capture');
})()`); await tick(100);

$('capText').value = 'anything'; await g(`captureSort()`); await tick(100);
ok(g('CAP.items.length') === 3 && g('CAP.items[0].project') === 'Line 3 upgrade', 'the card keeps the project the AI picked out');
ok(/Project Line 3 upgrade/.test($('capList') ? $('capList').textContent : d.body.textContent), 'and the card says it');

// the card form shows it for a task, to correct
await g(`capOpen(0)`); await tick(30);
ok(!$('cdProjW').hidden && $('cdProj').value === 'Line 3 upgrade', 'the card form shows the project for a task');
$('cdProj').value = 'Line 3 upgrade (stage 1)'; $('cdOk').click(); await tick(100);
ok(g('CAP.items[0].project') === 'Line 3 upgrade (stage 1)', 'and a change to it is kept');
await g(`capOpen(1)`); await tick(30);
ok($('cdProjW').hidden, 'a visit has no project box'); $('cdOk').click(); await tick(100);

await g(`captureAdd()`); await tick(150);
const t = g(`TASKS.find(t => t.title === 'Update the line 3 upgrade project')`);
ok(t && t.project === 'Line 3 upgrade (stage 1)', 'the task carries the project');
ok(t && /Stage one approved/.test(t.notes) && t.notes.includes('What you said: “' + SAID1 + '”'), 'and everything said, word for word, in its notes: ' + (t && t.notes));
ok(t && t.callId === 'c1', 'and it is still the call\'s');
const ap = g(`APPTS.find(a => /measure the spiral/.test(a.agenda))`);
ok(ap && /bring the tape and the gauge/.test(ap.agenda), 'a visit\'s agenda keeps the words too');
const held = g(`CAP_HELD.find(r => /December/.test(r.text))`);
ok(held && !/What you said/.test(held.text), 'a note whose title already holds every word is not doubled');
ok(g(`capSaidLine({title: 'Ring Jo', details: '', said: 'ring Jo about the trial results'})`) === 'What you said: “ring Jo about the trial results”', 'words beyond the title are kept');

const real = errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/i.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
