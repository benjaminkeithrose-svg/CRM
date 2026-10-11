// v122: the Blue Sheet against Miller Heiman's own form. The visual map stays
// the working view; the sheet gains the form's fields; Create and share makes
// the traditional Blue Sheet as a document or an Excel workbook, the map only
// when asked; Import a Blue Sheet reads the template into a new opportunity.
// The workbook here is made up, laid out like the template.
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
for (const f of ['xlsx-0.18.5.full.min.js', 'zones.js', 'manuals.js', 'healthlib.js', 'app.js']) {
  const el = d.createElement('script'); el.textContent = fs.readFileSync(f, 'utf8'); d.body.appendChild(el);
}
d.dispatchEvent(new w.Event('DOMContentLoaded'));
await tick(500);
const $ = id => d.getElementById(id);
const g = e => w.eval('(' + e + ')');
const X = w.XLSX;
w.eval(`deliverDoc = async (html, name) => { window.__doc = {html, name}; }; deliverFile = async (blob, name) => { window.__file = {blob, name}; }`);

const A = 'Example Meats - Dandenong';
await g(`(async () => {
  const list = [{a: '${A}', sub: 'Dandenong', z: 'Z1', foc: 'High', cad: CAD['High'], mgr: 'Ben', rep: '', c: [{n: 'Tom Ward', t: 'Operations Manager'}]}];
  await accReplaceAll(list); indexAccounts(list);
  localStorage.setItem(LS('mgr'), 'Ben Example');
  await loadLists();
})()`);

