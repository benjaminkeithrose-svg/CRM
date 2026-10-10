// v96: photo archive. Done calls older than 12 months keep 800px copies in
// the app and the cloud; the full-size photos go to the PC folder first and
// are read back and checked. The folder (File System Access API) is faked in
// memory and shrink() is stubbed - jsdom cannot decode or draw images - so
// this proves the order of things and what is kept, not the image quality.
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
w.Blob = Blob;
Object.defineProperty(w, 'crypto', { value: globalThis.crypto, configurable: true });   // photo ids are SHA-256   // fake-indexeddb only round-trips Node's own Blob; Chrome's IndexedDB keeps its Blobs
w.scrollTo = () => {};
let alerts = [], confirms = [], answer = true;
w.alert = m => alerts.push(m); w.confirm = m => { confirms.push(m); return answer; };
w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
w.navigator.storage = { persist: async () => true, persisted: async () => true };
w.URL.createObjectURL = () => 'blob:stub'; w.URL.revokeObjectURL = () => {};
if (!w.HTMLDialogElement.prototype.showModal) w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
if (!w.HTMLDialogElement.prototype.close) w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new w.Event('close')); };
w.HTMLCanvasElement.prototype.getContext = () => null;
w.console.error = (...a) => errs.push(a.join(' ')); w.console.warn = () => {};

// ---- an in-memory folder that behaves like FileSystemDirectoryHandle
const err = (name) => Object.assign(new Error(name), { name });
let truncate = null;     // a file name whose writes come out short, to fail the check
class FakeFile { constructor(name) { this.kind = 'file'; this.name = name; this.data = null; }
  async createWritable() { let buf = null; const f = this;
    return { async write(x) { buf = x; }, async close() { f.data = (truncate && f.name.includes(truncate)) ? buf.slice(0, 10) : buf; } }; }
  async getFile() { return this.data; } }
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

// photos: "full size" is 3000 bytes, the "800px copy" 500, each with its own bytes so the ids differ
const big = (n) => { const a = new Uint8Array(3000).fill(n); a[0] = 0xFF; a[1] = 0xD8; return new Blob([a], { type: 'image/jpeg' }); };
w.__big = big;
// jsdom's FileReader will not read Node's Blob; the notes builder embeds photos through this
w.blobToDataURL = async b => 'data:' + b.type + ';base64,' + Buffer.from(await b.arrayBuffer()).toString('base64');
let shrinks = 0;
w.shrink = async (b, max, q) => { shrinks++; const src = new Uint8Array(await b.arrayBuffer());
  const a = new Uint8Array(500).fill(src[2]); a[0] = 0xFF; a[1] = 0xD9; w.__lastMax = max; return new Blob([a], { type: 'image/jpeg' }); };

const old = new Date(); old.setMonth(old.getMonth() - 14);
const recent = new Date(); recent.setMonth(recent.getMonth() - 2);
const dd = x => String(x.getDate()).padStart(2, '0') + '/' + String(x.getMonth() + 1).padStart(2, '0') + '/' + x.getFullYear();
w.__old = dd(old); w.__recent = dd(recent);
await g(`(async () => {
  const base = {type: 'Site call', mgr: 'Ben', contacts: [], loose: [], closed: true, status: 'done'};
  await callsPut(Object.assign({}, base, {id: 'c1', customer: 'Acme Pty Ltd - Smithfield', site: '', date: window.__old, updated: 1000,
    entries: [{type: 'belt', asset: 'Line 3', photos: [window.__big(1), window.__big(2)]}], loose: [window.__big(3)]}));
  await callsPut(Object.assign({}, base, {id: 'c2', customer: 'Widget Co', site: 'Dock 2', date: window.__recent, updated: 2000,
    entries: [{type: 'belt', asset: 'Spiral', photos: [window.__big(4)]}]}));
  await callsPut(Object.assign({}, base, {id: 'c3', customer: 'Widget Co', site: 'Dock 1', date: window.__old, updated: 3000,
    closed: false, status: 'in progress', entries: [{type: 'belt', asset: 'Open', photos: [window.__big(5)]}]}));
  await callsPut(Object.assign({}, base, {id: 'q1700000000000', rectype: 'quote', customer: 'Acme Pty Ltd - Smithfield', site: '', date: window.__old,
    updated: 4000, status: 'compiled', entries: [{type: 'belt', asset: 'Quote', photos: [window.__big(6)]}]}));
  await callsPut(Object.assign({}, base, {id: 'c5', customer: 'Bad Disk Co', site: 'Yard', date: window.__old, updated: 5000,
    entries: [{type: 'belt', asset: 'Truncated', photos: [window.__big(7)]}]}));
})()`);
const rec = id => g(`(async () => (await recordsAll()).find(x => x.id === '${id}'))()`);
const sizes = async id => { const c = await rec(id); return [].concat(...c.entries.map(e => e.photos || []), c.loose || []).map(p => p.size); };

