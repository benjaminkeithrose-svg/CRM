// v95: Tidy on the note, project and comment fields, and Draft it on a Write
// email task. The ai-tidy Supabase function is stubbed here: this proves the
// app's side (what it sends, the sheet, Use this / Keep mine, errors), not the
// function or the model.
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
w.matchMedia = () => ({ matches: true, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
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
const open = id => $(id).hasAttribute('open');
const toast = () => $('toast').textContent;

// ---- the stand-in for supabase.functions.invoke
const sent = [];
let answer = null;          // {data} or {error}
let hold = null;            // a promise to wait on before answering
w.__invoke = async (name, opts) => {
  sent.push({ name, body: opts && opts.body });
  if (hold) await hold;
  return answer;
};
const fnErr = (message) => ({ data: null, error: Object.assign(new Error('Edge Function returned a non-2xx status code'),
  { context: { json: async () => ({ error: 'x', message }) } }) });

ok(g('DIALOGS').includes('aidlg'), 'the AI sheet is registered in DIALOGS');
const btns = [...d.querySelectorAll('[data-ai]')].map(b => b.dataset.ai + ':' + b.dataset.field + ':' + b.textContent.trim());
ok(btns.slice().sort().join(' ') === 'bComment:belt:Tidy hComment:health:Tidy nText:note:Tidy pNotes:project:Tidy',
  'Tidy on project notes, note, belt comment and health comment: ' + btns.join(' '));
ok($('tkDraft') && $('tkDraft').textContent.trim() === 'Draft it' && $('tkMail').contains($('tkDraft')), 'Draft it sits under the email body');

// ---- not signed in: says so, opens nothing, sends nothing
$('nText').value = 'um so the line three belt is uh worn';
d.querySelector('[data-ai="nText"]').click(); await tick();
ok(!open('aidlg') && /Sign in to cloud sync/.test(toast()) && !sent.length, 'signed out: a message, nothing sent: ' + toast());

g(`(() => { sbClient = {functions: {invoke: (n, o) => window.__invoke(n, o)}}; sbUser = {id: 'u1'}; })()`);

// ---- offline
Object.defineProperty(w.navigator, 'onLine', { configurable: true, get: () => false });
d.querySelector('[data-ai="nText"]').click(); await tick();
ok(!open('aidlg') && /signal/.test(toast()) && !sent.length, 'offline: a message, nothing sent');
Object.defineProperty(w.navigator, 'onLine', { configurable: true, get: () => true });

// ---- empty field
$('pNotes').value = '   ';
d.querySelector('[data-ai="pNotes"]').click(); await tick();
ok(!open('aidlg') && !sent.length, 'empty field: nothing sent');

// ---- tidy, then Use this
let release; hold = new Promise(r => { release = r; });
answer = { data: { text: '• Line 3 belt is worn.', used: 1 }, error: null };
let typed = 0; $('nText').addEventListener('input', () => typed++);
d.querySelector('[data-ai="nText"]').click(); await tick();
ok(open('aidlg') && /Asking/.test($('aiMsg').textContent) && $('aiUse').disabled, 'sheet opens while it asks, Use this disabled');
ok($('aiOrig').textContent === 'um so the line three belt is uh worn', 'shows yours as it is now');
ok(sent.length === 1 && sent[0].name === 'ai-tidy' && sent[0].body.kind === 'tidy' && sent[0].body.field === 'note' &&
  sent[0].body.text === 'um so the line three belt is uh worn', 'sends the one field, its kind and its text: ' + JSON.stringify(sent[0]));
release(); hold = null; await tick();
ok(!$('aiUse').disabled && $('aiOut').value === '• Line 3 belt is worn.' && !$('aiOutF').hidden && $('aiSubjF').hidden, 'answer shown, editable');
ok($('nText').value === 'um so the line three belt is uh worn', 'nothing changed before Use this');
$('aiOut').value = '• Line 3 belt is worn. Replace.';
$('aiUse').click(); await tick(100);
ok(!open('aidlg') && $('nText').value === '• Line 3 belt is worn. Replace.', 'Use this puts the (edited) answer in the field');
ok(typed === 1, 'and it counts as typed, so the draft and Done see it');

// ---- Keep mine leaves it alone
$('bComment').value = 'edge modules cracked';
answer = { data: { text: 'Edge modules are cracked.' }, error: null };
d.querySelector('[data-ai="bComment"]').click(); await tick(80);
ok(sent[sent.length - 1].body.field === 'belt', 'belt comment goes as a belt comment');
$('aiKeep').click(); await tick(100);
ok(!open('aidlg') && $('bComment').value === 'edge modules cracked', 'Keep mine closes and changes nothing');

// ---- a late answer after Keep mine does nothing
hold = new Promise(r => { release = r; });
$('hComment').value = 'tracking off';
d.querySelector('[data-ai="hComment"]').click(); await tick();
$('aiKeep').click(); await tick(100);
release(); hold = null; await tick();
ok(!open('aidlg') && $('hComment').value === 'tracking off', 'an answer arriving after Keep mine is dropped');

// ---- an error says why and changes nothing
answer = fnErr('The AI key has not been added in Supabase yet.');
d.querySelector('[data-ai="hComment"]').click(); await tick(80);
ok(open('aidlg') && /not been added in Supabase/.test($('aiMsg').textContent) && /Nothing was changed/.test($('aiMsg').textContent), 'the function\'s reason is shown: ' + $('aiMsg').textContent);
ok($('aiUse').disabled && $('aiOutF').hidden, 'Use this stays off');
$('aiKeep').click(); await tick(100);
ok($('hComment').value === 'tracking off', 'field untouched after an error');

// ---- Draft it on a Write email task
await g(`(async () => {
  const list = [{a: 'Acme Pty Ltd - Smithfield', sub: 'Smithfield', z: 'Z1', foc: 'High', cad: CAD['High'], mgr: 'Ben', rep: '',
    c: [{n: 'Jo Bloggs', r: 'Engineer', t: '', p: '', pk: '', e: ['jo@acme.example']}]}];
  await accReplaceAll(list); indexAccounts(list);
})()`);
await g(`openTask(null, {acct: 'Acme Pty Ltd - Smithfield'})`); await tick();
$('tkType').querySelector('[data-v="Write email"]').click(); await tick();
$('tkTitle').value = 'Follow up spiral quote';
$('tkProject').value = 'Spiral 2';
$('tkBody').value = 'tell jo quote is coming friday need the drive specs';
answer = { data: { subject: 'Spiral quote', body: 'Hi Jo,\n\nThe quote is coming Friday.\n\nKind regards,' }, error: null };
$('tkDraft').click(); await tick(80);
const last = sent[sent.length - 1].body;
ok(last.kind === 'email' && last.points === 'tell jo quote is coming friday need the drive specs' &&
  last.details.title === 'Follow up spiral quote' && last.details.account === 'Acme Pty Ltd - Smithfield' && last.details.project === 'Spiral 2',
  'Draft it sends the points and the task details: ' + JSON.stringify(last));
ok(open('aidlg') && open('taskdlg') && !$('aiSubjF').hidden && $('aiSubj').value === 'Spiral quote', 'sheet over the task form, with a subject');
$('aiUse').click(); await tick(100);
ok(!open('aidlg') && open('taskdlg'), 'Use this closes the sheet, the task form stays');
ok($('tkSubject').value === 'Spiral quote' && /The quote is coming Friday/.test($('tkBody').value), 'subject and body filled');

// ---- empty email: nothing sent
const before = sent.length;
$('tkBody').value = ''; $('tkTitle').value = '';
$('tkDraft').click(); await tick();
ok(sent.length === before && !open('aidlg'), 'Draft it with nothing to go on sends nothing');

// ---- Help says how
ok(/Tidy/.test($('s-help').textContent) && /Draft it/.test($('s-help').textContent), 'Help covers Tidy and Draft it');

const real = errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/i.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
