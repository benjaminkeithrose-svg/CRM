// v173: walk the conveyor. Every check OK until a fault is tapped; a fault is
// Watch or Fix, a Fix is done on site or needs a new belt; the belt carries Why
// replace it; the documents go conveyor by conveyor and fold, with chips.
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
w.scrollTo = () => {}; w.alert = () => {}; w.confirm = () => true;
w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
w.navigator.storage = { persist: async () => true, persisted: async () => true };
w.URL.createObjectURL = () => 'blob:stub'; w.URL.revokeObjectURL = () => {};
if (!w.HTMLDialogElement.prototype.showModal) w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
if (!w.HTMLDialogElement.prototype.close) w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new w.Event('close')); };
w.HTMLCanvasElement.prototype.getContext = () => null;
w.console.error = (...a) => errs.push(a.join(' ')); w.console.warn = () => {};
// the fault library seeds itself from health-seed.json
const SEED = fs.readFileSync('health-seed.json', 'utf8');
w.fetch = async () => ({ ok: true, status: 200, json: async () => JSON.parse(SEED) });
for (const f of ['zones.js', 'manuals.js', 'healthlib.js', 'app.js']) {
  const el = d.createElement('script'); el.textContent = fs.readFileSync(f, 'utf8'); d.body.appendChild(el);
}
d.dispatchEvent(new w.Event('DOMContentLoaded'));
await tick(500);
await w.HealthLib.ready(); await tick(50);
const $ = id => d.getElementById(id);
const g = e => w.eval('(' + e + ')');
w.eval(`toast = m => { window.__t = m; }`);
const type = (id, v) => { $(id).value = v; $(id).dispatchEvent(new w.Event('input', { bubbles: true })); };
const row = name => [...d.querySelectorAll('#wkList .wkrow')].find(r => r.querySelector('.wkn').textContent === name);
const done = async () => { $('barDone').click(); await tick(150); };

ok(w.HealthLib.list().length === 80, 'the fault library is loaded: ' + w.HealthLib.list().length);
await g(`(async () => {
  call = {id: 'c1', customer: 'Example Foods - Smithfield', date: '26/10/2026', type: 'Site call', mgr: 'Ben', contacts: [], entries: [], loose: [], status: 'open', updated: Date.now()};
  await saveCall(); go('dash');
})()`);
await tick(150);

// ---- Health check opens a walk; all OK, nothing to tap; left empty, nothing is kept
d.querySelector('#s-dash [data-go="health"]').click(); await tick(100);
ok(g('screen') === 'walk' && d.querySelectorAll('#wkList .wkrow').length === 10, 'Health check opens the walk: ten checks');
ok(/All 10 checks OK/.test($('wkCount').textContent) && d.querySelectorAll('#wkList .wkok').length === 10 &&
  d.querySelectorAll('#wkList [data-wst]').length === 20 && !d.querySelector('#wkList [data-wst="ok"]'), 'every check starts OK, with only Watch and Fix to tap');
await done();
ok(g('screen') === 'dash' && !(g('call.walks') || []).length, 'left with nothing typed: no walk kept');

// ---- a conveyor with nothing wrong: the name and Done
d.querySelector('#s-dash [data-go="health"]').click(); await tick(100);
type('wkAsset', 'CV-200 Packing'); await tick(50);
await done();
ok(g('call.walks.length') === 1 && g('call.walks[0].asset') === 'CV-200 Packing', 'a clean conveyor is just its name and Done');
ok(/Health check - CV-200 Packing/.test($('logList').textContent) && /the other 10 OK/.test($('logList').textContent), 'it shows in the call log, all OK');

