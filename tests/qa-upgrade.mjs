// v126: a database upgrade with an older copy of the app still open. v125
// moved the database to version 9; an old tab, or the app left running in the
// background, held version 8 open, the upgrade was blocked, and the new build
// started with no accounts and no belt data. Now the open waits for the old
// copy and says so, and a copy asked to let go closes and reloads.
// Everything here is made up.
import { JSDOM } from 'jsdom';
import fs from 'fs';
import 'fake-indexeddb/auto';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  x ' + m); } };
const tick = (ms = 50) => new Promise(r => setTimeout(r, ms));

// what an older build left: version 8, with an account in it, and still open
const old = await new Promise((res, rej) => {
  const r = indexedDB.open('fieldcrm', 8);
  r.onupgradeneeded = e => { const d = e.target.result;
    d.createObjectStore('kv'); d.createObjectStore('accounts', {keyPath: 'a'});
    for (const s of ['calls', 'appts', 'tasks', 'snippets', 'products', 'plans', 'opps', 'cip']) d.createObjectStore(s, {keyPath: 'id'}); };
  r.onsuccess = e => { const d = e.target.result, t = d.transaction('accounts', 'readwrite');
    t.objectStore('accounts').put({a: 'Example Meats - Dandenong', sub: 'Dandenong', z: 'Z1', foc: 'High', c: [{n: 'Tom Ward', r: 'Ops', t: '', p: '', e: []}]});
    t.oncomplete = () => res(d); };
  r.onerror = () => rej(r.error);
});
// the old copy has no versionchange handler: it holds on until it is closed

const boot = () => {
  const errs = [];
  const dom = new JSDOM(fs.readFileSync('index.html', 'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g, ''), { runScripts: 'dangerously', url: 'https://example.org/' });
  const w = dom.window, d = w.document;
  w.indexedDB = indexedDB; w.IDBKeyRange = IDBKeyRange;
  w.scrollTo = () => {}; w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  w.navigator.storage = { persist: async () => true, persisted: async () => true };
  w.HTMLCanvasElement.prototype.getContext = () => null;
  w.console.error = (...a) => errs.push(a.join(' ')); w.console.warn = () => {};
  for (const f of ['zones.js', 'manuals.js', 'healthlib.js', 'app.js']) { const el = d.createElement('script'); el.textContent = fs.readFileSync(f, 'utf8'); d.body.appendChild(el); }
  d.dispatchEvent(new w.Event('DOMContentLoaded'));
  return {w, d, errs};
};
const A = boot();
await tick(400);
ok(/Close any other Field CRM window or tab/.test(A.d.getElementById('toast').textContent) && A.d.getElementById('toast').classList.contains('show'), 'blocked by the old copy: it says to close it, and the message stays');
ok(!/Storage error/.test(A.d.getElementById('dbStat').textContent), 'and it does not give up with a storage error');
old.close(); await tick(500);
ok(A.w.eval('ACCOUNTS.length') === 1 && A.w.eval('db.version') === 9 && A.w.eval('db.objectStoreNames.contains("people")'), 'the old copy closes: the upgrade goes through and the accounts are all there');
ok(!A.d.getElementById('toast').classList.contains('show') || !/Close any other/.test(A.d.getElementById('toast').textContent), 'the message goes');

// a later build opening a newer version: this copy lets go and reloads
const newer = await new Promise((res, rej) => {
  const r = indexedDB.open('fieldcrm', 10);
  r.onsuccess = e => res(e.target.result); r.onerror = () => rej(r.error);
  r.onblocked = () => rej(new Error('blocked'));
}).catch(e => e);
ok(newer && newer.version === 10, 'a newer build is not blocked by this one: ' + (newer && (newer.version || newer.message)));
ok(A.w.eval('db') === null && A.w.eval('dbReady') === null, 'this copy closed its database (and reloads, which jsdom cannot do)');
if (newer && newer.close) newer.close();

const real = A.errs.filter(e => !/Not implemented|navigation|Could not parse CSS|zones\.js/.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
