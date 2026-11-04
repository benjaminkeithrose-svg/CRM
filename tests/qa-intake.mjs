// v193: the intake. Each own finished call goes into the PC folder (filed,
// with the file for Claude) and a ticket into Intake; Claude's report comes
// back with Bring in from Claude. The folder is faked in memory; the real
// picker, its permission prompt and the disk are not tested.
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
w.indexedDB = indexedDB; w.IDBKeyRange = IDBKeyRange;
w.scrollTo = () => {}; w.alert = () => {};
let asked = '', answer = true; w.confirm = m => { asked = m; return answer; };
let phone = false;
w.matchMedia = () => ({ matches: phone, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
w.navigator.storage = { persist: async () => true, persisted: async () => true };
w.URL.createObjectURL = () => 'blob:stub'; w.URL.revokeObjectURL = () => {};
if (!w.HTMLDialogElement.prototype.showModal) w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
if (!w.HTMLDialogElement.prototype.close) w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new w.Event('close')); };
w.HTMLCanvasElement.prototype.getContext = () => null;
Object.defineProperty(w, 'crypto', { value: globalThis.crypto, configurable: true });
w.console.error = (...a) => errs.push(a.join(' ')); w.console.warn = () => {};

// ---- an in-memory folder that behaves like FileSystemDirectoryHandle
const err = (name) => Object.assign(new Error(name), { name });
class FakeFile { constructor(name) { this.kind = 'file'; this.name = name; this.data = null; }
  async createWritable() { let buf = null; const f = this;
    return { async write(x) { buf = x; }, async close() { f.data = buf; } }; }
  async getFile() { const x = this.data; return { name: this.name, text: async () => typeof x === 'string' ? x : await x.text() }; } }
class FakeDir {
  constructor(name) { this.kind = 'directory'; this.name = name; this.kids = new Map(); }
  async getDirectoryHandle(n, o = {}) { let k = this.kids.get(n);
    if (!k) { if (!o.create) throw err('NotFoundError'); k = new FakeDir(n); this.kids.set(n, k); }
    if (k.kind !== 'directory') throw err('TypeMismatchError'); return k; }
  async getFileHandle(n, o = {}) { let k = this.kids.get(n);
    if (!k) { if (!o.create) throw err('NotFoundError'); k = new FakeFile(n); this.kids.set(n, k); }
    if (k.kind !== 'file') throw err('TypeMismatchError'); return k; }
  async removeEntry(n) { if (!this.kids.delete(n)) throw err('NotFoundError'); }
  async queryPermission() { return 'granted'; }
  async requestPermission() { return 'granted'; }
}
const at = (dir, path) => path.split('/').reduce((x, p) => x && x.kids.get(p), dir);
const names = dir => dir ? [...dir.kids.keys()].sort() : [];