// ---- a made-up Blue Sheet in the template's layout
const ws = {};
const put = (a, v) => { ws[a] = typeof v === 'number' ? {t: 'n', v} : typeof v === 'boolean' ? {t: 'b', v} : {t: 's', v}; };
put('C2', '© 2005 Miller Heiman, Inc.  All rights reserved.');
put('G2', 'ADEQUACY OF CURRENT POSITION (Enter in cell to the right)'); put('L2', 'Concern');
put('B4', 'Date:'); put('C4', 45962); put('D4', 'Last Updated:'); put('E4', 45989);
put('B5', 'Salesperson:'); put('C5', 'Sam Seller');
put('B6', 'Account/Prospect:'); put('C6', 'Example Meats Dandenong');
put('B7', 'Current Volume:'); put('D7', 'Total Potential Volume:'); put('E7', 'AUD 300k');
put('B8', 'SINGLE SALES OBJECTIVE');
put('B10', 'Product/Service:'); put('C10', 'BONING ROOM UPGRADE');
put('B11', 'Sales Revenue/Units:'); put('C11', 'US$400k');
put('B12', 'Close Date:'); put('C12', 46204);                       // 1 July 2026
put('G4', 'COMPETITION'); put('J4', 'IDEAL CUSTOMER CRITERIA'); put('N4', 'Match to Criteria\n-5 to +5');
put('G6', 'My Position Vs. Competition:');
[['Only Alternative', false], ['Front Runner', false], ['Shared', true], ['Zero', false]].forEach(([t, b], i) => { put('H' + (6 + i), b); put('I' + (6 + i), t); });
put('G10', 'Place in Sales Funnel:');
[['Universe', false], ['Above', false], ['In', true], ['Best Few', false]].forEach(([t, b], i) => { put('H' + (10 + i), b); put('I' + (10 + i), t); });
put('G14', 'Timing for Priorities:');
[['Urgent', false], ['Active', true], ['Work it in', false], ['Later', false]].forEach(([t, b], i) => { put('H' + (14 + i), b); put('I' + (14 + i), t); });
put('J6', '1.'); put('K6', 'Shows interest in total cost of ownership'); put('N6', 3);
put('J7', '2.'); put('K7', 'Willing to share data');
put('J11', 'TOTAL'); put('N11', 3); put('J12', 'Rating:'); put('L12', 'Rate how well your base is covered.');
put('B13', 'BUYING INFLUENCE ROLES\n\n E = Economic'); put('J14', 'Red Flag:'); put('J16', 'Strengths:');
put('B18', 'BUYING INFLUENCES INVOLVED\nName, Title, Location'); put('D18', 'Role'); put('E18', 'Degree of Influence'); put('F18', 'Mode');
put('G18', "BUYING INFLUENCE'S KEY WIN-RESULTS\nThe Win-Results Statement is a short statement"); put('J18', 'HOW WELL IS BASE COVERED?');
put('J19', 'Rating:'); put('L19', 'Evidence to support your Rating:');
put('B20', 'Pat Lead- Group Engineering Manager'); put('D20', 'E/T'); put('E20', 'H'); put('F20', 'OC'); put('G20', 'TBC'); put('J20', -2); put('L20', 'No engagement so far');
put('B21', 'Kim Ops- Site Engineer'); put('D21', 'T'); put('E21', 'M'); put('F21', 'EK'); put('G21', 'Fewer stoppages'); put('L21', 'Friendly');
put('B22', 'Acme Design- Design Consultant- Consultant/OEM'); put('D22', 'T/C'); put('E22', 'M/L'); put('F22', '?');
put('B32', 'SUMMARY OF MY POSITION TODAY'); put('G32', 'POSSIBLE ACTIONS\nA good sales strategy leverages Strengths'); put('J32', 'BEST ACTION PLAN');
put('B34', 'STRENGTHS'); put('J34', 'What'); put('M34', 'Who'); put('N34', 'When');
put('B35', 'Recent project with the engineers'); put('G35', 'Leverage the relationship'); put('J35', 'Book a business review'); put('M35', 'Ben'); put('N35', 'March');
put('B36', 'A loyal OEM');
put('B46', 'RED FLAGS'); put('J46', 'Information Needed'); put('N46', 'From Whom');
put('B47', 'No involvement in the design to date'); put('G47', 'Find a way in'); put('J47', 'Who the users are'); put('N47', 'Kim Ops');
put('B48', 'Unknown consultant');
put('W502', 'MHI Strategic Selling Reinforcement Software, v3.0');
ws['!ref'] = 'B1:W502';
const ex = {};
const put2 = (a, v) => { ex[a] = typeof v === 'number' ? {t: 'n', v} : {t: 's', v}; };
put2('B2', 'BUYING INFLUENCES INVOLVED'); put2('G2', 'IDEAL CUSTOMER CRITERIA'); put2('K2', 'Match to Criteria\n-5 to +5');
put2('B3', 'Name, Title, Location'); put2('C3', 'Role'); put2('D3', 'Degree'); put2('E3', 'Mode'); put2('F3', 'Win-Results Statement');
put2('B4', 'Lee Buyer, Procurement'); put2('C4', 'E'); put2('D4', 'L'); put2('E4', 'G');
put2('G4', '6.'); put2('H4', 'Has budget this year'); put2('K4', -1); put2('G9', 'TOTAL');
put2('B25', 'SUMMARY OF MY POSITION TODAY'); put2('B27', 'STRENGTHS'); put2('G27', 'What'); put2('J27', 'Who'); put2('K27', 'When');
put2('B42', 'RED FLAGS'); put2('G42', 'Information Needed'); put2('K42', 'Whom');
put2('B58', '© 2005 Miller Heiman, Inc.  All rights reserved.');
ex['!ref'] = 'B1:M58';
const nt = {B2: {t: 's', v: 'COMMUNICATION NOTES'}, B3: {t: 's', v: 'Date'}, C3: {t: 's', v: 'Note(s)'}, B4: {t: 'n', v: 46000}, C4: {t: 's', v: 'Called Pat about the layout'}, '!ref': 'B1:C51'};
const wb = X.utils.book_new();
X.utils.book_append_sheet(wb, ws, 'Miller Heiman Blue Sheet');
X.utils.book_append_sheet(wb, ex, 'Extras');
X.utils.book_append_sheet(wb, nt, 'Notes');
const bytes = X.write(wb, {bookType: 'xls', type: 'array'});

