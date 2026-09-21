import { JSDOM } from 'jsdom';
import fs from 'fs';
import 'fake-indexeddb/auto';

const errs = [], warns = [];
const html = fs.readFileSync('index.html', 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://example.org/' });
const w = dom.window, d = w.document;

// --- shims the app expects from a browser but jsdom does not provide ---
w.indexedDB = indexedDB; w.IDBKeyRange = IDBKeyRange;
w.scrollTo = () => {};
w.matchMedia = () => ({ matches: false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
w.navigator.storage = { persist: async () => true, persisted: async () => true };
w.URL.createObjectURL = () => 'blob:stub';
w.URL.revokeObjectURL = () => {};
w.alert = () => {}; w.confirm = () => true; w.prompt = () => '';
w.HTMLDialogElement = w.HTMLDialogElement || function(){};
if (!w.HTMLElement.prototype.showModal) w.HTMLElement.prototype.showModal = function(){ this.setAttribute('open',''); };
if (!w.HTMLElement.prototype.close) w.HTMLElement.prototype.close = function(){ this.removeAttribute('open'); };
w.console.error = (...a) => errs.push(a.join(' '));
w.console.warn  = (...a) => warns.push(a.join(' '));
// canvas is unavailable, so shrink() must never be needed by the paths under test
w.HTMLCanvasElement.prototype.getContext = () => null;

/* Injected as real <script> elements rather than eval'd. Top-level let/const in
   an indirect eval never reach the global lexical environment, so IMG_MODES,
   CALL_SCREENS and `call` itself would all be invisible to the tests. */
const load = f => {
  try {
    const el = d.createElement('script');
    el.textContent = fs.readFileSync(f, 'utf8');
    d.body.appendChild(el);
  } catch(e){ errs.push(f + ': ' + e.message); }
};
load('zones.js'); load('manuals.js'); load('healthlib.js'); load('app.js');

d.dispatchEvent(new w.Event('DOMContentLoaded'));
await new Promise(r => setTimeout(r, 400));

// top-level `let`/`const` in a classic script are lexical bindings, not window
// properties, so they are reached through eval rather than off `w`.
const g  = expr => w.eval('(' + expr + ')');
const setCall = o => { w.__t = o; w.eval('call = window.__t'); };
const setQuoteMode = v => { w.__t = v; w.eval('quoteMode = window.__t'); };

const ok = [], bad = [];
const t = (name, cond, extra) => (cond ? ok : bad).push(name + (extra ? ' -> ' + extra : ''));
const $ = id => d.getElementById(id);

// ---------- 1. storage split ----------
t('recordsAll/callsAll/quotesAll exist',
  [w.recordsAll, w.callsAll, w.quotesAll].every(f => typeof f === 'function'));
t('isQuote reads rectype, not kind',
  g("isQuote({rectype:'quote'})") === true && g("isQuote({kind:'quote'})") === false && g('isQuote(null)') === false);

// ---------- 2. a quote request never leaks into call-facing reads ----------
const mkCall  = (id) => ({id, rectype:undefined, customer:'Acme', date:'01/09/2026', type:'Site call',
  mgr:'B', site:'', contacts:[{name:'X',crm:true}], entries:[], loose:[], closed:false, updated:Date.now(), status:'in progress'});
const mkQuote = (id) => Object.assign(mkCall(id), {rectype:'quote', reqby:'next week', ref:'PO123'});
await w.callsPut(mkCall('c1'));
await w.callsPut(mkQuote('q1'));
const everyRec = await w.recordsAll(), onlyCalls = await w.callsAll(), onlyQuotes = await w.quotesAll();
t('recordsAll sees both', everyRec.length === 2, 'got '+everyRec.length);
t('callsAll excludes the quote', onlyCalls.length === 1 && onlyCalls[0].id === 'c1');
t('quotesAll returns only the quote', onlyQuotes.length === 1 && onlyQuotes[0].id === 'q1');

// ---------- 3. sync would strip a record-level `kind`, which is why rectype is used ----------
const slim = w.slimCall(mkQuote('q2'));
t('slimCall overwrites kind (the collision rectype avoids)', slim.kind === 'field-crm-call');
t('slimCall preserves rectype through the sync envelope', slim.rectype === 'quote');

// ---------- 4. image modes ----------
t('IMG_MODES', JSON.stringify(g('IMG_MODES')) === '["full","thumb","thumbonly"]');
t('defaultImgMode falls back to full', w.defaultImgMode() === 'full');
w.setDefaultImgMode('thumb');
t('defaultImgMode persists', w.defaultImgMode() === 'thumb');
w.setDefaultImgMode('nonsense');
t('defaultImgMode rejects rubbish', w.defaultImgMode() === 'thumb');
w.setDefaultImgMode('full');
t('toggle markup only where there is something to toggle',
  w.imgToggleHTML('thumb').includes('id="imgtog"') && !w.imgToggleHTML('thumbonly').includes('id="imgtog"'));
t('toggle script omitted for thumbonly', w.imgToggleScript('thumbonly') === '');
t('toggle script escapes its closing tag', w.imgToggleScript('thumb').includes('<\/script>'));

// ---------- 5. shared belt spec table ----------
const belt = {type:'belt', asset:'CV-01', beltdesc:'S800', series:'S800', style:'Flat Top',
  beltmat:'PP', colour:'White', rodmat:'PP', width:'600', beltlen:'12', clength:'6',
  frame:'610', retrofit:'N', qty:'2', tsg:false, photos:[]};
const rows = w.beltSpecRows(belt);
const labels = rows.map(r => r[0]);
t('required rows always present', ['Series','Style / surface','Belt material','Rod material','Belt width (mm)'].every(l => labels.includes(l)));
t('empty optional rows dropped', !labels.includes('Flight type') && !labels.includes('Sideguard type'));
const grps = w.beltSpecGroups(belt);
t('fields banded into subsystems', grps[0][0] === 'Belt');
t('empty groups drop out entirely', !grps.some(gr => gr[0] === 'Flights and sideguards'));
const sprBelt = Object.assign({}, belt, {sprbore:'S40', sprpd:'101.6'});
t('a populated group appears', w.beltSpecGroups(sprBelt).some(gr => gr[0] === 'Sprockets'));
const tbl = w.beltSpecTableHTML(grps);
t('table is the spec class', tbl.startsWith('<table class="spec">'));
t('each group gets a banded header', tbl.includes('<th class="grp" colspan="2">Belt</th>'));
t('one field per row', !tbl.includes('</td><td class="l">'));
t('values carry their own cell class', tbl.includes('<td class="v">'));
t('quantity only when asked for',
  !w.beltSpecRows(belt).some(r => r[0]==='Quantity') &&
  w.beltSpecRows(belt, {qty:true})[0][0] === 'Quantity');

// ---------- 6. the two builders ----------
setCall(mkQuote('q3'));
g('call').entries = [belt, {type:'note', topic:'Commercial', text:'Wants it before the shutdown'}];
const rfq = await w.buildRFQHTML('full');
t('RFQ titled as a quote request', rfq.includes('Belt request for quote'));
t('RFQ carries required-by', rfq.includes('Required by') && rfq.includes('next week'));
t('RFQ carries your reference', rfq.includes('PO123'));
t('RFQ carries quantity', rfq.includes('Quantity'));
t('RFQ flags an unconfirmed belt ID', rfq.includes('Belt ID not yet confirmed with TSG'));
g('call').entries[0] = Object.assign({}, belt, {tsg:true});
const rfq2 = await w.buildRFQHTML('full');
t('RFQ states a confirmed belt ID', rfq2.includes('Belt ID confirmed with TSG') && !rfq2.includes('not yet confirmed'));
t('RFQ leaves out visit history', !rfq.includes('Visit history') && !rfq.includes('Project discovery'));
t('RFQ uses the shared masthead', rfq.includes('data:image/png;base64,iVBOR'));
t('RFQ names Intralox as text, not only in the logo', rfq.includes('<p class="eyebrow">Intralox</p>'));

setCall(mkCall('c3')); g('call').entries = [belt];
const notes = await w.buildNotesHTML('full', 'full');
t('call notes still build', notes.includes('Call notes') && notes.includes('Call details'));
t('call notes name Intralox as text', notes.includes('<p class="eyebrow">Intralox</p>'));
t('call notes body unclassed in full mode', notes.includes('</head><body>'));
const notesThumb = await w.buildNotesHTML('full', 'thumb');
t('thumb mode sets the body class', notesThumb.includes('<body class="tn">'));
t('no toggle when there are no photos', !notesThumb.includes('id="imgtog"'));

// ---------- 7. filenames ----------
setCall(mkCall('c4')); Object.assign(g('call'), {customer:'Acme Foods / Ltd', site:'Line 3', date:'16/09/2026'});
t('call notes filename', w.fileName('full') === 'Acme_Foods_Ltd_Line_3_call_notes_16-09-2026.html', w.fileName('full'));
t('health filename', w.fileName('health').includes('_health_check_'));
t('belts filename', w.fileName('belts').includes('_belt_requirements_'));
t('rfq filename', w.fileName('rfq') === 'Acme_Foods_Ltd_Line_3_belt_RFQ_16-09-2026.html', w.fileName('rfq'));

// ---------- 8. the output block ----------
t('compile screen gone from the DOM', !$('s-compile'));
t('compile screen gone from navigation', !g('CALL_SCREENS').includes('compile') && !g('TITLES').compile);
t('output controls present in the sheet',
  !!$('outScope') && !!$('outImg') && !!$('outDest') && !!$('outGo') && !!$('compStat') && !!$('detachWrap'));
t('the button sits on the dashboard', $('doOutput').closest('section').id === 's-dash');
t('the pickers sit in the sheet, not on the dashboard',
  $('outScope').closest('dialog') && $('outScope').closest('dialog').id === 'outdlg');
t('the button comes before the call log on the dashboard',
  $('doOutput').compareDocumentPosition($('logList')) & 4);
t('the button comes before the entry buttons', 
  $('doOutput').compareDocumentPosition($('dashAddHead')) & 4);

setCall(mkCall('c5'));
w.renderOutControls();
t('a call offers three outputs', $('outScope').options.length === 3);
t('scope row visible for a call', $('outScopeRow').hidden === false);
$('outDest').value = 'share'; w.renderOutHint();
t('button label follows the destination (share)', $('outGo').textContent === 'Create and share');
$('outDest').value = 'download'; w.renderOutHint();
t('button label follows the destination (save)', $('outGo').textContent === 'Create and save');
$('outDest').value = 'open'; w.renderOutHint();
t('button label follows the destination (open)', $('outGo').textContent === 'Create and open');
t('open says nothing leaves the device', $('outDlgHint').textContent.includes('Nothing leaves this device'));
t('open does not claim the call is issued', !$('outDlgHint').textContent.includes('Marks the call as issued'));
$('outDest').value = 'download'; w.renderOutHint();
$('outScope').value = 'health'; w.renderOutHint();
t('partial output says it does not mark the call issued', $('outDlgHint').textContent.includes('does not mark the call as issued'));
$('outScope').value = 'full'; w.renderOutHint();
t('full output says it marks the call issued', $('outDlgHint').textContent.includes('Marks the call as issued'));
$('outImg').value = 'thumbonly'; w.renderOutHint();
t('thumbonly warns the full images are left out', $('outDlgHint').textContent.includes('full-size images are left out'));

setCall(mkQuote('q5'));
w.renderOutControls();
t('a quote offers one output', $('outScope').options.length === 1 && $('outScope').value === 'rfq');
t('scope row hidden for a quote', $('outScopeRow').hidden === true);
t('currentOutScope resolves to rfq', w.currentOutScope() === 'rfq');

// ---------- 9. dashboard adapts ----------
setCall(mkQuote('q6')); w.renderDash();
const tile = k => d.querySelector('#s-dash [data-go="'+k+'"]');
t('project hidden on a quote', tile('project').hidden === true);
t('health hidden on a quote', tile('health').hidden === true);
t('belt still offered on a quote', tile('belt').hidden === false);
t('headings reworded for a quote', $('dashAddHead').textContent === 'Add to request'
  && $('dashLooseHead').textContent === 'Photos from the customer');
setCall(mkCall('c6')); w.renderDash();
t('project back on a call', tile('project').hidden === false);
t('headings back for a call', $('dashAddHead').textContent === 'Add to call');

// ---------- 10. quote mode on the account screen ----------
$('cType').value = 'Quote request'; w.syncQuoteMode();
t('call type stays visible - it is the control', $('cTypeRow').hidden === false);
t('required-by shown in quote mode', $('cReqByRow').hidden === false);
t('date still visible in quote mode', $('cDate').closest('.fld').hidden !== true);
t('date relabelled', $('cDateLbl').textContent === 'Date raised');
t('button verb changes', $('openCall').textContent === 'Start the quote request');
$('cType').value = 'Site call'; w.syncQuoteMode();
t('quote mode off for a site call', g('quoteMode') === false);
t('required-by hidden for a call', $('cReqByRow').hidden === true);
t('Quote request is offered as a call type',
  [...$('cType').options].some(o => o.value === 'Quote request'));
t('the separate tiles are gone',
  !d.querySelector('[data-go=\"newquote\"]') && !d.querySelector('[data-go=\"resumequote\"]'));
t('button verb back', $('openCall').textContent === 'Start the call');

// ---------- 11. belt form quote fields ----------
setCall(mkQuote('q7')); w.applyBeltQuoteFields();
t('quote fields shown on a quote', $('bQuoteRow').hidden === false);
setCall(mkCall('c7')); w.applyBeltQuoteFields();
t('quote fields hidden on a call', $('bQuoteRow').hidden === true);

// ---------- 12. backup sees everything ----------
const bk = await w.buildBackup(false);
t('backup includes quote requests', bk.calls.some(c => c.rectype === 'quote'), bk.calls.length + ' records');

// ---------- 13. block borders and separators ----------
setCall(mkQuote('q10'));
g('call').entries = [belt, Object.assign({}, belt, {asset:'CV-02'})];
const two = await w.buildRFQHTML('full');
t('a rule between belt one and belt two', (two.match(/<hr class="sep">/g)||[]).length === 1);
t('no stray rule before the first belt', two.indexOf('<hr class="sep">') > two.indexOf('Belt 1'));
setCall(mkQuote('q11'));
g('call').entries = [belt];
const one = await w.buildRFQHTML('full');
t('no rule when there is only one belt', !one.includes('<hr class="sep">'));
const cssSrc = fs.readFileSync('app.js','utf8').match(/const NOTES_CSS =([\s\S]*?);\nconst NOTES_LOGO/)[1];
const css = eval(cssSrc);
t('belt blocks are boxed', css.includes('.blk{') && css.includes('border-left:3px solid #479EBC'));
t('label cells use the brand input colour', css.includes("td.l{background:#F7F8F8"));
t('separator uses the cyan tint', css.includes('border-top:2px solid #E3F0F5'));

// ---------- 14. general comments ----------
t('commentHTML empty when there is nothing to say',
  w.commentHTML({}) === '' && w.commentHTML({comment:'   '}) === '');
const c1 = w.commentHTML({comment:'Frame is bent at the infeed'});
t('comment renders bold and labelled', c1.includes('class="cmt"') && c1.includes('<b>General comments</b>'));
t('comment escapes markup', w.commentHTML({comment:'<script>x</script>'}).includes('&lt;script&gt;'));
t('comment keeps line breaks', w.commentHTML({comment:'one\ntwo'}).includes('<br>'));

setCall(mkQuote('q12'));
g('call').entries = [Object.assign({}, belt, {comment:'Non-standard: 45mm flights, customer fabricated'})];
const withC = await w.buildRFQHTML('full');
t('RFQ carries the belt comment', withC.includes('Non-standard: 45mm flights'));
t('RFQ comment is inside the belt block', withC.indexOf('class="cmt"') > withC.indexOf('class="blk"'));

setCall(mkCall('c12'));
g('call').entries = [
  Object.assign({}, belt, {comment:'Belt edge damage on the drive side'}),
  {type:'health', asset:'CV-9', fault:'Sprocket wear', htype:'Sprocket wear', severity:'Plan',
   action:'Replace at next shutdown', comment:'Guard is missing, flag to safety', photos:[]}
];
const notesC = await w.buildNotesHTML('full','full');
t('call notes carry the belt comment', notesC.includes('Belt edge damage on the drive side'));
t('call notes carry the health comment', notesC.includes('Guard is missing, flag to safety'));
t('two comment blocks rendered', (notesC.match(/class="cmt"/g)||[]).length === 2);
const beltsOnly = await w.buildNotesHTML('belts','full');
t('belt extract carries the comment', beltsOnly.includes('Belt edge damage'));
const healthOnly = await w.buildNotesHTML('health','full');
t('health extract carries the comment', healthOnly.includes('Guard is missing'));

t('comment survives a round trip through the form', (() => {
  const e = {type:'belt', asset:'CV-1', comment:'round trip', qty:'', tsg:false};
  w.fillBeltFromEntry(e);
  return d.getElementById('bComment').value === 'round trip';
})());
t('reset clears the comment', (() => { w.resetBelt(); return d.getElementById('bComment').value === ''; })());
t('comment is a draft field',
  g('DRAFT_FIELDS').belt.includes('bComment') && g('DRAFT_FIELDS').health.includes('hComment'));
t('css styles comments bold', (() => {
  const src = fs.readFileSync('app.js','utf8').match(/const NOTES_CSS =([\s\S]*?);\nconst NOTES_LOGO/)[1];
  return eval(src).includes('.cmt{') && eval(src).includes('font-weight:bold');
})());

// ---------- 15. destinations by device ----------
// jsdom reports a 1024px window and has no navigator.share, so this is the PC case
t('PC leads with Open', w.outDestOptions()[0][0] === 'open');
t('PC offers a download', w.outDestOptions().some(o => o[0] === 'download'));
t('PC does not offer a share sheet it cannot use', !w.outDestOptions().some(o => o[0] === 'share'));
t('PC wording says Downloads folder, not phone',
  w.outDestOptions().find(o => o[0] === 'download')[1] === 'Download to this PC');

// force the phone case through the breakpoint matchMedia reads
const realMM = w.matchMedia;
w.matchMedia = q => ({matches:/max-width/.test(q), addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}});
t('phone without share support leads with save', w.outDestOptions()[0][0] === 'download');
t('phone wording says this phone',
  w.outDestOptions().find(o => o[0] === 'download')[1] === 'Save to this phone');
w.navigator.canShare = () => true; w.navigator.share = async () => {};
t('phone with share support leads with the share sheet', w.outDestOptions()[0][0] === 'share');
t('phone still offers Open', w.outDestOptions().some(o => o[0] === 'open'));
delete w.navigator.canShare; delete w.navigator.share;
w.matchMedia = realMM;

w.renderOutDest();
t('picker is populated from the options', $('outDest').options.length === w.outDestOptions().length);
t('openInTab exists', typeof w.openInTab === 'function');
let openedWith = null;
const realOpen = w.open; w.open = u => { openedWith = u; return {document:{}}; };
w.openInTab('<p>hi</p>', 'x.html');
t('openInTab opens a blob url', typeof openedWith === 'string' && openedWith.startsWith('blob:'));
w.open = () => null;
w.openInTab('<p>hi</p>', 'x.html');
t('blocked pop-up is reported, not swallowed', $('toast').textContent.includes('allow pop-ups'));
w.open = realOpen;

// ---------- 16. A4 page geometry ----------
const cssA4 = eval(fs.readFileSync('app.js','utf8').match(/const NOTES_CSS =([\s\S]*?);\nconst NOTES_LOGO/)[1]);
t('page declared as A4', cssA4.includes('@page{size:A4;margin:14mm}'));
t('sheet constrained to 210mm', cssA4.includes('max-width:210mm'));
t('15mm side margins give a 180mm column', cssA4.includes('.pg{padding:0 15mm 15mm}'));
t('masthead sits inside the sheet', cssA4.includes('.mast{background:#ED1C24;padding:13px 15mm'));
t('background colours survive printing', cssA4.includes('print-color-adjust:exact'));
t('print resets the on-screen sheet', cssA4.includes('body{max-width:none;box-shadow:none;margin:0}'));
t('headings hold on to what follows', cssA4.includes('h1,h2,h3,th{page-break-after:avoid'));
t('rows and images do not split', cssA4.includes('tr,img{page-break-inside:avoid'));
t('long tables may break between rows', cssA4.includes('table{page-break-inside:auto}'));
t('table headers repeat across pages', cssA4.includes('thead{display:table-header-group}'));
t('no separator stranded at a page foot', cssA4.includes('.sep{page-break-after:avoid}'));
t('orphans and widows controlled', cssA4.includes('orphans:3;widows:3'));
t('nothing overflows the column', cssA4.includes('img{max-width:100%}') && cssA4.includes('word-wrap:break-word'));
t('column proportions left to auto layout', !cssA4.includes('table-layout:fixed'));
const a4doc = await w.buildRFQHTML('full');
t('the built document carries the page rules', a4doc.includes('@page{size:A4') && a4doc.includes('max-width:210mm'));

// ---------- 17. the spec table reads as a spec sheet ----------
const cssT = eval(fs.readFileSync('app.js','utf8').match(/const NOTES_CSS =([\s\S]*?);\nconst NOTES_LOGO/)[1]);
t('tables ruled on all sides', cssT.includes('table{border-collapse:collapse') && cssT.includes('border:1px solid #B9BCBF'));
t('cells ruled', cssT.includes('td{padding:7px 10px;border:1px solid #D4D6D8'));
t('header cells filled', cssT.includes('th{background:#E3F0F5'));
t('group bands filled more strongly', cssT.includes('th.grp{background:#ACD3E1'));
t('label cells filled', cssT.includes('td.l{background:#F7F8F8'));
t('labels no longer tiny grey uppercase',
  cssT.includes("td.l{background:#F7F8F8;width:38%;color:#4D4D4F;font-weight:bold;font-size:9.5pt") &&
  cssT.includes('text-transform:none'));
t('the two-column variant is gone', !cssT.includes('table.two'));
t('a group band never ends a page', cssT.includes('h1,h2,h3,th{page-break-after:avoid'));

setCall(mkQuote('q13'));
g('call').entries = [Object.assign({}, belt, {sprbore:'S40', sprpd:'101.6', sprmat:'PA',
  fstyle:'Straight', flmat:'PP', fheight:'50'})];
const doc3 = await w.buildRFQHTML('full');
t('all three bands present when all three are filled',
  doc3.includes('>Belt</th>') && doc3.includes('>Sprockets</th>') && doc3.includes('>Flights and sideguards</th>'));
t('quantity leads the belt band on an RFQ',
  doc3.indexOf('Quantity') < doc3.indexOf('Series'));

// ---------- 18. the document tick governs every output ----------
const people = [
  {name:'Damo', role:'Maintenance Manager', email:'d@x.com', mobile:'0400', crm:true, doc:true},
  {name:'Brad', role:'Fitter', email:'', mobile:'', crm:true, doc:false},
  {name:'Nobody Ticked', role:'Passing by', email:'', mobile:'', crm:false, doc:false}
];
setCall(mkCall('c20'));
Object.assign(g('call'), {contacts: people, entries:[belt]});
const notesF = await w.buildNotesHTML('full','full');
t('full notes show a ticked contact', notesF.includes('Damo'));
t('full notes hide an unticked contact', !notesF.includes('Brad') && !notesF.includes('Nobody Ticked'));
const beltsF = await w.buildNotesHTML('belts','full');
t('belt extract still filters', beltsF.includes('Damo') && !beltsF.includes('Brad'));

setCall(mkQuote('q20'));
Object.assign(g('call'), {contacts: people, entries:[belt]});
const rfqF = await w.buildRFQHTML('full');
t('RFQ shows a ticked contact', rfqF.includes('Damo'));
t('RFQ hides an unticked contact', !rfqF.includes('Brad'));

// nobody ticked at all - the section should not print as an empty table
setCall(mkCall('c21'));
Object.assign(g('call'), {contacts: people.map(x => Object.assign({}, x, {doc:false})), entries:[belt]});
const noneF = await w.buildNotesHTML('full','full');
t('no contacts section when none are ticked', !noneF.includes('<h2>Contacts</h2>'));
t('the rest of the document still builds', noneF.includes('Call details') && noneF.includes('Belt 1'));

// a contact with no doc flag at all is an existing call - it must still show
setCall(mkCall('c22'));
Object.assign(g('call'), {contacts:[{name:'Legacy', role:'Engineer', crm:true}], entries:[]});
t('contacts saved before the flag existed still print',
  (await w.buildNotesHTML('full','full')).includes('Legacy'));
t('unticking never removes anyone from the call', g('call').contacts.length === 1);

console.log('\nPASS ' + ok.length);
if (bad.length){ console.log('\nFAIL ' + bad.length); bad.forEach(b => console.log('  x ' + b)); }
const realErrs2 = errs.filter(e => !/Not implemented|Could not parse CSS|zones\.js/i.test(e));
if (realErrs2.length){ console.log('\nconsole.error:'); realErrs2.slice(0,12).forEach(e => console.log('  ! ' + e)); }
process.exit(bad.length || realErrs2.length ? 1 : 0);
