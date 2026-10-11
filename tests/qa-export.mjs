// v114: Export for Claude. A year of calls packed as text files for a Claude
// Project: grouped by account, the period and accounts chosen, test calls and
// photos never in it, contact names swapped for roles on request, the
// per-contact document tick respected, Mine or the whole team, condensed,
// split into parts when large. The share sheet is stubbed.
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
w.indexedDB = indexedDB; w.IDBKeyRange = IDBKeyRange; w.Blob = Blob;
w.scrollTo = () => {}; w.alert = () => {}; w.confirm = () => true;
w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
w.navigator.storage = { persist: async () => true, persisted: async () => true };
w.URL.createObjectURL = () => 'blob:stub'; w.URL.revokeObjectURL = () => {};
if (!w.HTMLDialogElement.prototype.showModal) w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
w.HTMLCanvasElement.prototype.getContext = () => null;
w.console.error = (...a) => errs.push(a.join(' ')); w.console.warn = () => {};
// the share sheet: keeps what it was handed
let shared = null;
w.navigator.canShare = () => true;
w.navigator.share = async x => { shared = await Promise.all(x.files.map(async f => ({ name: f.name, type: f.type, text: await f.text() }))); };
for (const f of ['zones.js', 'manuals.js', 'healthlib.js', 'app.js']) {
  const el = d.createElement('script'); el.textContent = fs.readFileSync(f, 'utf8'); d.body.appendChild(el);
}
d.dispatchEvent(new w.Event('DOMContentLoaded'));
await tick(500);
const $ = id => d.getElementById(id);
const g = e => w.eval('(' + e + ')');

// days ago, as the app stores a call's date
const ago = n => { const t = Date.now() - n * 864e5, x = new Date(t); return { when: t, date: String(x.getDate()).padStart(2, '0') + '/' + String(x.getMonth() + 1).padStart(2, '0') + '/' + x.getFullYear() }; };
const A = 'Example Meats - Dandenong', B = 'Sample Bakery - Ringwood', C = 'Quiet Dairy - Shepparton';
await g(`(async () => {
  const list = [
    {a: '${A}', sub: 'Dandenong', z: 'Z1', foc: 'High', cad: CAD['High'], tier: 'A', mgr: 'Ben', rep: '', seg: 'Meat',
      c: [{n: 'Sam Lee', r: 'Maintenance Manager', t: '', p: '', pk: '', e: []}]},
    {a: '${B}', sub: 'Ringwood', z: 'Z2', foc: 'Medium', cad: CAD['Medium'], mgr: 'Jo', rep: '', c: []},
    {a: '${C}', sub: 'Shepparton', z: 'Z3', foc: 'High', cad: CAD['High'], mgr: 'Ben', rep: '', c: []}];
  await accReplaceAll(list); indexAccounts(list);
  localStorage.setItem(LS('mgr'), 'Ben');
})()`);
const put = c => g(`callsPut(${JSON.stringify(Object.assign({ contacts: [], loose: [], entries: [], closed: true, status: 'done', updated: Date.now() }, c))})`);
await put(Object.assign({ id: 'c1', customer: A, type: 'Site call', summary: 'Line 2 belt stretched; quote promised.',
  contacts: [{ name: 'Sam Lee', role: 'Maintenance Manager' }, { name: 'Hidden Person', role: 'Cleaner', doc: false }],
  entries: [{ type: 'belt', asset: '61-201', series: 'S800', style: 'Flat Top', beltmat: 'Acetal', width: '600', comment: 'Worn hinge rods' },
    { type: 'health', asset: '61-202', fault: 'Sprocket wear', severity: 'High', action: 'Replace sprockets' },
    { type: 'project', project: 'Line 3 upgrade', status: 'Quoting', next: 'Send layout', owner: 'Tom Ward' },
    { type: 'note', text: 'Sam wants a cost per year comparison.' }],
  coaching: { text: 'What went well\n• Good questions.\n\nNext steps\n• Send Tom the cost per year.', at: 1 } }, ago(30)));
await put(Object.assign({ id: 'c2', customer: A, type: 'Phone call', summary: '', entries: [{ type: 'note', text: 'Followed up the quote by phone. ' + 'x'.repeat(400) }] }, ago(5)));
await put(Object.assign({ id: 'c3', customer: B, type: 'Site call', summary: 'Bakery visit, oven belt fine.', noReport: false }, ago(120)));
await put(Object.assign({ id: 'cOld', customer: B, type: 'Site call', summary: 'An old visit from long ago.' }, ago(500)));
await put(Object.assign({ id: 'cTest', customer: A, type: 'Site call', summary: 'TEST CALL NOT FOR EXPORT', test: true }, ago(2)));
await put(Object.assign({ id: 'q1', rectype: 'quote', customer: A, entries: [{ type: 'belt', beltdesc: 'S800 Flat Top', qty: '12' }] }, ago(20)));
await g(`(async () => {
  await apptsPut({id: 'ap1', acct: '${A}', date: iso(addDays(new Date(), -30)), start: '09:00', dur: 60, type: 'Site call', status: 'done', touchedAt: 1});
  await apptsPut({id: 'ap2', acct: '${A}', date: iso(addDays(new Date(), -10)), start: '09:00', dur: 60, type: 'Site call', status: 'missed', touchedAt: 1});
  await apptsPut({id: 'ap3', acct: '${A}', date: iso(addDays(new Date(), 7)), start: '09:00', dur: 60, type: 'Site call', touchedAt: 1});
  await plansPut({id: 'pl1', acct: '${A}', goal: 'Win Line 3', people: [{n: 'Tom Ward', role: 'economic', mode: 'growth', note: 'signs orders'}], flags: 'Purchasing not met', strengths: '', updated: 1});
  await productsPut({id: 'pr1', acct: '${A}', name: 'Sprocket kit', status: 'Quoted', stocked: false});
  await loadAccounts();
})()`);

