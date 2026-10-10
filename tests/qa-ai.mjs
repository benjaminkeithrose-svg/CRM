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
ok(btns.slice().sort().join(' ') === 'bComment:belt:Tidy hAction:short:Tidy hComment:health:Tidy hFault:fault:Tidy nText:note:Tidy pNext:short:Tidy pNotes:project:Tidy vSummary:note:Tidy',
  'Tidy on every free-text box of a call (v99 adds fault, recommended action, next action): ' + btns.join(' '));
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

// ---- a one-line box gets one line back
$('pNext').value = 'um chase the oem about the drawings';
answer = { data: { text: '• Chase the OEM for the drawings.\n• Book a site visit.' }, error: null };
d.querySelector('[data-ai="pNext"]').click(); await tick(80);
ok(sent[sent.length - 1].body.field === 'short', 'a one-line box asks for one line');
$('aiUse').click(); await tick(100);
ok($('pNext').value === '• Chase the OEM for the drawings.; • Book a site visit.', 'line breaks are joined, never left in a one-line box: ' + $('pNext').value);
$('hFault').value = 'teeth worn';
answer = { data: { text: 'Sprocket teeth are worn.' }, error: null };
d.querySelector('[data-ai="hFault"]').click(); await tick(80);
ok(sent[sent.length - 1].body.field === 'fault', 'fault goes as a fault');
$('aiUse').click(); await tick(100);
ok($('hFault').value === 'Sprocket teeth are worn.', 'fault filled');

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

// ---- v100: the visit summary and Tidy all
$('tkOk').click(); await tick(100);
await g(`(async () => { call = {id: 'c9', customer: 'Acme Pty Ltd - Smithfield', site: 'Boning room', date: '10/10/2026', type: 'Site call', mgr: 'Ben',
  contacts: [{name: 'Jo Bloggs', role: 'Engineer', crm: true}],
  entries: [
    {type: 'note', topic: 'Production', text: 'um kill rate going up'},
    {type: 'belt', asset: 'Line 3', beltdesc: 'S800 FT', width: '606', comment: 'edge modules cracked', photos: []},
    {type: 'health', asset: 'Line 3', fault: 'teeth hooked', severity: 'Plan', action: 'replace sprockets', comment: ''},
    {type: 'project', project: 'Second line', status: 'Scoping', next: 'send drawings', notes: ''}
  ], loose: [], updated: 1}; go('dash'); })()`);
await tick(150);
ok(!$('dashSum').hidden && !$('dashSum').open && $('sumVisit').textContent === 'Not written yet', 'Summary for the report on the call, folded, not written yet');
$('dashSum').open = true;
answer = { data: { text: 'Jo Bloggs was seen.\n\nNext steps:\n• Send drawings' }, error: null };
$('vSumAi').click(); await tick(100);
const sm = sent[sent.length - 1].body;
ok(sm.kind === 'summary' && /Customer: Acme Pty Ltd - Smithfield/.test(sm.text) && /People seen: Jo Bloggs, Engineer/.test(sm.text) &&
  /Belt 1 \(Line 3\): S800 FT; 606 mm wide; comments edge modules cracked/.test(sm.text) && /Health check 1 \(Line 3\): teeth hooked; severity Plan; recommended action replace sprockets/.test(sm.text) &&
  /Project Second line: status Scoping; next action send drawings/.test(sm.text), 'Write summary sends the whole call as text: ' + sm.text.replace(/\n/g, ' | '));
ok(open('aidlg') && $('aiHead').textContent === 'Summary' && /Next steps/.test($('aiOut').value), 'the draft opens in the sheet');
$('aiUse').click(); await tick(150);
ok($('vSummary').value === 'Jo Bloggs was seen.\n\nNext steps:\n• Send drawings' && g('call.summary') === $('vSummary').value, 'Use this puts it in the summary and on the call');
ok(/Jo Bloggs was seen/.test($('sumVisit').textContent), 'the folded line shows it');
const full = await g(`buildNotesHTML('full', 'thumbonly')`);
ok(/<h2>Summary<\/h2><p>Jo Bloggs was seen\.<\/p><p>Next steps:<\/p><ul><li>Send drawings<\/li><\/ul>/.test(full) && full.indexOf('<h2>Summary') < full.indexOf('<h2>Call details'),
  'the full call notes open with the summary, bullets as a list');
