// v144: owners and Changes for Dynamics. A site's account manager changes
// from its box (or every site at once), an ATL is set on the large account
// with default links to corporate and group engineering, a contact can be
// marked moved or changed from a map or the Directory, and Settings lists it
// all for CAG: download, mark sent, done once a CRM import shows it.
// Everything here is made up.
import { JSDOM } from 'jsdom';
import fs from 'fs';
import 'fake-indexeddb/auto';

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log('  x ' + m + (x !== undefined ? ' -> ' + x : '')); } };
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
const S = { a: 'Sample Foods - Northside', b: 'Sample Foods - Westside' };
await g(`(async () => {
  const C = (n, t, id) => ({n, t, r: '', p: '0400 000 00' + id.slice(-1), e: [n.split(' ')[0].toLowerCase() + '@example.org'], id});
  const mk = (a, sub, mgr, c) => ({a, sub, z: 'Z1', foc: 'High', cad: CAD['High'], mgr, rep: '', c});
  const list = [mk('${S.a}', 'Northside', 'Ben Example', [C('Pat Plant', 'Engineering Manager', 'c-1'), C('Sam Store', 'Purchasing', 'c-2')]),
    mk('${S.b}', 'Westside', 'Pat Other', [C('Jo Group', 'Group Engineering Manager', 'c-4')])];
  await accReplaceAll(list); indexAccounts(list);
  await kvSet('cloudSeeded', true);
  await plansPut({id: 'L1', kind: 'large', name: 'Sample Foods', sites: ['${S.a}', '${S.b}'], objectives: [], actions: [], updated: 1, sitesOn: true, autoCorpChecked: true,
    parties: [{id: 'pa', kind: 'end', name: '${S.a}', acct: '${S.a}', site: true}, {id: 'pb', kind: 'end', name: '${S.b}', acct: '${S.b}', site: true, eng: true, engFor: ['pa']}, {id: 'pi', kind: 'ilx', name: 'Intralox'}],
    people: [], links: []});
  await loadLists();
})()`);
await tick(100);
g(`openLap('L1')`); await tick(250);
const pick = (id, v, typed) => { const el = $(id); const s = el.querySelector('select'); s.value = v; s.dispatchEvent(new w.Event('change')); if (typed) el.querySelector('input').value = typed; el.querySelector('button').click(); };

// ---- a site's account manager
g(`opSelect({t: 'party', id: 'pa'})`); await tick(80);
ok(/Account manager/.test($('opPanel').textContent) && /Ben Example/.test($('opPanel').querySelector('.ownrow').textContent), 'a site shows its account manager, with Change');
$('opOwnCh').click(); await tick(20);
pick('opOwnPick', 'Pat Other'); await tick(150);
ok(g(`effMgr(ACC_BY_NAME.get('${S.a}'))`) === 'Pat Other' && g(`isMoved(ACC_BY_NAME.get('${S.a}'))`), 'Change makes someone else the account manager, as a reassignment');
ok(/changed here, was Ben Example/.test($('opPanel').textContent), 'and says it was changed here');
ok(g(`OPP.people.some(p => p.n === 'Pat Other' && p.side === 'us')`), 'the new account manager joins Intralox');
// every site at once
g(`opSelect(null)`); await tick(80);
ok(/Owners/.test($('opPanel').textContent) && /Pat Other \(2 sites\)/.test($('opPanel').textContent), 'the large account lists its account managers');
$('opAmAll').click(); await tick(20);
pick('opAmAllPick', 'Ben Example'); await tick(150);
ok(g(`effMgr(ACC_BY_NAME.get('${S.a}'))`) === 'Ben Example' && !g(`isMoved(ACC_BY_NAME.get('${S.a}'))`) && g(`effMgr(ACC_BY_NAME.get('${S.b}'))`) === 'Ben Example', 'Change every site sets them all; back to Dynamics\' own is no change');

