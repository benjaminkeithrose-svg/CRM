// Real Chromium, the real app served from localhost with its service worker,
// two browser profiles as two devices. Supabase is answered by a stand-in
// (the same rules as tests/qa-cloud.mjs); a third profile talks to the real
// project, which without a test account can only check refusals.
//
// Not part of `npm test` - it needs Playwright's Chromium, which the Claude
// Code cloud environment has pre-installed. Run from the repo root:
//   NODE_USE_ENV_PROXY=1 PW_ROOT=$(npm root -g) node tests/browser-cloud.mjs .
// It is still not a phone test: no Android, no installed PWA, no real signal.
import { createRequire } from 'module';
import { spawn } from 'child_process';
import fs from 'fs';
const require = createRequire(process.env.PW_ROOT + '/');
const { chromium } = require('playwright');

const ROOT = process.argv[2] || '.', PORT = 8123, APP = `http://localhost:${PORT}/`;
const PROJ = 'https://ksuwpjezkumyualdbfmn.supabase.co';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok ' + m); } else { fail++; console.log('  x  ' + m); } };
const tick = ms => new Promise(r => setTimeout(r, ms));

const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
await tick(800);

// ---- stand-in Supabase
const USER = { id: '11111111-1111-1111-1111-111111111111', email: 'ben@example.com', aud: 'authenticated', role: 'authenticated' };
const b64u = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = () => Math.floor(Date.now() / 1000);
const jwt = p => b64u({ alg: 'HS256', typ: 'JWT' }) + '.' + b64u(p) + '.sig';
const VAULTS = {}, RECORDS = {}, seen = [];
async function supa(route) {
  const req = route.request(), u = req.url(), m = req.method(), h = req.headers();
  seen.push(m + ' ' + u.replace(PROJ, ''));
  const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: body == null ? '' : JSON.stringify(body),
    headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (m === 'OPTIONS') return json(204, null);
  if (u.includes('/auth/v1/token?grant_type=password')) {
    const b = JSON.parse(req.postData());
    if (b.email === USER.email && b.password === 'right-pass')
      return json(200, { access_token: jwt({ sub: USER.id, email: USER.email, role: 'authenticated', exp: now() + 3600 }), token_type: 'bearer',
        expires_in: 3600, expires_at: now() + 3600, refresh_token: 'r1', user: USER });
    return json(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
  }
  if (u.includes('/auth/v1/logout')) return json(204, null);
  if (u.includes('/auth/v1/user')) return json(200, USER);
  let sub = null;
  try { sub = JSON.parse(Buffer.from((h.authorization || '').replace('Bearer ', '').split('.')[1], 'base64url')).sub; } catch (e) {}
  if (u.includes('/rest/v1/vaults')) {
    if (m === 'GET') return json(200, VAULTS[sub] ? [VAULTS[sub]] : []);
    if (VAULTS[sub]) return json(409, { code: '23505', message: 'duplicate key' });
    VAULTS[sub] = JSON.parse(req.postData()); return json(201, null);
  }
  if (u.includes('/rest/v1/records')) {
    const q = new URL(u).searchParams;
    if (m === 'GET') {
      const ids = q.get('id') ? q.get('id').replace(/^in\.\(|\)$/g, '').split(',').map(x => x.replace(/^"|"$/g, '')) : null;
      const cols = (q.get('select') || '*').split(',');
      return json(200, Object.values(RECORDS).filter(r => r.store === (q.get('store') || '').replace('eq.', '') && (!ids || ids.includes(r.id)))
        .map(r => Object.fromEntries(cols.map(c => [c, r[c]]))));
    }
    for (const row of [].concat(JSON.parse(req.postData()))) {
      const k = row.store + '|' + row.id;
      if (RECORDS[k] && Number(row.client_updated) < Number(RECORDS[k].client_updated)) continue;
      RECORDS[k] = row;
    }
    return json(201, null);
  }
  return json(404, {});
}

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: EXE });
async function device(name, live) {
  const ctx = await browser.newContext();
  if (!live) await ctx.route(PROJ + '/**', supa);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|status of 400|cdn\.jsdelivr\.net/.test(m.text() + (m.location().url || ''))) errs.push(m.text() + ' @' + (m.location().url || '')); });
  page.on('response', r => { if (r.status() >= 400 && !/favicon|supabase\.co/.test(r.url())) errs.push('HTTP ' + r.status() + ' ' + r.url()); });
  page.on('requestfailed', r => { if (!/cdn\.jsdelivr\.net/.test(r.url())) errs.push('FAILED ' + r.url() + ' ' + (r.failure() || {}).errorText); });
  await page.goto(APP);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();               // now controlled by the service worker
  await tick(800);
  return { name, ctx, page, errs };
}
const stat = d => d.page.locator('#sbStat').innerText();
const ev = (d, f, a) => d.page.evaluate(f, a);
async function settings(d) { await ev(d, () => showScreen('settings')); }
async function setUp(d) {
  await settings(d);
  await d.page.fill('#sbUrl', PROJ); await d.page.locator('#sbUrl').dispatchEvent('change');
  await d.page.fill('#sbKey', 'sb_publishable_1c3t9uxaqIP2K4klSP7loA_bZYlgKfO'); await d.page.locator('#sbKey').dispatchEvent('change');
  await tick(200);
  await d.page.fill('#sbEmail', USER.email); await d.page.fill('#sbPass', 'right-pass');
  await d.page.click('#sbSignIn'); await tick(1200);
}
const PH = 'correct horse battery staple';
async function phrase(d, p1, p2) {
  await d.page.fill('#sbPh', p1); if (p2 != null) await d.page.fill('#sbPh2', p2);
  await d.page.click('#sbPhGo'); await tick(2500);
}
const syncNow = async d => { await d.page.click('#sbSync'); await tick(1500); };
const seedCrm = (d, when, name) => ev(d, async ([when, name]) => {
  const list = [{a: name, sub: 'Smithfield', z: 'Z1', tier: 'A', foc: 'High', cad: CAD['High'], seg: '', team: '', mgr: 'Ben', rep: '',
    last: null, lastAppt: null, idle: null, c: [{n: 'Jo Bloggs', r: 'Engineer', t: '', p: '0400 000 000', pk: 'ok', e: ['jo@acme.example']}]}];
  await accReplaceAll(list);
  const meta = {imported: when, source: 'export.xlsx', rows: 1, counts: {accounts: 1, contacts: 1}, managers: ['Ben'], reps: []};
  await kvSet('meta', meta); META = meta; indexAccounts(list); renderDbStat();
}, [when, name]);

