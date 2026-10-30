// v188: a photo keeps when and where it was taken. Shrinking used to drop
// both; now they are read from the original (or noted at the in-app camera's
// tap) and written back into the small copy as EXIF. The canvas is not
// available here, so the shrink itself is stood in for; the EXIF reading and
// writing is the real code, checked against Pillow where python3 has it.
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
w.matchMedia = () => ({ matches: true, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
w.navigator.storage = { persist: async () => true, persisted: async () => true };
w.URL.createObjectURL = () => 'blob:stub'; w.URL.revokeObjectURL = () => {};
if (!w.HTMLDialogElement.prototype.showModal) w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
w.HTMLCanvasElement.prototype.getContext = () => null;
Object.defineProperty(w, 'crypto', { value: globalThis.crypto, configurable: true });
w.console.error = (...a) => errs.push(a.join(' ')); w.console.warn = () => {};
for (const f of ['zones.js', 'manuals.js', 'healthlib.js', 'app.js']) {
  const el = d.createElement('script'); el.textContent = fs.readFileSync(f, 'utf8'); d.body.appendChild(el);
}
d.dispatchEvent(new w.Event('DOMContentLoaded'));
await tick(500);
const g = e => w.eval('(' + e + ')');
w.eval(`toast = m => { window.__t = m; }`);

// a bare JPEG, as a canvas makes one: SOI, JFIF, a stand-in for the picture, EOI
const bare = [0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDA, 0x00, 0x02, 0x11, 0x22, 0xFF, 0xD9];
w.__bare = bare;

// ---- written, then read back
const back = await g(`(async () => {
  const b = exifWrite(new Uint8Array(window.__bare), {time: '2026:10:29 09:03:55', lat: -33.856, lon: 150.925});
  const bytes = await blobBytes(b);
  window.__stamped = Array.from(bytes);
  return Object.assign({jfif: bytes[2] === 0xFF && bytes[3] === 0xE0, app1: bytes[20] === 0xFF && bytes[21] === 0xE1}, exifRead(bytes));
})()`);
ok(back.time === '2026:10:29 09:03:55', 'the time reads back: ' + back.time);
ok(Math.abs(back.lat + 33.856) < 1e-5 && Math.abs(back.lon - 150.925) < 1e-5, 'and the place, south and east: ' + back.lat + ', ' + back.lon);
ok(back.jfif && back.app1, 'JFIF stays first, the EXIF follows it');
const tOnly = await g(`(async () => exifRead(await blobBytes(exifWrite(new Uint8Array(window.__bare), {time: '2026:01:02 03:04:05'}))))()`);
ok(tOnly.time === '2026:01:02 03:04:05' && tOnly.lat === undefined, 'time without a place');
ok(await g(`(async () => (await blobBytes(exifWrite(new Uint8Array(window.__bare), {}))).length)()`) === bare.length, 'nothing to write: the photo is left as it was');
ok(JSON.stringify(await g(`exifRead(new Uint8Array([1,2,3,4]))`)) === '{}' && JSON.stringify(await g(`exifRead(new Uint8Array(window.__bare))`)) === '{}', 'not a JPEG, or no EXIF: nothing, no error');

// ---- a real photo's EXIF, written by Pillow (the test visit's photos carry DateTime)
w.__real = Array.from(fs.readFileSync('end-game-skill/end-game/test-visit/photos/IMG_4102.jpg'));
ok((await g(`exifRead(new Uint8Array(window.__real))`)).time === '2026:10:29 09:03:55', 'a phone photo\'s own time is read');

// ---- through shrink: from the original, or from the app's camera
w.eval(`shrinkPixels = async () => new Blob([new Uint8Array(window.__bare)], {type: 'image/jpeg'})`);
const fromGallery = await g(`(async () => exifRead(await blobBytes(await shrink(new File([new Uint8Array(window.__stamped)], 'IMG.jpg', {type: 'image/jpeg'})))))()`);
ok(fromGallery.time === '2026:10:29 09:03:55' && Math.abs(fromGallery.lat + 33.856) < 1e-5, 'a gallery photo keeps its time and place through the shrink');
const fromCamera = await g(`(async () => { const f = new File([new Uint8Array(window.__bare)], 'photo-1.jpg', {type: 'image/jpeg'}); f.fcrmMeta = {time: '2026:10:29 09:07:42', lat: -33.9, lon: 151.1}; return exifRead(await blobBytes(await shrink(f))); })()`);
ok(fromCamera.time === '2026:10:29 09:07:42' && Math.abs(fromCamera.lon - 151.1) < 1e-5, 'the app\'s camera: the time and place noted at the tap');
const noPlace = await g(`(async () => { const f = new File([new Uint8Array(window.__bare)], 'photo-2.jpg', {type: 'image/jpeg'}); f.fcrmMeta = {time: '2026:10:29 09:08:00', lat: null, lon: null}; return exifRead(await blobBytes(await shrink(f))); })()`);
ok(noPlace.time === '2026:10:29 09:08:00' && noPlace.lat === undefined, 'location refused: the time still goes in');
const plain = await g(`(async () => (await blobBytes(await shrink(new File([new Uint8Array(window.__bare)], 'pasted.png', {type: 'image/png'})))).length)()`);
ok(plain === bare.length, 'a picture with neither (pasted) is shrunk as before');
ok(g(`exifStamp(new Date(2026, 9, 29, 9, 5, 7))`) === '2026:10:29 09:05:07', 'the camera\'s time in EXIF\'s own format, local time');

// ---- on a call, and out again through Save for Claude
await g(`(async () => {
  call = {id: 'c1', customer: 'Example Foods - Smithfield', date: '29/10/2026', type: 'Site call', contacts: [], entries: [], loose: [], status: 'in progress', updated: Date.now()};
  await saveCall(); go('dash');
  photoTarget = 'loose';
  await addPhotos([new File([new Uint8Array(window.__stamped)], 'IMG.jpg', {type: 'image/jpeg'})]);
})()`); await tick(80);
const out = await g(`(async () => { const {data} = await clCallFile(call, true); return exifRead(await blobBytes(dataURLToBlob(data.call.loose[0].data))); })()`);
ok(out.time === '2026:10:29 09:03:55', 'a loose photo on the call still has its time in the file saved for Claude');

// ---- Pillow, and the end-game skill's own reader, agree
{
  const { spawnSync } = await import('child_process');
  const os = await import('os'), path = await import('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'px-')), clean = path.join(dir, 'clean.jpg'), tmp = path.join(dir, 'stamped.jpg');
  // a real JPEG with no EXIF, as a canvas would give: Pillow makes it, this app stamps it, Pillow reads it
  const mk = spawnSync('python3', ['-c', 'import sys\nfrom PIL import Image\nImage.new("RGB", (64, 48), (90, 120, 140)).save(sys.argv[1], quality=80)', clean], { encoding: 'utf8' });
  if (mk.status === 0) {
    w.__clean = Array.from(fs.readFileSync(clean));
    fs.writeFileSync(tmp, Buffer.from(await g(`(async () => Array.from(await blobBytes(exifWrite(new Uint8Array(window.__clean), {time: '2026:10:29 09:03:55', lat: -33.856, lon: 150.925}))))()`)));
  }
  const py = `
import sys; sys.path.insert(0, 'end-game-skill/end-game/scripts')
from PIL import Image
from walk_timeline import exif_time
ex = Image.open(sys.argv[1]).getexif()
g = ex.get_ifd(0x8825)
lat = sum(float(x) / 60 ** i for i, x in enumerate(g[2])) * (-1 if g[1] == 'S' else 1)
print(exif_time(sys.argv[1]).isoformat(), round(lat, 4))`;
  const r = mk.status === 0 ? spawnSync('python3', ['-c', py, tmp], { encoding: 'utf8' }) : mk;
  if (r.status !== 0) console.log('  (skipped the Pillow check: ' + String(r.stderr || r.error).split('\n').filter(Boolean).slice(-1)[0] + ')');
  else ok(r.stdout.trim() === '2026-10-29T09:03:55 -33.856', 'Pillow and walk_timeline read the same time and place: ' + r.stdout.trim());
}

ok(!errs.length, 'no errors: ' + errs.slice(0, 3).join(' | '));
console.log(`photo time and place: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
