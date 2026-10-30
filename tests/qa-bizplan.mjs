// v189: the business plan. Imported from the Claude tracker's own file (a
// made-up plan here, shaped like the tracker's documents), shown by bucket and
// outcome with Open and Done tabs, edited on its own screens that save on
// leaving, shared as an A4 HTML copy, kept private in store 'cip'.
import { JSDOM } from 'jsdom';
import fs from 'fs';
import 'fake-indexeddb/auto';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  x ' + m); } };
const tick = (ms = 50) => new Promise(r => setTimeout(r, ms));
const errs = [];
const dom = new JSDOM(fs.readFileSync('index.html', 'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g, ''),
  { runScripts: 'dangerously', url: 'https://example.org/', pretendToBeVisual: true });
const w = dom.window, d = w.document;
w.indexedDB = indexedDB; w.IDBKeyRange = IDBKeyRange;
w.scrollTo = () => {}; w.alert = () => {};
let asked = '', answer = true; w.confirm = m => { asked = m; return answer; };
let prompts = []; w.prompt = () => prompts.shift();
let phone = false;
w.matchMedia = () => ({ matches: phone, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
w.navigator.storage = { persist: async () => true, persisted: async () => true };
w.URL.createObjectURL = () => 'blob:stub'; w.URL.revokeObjectURL = () => {};
if (!w.HTMLDialogElement.prototype.showModal) w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
if (!w.HTMLDialogElement.prototype.close) w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new w.Event('close')); };
w.HTMLCanvasElement.prototype.getContext = () => null;
w.console.error = (...a) => errs.push(a.join(' ')); w.console.warn = () => {};
for (const f of ['zones.js', 'manuals.js', 'healthlib.js', 'app.js']) {
  const el = d.createElement('script'); el.textContent = fs.readFileSync(f, 'utf8'); d.body.appendChild(el);
}
d.dispatchEvent(new w.Event('DOMContentLoaded'));
await tick(500);
const $ = id => d.getElementById(id);
const g = e => w.eval('(' + e + ')');
w.eval(`toast = m => { window.__t = m; }`);
w.eval(`downloadFile = (n, t) => { window.__dl = {n, t}; }`);
const text = el => el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
const menu = () => text($('vmBody'));
const pickMenu = async label => { const b = [...$('vmBody').querySelectorAll('button')].find(x => x.textContent.includes(label)); b.click(); await tick(80); };

// ---- a made-up plan, laid out as the Claude tracker's preview file holds it
const docs = {
  'plan/meta': { period: 'H1 2027', note: 'Made-up plan for the tests' },
  'buckets/annuity': { name: 'Annuity', order: 1, short: 'Keep' },
  'buckets/projects': { name: 'Projects', order: 2, short: 'Build' },
  'buckets/growth': { name: 'Growth', order: 3, short: 'Grow' },
  'outcomes/rel': { bucket: 'annuity', name: 'Reliability at Example Foods sites', objective: 2000000, why: 'Downtime costs them', customerValue: 'Fewer stops', intraloxValue: 'Belt annuity', focus: ['Health checks', 'Spares on site'], accounts: ['Example Foods - Smithfield'], status: 'active', order: 1 },
  'outcomes/oem': { bucket: 'projects', name: 'OEM projects', objective: 1000000, why: '', customerValue: '', intraloxValue: '', focus: [], accounts: [], status: 'active', order: 2 },
  'outcomes/old': { bucket: 'growth', name: 'An old outcome', objective: 50000, status: 'retired', order: 1 },
  'actions/a1': { outcome: 'rel', team: 'AMs', title: 'Monthly site walk', how: 'Plaud and photos', agreed: 'Every month', owner: 'Jo Bloggs', due: '2027-02-15', status: 'open', carried: 'Q3', order: 1,
    checkins: [{ month: '2026-09', result: 'partly', note: 'Two of three', by: '', at: '' }] },
  'actions/a2': { outcome: 'rel', team: 'CS', title: 'Spares list', status: 'done', order: 2, checkins: [] },
  'actions/a3': { outcome: 'oem', team: 'Technical Support', title: 'Transfer trial', status: 'open', order: 3, checkins: [] },
  'actions/a4': { outcome: 'oem', team: 'BDA', title: 'A retired idea', status: 'retired', order: 4, checkins: [] }
};
const trackerHtml = '<!doctype html><html><head><title>MPS AU Business Plan</title></head><body><script>\n(function(){\n  const docs = ' + JSON.stringify(docs) + ';\n  const subs = [];\n})();\n</script></body></html>';

// ---- Home has the tile; with no plan, the screen says how to bring one in
ok(!!d.querySelector('[data-go="bizplan"]'), 'Home has a Business plan tile');
d.querySelector('[data-go="bizplan"]').click(); await tick(80);
ok(g('screen') === 'bp' && /Import plan/.test(text($('bpBody'))) && $('bpShare').hidden, 'no plan yet: it says how to import one, and Share is hidden');

// ---- Import plan, from the tracker's file
w.__file = new w.File([trackerHtml], 'MPS-AU-Business-Plan.html', { type: 'text/html' });
await g(`bpImportFile(window.__file)`); await tick(100);
const bp = g('BP');
ok(bp && bp.name === 'MPS AU Business Plan' && bp.period === 'H1 2027' && bp.outcomes.length === 3 && bp.actions.length === 4, 'the tracker\'s plan comes in: name, period, outcomes and actions');
ok(bp.actions.find(a => a.id === 'a1').checkins[0].result === 'partly' && bp.outcomes.find(o => o.id === 'rel').focus.length === 2, 'check-ins and focus points too');
const stored = (await g(`cipAll()`)).find(r => r.id === 'bizplan');
ok(stored && stored.actions.length === 4, 'kept in the private store, which syncs to your own devices only');
ok(/Business plan brought in: 3 outcomes, 4 actions/.test(g('window.__t')), 'a toast says what came in');

// ---- the plan
const body = () => text($('bpBody'));
ok(/H1 2027/.test(body()) && /\$3M objective/.test(body()), 'the period and the total of active objectives: ' + body().slice(0, 80));
ok(/Annuity \$2M/.test(body()) && /Projects \$1M/.test(body()) && !/An old outcome/.test(body()), 'buckets with their totals; a retired outcome is not on the Open tab');
ok(/Monthly site walk/.test(body()) && /Jo Bloggs · by 15 Feb · September: Partly/.test(body()) && !/Spares list/.test(body()), 'Open: open actions, with owner, date and the latest check-in; done ones are not here');
$('bpTabs').querySelector('[data-v="done"]').click(); await tick(30);
ok(/Spares list/.test(body()) && !/Monthly site walk/.test(body()) && /Retired/.test(body()) && /An old outcome/.test(body()) && /A retired idea/.test(body()), 'Done: done actions, and what was retired');
$('bpTabs').querySelector('[data-v="open"]').click(); await tick(30);

// ---- an action: edit, leave, saved
d.querySelector('[data-bpa="a1"]').click(); await tick(80);
ok(g('screen') === 'bpact' && $('bpaTitle').value === 'Monthly site walk' && $('bpaOwner').value === 'Jo Bloggs' && $('bpaDue').value === '2027-02-15', 'tap an action: its form, filled in');
ok(/Carried from the last plan: Q3/.test(text($('bpaCarried'))) && d.querySelector('#bpaTeam .on').textContent === 'AMs', 'where it was carried from, and its team');
ok(/September 2026 · Partly/.test(text($('bpaChecks'))), 'its check-ins');
$('bpaOwner').value = 'Alex Example';
d.querySelector('#bpaTeam [data-t="CS"]').click(); await tick(10);
d.querySelector('#bpaResult [data-r="yes"]').click(); $('bpaNote').value = 'All three walked';
$('bpaAdd').click(); await tick(20);
ok((g('BPA.d.checkins') || []).length === 2 && /All three walked/.test(text($('bpaChecks'))), 'a check-in is added');
$('bpaAdd').click(); await tick(10);
ok(/Pick Achieved, Partly or Not yet first/.test(g('window.__t')), 'a check-in needs its result');
$('bpaDone').click(); await tick(120);
const a1 = g(`BP.actions.find(a => a.id === 'a1')`);
ok(g('screen') === 'bp' && a1.owner === 'Alex Example' && a1.team === 'CS' && a1.checkins.length === 2, 'Done saves it: owner, team, check-in');
ok((await g(`cipAll()`)).find(r => r.id === 'bizplan').actions.find(a => a.id === 'a1').owner === 'Alex Example', 'and stores it');

// ---- marked done, it moves to Done
d.querySelector('[data-bpa="a3"]').click(); await tick(60);
$('bpaStatus').querySelector('[data-v="done"]').click();
g(`go('bp')`); await tick(100);
ok(g(`BP.actions.find(a => a.id === 'a3').status`) === 'done' && /^\d{4}-\d\d-\d\d$/.test(g(`BP.actions.find(a => a.id === 'a3').doneAt`)) && !/Transfer trial/.test(body()), 'marked Done: dated, and off the Open tab');

// ---- a new action: empty leaves nothing; with words it is kept under its outcome
d.querySelector('[data-bpnew="oem"]').click(); await tick(60);
ok(g('screen') === 'bpact' && $('bpaOut').value === 'oem', 'Add an action under an outcome opens a new one for it');
$('bpaDone').click(); await tick(80);
ok(g('BP.actions.length') === 4, 'left empty: nothing kept');
d.querySelector('[data-bpnew="oem"]').click(); await tick(60);
$('bpaTitle').value = 'Visit the OEM'; $('bpaDue').value = '2027-03-01';
$('bpaDone').click(); await tick(100);
ok(g('BP.actions.length') === 5 && /Visit the OEM/.test(body()), 'with words it is kept, under its outcome');

// ---- duplicate opens a copy to edit; delete names what goes
const newId = g(`BP.actions.find(a => a.title === 'Visit the OEM').id`);
d.querySelector('[data-bpa="' + newId + '"]').click(); await tick(60);
$('bpaMore').click(); await tick(40);
ok(/Duplicate/.test(menu()) && /Delete/.test(menu()), 'an action\'s ⋯: Duplicate and Delete');
await pickMenu('Duplicate');
ok(g('screen') === 'bpact' && $('bpaTitle').value === 'Visit the OEM (copy)' && g('BPA.isNew') && g('BP.actions.length') === 5, 'Duplicate opens a copy to edit, not saved yet');
$('bpaMore').click(); await tick(40);
await pickMenu('Delete');
ok(g('BP.actions.length') === 5 && g('screen') === 'bp', 'deleting the unsaved copy leaves the plan as it was');
d.querySelector('[data-bpa="a1"]').click(); await tick(60);
$('bpaMore').click(); await tick(40);
answer = false; await pickMenu('Delete');
ok(/Delete the action "Monthly site walk" and its 2 check-ins\?/.test(asked) && g('BP.actions.length') === 5, 'Delete names the action and its check-ins; Cancel keeps it');
answer = true;
$('bpaDone').click(); await tick(80);

// ---- an outcome
d.querySelector('[data-bpo="oem"]').click(); await tick(60);
ok(g('screen') === 'bpout' && $('bpoName').value === 'OEM projects' && $('bpoObj').value === '1000000' && text($('bpoObjHint')) === '$1M', 'tap an outcome: its form, with the objective shown as money');
$('bpoObj').value = '1,500,000'; $('bpoObj').dispatchEvent(new w.Event('input'));
ok(text($('bpoObjHint')) === '$1.5M', 'the objective reads as you type');
$('bpoFocus').value = 'Trials\n\n OEM visits ';
$('bpoDone').click(); await tick(100);
const oem = g(`BP.outcomes.find(o => o.id === 'oem')`);
ok(oem.objective === 1500000 && oem.focus.join('|') === 'Trials|OEM visits' && /\$3.5M objective/.test(body()), 'saved: objective, focus one per line, and the total moves');

// ---- the period, from the ⋯
$('bpMore').click(); await tick(40);
ok(/Import plan/.test(menu()) && /Add an outcome/.test(menu()) && /Change the period/.test(menu()), 'the plan\'s ⋯: Import, Add an outcome, Add an action, Change the period');
prompts = ['H2 2027', 'Second half'];
await pickMenu('Change the period'); await tick(60);
ok(g('BP.period') === 'H2 2027' && g('BP.note') === 'Second half' && /H2 2027/.test(body()), 'the period and note change');

// ---- Share: an A4 copy
await g(`bpShare()`); await tick(50);
const dl = g('window.__dl');
ok(dl && dl.n === 'MPS AU Business Plan - H2 2027.html', 'on the PC it downloads, named by the plan and period: ' + (dl && dl.n));
ok(/Reliability at Example Foods sites/.test(dl.t) && /\$2M/.test(dl.t) && /Monthly site walk/.test(dl.t) && /Agreed: Every month/.test(dl.t) && /How we'll achieve it/.test(dl.t), 'it carries the outcomes, objectives and actions');
ok(!/A retired idea/.test(dl.t) && !/An old outcome/.test(dl.t) && /Done/.test(dl.t), 'retired ones are left out; done ones say so');
ok(/@page\{size:A4/.test(dl.t) && /class="mast"/.test(dl.t), 'in the house style, A4');
phone = true; let shared = null;
w.navigator.canShare = () => true; w.navigator.share = async o => { shared = o; };
await g(`bpShare()`); await tick(50);
ok(shared && shared.files[0].name === 'MPS AU Business Plan - H2 2027.html', 'on the phone it opens the share sheet');
phone = false; delete w.navigator.canShare; delete w.navigator.share;

// ---- importing again asks first; a file without a plan is refused
answer = false; asked = '';
await g(`bpImportFile(window.__file)`); await tick(60);
ok(/Replace the business plan on this device \(3 outcomes, 5 actions\) with the one in the file \(3 outcomes, 4 actions\)/.test(asked) && g('BP.period') === 'H2 2027', 'a second import asks, naming both; Cancel keeps yours');
answer = true;
w.__bad = new w.File(['<html><body>Nothing here</body></html>'], 'x.html', { type: 'text/html' });
await g(`bpImportFile(window.__bad)`); await tick(40);
ok(/does not hold a business plan/.test(g('window.__t')) && g('BP.period') === 'H2 2027', 'a file with no plan is refused');

// ---- back goes home; the plan survives a reload of the store
g(`go('home')`); await tick(30);
await g(`(async () => { BP = null; await cipLoad(); })()`);
ok(g('BP') && g('BP.period') === 'H2 2027' && g('BP.actions.length') === 5, 'read back from storage as it was left');

ok(!errs.length, 'no errors: ' + errs.slice(0, 3).join(' | '));
console.log(`business plan: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
