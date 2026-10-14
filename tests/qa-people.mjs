// v125: people met on Blue Sheet maps. A new name under one of our customers
// joins that customer's contacts, marked Not in Dynamics yet, kept through a
// CRM import until Dynamics has them, shared as a list from Settings and with
// the team through the 'people' store. What was known about them on another
// Blue Sheet fills the next one as estimates; an opportunity has an outcome.
// Everything here is made up.
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
w.indexedDB = indexedDB; w.IDBKeyRange = IDBKeyRange; w.Blob = Blob;
w.scrollTo = () => {}; w.alert = () => {}; w.confirm = () => true;
w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
w.navigator.storage = { persist: async () => true, persisted: async () => true };
w.URL.createObjectURL = () => 'blob:stub'; w.URL.revokeObjectURL = () => {};
if (!w.HTMLDialogElement.prototype.showModal) w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
if (!w.HTMLDialogElement.prototype.close) w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new w.Event('close')); };
w.Element.prototype.setPointerCapture = () => {};
w.HTMLCanvasElement.prototype.getContext = () => null;
w.console.error = (...a) => errs.push(a.join(' ')); w.console.warn = () => {};
for (const f of ['zones.js', 'manuals.js', 'healthlib.js', 'xlsx-0.18.5.full.min.js', 'app.js']) {
  const el = d.createElement('script'); el.textContent = fs.readFileSync(f, 'utf8'); d.body.appendChild(el);
}
d.dispatchEvent(new w.Event('DOMContentLoaded'));
await tick(500);
const $ = id => d.getElementById(id);
const g = e => w.eval('(' + e + ')');
const A = 'Example Meats - Dandenong', O = 'Northfield Conveyors';
const crm = extra => `(() => {
  const mk = (a, sub, c) => ({a, sub, z: 'Z1', foc: 'High', cad: CAD['High'], mgr: 'Ben', rep: '', c});
  return [mk('${A}', 'Dandenong', [{n: 'Tom Ward', r: 'Operations Manager', t: '', p: '', pk: '', e: []}${extra || ''}]),
    mk('${O}', 'Bayswater', [{n: 'Greta Holm', r: 'Design Engineer', t: '', p: '', pk: '', e: []}])];
})()`;
await g(`(async () => {
  const list = ${crm()};
  await accReplaceAll(list); indexAccounts(list);
  localStorage.setItem(LS('mgr'), 'Ben Example');
  await kvSet('cloudSeeded', true);
  const P = (id, party, n, title, role, stance, side) => ({id, party, side: side || 'cust', n, title, role, role2: '', stance, mode: '', rate: 0, note: '', win: '', result: '', evid: ''});
  // an earlier Blue Sheet at the same customer: Kim checked the spec and helped
  await oppsPut({id: 'prior', acct: '${A}', name: 'Line 2 retrofit', outcome: 'Won', updated: 1000, flags: [], strengths: [], links: [],
    parties: [{id: 'e1', kind: 'end', name: '${A}'}, {id: 'i1', kind: 'ilx', name: 'Intralox'}],
    people: [P('k1', 'e1', 'Kim Site', 'Site Engineer', 'Checks the spec', 'helps')]});
  // a Kim Site somewhere else entirely: not the same person
  await oppsPut({id: 'elsewhere', acct: '${O}', name: 'Packing hall', updated: 2000, flags: [], strengths: [], links: [],
    parties: [{id: 'e2', kind: 'end', name: '${O}'}],
    people: [P('k2', 'e2', 'Kim Site', 'Buyer', 'Signs the order', 'hinders')]});
  // the new one
  await oppsPut({id: 'now', acct: '${A}', name: 'Boning room', updated: 3000, flags: [], strengths: [], links: [],
    parties: [{id: 'e3', kind: 'end', name: '${A}'}, {id: 'h3', kind: 'head', name: 'Somebody D&C'}, {id: 'i3', kind: 'ilx', name: 'Intralox'}], people: []});
  await loadLists(); openAccount('${A}'); openOpp('now');
})()`); await tick(300);
ok(g(`screen`) === 'opp' && g(`OPP.id`) === 'now', 'the new opportunity is open');

// ---- history: by name, at the same company, newest first
ok(g(`opHistory('kim  site', '${A}', 'now').map(h => h.o.id).join()`) === 'prior', 'Kim at this customer has one other Blue Sheet; the Kim elsewhere is someone else');
ok(g(`opHistLine(opHistory('Kim Site', '${A}', 'now')[0])`) === 'Line 2 retrofit (won): checks the spec, helping us', 'read as one line, with how it ended: ' + g(`opHistLine(opHistory('Kim Site', '${A}', 'now')[0])`));