console.log('PC: sign in, set passphrase');
const pc = await device('pc');
ok(await ev(pc, () => typeof window.supabase?.createClient === 'function'), 'library loaded in real Chrome');
await setUp(pc);
ok(/Signed in as ben@example.com/.test(await stat(pc)), 'signed in');

await phrase(pc, PH, PH);
ok(/unlocked on this device/.test(await stat(pc)), 'passphrase set, unlocked: ' + (await stat(pc)).replace(/\n/g, ' | '));
const T1 = Date.now() - 3600e3;
await seedCrm(pc, T1, 'Acme Pty Ltd - Smithfield');
await tick(4500);                    // automatic send a few seconds after the change
ok(!!RECORDS['datasets|crm'], 'CRM accounts sent automatically after the import');
ok(!/Acme|Bloggs/.test(Buffer.from(RECORDS['datasets|crm']?.body || '', 'base64').toString('latin1')), 'cloud copy unreadable');

console.log('Phone: sign in, unlock, bring it in');
const ph = await device('phone');
await setUp(ph);
ok(/locked on this device/.test(await stat(ph)), 'phone locked before passphrase');
await phrase(ph, 'not the passphrase');
ok(/does not match/.test(await ph.page.locator('#toast').innerText()), 'wrong passphrase refused');
await phrase(ph, PH);
await tick(1500);
ok(await ev(ph, () => ACCOUNTS.length === 1 && ACCOUNTS[0].a), 'phone has the accounts: ' + await ev(ph, () => ACCOUNTS[0]?.a));

