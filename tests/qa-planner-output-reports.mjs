import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';

const dom = new JSDOM(readFileSync('index.html','utf8'), {
  runScripts: 'dangerously', url: 'https://example.org/', pretendToBeVisual: true
});
const w = dom.window, d = w.document;
w.indexedDB = indexedDB; w.IDBKeyRange = IDBKeyRange;
const $ = id => d.getElementById(id);
const g = expr => w.eval('(' + expr + ')');

for(const f of ['zones.js','manuals.js','healthlib.js','app.js']){
  const s = d.createElement('script');
  s.textContent = readFileSync(f,'utf8');
  d.body.appendChild(s);
}
await new Promise(r => setTimeout(r, 400));

let pass = 0; const fails = [];
const t = (name, ok) => ok ? pass++ : fails.push(name);

// ---------- 1. the phone planner ----------
t('week is the default view', g('todayView') === 'week');
t('the week button is the one marked on',
  $('tvView').querySelector('[data-v="week"]').classList.contains('on'));
t('view labels are Day, Week and Month',
  $('tvView').querySelector('[data-v="today"]').textContent === 'Day' &&
  $('tvView').querySelector('[data-v="week"]').textContent === 'Week' &&
  $('tvView').querySelector('[data-v="month"]').textContent === 'Month');

t('the header carries all six controls',
  ['tvPrev','tvNow','tvNext','tvUnplanned','tvBook'].every(id => !!$(id)));
t('the action buttons are icons, not words',
  $('tvUnplanned').querySelector('svg') && $('tvBook').querySelector('svg'));
t('the icon buttons carry an accessible name',
  $('tvUnplanned').getAttribute('aria-label') && $('tvBook').getAttribute('aria-label'));
t('the header sits above the list',
  d.querySelector('.tvbar').compareDocumentPosition($('tvBody')) & 4);
t('the header sits above the view toggle',
  d.querySelector('.tvbar').compareDocumentPosition($('tvView')) & 4);

// the old text buttons are gone from the foot of the screen
t('no scrolling text buttons left at the foot',
  !Array.from($('s-today').querySelectorAll('button.ghost'))
    .some(b => /unplanned|book a visit/i.test(b.textContent)));

// date navigation
const today = g('todayISOdate()');
t('the cursor starts unset, meaning today', g('tvCursor') === null);
t('tvDate falls back to today', g('tvDate()') === today);

w.eval('todayView = "today"; tvCursor = null; renderToday()');
t('day view titles as Today when on today', $('title').textContent === 'Today');
w.eval('tvShift(1)');
t('paging a day moves one day', g('tvDate()') !== today);
t('the title names the day once you leave today', $('title').textContent !== 'Today');
w.eval('tvShift(-1)');
t('paging back lands on today again', g('tvDate()') === today);

w.eval('todayView = "week"; tvCursor = null; renderToday()');
// at the weekend the week list opens on the coming week (weekViewStart)
const wkend = [0, 6].includes(new Date().getDay()), wkTitle = wkend ? 'Next week' : 'This week';
t('week view titles as ' + wkTitle, $('title').textContent === wkTitle, $('title').textContent);
const wkStart = g('iso(tvWeekStart())');
w.eval('tvStep(1)');
t('paging a week moves seven days', g('iso(tvWeekStart())') !== wkStart);
t('the title names the week once you leave this one',
  /^(Next week|Week of)/.test($('title').textContent), $('title').textContent);
w.eval('tvStep(-1)');
t('and the back arrow returns to it', g('iso(tvWeekStart())') === wkStart);
w.eval('tvCursor = null; renderToday()');
t('Today resets the cursor', g('tvCursor') === null && $('title').textContent === wkTitle);

// the day list wording follows the cursor
w.eval('todayView = "today"; tvCursor = null; renderToday()');
t('today reads as today', /today/.test($('tvHint').textContent));
w.eval('tvShift(3)');
t('another day does not claim to be today', !/ today/.test($('tvHint').textContent));
w.eval('tvCursor = null; todayView = "week"; renderToday()');

// ---------- 2. the output sheet ----------
t('the output sheet exists', !!$('outdlg') && $('outdlg').tagName === 'DIALOG');
t('the sheet is registered so back closes it', g('DIALOGS').includes('outdlg'));
t('the pickers live in the sheet',
  ['outScope','outImg','outDest','outGo','compStat','detachWrap']
    .every(id => $(id).closest('dialog') && $(id).closest('dialog').id === 'outdlg'));