// ---- the people table fills what was known, as estimates
g(`opTableOpen('e3')`); await tick();
const type = async (name, set) => {
  const n = [...$('otBody').querySelectorAll('input[data-k="n"]')].pop();
  n.value = name; n.dispatchEvent(new w.Event('input')); n.dispatchEvent(new w.Event('change')); await tick();
  const row = [...$('otBody').querySelectorAll('tbody tr')].find(x => x.querySelector('[data-k="n"]').value === name);
  for (const [k, v] of Object.entries(set || {})) { const e = row.querySelector('[data-k="' + k + '"]'); e.value = v; e.dispatchEvent(new w.Event(e.tagName === 'SELECT' ? 'change' : 'input')); }
  return row;
};
let row = await type('Kim Site');
ok(row.querySelector('[data-k="code"]').value === 'T' && row.querySelector('[data-k="stance"]').value === 'helps' && row.querySelector('[data-k="title"]').value === 'Site Engineer',
  'typing Kim brings part, stance and title from the last Blue Sheet');
ok(row.querySelector('[data-k="code"]').classList.contains('est') && /Line 2 retrofit/.test(row.querySelector('[data-k="stance"]').title), 'both marked as estimates, saying where from');
row = await type('Lee New', {stance: 'neutral'});
ok(!row.querySelector('.est') && row.querySelector('[data-k="code"]').value === '', 'someone new gets nothing filled in');
row = await type('Tom Ward');
ok(!row.querySelector('.est'), 'a CRM contact with no Blue Sheet history: nothing estimated');
// typing over an estimate takes the mark off that box only
const kimRow = [...$('otBody').querySelectorAll('tbody tr')].find(x => x.querySelector('[data-k="n"]').value === 'Kim Site');
const ks = kimRow.querySelector('[data-k="stance"]'); ks.value = 'neutral'; ks.dispatchEvent(new w.Event('change')); await tick();
ok(!ks.classList.contains('est') && kimRow.querySelector('[data-k="code"]').classList.contains('est'), 'changing the stance makes it yours; the part stays an estimate');
$('otDone').click(); await tick(300);
const kim = g(`OPP.people.find(p => p.n === 'Kim Site')`);
ok(kim.role === 'Checks the spec' && kim.stance === 'neutral' && kim.est.join() === 'role' && kim.estFrom === 'Line 2 retrofit', 'saved: the part is an estimate, the stance is not');

