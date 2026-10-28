// v129: a large account's map shows each of its sites as its own box, kept
// in step with the plan's site list, and a Corporate kind of box (head
// office, the group) that drives them. An old map's group box becomes its
// corporate account, people and all. Everything here is made up.
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
for (const f of ['zones.js', 'manuals.js', 'healthlib.js', 'app.js']) {
  const el = d.createElement('script'); el.textContent = fs.readFileSync(f, 'utf8'); d.body.appendChild(el);
}
d.dispatchEvent(new w.Event('DOMContentLoaded'));
await tick(500);
const $ = id => d.getElementById(id);
const g = e => w.eval('(' + e + ')');
const S = ['Sample Poultry - Tamworth', 'Sample Poultry - Hanwood', 'Sample Poultry - Laverton'];
await g(`(async () => {
  const mk = (a, sub, c) => ({a, sub, z: 'Z1', foc: 'High', cad: CAD['High'], mgr: 'Ben', rep: '', c: c || []});
  const list = [mk('${S[0]}', 'Tamworth', [{n: 'Kim Site', r: 'Site Manager', t: '', p: '', pk: '', e: []}]), mk('${S[1]}', 'Hanwood'), mk('${S[2]}', 'Laverton'), mk('Sample Poultry - Head Office', 'Head Office')];
  await accReplaceAll(list); indexAccounts(list);
  localStorage.setItem(LS('mgr'), 'Ben Example');
  await kvSet('cloudSeeded', true);
  await oppsPut({id: 'o1', acct: '${S[1]}', name: 'Third line', people: [{id: 'x1', side: 'cust', n: 'Pat Plant', title: 'Plant Engineer'}], links: [], flags: [], strengths: [], updated: 1});
  // an old map: one box for the group, someone under it
  await plansPut({id: 'L1', kind: 'large', name: 'Sample Poultry', sites: ['${S[0]}', '${S[1]}'], objectives: [], actions: [], updated: 1,
    parties: [{id: 'pe', kind: 'end', name: 'Sample Poultry', acct: ''}, {id: 'pi', kind: 'ilx', name: 'Intralox'}],
    people: [{id: 'g1', party: 'pe', side: 'cust', n: 'Group Engineer', title: 'Group Engineering Manager'}], links: [], ox: 435, oy: 330});
  // a new one, never opened: its people come from the sites' opportunities
  await plansPut({id: 'L2', kind: 'large', name: 'Sample Poultry North', sites: ['${S[1]}'], objectives: [], actions: [], updated: 1});
  await loadLists();
})()`);

// ---- an old map opens with its sites, and the group box is the corporate account
g(`openLap('L1')`); await tick(200);
ok(g(`OPP.parties.map(q => q.kind + ':' + (q.site ? 'site:' : '') + q.name).join('|')`) === 'corp:Sample Poultry|end:site:' + S[0] + '|end:site:' + S[1] + '|ilx:Intralox',
  'the group box is now Corporate; each site has its own box');
