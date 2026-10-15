// v154: the same OEM, head contractor or consultant on every map. One shared
// company record (store people, kind org) holds its people, who they report
// to, and their relationships with ours; every large account plan and Blue
// Sheet with a box for it shows the same; the deal's own parts stay per map.
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
const S = { a: 'Sample Foods - Northside', b: 'Other Meats - Eastside' };
const OEM = 'Northfield Conveyors';
const P = (id, n, party, side, x) => Object.assign({id, n, title: '', party, side, stance: 'unknown', mode: '', rate: 0, note: '', win: '', result: '', evid: ''}, x || {});
await g(`(async () => {
  const mk = (a, mgr) => ({a, sub: '', z: 'Z1', foc: 'High', cad: CAD['High'], mgr, rep: '', c: []});
  const list = [mk('${S.a}', 'Ben Example'), mk('${S.b}', 'Ben Example')];
  await accReplaceAll(list); indexAccounts(list);
  await kvSet('cloudSeeded', true);
  const P = ${P.toString()};
  // two large accounts that both use the same OEM, each with its own copy of its people
  await plansPut({id: 'L1', kind: 'large', name: 'Sample Foods', sites: ['${S.a}'], objectives: [], actions: [], updated: 1000, sitesOn: true, autoCorpChecked: true,
    parties: [{id: 'pa', kind: 'end', name: '${S.a}', acct: '${S.a}', site: true}, {id: 'po1', kind: 'oem', name: '${OEM}', belts: ['Intralox']}, {id: 'pi', kind: 'ilx', name: 'Intralox'}],
    people: [P('u1', 'Ben Example', 'pi', 'us'), P('n1', 'Lee Build', 'po1', 'oem', {title: 'Design Engineer', role: 'Checks the spec'}), P('n2', 'Dana Quote', 'po1', 'oem', {boss: 'n1'})],
    links: [{id: 'k1', a: 'u1', b: 'n1', kind: 'Our coverage', str: 'Weak', note: ''}]});
  await plansPut({id: 'L2', kind: 'large', name: 'Other Meats', sites: ['${S.b}'], objectives: [], actions: [], updated: 2000, sitesOn: true, autoCorpChecked: true,
    parties: [{id: 'pb', kind: 'end', name: '${S.b}', acct: '${S.b}', site: true}, {id: 'po2', kind: 'oem', name: 'northfield conveyors', belts: ['Intralox', 'Habasit']}, {id: 'pi', kind: 'ilx', name: 'Intralox'}],
    people: [P('u2', 'Ben Example', 'pi', 'us'), P('m1', 'Lee Build', 'po2', 'oem', {title: 'Engineering Manager'}), P('m3', 'Chris Weld', 'po2', 'oem')],
    links: [{id: 'k2', a: 'u2', b: 'm1', kind: 'Our coverage', str: 'Strong', note: ''}]});
  // a test project with the same name stays out of it
  await oppsPut({id: 'T1', test: true, acct: '${S.a}', name: 'Test project', parties: [{id: 'tq', kind: 'oem', name: '${OEM}'}, {id: 'pi', kind: 'ilx', name: 'Intralox'}],
    people: [P('t1', 'Testy McTest', 'tq', 'oem')], links: [], updated: 3000});
  await loadLists();
})()`);
await tick(200);
const org = () => g(`ORGS.filter(r => /northfield/i.test(r.n))`);
const map = id => g(`PLANS.find(p => p.id === '${id}') || OPPS.find(p => p.id === '${id}')`);
const ppl = (id, party) => map(id).people.filter(p => p.party === party);