// ---- the newcomers join the customer's contacts
const added = () => g(`ACC_BY_NAME.get('${A}').c.filter(c => c.added).map(c => c.n).sort().join()`);
ok(added() === 'Kim Site,Lee New', 'Kim and Lee are on the customer\'s contacts, marked added; Tom was there already: ' + added());
ok(/2 people added to Example Meats - Dandenong's contacts, marked Not in Dynamics yet/.test($('toast').textContent), 'and a message says so');
const stored = await g(`peopleAll()`);
ok(stored.length === 2 && stored.every(r => r.acct === A && r.by === 'Ben Example' && r.from === 'Boning room') && stored.find(r => r.n === 'Kim Site').t === 'Site Engineer', 'kept in the people store: account, name, title, who, which Blue Sheet');
const dirty = await g(`cloudDirtyLoad().then(() => Object.keys(cloudDirty).filter(k => k.startsWith('people/')).length)`);
ok(dirty === 2, 'both waiting to go to the cloud for the team');
ok(g(`haystack(ACC_BY_NAME.get('${A}'))`).includes('lee new'), 'searchable straight away');
// the Directory tags them
w.eval(`renderPeople('lee', document.getElementById('dirTmp') || (() => { const x = document.createElement('div'); x.id = 'dirTmp'; document.body.appendChild(x); return x; })())`);
ok(/Not in Dynamics yet/.test($('dirTmp').innerHTML), 'the Directory marks Lee Not in Dynamics yet');
// a party that is not one of our customers adds nobody
g(`opTableOpen('h3')`); await tick();
await type('Alex Design');
$('otDone').click(); await tick(300);
ok((await g(`peopleAll()`)).length === 2, 'a head contractor that is not a customer adds nobody to the contacts');

// ---- the person panel
g(`(() => { opSel = {t: 'p', id: '${kim.id}'}; opPanel(); })()`); await tick();
ok(/estimate, from Line 2 retrofit/.test($('opPanel').textContent) && /On other Blue Sheets/.test($('opPanel').textContent) && /Line 2 retrofit \(won\)/.test($('opPanel').textContent),
  'tapping Kim shows the estimate and their other Blue Sheets');
d.querySelector('#opPanel [data-opchips="role"] .on').click(); await tick();
d.querySelector('#opPanel [data-opchips="role"] [data-v="Checks the spec"]').click(); await tick();
ok(!g(`OPP.people.find(p => p.n === 'Kim Site').est`), 'choosing their part confirms it: no longer an estimate');

// ---- a CRM import keeps them, until Dynamics has them
await g(`(async () => { const list = ${crm(`, {n: 'kim site', r: 'Site Engineer', t: '', p: '', pk: '', e: []}`)}; await accReplaceAll(list); indexAccounts(list); })()`); await tick(300);
ok(added() === 'Lee New' && g(`ACC_BY_NAME.get('${A}').c.filter(c => /kim site/i.test(c.n)).length`) === 1, 'after a CRM import Lee is still there; Kim came in from Dynamics, once');
ok((await g(`peopleAll()`)).map(r => r.n).join() === 'Lee New' && g(`PEOPLE.length`) === 1, 'Kim\'s added record clears itself');
ok((await g(`accAll()`)).every(a => a.c.every(c => !c.added)), 'the accounts store never holds an added contact');

// ---- backup and the desktop exchange carry them separately
const bk = await g(`buildBackup(false)`);
ok(bk.accounts.every(a => a.c.every(c => !c.added)) && bk.people.map(r => r.n).join() === 'Lee New', 'a backup keeps the accounts as Dynamics gave them, and the people beside them');
ok(g(`accPlain()`).every(a => a.c.every(c => !c.added)) && added() === 'Lee New', 'the plain account list leaves the live one alone');

// ---- Settings: the list to put into Dynamics
g(`showScreen('settings')`); await tick();
ok($('pplStat').textContent === '1 new contact. 1 not sent to CAG yet.' && !$('pplShare').hidden, 'Settings counts them and offers the list (v144: Changes for Dynamics)');
let sent = null;
w.deliverFile = async (blob, name) => { sent = {blob, name}; };
$('pplShare').click(); await tick(300);
ok(sent && /^changes_for_dynamics_\d{4}-\d{2}-\d{2}\.xlsx$/.test(sent.name), 'Download for CAG makes a spreadsheet: ' + (sent && sent.name));
if (sent) {
  const wb = w.XLSX.read(new Uint8Array(await sent.blob.arrayBuffer()), {type: 'array'});
  const rows = w.XLSX.utils.sheet_to_json(wb.Sheets['New contacts'], {header: 1});
  ok(rows[0].join() === 'Account,Full Name,Job Title,Email,Mobile,Added,Added by,From,Status' && rows[1][0] === A && rows[1][1] === 'Lee New' && rows[1][7] === 'Boning room', 'one row per contact, with where they came from');
}

// ---- outcome
g(`openOppDetails(null)`); await tick();
ok($('odOutF').hidden, 'a new opportunity does not ask how it ended');
$('odName').value = ''; $('odOk').click(); await tick(100);
g(`openOppDetails(OPPS.find(o => o.id === 'now'))`); await tick();
ok(!$('odOutF').hidden && [...$('odOut').querySelectorAll('button')].map(b => b.textContent).join() === 'Open,Won,Lost,On hold' && $('odOut').querySelector('.on').textContent === 'Open', 'Details offers Open, Won, Lost, On hold; Open to start');
$('odOut').querySelector('[data-v="Lost"]').click(); await tick();
$('odOk').click(); await tick(200);
ok(g(`OPPS.find(o => o.id === 'now').outcome`) === 'Lost' && (await g(`oppsAll()`)).find(o => o.id === 'now').outcome === 'Lost', 'Lost is saved');
ok(/Outcome: Lost/.test(g(`oppText(OPPS.find(o => o.id === 'now'))`)), 'the coach reads it');
ok(g(`opHistLine(opHistory('Lee New', '${A}', '')[0])`).startsWith('Boning room (lost)'), 'and Lee\'s history says how that one went');
g(`openOppDetails(OPPS.find(o => o.id === 'now'))`); await tick();
$('odOut').querySelector('[data-v="Open"]').click(); await tick();
$('odOk').click(); await tick(200);
ok(!g(`OPPS.find(o => o.id === 'now').outcome`), 'set back to Open, nothing is stored');

const real = errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
