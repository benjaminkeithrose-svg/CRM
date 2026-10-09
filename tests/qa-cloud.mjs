// Cloud sync. Step 2: settings, sign in, stay signed in on reopen, sign out.
// Step 3: passphrase on the first device, unlock on a second, wrong passphrase,
// the two-device race, and encryption round trips between devices.
// Step 4: reference data imported on one device arrives on another; newest
// import wins; offline changes wait; a pulled copy is not sent back.
// Step 5: calls (with photos), quote requests and appointments, deletes, the
// open-call guard, and the GitHub sync's 800px copies.
// Loads the real shipped Supabase library and real Web Crypto; only the network
// is a stand-in, so this proves the app, the library and the crypto work
// together - not that the real project accepts them. That needs a device.
import { JSDOM } from 'jsdom';
import fs from 'fs';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  x ' + m); } };
const tick = (ms = 50) => new Promise(r => setTimeout(r, ms));

const LIB = fs.readdirSync('.').find(f => /^supabase-[\d.]+\.js$/.test(f));
const html = fs.readFileSync('index.html', 'utf8');
ok(LIB && html.includes('<script src="' + LIB + '">'), 'index.html loads the shipped library');
ok(fs.readFileSync('sw.js', 'utf8').includes("'./" + LIB + "'"), 'service worker caches the library');
ok(!/cdn|unpkg|jsdelivr/.test(html.match(/<script src="supabase[^"]*">/)[0]), 'library is not from a CDN');

const REF = 'abcdefghijklmnopqrst';
const b64u = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = p => b64u({ alg: 'HS256', typ: 'JWT' }) + '.' + b64u(p) + '.sig';
const now = () => Math.floor(Date.now() / 1000);
const USER = { id: '11111111-1111-1111-1111-111111111111', email: 'ben@example.com', aud: 'authenticated', role: 'authenticated' };
const calls = [];
const VAULTS = {};     // the stand-in server's vaults table, by owner
const RECORDS = {};    // the stand-in server's records table, 'owner|store|id' -> row
const posts = [];      // record uploads, for "was anything sent" checks
const STORAGE = {};    // the stand-in photos bucket: path -> bytes
const storageGets = [];
let clock = 0;         // server_updated, strictly increasing
const subOf = (w, opts) => {
  const tok = (new w.Headers(opts.headers || {}).get('authorization') || '').replace(/^Bearer /, '');
  try { return JSON.parse(Buffer.from(tok.split('.')[1], 'base64url').toString()).sub || null; } catch (e) { return null; }
};

function fakeFetch(w) {
  return async (url, opts = {}) => {
    const u = String(url);
    calls.push({ u, method: opts.method || 'GET' });
    const res = (status, body) => new w.Response(body == null ? null : JSON.stringify(body),
      { status, headers: { 'content-type': 'application/json' } });
    if (!u.startsWith('https://' + REF + '.supabase.co/')) return res(404, { msg: 'wrong project' });
    if (u.includes('/auth/v1/token?grant_type=password')) {
      const b = JSON.parse(opts.body);
      if (b.email === USER.email && b.password === 'right-pass') {
        return res(200, { access_token: jwt({ sub: USER.id, email: USER.email, role: 'authenticated', exp: now() + 3600 }),
          token_type: 'bearer', expires_in: 3600, expires_at: now() + 3600, refresh_token: 'r1', user: USER });
      }
      return res(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
    }
    if (u.includes('/auth/v1/logout')) return new w.Response(null, { status: 204 });
    if (u.includes('/auth/v1/user')) return res(200, USER);
    if (u.includes('/rest/v1/records')) {
      const sub = subOf(w, opts);
      if (!sub) return res(401, { code: '42501', message: 'permission denied for table records' });
      const q = new URL(u).searchParams;
      if ((opts.method || 'GET') === 'GET') {
        const inList = v => v.replace(/^in\.\(|\)$/g, '').split(',').map(x => x.replace(/^"|"$/g, ''));
        const st = q.get('store') || '';
        const stores = st.startsWith('in.') ? inList(st) : st ? [st.replace(/^eq\./, '')] : null;
        const ids = q.get('id') ? inList(q.get('id')) : null;
        const gt = q.get('server_updated') ? q.get('server_updated').replace(/^gt\./, '') : null;
        const cols = (q.get('select') || '*').split(',');
        let rows = Object.values(RECORDS).filter(r => r.owner === sub && (!stores || stores.includes(r.store)) && (!ids || ids.includes(r.id))
          && (!gt || Date.parse(r.server_updated) > Date.parse(gt)));
        if (q.get('order')) rows.sort((a, b) => a.server_updated.localeCompare(b.server_updated) || a.store.localeCompare(b.store) || a.id.localeCompare(b.id));
        const off = Number(q.get('offset') || 0), lim = q.get('limit') ? Number(q.get('limit')) : rows.length;
        rows = rows.slice(off, off + lim).map(r => cols[0] === '*' ? r : Object.fromEntries(cols.map(c => [c, r[c]])));
        return res(200, rows);
      }
      if (opts.method === 'POST') {
        const b = JSON.parse(opts.body), written = [];
        for (const row of Array.isArray(b) ? b : [b]) {
          if (row.owner && row.owner !== sub) return res(403, { code: '42501', message: 'new row violates row-level security policy' });
          const k = sub + '|' + row.store + '|' + row.id, old = RECORDS[k];
          posts.push(row.store + '/' + row.id);
          // records_before_write: an older edit never replaces a newer one
          if (old && Number(row.client_updated) < Number(old.client_updated)) continue;
          RECORDS[k] = Object.assign({}, row, { owner: sub, server_updated: new Date(Date.UTC(2026, 9, 9) + (++clock) * 1000).toISOString() });
          written.push(RECORDS[k]);
        }
        const h = new w.Headers(opts.headers || {});
        if (/return=representation/.test(h.get('prefer') || '')) {
          const cols = (q.get('select') || 'store,id').split(',');
          return res(201, written.map(r => Object.fromEntries(cols.map(c => [c, r[c]]))));
        }
        return new w.Response(null, { status: 201 });
      }
      return res(405, {});
    }
    if (u.includes('/storage/v1/object')) {
      const sub = subOf(w, opts);
      if (!sub) return res(400, { statusCode: '403', error: 'Unauthorized', message: 'no token' });
      const path = decodeURIComponent(u.split('/storage/v1/object/')[1].split('?')[0]);
      const m = opts.method || 'GET';
      if (path.startsWith('list/photos')) {
        const prefix = JSON.parse(opts.body).prefix.replace(/\/$/, '') + '/';
        if (!prefix.startsWith(sub + '/')) return res(200, []);
        return res(200, Object.keys(STORAGE).filter(k => k.startsWith(prefix)).map(k => ({ name: k.slice(prefix.length) })));
      }
      if (m === 'DELETE') {
        const gone = JSON.parse(opts.body).prefixes.filter(p => p.startsWith(sub + '/'));
        gone.forEach(p => delete STORAGE[p]);
        return res(200, gone.map(name => ({ name })));
      }
      const key = path.replace(/^photos\//, '');
      if (!key.startsWith(sub + '/')) return res(400, { statusCode: '403', error: 'Unauthorized', message: 'row-level security' });
      if (m === 'POST') { STORAGE[key] = Buffer.from(opts.body); return res(200, { Key: 'photos/' + key, Id: key }); }
      storageGets.push(key);
      if (!STORAGE[key]) return res(400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
      return new w.Response(STORAGE[key], { status: 200, headers: { 'content-type': 'application/octet-stream' } });
    }
    if (u.includes('/rest/v1/vaults')) {
      const h = new w.Headers(opts.headers || {});
      const tok = (h.get('authorization') || '').replace(/^Bearer /, '');
      let sub = null;
      try { sub = JSON.parse(Buffer.from(tok.split('.')[1], 'base64url').toString()).sub; } catch (e) {}
      if (!sub) return res(401, { code: '42501', message: 'permission denied for table vaults' });
      if ((opts.method || 'GET') === 'GET') return res(200, VAULTS[sub] ? [VAULTS[sub]] : []);
      if (opts.method === 'POST') {
        // an upsert would overwrite, as the real access rules allow; a plain insert collides
        const merge = /merge-duplicates/.test(h.get('prefer') || '');
        if (VAULTS[sub] && !merge) return res(409, { code: '23505', message: 'duplicate key value violates unique constraint "vaults_pkey"' });
        const b = JSON.parse(opts.body); VAULTS[sub] = Object.assign({ owner: sub }, Array.isArray(b) ? b[0] : b);
        return new w.Response(null, { status: 201 });
      }
      return res(405, {});
    }
    return res(404, {});
  };
}

// A device is its own IndexedDB and localStorage, kept across a "reopen"
const newDevice = () => ({ idb: new IDBFactory(), ls: {} });
async function boot(dev) {
  const errs = [];
  const dom = new JSDOM(html.replace(/<script[^>]*src=[^>]*><\/script>/g, ''),
    { runScripts: 'dangerously', url: 'https://example.org/' });
  const w = dom.window, d = w.document;
  w.indexedDB = dev.idb; w.IDBKeyRange = IDBKeyRange;
  Object.defineProperty(w, 'crypto', { value: globalThis.crypto, configurable: true });
  w.scrollTo = () => {}; w.alert = () => {}; w.confirm = () => true;
  w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  w.navigator.storage = { persist: async () => true, persisted: async () => true };
  w.URL.createObjectURL = () => 'blob:stub'; w.URL.revokeObjectURL = () => {};
  if (!w.HTMLElement.prototype.showModal) w.HTMLElement.prototype.showModal = function () { this.setAttribute('open', '') };
  if (!w.HTMLElement.prototype.close) w.HTMLElement.prototype.close = function () { this.removeAttribute('open') };
  w.HTMLCanvasElement.prototype.getContext = () => null;
  w.console.error = (...a) => errs.push(a.join(' ')); w.console.warn = () => {};
  w.Response = Response; w.Headers = Headers; w.Request = Request;
  w.CompressionStream = CompressionStream; w.DecompressionStream = DecompressionStream;
  w.Blob = Blob;   // fake-indexeddb only round-trips Node's own Blob; Chrome's IndexedDB keeps its Blobs
  w.fetch = fakeFetch(w);
  for (const [k, v] of Object.entries(dev.ls)) w.localStorage.setItem(k, v);
  for (const f of ['zones.js', 'manuals.js', 'healthlib.js', LIB, 'app.js']) {
    const el = d.createElement('script'); el.textContent = fs.readFileSync(f, 'utf8'); d.body.appendChild(el);
  }
  d.dispatchEvent(new w.Event('DOMContentLoaded'));
  await tick(500);
  const save = () => { dev.ls = {}; for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); dev.ls[k] = w.localStorage.getItem(k); } };
  return { w, d, errs, save, $: id => d.getElementById(id), stat: () => d.getElementById('sbStat').textContent };
}
async function setField(a, id, v) {
  const f = a.$(id); f.value = v; f.dispatchEvent(new a.w.Event('change')); await tick(100);
}

// ---- first open: nothing set up
const phone = newDevice();
let a = await boot(phone);
ok(typeof a.w.supabase?.createClient === 'function', 'library loaded into the page');
ok(/Not set up/.test(a.stat()), 'fresh device says not set up: ' + a.stat());
a.$('sbSignIn').click(); await tick(100);
ok(!a.$('sbSignIn').disabled && /project address and the publishable key/.test(a.$('toast').textContent), 'sign-in before set-up says what is missing: ' + a.$('toast').textContent);
ok(a.$('sbSignOut').hidden, 'no sign-out button before signing in');

// ---- the secret key is refused, not stored for use
await setField(a, 'sbUrl', REF);
ok(a.$('sbUrl').value === 'https://' + REF + '.supabase.co', 'project ref expanded to the full address: ' + a.$('sbUrl').value);
await setField(a, 'sbKey', 'sb_secret_abc123');
ok(/not saved/.test(a.$('toast').textContent) && /secret key/.test(a.$('toast').textContent), 'secret key refused: ' + a.$('toast').textContent);
ok(a.$('sbKey').value === '', 'secret key cleared from the field');
ok(!JSON.stringify(await a.w.eval('kvGet("cloud")') || {}).includes('sb_secret'), 'secret key never stored');
a.$('sbSignIn').click(); await tick(100);
ok(/project address and the publishable key/.test(a.$('toast').textContent), 'cannot sign in with a secret key');
await setField(a, 'sbKey', jwt({ iss: 'supabase', ref: REF, role: 'service_role' }));
ok(/service_role/.test(a.$('toast').textContent), 'legacy service_role key refused: ' + a.$('toast').textContent);
ok(!JSON.stringify(await a.w.eval('kvGet("cloud")') || {}).includes('eyJ'), 'service_role key never stored');

// ---- publishable key, then wrong and right passwords
await setField(a, 'sbKey', 'sb_publishable_test');
ok(/Not signed in/.test(a.stat()), 'set up, not signed in: ' + a.stat());


a.$('sbEmail').value = USER.email; a.$('sbPass').value = 'wrong';
a.$('sbSignIn').click(); await tick(300);
ok(/do not match/.test(a.$('toast').textContent), 'wrong password in plain words: ' + a.$('toast').textContent);
ok(/Not signed in/.test(a.stat()), 'still signed out after a wrong password');

a.$('sbPass').value = 'right-pass';
a.$('sbSignIn').click(); await tick(300);
ok(/Signed in as ben@example.com/.test(a.stat()), 'signed in: ' + a.stat());
ok(a.$('sbPass').value === '', 'password field cleared after signing in');
ok(a.$('sbIn').hidden && !a.$('sbSignOut').hidden, 'form hidden, sign-out shown');
const keys = Object.keys(a.w.localStorage).length ? [...Array(a.w.localStorage.length)].map((_, i) => a.w.localStorage.key(i)) : [];
ok(keys.some(k => k === 'fcrm.sb.' + REF), 'session kept under the app\'s own prefix: ' + keys.join(','));
ok(!keys.some(k => k.startsWith('sb-')), 'nothing under the library\'s default (shared-origin) key');
const allLs = keys.map(k => a.w.localStorage.getItem(k)).join(' ');
ok(!allLs.includes('right-pass'), 'password not stored anywhere in localStorage');
const kv = await a.w.eval('kvGet("cloud")');
ok(kv && kv.url && kv.key && !JSON.stringify(kv).includes('right-pass'), 'kv holds address and key, no password');
ok(/Cloud sync/.test(a.$('loadLog').textContent), 'sign-in shows in the load log');
a.save();

// ---- reopen: still signed in, with no network call needed
a = await boot(phone);
const before = calls.length;
ok(/Signed in as ben@example.com/.test(a.stat()), 'still signed in after reopening: ' + a.stat());
ok(calls.slice(before).every(c => !c.u.includes('grant_type=password')), 'reopening does not sign in again');

// ---- sign out
a.$('sbSignOut').click(); await tick(300);
ok(/Not signed in/.test(a.stat()), 'signed out: ' + a.stat());
ok(!a.$('sbIn').hidden && a.$('sbSignOut').hidden, 'form back after signing out');
ok(![...Array(a.w.localStorage.length)].map((_, i) => a.w.localStorage.key(i)).includes('fcrm.sb.' + REF), 'session removed on sign-out');

// ---- changing the project signs this device out of the old one
a.$('sbEmail').value = USER.email; a.$('sbPass').value = 'right-pass'; a.$('sbSignIn').click(); await tick(300);
ok(/Signed in/.test(a.stat()), 'signed back in');
await setField(a, 'sbUrl', 'https://zzzzzzzzzzzzzzzzzzzz.supabase.co');
await tick(200);
ok(/Not signed in/.test(a.stat()), 'new project address means signed out: ' + a.stat());
ok(![...Array(a.w.localStorage.length)].map((_, i) => a.w.localStorage.key(i)).includes('fcrm.sb.' + REF), 'old project session removed');

// ---- library missing (blocked first load): says so, no crash
a.w.supabase = undefined;
a.w.eval('sbMake(); renderSb()');
ok(/did not load/.test(a.stat()), 'missing library reported: ' + a.stat());

let real = a.errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/i.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));

// ================= Step 3: encryption =================
const PH = 'correct horse battery staple';
async function setUp(dev) {
  const x = await boot(dev);
  await setField(x, 'sbUrl', REF); await setField(x, 'sbKey', 'sb_publishable_test');
  x.$('sbEmail').value = USER.email; x.$('sbPass').value = 'right-pass';
  x.$('sbSignIn').click(); await tick(500);
  return x;
}
const go = async (x, p1, p2) => {
  x.$('sbPh').value = p1; x.$('sbPh2').value = p2 == null ? '' : p2;
  x.$('sbPhGo').click(); await tick(1500);   // PBKDF2 at 600,000 rounds takes a moment
};
const phone2 = newDevice();
let p = await setUp(phone2);
ok(/no passphrase set yet/.test(p.stat()), 'first device: asked to set a passphrase: ' + p.stat());
ok(!p.$('sbLock').hidden && !p.$('sbPh2Wrap').hidden && p.$('sbPhGo').textContent === 'Set passphrase', 'set form with a confirm field');
await go(p, 'short', 'short');
ok(/at least 12/.test(p.$('toast').textContent), 'short passphrase refused: ' + p.$('toast').textContent);
await go(p, PH, PH + 'x');
ok(/different/.test(p.$('toast').textContent), 'mismatched confirmation refused');
ok(!VAULTS[USER.id], 'nothing uploaded until the passphrase is accepted');
await go(p, PH, PH);
ok(/Passphrase set/.test(p.$('toast').textContent), 'passphrase set: ' + p.$('toast').textContent);
ok(/unlocked on this device/.test(p.stat()), 'first device unlocked: ' + p.stat());
ok(p.$('sbLock').hidden, 'passphrase form gone once unlocked');
ok(p.$('sbPh').value === '' && p.$('sbPh2').value === '', 'passphrase fields cleared');
const v = VAULTS[USER.id];
ok(v && v.key_id && v.wrapped_key && v.wrap_iv && v.kdf && v.kdf.iterations === 600000 && v.kdf.salt, 'locked key uploaded with its settings');
ok(!JSON.stringify(v).includes(PH), 'passphrase not in what was uploaded');
const ck = await p.w.eval('kvGet("cloudKey")');
ok(ck && ck.key && ck.key.type === 'secret' && ck.key.extractable === false, 'device keeps the key, non-extractable');
ok(ck.uid === USER.id && ck.key_id === v.key_id, 'device key tied to this account and key id');

// encryption round trip, and tampering refused
const rec = { id: 'c1', customer: 'Acme Pty Ltd', notes: 'Sprocket wear on line 3 \u2013 r\u00e9sum\u00e9' };
p.w.__rec = rec;
const sealed = await p.w.eval('sbSeal("calls", "c1", window.__rec)');
ok(sealed.key_id === v.key_id && sealed.iv && sealed.body, 'sealed record carries key id, iv, body');
ok(!Buffer.from(sealed.body, 'base64').toString('latin1').includes('Acme'), 'sealed body is not readable');
p.w.__s = sealed;
ok(JSON.stringify(await p.w.eval('sbOpen("calls", "c1", window.__s)')) === JSON.stringify(rec), 'round trip on the same device');
const tamper = async (expr, msg) => { try { await p.w.eval(expr); ok(false, msg); } catch (e) { ok(true, msg); } };
const flipped = Buffer.from(sealed.body, 'base64'); flipped[3] ^= 1;
p.w.__t = Object.assign({}, sealed, { body: flipped.toString('base64') });
await tamper('sbOpen("calls", "c1", window.__t)', 'a changed body is refused');
await tamper('sbOpen("calls", "c2", window.__s)', 'a body moved to another record is refused');
await tamper('sbOpen("appts", "c1", window.__s)', 'a body moved to another store is refused');
p.save();

// reopen the first device: still unlocked, no passphrase asked
p = await boot(phone2);
await tick(300);
ok(/unlocked on this device/.test(p.stat()), 'first device still unlocked after reopening: ' + p.stat());

// ---- a second device: wrong passphrase, then the right one
const pc = newDevice();
let q = await setUp(pc);
ok(/locked on this device/.test(q.stat()), 'second device: locked: ' + q.stat());
ok(!q.$('sbLock').hidden && q.$('sbPh2Wrap').hidden && q.$('sbPhGo').textContent === 'Unlock', 'unlock form, no confirm field');
await go(q, 'not the passphrase at all');
ok(/does not match/.test(q.$('toast').textContent), 'wrong passphrase in plain words: ' + q.$('toast').textContent);
ok(/locked on this device/.test(q.stat()), 'still locked after a wrong passphrase');
ok(!(await q.w.eval('kvGet("cloudKey")')), 'nothing kept after a wrong passphrase');
await go(q, PH);
ok(/Unlocked/.test(q.$('toast').textContent) && /unlocked on this device/.test(q.stat()), 'second device unlocked: ' + q.stat());
q.w.__s = sealed;
ok(JSON.stringify(await q.w.eval('sbOpen("calls", "c1", window.__s)')) === JSON.stringify(rec), 'a record sealed on the phone opens on the PC');
ok(VAULTS[USER.id].wrapped_key === v.wrapped_key, 'vault untouched by unlocking');

// ---- the race: a device that thinks no passphrase is set yet
const tab = newDevice();
let r = await setUp(tab);
r.w.eval('sbVault = "none"; renderSb()');
await go(r, 'a different passphrase here', 'a different passphrase here');
ok(/already set on another device/.test(r.$('toast').textContent), 'second set-up is told to use the first: ' + r.$('toast').textContent);
ok(VAULTS[USER.id].wrapped_key === v.wrapped_key, 'the existing vault is never overwritten');
ok(/locked on this device/.test(r.stat()), 'and it is asked to unlock instead: ' + r.stat());

// ---- sign out locks the device; offline says it needs signal
q.$('sbSignOut').click(); await tick(300);
ok(!(await q.w.eval('kvGet("cloudKey")')), 'signing out forgets the key');
q.$('sbEmail').value = USER.email; q.$('sbPass').value = 'right-pass'; q.$('sbSignIn').click(); await tick(500);
ok(/locked on this device/.test(q.stat()), 'signed back in: locked again until the passphrase is typed');
Object.defineProperty(q.w.navigator, 'onLine', { value: false, configurable: true });
await q.w.eval('sbCheckVault()');
ok(/needs signal/.test(q.stat()), 'offline: says unlocking needs signal: ' + q.stat());

for (const x of [p, q, r]) {
  real = x.errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/i.test(e));
  ok(!real.length, 'no console errors (step 3): ' + real.slice(0, 3).join(' | '));
}

