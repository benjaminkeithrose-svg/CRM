// v134: calls fill the MBOs. A tick on the call is a completion in the call's
// calendar quarter; rules tick for you and stay off once taken off; initiatives
// sit under the MBOs, earn nothing, and can be linked to an MBO from a quarter so
// one tick is seen from both sides and paid once; a task done counts; a CIP goal
// shows its MBO's count. Nothing is written on the call itself.
// Everything here is made up.
import { JSDOM } from 'jsdom';
import fs from 'fs';
import 'fake-indexeddb/auto';
const errs = [];
const dom = new JSDOM(fs.readFileSync('index.html', 'utf8'), { runScripts: 'dangerously', url: 'https://example.org/' });
const w = dom.window, d = w.document;
w.indexedDB = indexedDB; w.IDBKeyRange = IDBKeyRange; w.scrollTo = () => {}; w.alert = () => {};
w.confirm = () => true;
w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
w.navigator.storage = { persist: async () => true, persisted: async () => true };
w.URL.createObjectURL = () => 'blob:stub'; w.URL.revokeObjectURL = () => {};
w.HTMLCanvasElement.prototype.getContext = () => null;
if (!w.HTMLDialogElement.prototype.showModal) w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
if (!w.HTMLDialogElement.prototype.close) w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new w.Event('close')); };
w.console.error = (...a) => errs.push(a.join(' ')); w.console.warn = () => {};
if (!w.Element.prototype.setPointerCapture) w.Element.prototype.setPointerCapture = function () {};
for (const f of ['zones.js', 'manuals.js', 'healthlib.js', 'app.js']) {
  const el = d.createElement('script'); el.textContent = fs.readFileSync(f, 'utf8'); d.body.appendChild(el);
}
d.dispatchEvent(new w.Event('DOMContentLoaded'));
await new Promise(r => setTimeout(r, 400));
const g = e => w.eval('(' + e + ')');
const $ = id => d.getElementById(id);
const wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const t = (n, c, x) => { if (c) pass++; else { fail++; console.log('  x ' + n + (x !== undefined ? ' -> ' + x : '')); } };

// an MBO list for 2026: a coverage MBO with a rule, a training MBO, and an initiative
w.__m = { id: 'mbo', updated: 0, years: { '2026': { cap: 8000, setupLocked: true, mega: [], quarters: {},
  items: [
    { id: 'mcov', cat: 'Coverage', title: 'High focus visits', value: 100, rules: { focus: ['High'] } },
    { id: 'mtrn', cat: 'Growth', title: 'Customer trainings', value: 200 }
  ],
  inits: [{ id: 'ncs', title: 'Customer service initiative', def: '', link: null, rules: { health: true } }]
} } };
w.eval('MBO = window.__m; cipUiLoad(); cipUi.my = "2026"');
const Y = () => g('MBO.years["2026"]');
const log = (q, id) => g(`mboRead(MBO.years["2026"], "${q}", "${id}")`);
const mk = (id, date, extra) => Object.assign({ id, customer: 'Acme Foods', date, type: 'Site call', mgr: 'B', site: '', focus: 'High',
  contacts: [{ name: 'X', crm: true }], entries: [], loose: [], closed: false, updated: Date.now(), status: 'in progress' }, extra || {});
const setCall = o => { w.__t = o; w.eval('call = window.__t'); };
const save = async c => { w.__s = c; await w.eval('callsPut(window.__s)'); };

// ---- a rule ticks it on the call ----
const c1 = mk('k1', '05/08/2026');                       // August: Q3
await save(c1); setCall(c1);
w.showScreen('dash'); await wait(50);
t('the call shows the MBO line', !$('dashMbo').hidden);
t('the focus rule ticked the coverage MBO in Q3', log('Q3', 'm:mcov').length === 1 && log('Q3', 'm:mcov')[0].call === 'k1' && log('Q3', 'm:mcov')[0].auto === true);
t('with the account and the date', log('Q3', 'm:mcov')[0].site === 'Acme Foods' && log('Q3', 'm:mcov')[0].date === '2026-08-05');
t('the line names it', /High focus visits/.test($('dashMbo').textContent), $('dashMbo').textContent);
t('nothing is written on the call', !('mbo' in g('call')) && JSON.stringify(g('call')).indexOf('mcov') < 0);
t('the initiative rule needs a health check, so not yet', log('Q3', 'i:ncs').length === 0);

