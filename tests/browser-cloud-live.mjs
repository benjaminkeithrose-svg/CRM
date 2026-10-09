// Cloud sync against the REAL Supabase project, in real Chromium, two browser
// profiles as phone and PC. Needs a throwaway test account in the project -
// never Ben's own - passed in the environment, never written to the repo:
//
//   FIELDCRM_TEST_EMAIL=... FIELDCRM_TEST_PASSWORD=... FIELDCRM_TEST_PASSPHRASE=... \
//   NODE_USE_ENV_PROXY=1 PW_ROOT=$(npm root -g) node tests/browser-cloud-live.mjs .
//
// The browser cannot use this environment's proxy, so the script relays the
// app's Supabase requests through Node; the app's own code makes every call.
// Test data is invented. Deleting the test user in the dashboard deletes its
// vault and records with it. Still not a phone test.
import { createRequire } from 'module';
import { spawn } from 'child_process';
const require = createRequire(process.env.PW_ROOT + '/');
const { chromium } = require('playwright');

const EMAIL = process.env.FIELDCRM_TEST_EMAIL, PASSWORD = process.env.FIELDCRM_TEST_PASSWORD;
const PH = process.env.FIELDCRM_TEST_PASSPHRASE;
if (!EMAIL || !PASSWORD || !PH) { console.log('set FIELDCRM_TEST_EMAIL, FIELDCRM_TEST_PASSWORD, FIELDCRM_TEST_PASSPHRASE'); process.exit(2); }
const ROOT = process.argv[2] || '.', PORT = 8124, APP = `http://localhost:${PORT}/`;
const PROJ = 'https://ksuwpjezkumyualdbfmn.supabase.co';
const KEY = 'sb_publishable_1c3t9uxaqIP2K4klSP7loA_bZYlgKfO';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok ' + m); } else { fail++; console.log('  x  ' + m); } };
const tick = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await f()) return true; await tick(300); } return false; };

const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
await tick(800);

async function relay(route) {
  const r = route.request();
  try {
    const res = await fetch(r.url(), { method: r.method(), headers: r.headers(), body: r.postDataBuffer() || undefined });
    const headers = Object.fromEntries([...res.headers].filter(([k]) => !/^(content-encoding|content-length|transfer-encoding)$/i.test(k)));
    await route.fulfill({ status: res.status, headers, body: Buffer.from(await res.arrayBuffer()) });
  } catch (e) { await route.abort(); }
}
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
async function device(name) {
  const ctx = await browser.newContext();
  await ctx.route(PROJ + '/**', relay);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|cdn\.jsdelivr\.net|status of 4\d\d/.test(m.text() + (m.location().url || ''))) errs.push(m.text()); });
  await page.goto(APP);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); await tick(800);
  return { name, ctx, page, errs };
}
const ev = (d, f, a) => d.page.evaluate(f, a);
const stat = async d => (await d.page.locator('#sbStat').innerText()).replace(/\n/g, ' | ');
const toast = d => d.page.locator('#toast').innerText();
async function signIn(d) {
  await ev(d, () => showScreen('settings'));
  await d.page.fill('#sbUrl', PROJ); await d.page.locator('#sbUrl').dispatchEvent('change');
  await d.page.fill('#sbKey', KEY); await d.page.locator('#sbKey').dispatchEvent('change');
  await tick(200);
  await d.page.fill('#sbEmail', EMAIL); await d.page.fill('#sbPass', PASSWORD);
  await d.page.click('#sbSignIn');
  await until(async () => /Encryption: (no passphrase|locked on|unlocked)/.test(await stat(d)));
}
async function phrase(d, p1, p2) {
  await d.page.fill('#sbPh', p1); if (p2 != null) await d.page.fill('#sbPh2', p2);
  await d.page.click('#sbPhGo');
  await until(async () => !(await d.page.locator('#sbPhGo').isDisabled()), 20000);
  await tick(300);
}
const cloudRows = d => ev(d, async () => {
  const r = await sbClient.from('records').select('id,client_updated,body').eq('store', 'datasets');
  return r.error ? { error: r.error.message } : r.data.map(x => ({ id: x.id, v: Number(x.client_updated), body: x.body }));
});
const seedCrm = (d, when, name) => ev(d, async ([when, name]) => {
  const list = [{a: name, sub: 'Testville', z: 'Z1', tier: 'A', foc: 'High', cad: CAD['High'], seg: '', team: '', mgr: 'Test Manager', rep: '',
    last: null, lastAppt: null, idle: null, c: [{n: 'Test Contact', r: 'Engineer', t: '', p: '0400 000 000', pk: 'ok', e: ['contact@test.invalid']}]}];
  await accReplaceAll(list);
  const meta = {imported: when, source: 'test-export.xlsx', rows: 1, counts: {accounts: 1, contacts: 1}, managers: ['Test Manager'], reps: []};
  await kvSet('meta', meta); META = meta; indexAccounts(list); renderDbStat();
}, [when, name]);
const syncNow = async d => { await d.page.click('#sbSync'); await until(async () => !(await d.page.locator('#sbSync').isDisabled()) && !/syncing/.test(await stat(d))); await tick(300); };

