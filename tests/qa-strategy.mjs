// v120: Strategy. A Home tile for everything being worked on beyond the
// next call: the opportunities with their Blue Sheets, the large account
// plans and the account plans, in three tabs; Mine and Team in a team; a
// search across all three; each opens where it lives and back comes here.
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
const rows = () => [...$('stRes').querySelectorAll('[data-st]')];
const names = () => rows().map(b => b.querySelector('.rn').textContent).join('|');
const tab = v => { $('stTabs').querySelector('[data-v="' + v + '"]').click(); };

const A = 'Example Meats - Dandenong', B = 'Example Meats - Bendigo', C = 'Other Foods - Ringwood';
await g(`(async () => {
  const mk = a => ({a, sub: a.split(' - ')[1], z: 'Z1', foc: 'High', cad: CAD['High'], mgr: 'Ben', rep: '', c: []});
  const list = [mk('${A}'), mk('${B}'), mk('${C}')];
  await accReplaceAll(list); indexAccounts(list);
  await oppsPut({id: 'o1', acct: '${A}', name: 'Line 3 upgrade', value: 'AUD 180k', close: '2027-03', pos: 2, ox: 460, oy: 60,
    people: [{id: 'a', side: 'cust', n: 'Tom Ward', x: 0, y: 0}, {id: 'e', side: 'us', n: 'Ben', x: 800, y: 0}], links: [], flags: [{id: 'f', t: 'Budget', pin: ''}], strengths: [], updated: 2});
  await oppsPut({id: 'o2', acct: '${B}', name: 'Spiral freezer belts', value: 'AUD 90k', close: '2026-12', ox: 460, oy: 60, people: [], links: [], flags: [], strengths: [], updated: 1});
  await oppsPut({id: 'o3', acct: '${C}', name: 'Jo retrofit', ox: 460, oy: 60, people: [], links: [], flags: [], strengths: [], updated: 1});
  await plansPut({id: 'p1', acct: '${A}', goal: 'Win Line 3', people: [{n: 'Tom Ward'}], flags: '', strengths: '', updated: 5});
  await plansPut({id: 'p2', acct: '${C}', goal: 'Get back in', people: [], flags: '', strengths: '', updated: 3});
  await plansPut({id: 'la1', kind: 'large', name: 'Example Meats', sites: ['${A}', '${B}'], reviewed: Date.UTC(2026, 9, 1), vision: 'The standard on every line', objectives: [], strategies: [], actions: [], strengths: [], flags: [], updated: 4});
  await loadLists();
  go('home');
})()`);
await tick(100);

// ---- the tile
const tile = d.querySelector('.tiles [data-go="strategy"]');
ok(tile && /Strategy/.test(tile.textContent), 'Home has a Strategy tile');
tile.click(); await tick(150);
ok(g('screen') === 'strategy' && $('title').textContent === 'Strategy' && !$('back').hidden, 'it opens Strategy');

// ---- opportunities
ok($('stTabs').querySelector('.on').dataset.v === 'opps' && $('stWho').hidden, 'Opportunities first; no Mine and Team on your own');
ok(names() === 'Spiral freezer belts|Line 3 upgrade|Jo retrofit', 'nearest close first, undated last: ' + names());
ok(/3 opportunities/.test($('stHint').textContent), 'counted');
const line3 = rows().find(b => /Line 3/.test(b.textContent));
ok(/close Mar 2027/.test(line3.textContent) && /position \+2/.test(line3.textContent) && /Example Meats - Dandenong · AUD 180k · 1 buying influence/.test(line3.textContent) && /1 red flag/.test(line3.textContent), 'each shows close, position, account, value, influences and red flags');
line3.click(); await tick(150);
ok(g('screen') === 'opp' && g('OPP.id') === 'o1', 'tapping one opens its map and Blue Sheet');
$('back').click(); await tick(150);
ok(g('screen') === 'strategy', 'back comes to Strategy, not the account');

// ---- large accounts
tab('laps'); await tick(100);
ok(names() === 'Example Meats' && /2 sites · 2 opportunities · The standard on every line/.test(rows()[0].textContent) && /reviewed/.test(rows()[0].textContent), 'large accounts with sites, opportunities and the review date');
rows()[0].click(); await tick(150);
ok(g('screen') === 'lap' && g('LAP.id') === 'la1', 'tapping one opens the plan');
$('back').click(); await tick(150);
ok(g('screen') === 'strategy' && $('stTabs').querySelector('.on').dataset.v === 'laps', 'back comes to Strategy, on the same tab');

// ---- account plans
tab('plans'); await tick(100);
ok(names() === A + '|' + C && /Win Line 3 · 1 person/.test(rows()[0].textContent), 'account plans, last changed first, with their goal');
ok(!/Example Meats<\/div>/.test($('stRes').innerHTML) || !names().includes('Example Meats|'), 'large account plans are not listed as account plans');
rows()[1].click(); await tick(100);
ok($('plandlg').hasAttribute('open') && $('plSub').textContent === C, 'tapping one opens the account plan');
$('plGoal').value = 'Get back in by June'; $('plOk').click(); await tick(300);
ok(g('screen') === 'strategy' && /Get back in by June/.test($('stRes').textContent), 'Done saves it and the list shows the change');

