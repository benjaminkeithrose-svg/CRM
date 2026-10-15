// v157: the Intralox people list fills itself from the CRM export's account
// managers and representatives (and the team); positions are added by hand; a
// deleted one stays gone. In the Intralox box, Add our people: a tick each,
// grouped by position, the site account managers and the ATL ticked.
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
const S = { a: 'Sample Foods - Northside', b: 'Sample Foods - Westside', c: 'Other Meats - Eastside' };
await g(`(async () => {
  const mk = (a, mgr, rep) => ({a, sub: '', z: 'Z1', foc: 'High', cad: CAD['High'], mgr, rep, c: []});
  const list = [mk('${S.a}', 'Ben Example', 'Rae Rep'), mk('${S.b}', 'Pat Other', ''), mk('${S.c}', 'Ben Example', 'Nobody')];
  await accReplaceAll(list); indexAccounts(list);
  await kvSet('cloudSeeded', true);
  await peoplePut({id: 'sfA', kind: 'staff', n: 'Ada Lead', pos: 'ATL', boss: '', e: '', p: '', added: 1});
  await peoplePut({id: 'sfE', kind: 'staff', n: 'Eli Engineer', pos: 'AE', boss: '', e: '', p: '', added: 1});
  await plansPut({id: 'L1', kind: 'large', name: 'Sample Foods', sites: ['${S.a}', '${S.b}'], atl: 'Ada Lead', objectives: [], actions: [], updated: 1, sitesOn: true, autoCorpChecked: true,
    parties: [{id: 'pa', kind: 'end', name: '${S.a}', acct: '${S.a}', site: true}, {id: 'pb', kind: 'end', name: '${S.b}', acct: '${S.b}', site: true}, {id: 'pi', kind: 'ilx', name: 'Intralox'}],
    people: [], links: []});
  await loadLists();
})()`);
await tick(200);
const names = () => g(`STAFF.map(s => s.n).sort().join()`);

// ---- the list fills from the CRM
ok(names() === 'Ada Lead,Ben Example,Eli Engineer,Pat Other,Rae Rep', 'the CRM\'s account managers and representatives join the list, once each: ' + names());
ok(g(`STAFF.find(s => s.n === 'Ben Example').pos`) === '' && g(`STAFF.find(s => s.n === 'Ben Example').id`) === 'sf-ben-example', 'with no position, and an id made from the name');
ok(!g(`STAFF.some(s => /nobody/i.test(s.n))`), '"Nobody" is not a person');
ok(g(`!!cloudDirty['people/sf-ben-example']`), 'shared with the team like the rest of the list');
ok((await g(`staffFill()`)) === 0 && g(`STAFF.length`) === 5, 'filling again adds nobody');
g(`go('settings')`); await tick(100);
ok(/In the CRM: account manager of 2 accounts/.test($('sfRes').textContent) && /representative on 1/.test($('sfRes').textContent), 'Settings says what the CRM has them as');
// a reassignment's new manager joins too
await g(`(async () => { MGR_OF['${S.b}'] = 'Mo New'; await staffFill(); })()`);
ok(g(`STAFF.some(s => s.n === 'Mo New')`), 'someone an account is reassigned to joins too');
await g(`(async () => { delete MGR_OF['${S.b}']; })()`);
// deleted: gone, and not filled back in
g(`go('settings')`); await tick(80);
$('sfRes').querySelector('[data-sfdel="sf-rae-rep"]').click(); await tick(200);
ok(!g(`STAFF.some(s => s.n === 'Rae Rep')`) && (await g(`peopleAll()`)).find(r => r.id === 'sf-rae-rep').gone === true, 'deleting someone keeps them as gone');
await g(`loadLists()`); await tick(100);
ok(!g(`STAFF.some(s => s.n === 'Rae Rep')`), 'so the next fill does not bring them back');

// ---- Add our people, in the Intralox box
g(`openLap('L1')`); await tick(300);
g(`opSelect({t: 'party', id: 'pi'})`); await tick(80);
ok(!!$('opQours'), 'the Intralox box has Add our people');
$('opQours').click(); await tick(80);
const boxes = () => [...$('opOurs').querySelectorAll('[data-our]')];
const box = n => boxes().find(c => c.parentNode.textContent.includes(n));
const heads = [...$('opOurs').querySelectorAll('label.l')].map(l => l.textContent).join('|');
ok(heads === 'Account team leader|Application engineer|No position yet', 'grouped by position: ' + heads);
ok(box('Ben Example').checked && box('Pat Other').checked && box('Ada Lead').checked && !box('Eli Engineer').checked, 'the sites\' account managers and the account team leader come ticked');
ok(/account manager here/.test(box('Ben Example').parentNode.textContent) && box('Ada Lead').disabled && /in the box/.test(box('Ada Lead').parentNode.textContent), 'and say why; the ATL is already in the box (since v144)');
box('Pat Other').checked = false; box('Eli Engineer').checked = true;
$('opOursGo').click(); await tick(200);
const ours = () => g(`OPP.people.filter(p => p.party === 'pi').map(p => p.n + ':' + (p.sid || '') + ':' + p.title).sort().join('|')`);
ok(ours() === 'Ada Lead:sfA:Account team leader|Ben Example:sf-ben-example:|Eli Engineer:sfE:Application engineer', 'Add ticked puts them in the box, tied to their records: ' + ours());
ok((await g(`plansAll()`)).find(p => p.id === 'L1').people.filter(p => p.party === 'pi').length === 3, 'and saves');
g(`opSelect({t: 'party', id: 'pi'})`); await tick(80);
$('opQours').click(); await tick(80);
ok(box('Eli Engineer').checked && box('Eli Engineer').disabled && /in the box/.test(box('Eli Engineer').parentNode.textContent), 'next time, those in the box show as in it');
$('opOursGo').click(); await tick(200);
ok(g(`OPP.people.filter(p => p.party === 'pi').length`) === 4 && g(`OPP.people.some(p => p.n === 'Pat Other')`), 'a pre-ticked one left ticked is added; nobody twice');

await tick(700);
ok(errs.length === 0, 'no errors', errs.join(' | '));
console.log(`PASS ${pass}` + (fail ? `  FAIL ${fail}` : ''));
process.exit(fail ? 1 : 0);
