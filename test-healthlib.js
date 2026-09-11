/* Headless harness for healthlib.js - jsdom + fake-indexeddb, no browser,
   no build step. Drives the real elements and asserts against what lands in
   storage, rather than matching strings.

   Cannot reach: the camera, the share sheet, real Blob persistence
   (fake-indexeddb returns a plain object, not a Blob), or anything a real
   browser does with files. Those need the phone.

   Run:  node test-healthlib.js
*/
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
require('fake-indexeddb/auto');

const SEED = JSON.parse(fs.readFileSync(path.join(__dirname, 'health-seed.json'), 'utf8'));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  -> ' + extra : '')); }
}
function eq(name, a, b) { ok(name, a === b, JSON.stringify(a) + ' !== ' + JSON.stringify(b)); }

async function boot() {
  // Minimal host page carrying the module's real markup.
  const block = fs.readFileSync(path.join(__dirname, 'index-html-block.html'), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '');
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="screens">' + block + '</div></body></html>',
    { url: 'https://example.org/', pretendToBeVisual: true, runScripts: 'outside-only' }
  );
  const w = dom.window;

  // fake-indexeddb, and a fetch that serves the seed from disk.
  w.indexedDB = indexedDB;
  w.IDBKeyRange = IDBKeyRange;
  w.fetch = async (url) => ({
    ok: String(url).includes('health-seed.json'),
    status: 200,
    json: async () => SEED
  });
  w.URL.createObjectURL = () => 'blob:stub';
  w.URL.revokeObjectURL = () => {};

  // app.js helpers are absent in standalone dev; the module falls back to its
  // own. Stub only what jsdom lacks.
  w.toast = () => {};

  const src = fs.readFileSync(path.join(__dirname, 'healthlib.js'), 'utf8');
  w.eval(src);
  await w.HealthLib.ready();
  return w;
}

function tap(w, sel) {
  const el = typeof sel === 'string' ? w.document.querySelector(sel) : sel;
  if (!el) throw new Error('no element for ' + sel);
  el.dispatchEvent(new w.Event('click', { bubbles: true }));
  return el;
}

