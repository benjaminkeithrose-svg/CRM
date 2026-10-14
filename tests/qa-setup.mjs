// v127: setting an opportunity up from a description (Claude reads it, you
// tick what is right, the map fills); a microphone on the Blue Sheet's
// free-text boxes; a bin on the map's toolbar. Claude is stubbed here: what
// it would send back is written out below. Everything here is made up.
import { JSDOM } from 'jsdom';
import fs from 'fs';
import 'fake-indexeddb/auto';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  x ' + m); } };
const tick = (ms = 50) => new Promise(r => setTimeout(r, ms));
const errs = [];
let confirms = [];
const dom = new JSDOM(fs.readFileSync('index.html', 'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g, ''),
  { runScripts: 'dangerously', url: 'https://example.org/' });
const w = dom.window, d = w.document;
w.indexedDB = indexedDB; w.IDBKeyRange = IDBKeyRange; w.Blob = Blob;
w.scrollTo = () => {}; w.alert = () => {}; w.confirm = m => { confirms.push(m); return true; };
w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
w.navigator.storage = { persist: async () => true, persisted: async () => true };
w.URL.createObjectURL = () => 'blob:stub'; w.URL.revokeObjectURL = () => {};
if (!w.HTMLDialogElement.prototype.showModal) w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
if (!w.HTMLDialogElement.prototype.close) w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new w.Event('close')); };
w.Element.prototype.setPointerCapture = () => {};
w.HTMLCanvasElement.prototype.getContext = () => null;
// a browser with speech recognition, so the microphones are drawn
w.webkitSpeechRecognition = class { start() {} stop() {} abort() {} };
w.console.error = (...a) => errs.push(a.join(' ')); w.console.warn = () => {};
for (const f of ['zones.js', 'manuals.js', 'healthlib.js', 'app.js']) {
  const el = d.createElement('script'); el.textContent = fs.readFileSync(f, 'utf8'); d.body.appendChild(el);
}
d.dispatchEvent(new w.Event('DOMContentLoaded'));
await tick(500);
const $ = id => d.getElementById(id);
const g = e => w.eval('(' + e + ')');
const A = 'Example Meats - Dandenong', A2 = 'Example Meats - Bendigo', O = 'Northfield Conveyors';
await g(`(async () => {
  const mk = (a, sub, c) => ({a, sub, z: 'Z1', foc: 'High', cad: CAD['High'], mgr: 'Ben', rep: '', c});
  const list = [mk('${A}', 'Dandenong', [{n: 'Tom Ward', r: 'Operations Manager', t: '', p: '', pk: '', e: []}]),
    mk('${A2}', 'Bendigo', []), mk('${O}', 'Bayswater', [{n: 'Greta Holm', r: 'Design Engineer', t: '', p: '', pk: '', e: []}])];
  await accReplaceAll(list); indexAccounts(list);
  localStorage.setItem(LS('mgr'), 'Ben Example');
  await kvSet('cloudSeeded', true);
  // Kim was on an earlier Blue Sheet at the same customer
  await oppsPut({id: 'prior', acct: '${A}', name: 'Line 2 retrofit', updated: 1000, flags: [], strengths: [], links: [],
    parties: [{id: 'e1', kind: 'end', name: '${A}', acct: '${A}'}, {id: 'i1', kind: 'ilx', name: 'Intralox'}],
    people: [{id: 'k1', party: 'e1', side: 'cust', n: 'Kim Site', title: 'Site Engineer', role: 'Checks the spec', role2: '', stance: 'helps'}]});
  await loadLists();
})()`);

// ---- finding a company in the customer list
ok(g(`acctFind('Northfeild Conveyors', '')`) === O, 'a voice-typed name one letter out still finds the customer');
ok(g(`acctFind('Example Meats', '')`) === '' && g(`acctFind('Example Meats', 'Bendigo')`) === A2, 'a company with two sites needs the site; with it, the right one');
ok(g(`acctFind('Nobody Engineering', '')`) === '', 'someone not in the list stays a name');

// ---- New opportunity: describe it
let asked = null, answer = null;
w.eval(`aiBlocked = () => ''; aiAsk = async p => { window.__asked = p; return window.__answer; };`);
await g(`(async () => { openAccount('${A}'); })()`); await tick(100);
g(`openOppDetails(null)`); await tick();
ok(!$('odDescF').hidden && $('odDescActs').querySelector('.micbtn') && $('odDescGo'), 'New opportunity offers Or describe it, with a microphone and Set it up from this');
w.__answer = {setup: {name: 'Line 3 new build', objective: 'Intralox on the new line, ordered by March', value: 'AUD 400k', close: '2027-03', site: 'Dandenong',
  endPeople: [{n: 'Kim Site', title: ''}, {n: 'Lee Planner', title: 'Project Manager'}],
  heads: [{name: 'Northgate D&C', status: 'Appointed', people: [{n: 'Alex Design', title: 'Lead Engineer'}]}],
  oems: [{name: 'Northfeild Conveyors', status: '', people: [{n: 'Greta Holm', title: ''}, {n: 'Sam New', title: 'Estimator'}]}, {name: 'Wrong Co', status: '', people: []}],
  competition: 'Another supplier quoted on modular belting'}};
