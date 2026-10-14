// v137: next year's MBOs planned while this year's run. Plan next year starts
// next year's list from this one without values; it says Planning until the
// year starts; this year's list is untouched; an initiative can become one of
// next year's MBOs (or one of a planning list's own). Everything here is made up.
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
const NOW = String(new Date().getFullYear()), NEXT = String(+NOW + 1);

w.__m = { id: 'mbo', updated: 0, years: { [NOW]: { cap: 8000, setupLocked: true, quarters: { Q1: { locked: true, log: { mcov: [{ site: 'Acme Foods', date: NOW + '-02-02', ref: '' }] } } },
  items: [{ id: 'mcov', cat: 'Coverage', title: 'High focus visits', value: 100, proof: 'Dynamics visit', def: 'A visit to a High account', rules: { focus: ['High'] } }],
  mega: [{ id: 'g1', title: 'Team target', pct: 10, met: 'yes' }],
  inits: [{ id: 'ncs', title: 'Customer service initiative', def: 'Service visits', link: null, rules: { health: true } }] } } };
w.eval(`MBO = window.__m; cipUiLoad(); cipUi.my = "${NOW}"`);
w.showScreen('mbo'); await wait(50);

// ---- the menu starts next year's plan ----
$('mboMore').click(); await wait(20);
t('the menu offers to plan next year', !$('cmPlanNext').hidden && $('cmPlanNext').textContent === 'Plan the ' + NEXT + ' MBOs', $('cmPlanNext').textContent);
$('cmPlanNext').click(); await wait(50);
const P = () => g(`MBO.years["${NEXT}"]`);
t('next year\'s list is started and opened', !!P() && g('cipUi.my') === NEXT);
t('it is marked planning', P().planning === true);
t('the same MBOs, definitions and rules', P().items.length === 1 && P().items[0].title === 'High focus visits' && P().items[0].def === 'A visit to a High account' && P().items[0].rules.focus[0] === 'High');
t('with no values: no $ each, no cap, no Mega %', P().items[0].value === '' && P().cap === '' && P().mega[0].pct === '' && P().mega[0].met === 'no');
t('and empty quarters', !Object.keys(P().quarters).length);
t('the initiatives roll over too', P().inits.length === 1 && P().inits[0].title === 'Customer service initiative');
t('this year\'s list is untouched', g(`MBO.years["${NOW}"].items[0].value`) === 100 && g(`MBO.years["${NOW}"].cap`) === 8000 && g(`MBO.years["${NOW}"].quarters.Q1.log.mcov.length`) === 1);
t('the screen says Planning, from 1 January', /Planning: in use from 1 January/.test($('mboBody').textContent));
t('the year menu says (planning)', /\(planning\)/.test($('mboYear').textContent));
$('mboMore').click(); await wait(20);
t('next time the menu opens the plan', $('cmPlanNext').textContent === 'Open the ' + NEXT + ' MBO plan');
$('cmClose').click(); await wait(20);

// ---- planning is freely editable ----
t('the planning list can be edited', !g(`MBO.years["${NEXT}"].setupLocked`));
w.eval(`MBO.years["${NEXT}"].items[0].value = 150`);
t('a value set in the plan does not reach this year', g(`MBO.years["${NOW}"].items[0].value`) === 100);

// ---- an initiative becomes one of next year's MBOs ----
w.eval(`cipUi.my = "${NOW}"`); w.showScreen('mbo'); await wait(50);
$('mboBody').querySelector('[data-iinfo="ncs"]').click(); await wait(20);
const mk = $('miBody').querySelector('[data-mkmbo="next"]');
t('an initiative offers to be one of next year\'s MBOs', !!mk && new RegExp(NEXT).test(mk.textContent));
mk.click(); await wait(50);
t('it is now one of next year\'s MBOs, with no value', P().items.some(i => i.title === 'Customer service initiative' && i.value === '' && i.def === 'Service visits' && i.rules.health === true));
t('its rolled-over copy is no longer an initiative there', !P().inits.some(i => i.title === 'Customer service initiative'));
t('this year it is still an initiative', g(`MBO.years["${NOW}"].inits.length`) === 1);
t('the screen moved to next year\'s plan', g('cipUi.my') === NEXT);

// ---- within a planning list ----
w.eval(`MBO.years["${NEXT}"].inits.push({id:'nwp', title:'Waste product rollout', def:'', link:null, rules:{}})`);
w.showScreen('mbo'); await wait(50);
$('mboBody').querySelector('[data-iinfo="nwp"]').click(); await wait(20);
const here = $('miBody').querySelector('[data-mkmbo="here"]');
t('in a plan, an initiative can become one of its own MBOs', !!here);
here.click(); await wait(50);
t('it moves into the plan\'s MBOs', P().items.some(i => i.title === 'Waste product rollout') && !P().inits.some(i => i.id === 'nwp'));

// ---- when the year comes, it is that year's list ----
w.eval(`MBO.years["${NOW}"].planning = true`);
w.eval('mboPlanCheck()');
t('a plan whose year has come is just that year\'s list', !g(`MBO.years["${NOW}"].planning`) && g(`MBO.years["${NEXT}"].planning`) === true);

// ---- a future year started by hand from a copy is a plan too ----
const LATER = String(+NOW + 2);
w.eval(`cipUi.my = "${LATER}"`); w.showScreen('mbo'); await wait(50);
const copy = $('mboBody').querySelector('[data-ystart="copy"]');
t('a later year offers to copy', !!copy);
copy.click(); await wait(50);
t('copied into a future year: planning, no values', g(`MBO.years["${LATER}"].planning`) === true && g(`MBO.years["${LATER}"].items.every(i => i.value === '')`));

await wait(700);
t('no errors', errs.length === 0, errs.join(' | '));
console.log(`PASS ${pass}` + (fail ? `  FAIL ${fail}` : ''));
process.exit(fail ? 1 : 0);
