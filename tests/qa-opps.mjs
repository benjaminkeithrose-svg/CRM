// v115: opportunities and the relationship map. An opportunity on the
// account; its details sheet (nothing typed, nothing kept); the map's people,
// links, red flags and strengths, each saved and marked for cloud sync; the
// PC builds it (Add person, Link to, Remove) and the phone only looks and
// edits details; back, backup and restore, and delete with a named
// confirmation. Pointer gestures are a browser matter: drag and pan were
// checked in Chromium, not here.
import { JSDOM } from 'jsdom';
import fs from 'fs';
import 'fake-indexeddb/auto';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  x ' + m); } };
const tick = (ms = 50) => new Promise(r => setTimeout(r, ms));
const errs = [];
let phone = false, confirms = [];
const dom = new JSDOM(fs.readFileSync('index.html', 'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g, ''),
  { runScripts: 'dangerously', url: 'https://example.org/' });
const w = dom.window, d = w.document;
w.indexedDB = indexedDB; w.IDBKeyRange = IDBKeyRange; w.Blob = Blob;
w.scrollTo = () => {}; w.alert = () => {}; w.confirm = m => { confirms.push(m); return true; };
w.matchMedia = q => ({ matches: /max-width/.test(q) ? phone : false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
w.navigator.storage = { persist: async () => true, persisted: async () => true };
w.URL.createObjectURL = () => 'blob:stub'; w.URL.revokeObjectURL = () => {};
if (!w.HTMLDialogElement.prototype.showModal) w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
if (!w.HTMLDialogElement.prototype.close) w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new w.Event('close')); };
w.Element.prototype.setPointerCapture = () => {};
w.HTMLCanvasElement.prototype.getContext = () => null;
w.console.error = (...a) => errs.push(a.join(' ')); w.console.warn = () => {};
for (const f of ['zones.js', 'manuals.js', 'healthlib.js', 'app.js']) {
  const el = d.createElement('script'); el.textContent = fs.readFileSync(f, 'utf8'); d.body.appendChild(el);
}
d.dispatchEvent(new w.Event('DOMContentLoaded'));
await tick(500);
const $ = id => d.getElementById(id);
const g = e => w.eval('(' + e + ')');
const toast = () => $('toast').textContent;
const panel = () => $('opPanel').textContent;
const cards = () => [...$('opMap').querySelectorAll('g.op-card')];
const tapCard = i => cards()[i].dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
const A = 'Example Meats - Dandenong';
await g(`(async () => {
  const list = [{a: '${A}', sub: 'Dandenong', z: 'Z1', foc: 'High', cad: CAD['High'], mgr: 'Ben', rep: '',
    c: [{n: 'Tom Ward', r: 'Operations Manager', t: '', p: '', pk: '', e: []}, {n: 'Sam Lee', r: 'Maintenance Manager', t: '', p: '', pk: '', e: []}]}];
  await accReplaceAll(list); indexAccounts(list);
  await kvSet('cloudSeeded', true);
  openAccount('${A}');
})()`);
await tick(100);

// ---- the account's card, and a new opportunity
ok(g(`screen`) === 'acct' && /Opportunities/.test($('avOpps').textContent) && /None yet/.test($('avOpps').textContent), 'the account has an Opportunities card, empty');
$('avOppNew').click(); await tick();
ok($('oppdlg').hasAttribute('open') && $('odHead').textContent === 'New opportunity' && $('odDel').hidden && g(`history.state.dialog`) === 'oppdlg', 'New opportunity opens the details sheet, with no bin');
$('odOk').click(); await tick(200);
ok(!$('oppdlg').hasAttribute('open') && g('OPPS.length') === 0 && g('screen') === 'acct', 'Done with nothing typed keeps nothing');
$('avOppNew').click(); await tick();
$('odName').value = 'Line 3 upgrade'; $('odObj').value = '12 S800 belts on Line 3, ordered by March'; $('odValue').value = 'AUD 180k'; $('odClose').value = '2027-03';
$('odOk').click(); await tick(300);
const saved = await g(`oppsAll()`);
ok(saved.length === 1 && saved[0].acct === A && saved[0].name === 'Line 3 upgrade' && saved[0].close === '2027-03', 'Done saves it on the account');
ok(g(`screen`) === 'opp' && $('title').textContent === 'Line 3 upgrade' && $('subtitle').textContent === A, 'and opens its map');
ok(g(`Object.keys(cloudDirty).some(k => k.startsWith('opps/'))`), 'marked to sync');
ok(/Line 3 upgrade/.test(panel()) && /AUD 180k · close Mar 2027/.test(panel()) && /Tap Add person to start/.test(panel()), 'the panel shows its summary and how to start');
ok($('opMap').querySelector('g.op-node') && [...$('opMap').querySelectorAll('.op-lane')].map(t => t.textContent).join('|') === 'Customer|OEMs and integrators|Our team', 'the map has its three lanes and the opportunity');

// ---- adding people (the PC)
const add = async (side, name, title, org) => {
  $('opAdd').click(); await tick();
  $('opSide').querySelector('[data-v="' + side + '"]').click(); await tick();
  $('opAn').value = name; $('opAn').dispatchEvent(new w.Event('change'));
  if (title != null) $('opAt').value = title;
  if (org != null) $('opAo').value = org;
  $('opAGo').click(); await tick(100);
};
ok(!$('opAdd').hidden, 'Add person is on the PC');
$('opAdd').click(); await tick();
ok([...$('opAnList').options].map(o => o.value).join() === 'Tom Ward,Sam Lee', 'customer names come from the CRM contacts');
$('opAX').click(); await tick();
await add('cust', 'Tom Ward');
ok(g(`OPP.people[0].title`) === 'Operations Manager' && g(`OPP.people[0].side`) === 'cust', 'a CRM contact brings their title');
await add('cust', 'Sam Lee');
await add('oem', 'Greg Holt', 'Project Engineer', 'Northfield Conveyors');
await add('us', 'Ben', 'Account Manager');
ok(cards().length === 4 && [...$('opMap').querySelectorAll('.op-org')].map(t => t.textContent).join() === 'Northfield Conveyors', 'four people on the map, the OEM under its company');
ok(g(`OPP.people.map(p => p.x < 360 ? 'c' : p.x < 740 ? 'o' : 'u').join('')`) === 'ccou', 'each in their own lane');

// ---- a person's details
tapCard(0); await tick();
ok(/Their part in the decision/.test(panel()) && $('opPanel').querySelector('[data-opchips="role"]'), 'tapping a person opens their details');
$('opPanel').querySelector('[data-opchips="role"] [data-v="Signs the order"]').click(); await tick();
$('opPanel').querySelector('[data-opchips="mode"] [data-v="Steady"]').click(); await tick();
$('opPr').value = '-3'; $('opPr').dispatchEvent(new w.Event('input')); await tick(800);
const tom = (await g(`oppsAll()`))[0].people[0];
ok(tom.role === 'Signs the order' && tom.mode === 'Steady' && tom.rate === -3, 'role, view and rating saved: ' + [tom.role, tom.mode, tom.rate]);
ok(cards()[0].querySelector('.op-badge').textContent === 'E' && /Steady/.test(cards()[0].textContent) && /-3/.test(cards()[0].textContent), 'and shown on the card');
$('opPanel').querySelector('[data-opchips="role"] [data-v="Signs the order"]').click(); await tick();
ok(g(`OPP.people[0].role`) === '', 'tapping the chip again clears it');
$('opPanel').querySelector('[data-opchips="role"] [data-v="Signs the order"]').click(); await tick();
$('opPn').value = 'Tom Ward Jr'; $('opPn').dispatchEvent(new w.Event('input')); await tick(900);
ok((await g(`oppsAll()`))[0].people[0].n === 'Tom Ward Jr', 'typing a name saves a moment later');

// ---- links
tapCard(3); await tick();
$('opLink').click(); await tick();
ok(!$('opHint').hidden && /Tap the person to link Ben/.test($('opHint').textContent), 'Link to asks who to');
tapCard(1); await tick(100);
ok(g(`OPP.links.length`) === 1 && g(`OPP.links[0].kind`) === 'Our coverage' && /Link/.test(panel()) && $('opHint').hidden, 'our person to theirs is Our coverage, and opens the link');
$('opSg').querySelector('[data-v="Strong"]').click(); await tick();
ok(g(`OPP.links[0].str`) === 'Strong' && $('opMap').querySelector('.op-edge'), 'strength set, line drawn');
tapCard(2); await tick(); $('opLink').click(); await tick();
$('opMap').querySelector('g.op-node').dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await tick(100);
ok(g(`OPP.links[1].b`) === 'OPP' && g(`OPP.links[1].kind`) === 'Supplies', 'an OEM to the opportunity is Supplies');
tapCard(1); await tick(); $('opLink').click(); await tick(); tapCard(3); await tick();
ok(g(`OPP.links.length`) === 2 && /already linked/.test(toast()), 'the same two are not linked twice');
tapCard(1); await tick(); $('opLink').click(); await tick(); tapCard(0); await tick(100);
$('opPanel').querySelector('[data-opchips="kind"] [data-v="Reports to"]').click(); await tick();
ok(g(`OPP.links[2].kind`) === 'Reports to', 'kind changed to Reports to');
$('opDone').click(); await tick();

// ---- red flags and strengths
$('opNf').value = 'Tom not met since March'; $('opNfPin').value = 'p:' + g(`OPP.people[0].id`); $('opNfGo').click(); await tick();
$('opNs').value = 'Sam is a strong coach'; $('opNsGo').click(); await tick();
ok(g(`OPP.flags.length`) === 1 && g(`OPP.strengths.length`) === 1 && /On Tom Ward Jr/.test(panel()) && /The whole opportunity/.test(panel()), 'a red flag pinned to a person, a strength on the whole opportunity');
ok(cards()[0].querySelector('circle') && [...cards()[0].querySelectorAll('circle')].length === 2, 'the flagged person carries a marker');
confirms = [];
$('opPanel').querySelector('[data-oprm="strengths:0"]').click(); await tick();
ok(g(`OPP.strengths.length`) === 0 && /Remove this strength/.test(confirms[0]), 'removing one asks first');

// ---- removing a person takes their links, and unpins their flags
tapCard(0); await tick();
$('opRm').click(); await tick();
ok(/Remove Tom Ward Jr and 1 link/.test($('opPanel').textContent), 'remove names the person and their links');
$('opRmY').click(); await tick(100);
ok(g(`OPP.people.length`) === 3 && g(`OPP.links.length`) === 2 && g(`OPP.flags[0].pin`) === '', 'gone, with their link; the flag stays on the whole opportunity');

// ---- back goes to the account, with the card up to date
$('back').click(); await tick(200);
ok(g(`screen`) === 'acct' && /Line 3 upgrade/.test($('avOpps').textContent) && /3 people/.test($('avOpps').textContent), 'back goes to the account, the card counts 3 people');
$('avOpps').querySelector('[data-opp]').click(); await tick(100);
ok(g(`screen`) === 'opp' && cards().length === 3, 'tapping it opens the map again');

// ---- the phone: look and tap
phone = true;
g(`renderOpp()`); await tick();
ok($('opAdd').hidden, 'no Add person on the phone');
tapCard(0); await tick();
ok(/Their part in the decision/.test(panel()) && !$('opLink') && !$('opRm'), 'a person opens to edit, without Link to or Remove');
$('opDone').click(); await tick();
$('opMap').querySelector('.op-edge').dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await tick();
ok(/Strength/.test(panel()) && !$('opRmL'), 'a link opens to edit, without Remove');
$('opDone').click(); await tick();
ok(/looking and tapping/.test(panel()), 'and the panel says the map is built on the PC');
phone = false;

// ---- details from the map, backup, and delete
$('opEdit').click(); await tick();
ok($('oppdlg').hasAttribute('open') && $('odName').value === 'Line 3 upgrade' && !$('odDel').hidden, 'Details opens the sheet, with the bin');
$('odValue').value = 'AUD 210k'; $('odOk').click(); await tick(300);
ok(g(`OPP.value`) === 'AUD 210k' && g(`OPP.people.length`) === 3 && /AUD 210k/.test(panel()), 'a changed value saves and keeps the map');
const bk = await g(`buildBackup(false)`);
ok(Array.isArray(bk.opps) && bk.opps.length === 1 && bk.opps[0].people.length === 3, 'backups carry opportunities');
$('opEdit').click(); await tick();
confirms = [];
$('odDel').click(); await tick(300);
ok(/Delete the opportunity Line 3 upgrade at Example Meats - Dandenong\?/.test(confirms[0]) && /3 people and 2 links/.test(confirms[0]) && /1 red flag or strength/.test(confirms[0]), 'delete names what goes: ' + (confirms[0] || '').split('\n')[2]);
ok(g(`OPPS.length`) === 0 && (await g(`oppsAll()`)).length === 0 && g(`screen`) === 'acct' && g(`Object.entries(cloudDirty).some(([k, v]) => k.startsWith('opps/') && v.del)`), 'deleted, back on the account, the delete marked to sync');
await g(`doRestore(new File([${JSON.stringify(JSON.stringify(bk))}], 'b.json'))`); await tick(200);
ok((await g(`oppsAll()`)).length === 1, 'a restore brings it back');

const real = errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