ok(g(`OPP.people.find(p => p.id === 'g1').party`) === 'pe' && g(`OPP.people.find(p => p.id === 'g1').side`) === 'cust', 'the person under it stayed with it');
const links = g(`JSON.stringify(opPartyLinks(OPP))`);
ok((links.match(/"a":"pe","b":"ps[^"]+"/g) || []).length === 2 && !/OPP/.test(links), 'Corporate drives each site; nothing hangs off a box for the account itself (v131)');
ok($('opMap').querySelectorAll('.op-party').length === 4, 'drawn: four boxes');
ok(g(`opPartySuggest(OPP.parties.find(q => q.id === 'pe')).map(x => x.n).join()`) === 'Kim Site', 'Corporate\'s people are offered from the sites\' contacts, not the OEMs\'');
ok([...$('opMap').querySelectorAll('.op-pname')].some(t => /^Sample Poultry - Tamwor/.test(t.textContent)) && /Site · 1 opportunity/.test($('opMap').textContent), 'a site is named by its account name (v138), with how many opportunities it has');
ok([...d.querySelectorAll('#opBar .nm')].some(b => /^Tamworth\b/.test(b.textContent) && b.title === S[0]), 'the narrow side list drops the group name from a site: Tamworth, full name on hover (v138)');
ok(/Sites/.test(d.querySelector('#opBar').textContent) && !d.querySelector('#opBar [data-addparty="end"]') && d.querySelector('#opBar [data-addparty="corp"]'), 'the list calls them Sites, from the plan; Corporate can be added');
// a site's panel
const han = g(`OPP.parties.find(q => q.acct === '${S[1]}').id`);
g(`opSelect({t: 'party', id: '${han}'})`); await tick();
ok(/^Site/.test($('opPanel').textContent) && $('opQn').readOnly && !$('opQrm') && !$('opPanel').querySelector('[data-opchips="qkind"]') && $('opQplan') && /Start its account plan/.test($('opQplan').textContent),
  'tapping a site: Site, its name fixed, no Remove, a way to its account plan');
ok($('opPanel').querySelector('[data-qopp="o1"]') && /Third line/.test($('opPanel').textContent), 'and its opportunities, each one tap away');
$('opPanel').querySelector('[data-qopp="o1"]').click(); await tick(150);
ok(g(`screen`) === 'opp' && g(`OPP.id`) === 'o1', 'which opens it');
// the plan gains a site, loses one: the map follows; a site with people stays
await g(`(async () => { const L = PLANS.find(p => p.id === 'L1'); L.sites = ['${S[1]}', '${S[2]}']; L.people.push({id: 'k9', party: L.parties.find(q => q.acct === '${S[1]}').id, side: 'cust', n: 'Hana Line', title: ''}); await plansPut(JSON.parse(JSON.stringify(L))); })()`);
g(`openLap('L1')`); await tick(200);
ok(g(`OPP.parties.filter(q => q.site).map(q => q.acct).join('|')`) === S[1] + '|' + S[2] && !g(`OPP.parties.some(q => q.acct === '${S[0]}')`), 'a site added to the plan appears; one taken out, with nobody under it, goes');
await g(`(async () => { const L = PLANS.find(p => p.id === 'L1'); L.sites = ['${S[2]}']; })()`);
g(`opEnsure(OPP)`);
ok(g(`OPP.parties.some(q => q.acct === '${S[1]}' && !q.site)`) && g(`OPP.people.some(p => p.n === 'Hana Line')`), 'one taken out with people under it stays, no longer marked a site, so nobody is lost');
// the corporate kind: picked from the panel, offered the sites' contacts
const corp = 'pe';
g(`opSelect({t: 'party', id: '${corp}'})`); await tick();
ok($('opPanel').querySelector('[data-opchips="qkind"] [data-v="Corporate"].on') && $('opQrm'), 'Corporate is one of What they are, and it can be removed');

// ---- v131: a site can be the head office; a group function covers some sites
await g(`(async () => { const L = PLANS.find(p => p.id === 'L1'); L.sites = ['${S[0]}', '${S[1]}', '${S[2]}']; })()`);
g(`openLap('L1')`); await tick(200);
ok(!$('opMap').querySelector('.op-node'), 'no box for the large account itself: its name is the title');
const s2 = g(`OPP.parties.find(q => q.acct === '${S[2]}').id`);
g(`opSelect({t: 'party', id: '${s2}'})`); await tick();
$('opQhq').checked = true; $('opQhq').dispatchEvent(new w.Event('change')); await tick(100);
ok(g(`OPP.parties.find(q => q.id === '${s2}').hq`) === true && /Head office/.test($('opMap').textContent), 'a site ticked Head office here says so');
const lk = () => g(`JSON.stringify(opPartyLinks(OPP))`);
ok(lk().includes('"a":"' + s2 + '","b":"' + g(`OPP.parties.find(q => q.acct === '${S[0]}').id`) + '"') && g(`opTops(OPP).map(q => q.id).join()`) === 'pe,' + s2, 'it joins corporate at the top and drives the other sites');
ok(g(`opLayout()['${s2}'].y`) < g(`opLayout()[OPP.parties.find(q => q.acct === '${S[0]}').id].y`), 'drawn above them');
g(`opAddParty('grp', 'Group Engineering')`); await tick();
const gid = g(`OPP.parties.find(q => q.kind === 'grp').id`);
ok(/Group function/.test($('opPanel').textContent) && $('opQcov').querySelector('[data-v=""].on'), 'a group function covers all sites to start');
$('opQcov').querySelector('[data-v="' + g(`OPP.parties.find(q => q.acct === '${S[0]}').id`) + '"]').click(); await tick(100);
const covered = g(`OPP.parties.find(q => q.id === '${gid}').covers.join()`);
ok(covered === g(`OPP.parties.find(q => q.acct === '${S[0]}').id`), 'tick a site and it covers just that one');
const L2 = lk(), t0 = g(`OPP.parties.find(q => q.acct === '${S[0]}').id`);
ok(L2.includes('"a":"' + gid + '","b":"' + t0 + '"') && !L2.includes('"a":"pe","b":"' + t0 + '"') && L2.includes('"a":"pe","b":"' + gid + '"'), 'the covered site hangs from the group function, which hangs from the top');
ok(/Group functions/.test(d.querySelector('#opBar').textContent), 'the list has Group functions on a large account');
g(`openOpp('o1')`); await tick(150);
ok(!/Group functions/.test(d.querySelector('#opBar').textContent), 'but not on an ordinary opportunity');

// ---- a new map: people from the sites' opportunities go under their site
g(`openLap('L2')`); await tick(200);
ok(g(`OPP.parties.map(q => q.kind).join()`) === 'end,ilx' && g(`OPP.people.find(p => p.n === 'Pat Plant').party`) === g(`OPP.parties.find(q => q.site).id`),
  'Pat, from the Hanwood opportunity, sits under Hanwood; a new map has no made-up Corporate box (v138)');
// v138: a map saved by v137 with that made-up, unused box loses it once
await g(`(async () => { await plansPut({id: 'L3', kind: 'large', name: 'Sample Poultry West', sites: ['${S[2]}'], objectives: [], actions: [], updated: 1, sitesOn: true,
  parties: [{id: 'pe', kind: 'corp', name: 'Sample Poultry West', acct: ''}, {id: 'pz', kind: 'end', name: '${S[2]}', acct: '${S[2]}', site: true}, {id: 'pi', kind: 'ilx', name: 'Intralox'}], people: [], links: []}); await loadLists(); })()`);
g(`openLap('L3')`); await tick(200);
ok(g(`OPP.parties.map(q => q.kind).join()`) === 'end,ilx', 'an unused made-up Corporate box from before is taken away');
// one somebody used (people under it) stays
await g(`(async () => { await plansPut({id: 'L4', kind: 'large', name: 'Sample Poultry East', sites: ['${S[2]}'], objectives: [], actions: [], updated: 1, sitesOn: true,
  parties: [{id: 'pe', kind: 'corp', name: 'Sample Poultry East', acct: ''}, {id: 'pz', kind: 'end', name: '${S[2]}', acct: '${S[2]}', site: true}, {id: 'pi', kind: 'ilx', name: 'Intralox'}],
  people: [{id: 'u1', party: 'pe', side: 'cust', n: 'Group CEO', title: ''}], links: []}); await loadLists(); })()`);
g(`openLap('L4')`); await tick(200);
ok(g(`OPP.parties.some(q => q.id === 'pe' && q.kind === 'corp')`), 'one with people under it stays');

// ---- on an ordinary opportunity, a corporate account drives the end user
await g(`(async () => { openAccount('${S[0]}'); OPPS.push({id: 'o2', acct: '${S[0]}', name: 'Hygiene upgrade', people: [], links: [], flags: [], strengths: [], lapOff: true}); openOpp('o2'); })()`); await tick(200);
g(`opAddParty('corp', 'Sample Poultry - Head Office')`); await tick();
ok(/"a":"OPP","b":"pe","t":"Owns it"/.test(g(`JSON.stringify(opPartyLinks(OPP))`)) && g(`JSON.stringify(opPartyLinks(OPP))`).includes('"t":"Drives"') && g(`OPP.parties.find(q => q.kind === 'corp').acct`) === 'Sample Poultry - Head Office',
  'Corporate from the customer list drives the end user');

const real = errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