for (const f of ['zones.js', 'manuals.js', 'healthlib.js', 'app.js']) {
  const el = d.createElement('script'); el.textContent = fs.readFileSync(f, 'utf8'); d.body.appendChild(el);
}
d.dispatchEvent(new w.Event('DOMContentLoaded'));
await tick(500);
const $ = id => d.getElementById(id);
const g = e => w.eval('(' + e + ')');
w.eval(`toast = m => { window.__t = m; }`);
const A = 'Example Foods - Smithfield';
const DAY = 86400000, now = Date.now();
const root = new FakeDir('Field CRM');
let perm = 'granted';
root.queryPermission = async () => perm;
root.requestPermission = async () => (perm = 'granted');
w.showDirectoryPicker = async () => root;
w.__root = root;
const dd = t => { const x = new Date(t); return String(x.getDate()).padStart(2, '0') + '/' + String(x.getMonth() + 1).padStart(2, '0') + '/' + x.getFullYear(); };
const isoOf = t => { const x = new Date(t); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
const D1 = dd(now - 2 * DAY), I1 = isoOf(now - 2 * DAY);

await g(`(async () => {
  const list = [{a: '${A}', sub: 'Smithfield', z: 'Z1', foc: 'High', cad: CAD['High'], mgr: 'Alex Example', rep: '',
    c: [{n: 'Jo Bloggs', r: 'Maintenance', t: '', p: '0400 000 001', pk: 'ok', e: ['jo.bloggs@example.com']}]}];
  await accReplaceAll(list); indexAccounts(list);
  const base = {customer: '${A}', type: 'Site call', mgr: 'Alex Example', site: '', status: 'done', closed: true,
    contacts: [{name: 'Jo Bloggs', role: 'Maintenance', email: 'jo.bloggs@example.com', doc: true}, {name: 'Pat Example', role: 'Buyer', email: 'pat@example.com', doc: false}],
    entries: [{type: 'note', topic: 'Other', text: 'Rods walking out on CV-200', photos: []}]};
  await callsPut(Object.assign({}, base, {id: 'c1', date: '${D1}', updated: ${now - 2 * DAY}}));
  await callsPut(Object.assign({}, base, {id: 'old', date: '${dd(now - 60 * DAY)}', updated: ${now - 60 * DAY}}));
  await callsPut(Object.assign({}, base, {id: 'team', date: '${D1}', updated: ${now - DAY}}));
  await callsPut(Object.assign({}, base, {id: 'nil', date: '${D1}', updated: ${now - DAY}, entries: [], noReport: true}));
  await callsPut(Object.assign({}, base, {id: 'open', date: '${dd(now)}', updated: ${now}, closed: false, status: 'in progress'}));
  OWNERS = {'calls/team': 'someone-else'};
  TASKS = [{id: 't1', callId: 'c1', title: 'Send the CV-200 quote', type: 'Quote', date: '${isoOf(now + 3 * DAY)}', done: false, updated: ${now}},
           {id: 't2', callId: 'c1', title: 'Old step', date: '', done: true, updated: ${now}}];
  pcHandle = window.__root;     // the folder picked before (a real handle is kept in kv; a fake one cannot be)
})()`); await tick(100);

// ---- what is waiting
let pend = await g(`inPending().then(l => l.map(c => c.id))`);
ok(pend.join() === 'c1', 'only your own finished call from the last fortnight with something in it: ' + pend.join());
g(`go('reports')`); await tick(300);
ok(!$('rpIntake').hidden && /Send to intake \(1\)/.test($('rpIntake').textContent), 'Reports has Send to intake (1)');
ok($('rpBringIn').hidden, 'no Bring in from Claude while nothing is back');

// ---- quietly, when the folder is no longer allowed: nothing
perm = 'prompt';
let r = await g(`inSendAll(false)`);
ok(r === null && !root.kids.has('Intake'), 'after a sync, a folder needing a tap is left alone');
perm = 'granted';

// ---- sent
r = await g(`inSendAll(false)`); await tick(50);
ok(r && r.n === 1, 'sent quietly once allowed');
const intake = at(root, 'Intake');
const tname = names(intake)[0] || '';
ok(names(intake).length === 1 && tname === I1 + ' Example Foods - Smithfield (c1).json', 'one ticket, named by day and customer: ' + tname);
const visit = at(root, 'Example Foods/Smithfield/' + I1);
const vn = names(visit);
ok(vn.includes('Field CRM call.json') && vn.some(n => /\.html$/.test(n)), 'filed: the notes and the file for Claude in the visit folder: ' + vn.join('|'));
const t = JSON.parse(await at(intake, tname).data.text());
ok(t.kind === 'field-crm-intake-ticket' && t.v === 1 && t.callId === 'c1' && t.customer === A && t.date === I1 && !t.quote && !t.again, 'the ticket says what it is and for which call');
ok(t.folder === 'Example Foods\\Smithfield\\' + I1 && t.folderParts.length === 3 && t.files.call === 'Field CRM call.json' && /\.html$/.test(t.files.notes) && t.files.report === 'fieldcrm-import.json', 'and where its files are');
ok(t.steps.length === 1 && t.steps[0].what === 'Send the CV-200 quote' && t.steps[0].date === isoOf(now + 3 * DAY), 'its open next steps, with their dates: ' + JSON.stringify(t.steps));
ok(t.contacts.length === 1 && t.contacts[0].email === 'jo.bloggs@example.com', 'contacts: only those ticked for documents');
ok(/Sent 1 call to the intake/.test(g('window.__t')), 'a toast says so');
const saved = JSON.parse(await at(visit, 'Field CRM call.json').data.text());
ok(saved.kind === 'field-crm-call-for-claude' && saved.call.id === 'c1', 'the same file Save for Claude writes');
pend = await g(`inPending().then(l => l.length)`);
ok(pend === 0, 'nothing waiting after');
await g(`renderIntake()`);
ok($('rpIntake').textContent.trim() === 'Send to intake', 'the button count goes');

// ---- the button when all is sent
await g(`inSendAll(true)`);
ok(/already in the intake/.test(g('window.__t')), 'the button says when there is nothing to send');

// ---- changed: sent again, marked as again
await g(`(async () => { const c = (await callsAll()).find(x => x.id === 'c1'); c.entries[0].text += ' and the left side'; c.updated = Date.now(); await callsPut(c); })()`);
r = await g(`inSendAll(true)`);
const t2 = JSON.parse(await at(intake, tname).data.text());
ok(r.n === 1 && t2.again && names(intake).length === 1, 'a changed call goes again, its ticket replaced and marked again');

// ---- Claude's report back
const report = {kind: 'field-crm-claude-report', v: 1, made: now + 1000, callId: 'c1', customer: A, date: I1,
  summary: '- CV-200: rods walking out on the left side.', internal_notes: '- Budget about $40k.',
  documents: {internal: '<html><body>Site walk notes</body></html>', customer: '<html><body>Site walk report</body></html>'}};
const put = async (dir, x) => { const f = await dir.getFileHandle('fieldcrm-import.json', {create: true}); const wr = await f.createWritable(); await wr.write(JSON.stringify(x)); await wr.close(); };
await put(visit, report);
let ready = await g(`inReady(true).then(l => l.map(x => x.c.id))`);
ok(ready.join() === 'c1', 'Claude\'s report is found in the call\'s folder');
await g(`renderIntake()`);
ok(!$('rpBringIn').hidden && /Bring in from Claude \(1\)/.test($('rpBringIn').textContent), 'Reports shows Bring in from Claude (1)');
let asked2 = ''; w.confirm = m => { asked2 = m; return false; };
await g(`inBringIn()`);
let c1 = await g(`callsAll().then(l => l.find(x => x.id === 'c1'))`);
ok(/Example Foods - Smithfield/.test(asked2) && !c1.report, 'it asks first, naming the call; No leaves it alone');
w.confirm = m => { asked2 = m; return true; };
await g(`inBringIn()`); await tick(50);
c1 = await g(`callsAll().then(l => l.find(x => x.id === 'c1'))`);
ok(c1.report && c1.report.docs && /Site walk notes/.test(c1.report.docs.internal) && /rods walking out/.test(c1.summary || ''), 'Yes brings it in: the documents kept on the call, the summary');
ok(/Brought in 1 call report/.test(g('window.__t')), 'a toast says so');
ready = await g(`inReady(true).then(l => l.length)`);
pend = await g(`inPending().then(l => l.length)`);
ok(ready === 0 && pend === 0, 'brought in once: not offered again, and not sent to the intake again');
await g(`renderIntake()`);
ok($('rpBringIn').hidden, 'the button goes');
// a newer report is offered again
await put(visit, Object.assign({}, report, {made: now + 5000, internal_notes: '- Budget about $40k.\n- Shutdown in March.'}));
ready = await g(`inReady(true).then(l => l.length)`);
ok(ready === 1, 'a newer report from Claude is offered');
// one made for another call is left for Import call report
await put(visit, Object.assign({}, report, {made: now + 9000, callId: 'elsewhere'}));
ready = await g(`inReady(true).then(l => l.length)`);
ok(ready === 0, 'a report made for another call is not brought in here');

// ---- marked done on the PC: in the intake on its own
await g(`(async () => { call = (await callsAll()).find(x => x.id === 'open'); await markCallDone(call, true); })()`);
await tick(3000);
ok(names(intake).length === 2 && names(intake).some(n => /\(open\)\.json$/.test(n)), 'marking a call done sends it: ' + names(intake).join('|'));

// ---- on a phone: none of it
phone = true;
await g(`renderIntake()`);
ok($('rpIntake').hidden && $('rpBringIn').hidden, 'a phone has neither button');
r = await g(`inSendAll(true)`);
ok(r === null, 'and sends nothing');
phone = false;

ok(!errs.length, 'no errors: ' + errs.slice(0, 3).join(' | '));
console.log(`intake: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
