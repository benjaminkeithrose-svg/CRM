// v174: Next step replaces Project and Task in a call: what, the project it
// moves (chips of those with a step still open at this customer), when (a
// Friday). A task on the planner; ticked off in a later call it prints struck
// through in that call's notes; the brief and the summary read it.
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
for (const f of ['zones.js', 'manuals.js', 'healthlib.js', 'app.js']) {
  const el = d.createElement('script'); el.textContent = fs.readFileSync(f, 'utf8'); d.body.appendChild(el);
}
d.dispatchEvent(new w.Event('DOMContentLoaded'));
await tick(500);
const $ = id => d.getElementById(id);
const g = e => w.eval('(' + e + ')');
w.eval(`toast = m => { window.__t = m; }`);
const type = (id, v) => { $(id).value = v; $(id).dispatchEvent(new w.Event('input', { bubbles: true })); };
const done = async () => { $('barDone').click(); await tick(200); };
const A = 'Example Foods - Smithfield';
const mkCall = id => `call = {id: '${id}', customer: '${A}', date: '27/10/2026', type: 'Site call', mgr: 'Ben', contacts: [], entries: [], loose: [], status: 'open', updated: Date.now()}; await saveCall(); go('dash');`;
const dates = g('stepDates()');

// ---- Fridays
ok(g(`iso(fridayOf(new Date(2026, 9, 27)))`) === '2026-10-30' && g(`iso(fridayOf(new Date(2026, 9, 30)))`) === '2026-10-30' &&
  g(`iso(fridayOf(new Date(2026, 9, 31)))`) === '2026-11-06', 'this week means this Friday; on a Friday that day; at the weekend the coming one');
ok(g(`(() => { const f = fridayOf(new Date()); return iso(addDays(f, 7)) === stepDates().next && iso(addDays(f, 28)) === stepDates().month; })()`), 'next week and in a month are Fridays too');

// ---- the tiles
await g(`(async () => { ${mkCall('c1')} })()`); await tick(150);
const tiles = [...d.querySelectorAll('#s-dash .tiles [data-go]')].map(b => b.dataset.go).join(',');
ok(tiles === 'belt,health,note,step', 'the call has Belt, Health check, Note, Next step: ' + tiles);

// ---- a new next step, with a new project
d.querySelector('#s-dash [data-go="step"]').click(); await tick(100);
ok(g('screen') === 'step' && $('nsWhat').value === '' && d.querySelector('#nsWhen [data-nsw="next"]').classList.contains('on') &&
  new RegExp(g(`dayLabel('${dates.next}')`)).test($('nsOn').textContent), 'Next step opens empty, Next week picked, the day it lands on said');
ok(d.querySelectorAll('#nsProj [data-nsp]').length === 1 && $('nsProjNew').hidden && $('nsOpenWrap').hidden, 'no projects open here yet: only New project');
type('nsWhat', 'See the local OEM about the offal transfer, with our tech team.');
d.querySelector('#nsProj .nsnew').click(); await tick(20);
ok(!$('nsProjNew').hidden, 'New project asks for its name');
type('nsProjNew', 'Offal transfer line');
await done();
const t1 = () => g(`TASKS.find(t => /offal transfer/.test(t.title))`);
ok(g('screen') === 'dash' && t1() && t1().type === 'Next step' && t1().acct === A && t1().callId === 'c1' && t1().project === 'Offal transfer line' &&
  t1().date === dates.next && t1().start === '09:00' && !t1().done, 'Done puts it on the planner: next Friday, linked to the call and the project');
ok(/Next step on your planner/.test(w.__t), 'and says so: ' + w.__t);
ok(!$('dashTasksHead').hidden && /Next steps from this call/.test($('dashTasksHead').textContent) && /offal transfer/.test($('dashTasks').textContent) &&
  /Offal transfer line/.test($('dashTasks').textContent), 'listed under the call with its project');
ok($('cntStep').textContent === '1 open here', 'the tile counts what is open here');

// a second, on the same project, this week
d.querySelector('#s-dash [data-go="step"]').click(); await tick(100);
const chips = [...d.querySelectorAll('#nsProj [data-nsp]')].map(b => b.textContent);
ok(chips.join('|') === 'Offal transfer line|New project', 'the open project is a chip: ' + chips.join('|'));
d.querySelector('#nsProj [data-nsp="Offal transfer line"]').click();
d.querySelector('#nsWhen [data-nsw="week"]').click(); await tick(20);
type('nsWhat', 'Send the quote for the CV-114 belt.');
await done();
const t2 = () => g(`TASKS.find(t => /CV-114/.test(t.title))`);
ok(t2().project === 'Offal transfer line' && t2().date === dates.week, 'a chip and This week');

// a date
d.querySelector('#s-dash [data-go="step"]').click(); await tick(100);
d.querySelector('#nsWhen [data-nsw="date"]').click(); await tick(20);
ok(!$('nsDate').hidden, 'Pick a date shows the date');
$('nsDate').value = '2026-12-04'; $('nsDate').dispatchEvent(new w.Event('change'));
type('nsWhat', 'Check the spiral drawings came through.');
await done();
ok(g(`TASKS.find(t => /spiral drawings/.test(t.title)).date`) === '2026-12-04' && !g(`TASKS.find(t => /spiral drawings/.test(t.title)).project`), 'on the date picked, no project');