console.log('A second change must reach the phone (the service worker caching question)');
await ev(pc, async () => { MGR_OF['Acme Pty Ltd - Smithfield'] = 'Sam'; await saveMgrOf(); });
await tick(4500);
ok(!!RECORDS['datasets|mgrOf'], 'PC sent the reassignment');
await syncNow(ph);
ok(await ev(ph, () => MGR_OF['Acme Pty Ltd - Smithfield'] === 'Sam'), 'phone brought in the reassignment on the next sync');
await seedCrm(pc, Date.now() - 60e3, 'Acme Pty Ltd - Wetherill Park');
await tick(4500);
await syncNow(ph);
ok(await ev(ph, () => ACCOUNTS[0].a) === 'Acme Pty Ltd - Wetherill Park', 'phone brought in a newer CRM import: ' + await ev(ph, () => ACCOUNTS[0].a));
const cachedApi = await ev(ph, async () => { const out = []; for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) if (/supabase\.co|api\.github\.com/.test(r.url)) out.push(r.url); return out; });
ok(cachedApi.length === 0, 'no Supabase or GitHub replies kept in the offline cache: ' + cachedApi.slice(0, 3).join(' '));

console.log('Reopen and offline');
await ph.page.reload(); await tick(1500); await settings(ph);
ok(/unlocked on this device/.test(await stat(ph)), 'after reopening: still signed in and unlocked (key kept in IndexedDB)');
await ph.ctx.setOffline(true);
await ph.page.reload(); await tick(1500); await settings(ph);
ok(await ev(ph, () => typeof window.supabase?.createClient === 'function'), 'offline: app and library load from the cache');
ok(/offline/.test(await stat(ph)) && /unlocked/.test(await stat(ph)), 'offline: status says so: ' + (await stat(ph)).replace(/\n/g, ' | '));
await ev(ph, async () => { WEEKS['2026-10-12'] = {zone: 'Z3'}; await saveWeeks(); });
await tick(4000);
ok(/waiting to send/.test(await stat(ph)), 'offline change waits');
await ph.ctx.setOffline(false);
await ev(ph, () => window.dispatchEvent(new Event('online')));
await tick(3000);
ok(!!RECORDS['datasets|weeks'], 'back online: the waiting change was sent');

console.log('Real project, no stand-in (no test account, so a wrong password only)');
// the browser cannot use the proxy here, so this script relays its requests: the
// app's real code, the real Supabase project, Node doing the network hop
async function relay(route) {
  const r = route.request();
  try {
    const res = await fetch(r.url(), { method: r.method(), headers: r.headers(), body: r.postDataBuffer() || undefined });
    const headers = Object.fromEntries([...res.headers].filter(([k]) => !/^(content-encoding|content-length|transfer-encoding)$/i.test(k)));
    await route.fulfill({ status: res.status, headers, body: Buffer.from(await res.arrayBuffer()) });
  } catch (e) { await route.abort(); }
}
const lctx = await browser.newContext();
await lctx.route(PROJ + '/**', relay);
const lpage = await lctx.newPage();
await lpage.goto(APP);
await lpage.waitForFunction(() => typeof showScreen === 'function', null, { timeout: 60000 });
await lpage.evaluate(() => showScreen('settings'));
await lpage.fill('#sbUrl', PROJ); await lpage.locator('#sbUrl').dispatchEvent('change');
await lpage.fill('#sbKey', 'sb_publishable_1c3t9uxaqIP2K4klSP7loA_bZYlgKfO'); await lpage.locator('#sbKey').dispatchEvent('change');
await tick(300);
await lpage.fill('#sbEmail', 'nobody@example.invalid'); await lpage.fill('#sbPass', 'definitely-wrong');
await lpage.click('#sbSignIn'); await tick(5000);
const lt = await lpage.locator('#toast').innerText();
ok(/do not match an account/.test(lt), 'real project answers a wrong password through the app, shown in plain words: ' + lt);
await lpage.fill('#sbKey', 'sb_publishable_wrongwrongwrong'); await lpage.locator('#sbKey').dispatchEvent('change'); await tick(300);
await lpage.fill('#sbEmail', 'nobody@example.invalid'); await lpage.fill('#sbPass', 'x');
await lpage.click('#sbSignIn'); await tick(5000);
const lt2 = await lpage.locator('#toast').innerText();
ok(/does not accept that key/.test(lt2), 'real project refuses a wrong key, shown in plain words: ' + lt2);
for (const d of [pc, ph]) ok(!d.errs.length, d.name + ': no page errors\n     ' + [...new Set(d.errs)].join('\n     '));
console.log(`\nPASS ${pass}  FAIL ${fail}`);
await browser.close(); srv.kill();
process.exit(fail ? 1 : 0);