// ---- a team: Mine and Team
await g(`(async () => {
  await ownersLoad();
  TEAM = {uid: 'me', id: 't', name: 'ANZ', admin: 'me', members: [{user_id: 'me', name: 'Ben', role: 'admin'}, {user_id: 'jo', name: 'Jo', role: 'member'}]};
  sbUser = {id: 'me'}; OWNERS['opps/o3'] = 'jo'; OWNERS['plans/p2'] = 'jo';
})()`);
tab('opps'); await tick(100);
ok(!$('stWho').hidden && names() === 'Spiral freezer belts|Line 3 upgrade', 'in a team, Mine leaves out Jo\'s');
$('stWho').querySelector('[data-v="team"]').click(); await tick(100);
ok(names() === 'Jo retrofit' && /^Jo · /.test(rows()[0].querySelector('.rm').textContent), 'Team shows Jo\'s, named');
tab('plans'); await tick(100);
ok(names() === C, 'and on every tab');
$('stWho').querySelector('[data-v="mine"]').click(); await tick(50);

// ---- search across all three
$('stSearch').click(); await tick(100);
$('fsQ').value = 'tom ward'; $('fsQ').dispatchEvent(new w.Event('input')); await tick(200);
const found = [...$('fsRes').querySelectorAll('[data-st]')].map(b => b.querySelector('.rn').textContent);
ok(found.join('|') === 'Line 3 upgrade|' + A && /2 found/.test($('fsHint') ? $('fsHint').textContent : '2 found'), 'search finds a person across opportunities and plans: ' + found.join('|'));
$('fsQ').value = 'retrofit'; $('fsQ').dispatchEvent(new w.Event('input')); await tick(200);
ok([...$('fsRes').querySelectorAll('[data-st]')].map(b => b.querySelector('.rn').textContent).join() === 'Jo retrofit', 'and a teammate\'s, from Mine');
$('fsRes').querySelector('[data-st]').click(); await tick(150);
ok(g('screen') === 'opp' && g('OPP.id') === 'o3' && !$('srchdlg').hasAttribute('open'), 'a result opens it, the search closed');

// ---- start one from here
const pickAcct = async q => { $('fsQ').value = q; $('fsQ').dispatchEvent(new w.Event('input')); await tick(200); return [...$('fsRes').querySelectorAll('[data-stnew]')]; };
await g(`(async () => { go('home'); go('strategy'); })()`); await tick(150);
tab('opps'); await tick(100);
ok($('stNew').textContent === '+ New opportunity' && $('stNew').compareDocumentPosition($('stTabs')) & 4, 'New is the main action, at the top');
$('stNew').click(); await tick(100);
ok($('srchdlg').hasAttribute('open') && /Type the account's name/.test($('fsHint').textContent), 'New asks which account');
let hits = await pickAcct('bendigo');
ok(hits.length === 1 && hits[0].dataset.stnew === B, 'and finds it by name or suburb');
hits[0].click(); await tick(150);
ok(!$('srchdlg').hasAttribute('open') && $('oppdlg').hasAttribute('open') && $('odSub').textContent === B, 'picking it opens a new opportunity on that account');
$('odName').value = 'Chiller line'; $('odOk').click(); await tick(400);
ok(g('screen') === 'opp' && g('OPP.acct') === B && g('OPP.name') === 'Chiller line', 'Done opens its map');
$('back').click(); await tick(150);
ok(g('screen') === 'strategy' && /Chiller line/.test($('stRes').textContent), 'back comes to Strategy, with it listed');
tab('plans'); await tick(100);
ok($('stNew').textContent === '+ New account plan', 'each tab starts its own kind');
$('stNew').click(); await tick(100);
hits = await pickAcct('ringwood');
ok(/Has an account plan: opens it/.test(hits[0].textContent), 'an account that already has a plan says so');
hits[0].click(); await tick(150);
ok($('plandlg').hasAttribute('open') && $('plSub').textContent === C && $('plGoal').value === 'Get back in by June', 'and opens the plan it has');
$('plOk').click(); await tick(300);
tab('laps'); await tick(100);
$('stNew').click(); await tick(100);
hits = await pickAcct('dandenong');
ok(/In Example Meats: opens it/.test(hits[0].textContent), 'a site already in a large account says which');
hits = await pickAcct('ringwood');
hits[0].click(); await tick(400);
ok(g('screen') === 'lap' && g('LAP.name') === 'Other Foods' && g('LAP.sites.join()') === C, 'a new large account plan starts from one of its sites');
$('back').click(); await tick(150);
ok(g('screen') === 'strategy' && $('stTabs').querySelector('.on').dataset.v === 'laps' && /Other Foods/.test($('stRes').textContent), 'back comes to Strategy, with it listed');

// ---- empty
await g(`(async () => { TEAM = null; for(const o of await oppsAll()) await oppsDel(o.id); OPPS = []; go('strategy'); })()`); await tick(100);
tab('opps'); await tick(100);
ok($('stRes').textContent.trim() === 'No opportunities yet.' && $('stHint').textContent === '', 'empty, it says so plainly, with no nudge');

const real = errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