// ---------------------------------------------------------------- PC
console.log('PC: real sign-in and passphrase');
const pc = await device('pc');
await signIn(pc);
const s0 = await stat(pc);
ok(/Signed in as/.test(s0) && s0.includes(EMAIL), 'signed in to the real project: ' + s0);
if (/no passphrase set yet/.test(s0)) {
  await phrase(pc, 'short', 'short');
  ok(/at least 12/.test(await toast(pc)), 'short passphrase refused');
  await phrase(pc, PH, PH);
  ok(/Passphrase set/.test(await toast(pc)), 'passphrase set; locked key stored in the real vaults table');
} else {
  console.log('  (vault already exists from an earlier run - unlocking instead)');
  await phrase(pc, PH);
}
ok(/unlocked on this device/.test(await stat(pc)), 'PC unlocked: ' + await stat(pc));
const vault = await ev(pc, async () => { const r = await sbClient.from('vaults').select('key_id,kdf,wrapped_key'); return r.data; });
ok(vault && vault.length === 1 && vault[0].kdf.iterations === 600000 && !JSON.stringify(vault).includes(PH), 'one vault row, 600,000 rounds, no passphrase in it');

// recent times, so a rerun's imports are newer than the last run's (the cloud keeps the newest)
const base = Date.now() - 120e3;
await seedCrm(pc, base, 'Test Account - Smithfield');
await ev(pc, async () => { MGR_OF = {'Test Account - Smithfield': 'Test Manager 2'}; await saveMgrOf(); });
ok(await until(async () => { const r = await cloudRows(pc); return Array.isArray(r) && r.some(x => x.id === 'crm' && x.v === base) && r.some(x => x.id === 'mgrOf'); }, 20000),
  'CRM accounts and reassignment sent automatically to the real project');
const rows = await cloudRows(pc);
ok(Array.isArray(rows) && rows.every(x => !/Test Account|Test Contact|test\.invalid/.test(Buffer.from(x.body, 'base64').toString('latin1'))), 'what the real database holds is unreadable');
ok(!/waiting to send/.test(await stat(pc)), 'PC in step: ' + await stat(pc));

// ---------------------------------------------------------------- phone
console.log('Phone: real sign-in, wrong then right passphrase, data arrives');
const ph = await device('phone');
await signIn(ph);
ok(/locked on this device/.test(await stat(ph)), 'phone locked: ' + await stat(ph));
await phrase(ph, 'definitely not the passphrase');
ok(/does not match/.test(await toast(ph)), 'wrong passphrase refused against the real vault: ' + await toast(ph));
await phrase(ph, PH);
ok(/unlocked on this device/.test(await stat(ph)), 'phone unlocked');
ok(await until(() => ev(ph, () => ACCOUNTS.length === 1 && ACCOUNTS[0].a === 'Test Account - Smithfield')), 'phone has the PC\'s accounts without importing');
ok(await ev(ph, () => MGR_OF['Test Account - Smithfield'] === 'Test Manager 2'), 'phone has the reassignment');

// ---------------------------------------------------------------- later changes and newest-wins on the real server
console.log('Later changes, and the real server\'s newest-wins rule');
const newer = Date.now() - 60e3;
await seedCrm(pc, newer, 'Test Account - Wetherill Park');
await until(async () => (await cloudRows(pc)).some?.(x => x.id === 'crm' && x.v === newer), 15000);
await syncNow(ph);
ok(await ev(ph, () => ACCOUNTS[0].a) === 'Test Account - Wetherill Park', 'phone brings in a newer import on Sync now');
// an older copy written straight at the server must be ignored by records_before_write
const older = await ev(ph, async (older) => {
  const sealed = await sbSeal('datasets', 'crm', {accounts: [], meta: null});
  const r = await sbClient.from('records').upsert(Object.assign({owner: sbUser.id, store: 'datasets', id: 'crm', client_updated: older, deleted: false}, sealed), {onConflict: 'owner,store,id'});
  const q = await sbClient.from('records').select('client_updated').eq('store', 'datasets').eq('id', 'crm');
  return {err: r.error && r.error.message, v: Number(q.data[0].client_updated)};
}, base - 1000);
ok(!older.err && older.v === newer, 'the real server keeps the newer copy when an older one is sent: ' + JSON.stringify(older));
await seedCrm(pc, base - 5000, 'Test Account - Old Backup');
await tick(5000);
await syncNow(pc);
ok(await ev(pc, () => ACCOUNTS[0].a) === 'Test Account - Wetherill Park', 'an older import on the PC is replaced by the newer cloud copy');

