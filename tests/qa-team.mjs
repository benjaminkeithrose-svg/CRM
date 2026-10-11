// v111: a team. Ben (the admin) and a colleague share one team's data; an
// outsider in no team sees nothing of it. The stand-in server below plays the
// access rules of migration 0004 (who may read and write which rows, photos
// in the author's folder, the admin's vault readable by members, a teammate's
// delete skipped). The real library, Web Crypto and the app run unchanged, so
// this proves the app keeps to those rules and that a teammate can open what
// Ben's key sealed - not that the real project enforces them. That is the live
// two-person test, against Supabase itself.
import { JSDOM } from 'jsdom';
import fs from 'fs';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  x ' + m); } };
const tick = (ms = 50) => new Promise(r => setTimeout(r, ms));

const LIB = fs.readdirSync('.').find(f => /^supabase-[\d.]+\.js$/.test(f));
const html = fs.readFileSync('index.html', 'utf8');
const REF = 'abcdefghijklmnopqrst';
const b64u = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = p => b64u({ alg: 'HS256', typ: 'JWT' }) + '.' + b64u(p) + '.sig';
const now = () => Math.floor(Date.now() / 1000);

const U = {
  ben:  { id: 'aaaaaaaa-0000-0000-0000-000000000001', email: 'ben@example.com', pw: 'ben-pass' },
  jo:   { id: 'bbbbbbbb-0000-0000-0000-000000000002', email: 'jo@example.com', pw: 'jo-pass' },
  sam:  { id: 'cccccccc-0000-0000-0000-000000000003', email: 'sam@example.com', pw: 'sam-pass' }   // in no team
};
const byEmail = e => Object.values(U).find(u => u.email === e);
const byId = id => Object.values(U).find(u => u.id === id);
const TEAM_ID = 'tttttttt-0000-0000-0000-000000000009';
const TEAMS = { [TEAM_ID]: { id: TEAM_ID, name: 'ANZ field sales', admin: U.ben.id } };
const MEMBERS = { [U.ben.id]: { team_id: TEAM_ID, name: 'Ben', role: 'admin' }, [U.jo.id]: { team_id: TEAM_ID, name: 'Jo', role: 'member' } };
const teamOf = uid => MEMBERS[uid] ? MEMBERS[uid].team_id : null;
const sameTeam = (a, b) => !!teamOf(a) && teamOf(a) === teamOf(b);
const adminOf = uid => teamOf(uid) ? TEAMS[teamOf(uid)].admin : null;
const SHARED = new Set(['calls', 'appts', 'plans', 'products', 'snippets']);

const VAULTS = {}, RECORDS = {}, STORAGE = {};
const refusals = [];
let clock = 0;
// migration 0004's rules, played here
const canRead = (row, sub) => row.owner === sub || (sameTeam(row.owner, sub) &&
  (SHARED.has(row.store) || (row.store === 'datasets' && row.id !== 'weeks' && row.owner === adminOf(sub))));
const canWrite = (row, sub) => (row.owner === sub && (row.store !== 'datasets' || row.id === 'weeks' || !teamOf(sub) || adminOf(sub) === sub))
  || (SHARED.has(row.store) && sameTeam(row.owner, sub));
const canFolder = (folder, sub) => folder === sub || sameTeam(folder, sub);
const subOf = (w, opts) => {
  const tok = (new w.Headers(opts.headers || {}).get('authorization') || '').replace(/^Bearer /, '');
  try { return JSON.parse(Buffer.from(tok.split('.')[1], 'base64url').toString()).sub || null; } catch (e) { return null; }
};

