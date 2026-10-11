// A team of two against the REAL Supabase project, in real Chromium (v113).
// The throwaway test account is the admin of its own test team - never Ben's
// team, never Ben's account. It adds a colleague through the real team-admin
// function, the colleague joins from the set-up link, each reads the other's
// call, and the admin removes them. Credentials come from the environment and
// are never written to the repo:
//
//   FIELDCRM_TEST_EMAIL=... FIELDCRM_TEST_PASSWORD=... FIELDCRM_TEST_PASSPHRASE=... \
//   NODE_USE_ENV_PROXY=1 PW_ROOT=$(npm root -g) node tests/browser-team-live.mjs .
//
// Needs the test account to be the admin of a team (set up once, by hand).
// It leaves behind one banned colleague sign-in, named fieldcrm.colleague.*
// at example.com; delete those in the dashboard. Still not a phone test.
import { createRequire } from 'module';
import { spawn } from 'child_process';
const require = createRequire(process.env.PW_ROOT + '/');
const { chromium } = require('playwright');

const EMAIL = process.env.FIELDCRM_TEST_EMAIL, PASSWORD = process.env.FIELDCRM_TEST_PASSWORD;
const PH = process.env.FIELDCRM_TEST_PASSPHRASE;
if (!EMAIL || !PASSWORD || !PH) { console.log('set FIELDCRM_TEST_EMAIL, FIELDCRM_TEST_PASSWORD, FIELDCRM_TEST_PASSPHRASE'); process.exit(2); }
const ROOT = process.argv[2] || '.', PORT = 8125, APP = `http://localhost:${PORT}/`;
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
async function device(name, url) {
  const ctx = await browser.newContext();
  await ctx.route(PROJ + '/**', relay);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|cdn\.jsdelivr\.net|status of 4\d\d|WebSocket|realtime/i.test(m.text() + (m.location().url || ''))) errs.push(m.text()); });
  await page.goto(APP);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); await tick(800);
  if (url) { await page.goto('about:blank'); await page.goto(url); await tick(1500); }
  return { name, ctx, page, errs };
}
const ev = (d, f, a) => d.page.evaluate(f, a);
const open = (d, id) => d.page.evaluate(id => { if (screen !== 'settings') showScreen('settings'); const x = document.getElementById(id); if (x) x.open = true; }, id).catch(() => {});
const stat = async d => { await open(d, 'sxCloud'); return (await d.page.locator('#sbStat').innerText()).replace(/\n/g, ' | '); };
const toast = d => d.page.locator('#toast').innerText();
async function phrase(d, p) {
  await d.page.fill('#sbPh', p); await d.page.click('#sbPhGo');
  await until(async () => !(await d.page.locator('#sbPhGo').isDisabled()), 25000); await tick(300);
}
const syncNow = async d => { await open(d, 'sxCloud'); await d.page.click('#sbSync'); await until(async () => !(await d.page.locator('#sbSync').isDisabled()) && !/syncing/.test(await stat(d)), 30000); await tick(500); };
const stamp = Date.now();

// ---------------------------------------------------------------- the admin
console.log('Admin: sign in, unlock, a call');
const ad = await device('admin');
await open(ad, 'sxCloud');
await ad.page.fill('#sbUrl', PROJ); await ad.page.locator('#sbUrl').dispatchEvent('change');
await ad.page.fill('#sbKey', KEY); await ad.page.locator('#sbKey').dispatchEvent('change'); await tick(200);
await ad.page.fill('#sbEmail', EMAIL); await ad.page.fill('#sbPass', PASSWORD); await ad.page.click('#sbSignIn');
await until(async () => /Encryption: (locked on|unlocked)/.test(await stat(ad)));
await phrase(ad, PH);
const s0 = await stat(ad);
ok(/unlocked/.test(s0) && /Team: Field CRM test team/.test(s0) && /you are its admin/.test(s0), 'the test account is the admin of the test team: ' + s0);
await open(ad, 'sxTeam');
ok(await ad.page.locator('#tmAdd').isVisible(), 'Settings has Add a colleague');
await ev(ad, async stamp => {
  await callsPut({id: 'cLiveA' + stamp, customer: 'Test Account - Smithfield', date: '11/10/2026', type: 'Site call', contacts: [], loose: [],
    entries: [{type: 'note', text: 'Admin note ' + stamp}], closed: true, status: 'done', updated: Date.now()});
}, stamp);
await syncNow(ad);