// ---- a conveyor with faults
d.querySelector('#s-dash [data-go="health"]').click(); await tick(100);
type('wkAsset', 'CV-114 Infeed line'); await tick(50);
row('Sprockets and shafts').querySelector('[data-wst="fix"]').click(); await tick(150);
const f1 = () => g(`call.entries.find(e => e.g === 'sprockets')`);
ok(g('screen') === 'wfault' && f1() && f1().st === 'fix' && f1().severity === 'Plan' && f1().asset === 'CV-114 Infeed line', 'Fix opens the fault straight away, a health entry on the walk');
ok($('title').textContent === 'Sprockets and shafts' && !$('wfKind').hidden && d.querySelector('#wfSt [data-v="fix"]').classList.contains('on'), 'the fault screen: its check, Fix on, Fix on site or New belt');
const chip = [...d.querySelectorAll('#wfChips [data-fid]')].find(b => /Worn, damaged or contaminated sprockets/.test(b.textContent));
ok(chip && d.querySelectorAll('#wfChips [data-fid]').length >= 5, 'the library faults for the check are chips');
chip.click(); await tick(50);
ok($('wfHead').value === 'Worn, damaged or contaminated sprockets' && /Replace worn sprockets/.test($('wfFix').value) && !$('wfFixAuto').hidden, 'a chip fills the heading and the suggested fix, badged as from the library');
type('wfFix', 'Replace the two outer sprockets.'); await tick(20);
ok($('wfFixAuto').hidden && f1().fixAuto === false, 'typing over the fix takes the badge off');
type('wfCom', 'Teeth hooked at the drive end.');
$('wfUrg').click(); await tick(50);
ok(f1().urgent && f1().severity === 'Urgent' && $('wfUrg').classList.contains('on'), 'Urgent is one tap');
await done();
ok(g('screen') === 'walk' && f1().comment === 'Teeth hooked at the drive end.' && f1().action === 'Replace the two outer sprockets.', 'Done goes back to the conveyor, everything kept');
ok(/Worn, damaged or contaminated sprockets/.test(row('Sprockets and shafts').textContent) && /Urgent/.test(row('Sprockets and shafts').textContent) &&
  !row('Sprockets and shafts').querySelector('.wkok'), 'the row says what was found');
ok(/1 to fix · the other 9 OK/.test($('wkCount').textContent), 'the count: ' + $('wkCount').textContent);

// Watch, then the same button again clears it (asking first, as something was typed)
row('Catenary sag and belt length').querySelector('[data-wst="watch"]').click(); await tick(150);
type('wfHead', 'Sag a little long');
$('back').click(); await tick(150);
ok(g('screen') === 'walk' && g(`call.entries.find(e => e.g === 'sag').fault`) === 'Sag a little long', 'the back arrow goes up to the conveyor, kept');
let asked = '';
w.confirm = m => { asked = m; return true; };
row('Catenary sag and belt length').querySelector('[data-wst="watch"]').click(); await tick(100);
ok(/Clear "Sag a little long" back to OK/.test(asked) && !g(`call.entries.find(e => e.g === 'sag')`) && row('Catenary sag and belt length').querySelector('.wkok'), 'tapping Watch again clears it, after asking');

// ---- a fault that needs a new belt: the belt opens for the conveyor, then back
row('Belt condition').querySelector('[data-wst="fix"]').click(); await tick(150);
d.querySelector('#wfKind [data-v="belt"]').click(); await tick(50);
ok($('wfFixWrap').hidden && !$('wfBeltWrap').hidden && /No belt logged on this conveyor yet/.test($('wfBeltMsg').textContent), 'New belt: no suggested fix, the belt instead');
[...d.querySelectorAll('#wfChips [data-fid]')].find(b => /Damaged or heavily worn belt edges/.test(b.textContent)).click(); await tick(50);
type('wfCom', 'Edges chewed along the operator side.');
w.eval(`window.__photo = 'data:image/jpeg;base64,/9j/AA=='; call.entries.find(e => e.g === 'belt_condition').photos.push(window.__photo)`);
$('wfBelt').click(); await tick(150);
ok(g('screen') === 'belt' && $('bAsset').value === 'CV-114 Infeed line', 'Belt details opens the belt form for the conveyor');
ok(!$('bxWhy').hidden && /Damaged or heavily worn belt edges/.test($('bWhyWalk').textContent), 'Why replace it shows what the walk found');
d.querySelector('#bWhyChips [data-why="Worn or damaged edges"]').click(); await tick(20);
type('bWhy', 'Third belt this year on this line.');
await done();
const belt = () => g(`call.entries.find(e => e.type === 'belt')`);
ok(g('screen') === 'wfault' && belt() && belt().walk === g('call.walks[1].id') && belt().why.c[0] === 'Worn or damaged edges' && belt().why.t === 'Third belt this year on this line.',
  'Done saves the belt with its reason, linked to the walk, and goes back to the fault');