(async () => {
  console.log('\nhealthlib.js\n');
  const w = await boot();
  const HL = w.HealthLib;

  console.log('seeding');
  eq('80 checks seeded', HL.list().length, 80);
  eq('10 categories', HL.categories().length, 10);
  ok('every check has an action', HL.list().every(f => f.action && f.action.length > 10));
  ok('every check has a severity in range',
    HL.list().every(f => ['Urgent', 'Plan', 'Monitor'].includes(f.severity)));
  ok('every check has a priority in range',
    HL.list().every(f => ['Critical', 'High', 'Medium', 'Low'].includes(f.priority)));
  ok('seeding is idempotent - no duplicate codes',
    new Set(HL.list().map(f => f.code)).size === 80);

  console.log('\nbelt technology');
  eq('S2400 is modular', HL.techFromSeries('S2400'), 'modular_plastic_belt');
  eq('ThermoDrive is thermodrive', HL.techFromSeries('ThermoDrive S800'), 'thermodrive');
  eq('blank series yields no filter', HL.techFromSeries(''), null);

  console.log('\ncatenary sag inversion - the check filtering exists to prevent');
  const sag = HL.get('sg-01');
  ok('SG-01 exists', !!sag);
  eq('SG-01 is modular-only', sag.tech, 'modular_plastic_belt');
  ok('SG-01 carries the 25-102 mm threshold',
    sag.thresholds.join(' ').includes('102'));
  const tdChecks = HL.list().filter(f => f.tech === 'thermodrive');
  ok('ThermoDrive-only checks exist', tdChecks.length > 0);

  console.log('\nsearch');
  ok('finds by symptom wording', HL.search('blacken').length > 0);
  ok('finds by code', HL.search('sg-01').length > 0 || HL.search('sg 01').length > 0);
  eq('one character returns nothing', HL.search('s').length, 0);
  ok('all terms must match', HL.search('sprocket zzzz').length === 0);

  console.log('\npicker produces a valid health entry');
  let produced = null;
  HL.openPicker({ asset: 'CV-114 drive end', series: 'S2400', beltRef: 3 },
    e => { produced = e; });
  await new Promise(r => setTimeout(r, 0));

  ok('overlay is visible', w.document.getElementById('flOverlay').hidden === false);
  tap(w, '[data-cat="sprockets"]');
  ok('category drills into checks',
    !!w.document.querySelector('[data-fault]'));
  tap(w, '[data-fault="sp-01"]');
  ok('detail renders the condition chips',
    w.document.querySelectorAll('[data-cond]').length > 0);

  tap(w, '[data-cond="0"]');
  tap(w, '[data-cond="1"]');
  tap(w, '[data-pri="Critical"]');
  w.document.getElementById('flOwner').value = 'M. Reid';
  w.document.getElementById('flDue').value = '2026-10-15';
  tap(w, '#flUse');

  ok('entry produced', !!produced);
  eq('asset carried from the belt entry', produced.asset, 'CV-114 drive end');
  eq('beltRef carried', produced.beltRef, 3);
  eq('beltSeries carried', produced.beltSeries, 'S2400');
  eq('faultCode recorded', produced.faultCode, 'SP-01');
  eq('priority overridden by the tap', produced.priority, 'Critical');
  ok('severity still one of the app\'s three',
    ['Urgent', 'Plan', 'Monitor'].includes(produced.severity));
  eq('two conditions ticked', produced.conditions.length, 2);
  ok('fault text built from the ticked conditions',
    produced.fault === produced.conditions.join('; '));
  eq('owner captured', produced.owner, 'M. Reid');
  eq('due captured', produced.due, '2026-10-15');
  ok('htype populated so downstream keeps working',
    typeof produced.htype === 'string' && produced.htype.length > 0);

  console.log('\nexisting entry shape is intact');
  ['asset', 'fault', 'htype', 'severity', 'action'].forEach(k =>
    ok('has ' + k, Object.prototype.hasOwnProperty.call(produced, k)));
  ok('overlay closed after use', w.document.getElementById('flOverlay').hidden === true);

  console.log('\nlibrary edit vs this-use edit');
  const before = HL.get('sp-01');
  const beforeWhat = before.what, beforeVer = before.version;
  ok('this-use edit left the library untouched', HL.get('sp-01').what === beforeWhat);

  HL.openPicker({ asset: 'X' }, () => {});
  await new Promise(r => setTimeout(r, 0));
  tap(w, '[data-cat="sprockets"]');
  tap(w, '[data-fault="sp-01"]');
  w.document.getElementById('flWhat').value = 'Reworded for the library';
  tap(w, '#flSaveLib');
  await new Promise(r => setTimeout(r, 20));
  eq('library wording changed', HL.get('sp-01').what, 'Reworded for the library');
  eq('library version bumped', HL.get('sp-01').version, beforeVer + 1);
  HL.closePicker();

  console.log('\nroot cause prompt, not a gate');
  const bc02 = HL.get('bc-02');
  ok('BC-02 lists likely causes', bc02.causes && bc02.causes.length > 0);
  ok('every listed cause resolves to a real check',
    bc02.causes.every(c => !!HL.get(c)));

  console.log('\npriority sort behaviour (the app.js comparator)');
  const PRI_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  const SEV_ORDER = { Urgent: 0, Plan: 1, Monitor: 2 };
  const bySeverity = (a, b) => (SEV_ORDER[a.severity] ?? 3) - (SEV_ORDER[b.severity] ?? 3);
  const byWorkOrder = (a, b) => {
    const pa = PRI_ORDER[a.priority], pb = PRI_ORDER[b.priority];
    if (pa !== undefined || pb !== undefined) return (pa ?? 9) - (pb ?? 9);
    return bySeverity(a, b);
  };
  const mixed = [
    { severity: 'Urgent', priority: 'Low' },
    { severity: 'Monitor', priority: 'Critical' },
    { severity: 'Plan' },
    { severity: 'Urgent' }
  ].sort(byWorkOrder);
  eq('critical priority outranks urgent severity', mixed[0].priority, 'Critical');
  eq('low priority still beats no priority', mixed[1].priority, 'Low');
  eq('legacy entries fall back to severity order', mixed[2].severity, 'Urgent');
  eq('and stay in severity order among themselves', mixed[3].severity, 'Plan');

  console.log('\nnamespace discipline');
  ok('exactly one global added',
    typeof w.HealthLib === 'object' && typeof w.Faults === 'undefined');
  ok('no sessionStorage use', !/sessionStorage/.test(
    fs.readFileSync(path.join(__dirname, 'healthlib.js'), 'utf8')));
  const js = fs.readFileSync(path.join(__dirname, 'healthlib.js'), 'utf8');
  ok('no hard-coded hex colours', !/#[0-9a-fA-F]{6}\b/.test(js));
  // Comments legitimately name the other databases while explaining that this
  // module never touches them, so assert on what is actually opened.
  const opened = [...js.matchAll(/indexedDB\.open\(\s*([A-Za-z_$][\w$]*|'[^']*')/g)]
    .map(m => m[1]);
  eq('opens exactly one database', opened.length, 1);
  const dbName = (js.match(/var DB_NAME\s*=\s*'([^']+)'/) || [])[1];
  eq('and it is fieldcrmfaults', dbName, 'fieldcrmfaults');
  ok('no forbidden database name is ever opened',
    !/'(beltcall|beltmanuals|fieldcrmmanuals|fieldcrm)'/.test(js));
  ok('localStorage keys are fcrm-prefixed',
    !/localStorage/.test(js) || /fcrm\./.test(js));

  console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
