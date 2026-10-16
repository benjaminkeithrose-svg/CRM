// v162: the zone's territory marker beside the zone on the Plan screen, and
// tasks going to Outlook as appointments in the same .ics as the visits.
// Everything here is made up.
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

await g(`(async () => {
  const list = [{a: 'Acme Pty Ltd - Smithfield', sub: 'Smithfield', z: 'Z1', foc: 'High', cad: CAD['High'], mgr: 'Ben', rep: '', c: []}];
  await accReplaceAll(list); indexAccounts(list);
  showScreen('plan'); plan.view = 'week'; plan.anchor = new Date(); plan.zone = 'Z1'; renderPlan();
})()`);
await tick(100);
const mon = g(`iso(startOfWeek(new Date()))`);

// ---- the zone's territory marker sits beside the zone
ok(/Add Z1 to this week/.test($('pZoneMark').textContent), 'beside the zone: Add Z1 to this week: ' + $('pZoneMark').textContent);
$('pZoneAdd').click(); await tick(100);
ok(g(`WEEKS['${mon}'] && WEEKS['${mon}'].zone`) === 'Z1' && /✓ Z1 is this week’s territory/.test($('pZoneMark').textContent), 'one tap marks it, and it says so');
const saved = await g(`kvGet('weeks')`); ok(saved && saved[mon] && saved[mon].zone === 'Z1', 'the marker is saved: ' + JSON.stringify(saved));
await g(`(async () => { plan.zone = 'Z2'; renderPlan(); })()`); await tick(50);
ok(/Add Z2 to this week/.test($('pZoneMark').textContent) && /This week is marked Z1/.test($('pZoneMark').textContent), 'another zone offers to replace it, and says what is marked now');
g(`(plan.anchor = addDays(startOfWeek(new Date()), 7), renderPlan())`); await tick(50);
ok(/Add Z2 to the week of \d+ \w{3}/.test($('pZoneMark').textContent), 'a later week is named by its date: ' + $('pZoneMark').textContent);
g(`(plan.anchor = new Date(), renderPlan())`); await tick(50);

// ---- tasks go to Outlook as appointments
const day = g(`iso(addDays(startOfWeek(new Date()), 2))`);
await g(`(async () => {
  const t = {id: 't-1', type: 'Write email', title: 'Send belt survey summary', date: '${day}', start: '14:00', dur: 30,
    acct: 'Acme Pty Ltd - Smithfield', contact: 'Jo Example', notes: 'Include the photos', updated: Date.now()};
  await tasksPut(t); TASKS = [t]; renderPlan();
})()`);
await tick(50);
ok(/1 not in Outlook/.test($('planInfo').textContent), 'a dated task counts as not in Outlook yet: ' + $('planInfo').textContent);
await g(`doExport('pending')`); await tick(100);
const f = dl();
ok(f && /BEGIN:VEVENT/.test(f.text) && /UID:task-t-1@field-crm\.intralox/.test(f.text) && /CATEGORIES:Field CRM task/.test(f.text), 'the task goes in the .ics as an appointment');
ok(/SUMMARY:Send belt survey summary - Acme Pty Ltd - Smithfield/.test(f.text) && /DTSTART;TZID=Australia\/Sydney:\d{8}T140000/.test(f.text) && /DTEND;TZID=Australia\/Sydney:\d{8}T143000/.test(f.text), 'with its title, account, time and the zone timezone');
ok(!/ATTENDEE/.test(f.text) && !/VTODO/.test(f.text) && /Task: Write email/.test(f.text) && /Contact: Jo Example/.test(f.text), 'no invitees, no Outlook task; the type and contact in the description');
ok(/1 task written/.test(w.__t) && g(`TASKS[0].exp`) === g(`taskRev(TASKS[0])`) && !/not in Outlook/.test($('planInfo').textContent), 'afterwards it counts as in Outlook: ' + w.__t);
await g(`doExport('pending')`); await tick(50);
ok(/already in your Outlook/.test(w.__t), 'downloading again has nothing new');
await g(`(async () => { TASKS[0].start = '15:00'; TASKS[0].updated = Date.now(); await tasksPut(TASKS[0]); renderPlan(); })()`);
ok(g(`taskIcsState(TASKS[0])`) === 'changed' && /1 not in Outlook/.test($('planInfo').textContent), 'moving it marks it changed');
await g(`doExport('pending')`); await tick(50);
ok(/SEQUENCE:1/.test(dl().text) && /T150000/.test(dl().text), 'and the update goes with a higher sequence, so Outlook moves it');
ok(g(`taskIcsState(TASKS[0])`) === 'synced' && (await g(`tasksAll()`))[0].exp, 'the saved task remembers it was sent');
await g(`(async () => { TASKS[0].done = true; TASKS[0].doneAt = Date.now(); renderPlan(); })()`);
ok(g(`taskIcsState(TASKS[0])`) === 'synced', 'ticking it done is not a change Outlook needs');

const real = errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/i.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