// ================= Step 4: reference data, loaded once =================
const unlocked = async dev => { const x = await setUp(dev); await go(x, PH); await tick(800); return x; };
const ds = id => RECORDS[USER.id + '|datasets|' + id];
const sync = async x => { x.$('sbSync').click(); await tick(800); };
const T1 = Date.now() - 3600e3;   // an import an hour ago
const crmImport = (x, when, name) => x.w.eval(`(async () => {
  const list = [{a:${JSON.stringify(name)}, sub:'Smithfield', z:'Z1', tier:'A', foc:'High', cad:CAD['High'], seg:'', team:'', mgr:'Ben', rep:'',
    last:null, lastAppt:null, idle:null, c:[{n:'Jo Bloggs', r:'Engineer', t:'', p:'0400 000 000', pk:'ok', e:['jo@acme.example']}]}];
  await accReplaceAll(list);
  const meta = {imported:${when}, source:'export-${when}.xlsx', rows:1, counts:{accounts:1, contacts:1}, managers:['Ben'], reps:[]};
  await kvSet('meta', meta); META = meta; indexAccounts(list); renderDbStat();
})()`);

const pc2 = newDevice();
let P = await unlocked(pc2);
ok(!P.$('sbSync').hidden, 'Sync button shown once unlocked');
await crmImport(P, T1, 'Acme Pty Ltd - Smithfield');
await P.w.eval(`(async () => { OVERRIDES = {acctZone:{'Acme Pty Ltd - Smithfield':'Z2'}, spelling:{smithfeild:'smithfield'}, loaded:${T1}, file:'zone-overrides.json'};
  await kvSet('overrides', OVERRIDES); })()`);
