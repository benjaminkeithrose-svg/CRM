// v115: opportunities and the relationship map. v116: the Blue Sheet. An opportunity on the
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
ok(!$('odName').closest('.f').hidden && $('odObj').closest('.f').hidden && $('odValue').closest('.f').hidden && $('odClose').closest('.f').hidden, 'a new one asks only for its name (v123)');
$('odName').value = 'Line 3 upgrade'; $('odObj').value = '12 S800 belts on Line 3, ordered by March'; $('odValue').value = 'AUD 180k'; $('odClose').value = '2027-03';
$('odOk').click(); await tick(300);
const saved = await g(`oppsAll()`);
ok(saved.length === 1 && saved[0].acct === A && saved[0].name === 'Line 3 upgrade' && saved[0].close === '2027-03', 'Done saves it on the account');
ok(g(`screen`) === 'opp' && $('title').textContent === 'Line 3 upgrade' && $('subtitle').textContent === A, 'and opens its map');
ok(g(`Object.keys(cloudDirty).some(k => k.startsWith('opps/'))`), 'marked to sync');
ok(/Line 3 upgrade/.test(panel()) && /AUD 180k · close Mar 2027/.test(panel()) && /Build it from the list/.test(panel()), 'the panel shows its summary and how to start');
ok($('opMap').querySelector('g.op-node') && g(`OPP.parties.map(q => q.kind + ':' + q.name).join('|')`) === 'end:' + A + '|ilx:Intralox', 'a new map starts with the end user, named for the account, and Intralox (v124)');
ok(!$('opAdd') && d.querySelector('#opBar [data-addparty="oem"]') && d.querySelector('#opBar [data-addparty="head"]'), 'parties are added from the list down the side');

// ---- people, as rows of a table (v124)
const party = k => g(`OPP.parties.find(q => q.kind === '${k}').id`);
const fill = async (pid, rows) => {
  d.querySelector('#opBar [data-tbl="' + pid + '"]').click(); await tick();
  for (const r of rows) {
    const n = [...$('otBody').querySelectorAll('input[data-k="n"]')].pop();
    n.value = r[0]; n.dispatchEvent(new w.Event('input')); n.dispatchEvent(new w.Event('change')); await tick();
    const row = [...$('otBody').querySelectorAll('tbody tr')].find(x => x.querySelector('[data-k="n"]').value === r[0]);
    if (r[1] != null) { const t = row.querySelector('[data-k="title"]'); t.value = r[1]; t.dispatchEvent(new w.Event('input')); }
  }
  $('otDone').click(); await tick(200);
};
d.querySelector('#opBar [data-tbl="' + party('end') + '"]').click(); await tick();
ok($('optbl').hasAttribute('open') && /People at Example Meats/.test($('otHead').textContent) && [...$('otNames').options].map(o => o.value).join() === 'Tom Ward,Sam Lee', 'the table offers the account\'s CRM contacts');
$('otDone').click(); await tick(100);
ok(!$('optbl').hasAttribute('open') && g(`OPP.people.length`) === 0, 'an empty table keeps nothing');
await fill(party('end'), [['Tom Ward'], ['Sam Lee']]);
ok(g(`OPP.people[0].title`) === 'Operations Manager' && g(`OPP.people[0].side`) === 'cust', 'a CRM contact brings their title');
d.querySelector('#opBar [data-addparty="oem"]').click(); await tick();
$('opNewParty').value = 'Northfield Conveyors'; $('opNewPartyGo').click(); await tick(100);
ok(/OEM or integrator/.test(panel()) && g(`OPP.parties.find(q => q.kind === 'oem').belts.join()`) === 'Intralox', 'a new OEM opens on its own, Intralox ticked as its belting');
await fill(party('oem'), [['Greg Holt', 'Project Engineer']]);
await fill(party('ilx'), [['Ben', 'Account Manager']]);
ok(cards().length === 4 && g(`OPP.people.find(p => p.n === 'Greg Holt').org`) === 'Northfield Conveyors' && g(`OPP.people.map(p => p.side).join()`) === 'cust,cust,oem,us', 'four people, each under their party');