// ---------------------------------------------------------------- add
console.log('Admin: add a colleague through the real function');
const CEMAIL = `fieldcrm.colleague.${stamp}@example.com`;
await open(ad, 'sxTeam');
await ad.page.click('#tmAdd');
await ad.page.fill('#tmName', 'Live Colleague');
await ad.page.fill('#tmEmail', CEMAIL);
const temp = await ad.page.inputValue('#tmPw');
await ad.page.click('#tmGo');
ok(await until(async () => await ad.page.locator('#tmDone').isVisible(), 20000), 'added: ' + await ad.page.locator('#tmMsg').innerText());
const msg = await ad.page.locator('#tmText').innerText();
ok(msg.includes(temp) && /#join=/.test(msg) && !msg.includes(PH), 'the message has the link and temporary password, not the passphrase');
await ad.page.click('#tmCancel'); await tick(300);
await open(ad, 'sxTeam');
ok(/Live Colleague/.test(await ad.page.locator('#tmList').innerText()), 'the colleague is listed');

// ---------------------------------------------------------------- the colleague
console.log('Colleague: open the set-up link on a new device');
const link = msg.match(/http\S+#join=\S+/)[0];
const co = await device('colleague', link);
ok(await ev(co, () => screen) === 'settings' && await co.page.inputValue('#sbEmail') === CEMAIL, 'the link opens Settings with the email filled in');
ok(await ev(co, () => SB.url) === PROJ, 'and the project address');
await co.page.fill('#sbPass', temp); await co.page.click('#sbSignIn');
await until(async () => /Encryption: (locked on|waiting)/.test(await stat(co)), 20000);
const c0 = await stat(co);
ok(/Team: Field CRM test team/.test(c0) && /admin Test admin/.test(c0) && /locked on this device/.test(c0), 'signed in as a member, asked for the team passphrase: ' + c0);
await phrase(co, PH);
ok(/unlocked/.test(await stat(co)), 'the team passphrase unlocks it');
await syncNow(co);
const got = await ev(co, id => recGet('calls', id), 'cLiveA' + stamp);
ok(got && got.entries[0].text === 'Admin note ' + stamp, 'the colleague reads the admin\'s call');
await ev(co, () => { go('reports'); });
await tick(500);
ok(await co.page.locator('#rpWho').isVisible(), 'Reports has Mine and Team');
await co.page.click('#rpWho [data-v="team"]'); await tick(500);
ok(/Test admin/.test(await co.page.locator('#rpRes').innerText()), 'the Team tab names the admin');
await co.page.click(`[data-rpt="cLiveA${stamp}"]`);
ok(await until(async () => /Admin note/.test(await co.page.locator('#rvFrame').getAttribute('srcdoc') || '')), 'and the call opens to read');
await co.page.click('#rvClose'); await tick(300);

// the colleague's own call reaches the admin
await ev(co, async stamp => {
  await callsPut({id: 'cLiveC' + stamp, customer: 'Test Account - Smithfield', date: '11/10/2026', type: 'Phone call', contacts: [], loose: [],
    entries: [{type: 'note', text: 'Colleague note ' + stamp}], closed: true, status: 'done', updated: Date.now()});
}, stamp);
await syncNow(co);
await syncNow(ad);
const back = await ev(ad, id => recGet('calls', id), 'cLiveC' + stamp);
ok(back && back.entries[0].text === 'Colleague note ' + stamp && await ev(ad, id => callAuthor({id}), 'cLiveC' + stamp) === 'Live Colleague', 'the admin reads the colleague\'s call, under their name');

// a member cannot add people
const tried = await ev(co, () => teamCall({action: 'add', name: 'X', email: 'x' + Date.now() + '@example.com', password: 'abcdefghijkl'}).then(() => 'added', e => e.message));
ok(/Only the team's admin/.test(tried), 'the real function refuses a member: ' + tried);

// the colleague's own password
await open(co, 'sxCloud');
await co.page.click('#sbPwOpen');
const own = 'colleague own ' + stamp;
await co.page.fill('#sbPwNew', own); await co.page.fill('#sbPwNew2', own); await co.page.click('#sbPwGo');
ok(await until(async () => /password changed/.test(await toast(co))), 'the colleague changes their sign-in password: ' + await toast(co));

// ---------------------------------------------------------------- remove
console.log('Admin: remove the colleague');
await open(ad, 'sxTeam');
ad.page.once('dialog', d => d.accept());
await ad.page.click('#tmList [data-tmmenu]');
await ad.page.click('#vmBody [data-cm="1"]');
ok(await until(async () => /removed/.test(await toast(ad)), 20000), 'removed: ' + await toast(ad));
ok(!/Live Colleague/.test(await ad.page.locator('#tmList').innerText()), 'and gone from the list');
const after = await ev(co, async () => { const r = await sbClient.from('records').select('id,owner').eq('store', 'calls'); return r.error ? r.error.message : r.data.filter(x => x.owner !== sbUser.id).length; });
ok(after === 0, 'the cloud gives the removed colleague nothing of the team\'s, even on a token still in hand: ' + after);
await open(co, 'sxCloud');
await co.page.click('#sbSignOut'); await tick(500);
await co.page.fill('#sbEmail', CEMAIL); await co.page.fill('#sbPass', own); await co.page.click('#sbSignIn');
await tick(3000);
ok(!/Signed in as/.test(await stat(co)) && /switched off/.test(await toast(co)), 'and they cannot sign in again: ' + await toast(co));
const kept = await ev(ad, async id => { const r = await sbClient.from('records').select('id').eq('id', id); return r.data && r.data.length; }, 'cLiveC' + stamp);
ok(kept === 1, 'what they wrote stays with the team');

ok(!ad.errs.length, 'admin: no page errors ' + ad.errs.slice(0, 3).join(' | '));
ok(!co.errs.length, 'colleague: no page errors ' + co.errs.slice(0, 3).join(' | '));
console.log(`\nPASS ${pass}  FAIL ${fail}`);
await browser.close(); srv.kill();
process.exit(fail ? 1 : 0);