await tick(100);
ok(/2 changes waiting to send/.test(P.stat()), 'imports show as waiting to send: ' + P.stat());
await sync(P);
ok(ds('crm') && ds('overrides'), 'PC sent the CRM accounts and the zone overrides');
ok(Number(ds('crm').client_updated) === T1, 'the cloud copy carries the import time, not the sync time');
const raw = Buffer.from(ds('crm').body, 'base64').toString('latin1');
ok(!/Acme|Bloggs|acme\.example/.test(raw) && !/Acme|Bloggs/.test(JSON.stringify(ds('crm'))), 'customer names are not readable in the cloud copy');
ok(!/waiting to send/.test(P.stat()) && /last synced/.test(P.stat()), 'PC in step after syncing: ' + P.stat());
ok(/Synced: sent/.test(P.$('toast').textContent), 'sync says what it sent: ' + P.$('toast').textContent);

// a new phone brings it all in with no import of its own
const ph3 = newDevice();
let Q = await unlocked(ph3);
const postsBefore = posts.length;
ok(Q.w.eval('ACCOUNTS.length') === 1 && Q.w.eval('ACCOUNTS[0].a') === 'Acme Pty Ltd - Smithfield', 'phone has the accounts without importing');
ok(Q.w.eval('META.source') === 'export-' + T1 + '.xlsx', 'phone has the import details');
ok(Q.w.eval('OVERRIDES.acctZone["Acme Pty Ltd - Smithfield"]') === 'Z2', 'phone has the zone overrides');
ok(/1<\/b> accounts/.test(Q.$('dbStat').innerHTML), 'the data screen shows them: ' + Q.$('dbStat').textContent);
ok(/Pulled CRM accounts/.test(Q.$('loadLog').textContent), 'load log records the pull');
await sync(Q);
ok(posts.length === postsBefore, 'nothing pulled is sent back up');
ok(!/waiting to send/.test(Q.stat()), 'phone in step: ' + Q.stat());

