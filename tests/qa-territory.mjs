// v194: the week's territory as blocks across the top of the calendar (a
// split week, sized by dragging an end), and one download: the current view,
// all of it, every time, with the territory in the same file. Made-up data.
// The drag itself needs a real pointer: what it commits is tested here.
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
w.eval(`downloadFile = (name, text) => { window.__dl = (window.__dl || []).concat([{name, text}]); }`);
w.eval(`toast = m => { window.__t = m; }`);
const dl = () => (w.__dl || []).slice(-1)[0];
let answer = true, asked = ''; w.confirm = m => { asked = m; return answer; };
const MON = '2026-11-09';
const S = 'Example Foods - Smithfield', M = 'Example Dairy - Dandenong';

await g(`(async () => {
  const list = [{a: '${S}', sub: 'Smithfield', z: 'Z1', foc: 'High', cad: CAD['High'], mgr: 'Jo Bloggs', rep: '', c: []},
                {a: '${M}', sub: 'Dandenong', z: 'Z7', foc: 'High', cad: CAD['High'], mgr: 'Jo Bloggs', rep: '', c: []}];
  await accReplaceAll(list); indexAccounts(list);
  showScreen('plan'); plan.view = 'week'; plan.anchor = parseIso('${MON}'); plan.zone = 'Z1'; renderPlan();
})()`);
await tick(100);
const MZ = g(`ACC_BY_NAME.get('${M}').z`);
const bar = () => d.querySelector('#calBody .tbar');
const blocks = () => [...d.querySelectorAll('#calBody .tbar .tblk')].map(b => b.querySelector('.tz').textContent + '@' + b.style.gridColumn);

// ---- nothing marked: no bar, no nudge
ok(!bar(), 'a week with no territory has no bar');
ok(!$('terrWrap') && !$('terr'), 'Territory this week is gone from under the list');

// ---- the first zone: the whole working week
$('pZoneAdd').click(); await tick(100);
let sp = g(`wkSpans('${MON}')`);
ok(sp.length === 1 && sp[0].zone === 'Z1' && sp[0].from === 0 && sp[0].to === 4 && sp[0].id === '', 'first zone: Monday to Friday, keeping the week\'s own UID: ' + JSON.stringify(sp));
ok(bar() && blocks().length === 1 && /^Z1 Sydney Metro/.test(blocks()[0]) && /2 \/ 7/.test(blocks()[0]), 'drawn across Mon to Fri above the days: ' + blocks());
ok(g(`WEEKS['${MON}'].zone`) === 'Z1', 'older builds still read the week\'s zone');
ok(/✓ Z1 is in the week of 9 Nov’s territory, Mon–Fri/.test($('pZoneMark').textContent), 'beside the zone it says so: ' + $('pZoneMark').textContent);

// ---- a second zone takes the days its visits are on
await g(`(async () => {
  const a = {id: 'ap-m1', acct: '${M}', type: 'Intralox site visit', date: '2026-11-12', start: '09:00', dur: 60, contacts: []};
  const b = {id: 'ap-m2', acct: '${M}', type: 'Intralox site visit', date: '2026-11-13', start: '11:00', dur: 60, contacts: []};
  const c = {id: 'ap-s1', acct: '${S}', type: 'Intralox site visit', date: '2026-11-10', start: '10:00', dur: 60, contacts: []};
  for(const x of [a, b, c]){ APPTS.push(x); await saveAppt(x); }
  plan.zone = '${MZ}'; renderPlan();
})()`); await tick(80);
ok(/Add \w+ to the week of 9 Nov/.test($('pZoneMark').textContent) && /has Z1 Mon–Fri/.test($('pZoneMark').textContent), 'another zone: add it, and what the week has: ' + $('pZoneMark').textContent);
$('pZoneAdd').click(); await tick(100);
sp = g(`wkSpans('${MON}')`);
ok(sp.length === 2 && sp[0].zone === 'Z1' && sp[0].from === 0 && sp[0].to === 2 && sp[1].zone === MZ && sp[1].from === 3 && sp[1].to === 4,
   'the second zone takes Thu–Fri where its visits are, the first gives them up: ' + JSON.stringify(sp.map(x => [x.zone, x.from, x.to])));