// ---- the first load makes them one company
ok(org().length === 1 && org()[0].kind === 'org', 'the same OEM on two large accounts becomes one company record', org().length);
const R = org()[0];
ok(R.people.map(p => p.n).sort().join() === 'Chris Weld,Dana Quote,Lee Build', 'with everyone from both maps, once', R.people.map(p => p.n).join());
ok(!R.people.some(p => p.n === 'Testy McTest'), 'a test project stays out of it');
const lee = R.people.find(p => p.n === 'Lee Build');
ok(lee.title === 'Engineering Manager', 'where the two copies differed, the newer map wins', lee.title);
ok(ppl('L1', 'po1').map(p => p.n).sort().join() === 'Chris Weld,Dana Quote,Lee Build' && ppl('L2', 'po2').map(p => p.n).sort().join() === 'Chris Weld,Dana Quote,Lee Build', 'both maps now show all three');
ok(ppl('L1', 'po1').find(p => p.n === 'Lee Build').id === ppl('L2', 'po2').find(p => p.n === 'Lee Build').id, 'as the same person, with one id');
ok(ppl('L2', 'po2').find(p => p.n === 'Dana Quote').boss === ppl('L2', 'po2').find(p => p.n === 'Lee Build').id, 'who reports to whom comes too');
const l1 = map('L1').links.filter(l => l.kind === 'Our coverage'), l2 = map('L2').links.filter(l => l.kind === 'Our coverage');
ok(l1.length === 1 && l2.length === 1 && l1[0].str === 'Strong' && l2[0].str === 'Strong', 'our relationship with them is one, and the newer rating wins', l1.map(l => l.str).join() + '/' + l2.map(l => l.str).join());
ok(ppl('L1', 'po1').find(p => p.n === 'Lee Build').role === 'Checks the spec' && !ppl('L2', 'po2').find(p => p.n === 'Lee Build').role, 'their part in each decision stays with each map');
ok(JSON.stringify(map('L1').parties.find(q => q.id === 'po1').belts) === JSON.stringify(['Intralox', 'Habasit']), 'the belting they prefer is the company\'s');
const saved = (await g(`peopleAll()`)).filter(r => r.kind === 'org');
ok(saved.length === 1 && g(`!!cloudDirty['people/' + ORGS[0].id]`), 'kept in the people store and marked to sync to the team');

// ---- a change on one map reaches the other
g(`openLap('L1')`); await tick(300);
g(`opSelect({t: 'party', id: 'po1'})`); await tick(80);
ok(/Also on 1 other map: Other Meats \(large account\)/.test($('opPanel').textContent), 'the box says which other maps it is on', $('opPanel').querySelector('.orghere') && $('opPanel').querySelector('.orghere').textContent);
await g(`(async () => { const p = OPP.people.find(x => x.n === 'Chris Weld'); p.title = 'Workshop Manager'; await oppSaveNow(); })()`); await tick(300);
ok(ppl('L2', 'po2').find(p => p.n === 'Chris Weld').title === 'Workshop Manager', 'a new title on one map shows on the other');
ok((await g(`plansAll()`)).find(p => p.id === 'L2').people.find(p => p.n === 'Chris Weld').title === 'Workshop Manager', 'and is saved there');
// a new person and a new relationship
await g(`(async () => { OPP.people.push({id: 'new1', n: 'Robin Price', title: 'Purchasing', party: 'po1', side: 'oem', stance: 'unknown'});
  OPP.people.push({id: 'us9', n: 'Sasha Engineer', title: '', party: 'pi', side: 'us'});
  OPP.links.push({id: 'k9', a: 'us9', b: 'new1', kind: 'Our coverage', str: 'Neutral', note: ''}); await oppSaveNow(); })()`); await tick(300);