const hc = await g(`buildNotesHTML('health', 'thumbonly')`), bl = await g(`buildNotesHTML('belts', 'thumbonly')`);
ok(!/<h2>Summary/.test(hc) && !/<h2>Summary/.test(bl), 'not in the health check or belt requirements documents');
// typed by hand
$('vSummary').value = 'Typed by hand.'; $('vSummary').dispatchEvent(new w.Event('input')); await tick();
ok(g('call.summary') === 'Typed by hand.', 'typing in the box keeps it');

// Tidy all
const tidyOf = { 'um kill rate going up': 'Kill rate is going up.', 'edge modules cracked': 'Edge modules are cracked.',
  'teeth hooked': 'Sprocket teeth are hooked.', 'replace sprockets': 'Replace the sprockets.', 'send drawings': 'Send the drawings.' };
let failOne = 'replace sprockets';
w.__invoke = async (name, opts) => {
  sent.push({ name, body: opts.body });
  await new Promise(r => setTimeout(r, 5));
  if (opts.body.text === failOne) return fnErr('That is 200 for today.');
  return { data: { text: tidyOf[opts.body.text] || opts.body.text }, error: null };
};
const n0 = sent.length;
$('vTidyAll').click(); await tick(300);
const fields = sent.slice(n0).map(x => x.body.field).sort().join(',');
ok(fields === 'belt,fault,note,short,short', 'every box with text is sent, each as its kind: ' + fields);
ok(open('tidydlg') && $('taList').querySelectorAll('.taitem').length === 5, 'Tidy all lists five boxes');
ok(/4 tidied, 1 not/.test($('taMsg').textContent) && !$('taUse').disabled, 'and says how many: ' + $('taMsg').textContent);
const boxes = [...$('taList').querySelectorAll('.taitem')];
const failed = boxes.find(b => /recommended action/.test(b.textContent));
ok(failed && /200 for today/.test(failed.textContent) && failed.querySelector('input').disabled, 'one that failed says why and cannot be ticked');
// untick the note, edit the belt comment
const noteBox = boxes.find(b => /^Note/.test(b.querySelector('.tah').textContent));
noteBox.querySelector('input').checked = false; noteBox.querySelector('input').dispatchEvent(new w.Event('change'));
const beltBox = boxes.find(b => /Belt 1/.test(b.textContent));
beltBox.querySelector('textarea').value = 'Edge modules are cracked on the drive side.'; beltBox.querySelector('textarea').dispatchEvent(new w.Event('input'));
$('taUse').click(); await tick(150);
ok(!open('tidydlg'), 'Use ticked closes it');
const E = g('call.entries');
ok(E[0].text === 'um kill rate going up', 'an unticked box is left as it was');
ok(E[1].comment === 'Edge modules are cracked on the drive side.', 'an edited answer is used as edited');
ok(E[2].fault === 'Sprocket teeth are hooked.' && E[2].action === 'replace sprockets', 'ticked used, failed left alone');
ok(E[3].next === 'Send the drawings.', 'project next action tidied');
// Keep all mine changes nothing
failOne = null;
$('vTidyAll').click(); await tick(300);
$('taKeep').click(); await tick(100);
ok(!open('tidydlg') && g('call.entries[0].text') === 'um kill rate going up', 'Keep all mine changes nothing');
// a quote request has no summary section
await g(`(async () => { call = {id: 'q9', rectype: 'quote', customer: 'Acme', date: '10/10/2026', contacts: [], entries: [], loose: [], updated: 1}; go('dash'); })()`);
await tick(100);
ok($('dashSum').hidden, 'no summary section on a quote request');
ok(g('DIALOGS').includes('tidydlg'), 'the Tidy all sheet is registered in DIALOGS');

// ---- Help says how
ok(/Tidy/.test($('s-help').textContent) && /Draft it/.test($('s-help').textContent) && /Write summary/.test($('s-help').textContent) && /Tidy all notes/.test($('s-help').textContent), 'Help covers Tidy, Draft it, the summary and Tidy all');

const real = errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/i.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
