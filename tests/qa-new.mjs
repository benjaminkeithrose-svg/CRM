// The New screen (v77): "What would you like to do?" first, then the next step
// on the same screen; date and account manager on one line; phone and Teams
// calls go on the calendar as phone calls.
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
const shown = el => { for (let e = el; e && e !== d.body; e = e.parentElement) { if (e.hidden) return false; if (w.getComputedStyle(e).display === 'none') return false; } return true; };

await g(`(async () => {
  const list = [{a: 'Acme Pty Ltd - Smithfield', sub: 'Smithfield', z: 'Z1', foc: 'High', cad: CAD['High'], mgr: 'Ben', rep: '',
    c: [{n: 'Jo Bloggs', r: 'Engineer', t: '', p: '0400 111 222', pk: 'ok', e: ['jo@acme.example']}]}];
  await accReplaceAll(list); indexAccounts(list);
  const meta = {imported: Date.now(), source: 'x', rows: 1, counts: {accounts: 1, contacts: 1}, managers: ['Ben'], reps: []};
  await kvSet('meta', meta); META = meta; fillManagers();
})()`);

// ---- New: only the question at first
d.querySelector('[data-go="newcall"]').click(); await tick();
ok(g('screen') === 'account', 'New opens the New screen');
ok(shown($('newChoose')) && /What would you like to do/.test($('newChoose').textContent), 'asks what you would like to do');
const picks = [...$('newPick').querySelectorAll('button')].map(b => b.textContent);
ok(JSON.stringify(picks) === JSON.stringify(['Site call', 'Phone call', 'Teams call', 'Quote request', 'Task', 'Book a visit']), 'six touch buttons: ' + picks.join(', '));
ok(!shown($('accQ')) && !shown($('cDate')) && !shown($('cMgr')), 'nothing else until a choice is made');
ok(!d.querySelector('#s-account select:not([hidden])') || !shown($('cType')), 'no call-type dropdown');

// ---- Site call: the account search appears; date and manager on one line
d.querySelector('#newPick [data-new="site"]').click(); await tick();
ok(shown($('accQ')) && $('cType').value === 'Site call', 'Site call: account search appears');
ok(d.querySelector('#newPick [data-new="site"]').classList.contains('on'), 'Site call stays highlighted');
ok(/Today/.test($('cSummary').textContent) && /Ben/.test($('cSummary').textContent), 'date and manager on one line: ' + $('cSummary').textContent);
ok(!shown($('cDate')), 'date field tucked away');
$('cChange').click(); await tick();
ok(shown($('cDate')) && shown($('cMgrChips')), 'Change shows the date and manager');
$('cDate').value = '2026-10-07'; $('cDate').dispatchEvent(new w.Event('change'));
ok(/07\/10\/2026/.test($('cSummary').textContent), 'summary follows a changed date: ' + $('cSummary').textContent);
$('cChange').click(); await tick();
ok(!shown($('cDate')), 'and Hide tucks it away again');

// ---- Phone, Teams, Quote
d.querySelector('#newPick [data-new="phone"]').click(); await tick();
ok($('cType').value === 'Phone' && !g('quoteMode'), 'Phone call');
d.querySelector('#newPick [data-new="teams"]').click(); await tick();
ok($('cType').value === 'Teams', 'Teams call');
d.querySelector('#newPick [data-new="quote"]').click(); await tick();
ok($('cType').value === 'Quote request' && g('quoteMode') && shown($('cReqBy')), 'Quote request shows required-by');

// ---- Task and Book a visit
d.querySelector('[data-go="newcall"]').click(); await tick();
d.querySelector('#newPick [data-new="task"]').click(); await tick();
ok($('taskdlg').hasAttribute('open') && g('screen') === 'home', 'Task opens the task form (over Home)');
$('tkOk').click(); await tick(100);
d.querySelector('[data-go="newcall"]').click(); await tick();
d.querySelector('#newPick [data-new="book"]').click(); await tick();
ok(g('bookingMode') === true && shown($('accQ')) && /book/i.test($('accHint').textContent), 'Book a visit: pick the account to book');
ok(d.querySelector('#newPick [data-new="book"]').classList.contains('on'), 'Book a visit highlighted');

// ---- phone and Teams calls go on the calendar as phone calls
for (const [type, want] of [['Phone', 'Planned phone call'], ['Teams', 'Planned phone call'], ['Site call', 'Intralox site visit']]) {
  const got = await g(`(async () => { call = {id: 'c-${type.replace(' ', '')}', customer: 'Acme Pty Ltd - Smithfield', date: '09/10/2026', type: '${type}',
    contacts: [], entries: [], loose: [], updated: Date.now()}; const ap = await bookUnplanned(call, ACC_BY_NAME.get('Acme Pty Ltd - Smithfield')); return ap && ap.type; })()`);
  ok(got === want, type + ' books as ' + want + ': ' + got);
}

const real = errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/i.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
