// Cloud sync, Step 2: settings, sign in, stay signed in on reopen, sign out.
// Loads the real shipped Supabase library; only the network is a stand-in, so
// this proves the app and the library work together, not that the real
// project accepts the sign-in. That needs a device, or the live check in
// tests/README.md.
import { JSDOM } from 'jsdom';
import fs from 'fs';
import 'fake-indexeddb/auto';

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
    return res(404, {});
  };
}

const store = {};   // carries localStorage across a "reopen"
async function boot() {
  const errs = [];
  const dom = new JSDOM(html.replace(/<script[^>]*src=[^>]*><\/script>/g, ''),
    { runScripts: 'dangerously', url: 'https://example.org/' });
  const w = dom.window, d = w.document;
  w.indexedDB = indexedDB; w.IDBKeyRange = IDBKeyRange;
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
  for (const [k, v] of Object.entries(store)) w.localStorage.setItem(k, v);
  for (const f of ['zones.js', 'manuals.js', 'healthlib.js', LIB, 'app.js']) {
    const el = d.createElement('script'); el.textContent = fs.readFileSync(f, 'utf8'); d.body.appendChild(el);
  }
  d.dispatchEvent(new w.Event('DOMContentLoaded'));
  await tick(500);
  const save = () => { for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); store[k] = w.localStorage.getItem(k); } };
  return { w, d, errs, save, $: id => d.getElementById(id), stat: () => d.getElementById('sbStat').textContent };
}
async function setField(a, id, v) {
  const f = a.$(id); f.value = v; f.dispatchEvent(new a.w.Event('change')); await tick(100);
}

// ---- first open: nothing set up
let a = await boot();
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
a = await boot();
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

const real = a.errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/i.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));

console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