ok(ppl('L2', 'po2').some(p => p.n === 'Robin Price'), 'someone added to the OEM on one map is on the other');
const sas = map('L2').people.find(p => p.n === 'Sasha Engineer');
ok(sas && sas.side === 'us' && map('L2').links.some(l => l.a === sas.id && l.b === 'new1' && l.str === 'Neutral'), 'with our relationship, and the person of ours joins Intralox there');
// a rating, and someone taken off
await g(`(async () => { OPP.links.find(l => l.id === 'k9').str = 'Strong'; opDropPeople([OPP.people.find(p => p.n === 'Dana Quote').id]); await oppSaveNow(); })()`); await tick(300);
ok(map('L2').links.find(l => l.b === 'new1').str === 'Strong', 'a rating changed on one map changes on the other');
ok(!ppl('L2', 'po2').some(p => p.n === 'Dana Quote') && !org()[0].people.some(p => p.n === 'Dana Quote'), 'someone taken off the company on one map is off it everywhere');
// per map: their part in the decision
await g(`(async () => { OPP.people.find(p => p.n === 'Robin Price').role = 'Signs the order'; await oppSaveNow(); })()`); await tick(300);
ok(!ppl('L2', 'po2').find(p => p.n === 'Robin Price').role, 'their part in this decision does not go to the other map');
// the person's remove warning
g(`opSelect({t: 'p', id: OPP.people.find(p => p.n === 'Robin Price').id})`); await tick(80);
$('opRm').click(); await tick(50);
ok(/one of Northfield Conveyors's people, and it is on 1 other map: this takes them off those too/.test($('opPanel').textContent), 'taking someone off says it takes them off the other maps');
$('opRmN').click(); await tick(50);

// ---- taking the box off a map leaves the company alone
await g(`(async () => { opDropPeople(OPP.people.filter(p => p.party === 'po1').map(p => p.id)); OPP.parties = OPP.parties.filter(q => q.id !== 'po1'); await oppSaveNow(); })()`); await tick(300);
ok(ppl('L2', 'po2').length === 3 && org()[0].people.length === 3, 'removing the OEM from one map leaves its people on the other, and on the company');

// ---- a Blue Sheet that adds the same OEM gets its people
await g(`(async () => { await oppsPut({id: 'B1', acct: '${S.b}', name: 'Line 3', lapOff: true, parties: [{id: 'pe', kind: 'end', name: '${S.b}', acct: '${S.b}'}, {id: 'pi', kind: 'ilx', name: 'Intralox'}], people: [], links: [], flags: [], strengths: [], updated: 5});
  OPPS = await oppsAll(); })()`);
g(`openOpp('B1')`); await tick(300);
g(`opAddParty('oem', '${OEM}')`); await tick(400);
ok(ppl('B1', g(`OPP.parties.find(q => q.kind === 'oem').id`)).map(p => p.n).sort().join() === 'Chris Weld,Lee Build,Robin Price', 'adding the same OEM to a Blue Sheet brings its people', ppl('B1', g(`OPP.parties.find(q => q.kind === 'oem').id`)).map(p => p.n).join());
ok(g(`OPP.links.some(l => l.str === 'Strong' && OPP.people.find(p => p.id === l.a && p.n === 'Sasha Engineer'))`), 'and our relationships with them');

// ---- the test project is left alone
ok(map('T1').people.length === 1 && !map('T1').parties[0].org, 'a test project is not touched');

// ---- two devices that each made the record: one is kept
await g(`(async () => { const r = {id: 'ogDup', kind: 'org', pk: 'oem', n: '${OEM}', acct: '', added: Date.now() + 1, people: [{id: 'zz', n: 'Pat Late', title: '', boss: '', cid: '', at: 1}], links: []};
  ORGS.push(r); await peoplePut(r); orgDedupe(); })()`); await tick(200);
ok(org().length === 1 && org()[0].people.some(p => p.n === 'Pat Late'), 'a second record of the same company is folded into the first');
ok((await g(`peopleAll()`)).find(r => r.id === 'ogDup').merged === org()[0].id, 'and marked as merged into it, not deleted (a team member cannot delete a colleague\'s record)');
await g(`loadLists()`); await tick(200);
ok(org().length === 1, 'a merged record is not loaded again');

await tick(800);
ok(errs.length === 0, 'no errors', errs.join(' | '));
console.log(`PASS ${pass}` + (fail ? `  FAIL ${fail}` : ''));
process.exit(fail ? 1 : 0);