// a change on the phone reaches the PC
await Q.w.eval(`(async () => { MGR_OF['Acme Pty Ltd - Smithfield'] = 'Sam'; await saveMgrOf(); })()`);
await tick(100);
ok(/1 change waiting to send/.test(Q.stat()), 'phone change waiting: ' + Q.stat());
await sync(Q);
ok(ds('mgrOf'), 'reassignment sent');
await sync(P);
ok(P.w.eval('MGR_OF["Acme Pty Ltd - Smithfield"]') === 'Sam', 'PC brought the reassignment in');

// a newer import wins; an older one turning up later does not
const T2 = Date.now() - 600e3;
await crmImport(Q, T2, 'Acme Pty Ltd - Wetherill Park');
await sync(Q);
await sync(P);
ok(P.w.eval('ACCOUNTS[0].a') === 'Acme Pty Ltd - Wetherill Park', 'newer import on the phone replaces the PC\'s');
await crmImport(P, T1 - 1000, 'Acme Pty Ltd - Old Copy');     // e.g. an old backup restored
await sync(P);
ok(Number(ds('crm').client_updated) === T2, 'an older import does not replace the newer one in the cloud');
ok(P.w.eval('ACCOUNTS[0].a') === 'Acme Pty Ltd - Wetherill Park', 'and the PC is put back to the newer one');