// ---- ticking by hand, and taking a rule's tick off ----
$('dashMbo').click(); await wait(20);
t('the tick list opens', $('mbotickdlg').hasAttribute('open'));
t('it says which quarter', /2026 Q3/.test($('mtBody').textContent));
const box = key => $('mtBody').querySelector('input[data-mt="' + key + '"]');
t('the rule tick shows ticked, marked as by its rule', box('m:mcov').checked && /by its rule/.test(box('m:mcov').closest('label').textContent));
box('m:mtrn').checked = true; box('m:mtrn').dispatchEvent(new w.Event('change', { bubbles: true }));
t('a hand tick adds a completion', log('Q3', 'm:mtrn').length === 1 && log('Q3', 'm:mtrn')[0].auto === false);
box('m:mcov').checked = false; box('m:mcov').dispatchEvent(new w.Event('change', { bubbles: true }));
t('taking off the rule tick removes it', log('Q3', 'm:mcov').length === 0);
w.eval('mboApplyCall(call)');
t('and the rule does not put it back', log('Q3', 'm:mcov').length === 0 && g('MBO.years["2026"].off.k1').includes('m:mcov'));
box('m:mcov').checked = true; box('m:mcov').dispatchEvent(new w.Event('change', { bubbles: true }));
t('ticking it again brings it back by hand', log('Q3', 'm:mcov').length === 1 && !g('MBO.years["2026"].off.k1'));
$('mtOk').click(); await wait(20);

// ---- a health check fires the initiative's rule; moving the call moves the tick ----
w.eval(`call.entries.push({type:'health', asset:'C-1', fault:'Worn sprocket'})`);
w.showScreen('dash'); await wait(20);
t('a health check ticks the initiative', log('Q3', 'i:ncs').length === 1);
w.eval(`call.date = '20/11/2026'`);                    // moved into Q4
await w.eval('callsPut(call)');
w.showScreen('dash'); await wait(20);
t('moving the call moves its ticks to Q4', log('Q3', 'm:mtrn').length === 0 && log('Q4', 'm:mtrn').length === 1 && log('Q4', 'i:ncs').length === 1);

// ---- a locked quarter is never changed ----
w.eval(`mboQ(MBO.years["2026"], "Q4").locked = true`);
w.eval(`call.entries = []`);                            // the health check goes
await w.eval('callsPut(call)');
w.showScreen('dash'); await wait(20);
t('a locked quarter keeps its ticks', log('Q4', 'i:ncs').length === 1);
w.eval(`mboQ(MBO.years["2026"], "Q4").locked = false`);
w.showScreen('dash'); await wait(20);
t('unlocked, the rule tick goes with the health check', log('Q4', 'i:ncs').length === 0);
t('a hand tick stays', log('Q4', 'm:mtrn').length === 1);

// ---- linking an initiative to an MBO: one tick, both sides, paid once ----
w.eval(`MBO.years["2026"].inits[0].link = {mbo:'mtrn', from:'Q4'}`);
const c2 = mk('k2', '02/12/2026', { focus: 'Low' });
await save(c2); setCall(c2);
w.eval(`mboToggle(call, 'i:ncs', true)`);
t('the initiative tick is under the initiative', log('Q4', 'i:ncs').length === 1);
t('and counts towards the linked MBO', g(`mboLogAll(MBO.years["2026"], "Q4", "mtrn").length`) === 2);
w.eval(`mboToggle(call, 'm:mtrn', true)`);
t('ticked on both, it still counts once', g(`mboLogAll(MBO.years["2026"], "Q4", "mtrn").length`) === 2);
t('and the MBO side shows under the initiative', g(`mboInitAll(MBO.years["2026"], "Q4", "ncs").length`) === 2);
// Q4: two trainings (one per call, the second ticked both ways) and one coverage visit
t('pay counts it once', g(`mboCalc(MBO.years["2026"]).Q4.earned`) === 200 * 2 + 100, g(`mboCalc(MBO.years["2026"]).Q4.earned`));
const c3 = mk('k3', '10/08/2026', { focus: 'Low' });  // Q3, before the link
await save(c3); setCall(c3);
w.eval(`mboToggle(call, 'i:ncs', true)`);
t('before the link quarter it counts only as an initiative', log('Q3', 'i:ncs').length === 1 && g(`mboLogAll(MBO.years["2026"], "Q3", "mtrn").length`) === 0);

