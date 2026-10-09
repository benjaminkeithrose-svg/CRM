// Cloud sync. Step 2: settings, sign in, stay signed in on reopen, sign out.
// Step 3: passphrase on the first device, unlock on a second, wrong passphrase,
// the two-device race, and encryption round trips between devices.
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
ok(a.$('sbSignIn').disabled, 'sign-in disabled until set up');
ok(a.$('sbSignOut').hidden, 'no sign-out button before signing in');

// ---- the secret key is refused, not stored for use
await setField(a, 'sbUrl', REF);
ok(a.$('sbUrl').value === 'https://' + REF + '.supabase.co', 'project ref expanded to the full address: ' + a.$('sbUrl').value);
await setField(a, 'sbKey', 'sb_secret_abc123');
ok(/not saved/.test(a.$('toast').textContent) && /secret key/.test(a.$('toast').textContent), 'secret key refused: ' + a.$('toast').textContent);
ok(a.$('sbKey').value === '', 'secret key cleared from the field');
ok(!JSON.stringify(await a.w.eval('kvGet("cloud")') || {}).includes('sb_secret'), 'secret key never stored');
ok(a.$('sbSignIn').disabled, 'cannot sign in with a secret key');
await setField(a, 'sbKey', jwt({ iss: 'supabase', ref: REF, role: 'service_role' }));
ok(/service_role/.test(a.$('toast').textContent), 'legacy service_role key refused: ' + a.$('toast').textContent);
ok(!JSON.stringify(await a.w.eval('kvGet("cloud")') || {}).includes('eyJ'), 'service_role key never stored');

// ---- publishable key, then wrong and right passwords
await setField(a, 'sbKey', 'sb_publishable_test');
ok(/Not signed in/.test(a.stat()), 'set up, not signed in: ' + a.stat());
ok(!a.$('sbSignIn').disabled, 'sign-in enabled');

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
ok(/Cloud sign-in/.test(a.$('loadLog').textContent), 'sign-in shows in the load log');
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

console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