// ---- the account team leader
$('opAtlCh').click(); await tick(20);
pick('opAtlPick', '__new__', 'Ada Lead'); await tick(200);
ok(g(`OPP.atl`) === 'Ada Lead' && g(`OPP.people.find(p => p.side === 'us').n`) === 'Ada Lead', 'an ATL is set on the large account, first in the Intralox box');
ok(g(`CHG.some(r => r.type === 'atl' && r.to === 'Ada Lead' && r.plan === 'L1')`), 'and goes on the list for CAG');
const atlLinks = g(`opImplied(OPP).filter(l => l.by === 'atl').map(l => OPP.people.find(p => p.id === l.b).n).join()`);
ok(atlLinks === 'Jo Group', 'their default links go to group engineering, not to the other sites', atlLinks);
g(`opSelect({t: 'party', id: 'pb'})`); await tick(80);
ok(!!$('opQatl') && $('opQatl').checked, 'group engineering can switch it off');
$('opQatl').checked = false; $('opQatl').dispatchEvent(new w.Event('change')); await tick(80);
ok(!g(`opImplied(OPP).some(l => l.by === 'atl')`), 'and then has none');

// ---- v153: any box can be owned by any of our people - Ben: group engineering fell under the ATL and could not be changed
$('opQatl').checked = true; $('opQatl').dispatchEvent(new w.Event('change')); await tick(80);
await g(`(async () => { const r = {id: 'sfR', kind: 'staff', n: 'Ray Engineer', pos: 'AE', boss: '', e: '', p: '', added: 1}; await peoplePut(r); STAFF = STAFF.concat([r]);
  OPP.parties.splice(OPP.parties.length - 1, 0, {id: 'pg', kind: 'grp', name: 'Group engineering'});
  OPP.people.push({id: 'gq', n: 'Lou Group', title: 'Engineer', party: 'pg', side: 'cust', stance: 'unknown'}); })()`);
g(`opSelect({t: 'party', id: 'pb'})`); await tick(80);
ok([...$('opOwnPick').querySelectorAll('option')].some(o => o.value === 'Ray Engineer'), 'a site\'s account manager can be any of our people, not only account managers', [...$('opOwnPick').querySelectorAll('option')].map(o => o.value).join());
g(`opSelect({t: 'party', id: 'pg'})`); await tick(80);
ok(/Owner/.test($('opPanel').textContent) && /Ada Lead \(account team leader\)/.test($('opPanel').querySelector('.ownrow').textContent), 'a group function with no account shows its owner: the account team leader until one is picked');
ok(g(`opImplied(OPP).some(l => l.by === 'atl' && l.b === 'gq')`), 'who covers them by default');
$('opOwnCh').click(); await tick(20);
pick('opOwnPick', 'Ray Engineer'); await tick(200);
ok(g(`OPP.parties.find(q => q.id === 'pg').owner`) === 'Ray Engineer', 'Change makes any of our people its owner');
ok(!g(`opImplied(OPP).some(l => l.by === 'atl' && l.b === 'gq')`) && g(`opImplied(OPP).some(l => l.by === 'am' && l.b === 'gq' && OPP.people.find(p => p.id === l.a).n === 'Ray Engineer')`), 'the owner covers them instead of the account team leader');
ok(g(`OPP.people.some(p => p.side === 'us' && p.n === 'Ray Engineer' && p.sid === 'sfR')`), 'and joins Intralox, tied to their record');
ok(/Ray Engineer, the owner, covers everyone here/.test($('opPanel').textContent) && !$('opQatl'), 'the panel says the owner covers them');
$('opOwnCh').click(); await tick(20);
$('opOwnClr').click(); await tick(200);
ok(!g(`OPP.parties.find(q => q.id === 'pg').owner`) && g(`opImplied(OPP).some(l => l.by === 'atl' && l.b === 'gq')`), 'Back to the account team leader undoes it');
g(`opSelect({t: 'party', id: 'pb'})`); await tick(80);
$('opQatl').checked = false; $('opQatl').dispatchEvent(new w.Event('change')); await tick(80);