// ---- the account offers the import
w.eval(`openAccount('${A}')`); await tick(200);
ok($('avOppImp') && /Import a Blue Sheet/.test($('avOppImp').textContent) && $('bsFile').accept.includes('.xls'), 'the Opportunities card offers Import a Blue Sheet, taking .xls and .xlsx');
const o = await g(`importBlueSheet`)(new w.File([bytes], 'sheet.xls'), A); await tick(100);
ok(o.acct === A && o.name === 'BONING ROOM UPGRADE' && o.value === 'US$400k' && o.close === '2026-07' && o.rep === 'Sam Seller' && o.volPot === 'AUD 300k' && o.volNow === '', 'the objective, value, close, salesperson and volumes come in');
ok(o.posWord === 'Concern' && o.pos == null && o.vsComp === 'Shared' && o.funnel === 'In' && o.timing === 'Active', 'the position word and the three ticked boxes');
ok(o.criteria.length === 3 && o.criteria[0].r === 3 && o.criteria[1].r === null && o.criteria[2].t === 'Has budget this year' && o.criteria[2].r === -1, 'criteria from the form and from Extras, rated or not');
const pat = o.people[0], kim = o.people[1], acme = o.people[2], lee = o.people[3];
ok(o.people.length === 4 && pat.n === 'Pat Lead' && pat.title === 'Group Engineering Manager' && pat.role === 'Signs the order' && pat.role2 === 'Checks the spec' && pat.infl === 'High' && pat.mode === 'Overconfident' && pat.rate === -2 && pat.evid === 'No engagement so far' && pat.win === '', 'a buying influence with two roles, influence, mode, rating and evidence; TBC is left blank');
ok(kim.mode === 'Steady' && kim.win === 'Fewer stoppages' && acme.side === 'oem' && acme.org === 'Acme Design' && acme.role === 'Checks the spec' && acme.role2 === 'On our side' && acme.infl === 'Medium' && acme.mode === '', 'Even Keel reads as Steady; a consultant or OEM goes in the OEM lane; ? is left blank');
ok(lee && lee.n === 'Lee Buyer' && lee.title === 'Procurement' && lee.role === 'Signs the order' && lee.mode === 'Growth', 'and the people on Extras');
ok(o.strengths.map(s => s.t).join('|') === 'Recent project with the engineers|A loyal OEM', 'strengths');
ok(o.flags.length === 2 && o.flags[0].need === 'Who the users are' && o.flags[0].who === 'Kim Ops' && o.flags[1].need === '', 'red flags with the information needed and from whom');
const bestA = o.actions.filter(a => a.best), poss = o.actions.filter(a => !a.best);
ok(bestA.length === 1 && bestA[0].t === 'Book a business review' && bestA[0].who === 'Ben' && bestA[0].when === 'March' && poss.map(a => a.t).join('|') === 'Leverage the relationship|Find a way in', 'the best action plan with who and when, and the possible actions');
ok(o.notes.length === 1 && o.notes[0].t === 'Called Pat about the layout' && /^2025-\d\d-\d\d$/.test(o.notes[0].d), 'the communication notes, dated');
const xs = o.people.map(p => p.x), cust = o.people.filter(p => p.side === 'cust');
ok(cust.every(p => p.x >= 0 && p.x + 184 <= 360) && acme.x >= 380 && acme.y >= 160 && new Set(o.people.map(p => p.x + ',' + p.y)).size === 4, 'people land in their lanes without overlapping, OEMs below the opportunity');
ok((await g(`oppsAll()`)).some(x => x.id === o.id), 'saved as a new opportunity');

// ---- the map shows the position and both roles
w.eval(`openOpp('${o.id}')`); await tick(200);
w.eval(`opSetMode('map')`); await tick(100);
const node = d.querySelector('#opMap .op-node');
ok(node && /Shared · In · Active/.test(node.textContent), 'the opportunity on the map shows where we stand');
const badges = [...d.querySelectorAll('#opMap .op-badge')].map(b => b.textContent);
ok(badges.includes('E/T') && badges.includes('T/C'), 'a card shows both roles, E/T: ' + badges.join(','));
w.eval(`opSelect(null)`); await tick();
ok($('opPanel').querySelector('[data-opchips="vsComp"] .on').dataset.v === 'Shared', 'the map\'s panel has the position chips');
$('opPanel').querySelector('[data-opchips="timing"] [data-v="Urgent"]').click(); await tick(100);
ok(g(`OPP.timing`) === 'Urgent', 'and they change it');

