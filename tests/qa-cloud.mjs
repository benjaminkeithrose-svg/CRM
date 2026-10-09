// Cloud sync. Step 2: settings, sign in, stay signed in on reopen, sign out.
// Step 3: passphrase on the first device, unlock on a second, wrong passphrase,
// the two-device race, and encryption round trips between devices.
// Step 4: reference data imported on one device arrives on another; newest
// import wins; offline changes wait; a pulled copy is not sent back.
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
        const store = (q.get('store') || '').replace(/^eq\./, '');
        const ids = q.get('id') ? q.get('id').replace(/^in\.\(|\)$/g, '').split(',').map(x => x.replace(/^"|"$/g, '')) : null;
        const cols = (q.get('select') || '*').split(',');
        const rows = Object.values(RECORDS).filter(r => r.owner === sub && (!store || r.store === store) && (!ids || ids.includes(r.id)))
          .map(r => cols[0] === '*' ? r : Object.fromEntries(cols.map(c => [c, r[c]])));
        return res(200, rows);
      }
      if (opts.method === 'POST') {
        const b = JSON.parse(opts.body);
        for (const row of Array.isArray(b) ? b : [b]) {
          if (row.owner && row.owner !== sub) return res(403, { code: '42501', message: 'new row violates row-level security policy' });
          const k = sub + '|' + row.store + '|' + row.id, old = RECORDS[k];
          posts.push(row.store + '/' + row.id);
          // records_before_write: an older edit never replaces a newer one
          if (old && Number(row.client_updated) < Number(old.client_updated)) continue;
          RECORDS[k] = Object.assign({}, row, { owner: sub, server_updated: new Date().toISOString() });
        }
        return new w.Response(null, { status: 201 });
      }
      return res(405, {});
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

console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