// ---- a person's details
tapCard(0); await tick();
ok(/Their part in the decision/.test(panel()) && $('opPanel').querySelector('[data-opchips="role"]'), 'tapping a person opens their details');
$('opPanel').querySelector('[data-opchips="role"] [data-v="Signs the order"]').click(); await tick();
$('opPanel').querySelector('[data-opchips="mode"] [data-v="Steady"]').click(); await tick();
$('opPr').value = '-3'; $('opPr').dispatchEvent(new w.Event('input')); await tick(800);
const tom = (await g(`oppsAll()`))[0].people[0];
ok(tom.role === 'Signs the order' && tom.mode === 'Steady' && tom.rate === -3, 'role, view and rating saved: ' + [tom.role, tom.mode, tom.rate]);
ok(cards()[0].querySelector('.op-badge').textContent === 'E', 'and the role shown on the card');
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
ok([...cards()[0].querySelectorAll('circle')].length === 2 && cards()[0].querySelector('.op-badge'), 'the flagged person carries a marker, beside their stance and role');
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
ok($('opBar') && !$('opBar').classList.contains('open'), 'on the phone the list is folded above the map');
$('opBarT').click(); await tick();
ok($('opBar').classList.contains('open') && d.querySelector('#opBar .opbar-party'), 'and opens with a tap');
$('opBarT').click(); await tick();
tapCard(0); await tick();
ok(/Their part in the decision/.test(panel()) && $('opLink') && $('opRm'), 'a person opens with Link to and Remove, on the phone too');
$('opDone').click(); await tick();
$('opMap').querySelector('.op-edge').dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await tick();
ok(/Strength/.test(panel()) && $('opRmL'), 'a link can be removed on the phone too');
$('opDone').click(); await tick();
ok(!/Drag a party/.test(panel()), 'and no talk of dragging on the phone');
g(`opSelect(null)`); await tick();
phone = false;