// ---- the MBO screen ----
w.eval('cipUi.mq = "Q4"');
w.showScreen('mbo'); await wait(50);
const mb = $('mboBody');
t('the initiatives sit under the MBOs', /Initiatives/.test(mb.textContent) && !!mb.querySelector('.minit'));
t('the initiative row says what it counts towards', /Counts towards Customer trainings from Q4/.test(mb.textContent));
t('the MBO\'s completions show under the linked initiative, dashed', mb.querySelectorAll('.minit .mchip.via').length >= 1);
t('the initiative earns no money', !/\$/.test(mb.querySelector('.minit').textContent));
mb.querySelector('[data-iinfo="ncs"]').click(); await wait(20);
t('tapping an initiative opens its details and rules', $('mboinfodlg').hasAttribute('open') && $('miTitle').value === 'Customer service initiative' && !!$('miBody').querySelector('[data-rule="focus"]'));
// linking into a locked quarter is refused
w.eval(`mboQ(MBO.years["2026"], "Q3").locked = true`);
$('miFrom').value = 'Q3'; $('miFrom').dispatchEvent(new w.Event('change', { bubbles: true }));
t('a link reaching into a locked quarter is refused', g(`MBO.years["2026"].inits[0].link.from`) === 'Q4' && $('miFrom').value === 'Q4');
w.eval(`mboQ(MBO.years["2026"], "Q3").locked = false`);
$('miClose').click(); await wait(20);
// add an initiative from the screen
mb.querySelector('[data-maddinit]').click(); await wait(20);
t('Add initiative opens a new one', g(`MBO.years["2026"].inits.length`) === 2 && $('mboinfodlg').hasAttribute('open'));
$('miTitle').value = 'Waste product rollout'; $('miTitle').dispatchEvent(new w.Event('input', { bubbles: true }));
$('miBelt').value = 'Sustain, PRO'; $('miBelt').dispatchEvent(new w.Event('input', { bubbles: true }));
$('miClose').click(); await wait(100);
t('its name and belt rule are kept', g(`MBO.years["2026"].inits[1].title`) === 'Waste product rollout' && g(`MBO.years["2026"].inits[1].rules.belt`) === 'Sustain, PRO');
// the belt rule reaches a call already made, through the sweep
const c4 = mk('k4', '15/05/2026', { focus: 'Low', entries: [{ type: 'belt', asset: 'L4', beltdesc: 'S1100 Sustain flush grid' }] });
await save(c4);
await w.eval('mboSweep()');
const nid = g(`MBO.years["2026"].inits[1].id`);
t('a rule reaches calls made before it', log('Q2', 'i:' + nid).length === 1 && log('Q2', 'i:' + nid)[0].call === 'k4');
// deleting a call's completion on the screen keeps the rule off it
w.eval('cipUi.mq = "Q2"'); w.showScreen('mbo'); await wait(50);
$('mboBody').querySelector('[data-ichip="' + nid + '|Q2|0"]').click(); await wait(20);
t('a call completion offers to open the call', !$('meWork').hidden && /Open the call/.test($('meWork').textContent));
$('meDel').click(); await wait(20);
await w.eval('mboSweep()');
t('deleted on the screen, the rule does not bring it back', log('Q2', 'i:' + nid).length === 0);
// deleting a call clears its ticks
await w.eval(`callsDel('k3')`);
await w.eval('mboSweep()');
t('a deleted call takes its ticks with it', log('Q3', 'i:ncs').length === 0);

// ---- a task done counts ----
w.eval(`TASKS = [{id:'tt1', type:'Call', title:'Training at Acme', date:'2026-05-02', acct:'Acme Foods', done:true, doneAt: Date.parse('2026-05-03T10:00:00'), mbo:'m:mtrn'}]`);
await w.eval('mboSweep()');
t('a task ticked done counts in its quarter', log('Q2', 'm:mtrn').some(e => e.task === 'tt1'));
w.eval(`TASKS[0].done = false; TASKS[0].doneAt = null`);
await w.eval('mboSweep()');
t('undone, it is taken back', !log('Q2', 'm:mtrn').some(e => e.task === 'tt1'));
w.eval(`openTask('tt1')`); await wait(20);
t('the task form offers what it counts towards', !$('tkMboRow').hidden && $('tkMbo').value === 'm:mtrn' && /Customer service initiative/.test($('tkMbo').textContent));
w.eval('taskFinish()'); await wait(50);

// ---- a CIP goal shows its MBO's count ----
const prog = g(`mboGoalProgress({mboId:'mtrn'})`);
w.eval('cipUi.cur = "2026-H2"');
t('a CIP goal linked to an MBO shows its count', /So far in 2026/.test(g(`mboGoalProgress({mboId:'mtrn'})`)) && /Q4 2/.test(g(`mboGoalProgress({mboId:'mtrn'})`)), g(`mboGoalProgress({mboId:'mtrn'})`));

// ---- a teammate's call and a test call never count ----
const c5 = mk('k5', '06/08/2026', { test: true });
setCall(c5); w.showScreen('dash'); await wait(20);
t('a test call has no MBO line and no ticks', $('dashMbo').hidden && log('Q3', 'm:mcov').every(e => e.call !== 'k5'));
w.eval(`OWNERS['calls/k6'] = 'someone-else'`);
const c6 = mk('k6', '07/08/2026');
setCall(c6); w.showScreen('dash'); await wait(20);
t('a colleague\'s call has no MBO line and no ticks', $('dashMbo').hidden && log('Q3', 'm:mcov').every(e => e.call !== 'k6'));

// ---- no year, no line ----
const c7 = mk('k7', '01/03/2031');
setCall(c7); w.showScreen('dash'); await wait(20);
t('a call in a year with no MBO list shows no line', $('dashMbo').hidden);

t('the tick dialog is registered for history', g('DIALOGS').includes('mbotickdlg'));
await wait(800);
t('no errors', errs.length === 0, errs.join(' | '));
console.log(`PASS ${pass}` + (fail ? `  FAIL ${fail}` : ''));
process.exit(fail ? 1 : 0);
