// v186: the call report with Claude. Save for Claude writes the call, its
// belts and photos into the visit's folder (the PC folder, faked here in
// memory; the real picker and disk are not tested), or a download on a phone.
// Import call report lays Claude's report back into the same call without
// changing anything typed, and importing twice adds nothing twice.
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
const jpeg = s => 'data:image/jpeg;base64,' + Buffer.from('JPEG-' + s).toString('base64');

await g(`(async () => {
  const list = [{a: '${A}', sub: 'Smithfield', z: 'Z1', foc: 'High', cad: CAD['High'], mgr: 'Alex Example', rep: '',
    c: [{n: 'Jo Bloggs', r: 'Maintenance', t: '', p: '0400 000 001', pk: 'ok', e: ['jo.bloggs@example.com']}]}];
  await accReplaceAll(list); indexAccounts(list);
  call = {id: 'c1', customer: '${A}', date: '29/10/2026', type: 'Site call', mgr: 'Alex Example', site: '',
    contacts: [{name: 'Jo Bloggs', role: 'Maintenance', email: 'jo.bloggs@example.com', mobile: '0400 000 001', crm: true, doc: true}],
    entries: [{type: 'belt', asset: 'CV-200', beltdesc: 'Spiral exit', series: '800', style: 'Flat Top', width: '', comment: 'Typed in Field CRM', photos: [dataURLToBlob('${jpeg('one')}')]},
              {type: 'note', topic: 'Other', text: 'Typed note', photos: []}],
    loose: [dataURLToBlob('${jpeg('loose')}')], status: 'in progress', updated: Date.now()};
  await saveCall(); go('dash');
})()`); await tick(100);