$('odName').value = '';
$('odDesc').value = 'the new third line at Dandenong, Northgate are the contractor, the OEMs are Northfield and Wrong Co';
$('odDescGo').click(); await tick(200);
asked = w.__asked;
ok(!$('oppdlg').hasAttribute('open') && $('osdlg').hasAttribute('open'), 'the description moves to Set up, which reads it straight away');
ok(asked && asked.kind === 'oppsetup' && asked.account === A && /third line/.test(asked.text) && /^\d{4}-\d{2}-\d{2}$/.test(asked.today), 'Claude is sent the description, the customer and today\'s date - not the customer list');
const list = () => $('osList').textContent;
ok(!$('osList').hidden && $('osGo').textContent === 'Make the map' && $('osName').value === 'Line 3 new build' && $('osClose').value === '2027-03', 'what it found comes back to check: name, close');
ok(/Northgate D&C/.test(list()) && /Appointed/.test(list()) && /Not in your customer list/.test(list()), 'the head contractor, appointed, not a customer');
ok(new RegExp(O).test(list()) && /Your customer Northfield Conveyors/.test(list()), 'the misspelt OEM matched to the customer list, and it says so');
ok(/Kim Site/.test(list()) && /Lee Planner/.test(list()) && /Another supplier/.test(list()), 'the end user\'s people and the competition');
// untick the wrong OEM: its people go with it
const wrongIdx = g(`OS.items.parties.findIndex(q => q.name === 'Wrong Co')`);
const cb = $('osList').querySelector('[data-os="q:' + wrongIdx + '"]'); cb.checked = false; cb.dispatchEvent(new w.Event('change')); await tick();
ok(g(`OS.items.parties[${wrongIdx}].on`) === false && $('osName').value === 'Line 3 new build', 'unticked; the name typed above survives the redraw');
$('osName').value = 'Line 3 build';
$('osGo').click(); await tick(400);
ok(g(`screen`) === 'opp' && g(`OPP.name`) === 'Line 3 build' && g(`OPP.obj`) === 'Intralox on the new line, ordered by March' && g(`OPP.close`) === '2027-03', 'the map opens with the name and objective');
ok(g(`OPP.parties.map(q => q.kind + ':' + q.name).join('|')`) === 'end:' + A + '|head:Northgate D&C|oem:' + O + '|ilx:Intralox', 'the parties: end user, the head contractor, the one OEM ticked, Intralox');
ok(g(`OPP.parties.find(q => q.kind === 'head').status`) === 'Appointed' && g(`OPP.parties.find(q => q.kind === 'oem').via`) === g(`OPP.parties.find(q => q.kind === 'head').id`) && g(`OPP.parties.find(q => q.kind === 'oem').acct`) === O,
  'the head contractor appointed; the OEM works for it and is the customer account');
const kim = g(`OPP.people.find(p => p.n === 'Kim Site')`);
ok(kim && kim.side === 'cust' && kim.role === 'Checks the spec' && kim.stance === 'helps' && kim.est.join() === 'role,stance' && kim.estFrom === 'Line 2 retrofit' && kim.title === 'Site Engineer',
  'Kim brings what the last Blue Sheet knew, as estimates');
ok(g(`OPP.people.find(p => p.n === 'Greta Holm').title`) === 'Design Engineer' && g(`OPP.people.find(p => p.n === 'Sam New').org`) === O, 'a CRM contact brings their title; everyone under their company');
ok(g(`OPP.comp`) === 'Another supplier quoted on modular belting', 'the competition goes on the Blue Sheet');
await tick(200); ok((await g(`oppsAll()`)).find(o => o.id === g(`OPP.id`)).people.length === 5, 'saved');
await tick(200);
const added = (await g(`peopleAll()`)).map(r => r.acct + ':' + r.n).sort().join('|');
ok(added === A + ':Kim Site|' + A + ':Lee Planner|' + O + ':Sam New', 'new names at customers join the customer list, marked Not in Dynamics yet: ' + added);