const root = new FakeDir('Calls');
w.showDirectoryPicker = async () => root;
await g(`go('reports')`); await tick(150);
$('rpFolder').click(); await tick(500);       // first save: picks the folder, saves everything done
const c1dir = 'Acme Pty Ltd/Smithfield/' + old.toISOString().slice(0, 10);
const day1 = old.getFullYear() + '-' + String(old.getMonth() + 1).padStart(2, '0') + '-' + String(old.getDate()).padStart(2, '0');
const c1path = 'Acme Pty Ltd/Smithfield/' + day1;
ok(names(at(root, c1path)).length === 4, 'the old call is in the PC folder with its three photos: ' + names(at(root, c1path)).join(' | '));
void c1dir;

// ---- the menu offers it
$('rpFolder').click(); await tick(100);
ok(/Archive photos older than 12 months/.test($('vmBody').textContent), 'Archive is in the Save to PC folder menu');
g(`closeVisitMenu()`);

// ---- cancel at the confirmation: nothing changes
answer = false;
await g(`archAll()`); await tick(200);
ok(confirms.length === 1, 'asks first');
ok(/Archive 5 photos on 3 calls older than 12 months/.test(confirms[0]) && /saved to Calls and checked first/.test(confirms[0]) && /800px/.test(confirms[0]) && /cannot be undone/.test(confirms[0]),
  'the confirmation names what and how many: ' + confirms[0].split('\n')[0]);
ok((await sizes('c1')).every(s => s === 3000) && shrinks === 0, 'Cancel changes nothing');

// ---- archive: c5's photo will not write whole, so it is skipped
answer = true; truncate = 'Truncated';
// the copy already on the PC is short (a sync client, a full disk), and saving again comes out short too
{ const f = at(root, 'Bad Disk Co/Yard/' + day1).kids.get('Belt 1 Truncated - 1.jpg'); f.data = f.data.slice(0, 10); }
await g(`archAll()`); await tick(400);
ok(w.__lastMax === 800, 'shrinks to 800px');
ok(JSON.stringify(await sizes('c1')) === '[500,500,500]', 'old done call: photos replaced with the small copies');
ok(JSON.stringify(await sizes('q1700000000000')) === '[500]', 'old done quote request: archived too');
ok(JSON.stringify(await sizes('c2')) === '[3000]', 'a call from two months ago is left alone');
ok(JSON.stringify(await sizes('c3')) === '[3000]', 'an open call is left alone');
ok(JSON.stringify(await sizes('c5')) === '[3000]', 'a call whose PC copy could not be checked keeps its photos');
ok(alerts.length === 1 && /Archived 4 photos on 2 calls/.test(alerts[0]) && /Bad Disk Co/.test(alerts[0]) && /could not be checked/.test(alerts[0]),
  'and says which call and why: ' + (alerts[0] || '').replace(/\n/g, ' / '));