// empty: nothing kept
const n0 = g('TASKS.length');
d.querySelector('#s-dash [data-go="step"]').click(); await tick(100);
await done();
ok(g('TASKS.length') === n0, 'left empty, nothing is kept');

// change one
[...d.querySelectorAll('#dashTasks [data-nsopen]')].find(b => /CV-114/.test(b.textContent)).click(); await tick(100);
ok(g('screen') === 'step' && $('nsWhat').value === 'Send the quote for the CV-114 belt.' && d.querySelector('#nsWhen [data-nsw="week"]').classList.contains('on') &&
  d.querySelector('#nsProj [data-nsp="Offal transfer line"]').classList.contains('on'), 'tapping one opens it as it was');
type('nsWhat', 'Send the quote for the CV-114 belt, with the sprockets.');
await done();
ok(t2().title === 'Send the quote for the CV-114 belt, with the sprockets.' && g(`TASKS.filter(t => /CV-114/.test(t.title)).length`) === 1, 'changed, not copied');

// the summary reads them
ok(/Next steps: See the local OEM about the offal transfer, with our tech team\., project Offal transfer line, by /.test(g(`callDigest(call)`)), 'the visit summary is sent the next steps');

// ---- a later call at the same customer: what is still open, ticked off there
await g(`(async () => { ${mkCall('c2')} })()`); await tick(150);
ok($('cntStep').textContent === '3 open here' && $('dashTasksHead').hidden, 'a new call: three open here, none from this call yet');
d.querySelector('#s-dash [data-go="step"]').click(); await tick(100);
ok(!$('nsOpenWrap').hidden && d.querySelectorAll('#nsOpen .nsrow').length === 3, 'Still open at this customer lists them');
const box = [...d.querySelectorAll('#nsOpen [data-nstick]')].find(b => /offal transfer/.test(b.getAttribute('aria-label')));
box.click(); await tick(200);
ok(t1().done && t1().doneIn === 'c2' && t1().doneAt > 0, 'ticked off here: done, and which call it was done in');
ok(d.querySelector('#nsOpen .nsrow.done') && /Done/.test(d.querySelector('#nsOpen .nsrow.done').textContent), 'shown done, still on the list for this visit');
type('nsWhat', 'Arrange the trial with the maintenance planner.');
await done();
ok(/offal transfer/.test($('dashTasks').textContent) && d.querySelector('#dashTasks .nsrow.done'), 'the call lists the one done here, struck through');
d.querySelector('#s-dash [data-go="step"]').click(); await tick(100);
ok([...d.querySelectorAll('#nsProj [data-nsp]')].map(b => b.textContent).join('|') === 'Offal transfer line|New project', 'its project is still a chip while another step on it is open');
await done();

// the notes
const full = await g(`buildNotesHTML('full', 'full')`);
ok(/<h2>Next steps<\/h2>/.test(full) && /<td>Arrange the trial with the maintenance planner\.<\/td><td>—<\/td>/.test(full), 'the call notes list this call\'s next steps');
ok(/<s>See the local OEM about the offal transfer, with our tech team\. <span[^>]*>\(from an earlier call\)<\/span><\/s><\/td><td>Offal transfer line<\/td><td>Done<\/td>/.test(full), 'and one from an earlier call ticked off here, struck through');
ok(!/Next steps/.test(await g(`buildNotesHTML('belts', 'full')`)), 'not in the belt document');
const c1notes = await g(`(async () => { const c = (await callsAll()).find(x => x.id === 'c1'); return buildNotesHTML('full', 'full', c); })()`);
ok(/See the local OEM/.test(c1notes) && /Send the quote for the CV-114 belt, with the sprockets\./.test(c1notes), 'the first call\'s notes still list what it raised');

// the brief
const hist = g(`accountHistory('${A}')`);
ok(/Open next steps and tasks: .*Send the quote for the CV-114 belt, with the sprockets\., project Offal transfer line, due /.test(hist) && !/maintenance planner.*done/.test(hist), 'the brief and Prepare tomorrow get the open ones, with project and day');

// ---- MBO rules: no project rules
ok(!/a project moved to Complete|data-rule="project"/.test(g(`mboRulesHTML({})`)), 'the MBO rules no longer offer projects');
ok(g(`mboRuleMatch({project: true}, {id: 'x', customer: '${A}', entries: [{type: 'project', project: 'P'}]})`) === false &&
  /ticks by hand/.test(g(`mboRulesHTML({project: true})`)), 'an MBO still set to a project rule ticks by hand, and says so');

// ---- an older project entry still opens
await g(`(async () => { call.entries.push({type: 'project', project: 'Old line', status: 'Scoping', next: 'Call back', photos: []}); await saveCall(); go('dash'); })()`); await tick(150);
ok(/Project - Old line/.test($('logList').textContent), 'an older project is still in the call log');

const real = errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/i.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