// ---- on the map: add from a description
const oid = g(`OPP.id`);
ok(d.querySelector('#opBar [data-desc]') && /Add from a description/.test(d.querySelector('#opBar [data-desc]').textContent), 'the list beside the map offers Add from a description');
d.querySelector('#opBar [data-desc]').click(); await tick();
ok($('osdlg').hasAttribute('open') && !$('osAsk').hidden && $('osActs').querySelector('.micbtn') && $('osGo').textContent === 'Read it', 'it asks for the description, with a microphone');
w.__answer = {setup: {name: '', objective: '', endPeople: [], heads: [{name: 'northgate d&c', status: '', people: [{n: 'Alex Design', title: ''}, {n: 'Jo Buyer', title: 'Procurement'}]}], oems: [], competition: ''}};
$('osText').value = 'at Northgate there is also Jo Buyer in procurement';
$('osGo').click(); await tick(200);
ok(/Already on the map/.test(list()) && $('osGo').textContent === 'Add to the map' && !$('osName'), 'a party already on the map is said so; nothing asks for a name');
$('osGo').click(); await tick(300);
ok(g(`OPP.id`) === oid && g(`OPP.parties.filter(q => q.kind === 'head').length`) === 1 && g(`OPP.people.filter(p => p.n === 'Alex Design').length`) === 1 && g(`OPP.people.some(p => p.n === 'Jo Buyer' && p.org === 'Northgate D&C')`),
  'the party is not added twice, Alex is not added twice, Jo joins them');
// nothing found
d.querySelector('#opBar [data-desc]').click(); await tick();
w.__answer = {setup: {name: '', objective: '', endPeople: [], heads: [], oems: [], competition: ''}};
$('osText').value = 'hmm'; $('osGo').click(); await tick(200);
ok(/Nothing to set up was found/.test($('osMsg').textContent) && !$('osAsk').hidden, 'nothing found: it says so and keeps the description');
$('osCancel').click(); await tick(200);
ok(!$('osdlg').hasAttribute('open'), 'Cancel closes it');

// ---- microphones on the Blue Sheet's boxes
const pid = g(`OPP.people.find(p => p.n === 'Jo Buyer').id`);
g(`(() => { opSel = {t: 'p', id: '${pid}'}; opPanel(); })()`); await tick();
const micFor = id => { const b = $(id); return !!(b && b.parentNode.classList.contains('talk') && b.parentNode.querySelector('.micbtn[data-mic="' + id + '"]')); };
ok(micFor('opPw') && micFor('opPres') && micFor('opPe') && micFor('opPnote'), 'tapping a person: a microphone beside their win, result, evidence and note');
ok(g(`$('opPw').closest('.talk').querySelector('.micbtn').dataset.field`) === 'line' && g(`$('opPnote').closest('.talk').querySelector('.micbtn').dataset.field`) === 'sales', 'one-line boxes tidy as one line; notes as Blue Sheet notes');
g(`opSelect(null)`); await tick();
ok(micFor('opNf') && micFor('opNs'), 'and beside a new red flag and a new strength');
g(`(() => { opMode = 'sheet'; renderOpp(); })()`); await tick(100);
ok(micFor('bsWhy') && micFor('bsComp') && micFor('bsNf') && micFor('bsNa') && micFor('bsNn') && micFor('bsW' + pid), 'on the Blue Sheet: why, competition, the new items, notes, each person\'s win');
ok($('opSheet').querySelectorAll('.talk').length === $('opSheet').querySelectorAll('[data-talk]').length, 'every one of them, once');
g(`openOppDetails(OPP)`); await tick();
ok(micFor('odObj') && $('odDescF').hidden, 'Details: the objective has one; the description box is only for a new one');
$('odOk').click(); await tick(100);

// ---- a bin on the map's toolbar
g(`(() => { opMode = 'map'; renderOpp(); })()`); await tick();
ok(!$('opDelBtn').hidden && $('opDelBtn').getAttribute('aria-label') === 'Delete this opportunity', 'the bin is on the toolbar');
g(`oppSaveSoon()`);                                       // a change still waiting to be saved
confirms = [];
$('opDelBtn').click(); await tick(1000);   // v140: 7 people - the account manager joins Intralox when the map opens
ok(/^Delete the opportunity Line 3 build at Example Meats - Dandenong\?/.test(confirms[0] || '') && /7 people/.test(confirms[0] || ''), 'it names what goes: ' + (confirms[0] || '').split('\n')[0]);
ok(!g(`OPPS.some(o => o.id === '${oid}')`) && !(await g(`oppsAll()`)).some(o => o.id === oid) && g(`screen`) === 'acct', 'deleted, and the waiting save did not bring it back; back on the account');

const real = errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