const pc1 = at(root, c1path);
ok(names(pc1).filter(n => /\.jpg$/.test(n)).every(n => pc1.kids.get(n).data.size === 3000), 'the PC folder keeps the full-size photos');
const c1 = await rec('c1');
ok(c1.photosArchived && c1.photosArchived.n === 3 && c1.photosArchived.ids.length === 3 && c1.photosArchived.folder === 'Calls' &&
  c1.photosArchived.path === c1path.replace(/\//g, '\\'), 'the call records when and where: ' + JSON.stringify(c1.photosArchived && {n: c1.photosArchived.n, folder: c1.photosArchived.folder, path: c1.photosArchived.path}));
ok(c1.updated > 1000, 'a real edit: updated moves on, so the small copies win over older copies');
ok(g(`!!(cloudDirty && cloudDirty['calls/c1'])`), 'cloud sync is told (the small copies go up, the full-size ones come out of the bucket)');
truncate = null;

// ---- the saved record is current, so the next Save does not touch the originals
const pend = await g(`(async () => (await pcPending()).map(c => c.id).join(','))()`);
ok(!/c1|q17/.test(pend), 'archived calls are not waiting to be saved again: ' + pend);

// ---- running it again: only the one that failed
answer = true; confirms = []; alerts = [];
await g(`archAll()`); await tick(400);
ok(confirms.length === 1 && /Archive 1 photo on 1 call/.test(confirms[0]), 'second run: only the call that failed: ' + (confirms[0] || '').split('\n')[0]);
ok(JSON.stringify(await sizes('c5')) === '[500]', 'and now it is done');
confirms = []; await g(`archAll()`); await tick(200);
ok(!confirms.length && /No photos older than 12 months/.test($('toast').textContent), 'nothing left: says so without asking');

// ---- a photo added to an archived call later
await g(`(async () => { const c = (await recordsAll()).find(x => x.id === 'c1');
  c.entries[0].photos.push(window.__big(9)); c.updated = Date.now() + 5; await callsPut(c); })()`);
await g(`pcSaveAll(false)`); await tick(300);
const after = names(at(root, c1path));
ok(names(pc1).filter(n => /\.jpg$/.test(n)).length === 4, 'the save writes the new photo beside the originals: ' + after.join(' | '));
ok(['Belt 1 Line 3 - 1.jpg', 'Belt 1 Line 3 - 2.jpg', 'Additional - 1.jpg'].every(n => pc1.kids.get(n) && pc1.kids.get(n).data.size === 3000),
  'and leaves the full-size originals as they were');
const newName = after.find(n => /Belt 1 Line 3 - 3/.test(n));
ok(newName && pc1.kids.get(newName).data.size === 3000, 'the new photo is saved full size: ' + newName);
confirms = [];
await g(`archAll()`); await tick(300);
ok(/Archive 1 photo on 1 call/.test(confirms[0] || ''), 'the next archive picks up just the new photo');
ok(JSON.stringify(await sizes('c1')) === '[500,500,500,500]' && (await rec('c1')).photosArchived.n === 4, 'all four small now, four counted');
ok(['Belt 1 Line 3 - 1.jpg', 'Belt 1 Line 3 - 2.jpg', 'Additional - 1.jpg', newName].every(n => pc1.kids.get(n).data.size === 3000), 'all four full size on the PC');

// ---- shown on the call and in Reports
await g(`(async () => { call = (await recordsAll()).find(x => x.id === 'c1'); renderCompileStat(); })()`);
ok(/Full-size photos archived on the PC/.test($('compStat').textContent) && /Calls\\Acme Pty Ltd\\Smithfield\\/.test($('compStat').textContent),
  'the call says where the full-size photos are: ' + $('compStat').textContent.slice(-90));
await g(`(async () => { call = null; rpView = 'all'; await renderReports(); })()`);
ok(/photos archived/.test($('rpRes').textContent), 'Reports marks it');

// ---- the open call is never archived under you
await g(`(async () => { const c = (await recordsAll()).find(x => x.id === 'c2'); c.date = window.__old; c.updated = 9000; await callsPut(c);
  call = (await recordsAll()).find(x => x.id === 'c2'); })()`);
confirms = [];
await g(`archAll()`); await tick(300);
ok(!confirms.length && JSON.stringify(await sizes('c2')) === '[3000]', 'the call open on this device is skipped');
await g(`(() => { call = null; })()`);

// ---- Help
ok(/Archive photos older than 12 months/.test($('s-help').textContent), 'Help covers it');

const real = errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js|archive c5/i.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