// ---- the sheet: the form's fields
w.eval(`opSetMode('sheet')`); await tick(100);
const sh = $('opSheet');
ok($('bsRep').value === 'Sam Seller' && $('bsVolPot').value === 'AUD 300k' && $('bsWord').value === 'Concern' && sh.querySelector('[data-bschips="funnel"] .on').dataset.v === 'In', 'salesperson, volumes, the word and the chips show');
$('bsVolNow').value = 'AUD 40k'; $('bsVolNow').dispatchEvent(new w.Event('input')); await tick(900);
ok((await g(`oppsAll()`)).find(x => x.id === o.id).volNow === 'AUD 40k', 'typing saves');
sh.querySelector('[data-bschips="vsComp"] [data-v="Front runner"]').click(); await tick(100);
ok(g(`OPP.vsComp`) === 'Front runner', 'a chip changes the position');
ok(/Total <b id="bsCritTot">\+2<\/b>/.test(sh.innerHTML), 'the criteria total adds up');
const c2 = $('opSheet').querySelector('[data-bscrit="1"]'); c2.value = '4'; c2.dispatchEvent(new w.Event('change')); await tick(100);
ok(g(`OPP.criteria[1].r`) === 4 && $('bsCritTot').textContent === '+6', 'rating a criterion updates the total');
$('bsNc').value = 'Runs three shifts'; $('bsNcGo').click(); await tick(100);
ok(g(`OPP.criteria.length`) === 4, 'a criterion is added');
const kimBox = $('opSheet').querySelector('[data-bsp="' + kim.id + '"]'); kimBox.open = true;
kimBox.querySelector('[data-opchips="role2:' + kim.id + '"] [data-v="On our side"]').click(); await tick(100);
ok(g(`OPP.people[1].role2`) === 'On our side', 'a second role is set on the sheet');
const need = $('opSheet').querySelector('[data-bsfl="need:1"]'); need.value = 'Their brief'; need.dispatchEvent(new w.Event('input'));
const who = $('opSheet').querySelector('[data-bsac="who:1"]'); who.value = 'Sam'; who.dispatchEvent(new w.Event('input')); await tick(50);
ok(g(`OPP.flags[1].need`) === 'Their brief' && g(`OPP.actions[1].who`) === 'Sam', 'information needed on a red flag, who on an action');
$('opSheet').querySelector('[data-bsbest="1"]').click(); await tick(100);
ok(g(`OPP.actions.filter(a => a.best).length`) === 2, 'a second action joins the best action plan');
$('bsNd').value = '2026-03-02'; $('bsNn').value = 'Met Kim on site'; $('bsNnGo').click(); await tick(100);
ok(g(`OPP.notes.length`) === 2 && /Met Kim on site/.test($('opSheet').querySelector('.bsnotes li').textContent), 'a communication note is added, newest first');