ok(/Logged:/.test($('wfBeltMsg').textContent) && $('wfBelt').textContent === 'Open the belt', 'the fault now shows the belt');
await done(); await done();
ok(g('screen') === 'dash', 'Done, Done: back on the call');

// ---- the call log: one card per conveyor
const cards = [...d.querySelectorAll('#logList .card')];
const cv = cards.find(c => /CV-114 Infeed line/.test(c.textContent) && c.querySelector('[data-walk]'));
ok(cv && /new belt/.test(cv.textContent) && /2 to fix/.test(cv.textContent) && /the other 8 OK/.test(cv.textContent) && /1 photo/.test(cv.textContent), 'the conveyor card: ' + (cv && cv.textContent));
ok(cv.querySelectorAll('.wkstrip i.f').length === 2 && cv.querySelectorAll('.wkstrip i').length === 10, 'with its strip of ten checks');
ok(!cards.some(c => /^Health - /.test(c.textContent.trim())), 'its faults are not listed again');
ok($('cntHealth').textContent === '2 logged', 'the tile counts conveyors: ' + $('cntHealth').textContent);

// ---- an older health entry, from before the walk, still prints
w.eval(`call.entries.push({type: 'health', asset: 'CV-300 Old line', fault: 'Wear strip missing', htype: 'Frame or wear strip', severity: 'Plan', action: 'Refit', comment: '', photos: []})`);

// ---- the documents
const full = await g(`buildNotesHTML('full', 'full')`);
const c114 = full.slice(full.indexOf('CV-114 Infeed line</span>'), full.indexOf('</div></details>', full.indexOf('CV-114 Infeed line</span>')));
const at = s => c114.indexOf(s);
ok(/<details class="fd" open><summary><h2>Conveyors<\/h2><\/summary>/.test(full), 'the sections fold under their headings, open');
ok(at('Condition found') > 0 && at('Condition found') < at('Recommended: new belt') && at('Recommended: new belt') < at('Fix on site') &&
  at('Fix on site') < at('Checked and OK:'), 'a conveyor reads: condition, the belt, fixes on site, what was OK');
ok(at('Damaged or heavily worn belt edges') > at('Condition found') && at('Worn or damaged edges') > at('Condition found') &&
  at('Third belt this year') < at('Recommended: new belt'), 'the condition holds the walk fault and the belt\'s own reason');
