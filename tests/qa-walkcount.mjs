// v180: a conveyor walked with every check OK has no entries of its own, and
// was read as "nothing logged": closed as nothing to report, left out of
// Reports and the notes' history, refused by the AI summary. It counts now,
// once per conveyor. Also: the backup carries Capture's words and held notes.
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
const g = e => w.eval('(' + e + ')');
w.eval(`toast = m => { window.__t = m; }`);
const A = 'Example Foods - Smithfield';
const clean = {id: 'c1', customer: A, date: '27/10/2026', type: 'Site call', mgr: 'Ben', contacts: [], entries: [], loose: [], status: 'open',
  walks: [{id: 'wk1', asset: 'CV-200', at: 1}], updated: Date.now()};
const faulty = {id: 'c2', customer: A, date: '20/10/2026', type: 'Site call', mgr: 'Ben', contacts: [], loose: [], status: 'done', closed: true,
  walks: [{id: 'wk2', asset: 'CV-300', at: 1}],
  entries: [{type: 'health', walk: 'wk2', g: 'sag', st: 'fix', fault: 'Too much sag', photos: []},
            {type: 'health', walk: 'wk2', g: 'tracking', st: 'watch', fault: 'Tracking off', photos: []},
            {type: 'belt', asset: 'CV-300', series: '800', why: {c: ['Worn'], t: 'rods out'}, photos: []}], updated: Date.now()};
await g(`(async () => {
  const list = [{a: '${A}', sub: 'Smithfield', z: 'Z1', foc: 'High', cad: CAD['High'], mgr: 'Ben', rep: '', c: []}];
  await accReplaceAll(list); indexAccounts(list);
  call = ${JSON.stringify(clean)}; await saveCall();
  await callsPut(${JSON.stringify(faulty)});
})()`); await tick(80);

ok(g(`callCount(call)`) === 1, 'a conveyor walked all OK counts as one thing logged');
ok(g(`callCount(${JSON.stringify(faulty)})`) === 2, 'a conveyor with two faults counts once, plus the belt');
ok(/CV-200/.test(g(`callDigest(call)`)) && /all 10 checks OK/.test(g(`callDigest(call)`)), 'the AI is told the conveyor was checked, all OK: ' + g(`callDigest(call)`).split('\n').pop());
const dg = g(`callDigest(${JSON.stringify(faulty)})`);
ok(/2 faults, below; the other 8 checks OK/.test(dg) && /why replace it: Worn; rods out/.test(dg), 'and with faults, how many, and the belt\'s reason');
ok(/CV-200 \(all OK\)/.test(g(`histLine(call)`)) && /CV-300 \(1 to fix, 1 to watch\)/.test(g(`histLine(${JSON.stringify(faulty)})`)), 'the notes\' history names each conveyor and what it found');
ok(/1 health check/.test(g(`reportLine(call)`)), 'Reports counts the walk: ' + g(`reportLine(call)`));
ok(g(`mboRuleMatch({health: true}, call)`), 'an MBO rule "a health check" is met by a walk all OK');
w.eval(`markCallDone(call, true)`); await tick(150);
const c1 = (await g(`callsAll()`)).find(c => c.id === 'c1');
ok(c1.closed && !c1.noReport, 'finished, it is not "nothing to report"');
ok(g(`callSummary(${JSON.stringify(Object.assign({}, clean, {noReport: true}))}).noReport`) === false, 'and an older one marked so reads right');

// ---- the backup carries Capture's words and the held notes
await g(`(async () => { CAP.text = 'ring George'; await capSave();
  await tasksPut({id: 'cn1', kind: 'capnote', acct: '${A}', text: 'bring samples', at: 1, updated: 1}); await capLoad(); })()`);
const bk = await g(`buildBackup(false)`);
ok(bk.tasks.some(t => t.kind === 'capture' && t.text === 'ring George') && bk.tasks.some(t => t.id === 'cn1'), 'the backup has Capture\'s words and the held note');
await g(`(async () => { CAP.text = 'newer words'; await capSave(); })()`);
const back = JSON.parse(JSON.stringify(bk)); back.calls = [];
w.__bk = JSON.stringify(back);
await g(`doRestore({text: async () => window.__bk})`).catch(e => errs.push('restore ' + e));
await tick(100);
ok(g(`CAP.text`) === 'newer words' && g(`CAP_HELD.length`) === 1, 'restoring never replaces words waiting on this phone');

const real = errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/i.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