// v82: Create and share is in the call toolbar at the top, above every screen
t('the button is in the call toolbar and its hint on the dashboard',
  $('doOutput').closest('#bar') && $('outHint').closest('section').id === 's-dash');
t('the toolbar sits above Add to call',
  $('bar').compareDocumentPosition($('dashAddHead')) & 4);
t('the toolbar sits above the call log',
  $('bar').compareDocumentPosition($('logList')) & 4);
t('the sheet has its own cancel', !!$('outCancel'));

// the dashboard summary line reports state, not picker settings
const mkCall = id => ({
  id, rectype:'call', customer:'Acme', date:'18-09-2026', type:'Site call',
  contacts:[], entries:[{type:'belt', asset:'CV-1', photos:[]}], loose:[], status:'in progress'
});
w.eval('call = ' + JSON.stringify(mkCall('c1')));
w.renderOutSummary();
t('an unissued call says so', /Not issued yet/.test($('outHint').textContent));
w.eval('call.shared = Date.now()');
w.renderOutSummary();
t('an issued call reports when', /^Issued /.test($('outHint').textContent));
w.eval('call.shared = 0; call.entries = []');
w.renderOutSummary();
t('an empty call says nothing is logged', /Nothing logged yet/.test($('outHint').textContent));

// the sheet opens and closes
w.eval('call = ' + JSON.stringify(mkCall('c2')));
w.openOutDlg();
t('opening the sheet marks it open', $('outdlg').hasAttribute('open'));
t('opening the sheet names the call', /Acme/.test($('outSub').textContent));
t('opening the sheet fills the destinations', $('outDest').options.length > 0);
w.closeOutDlg();
t('closing the sheet closes it', !$('outdlg').hasAttribute('open'));

// ---------- 3. reports ----------
t('reports offers four tabs', $('rpView').querySelectorAll('button').length === 4);
t('compiled and done are separate tabs',
  !!$('rpView').querySelector('[data-v="compiled"]') &&
  !!$('rpView').querySelector('[data-v="done"]'));
t('nothing is still labelled Finished',
  !/Finished/.test($('rpView').textContent));

t('marking done is a shared function', typeof w.eval('markCallDone') === 'function');
t('deleting is a shared function', typeof w.eval('deleteCallRecord') === 'function');
t('the old dashboard close button is gone', !$('closeCall'));

// the row renders with both actions
const rows = async (view) => {
  await w.eval('callsPut(' + JSON.stringify({
    id:'r1', rectype:'call', customer:'Hazeldenes', date:'10-09-2026', type:'Site call',
    contacts:[], entries:[{type:'belt', asset:'CV-9', photos:[]}], loose:[], status:'in progress'
  }) + ')');
  await w.eval('callsPut(' + JSON.stringify({
    id:'r2', rectype:'call', customer:'Baiada', date:'11-09-2026', type:'Site call',
    contacts:[], entries:[], loose:[], closed:true, status:'done'
  }) + ')');
  w.eval('rpView = "' + view + '"');
  await w.renderReports();
};

await rows('all');
t('a report row renders as a wrapper, not a bare button',
  $('rpRes').querySelectorAll('.rprow').length === 2);
// v83: tick and bin moved behind a ⋯ on each row
t('every row has a ⋯ and no tick or bin on the row',
  $('rpRes').querySelectorAll('[data-rpmenu]').length === 2 && !$('rpRes').querySelector('.rpi'));
const menuOf = id => { $('rpRes').querySelector('[data-rpmenu="' + id + '"]').click();
  return [...$('vmBody').querySelectorAll('button')].map(b => b.textContent.trim()); };
t('an open row offers Mark done, then Delete', menuOf('r1').join() === 'Mark done,Delete', menuOf('r1').join());
w.closeVisitMenu();
t('a done row offers only Delete', menuOf('r2').join() === 'Delete', menuOf('r2').join());
t('Delete is set apart in the warning colour', $('vmBody').querySelector('button.danger').textContent.trim() === 'Delete');
w.closeVisitMenu();
t('the reading area is still its own button',
  $('rpRes').querySelectorAll('button.rpt').length === 2);