const run = async (opts) => g(`buildClaudeExport(Object.assign({months: 12, who: 'mine', narrow: '', detail: 'full', hide: false}, ${JSON.stringify(opts || {})}))`);

// ---- the default: last 12 months, full
let r = await run();
const all = () => r.files.map(f => f.text).join('\n');
ok(r.files.length === 2 && /read me first\.txt$/.test(r.files[0].name) && /part 1 of 1\.txt$/.test(r.files[1].name), 'a read-me and one data file: ' + r.files.map(f => f.name).join(', '));
ok(r.calls === 3 && r.quotes === 1 && r.accounts === 2, 'three calls and a quote request, from two accounts: ' + [r.calls, r.quotes, r.accounts]);
const data = r.files[1].text, cover = r.files[0].text;
ok(!/TEST CALL/.test(all()), 'a test call is never in it');
ok(!/old visit from long ago/.test(all()), 'a call before the period is left out');
ok(data.indexOf('## ' + A) >= 0 && data.indexOf('## ' + A) < data.indexOf('## ' + B), 'grouped by account, by zone');
const aSec = data.slice(data.indexOf('## ' + A), data.indexOf('## ' + B));
ok(aSec.indexOf('Site call') < aSec.indexOf('Phone call'), 'each account\'s calls oldest first');
ok(/Focus High \(.+\) · Tier A · Manager Ben · Zone Z1/.test(aSec), 'the account\'s CRM details head it');
ok(/visits 1 done, 1 missed; next visit booked/.test(aSec), 'with its visit record: ' + (aSec.match(/In this period: .*/) || [''])[0]);
ok(/Account plan: goal: Win Line 3 \| person: Tom Ward \(economic, sees it as growth, signs orders\) \| red flags: Purchasing not met/.test(aSec), 'its account plan');
ok(/Products not yet stocked: Sprocket kit - Quoted/.test(aSec) && /Quote requests: .* 1 belt · done · S800 Flat Top qty 12/.test(aSec), 'its products and quote requests');
ok(/Summary: Line 2 belt stretched/.test(aSec) && /Belt 1 \(61-201\): .*S800 Flat Top.*Worn hinge rods/.test(aSec) && /Health check 1 \(61-202\): Sprocket wear; severity High/.test(aSec), 'every entry, as the coach reads them');
ok(/Project Line 3 upgrade: status Quoting; next action Send layout; owner Tom Ward/.test(aSec) && /Coaching after the call: .*Send Tom the cost per year/.test(aSec), 'projects and the coaching after the call');
ok(/People seen: Sam Lee, Maintenance Manager/.test(aSec) && !/Hidden Person|Cleaner/.test(all()), 'someone ticked out of documents is not in it');
ok(!/blob:|data:image|photo/i.test(data), 'no photos');
ok(/## Accounts with no call in this period\n- Quiet Dairy - Shepparton · Focus High · Ben/.test(data), 'a quiet account of the manager\'s is listed at the end');
ok(/read this first/.test(cover) && /Covers the last 12 months/.test(cover) && /one engineer's own calls/.test(cover) && /2 accounts with activity, 3 calls, 1 quote request;/.test(cover), 'the read-me says what it covers');
ok(/Good places to start/.test(cover) && /key account actions/.test(cover) && /Health check: a fault/.test(cover), 'and explains the data and where to start');

// ---- hide contact names
r = await run({ hide: true });
ok(!/Sam Lee|Tom Ward/.test(r.files[1].text.replace(/Send Tom the cost|Sam wants/g, '')) && /People seen: Maintenance Manager/.test(r.files[1].text) && /person: economic, sees it as growth/.test(r.files[1].text), 'names give way to roles, in calls and the plan');
ok(/Contact names have been replaced/.test(r.files[0].text) && /Free-text notes may still mention/.test(r.files[0].text), 'and the read-me says so, and what it cannot catch');

// ---- condensed, narrowed, period
r = await run({ detail: 'condensed' });
const cd = r.files[1].text;
ok(/Summary: Line 2 belt stretched/.test(cd) && !/Belt 1 \(61-201\)/.test(cd) && /Health check 1/.test(cd) && !/Coaching after/.test(cd), 'condensed: the summary and key lines, no belt specs or coaching');
ok(/Note: Followed up the quote by phone\. x+…/.test(cd) && cd.length < (await run()).files[1].text.length, 'a call with no summary is shortened');
r = await run({ narrow: 'f:Medium' });
ok(r.accounts === 1 && /## Sample Bakery/.test(r.files[1].text) && !/## Example Meats/.test(r.files[1].text), 'narrowed to Focus Medium');
r = await run({ narrow: 'm:Ben' });
ok(r.accounts === 1 && /## Example Meats/.test(r.files[1].text) && /Quiet Dairy/.test(r.files[1].text), 'narrowed to one manager');
r = await run({ months: 3 });
ok(r.calls === 2 && !/Sample Bakery/.test(r.files[1].text.split('## Accounts with no call')[0]), 'three months leaves out the bakery visit');
r = await run({ months: 0 });
ok(r.calls === 4 && /An old visit/.test(r.files[1].text) && /everything on record/.test(r.files[0].text), 'Everything includes the old one');

// ---- a team: Mine and Whole team, with names
await g(`(async () => {
  await ownersLoad();
  TEAM = {uid: 'me', id: 't', name: 'ANZ field sales', admin: 'me', members: [{user_id: 'me', name: 'Ben', role: 'admin'}, {user_id: 'jo', name: 'Jo', role: 'member'}]};
  sbUser = {id: 'me'};
  OWNERS['calls/c3'] = 'jo';
})()`);
r = await run({ who: 'team' });
ok(r.calls === 3 && /### .* · Site call · Jo · done/.test(r.files[1].text) && /### .* · Site call · Ben · done/.test(r.files[1].text), 'whole team: every call, each with who wrote it');
ok(/the whole team \(ANZ field sales\)/.test(r.files[0].text) && /who wrote it/.test(r.files[0].text), 'and the read-me says so');
r = await run({ who: 'mine' });
ok(r.calls === 2 && !/Bakery visit/.test(r.files[1].text), 'Mine leaves out Jo\'s call');

// ---- large: split into parts, never through an account
const many = [];
for (let i = 0; i < 260; i++) many.push({ id: 'big' + i, customer: i % 2 ? A : B, type: 'Site call', summary: 'Visit ' + i + ' ' + 'y'.repeat(1700), ...ago(1 + (i % 300)) });
await g(`Promise.all(${JSON.stringify(many)}.map(c => callsPut(Object.assign({contacts: [], loose: [], entries: [], closed: true, status: 'done', updated: Date.now()}, c))))`);
await g(`(async () => { indexCalls(await callsAll()); })()`);
r = await run({ who: 'team' });
ok(r.files.length === 3 && /part 1 of 2/.test(r.files[1].name) && /part 2 of 2/.test(r.files[2].name), 'a large export splits into parts: ' + r.files.map(f => f.name).join(', '));
ok(r.files.slice(1).every(f => f.text.length < 420000), 'each part about 100,000 tokens at most');
ok(r.files.slice(1).filter(f => f.text.includes('## ' + A + '\n')).length === 1 && r.files.slice(1).filter(f => f.text.includes('## ' + B + '\n')).length === 1, 'and an account is never split across two');
ok(/read them all/.test(r.files[0].text), 'the read-me says to read every part');

// ---- the screen
await g(`go('settings')`); await tick(100);
$('sxClaude').open = true; $('sxClaude').dispatchEvent(new w.Event('toggle')); await tick(50);
ok(!$('cxWhoWrap').hidden && [...$('cxNarrow').options].some(o => o.value === 'm:Jo') && [...$('cxNarrow').options].some(o => o.value === 'z:Z2'), 'Settings offers whose calls, and managers, focus and zones');
ok($('cxGo').compareDocumentPosition($('cxPeriod')) & w.Node.DOCUMENT_POSITION_FOLLOWING, 'the main button sits above the choices');
$('cxPeriod').value = '3';
$('cxDetail').querySelector('[data-v="condensed"]').click();
$('cxHide').checked = true;
$('cxGo').click(); await tick(600);
ok(shared && shared.length >= 2 && shared.every(f => f.type === 'text/plain' && /\.txt$/.test(f.name)), 'the files go to the share sheet as text: ' + (shared || []).map(f => f.name).join(', '));
ok(shared && /condensed export/.test(shared[0].text) && /Contact names have been replaced/.test(shared[0].text) && /last 3 months/.test(shared[0].text), 'built from the choices on screen');
ok(/calls from .* accounts, about .* words, in \d+ files\. Add them all to a Claude Project/.test($('cxMsg').textContent), 'and it says what it made: ' + $('cxMsg').textContent);
$('cxNarrow').value = 'f:Low'; $('cxGo').click(); await tick(300);
ok(/No calls in that period/.test($('cxMsg').textContent), 'nothing to export is said plainly');

const real = errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/.test(e));
ok(!real.length, 'no console errors: ' + real.slice(0, 3).join(' | '));
console.log(`PASS ${pass}`); if (fail) console.log(`FAIL ${fail}`);
process.exit(fail ? 1 : 0);