// offline: the change waits, survives closing the app, and goes when back online
Object.defineProperty(Q.w.navigator, 'onLine', { value: false, configurable: true });
const pOff = posts.length;
await Q.w.eval(`(async () => { WEEKS['2026-10-12'] = {zone:'Z3'}; await saveWeeks(); })()`);
await tick(3500);   // past the automatic-send delay
ok(posts.length === pOff, 'nothing sent while offline');
ok(/waiting to send/.test(Q.stat()), 'offline change shown as waiting: ' + Q.stat());
Q.save();
Q = await boot(ph3);
await tick(1200);
ok(ds('weeks') && JSON.stringify(ds('weeks')) && posts.slice(pOff).includes('datasets/weeks'), 'reopened online: the waiting change was sent');

// a device that had older data before cloud sync adopts the cloud's
const old = newDevice();
let O = await boot(old);
await crmImport(O, T1 - 5000, 'Acme Pty Ltd - Legacy');
await O.w.eval(`(async () => { WEEKS = {'2026-01-05':{zone:'Z9'}}; await kvSet('weeks', WEEKS); })()`);
await tick(300);
// as if all of that was there before cloud sync existed: no record of any version
await O.w.eval(`(async () => { cloudSets = {}; await kvSet('cloudSets', {}); })()`);
O.save();
O = await unlocked(old);
ok(O.w.eval('ACCOUNTS[0].a') === 'Acme Pty Ltd - Wetherill Park', 'older data from before cloud sync is replaced by the cloud\'s');
ok(O.w.eval('WEEKS["2026-10-12"] && WEEKS["2026-10-12"].zone') === 'Z3', 'undated weeks take the cloud copy');
ok(Number(ds('crm').client_updated) === T2, 'and the cloud copy is untouched');