// ---- Create and share: the traditional Blue Sheet
$('opShare').click(); await tick(50);
ok($('bsoutdlg').hasAttribute('open') && g(`chipVal($('boFmt'))`) === 'Document' && !$('boMapWrap').hidden && !$('boMap').checked, 'Create and share asks Document or Excel, the map off by default');
$('boGo').click(); await tick(300);
const doc = (w.__doc || {}).html || '';
ok(/_blue_sheet_/.test(w.__doc.name) && /@page\{size:A4/.test(doc) && /Strategic analysis/.test(doc), 'an A4 document');
ok(/<td class="l">Salesperson<\/td><td class="v">Sam Seller/.test(doc) && /Total potential volume<\/td><td class="v">AUD 300k/.test(doc) && /<b>Concern<\/b>/.test(doc), 'the form\'s header and the adequacy of position');
ok(/&#9746; Front runner/.test(doc) && /&#9744; Only alternative/.test(doc) && /&#9746; In/.test(doc) && /&#9746; Urgent/.test(doc), 'the competition boxes ticked as on the form');
ok(/<b>Total<\/b><\/td><td><b>\+6<\/b>/.test(doc) && /<td>E\/T<\/td><td>H<\/td><td>OC<\/td>/.test(doc) && /Mode: G growth, T trouble, EK even keel, OC overconfident/.test(doc), 'criteria with the total; influences in the form\'s letters, with the key');
ok(/<td>Unknown consultant<\/td><td>Their brief<\/td>/.test(doc) && /Best action plan<\/h2><table>.*<td>Book a business review<\/td><td>Ben<\/td><td>March<\/td>/.test(doc) && /Communication notes/.test(doc), 'red flags with information needed, the best action plan with who and when, the notes');
ok(!/Relationship map/.test(doc) && !/N\/A/.test(doc) && !/©|Strategic Selling®/.test(doc), 'no map unless asked, no N/A, and no Miller Heiman copyright or mark');
// excel
$('opShare').click(); await tick(50);
$('boFmt').querySelector('[data-v="Excel"]').click(); await tick();
ok($('boMapWrap').hidden && /can't carry the map/.test($('boNote').textContent), 'for Excel the map tick goes, and it says why');
$('boGo').click(); await tick(300);
const f = w.__file || {};
ok(/_blue_sheet_.*\.xlsx$/.test(f.name || '') && f.blob, 'Excel gives an .xlsx');
const back = X.read(new Uint8Array(await f.blob.arrayBuffer()), {type: 'array'});
const M = back.Sheets['Miller Heiman Blue Sheet'];
ok(M && M.L2.v === 'Concern' && M.H7.v === true && M.H6.v === false && M.C10.v === 'BONING ROOM UPGRADE' && M.C5.v === 'Sam Seller' && M.N11.v === 6, 'in the template\'s own cells: the word, the ticked box, the objective, the total');
ok(M.B20.v === 'Pat Lead, Group Engineering Manager' && M.D20.v === 'E/T' && M.J20.v === -2 && M.B47.v === 'No involvement in the design to date' && M.J47.v === 'Who the users are', 'the influences and red flags where the form has them');
ok(back.Sheets.Extras && back.Sheets.Notes && back.Sheets.Notes.C4, 'with Extras and Notes sheets');
const again = await g(`importBlueSheet`)(new w.File([await f.blob.arrayBuffer()], 'again.xlsx'), A);
ok(again.vsComp === 'Front runner' && again.timing === 'Urgent' && again.people.length === 4 && again.people[1].role2 === 'On our side' && again.criteria.length === 4 && again.actions.filter(a => a.best).length === 2 && again.notes.length === 2, 'and the Excel copy imports back');

// ---- the coach reads the new fields
const t = g(`oppText(OPP)`);
ok(/Where we stand: against the competition: Front runner; place in the funnel: In; timing: Urgent/.test(t) && /Ideal customer criteria, each -5 to \+5 \(total \+6\)/.test(t) &&
  /part: Signs the order and Checks the spec/.test(t) && /information needed: Their brief/.test(t) && /Latest communication notes:\n- 2026-03-02: Met Kim on site/.test(t), 'the coach reads the position, the criteria, both roles, the information needed and the notes');

let bad = '';
const other = X.utils.book_new(); X.utils.book_append_sheet(other, X.utils.aoa_to_sheet([['Customer', 'Value'], ['Acme', 3]]), 'Sheet1');
try { await g(`importBlueSheet`)(new w.File([X.write(other, {bookType: 'xlsx', type: 'array'})], 'x.xlsx'), A); } catch(e){ bad = e.message; }
ok(/not a Blue Sheet/.test(bad), 'anything that is not a Blue Sheet is refused: ' + bad);

const real = errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