// ---- the ⋯ on the call has both
$('barMore').click(); await tick(50);
const menu = () => $('vmBody').textContent;
ok(/Save for Claude/.test(menu()) && /Import call report/.test(menu()), 'the call\'s ⋯ has Save for Claude and Import call report');
ok(!/Open Claude's notes/.test(menu()), 'no Claude documents to open before an import');
g(`closeVisitMenu()`);

// ---- Save for Claude, on the PC: into the visit's folder
const root = new FakeDir('Calls');
w.showDirectoryPicker = async () => root;
await g(`clSave(call)`); await tick(100);
const visit = at(root, 'Example Foods/Smithfield/2026-10-29');
ok(visit && names(visit).join('|') === 'Field CRM call.json|from Field CRM', 'saved into Customer\\Site\\date: ' + names(visit).join('|'));
ok(names(at(visit, 'from Field CRM')).join('|') === 'Additional - 1.jpg|Belt 1 CV-200 - 1.jpg', 'the photos beside it, named by what they show');
const saved = JSON.parse(await at(visit, 'Field CRM call.json').data.text());
ok(saved.kind === 'field-crm-call-for-claude' && saved.v === 1 && saved.call.id === 'c1' && saved.call.iso === '2026-10-29', 'the file says what it is, for which call');
const belt = saved.call.entries[0];
ok(belt.ref === 0 && belt.asset === 'CV-200' && belt.series === '800' && belt.photos[0].file === 'from Field CRM/Belt 1 CV-200 - 1.jpg', 'each entry carries its place in the call and its photos by name');
ok(saved.account && saved.account.mgr === 'Alex Example' && saved.account.contacts[0].name === 'Jo Bloggs' && saved.account.contacts[0].in_crm === true, 'the account\'s CRM contacts go with it');
ok(saved.call.contacts[0].in_crm === true && /Saved for Claude/.test(g('window.__t')), 'the call\'s contacts and a toast naming the folder');

// ---- on a phone: one file to download, photos inside it
phone = true;
w.eval(`downloadFile = (n, t) => { window.__dl = {n, t}; }`);
await g(`clSave(call)`); await tick(50);
const dl = g('window.__dl');
const inl = JSON.parse(dl.t);
ok(/Example Foods - Smithfield - 2026-10-29 - Field CRM call\.json/.test(dl.n) && inl.photosInline && /^data:image\/jpeg/.test(inl.call.entries[0].photos[0].data), 'on a phone it downloads, photos inside: ' + dl.n);
phone = false;

// ---- Claude's report, left in the visit's folder
const report = {
  kind: 'field-crm-claude-report', v: 1, made: Date.now(), callId: 'c1', customer: A, date: '2026-10-29',
  summary: '- CV-200: rods walking out on the left side.\n- Follow-ups: quote by Friday.',
  internal_notes: '- Budget about $400k.',
  contacts: [{name: 'jo bloggs'}, {name: 'Pat Example', role: 'Engineering Manager', in_crm: false}],
  belts: [{ref: 0, asset: 'CV-200', series: 'S900', width: '457', sprbore: '40 mm square', photos: ['p2', 'p1']},
          {asset: 'CV-300', series: '1100', style: 'Flush Grid', photos: ['p3']}],
  other_photos: ['p4', 'pL'],
  photos: {p1: {data: jpeg('one')}, p2: {data: jpeg('two')}, p3: {data: jpeg('three')}, p4: {data: jpeg('four')}, pL: {data: jpeg('loose')}},
  follow_ups: [{what: 'Quote the CV-200 belt', who: 'Alex Example', date: '2026-10-30', task: true},
               {what: 'Replace wear strips at shutdown', who: 'Example Foods maintenance', task: false}],
  documents: {internal: '<html><body>Site walk notes</body></html>', customer: '<html><body>Site walk report</body></html>'},
  review: ['IMG_4105 left out']
};
const put = async x => { const f = await visit.getFileHandle('fieldcrm-import.json', {create: true}); const wr = await f.createWritable(); await wr.write(JSON.stringify(x)); await wr.close(); };
await put(report);
asked = '';
await g(`clImport(call)`); await tick(150);
ok(/Import Claude's report into this call/.test(asked), 'it asks first');
ok(/the summary from Claude's notes/.test(asked) && /the internal notes/.test(asked) && /1 new belt/.test(asked) && /2 empty belt fields filled in/.test(asked), 'and says what it adds: ' + asked.replace(/\n/g, ' '));
ok(/3 photos/.test(asked) && /1 contact/.test(asked) && /1 next step/.test(asked) && /the two documents/.test(asked), 'photos already on the call are not counted again');
const c = g('call');
ok(c.summary === report.summary, 'Claude\'s notes are the summary');
ok(c.entries[0].series === '800' && c.entries[0].width === '457' && c.entries[0].sprbore === '40 mm square' && c.entries[0].comment === 'Typed in Field CRM', 'typed belt fields kept; only empty ones filled');
ok(c.entries[0].photos.length === 2, 'the belt gets its new photo, not a second copy of its own');
const nb = c.entries.find(e => e.type === 'belt' && e.src === 'claude');
ok(nb && nb.asset === 'CV-300' && nb.series === '1100' && nb.style === 'Flush Grid' && nb.photos.length === 1, 'a belt Claude added is a real belt entry, marked as Claude\'s');
const note = c.entries.find(e => e.type === 'note' && e.src === 'claude');
ok(note && note.topic === 'Internal notes' && note.text === report.internal_notes && c.entries.some(e => e.text === 'Typed note'), 'internal notes as a note; the typed note stays');
ok(c.loose.length === 2, 'other photos join the loose photos, without the duplicate');
ok(c.contacts.length === 2 && c.contacts[1].name === 'Pat Example' && c.contacts[1].crm === false, 'a new contact, flagged as not in the CRM; Jo is not added twice');
const steps = g(`TASKS.filter(t => t.callId === 'c1')`);
ok(steps.length === 1 && steps[0].title === 'Quote the CV-200 belt' && steps[0].date === '2026-10-30' && steps[0].acct === A && steps[0].type === g('STEP_TYPE'), 'only the follow-up marked as a task goes on the planner');
ok(c.report && c.report.docs.internal.includes('Site walk notes') && c.report.review[0] === 'IMG_4105 left out' && c.status === 'compiled', 'the documents kept with the call; the call is compiled');
const stored = (await g(`callsAll()`)).find(x => x.id === 'c1');
ok(stored && stored.summary === report.summary && stored.report && stored.entries.length === 4, 'and it is saved, so it syncs like any change');
ok(/Imported:/.test(g('window.__t')), 'a toast says what came in');

// ---- the documents can be opened from the call
let opened = '';
w.open = u => { opened = u; return {}; };
$('barMore').click(); await tick(50);
ok(/Open Claude's notes/.test(menu()) && /Open Claude's customer copy/.test(menu()), 'after an import, the ⋯ opens Claude\'s two documents');
g(`clOpenDoc(call, 'customer')`);
ok(opened === 'blob:stub', 'opened in its own tab');
g(`closeVisitMenu()`);

// ---- importing again adds nothing twice
asked = '';
await g(`clImport(call)`); await tick(100);
ok(!asked && /Nothing new/.test(g('window.__t')), 'the same report again: nothing new, nothing asked');
await put(Object.assign({}, report, {internal_notes: '- Budget about $450k.', belts: [{asset: 'CV-300', beltmat: 'Acetal', series: 'S1200'}]}));
await g(`clImport(call)`); await tick(100);
const c2 = g('call');
ok(c2.entries.filter(e => e.src === 'claude' && e.type === 'belt').length === 1 && c2.entries.find(e => e.src === 'claude' && e.type === 'belt').beltmat === 'Acetal' &&
   c2.entries.find(e => e.src === 'claude' && e.type === 'belt').series === '1100', 'a revised report updates Claude\'s belt rather than adding another, and never rewrites a value');
ok(c2.entries.filter(e => e.src === 'claude' && e.type === 'note').length === 1 && c2.entries.find(e => e.src === 'claude' && e.type === 'note').text === '- Budget about $450k.', 'and replaces its own internal notes');
ok(g(`TASKS.filter(t => t.callId === 'c1').length`) === 1, 'the next step is not added twice');

// ---- the wrong file, and a report for another call
await put(saved);
await g(`clImport(call)`); await tick(50);
ok(/the file saved for Claude, not its report/.test(g('window.__t')), 'the file saved for Claude is recognised as the wrong one');
await put(Object.assign({}, report, {callId: 'c9', customer: 'Sample Dairy', summary: 'Other'}));
answer = false; asked = '';
await g(`clImport(call)`); await tick(50);
ok(/made for another call \(Sample Dairy/.test(asked) && g('call').summary === report.summary, 'a report for another call asks first, and No leaves the call alone');
answer = true;
await put(Object.assign({}, report, {v: 2}));
await g(`clImport(call)`); await tick(50);
ok(/newer version/.test(g('window.__t')), 'a report from a newer version is refused');

// ---- no folder to read: the file is picked instead
phone = true;
let picked = false;
$('clFile').click = () => { picked = true; };
await g(`clImport(call)`); await tick(50);
ok(picked, 'on a phone, Import call report opens the file picker');
phone = false;

// ---- the call notes now lead with Claude's summary
const html = await g(`buildNotesHTML('full', 'full', call)`);
ok(html.includes('CV-200: rods walking out on the left side.'), 'Field CRM\'s own call notes carry Claude\'s summary');

// ---- a quote request has neither
await g(`(async () => { call = {id: 'q1', rectype: QUOTE, type: QUOTE_TYPE, customer: '${A}', date: '29/10/2026', contacts: [], entries: [], loose: [], status: 'in progress', updated: Date.now()}; await saveCall(); go('dash'); })()`); await tick(80);
$('barMore').click(); await tick(50);
ok(!/Save for Claude/.test(menu()), 'not on a quote request');

// ---- the two ends agree: the end-game skill's own make_import.py, on its
// worked example, read by this app's Import call report. Needs python3 with
// Pillow; skipped (and said so) where it is not installed.
{
  const { spawnSync } = await import('child_process');
  const os = await import('os'), path = await import('path');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eg-'));
  const run = spawnSync('python3', ['end-game-skill/end-game/scripts/make_import.py', 'end-game-skill/end-game/examples/example-report.json', '--out', tmp], { encoding: 'utf8' });
  const file = path.join(tmp, 'fieldcrm-import.json');
  if (run.status !== 0 || !fs.existsSync(file)) console.log('  (skipped: the end-game skill\'s make_import.py did not run here: ' + String(run.stderr || run.error || '').split('\n').slice(-2).join(' ') + ')');
  else {
    const imp = JSON.parse(fs.readFileSync(file, 'utf8'));
    ok(imp.kind === 'field-crm-claude-report' && imp.v === 1 && imp.callId === 'c1793299000000', 'the skill writes the kind and version this app reads');
    ok(!/data:image\/jpeg/.test(imp.documents.internal) && /Site walk notes/.test(imp.documents.internal), 'the documents kept with the call carry no photos of their own');
    await g(`(async () => {
      call = {id: 'c1793299000000', customer: '${A}', date: '29/10/2026', type: 'Site call', mgr: 'Alex Example', site: '',
        contacts: [{name: 'Jo Bloggs', role: 'Maintenance', crm: true, doc: true}],
        entries: [{type: 'belt', asset: 'CV-200', beltdesc: 'Spiral exit', series: '800', style: 'Flat Top', beltmat: 'Acetal', colour: 'White', width: '', photos: []}],
        loose: [], status: 'in progress', updated: Date.now()};
      await saveCall(); go('dash');
    })()`); await tick(80);
    const eg = at(root, 'Example Foods/Smithfield/2026-10-29');
    const f = await eg.getFileHandle('fieldcrm-import.json', {create: true}); const wr = await f.createWritable(); await wr.write(JSON.stringify(imp)); await wr.close();
    asked = '';
    await g(`clImport(call)`); await tick(300);
    const c3 = g('call');
    ok(/Import Claude's report/.test(asked), 'the example imports');
    ok(c3.entries[0].width === '457' && c3.entries[0].series === '800' && c3.entries[0].sprocket === '11 tooth' && c3.entries[0].sprbore === '40 mm square', 'the belt logged in Field CRM is filled in from the walk, nothing typed changed');
    ok(c3.entries.filter(e => e.type === 'belt').length === 1 && c3.entries[0].photos.length === 3, 'no second belt; its photos come in');
    ok(c3.loose.length === 2 && c3.contacts.some(x => x.name === 'Pat Example' && x.crm === false), 'the other photos and the new contact');
    ok(g(`TASKS.filter(t => t.callId === 'c1793299000000').map(t => t.title).join('|')`) === 'Quote the CV-200 belt and sprockets|Send the spiral and transfer case studies to Pat Example', 'the two follow-ups that are yours become next steps');
    ok(/Second packing line|second packing line/.test(c3.summary) && c3.entries.some(e => e.src === 'claude' && /400k/.test(e.text)) && c3.report.review.length === 3, 'notes, internal notes and the review list');
  }
}

ok(!errs.length, 'no errors: ' + errs.slice(0, 3).join(' | '));
console.log(`claude round trip: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