// a damaged cloud copy is refused, and nothing on the device changes
const k = USER.id + '|datasets|overrides';
const goodOverrides = RECORDS[k];
const bad = Buffer.from(RECORDS[k].body, 'base64'); bad[5] ^= 1;
RECORDS[k] = Object.assign({}, RECORDS[k], { body: bad.toString('base64'), client_updated: Date.now() });
const before4 = O.w.eval('JSON.stringify(OVERRIDES)');
await sync(O);
ok(/Sync failed/.test(O.$('toast').textContent) && /last sync failed/.test(O.stat()), 'damaged copy: sync fails and says so: ' + O.stat());
ok(O.w.eval('JSON.stringify(OVERRIDES)') === before4, 'damaged copy: nothing on the device changed');

for (const x of [P, Q, O]) {
  real = x.errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/i.test(e));
  ok(!real.length, 'no console errors (step 4): ' + real.slice(0, 3).join(' | '));
}
RECORDS[k] = goodOverrides;      // put the damaged copy right for the steps below

// ================= Step 5: calls, quote requests, appointments, photos =================
const syncW = async x => {       // sync and wait for it to finish, however long the photos take
  x.$('sbSync').click(); await tick(100);
  for (let i = 0; i < 200 && x.w.eval('!!cloudRun'); i++) await tick(50);
  await tick(50);
};
const jpeg = (n, size) => { const b = Buffer.alloc(size, n); b[0] = 0xFF; b[1] = 0xD8; b[2] = 0xFF; return b; };
const PH1 = jpeg(1, 300000), PH2 = jpeg(2, 250000), PH3 = jpeg(3, 200000);
const mkCall = (x, id, extra) => x.w.eval(`(async () => {
  const B = (n, size) => { const a = new Uint8Array(size).fill(n); a[0] = 0xFF; a[1] = 0xD8; a[2] = 0xFF; return new Blob([a], {type: 'image/jpeg'}); };
  const c = Object.assign({id: ${JSON.stringify(id)}, customer: 'Acme Pty Ltd - Wetherill Park', date: '09/10/2026', type: 'Site call', mgr: 'Ben', site: '',
    contacts: [{name: 'Jo Bloggs', crm: true}], status: 'open', closed: false, updated: Date.now(),
    entries: [{kind: 'belt', asset: 'Line 3 infeed', notes: 'Sprocket wear', photos: [B(1, 300000), B(2, 250000)]}],
    loose: [B(3, 200000)]}, ${JSON.stringify(extra || {})});
  await callsPut(c);
})()`);
const localCall = (x, id) => x.w.eval(`recGet('calls', ${JSON.stringify(id)})`);
const photoBytesIn = async (x, c) => {
  const all = [].concat(...c.entries.map(e => e.photos || []), c.loose || []);
  x.w.__all = all;
  return x.w.eval('Promise.all(window.__all.map(p => blobBytes(p).then(b => Array.from(b.slice(0, 4)).join(",") + ":" + b.length)))');
};
const objs = id => Object.keys(STORAGE).filter(p => p.startsWith(USER.id + '/' + id + '/'));
const row5 = (st, id) => RECORDS[USER.id + '|' + st + '|' + id];