ok(/cvtag urg">Urgent/.test(full) && /Suggested fix<\/b><p>Replace the two outer sprockets\.<\/p>/.test(full), 'the on-site fix: urgent, its fix, its comment');
ok(/Checked and OK:<\/b> Obstructions and contact, Wear strips and carryway, Return way, Catenary sag and belt length, Tracking/.test(full), 'the checks that were OK are named');
ok(/CV-200 Packing<\/span><span class="cvs">all 10 checks OK/.test(full), 'a clean conveyor says so');
ok(/CV-300 Old line/.test(full) && /Wear strip missing/.test(full), 'an older health entry still prints, under its asset');
ok(/class="toggle fdbar"/.test(full) && /data-fd="cond">Condition/.test(full) && /data-fd="belt">Belt spec/.test(full) && /data-fd="fix">/.test(full) &&
  /data-fd="ok">/.test(full) && /data-fd="ph">Photos/.test(full) && /data-fd="fold">Fold all/.test(full) && /classList\.toggle\("h-"\+k\)/.test(full), 'the chips and the fold buttons, with their script');
const belts = await g(`buildNotesHTML('belts', 'full')`);
ok(/Condition found/.test(belts) && /Recommended: new belt/.test(belts) && !/class="s-fix"/.test(belts) && !/CV-200 Packing/.test(belts), 'the belt document: the reason and the belt, no fixes, no conveyor without a belt');
const health = await g(`buildNotesHTML('health', 'full')`);
ok(/Condition found/.test(health) && /class="s-fix"/.test(health) && !/class="s-belt"/.test(health), 'the health check document: conditions and fixes, no belt spec');
const rfq = await g(`buildRFQHTML('full')`);
ok(!/Damaged or heavily worn belt edges|Third belt this year|Worn or damaged edges|Condition found/.test(rfq) && /<details class="fd" open>/.test(rfq),
  'the quote request for customer service never carries the condition; it folds too');

// the chips and folds work in the file
const doc = new JSDOM(full, { runScripts: 'dangerously' });
const dd = doc.window.document;
dd.querySelector('[data-fd="belt"]').click();
ok(dd.body.classList.contains('h-belt') && dd.querySelector('[data-fd="belt"]').getAttribute('aria-pressed') === 'false', 'a chip hides that kind of thing');
dd.querySelector('[data-fd="belt"]').click();
ok(!dd.body.classList.contains('h-belt'), 'and shows it again');
dd.querySelector('[data-fd="fold"]').click();
ok([...dd.querySelectorAll('details.fd')].every(x => !x.open), 'Fold all folds every section and conveyor');
dd.querySelector('[data-fd="open"]').click();
ok([...dd.querySelectorAll('details.fd')].every(x => x.open), 'Open all opens them');

// the email copy (folds flattened) is checked in Chromium: jsdom cannot lay out its iframe

// ---- editing the belt keeps what the form does not show (the Belts list status)
w.eval(`call.entries.find(e => e.type === 'belt').bstat = 'ordered'`);
g(`openLogged(call.entries.findIndex(e => e.type === 'belt'))`); await tick(100);
ok(d.querySelector('#bWhyChips [data-why="Worn or damaged edges"]').classList.contains('on') && $('bWhy').value === 'Third belt this year on this line.', 'a logged belt opens with its reason');
await done();
ok(belt().bstat === 'ordered' && belt().walk && belt().why.t === 'Third belt this year on this line.', 'saving it again keeps its status and its walk');

// ---- a quote request has no Why replace it
await g(`(async () => { call = {id: 'q1', rectype: 'quote', customer: 'Example Foods - Smithfield', date: '26/10/2026', type: 'Quote request', mgr: 'Ben', contacts: [], entries: [], loose: [], status: 'open', updated: Date.now()}; openEntry('belt', true); })()`);
await tick(100);
ok($('bxWhy').hidden, 'a quote request: no Why replace it');

// ---- deleting a walk
await g(`(async () => { call = await callsAll().then(cs => cs.find(c => c.id === 'c1')); go('dash'); })()`); await tick(150);
w.confirm = m => { asked = m; return true; };
const bin = [...d.querySelectorAll('#logList [data-wdel]')].find(b => /CV-114/.test(b.getAttribute('aria-label')));
bin.click(); await tick(150);
ok(/Delete the health check of CV-114 Infeed line/.test(asked) && /2 faults and 1 photo go with it/.test(asked) && /A belt logged on it stays/.test(asked), 'the bin names what goes: ' + asked.replace(/\n/g, ' '));
ok(g('call.walks.length') === 1 && !g(`call.entries.some(e => e.walk && e.type === 'health')`) && g(`call.entries.some(e => e.type === 'belt')`), 'the walk and its faults go, the belt stays');

const real = errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/i.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