// ---- a contact whose details changed, and one who moved, from the map
const pid = n => g(`OPP.people.find(p => p.n === '${n}').id`);
g(`opSelect({t: 'p', id: '${pid('Pat Plant')}'})`); await tick(80);
$('opCtChg').click(); await tick(60);
ok($('ctdlg').hasAttribute('open') && $('ctT').value === 'Engineering Manager' && $('ctE').value === 'pat@example.org', 'Moved or details changed shows what Dynamics has');
$('ctT').value = 'Site Engineering Manager';
$('ctOk').click(); await tick(200);
ok(g(`CHG.some(r => r.type === 'edit' && r.n === 'Pat Plant' && r.t === 'Site Engineering Manager' && !r.e && r.cid === 'c-1')`), 'a changed title is recorded for CAG, only what changed');
ok(g(`ACC_BY_NAME.get('${S.a}').c.find(c => c.n === 'Pat Plant').t`) === 'Site Engineering Manager' && g(`OPP.people.find(p => p.n === 'Pat Plant').title`) === 'Site Engineering Manager', 'and shows on the contact list and the map');
g(`opSelect({t: 'p', id: '${pid('Sam Store')}'})`); await tick(80);
$('opCtChg').click(); await tick(60);
$('ctTo').value = '${S.b}'.replace('${S.b}', S.b);
$('ctOk').click(); await tick(200);
ok(g(`CHG.some(r => r.type === 'move' && r.n === 'Sam Store' && r.from === '${S.a}' && r.to === '${S.b}')`), 'a move is recorded for CAG');
ok(g(`OPP.people.find(p => p.n === 'Sam Store').party`) === 'pb', 'and on the map they move to that site');
ok(g(`ACC_BY_NAME.get('${S.a}').c.find(c => c.n === 'Sam Store').moved`) === S.b && g(`ACC_BY_NAME.get('${S.b}').c.some(c => c.n === 'Sam Store' && c.movedFrom === '${S.a}')`), 'the old account says they moved; the new one has them');
ok(!g(`opSuggest('cust').some(x => x.n === 'Sam Store' && /Northside/.test(x.title))`), 'they are no longer offered at the old account');

// ---- from the Directory
g(`go('directory')`); await tick(80);
const el = d.createElement('div'), hint = d.createElement('p');
g(`renderPeople`)('jo group', el, hint);
const ch = el.querySelector('[data-pechg]');
ok(!!ch, 'a contact in the Directory has Change');
ch.click(); await tick(60);
$('ctP').value = '0499 999 999'; $('ctOk').click(); await tick(200);
ok(g(`CHG.some(r => r.type === 'edit' && r.n === 'Jo Group' && r.p === '0499 999 999')`), 'which records it the same way');

// ---- Settings: the list for CAG
g(`showScreen('settings')`); await tick(80);
ok(/1 moved contact, 2 changed details, 2 account owners/.test($('pplStat').textContent) && /5 not sent to CAG yet/.test($('pplStat').textContent), 'Settings counts them: ' + $('pplStat').textContent);
let sent = null; w.deliverFile = async (blob, name) => { sent = {blob, name}; };
w.confirm = () => true;
$('pplShare').click(); await tick(400);
ok(sent && /^changes_for_dynamics_/.test(sent.name), 'Download for CAG makes one spreadsheet');
const wb = w.XLSX.read(new Uint8Array(await sent.blob.arrayBuffer()), {type: 'array'});
ok(wb.SheetNames.join() === 'Moved contacts,Changed details,Account owners', 'a sheet for each kind: ' + wb.SheetNames.join());
const rows = n => w.XLSX.utils.sheet_to_json(wb.Sheets[n], {header: 1});
ok(rows('Moved contacts')[1][0] === 'c-2' && rows('Moved contacts')[1][2] === S.a && rows('Moved contacts')[1][3] === S.b, 'moves carry the Dynamics contact id, from and to');
ok(rows('Account owners').some(r => r[1] === 'Account Team Leader' && r[2] === 'Ada Lead'), 'owners include the ATL');
ok(/All sent to CAG/.test($('pplStat').textContent) && g(`CHG.filter(r => r.type !== 'owner').every(r => r.sent)`), 'marked as sent');

// ---- done once Dynamics has them
g(`(() => {
  const a = ACC_BY_NAME.get('${S.a}'), b = ACC_BY_NAME.get('${S.b}');
  const pat = a.c.find(c => c.n === 'Pat Plant'); pat._crm.t = 'Site Engineering Manager';
  a.c = a.c.filter(c => c.n !== 'Sam Store');
  b.c = b.c.filter(c => !c.added).concat([{n: 'Sam Store', t: 'Purchasing', r: '', p: '', e: [], id: 'c-2'}]);
  peopleMerge();
})()`); await tick(200);
ok(g(`CHG.find(r => r.type === 'edit' && r.n === 'Pat Plant').done`) > 0 && g(`CHG.find(r => r.type === 'move').done`) > 0, 'a CRM import with the changes marks them done');
ok(!g(`CHG.find(r => r.type === 'edit' && r.n === 'Jo Group').done`), 'one it does not have yet stays');

await tick(700);
ok(errs.length === 0, 'no errors', errs.join(' | '));
console.log(`PASS ${pass}` + (fail ? `  FAIL ${fail}` : ''));
process.exit(fail ? 1 : 0);