t('no button is nested inside another button',
  !$('rpRes').querySelector('button button'));

await rows('open');
t('the open tab shows only the open call',
  $('rpRes').querySelectorAll('.rprow').length === 1 &&
  !!$('rpRes').querySelector('[data-rpt="r1"]'));
await rows('done');
t('the done tab shows only the closed call',
  $('rpRes').querySelectorAll('.rprow').length === 1 &&
  !!$('rpRes').querySelector('[data-rpt="r2"]'));

// ---- v84: no permanent search box; an icon opens a full-screen search ----
t('Reports has no search box on the screen', !$('s-reports').querySelector('input'));
t('a search icon with a name instead', $('rpSearch').querySelector('svg') && $('rpSearch').getAttribute('aria-label') === 'Search calls');
t('the search sheet is registered so back closes it', g('DIALOGS').includes('srchdlg'));
$('rpSearch').click(); await new Promise(r => setTimeout(r, 50));
t('the icon opens the full-screen search', $('srchdlg').hasAttribute('open') && $('fsQ').value === '');
t('nothing listed before you type', $('fsRes').children.length === 0 && $('fsHint').textContent === '');
$('fsQ').value = 'hazel'; $('fsQ').dispatchEvent(new w.Event('input')); await new Promise(r => setTimeout(r, 80));
t('typing finds the call', !!$('fsRes').querySelector('[data-rpt="r1"]') && !$('fsRes').querySelector('[data-rpt="r2"]'), $('fsHint').textContent);
t('and says how many', /^1 of \d+ calls$/.test($('fsHint').textContent), $('fsHint').textContent);
$('fsQ').value = 'zzzz'; $('fsQ').dispatchEvent(new w.Event('input')); await new Promise(r => setTimeout(r, 80));
t('no match says so', $('fsHint').textContent === 'Nothing matches that.' && $('fsRes').children.length === 0);
$('fsQ').value = 'cv-9'; $('fsQ').dispatchEvent(new w.Event('input')); await new Promise(r => setTimeout(r, 80));
t('it searches what was logged, not just the name', !!$('fsRes').querySelector('[data-rpt="r1"]'));
$('fsRes').querySelector('[data-rpt="r1"]').click(); await new Promise(r => setTimeout(r, 80));
t('tapping a result closes the search and opens the call',
  !$('srchdlg').hasAttribute('open') && w.eval('screen') === 'dash' && w.eval('call.id') === 'r1');
w.eval('call = null'); w.showScreen('home');

// compiled is its own bucket
await w.eval('callsPut(' + JSON.stringify({
  id:'r3', rectype:'call', customer:'Woodward', date:'12-09-2026', type:'Site call',
  contacts:[], entries:[], loose:[], status:'compiled', shared:1
}) + ')');
w.eval('rpView = "compiled"');
await w.renderReports();
t('the compiled tab holds the compiled call',
  $('rpRes').querySelectorAll('.rprow').length === 1 &&
  !!$('rpRes').querySelector('[data-rpt="r3"]'));
w.eval('rpView = "open"');
await w.renderReports();
t('a compiled call is not also counted as open',
  !$('rpRes').querySelector('[data-rpt="r3"]'));

// the tick actually closes the record out
w.confirm = () => true;
const r1 = (await w.callsAll()).find(c => c.id === 'r1');
await w.markCallDone(r1);
const after = (await w.callsAll()).find(c => c.id === 'r1');
t('marking done sets closed', after.closed === true);
t('marking done sets the status', after.status === 'done');

// delete removes it, and cancelling does not
w.confirm = () => false;
const r2 = (await w.callsAll()).find(c => c.id === 'r2');
await w.deleteCallRecord(r2);
t('cancelling the confirm keeps the call',
  !!(await w.callsAll()).find(c => c.id === 'r2'));
w.confirm = () => true;
await w.deleteCallRecord(r2);
t('confirming the delete removes the call',
  !(await w.callsAll()).find(c => c.id === 'r2'));

const errs = [];
w.addEventListener('error', e => errs.push(e.message));
t('no errors raised during the run', errs.length === 0);

console.log('\nPASS ' + pass);
if(fails.length){ console.log('\nFAIL ' + fails.length); fails.forEach(f => console.log('  x ' + f)); }
process.exit(fails.length ? 1 : 0);