// ---- the Blue Sheet (v116)
await g(`(async () => {
  OPP.people.find(p => p.side === 'cust').role = 'Uses it';
  OPP.people.push({id: 'pX', side: 'cust', n: 'Priya Nair', title: 'Engineering Lead', role: 'Checks the spec', mode: '', rate: -2, x: 20, y: 300});
  await oppSaveNow(); renderOpp();
})()`);
$('opView').querySelector('[data-v="sheet"]').click(); await tick(100);
ok(!$('opSheet').hidden && d.querySelector('#s-opp .oppmain').hidden && !$('opShare').hidden && $('opFit').hidden, 'Blue Sheet swaps the map for the sheet, with Create and share at the top');
const sheet = () => $('opSheet').textContent;
ok(/Single sales objective/.test(sheet()) && /Line 3 upgrade/.test(sheet()) && /Where we stand/.test(sheet()) && /Buying influences/.test(sheet()) && /Possible actions/.test(sheet()), 'the sheet has the Blue Sheet\'s sections');
ok($('opSheet').querySelectorAll('details.bsp').length === 3, 'one entry for each of their people, none for ours');
ok(/Covered by Ben \(strong\)/.test($('opSheet').querySelector('details.bsp').textContent), 'coverage is read from the map\'s links');
const gaps = () => [...$('opSheet').querySelectorAll('.bsgaps li span')].map(x => x.textContent);
ok(gaps().includes('Nobody identified who signs the order') && gaps().includes('No coach: nobody on their side is marked as on our side') && gaps().includes("Ben's relationship with Priya Nair is unknown") && gaps().includes('Priya Nair: how they see it is unknown'), 'the gaps are found: ' + gaps().join(' / '));
const nf = g(`OPP.flags.length`);
[...$('opSheet').querySelectorAll('[data-bsgap]')].find(b => /relationship with Priya Nair is unknown/.test(b.parentNode.textContent)).click(); await tick(100);   // v141: Ben, her account manager, covers her by default, not rated
ok(g(`OPP.flags.length`) === nf + 1 && g(`OPP.flags[OPP.flags.length - 1].pin`) === 'p:pX' && !gaps().includes("Ben's relationship with Priya Nair is unknown"), 'a gap becomes a red flag pinned to the person, and leaves the gaps');
const pri = [...$('opSheet').querySelectorAll('details.bsp')].find(x => /Priya/.test(x.textContent));
pri.querySelector('[data-opchips] [data-v="Signs the order"]').click(); await tick(50);
[...$('opSheet').querySelectorAll('details.bsp')].find(x => /Priya/.test(x.textContent)).querySelector('[data-bsinfl] [data-v="High"]').click(); await tick(50);
const pri2 = [...$('opSheet').querySelectorAll('details.bsp')].find(x => /Priya/.test(x.textContent));
const win = pri2.querySelector('[data-bsf^="win:"]'); win.value = 'A clean audit'; win.dispatchEvent(new w.Event('input'));
const ev = pri2.querySelector('[data-bsf^="evid:"]'); ev.value = 'Said so in March'; ev.dispatchEvent(new w.Event('input'));
$('bsPos').value = '2'; $('bsPos').dispatchEvent(new w.Event('input'));
$('bsComp').value = 'Cheaper acetal belt'; $('bsComp').dispatchEvent(new w.Event('input'));
await tick(900);
const pr = (await g(`oppsAll()`))[0];
const px = pr.people.find(p => p.id === 'pX');
ok(px.role === 'Signs the order' && px.infl === 'High' && px.win === 'A clean audit' && px.evid === 'Said so in March' && pr.pos === 2 && pr.comp === 'Cheaper acetal belt', 'role, influence, win, evidence, position and competition saved');
ok(!gaps().includes('Nobody identified who signs the order'), 'and the gap closes');
$('bsNa').value = 'Meet Tom with Sam'; $('bsNaGo').click(); await tick(50);
$('bsNa').value = 'Run a trial belt'; $('bsNaGo').click(); await tick(50);
$('opSheet').querySelector('[data-bsbest="1"]').click(); await tick(50);
ok(g(`OPP.actions.map(a => a.best).join()`) === 'false,true' && /Best action plan: Run a trial belt/.test(sheet()), 'two actions, the second starred into the best action plan');
$('opSheet').querySelector('[data-bsbest="0"]').click(); await tick(50);
$('opSheet').querySelector('[data-bsbest="1"]').click(); await tick(50);
ok(g(`OPP.actions.map(a => a.best).join()`) === 'true,false', 'each star is its own: the best action plan can hold several, as on the form');
$('opSheet').querySelector('[data-bstask="0"]').click(); await tick(100);
ok($('taskdlg').hasAttribute('open') && $('tkTitle').value === 'Meet Tom with Sam', 'Make a task opens the task form, filled in');
g(`closeDialogsNow()`); await tick();
const doc = await g(`(async () => buildBlueSheetHTML(OPP, await oppMapPng()))()`);
ok(/<title>Blue Sheet/.test(doc) && /@page\{size:A4/.test(doc) && /Single sales objective/.test(doc) && /Priya Nair/.test(doc) && /<td>A clean audit<\/td>/.test(doc), 'the document is the A4 Blue Sheet');
ok(/Best action plan<\/h2><table>.*<td>Meet Tom with Sam<\/td>/.test(doc) && /Possible actions<\/h2><ul><li>Run a trial belt/.test(doc) && !/N\/A/.test(doc), 'with the best action plan apart from the other possible actions, and no N/A');
ok(!/Relationship map/.test(doc), 'where a picture cannot be drawn (as here), the map is left out rather than broken');
$('opView').querySelector('[data-v="map"]').click(); await tick(50);
ok($('opSheet').hidden && !d.querySelector('#s-opp .oppmain').hidden && $('opShare').hidden, 'Map brings the map back');

// ---- details from the map, backup, and delete
$('opEdit').click(); await tick();
ok($('oppdlg').hasAttribute('open') && $('odName').value === 'Line 3 upgrade' && !$('odDel').hidden, 'Details opens the sheet, with the bin');
$('odValue').value = 'AUD 210k'; $('odOk').click(); await tick(300);
ok(g(`OPP.value`) === 'AUD 210k' && g(`OPP.people.length`) === 4 && /AUD 210k/.test(panel()), 'a changed value saves and keeps the map');
const bk = await g(`buildBackup(false)`);
ok(Array.isArray(bk.opps) && bk.opps.length === 1 && bk.opps[0].people.length === 4, 'backups carry opportunities');
$('opEdit').click(); await tick();
confirms = [];
$('odDel').click(); await tick(300);
ok(/Delete the opportunity Line 3 upgrade at Example Meats - Dandenong\?/.test(confirms[0]) && /4 people and 2 links/.test(confirms[0]) && /2 red flags and strengths and 2 possible actions/.test(confirms[0]), 'delete names what goes: ' + (confirms[0] || '').split('\n')[2]);
ok(g(`OPPS.length`) === 0 && (await g(`oppsAll()`)).length === 0 && g(`screen`) === 'acct' && g(`Object.entries(cloudDirty).some(([k, v]) => k.startsWith('opps/') && v.del)`), 'deleted, back on the account, the delete marked to sync');
await g(`doRestore(new File([${JSON.stringify(JSON.stringify(bk))}], 'b.json'))`); await tick(200);
ok((await g(`oppsAll()`)).length === 1, 'a restore brings it back');

const real = errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