// a call written on the phone, with photos, reaches the PC at full quality
await mkCall(Q, 'c100');
await Q.w.eval(`(async () => { await saveAppt({id: 'a100', acct: 'Acme Pty Ltd - Wetherill Park', date: '2026-10-14', time: '09:00', mins: 60, status: 'booked', agenda: 'Belt survey'}); })()`);
await tick(100);
ok(/waiting to send/.test(Q.stat()), 'new call and appointment waiting to send: ' + Q.stat());
await syncW(Q);
ok(row5('calls', 'c100') && row5('appts', 'a100'), 'call and appointment sent');
ok(objs('c100').length === 3, 'three photos stored, one each: ' + objs('c100').length);
ok(objs('c100').every(p => STORAGE[p][0] !== 0xFF || STORAGE[p][1] !== 0xD8), 'stored photos are not readable JPEGs (encrypted)');
ok(!/Acme|Bloggs|Sprocket|Line 3/.test(Buffer.from(row5('calls', 'c100').body, 'base64').toString('latin1')), 'call body unreadable in the cloud');
ok(/sent 1 call, 1 appointment, 3 photos/.test(Q.$('toast').textContent) || /sent/.test(Q.$('toast').textContent), 'sync says what it sent: ' + Q.$('toast').textContent);
await syncW(P);
let pcC = await localCall(P, 'c100');
ok(pcC && pcC.entries[0].notes === 'Sprocket wear' && pcC.contacts[0].name === 'Jo Bloggs', 'PC has the call');
const pcBytes = await photoBytesIn(P, pcC);
ok(JSON.stringify(pcBytes) === JSON.stringify(['255,216,255,1:300000', '255,216,255,2:250000', '255,216,255,3:200000']), 'PC has all three photos, byte for byte: ' + pcBytes.join(' '));
ok(P.w.eval('APPTS.some(a => a.id === "a100")'), 'PC has the appointment');
ok(/Brought in 1 call, 1 appointment, 3 photos/.test(P.$('loadLog').textContent), 'load log says what came in');
const postsC100 = posts.filter(x => x === 'calls/c100').length;
await syncW(P);
ok(posts.filter(x => x === 'calls/c100').length === postsC100, 'a call brought in is not sent back up');

// an edit on the PC, with a photo removed, goes back; the phone downloads nothing it already has
await P.w.eval(`(async () => { const c = await recGet('calls', 'c100'); c.entries[0].notes = 'Sprocket wear - replace at next shutdown'; c.entries[0].photos.splice(1, 1); c.updated = Date.now(); await callsPut(c); })()`);
await syncW(P);
ok(objs('c100').length === 2, 'the removed photo is removed from the cloud too: ' + objs('c100').length);
const getsBefore = storageGets.length;
await syncW(Q);
let qcC = await localCall(Q, 'c100');
ok(qcC.entries[0].notes === 'Sprocket wear - replace at next shutdown' && qcC.entries[0].photos.length === 1 && qcC.loose.length === 1, 'phone has the PC\'s edit');
ok(storageGets.length === getsBefore, 'phone downloaded no photos it already held');

// newest edit wins: an older offline edit on the phone does not replace the PC's newer one
await Q.w.eval(`(async () => { const c = await recGet('calls', 'c100'); c.entries[0].notes = 'older phone edit'; c.updated = Date.now() - 600000; await callsPut(c); })()`);
await syncW(Q);
qcC = await localCall(Q, 'c100');
ok(qcC.entries[0].notes === 'Sprocket wear - replace at next shutdown', 'phone\'s older edit lost to the PC\'s newer one: ' + qcC.entries[0].notes);

// a task made on the phone appears on the PC, and its delete follows
await Q.w.eval(`tasksPut({id: 't100', type: 'Write email', title: 'Send survey summary', date: '2026-10-12', start: '10:30', dur: 30,
  acct: 'Acme Pty Ltd - Wetherill Park', contact: 'Jo Bloggs', notes: 'secret-ish', done: false, updated: Date.now(), created: Date.now()})`);
await syncW(Q);
ok(row5('tasks', 't100') && !/Send survey|secret-ish/.test(Buffer.from(row5('tasks', 't100').body, 'base64').toString('latin1')), 'task sent, unreadable in the cloud');
await syncW(P);
ok(P.w.eval('TASKS.some(t => t.id === "t100" && t.title === "Send survey summary" && t.start === "10:30")'), 'PC has the task, on its calendar list');
await P.w.eval(`(async () => { const t = TASKS.find(x => x.id === 't100'); t.done = true; t.doneAt = Date.now(); t.updated = Date.now(); await tasksPut(t); })()`);
await syncW(P); await syncW(Q);
ok(Q.w.eval('TASKS.some(t => t.id === "t100" && t.done)'), 'ticked done on the PC, done on the phone');
await Q.w.eval(`tasksDel('t100')`);
await syncW(Q); await syncW(P);
ok(!P.w.eval('TASKS.some(t => t.id === "t100")'), 'task delete reaches the PC');