ok(blocks().length === 2 && /2 \/ 5/.test(blocks()[0]) && /5 \/ 7/.test(blocks()[1]), 'two blocks on the bar: ' + blocks());
ok(sp[1].id && sp[1].id !== sp[0].id, 'the second has its own id, for its own UID in Outlook');

// ---- resize: what a drag commits (the drag itself needs a real pointer)
await g(`(async () => { const all = wkSpans('${MON}'); const x = all[1]; x.from = 2; await wkSave('${MON}', spanFit(all, x)); renderPlan(); })()`); await tick(50);
sp = g(`wkSpans('${MON}')`);
ok(sp[0].to === 1 && sp[1].from === 2 && sp[1].to === 4, 'stretching one block takes the day from its neighbour: ' + JSON.stringify(sp.map(x => [x.zone, x.from, x.to])));
await g(`(async () => { const all = wkSpans('${MON}'); const x = all[1]; x.to = 5; await wkSave('${MON}', spanFit(all, x)); renderPlan(); })()`); await tick(50);
ok(g(`wkSpans('${MON}')[1].to`) === 5 && /Sat/.test(g(`spanDays(wkSpans('${MON}')[1])`)), 'and it can go onto the weekend');
ok(d.querySelectorAll('#calBody .tbar .tblk .th').length === 4, 'each block has a handle at each end');
await g(`(async () => { const all = wkSpans('${MON}'); const x = all[1]; x.to = 4; await wkSave('${MON}', spanFit(all, x)); renderPlan(); })()`); await tick(50);

// ---- the bar in Month view, and the day's zone in Day view
await g(`(plan.view = 'month', renderPlan())`); await tick(50);
ok(d.querySelectorAll('#calBody .month > .tbar').length === 1 && d.querySelectorAll('#calBody .month > .tbar .tblk').length === 2, 'Month: the week\'s row has the bar');
await g(`(plan.view = 'day', plan.anchor = parseIso('2026-11-13'), renderPlan())`); await tick(50);
ok(/^\w+ .*Wed–Fri/.test(d.querySelector('#calBody .tday') ? d.querySelector('#calBody .tday').textContent : ''), 'Day: Friday shows its zone: ' + (d.querySelector('#calBody .tday') || {}).textContent);

