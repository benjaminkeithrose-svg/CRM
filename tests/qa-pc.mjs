// v94: weekends on the PC's Week and Day, search icons in Directory, and
// done calls saved into a folder on the PC (File System Access API, faked
// here in memory - the real picker and real disk are not tested).
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
w.scrollTo = () => {}; w.alert = () => {}; w.confirm = () => true;
w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
w.navigator.storage = { persist: async () => true, persisted: async () => true };
w.URL.createObjectURL = () => 'blob:stub'; w.URL.revokeObjectURL = () => {};
if (!w.HTMLDialogElement.prototype.showModal) w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
if (!w.HTMLDialogElement.prototype.close) w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new w.Event('close')); };
w.HTMLCanvasElement.prototype.getContext = () => null;
w.console.error = (...a) => errs.push(a.join(' ')); w.console.warn = () => {};

// ---- an in-memory folder that behaves like FileSystemDirectoryHandle
const err = (name) => Object.assign(new Error(name), { name });
class FakeFile { constructor(name) { this.kind = 'file'; this.name = name; this.data = null; }
  async createWritable() { let buf = null; const f = this;
    return { async write(x) { buf = x; }, async close() { f.data = buf; } }; } }
class FakeDir {
  constructor(name) { this.kind = 'directory'; this.name = name; this.kids = new Map(); }
  async getDirectoryHandle(n, o = {}) { let k = this.kids.get(n);
    if (!k) { if (!o.create) throw err('NotFoundError'); k = new FakeDir(n); this.kids.set(n, k); }
    if (k.kind !== 'directory') throw err('TypeMismatchError'); return k; }
  async getFileHandle(n, o = {}) { let k = this.kids.get(n);
    if (!k) { if (!o.create) throw err('NotFoundError'); k = new FakeFile(n); this.kids.set(n, k); }
    if (k.kind !== 'file') throw err('TypeMismatchError'); return k; }
  async removeEntry(n, o = {}) { const k = this.kids.get(n); if (!k) throw err('NotFoundError');
    if (k.kind === 'directory' && k.kids.size && !o.recursive) throw err('InvalidModificationError');
    this.kids.delete(n); }
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
const shown = el => { for (let e = el; e && e !== d.body; e = e.parentElement) { if (e.hidden) return false; if (w.getComputedStyle(e).display === 'none') return false; } return true; };

await g(`(async () => {
  const list = [
    {a: 'Acme Pty Ltd - Smithfield', sub: 'Smithfield', z: 'Z1', foc: 'High', cad: CAD['High'], mgr: 'Ben', rep: '',
      c: [{n: 'Jo Bloggs', r: 'Engineer', t: '', p: '0400 111 222', pk: 'ok', e: ['jo@acme.example']}]},
    {a: 'Widget Co', sub: 'Penrith', z: 'Z1', foc: 'Low', cad: CAD['Low'], mgr: 'Ben', rep: '',
      c: [{n: 'Sam Example', r: 'Maintenance', t: '', p: '', pk: '', e: []}]}];
  await accReplaceAll(list); indexAccounts(list);
  const meta = {imported: Date.now(), source: 'x', rows: 2, counts: {accounts: 2, contacts: 2}, managers: ['Ben'], reps: []};
  await kvSet('meta', meta); META = meta; fillManagers();
  document.getElementById('cMgr').value = 'Ben';
})()`);

// ================= weekends on the PC's Week and Day
await g(`(() => { plan.view = 'week'; plan.anchor = new Date(2026, 9, 7); renderCalendar(); })()`);
let cols = [...d.querySelectorAll('#calBody .week .day')];
ok(cols.length === 7, 'Week has seven days: ' + cols.length);
ok(cols.map(c => c.querySelector('.dh b').textContent).join(',') === 'Mon,Tue,Wed,Thu,Fri,Sat,Sun', 'Mon to Sun: ' + cols.map(c => c.querySelector('.dh b').textContent).join(','));
ok(cols[5].classList.contains('wknd') && cols[6].classList.contains('wknd') && !cols[4].classList.contains('wknd'), 'Saturday and Sunday shaded');
ok(/^5 Oct .* 11 Oct 2026$/.test($('calTitle').textContent), 'title runs Monday to Sunday: ' + $('calTitle').textContent);
ok(cols[5].dataset.k === '2026-10-10' && cols[6].dataset.k === '2026-10-11', 'weekend columns carry their dates');
await g(`(() => { plan.view = 'day'; plan.anchor = new Date(2026, 9, 10); renderCalendar(); })()`);
ok(/^Saturday 10 Oct 2026$/.test($('calTitle').textContent), 'Day on a Saturday is titled: ' + $('calTitle').textContent);
cols = [...d.querySelectorAll('#calBody .week .day')];
ok(cols.length === 1 && /Saturday/.test(cols[0].textContent) && !cols[0].classList.contains('wknd'), 'one Saturday column, not shaded in Day');
await g(`(() => { plan.anchor = new Date(2026, 9, 11); renderCalendar(); })()`);
ok(/^Sunday 11 Oct 2026$/.test($('calTitle').textContent), 'and on a Sunday: ' + $('calTitle').textContent);

// a visit booked on a Saturday stays there
await g(`(() => { plan.view = 'week'; plan.anchor = new Date(2026, 9, 7); renderCalendar(); openDialog(null, {acct: 'Widget Co', date: '2026-10-10', start: '10:00'}); })()`);
$('dDate').value = '2026-10-10';
$('dSave').click(); await tick(150);
const sat = g(`APPTS.filter(a => a.acct === 'Widget Co').map(a => a.date).join(',')`);
ok(sat === '2026-10-10', 'Saturday visit stays on Saturday: ' + sat);
ok(!!d.querySelector('#calBody .day[data-k="2026-10-10"] .appt'), 'and shows in the Saturday column');

// ================= search icons in Directory
ok(!$('abQ') && !$('peQ'), 'no permanent search boxes in Directory');
await g(`showDir('acc')`); await tick();
ok(shown($('abSearch')) && /search/i.test($('abSearch').getAttribute('aria-label')) && $('abSearch').querySelector('svg'), 'Accounts has a search icon with a name');
ok(d.querySelectorAll('#abRes [data-acct]').length === 2, 'the Mine list still shows without searching');
$('abSearch').click(); await tick();
ok($('srchdlg').hasAttribute('open') && $('fsQ').placeholder === 'Account or suburb', 'icon opens the full-screen search');
$('fsQ').value = 'penrith'; $('fsQ').dispatchEvent(new w.Event('input')); await tick(80);
let hits = [...d.querySelectorAll('#fsRes [data-acct]')];
ok(hits.length === 1 && hits[0].dataset.acct === 'Widget Co', 'finds by suburb: ' + hits.map(h => h.dataset.acct));
ok(/1 account/.test($('fsHint').textContent), 'hint counts: ' + $('fsHint').textContent);
hits[0].click(); await tick();
ok(!$('srchdlg').hasAttribute('open') && g('screen') === 'acct' && /Widget Co/.test($('avHead').textContent), 'tapping one closes the search and opens the account');

await g(`showDir('ppl')`); await tick();
ok(shown($('peSearch')) && /search/i.test($('peSearch').getAttribute('aria-label')), 'Contacts has a search icon');
$('peSearch').click(); await tick();
$('fsQ').value = 'jo engineer'; $('fsQ').dispatchEvent(new w.Event('input')); await tick(80);
ok(/Jo Bloggs/.test($('fsRes').textContent) && /1 person/.test($('fsHint').textContent), 'finds a contact by name and role: ' + $('fsHint').textContent);
$('fsQ').value = ''; $('fsQ').dispatchEvent(new w.Event('input')); await tick(80);
ok(!$('fsRes').textContent.trim(), 'empty search shows nothing');
d.querySelector('#fsRes').innerHTML = '';
$('fsQ').value = 'jo'; $('fsQ').dispatchEvent(new w.Event('input')); await tick(80);
d.querySelector('#fsRes [data-peacct]').click(); await tick();
ok(!$('srchdlg').hasAttribute('open') && g('screen') === 'acct' && /Acme/.test($('avHead').textContent), 'Account on a contact opens it');

// ================= save to a PC folder
// no File System Access API: no button
await g(`go('reports')`); await tick(100);
ok($('rpFolder').hidden, 'no Save to PC folder button without the folder API');

const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
w.__JPG = JPG; w.__PNG = PNG;
await g(`(async () => {
  const base = {type: 'Site call', mgr: 'Ben', contacts: [{name: 'Jo Bloggs', role: 'Engineer', email: '', mobile: '', crm: true}], loose: []};
  await callsPut(Object.assign({}, base, {id: 'c1', customer: 'Acme Pty Ltd - Smithfield', site: '', date: '09/10/2026',
    closed: true, status: 'done', updated: 1000,
    entries: [{type: 'belt', asset: 'Line 3: infeed', photos: [window.__JPG, window.__JPG]},
              {type: 'note', topic: 'General', text: 'All good'}],
    loose: [window.__PNG]}));
  await callsPut(Object.assign({}, base, {id: 'c2', customer: 'Widget Co', site: 'Dock 2', date: '08/10/2026',
    closed: true, status: 'done', updated: 2000, entries: [{type: 'note', topic: 'General', text: 'Quiet'}]}));
  await callsPut(Object.assign({}, base, {id: 'c3', customer: 'Widget Co', site: '', date: '07/10/2026',
    closed: false, status: 'in progress', updated: 3000, entries: [{type: 'note', topic: 'General', text: 'Not finished'}]}));
  await callsPut(Object.assign({}, base, {id: 'q1791500000000', rectype: 'quote', customer: 'Acme Pty Ltd - Smithfield', site: '',
    date: '09/10/2026', closed: true, status: 'compiled', updated: 4000, entries: [{type: 'belt', asset: 'Spiral', photos: [window.__JPG]}]}));
})()`);

const root = new FakeDir('Field CRM calls');
let picks = 0;
w.showDirectoryPicker = async () => { picks++; return root; };
await g(`go('reports')`); await tick(150);
ok(!$('rpFolder').hidden && /Save to PC folder \(3\)/.test($('rpFolder').textContent), 'PC: button shows with 3 waiting: ' + $('rpFolder').textContent);

// on the phone it stays hidden even with the API
w.matchMedia = () => ({ matches: true, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
await g(`renderPcFolder()`); await tick();
ok($('rpFolder').hidden, 'phone: no button');
w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
await g(`renderPcFolder()`); await tick();

// first time: straight to the picker, then saves
$('rpFolder').click(); await tick(400);
ok(picks === 1, 'first tap opens the folder picker');
ok(names(root).join('|') === 'Acme Pty Ltd|Widget Co', 'customer folders: ' + names(root).join('|'));
ok(names(at(root, 'Acme Pty Ltd')).join('|') === 'Quote requests|Smithfield', 'site and Quote requests under the customer: ' + names(at(root, 'Acme Pty Ltd')).join('|'));
const day = at(root, 'Acme Pty Ltd/Smithfield/2026-10-09');
ok(!!day, 'date folder 2026-10-09');
const fl = names(day);
ok(fl.includes('Acme_Pty_Ltd_Smithfield_call_notes_09-10-2026.html'), 'notes file named as Create and share names it: ' + fl.join(' | '));
ok(fl.includes('Belt 1 Line 3 infeed - 1.jpg') && fl.includes('Belt 1 Line 3 infeed - 2.jpg'), 'belt photos as JPGs, colon stripped: ' + fl.join(' | '));
ok(fl.includes('Additional - 1.png'), 'a PNG keeps its type');
ok(fl.length === 4, 'notes plus three photos: ' + fl.length);
const html = await at(day, 'Acme_Pty_Ltd_Smithfield_call_notes_09-10-2026.html').data.text();
ok(/Call notes/.test(html) && /Acme Pty Ltd - Smithfield/.test(html) && /All good/.test(html), 'the notes file is the call notes document');
ok(!!at(root, 'Widget Co/Dock 2/2026-10-08'), 'no " - " in the account: the call\'s Site field is used');
ok(!at(root, 'Widget Co/2026-10-07'), 'an open call is not saved');
const qd = at(root, 'Acme Pty Ltd/Quote requests/2026-10-09');
ok(qd && names(qd).some(n => /belt_RFQ/.test(n)) && names(qd).includes('Belt 1 Spiral - 1.jpg'), 'quote request and its photo: ' + names(qd).join(' | '));
ok(/Save to PC folder$/.test($('rpFolder').textContent.trim()), 'button count clears: ' + $('rpFolder').textContent);
ok(/Saved 2 calls and 1 quote request, 4 photos to Field CRM calls/.test($('toast') ? $('toast').textContent : g(`document.querySelector('.toast') ? document.querySelector('.toast').textContent : ''`)),
  'reports what was saved');

// second time: a menu naming the folder; nothing new to save
$('rpFolder').click(); await tick(100);
ok($('vmdlg').hasAttribute('open') && /Field CRM calls/.test($('vmWhen').textContent), 'menu names the folder: ' + $('vmWhen').textContent);
const acts = [...$('vmBody').querySelectorAll('[data-cm]')].map(b => b.textContent);
ok(acts.length === 3 && /^Save new and changed$/.test(acts[0].trim()) && /Archive photos older than 12 months/.test(acts[1]) && /Choose a different folder/.test(acts[2]), 'Save, Archive and Choose a different folder: ' + acts.join(' / '));
$('vmBody').querySelector('[data-cm="0"]').click(); await tick(200);
ok(picks === 1, 'no picker the second time');

// a changed call replaces its copy; an unrelated file in the folder is left alone
await at(day, 'my own notes.txt') || (await day.getFileHandle('my own notes.txt', {create: true}));
await g(`(async () => { const c = (await recordsAll()).find(x => x.id === 'c1');
  c.updated = 5000; c.entries[0].photos = [window.__JPG]; await callsPut(c); })()`);
await g(`pcSaveAll(false)`); await tick(200);
const fl2 = names(at(root, 'Acme Pty Ltd/Smithfield/2026-10-09'));
ok(fl2.includes('Belt 1 Line 3 infeed - 1.jpg') && !fl2.includes('Belt 1 Line 3 infeed - 2.jpg'), 'changed call: dropped photo removed: ' + fl2.join(' | '));
ok(fl2.includes('my own notes.txt'), 'a file the app did not write is left alone');

// moving a call to another date: old folder emptied and removed, unless something else is in it
await g(`(async () => { const c = (await recordsAll()).find(x => x.id === 'c2');
  c.updated = 6000; c.date = '10/10/2026'; await callsPut(c); })()`);
await g(`pcSaveAll(false)`); await tick(200);
ok(!at(root, 'Widget Co/Dock 2/2026-10-08') && !!at(root, 'Widget Co/Dock 2/2026-10-10'), 'moved call: old date folder removed, new one written');

// two calls at one site on one day get a folder each
await g(`(async () => { await callsPut({id: 'c4', customer: 'Acme Pty Ltd - Smithfield', site: '', date: '09/10/2026', type: 'Phone',
  mgr: 'Ben', contacts: [], loose: [], closed: true, status: 'done', updated: 7000, entries: [{type: 'note', topic: 'x', text: 'Second'}]}); })()`);
await g(`pcSaveAll(false)`); await tick(200);
ok(!!at(root, 'Acme Pty Ltd/Smithfield/2026-10-09 (2)'), 'second call that day: "2026-10-09 (2)": ' + names(at(root, 'Acme Pty Ltd/Smithfield')).join(' | '));
ok(names(at(root, 'Acme Pty Ltd/Smithfield/2026-10-09')).length === 4, 'first call\'s folder untouched: ' + names(at(root, 'Acme Pty Ltd/Smithfield/2026-10-09')).join(' | '));

// a different folder starts again: everything done goes in
const root2 = new FakeDir('Other');
w.showDirectoryPicker = async () => { picks++; return root2; };
$('rpFolder').click(); await tick(100);
$('vmBody').querySelector('[data-cm="2"]').click(); await tick(400);
ok(picks === 2 && names(root2).join('|') === 'Acme Pty Ltd|Widget Co', 'Choose a different folder saves everything there: ' + names(root2).join('|'));

// picker dismissed: nothing happens, nothing breaks
w.showDirectoryPicker = async () => { throw Object.assign(new Error('x'), {name: 'AbortError'}); };
await g(`pcSaveAll(true)`); await tick(100);
ok(g('pcHandle') === root2, 'cancelling the picker keeps the folder');

// names Windows will accept
ok(g(`pcName('A<b>:c?/d|e*"f". ', 'x')`) === 'A b c d e f', 'illegal characters and trailing dot: ' + g(`pcName('A<b>:c?/d|e*"f". ', 'x')`));
ok(g(`pcName('CON', 'x')`) === 'CON_' && g(`pcName('  ', 'fallback')`) === 'fallback', 'device names and blanks');
ok(g(`pcPath({customer: 'Solo', site: '', date: '01/02/2026', entries: []}).join('/')`) === 'Solo/2026-02-01', 'no site at all: date straight under the customer');

const real = errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/i.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