// a quote request stays a quote request
await Q.w.eval(`(async () => { await callsPut({id: 'q100', rectype: 'quote', customer: 'Acme Pty Ltd - Wetherill Park', date: '09/10/2026', contacts: [], entries: [], loose: [], updated: Date.now(), reqby: 'soon'}); })()`);
await syncW(Q); await syncW(P);
ok(await P.w.eval(`(async () => { const q = await recGet('calls', 'q100'); return !!q && isQuote(q) && !(await callsAll()).some(c => c.id === 'q100') && (await quotesAll()).some(c => c.id === 'q100'); })()`),
  'quote request arrives as a quote, not a call');

// a call open on the PC is not changed under you; it updates once you leave it
await mkCall(Q, 'c200');
await syncW(Q); await syncW(P);
await P.w.eval(`(async () => { call = await recGet('calls', 'c200'); })()`);
await Q.w.eval(`(async () => { const c = await recGet('calls', 'c200'); c.entries[0].notes = 'edited on the phone'; c.updated = Date.now(); await callsPut(c); })()`);
await syncW(Q); await syncW(P);
ok((await localCall(P, 'c200')).entries[0].notes === 'Sprocket wear', 'open call left alone');
ok(/when you leave it/.test(P.$('toast').textContent), 'and the sync says it will update: ' + P.$('toast').textContent);
await P.w.eval('call = null');
await syncW(P);
ok((await localCall(P, 'c200')).entries[0].notes === 'edited on the phone', 'after leaving the call, the update lands');

// deleting on the phone deletes on the PC, photos and all
await Q.w.eval(`callsDel('c200')`);
await syncW(Q);
ok(row5('calls', 'c200').deleted === true && objs('c200').length === 0, 'delete sent; its photos removed from the cloud');
await syncW(P);
ok(!(await localCall(P, 'c200')), 'PC no longer has the deleted call');
await Q.w.eval(`apptsDel('a100')`);
await syncW(Q); await syncW(P);
ok(!P.w.eval('APPTS.some(a => a.id === "a100")'), 'appointment delete reaches the PC');

// calls from before cloud sync go up on the first sync
const seedDev = newDevice();
let S = await boot(seedDev);
await mkCall(S, 'c300');
await tick(200);
await S.w.eval(`(async () => { cloudDirty = {}; await kvSet('cloudDirty', {}); await kvSet('cloudSeeded', false); })()`);
S.save();
S = await unlocked(seedDev);
await syncW(S);
ok(row5('calls', 'c300') && objs('c300').length === 3, 'a call from before cloud sync is sent, with its photos');

// the GitHub sync's 800px copies lose to the originals of the same edit
const T5 = Date.now() - 5000;
await mkCall(Q, 'c400', {updated: T5});
await P.w.eval(`(async () => { const a = new Uint8Array(90000).fill(9); a[0] = 0xFF; a[1] = 0xD8; a[2] = 0xFF;
  await callsPut({id: 'c400', customer: 'Acme Pty Ltd - Wetherill Park', date: '09/10/2026', contacts: [], status: 'open', closed: false,
    updated: ${T5}, syncedPhotos: true, entries: [{kind: 'belt', asset: 'Line 3 infeed', notes: 'Sprocket wear', photos: [new Blob([a], {type: 'image/jpeg'})]}], loose: []}); })()`);
await syncW(P);                  // the PC's copies go up first
await syncW(Q);                  // the phone's originals replace them
await syncW(P);                  // and the PC takes the originals
pcC = await localCall(P, 'c400');
ok(pcC.entries[0].photos.length === 2 && pcC.loose.length === 1 && !pcC.syncedPhotos, 'PC swapped its 800px copies for the originals');
ok(objs('c400').length === 3, 'only the originals are left in the cloud: ' + objs('c400').length);

// and the other order: originals first, then the copies - the copies must not overwrite them
const T6 = Date.now() - 4000;
await mkCall(Q, 'c401', {updated: T6});
await P.w.eval(`(async () => { const a = new Uint8Array(90000).fill(9); a[0] = 0xFF; a[1] = 0xD8; a[2] = 0xFF;
  await callsPut({id: 'c401', customer: 'Acme Pty Ltd - Wetherill Park', date: '09/10/2026', contacts: [], status: 'open', closed: false,
    updated: ${T6}, syncedPhotos: true, entries: [{kind: 'belt', asset: 'Line 3 infeed', notes: 'Sprocket wear', photos: [new Blob([a], {type: 'image/jpeg'})]}], loose: []}); })()`);
await syncW(Q);                  // originals up first
await syncW(P);                  // the PC's copies must lose
ok(objs('c401').length === 3, 'copies sent after the originals do not replace them: ' + objs('c401').length);
pcC = await localCall(P, 'c401');
ok(pcC.entries[0].photos.length === 2 && !pcC.syncedPhotos, 'and the PC ends up with the originals');

for (const x of [P, Q, S]) {
  real = x.errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/i.test(e));
  ok(!real.length, 'no console errors (step 5): ' + real.slice(0, 3).join(' | '));
}

console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