// ---- one download: the view, all of it, every time
ok($('pmExport').textContent === 'Download current view' && !$('pmExportAll') && !$('pmToday') && !$('pmReassign'), 'the menu has one download, and no Today or Reassign');
ok($('setReassign') && $('setReassign').closest('.adminonly'), 'Reassign manager is in Settings, for the admin');
await g(`doExport()`); await tick(80);
let f = dl();
ok(f.name === 'field-crm-day-2026-11-13.ics' && /UID:ap-m2@/.test(f.text) && !/UID:ap-m1@/.test(f.text) && !/UID:ap-s1@/.test(f.text), 'Day: only that day\'s visits: ' + f.name);
ok((f.text.match(/UID:wk-/g) || []).length === 1, 'and the territory block over that day');
await g(`(plan.view = 'week', plan.anchor = parseIso('${MON}'), renderPlan())`);
await g(`(async () => { const x = {id: 'ap-sun', acct: '${S}', type: 'Phone call', date: '2026-11-15', start: '10:00', dur: 30, contacts: []}; APPTS.push(x); await saveAppt(x); })()`);
await g(`doExport()`); await tick(80);
f = dl();
ok(/UID:ap-m1@/.test(f.text) && /UID:ap-s1@/.test(f.text) && /UID:ap-sun@/.test(f.text), 'Week: Monday to Sunday, the weekend too');
ok(/UID:wk-2026-11-09@field-crm/.test(f.text) && new RegExp('UID:wk-2026-11-09-' + sp[1].id + '@').test(f.text), 'each block its own event; the first keeps the week\'s old UID');
ok(/DTSTART;VALUE=DATE:20261109\r?\nDTEND;VALUE=DATE:20261111/.test(f.text.replace(/\r\n/g, '\n').replace(/\n(?!DTEND)/g, '\n')) || (/DTSTART;VALUE=DATE:20261109/.test(f.text) && /DTEND;VALUE=DATE:20261111/.test(f.text)), 'Z1 Mon–Tue: ends Wednesday (exclusive)');
ok(/DTSTART;VALUE=DATE:20261111/.test(f.text) && /DTEND;VALUE=DATE:20261114/.test(f.text) && /X-MICROSOFT-CDO-BUSYSTATUS:FREE/.test(f.text), 'the other Wed–Fri, shown as free');
ok(/Downloaded 4 visits and 2 territory blocks/.test(w.__t), 'it says what went: ' + w.__t);
await g(`doExport()`); await tick(80);
const f2 = dl();
ok(/UID:ap-m1@/.test(f2.text) && (f2.text.match(/BEGIN:VEVENT/g) || []).length === 6 && !/SEQUENCE:1/.test(f2.text), 'again: everything again, the same UIDs and versions, so nothing doubles in Outlook');
await g(`(async () => { const all = wkSpans('${MON}'); all[0].to = 0; await wkSave('${MON}', all); })()`);
ok(g(`spanState(wkSpans('${MON}')[0], WEEKS['${MON}'])`) === 'changed', 'a resized block is changed since its download');
await g(`doExport()`); await tick(80);
ok(/SUMMARY:Z1 Sydney Metro[^\n]*\r?\n?/.test(dl().text) && /SEQUENCE:1/.test(dl().text), 'and goes with a higher version, so Outlook moves it');

// ---- remove: asks, naming it, and says Outlook keeps its copy
asked = ''; answer = false;
await g(`(plan.view = 'week', renderPlan())`); await tick(50);
d.querySelector('#calBody .tbar .tblk').click(); await tick(50);
const rm = [...d.querySelectorAll('#vmBody [data-cm]')].find(b => /Remove from/.test(b.textContent));
ok(rm && rm.classList.contains('danger'), 'click a block: Remove, in the warning colour');
rm.click(); await tick(50);
ok(/Remove Z1 Sydney Metro .*Mon.*from the week of 9 Nov/.test(asked) && /delete it there too/.test(asked) && g(`wkSpans('${MON}').length`) === 2, 'it asks, naming it, and says to delete it in Outlook; Cancel keeps it');
answer = true;
d.querySelector('#calBody .tbar .tblk').click(); await tick(50);
[...d.querySelectorAll('#vmBody [data-cm]')].find(b => /Remove from/.test(b.textContent)).click(); await tick(80);
sp = g(`wkSpans('${MON}')`);
ok(sp.length === 1 && sp[0].zone === MZ && g(`WEEKS['${MON}'].zone`) === MZ, 'OK removes it; the week\'s zone follows the block left');

// ---- a week marked before v194 reads as one Mon–Fri block, downloaded
await g(`(async () => { WEEKS['2026-11-16'] = {zone: 'Z1', exp: 'Z1|', expAt: 1, icsSeq: 2}; await saveWeeks(); })()`);
sp = g(`wkSpans('2026-11-16')`);
ok(sp.length === 1 && sp[0].from === 0 && sp[0].to === 4 && sp[0].id === '' && sp[0].seq === 2 && g(`spanState(wkSpans('2026-11-16')[0], WEEKS['2026-11-16'])`) === 'synced',
   'an older week marker: one block, Mon–Fri, its UID, version and downloaded state kept');
ok(!g(`wkSpans('x')`).length && (await g(`(async () => { WEEKS['2026-01-05'] = 'Melbourne'; return wkSpans('2026-01-05').length; })()`)) === 0, 'anything else in the weeks is ignored, not a crash');

const real = errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/i.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`territory: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