// ---------------------------------------------------------------- reopen, offline
console.log('Reopen and offline');
await ph.page.reload(); await tick(1500); await ev(ph, () => showScreen('settings'));
ok(/unlocked on this device/.test(await stat(ph)), 'phone still signed in and unlocked after reopening');
await ph.ctx.setOffline(true);
await ph.page.reload(); await tick(1500); await ev(ph, () => showScreen('settings'));
ok(/offline/.test(await stat(ph)), 'offline: app loads from cache and says so');
await ev(ph, async () => { WEEKS['2026-10-12'] = {zone: 'Z3'}; await saveWeeks(); });
await tick(4000);
ok(/waiting to send/.test(await stat(ph)), 'offline change waits');
await ph.ctx.setOffline(false);
await ev(ph, () => window.dispatchEvent(new Event('online')));
ok(await until(async () => (await cloudRows(ph)).some?.(x => x.id === 'weeks')), 'back online: sent to the real project');
await syncNow(pc);
ok(await ev(pc, () => WEEKS['2026-10-12'] && WEEKS['2026-10-12'].zone) === 'Z3', 'PC brings in the phone\'s change');

// ---------------------------------------------------------------- calls and photos (Step 5)
console.log('Calls with real photos, real storage');
const callId = 'live-' + Date.now();
const made = await ev(ph, async (callId) => {
  const shot = n => new Promise(res => { const c = document.createElement('canvas'); c.width = 1400; c.height = 1050;
    const g = c.getContext('2d'); g.fillStyle = ['#00287B', '#B2232F', '#4D4D4F'][n]; g.fillRect(0, 0, 1400, 1050);
    g.fillStyle = '#fff'; g.font = '120px sans-serif'; g.fillText('Test photo ' + n, 200, 500); c.toBlob(res, 'image/jpeg', 0.72); });
  const photos = [await shot(0), await shot(1)], loose = [await shot(2)];
  await callsPut({id: callId, customer: 'Test Account - Wetherill Park', date: '09/10/2026', type: 'Site call', mgr: 'Test Manager', site: '',
    contacts: [{name: 'Test Contact', crm: true}], status: 'open', closed: false, updated: Date.now(),
    entries: [{kind: 'belt', asset: 'Test line', notes: 'Test notes', photos}], loose});
  const sizes = [...photos, ...loose].map(b => b.size);
  return sizes;
}, callId);
await syncNow(ph);
const listed = await ev(ph, async (id) => (await cloudPhotoList(id)).size, callId);
ok(listed === 3, 'three photos stored in the real bucket: ' + listed);
await syncNow(pc);
const got = await ev(pc, async (id) => { const c = await recGet('calls', id); if (!c) return null;
  return [...c.entries[0].photos, ...c.loose].map(b => b.size); }, callId);
ok(JSON.stringify(got) === JSON.stringify(made), 'PC has the call with every photo at full size: ' + JSON.stringify(got) + ' vs ' + JSON.stringify(made));
const raw = await ev(pc, async (id) => { const r = await sbClient.storage.from('photos').download(cloudPhotoDir(id) + '/' + [...await cloudPhotoList(id)][0]);
  const b = new Uint8Array(await r.data.arrayBuffer()); return [b[0], b[1]]; }, callId);
ok(!(raw[0] === 0xFF && raw[1] === 0xD8), 'the stored file is not a readable JPEG');
const other = await ev(pc, async () => { const r = await sbClient.storage.from('photos').list('00000000-0000-0000-0000-000000000000', {limit: 10}); return r.error ? 'error' : r.data.length; });
ok(other === 0 || other === 'error', 'another user\'s photo folder shows nothing');
await ev(ph, async (id) => { await callsDel(id); }, callId);
await syncNow(ph);
ok(await ev(ph, async (id) => (await cloudPhotoList(id)).size, callId) === 0, 'deleting the call removes its photos from the bucket');
await syncNow(pc);
ok(!(await ev(pc, (id) => recGet('calls', id), callId)), 'and the call is gone from the PC');

// ---------------------------------------------------------------- sign out
await ph.page.click('#sbSignOut'); await tick(1000);
ok(/Not signed in/.test(await stat(ph)) && !(await ev(ph, () => kvGet('cloudKey'))), 'sign out: signed out and the key forgotten');
const denied = await ev(ph, async () => { const r = await sbClient.from('records').select('id'); return r.error ? r.error.code : 'rows:' + r.data.length; });
ok(denied !== 'rows:' + 4 && !/rows:[1-9]/.test(denied), 'signed out, the real project shows no records: ' + denied);

for (const d of [pc, ph]) ok(!d.errs.length, d.name + ': no page errors ' + d.errs.slice(0, 3).join(' | '));
console.log(`\nPASS ${pass}  FAIL ${fail}`);
await browser.close(); srv.kill();
process.exit(fail ? 1 : 0);