function fakeFetch(w) {
  return async (url, opts = {}) => {
    const u = String(url), m = opts.method || 'GET';
    const res = (status, body) => new w.Response(body == null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    if (!u.startsWith('https://' + REF + '.supabase.co/')) return res(404, {});
    if (u.includes('/auth/v1/token?grant_type=password')) {
      const b = JSON.parse(opts.body), x = byEmail(b.email);
      if (!x || x.pw !== b.password) return res(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
      const user = { id: x.id, email: x.email, aud: 'authenticated', role: 'authenticated' };
      return res(200, { access_token: jwt({ sub: x.id, email: x.email, role: 'authenticated', exp: now() + 3600 }), token_type: 'bearer',
        expires_in: 3600, expires_at: now() + 3600, refresh_token: 'r-' + x.id, user });
    }
    if (u.includes('/auth/v1/logout')) return new w.Response(null, { status: 204 });
    const sub = subOf(w, opts);
    if (u.includes('/auth/v1/user')) { const x = byId(sub); return res(200, { id: x.id, email: x.email, aud: 'authenticated', role: 'authenticated' }); }
    const q = new URL(u).searchParams;
    const eqv = k => q.get(k) ? q.get(k).replace(/^eq\./, '') : null;
    const inList = v => v.replace(/^in\.\(|\)$/g, '').split(',').map(x => x.replace(/^"|"$/g, ''));
    const pick = (rows) => { const cols = (q.get('select') || '*').split(','); return rows.map(r => cols[0] === '*' ? r : Object.fromEntries(cols.map(c => [c, r[c]]))); };
    if (u.includes('/rest/v1/team_members')) {
      if (!sub) return res(401, {});
      return res(200, pick(Object.entries(MEMBERS).filter(([id, x]) => x.team_id === teamOf(sub)).map(([id, x]) => Object.assign({ user_id: id }, x))));
    }
    if (u.includes('/rest/v1/teams')) {
      if (!sub) return res(401, {});
      return res(200, pick(Object.values(TEAMS).filter(t => t.id === teamOf(sub) && (!eqv('id') || t.id === eqv('id')))));
    }
    if (u.includes('/rest/v1/vaults')) {
      if (!sub) return res(401, {});
      if (m === 'GET') return res(200, pick(Object.values(VAULTS).filter(v => v.owner === sub || v.owner === adminOf(sub)).filter(v => !eqv('owner') || v.owner === eqv('owner'))));
      if (m === 'POST') {
        if (VAULTS[sub]) return res(409, { code: '23505', message: 'duplicate key value violates unique constraint "vaults_pkey"' });
        const b = JSON.parse(opts.body); VAULTS[sub] = Object.assign({ owner: sub }, Array.isArray(b) ? b[0] : b);
        return new w.Response(null, { status: 201 });
      }
      if (m === 'PATCH') {
        if (eqv('owner') !== sub || !VAULTS[sub]) return res(200, []);
        Object.assign(VAULTS[sub], JSON.parse(opts.body)); return new w.Response(null, { status: 204 });
      }
      return res(405, {});
    }
    if (u.includes('/rest/v1/records')) {
      if (!sub) return res(401, { code: '42501', message: 'permission denied for table records' });
      if (m === 'GET') {
        const st = q.get('store') || '';
        const stores = st.startsWith('in.') ? inList(st) : st ? [st.replace(/^eq\./, '')] : null;
        const ids = q.get('id') ? (q.get('id').startsWith('in.') ? inList(q.get('id')) : [eqv('id')]) : null;
        const own = eqv('owner');
        const gt = q.get('server_updated') ? q.get('server_updated').replace(/^gt\./, '') : null;
        let rows = Object.values(RECORDS).filter(r => canRead(r, sub) && (!stores || stores.includes(r.store)) && (!ids || ids.includes(r.id))
          && (!own || r.owner === own) && (!gt || Date.parse(r.server_updated) > Date.parse(gt)));
        if (q.get('order')) rows.sort((a, b) => a.server_updated.localeCompare(b.server_updated) || a.store.localeCompare(b.store) || a.id.localeCompare(b.id));
        const off = Number(q.get('offset') || 0), lim = q.get('limit') ? Number(q.get('limit')) : rows.length;
        return res(200, pick(rows.slice(off, off + lim)));
      }
      if (m === 'POST') {
        const b = JSON.parse(opts.body), list = Array.isArray(b) ? b : [b], written = [];
        for (const row0 of list) {
          const row = Object.assign({}, row0, { owner: row0.owner || sub });
          if (!canWrite(row, sub)) { refusals.push(row.store + '/' + row.id); return res(403, { code: '42501', message: 'new row violates row-level security policy for table "records"' }); }
          const k = row.owner + '|' + row.store + '|' + row.id, old = RECORDS[k];
          if (old && Number(row.client_updated) < Number(old.client_updated)) continue;
          if (old && row.deleted && !old.deleted && old.owner !== sub && adminOf(old.owner) !== sub) continue;   // not theirs to delete
          RECORDS[k] = Object.assign({}, row, { team_id: teamOf(row.owner), server_updated: new Date(Date.UTC(2026, 9, 11) + (++clock) * 1000).toISOString() });
          written.push(RECORDS[k]);
        }
        if (/return=representation/.test(new w.Headers(opts.headers || {}).get('prefer') || '')) return res(201, pick(written));
        return new w.Response(null, { status: 201 });
      }
      return res(405, {});
    }
    if (u.includes('/storage/v1/object')) {
      if (!sub) return res(400, { statusCode: '403', error: 'Unauthorized', message: 'no token' });
      const path = decodeURIComponent(u.split('/storage/v1/object/')[1].split('?')[0]);
      if (path.startsWith('list/photos')) {
        const prefix = JSON.parse(opts.body).prefix.replace(/\/$/, '') + '/';
        if (!canFolder(prefix.split('/')[0], sub)) return res(200, []);
        return res(200, Object.keys(STORAGE).filter(k => k.startsWith(prefix)).map(k => ({ name: k.slice(prefix.length) })));
      }
      if (m === 'DELETE') {
        const gone = JSON.parse(opts.body).prefixes.filter(p => canFolder(p.split('/')[0], sub));
        gone.forEach(p => delete STORAGE[p]);
        return res(200, gone.map(name => ({ name })));
      }
      const key = path.replace(/^photos\//, '');
      if (!canFolder(key.split('/')[0], sub)) return res(400, { statusCode: '403', error: 'Unauthorized', message: 'row-level security' });
      if (m === 'POST') { STORAGE[key] = Buffer.from(opts.body); return res(200, { Key: 'photos/' + key, Id: key }); }
      if (!STORAGE[key]) return res(400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
      return new w.Response(STORAGE[key], { status: 200, headers: { 'content-type': 'application/octet-stream' } });
    }
    return res(404, {});
  };
}

async function boot() {
  const errs = [];
  const dom = new JSDOM(html.replace(/<script[^>]*src=[^>]*><\/script>/g, ''), { runScripts: 'dangerously', url: 'https://example.org/' });
  const w = dom.window, d = w.document;
  w.indexedDB = new IDBFactory(); w.IDBKeyRange = IDBKeyRange;
  Object.defineProperty(w, 'crypto', { value: globalThis.crypto, configurable: true });
  w.scrollTo = () => {}; w.alert = () => {}; w.confirm = () => true;
  w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  w.navigator.storage = { persist: async () => true, persisted: async () => true };
  w.URL.createObjectURL = () => 'blob:stub'; w.URL.revokeObjectURL = () => {};
  if (!w.HTMLElement.prototype.showModal) w.HTMLElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  if (!w.HTMLElement.prototype.close) w.HTMLElement.prototype.close = function () { this.removeAttribute('open'); };
  w.HTMLCanvasElement.prototype.getContext = () => null;
  w.console.error = (...a) => errs.push(a.join(' ')); w.console.warn = () => {};
  w.Response = Response; w.Headers = Headers; w.Request = Request;
  w.CompressionStream = CompressionStream; w.DecompressionStream = DecompressionStream;
  w.Blob = Blob;
  w.fetch = fakeFetch(w);

  for (const f of ['zones.js', 'manuals.js', 'healthlib.js', LIB, 'app.js']) {
    const el = d.createElement('script'); el.textContent = fs.readFileSync(f, 'utf8'); d.body.appendChild(el);
  }
  d.dispatchEvent(new w.Event('DOMContentLoaded'));
  await tick(500);
  return { w, d, errs, $: id => d.getElementById(id), g: e => w.eval('(' + e + ')'), stat: () => d.getElementById('sbStat').textContent };
}
async function signIn(x, who) {
  const set = async (id, v) => { const f = x.$(id); f.value = v; f.dispatchEvent(new x.w.Event('change')); await tick(100); };
  await set('sbUrl', REF); await set('sbKey', 'sb_publishable_test');
  x.$('sbEmail').value = who.email; x.$('sbPass').value = who.pw;
  x.$('sbSignIn').click(); await tick(600);
  x.w.eval('if(sbClient) sbClient.channel = undefined');   // no live updates in this test
}
const phrase = async (x, p1, p2) => { x.$('sbPh').value = p1; x.$('sbPh2').value = p2 == null ? '' : p2; x.$('sbPhGo').click(); await tick(1800); };
const sync = async x => { await x.g('cloudSync().catch(e => window.__syncErr = e.message)'); await tick(150); };

// ================= Ben, the admin: as before, plus the team =================
const ben = await boot();
await signIn(ben, U.ben);
ok(/Team: ANZ field sales/.test(ben.stat()) && /you are its admin/.test(ben.stat()) && /2 people/.test(ben.stat()), 'Ben sees his team: ' + ben.stat());
ok(ben.g('iAmAdmin()') && !ben.g('isMember()'), 'Ben is the admin');
await phrase(ben, 'ben personal passphrase', 'ben personal passphrase');
ok(ben.g('sbVault') === 'open' && VAULTS[U.ben.id], 'Ben sets his passphrase as before');
ok(!ben.$('sbChgOpen').hidden, 'the admin can change the passphrase');

// the team passphrase: Ben changes his to one he can give out
ben.$('sbChgOpen').click(); await tick();
ben.$('sbChgOld').value = 'wrong one here'; ben.$('sbChgNew').value = 'team passphrase 2026'; ben.$('sbChgNew2').value = 'team passphrase 2026';
ben.$('sbChgGo').click(); await tick(2500);
ok(/not the current passphrase/.test(ben.$('toast').textContent), 'a wrong current passphrase is refused');
const before = VAULTS[U.ben.id].wrapped_key;
ben.$('sbChgOld').value = 'ben personal passphrase'; ben.$('sbChgNew').value = 'team passphrase 2026'; ben.$('sbChgNew2').value = 'team passphrase 2026';
ben.$('sbChgGo').click(); await tick(3500);
ok(/Passphrase changed/.test(ben.$('toast').textContent) && VAULTS[U.ben.id].wrapped_key !== before && ben.$('sbChg').hidden, 'changed: the key is locked again with the team passphrase');
ok(ben.g('sbVault') === 'open', 'Ben\'s device carries on unlocked');

// Ben's data: the CRM export, a call with a photo, a visit, a task, a plan
await ben.g(`(async () => {
  const list = [{a: 'Acme Foods', sub: 'Dandenong', z: 'Z1', foc: 'High', cad: CAD['High'], mgr: 'Ben', rep: '', c: [{n: 'Sam Lee', r: 'Maintenance', t: '', p: '', pk: '', e: []}]}];
  await accReplaceAll(list); indexAccounts(list);
  await kvSet('meta', {imported: Date.now(), counts: {accounts: 1}});
  await callsPut({id: 'cBen1', customer: 'Acme Foods', date: '10/10/2026', type: 'Site call', contacts: [], loose: [new Blob(['photo-bytes-1'], {type: 'image/jpeg'})],
    entries: [{type: 'note', text: 'Line 2 belt stretched'}], closed: true, status: 'done', updated: 1000});
  await apptsPut({id: 'apBen1', acct: 'Acme Foods', date: '2026-10-20', start: '09:00', dur: 60, type: 'Site call', touchedAt: 1000, status: 'planned'});
  await tasksPut({id: 'tBen1', title: 'Ben private task', date: '2026-10-12', start: '10:00', done: false, updated: 1000});
  await plansPut({id: 'plBen1', acct: 'Acme Foods', goal: 'Win Line 2', people: [], flags: '', strengths: '', updated: 1000});
})()`);
await sync(ben);
ok(!ben.g('window.__syncErr'), 'Ben syncs: ' + ben.g('window.__syncErr'));
const benRow = RECORDS[U.ben.id + '|calls|cBen1'];
ok(benRow && benRow.team_id === TEAM_ID && !/Line 2/.test(Buffer.from(benRow.body, 'base64').toString('latin1')), 'Ben\'s call is in the cloud, in his team, unreadable');
ok(RECORDS[U.ben.id + '|datasets|crm'] && Object.keys(STORAGE).some(k => k.startsWith(U.ben.id + '/cBen1/')), 'his CRM export and photo too');

// ================= Jo, a member =================
const jo = await boot();
await signIn(jo, U.jo);
ok(/Team: ANZ field sales/.test(jo.stat()) && /admin Ben/.test(jo.stat()), 'Jo sees the team and its admin: ' + jo.stat());
ok(jo.g('isMember()') && jo.g('sbVault') === 'locked', 'Jo is asked to unlock, not to set a passphrase of her own');
ok(/team passphrase Ben gave you/.test(jo.$('sbPhHint').textContent) && jo.$('sbPh2Wrap').hidden, 'in words that say whose: ' + jo.$('sbPhHint').textContent);
await phrase(jo, 'ben personal passphrase');
ok(jo.g('sbVault') === 'locked' && !VAULTS[U.jo.id], 'Ben\'s old passphrase no longer opens it, and Jo gets no vault of her own');
await phrase(jo, 'team passphrase 2026');
ok(jo.g('sbVault') === 'open' && !VAULTS[U.jo.id], 'the team passphrase unlocks Jo\'s device with the team key');
ok(jo.$('sbChgOpen').hidden, 'a member cannot change the team passphrase');
await sync(jo);
ok(!jo.g('window.__syncErr'), 'Jo syncs: ' + jo.g('window.__syncErr'));
ok(jo.g('ACCOUNTS.length') === 1 && jo.g('ACCOUNTS[0].a') === 'Acme Foods', 'Jo receives the team\'s CRM export');
const joCall = await jo.g(`recGet('calls', 'cBen1')`);
ok(joCall && joCall.entries[0].text === 'Line 2 belt stretched', 'Jo can open Ben\'s call, sealed by Ben\'s device');
ok(joCall && joCall.loose.length === 1 && await jo.g(`(async () => (await recGet('calls', 'cBen1')).loose[0].text())()`) === 'photo-bytes-1', 'and its photo, from Ben\'s folder');
ok(await jo.g(`recGet('appts', 'apBen1')`) && await jo.g(`recGet('plans', 'plBen1')`), 'and his visits and account plans');
ok(!(await jo.g(`recGet('tasks', 'tBen1')`)), 'but not his tasks: they are private');
ok(jo.g(`recOwner('calls', 'cBen1')`) === U.ben.id && jo.g(`recOwner('tasks', 'anything')`) === U.jo.id, 'Jo\'s device knows the call is Ben\'s');

// Jo edits Ben's call: it stays Ben's, and Ben gets the change
await jo.g(`(async () => { const c = await recGet('calls', 'cBen1'); c.entries.push({type: 'note', text: 'Jo added this'}); c.loose.push(new Blob(['photo-bytes-2'], {type: 'image/jpeg'})); c.updated = 2000; await callsPut(c); })()`);
await sync(jo);
ok(!jo.g('window.__syncErr'), 'Jo\'s edit goes up: ' + jo.g('window.__syncErr'));
ok(!RECORDS[U.jo.id + '|calls|cBen1'] && Number(RECORDS[U.ben.id + '|calls|cBen1'].client_updated) === 2000, 'as Ben\'s call, not a copy of Jo\'s');
ok(Object.keys(STORAGE).filter(k => k.startsWith(U.ben.id + '/cBen1/')).length === 2, 'her photo goes in Ben\'s folder for that call');
await sync(ben);
const benCall = await ben.g(`recGet('calls', 'cBen1')`);
ok(benCall && benCall.entries.length === 2 && benCall.entries[1].text === 'Jo added this' && benCall.loose.length === 2, 'Ben gets Jo\'s change, photo and all');
ok(!ben.g(`OWNERS['calls/cBen1']`), 'and it is still his own on his device');

// Jo's own call: Ben reads it; Jo's task stays hers
await jo.g(`(async () => {
  await callsPut({id: 'cJo1', customer: 'Acme Foods', date: '11/10/2026', type: 'Phone', contacts: [], loose: [], entries: [{type: 'note', text: 'Jo rang Sam'}], closed: true, status: 'done', updated: 3000});
  await tasksPut({id: 'tJo1', title: 'Jo private task', date: '2026-10-12', start: '11:00', done: false, updated: 3000});
})()`);
await sync(jo); await sync(ben);
ok((await ben.g(`recGet('calls', 'cJo1')`)).entries[0].text === 'Jo rang Sam' && ben.g(`recOwner('calls', 'cJo1')`) === U.jo.id, 'Ben reads Jo\'s call, and knows it is hers');
ok(!(await ben.g(`recGet('tasks', 'tJo1')`)), 'Jo\'s task stays hers');

// the team's reference data is Ben's to change
await jo.g(`(async () => { const list = [{a: 'Jo Import', sub: '', z: 'Z1', foc: 'High', cad: CAD['High'], mgr: 'Jo', rep: '', c: []}]; await accReplaceAll(list); indexAccounts(list); await kvSet('meta', {imported: Date.now() + 99999, counts: {accounts: 1}}); })()`);
refusals.length = 0;
await sync(jo);
ok(!jo.g('window.__syncErr') && !refusals.length && Number(RECORDS[U.ben.id + '|datasets|crm'].client_updated) < Date.now(), 'a member\'s own import is never sent over the team\'s');
ok(!/waiting to send/.test(jo.stat()), 'and is not shown as waiting to send: ' + jo.stat());
await jo.g(`(async () => { WEEKS = {'2026-10-12': 'Melbourne'}; await kvSet('weeks', WEEKS); })()`);
await sync(jo);
ok(RECORDS[U.jo.id + '|datasets|weeks'], 'but her own planning weeks are hers to send');
await sync(ben);
ok(!ben.g(`WEEKS && WEEKS['2026-10-12']`), 'and do not land in Ben\'s');

// a teammate's delete is skipped by the server, and the record comes back
await jo.g(`callsDel('cBen1')`);
await sync(jo);
ok(RECORDS[U.ben.id + '|calls|cBen1'] && !RECORDS[U.ben.id + '|calls|cBen1'].deleted, 'Jo cannot delete Ben\'s call');
ok(await jo.g(`recGet('calls', 'cBen1')`), 'and it comes back on her device');

// ================= Sam, in no team =================
const sam = await boot();
await signIn(sam, U.sam);
ok(!/Team:/.test(sam.stat()) && sam.g('TEAM') === null && sam.g('sbVault') === 'none', 'someone in no team sets their own passphrase, as before');
await phrase(sam, 'sam own passphrase', 'sam own passphrase');
await sync(sam);
ok(!sam.g('window.__syncErr') && sam.g('ACCOUNTS.length') === 0 && !(await sam.g(`recGet('calls', 'cBen1')`)), 'and sees nothing of the team\'s');

const real = [...ben.errs, ...jo.errs, ...sam.errs].filter(e => !/Not implemented|Could not parse CSS|zones\.js|team\b/i.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
