// v133: a note or project saves itself into the call log as it is typed, so a
// half-done one shows on the call as a note or a project rather than as a
// hidden draft. Done just leaves. A new one rubbed out again is taken back out.
// Also: text boxes grow to fit (CSS only; checked in Chromium, not here).
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
const setCall = o => { w.__t = o; w.eval('call = window.__t'); };
const mk = id => ({ id, customer: 'Acme Foods', date: '01/09/2026', type: 'Site call', mgr: 'B', site: '',
  contacts: [{ name: 'X', crm: true }], entries: [], loose: [], closed: false, updated: Date.now(), status: 'in progress' });
const type = (id, v) => { $(id).value = v; $(id).dispatchEvent(new w.Event('input')); };
const notes = () => g('call').entries.filter(e => e.type === 'note');
const projects = () => g('call').entries.filter(e => e.type === 'project');

// ---- a note saves itself ----
setCall(mk('a1'));
w.openEntry('note');
type('nText', 'Second line going in');
t('nothing is written while still typing', notes().length === 0);
await wait(900);
t('a moment later the note is in the call log', notes().length === 1 && notes()[0].text === 'Second line going in');
t('the form says it is saved as a note', /Saved in the call log as a note/.test($('draft_note').textContent), $('draft_note').textContent);
t('no hidden draft is kept alongside it', !(g('call').drafts && g('call').drafts.note));
type('nText', 'Second line going in next March');
await wait(900);
t('more typing updates the same note, not a second one', notes().length === 1 && notes()[0].text === 'Second line going in next March');
// leaving by another route with a change still pending: it goes in on the way out
type('nText', 'Second line going in next March, two shifts');
w.showScreen('reports');
await wait(50);
t('leaving straight away still saves the last change', notes()[0].text === 'Second line going in next March, two shifts', notes()[0].text);
t('and the call log shows it as a note', (w.showScreen('dash'), /Note - /.test($('logList').textContent)));
// back to it through the call strip and Done: still one note
w.showScreen('note');
type('nText', 'Second line in March, two shifts');
$('barDone').click();
await wait(200);
t('Done leaves for the call', g('screen') === 'dash');
t('Done does not add a second copy', notes().length === 1 && notes()[0].text === 'Second line in March, two shifts');

// ---- a new note rubbed out again is taken back out ----
w.openEntry('note');
type('nText', 'Wrong call');
await wait(900);
t('the new note went in', notes().length === 2);
type('nText', '');
$('barDone').click();
await wait(200);
t('rubbed out before leaving: taken back out of the log', notes().length === 1 && notes()[0].text === 'Second line in March, two shifts', notes().length);

// ---- an existing note rubbed out stays as it was ----
$('logList').querySelector('[data-edit="0"]').click();
await wait(50);
t('opening a logged note says it is in the log', /In the call log as a note/.test($('draft_note').textContent));
type('nText', '');
await wait(900);
$('barDone').click();
await wait(200);
t('an existing note is not deleted by emptying it', notes().length === 1 && notes()[0].text === 'Second line in March, two shifts');

// ---- a project saves itself once it has a name ----
setCall(mk('a2'));
w.openEntry('project');
type('pNotes', 'Customer wants a quote by Friday');
await wait(900);
t('without a name a project is not logged yet', projects().length === 0);
type('pName', 'Loa');
await wait(900);
t('with a name it is logged', projects().length === 1 && projects()[0].project === 'Loa');
type('pName', 'Loadout upgrade');
$('pStat').value = 'Quoted'; $('pStat').dispatchEvent(new w.Event('change'));
await wait(900);
t('finishing the name updates the same project', projects().length === 1 && projects()[0].project === 'Loadout upgrade' && projects()[0].status === 'Quoted');
t('the form says it is saved as a project', /Saved in the call log as a project/.test($('draft_project').textContent));
$('barDone').click();
await wait(200);
t('Done adds no second copy', projects().length === 1 && g('screen') === 'dash');

// ---- a project already in this call is updated in place ----
w.showScreen('dash'); await wait(50);
$('logList').querySelector('[data-edit="0"]').click();
await wait(50);
t('opening it says it is in the log', /In the call log as a project/.test($('draft_project').textContent));
type('pNext', 'Site measure');
await wait(900);
t('a change to it updates it in place', projects().length === 1 && projects()[0].next === 'Site measure');
$('barDone').click(); await wait(200);

// ---- a fresh note never writes into another entry ----
const c3 = mk('a3');
c3.entries = [{ type: 'belt', asset: 'C-12', photos: [] }];
setCall(c3);
w.eval('editingIdx = 0');                 // a belt edit left half done
w.openEntry('note');
type('nText', 'Hygiene audit next month');
await wait(900);
$('barDone').click(); await wait(200);
const es = g('call').entries;
t('the belt is untouched', es[0].type === 'belt' && es[0].asset === 'C-12');
t('the note is its own entry', es.length === 2 && es[1].type === 'note');

// ---- deleting another entry mid-note does not send it astray ----
const c4 = mk('a4');
c4.entries = [{ type: 'note', topic: 'Plant', text: 'Earlier note', photos: [] }];
setCall(c4);
w.openEntry('note');
type('nText', 'Later note');
await wait(900);
w.eval('call.entries.splice(0, 1)');      // the earlier one deleted meanwhile
type('nText', 'Later note, changed');
await wait(900);
t('it keeps writing to its own note', notes().length === 1 && notes()[0].text === 'Later note, changed', JSON.stringify(notes()));

// ---- text boxes grow (CSS) ----
const css = fs.readFileSync('index.html', 'utf8');
t('text boxes are sized to their content', /textarea\{[^}]*field-sizing:content/.test(css));

t('no errors', errs.length === 0, errs.join(' | '));
console.log(`PASS ${pass}` + (fail ? `  FAIL ${fail}` : ''));
process.exit(fail ? 1 : 0);
