import { JSDOM } from 'jsdom';
import fs from 'fs';
import 'fake-indexeddb/auto';
const errs=[];
const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{runScripts:'dangerously',url:'https://example.org/'});
const w=dom.window,d=w.document;
w.indexedDB=indexedDB; w.IDBKeyRange=IDBKeyRange; w.scrollTo=()=>{}; w.alert=()=>{};
w.confirm=()=>true;
w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
w.navigator.storage={persist:async()=>true,persisted:async()=>true};
w.URL.createObjectURL=()=>'blob:stub'; w.URL.revokeObjectURL=()=>{};
w.HTMLCanvasElement.prototype.getContext=()=>null;
w.console.error=(...a)=>errs.push(a.join(' ')); w.console.warn=()=>{};
if(!w.Element.prototype.setPointerCapture) w.Element.prototype.setPointerCapture=function(){};
for(const f of ['zones.js','manuals.js','healthlib.js','app.js']){
  const el=d.createElement('script'); el.textContent=fs.readFileSync(f,'utf8'); d.body.appendChild(el);
}
d.dispatchEvent(new w.Event('DOMContentLoaded'));
await new Promise(r=>setTimeout(r,400));
const g=e=>w.eval('('+e+')');
const $=id=>d.getElementById(id);
const ok=[],bad=[];
const t=(n,c,x)=>(c?ok:bad).push(n+(x?' -> '+x:''));
const setCall=o=>{w.__t=o;w.eval('call = window.__t');};
const mk=id=>({id,customer:'Acme',date:'01/09/2026',type:'Site call',mgr:'B',site:'',
  contacts:[{name:'X',crm:true}],entries:[],loose:[],closed:false,updated:Date.now(),status:'in progress'});

// ---- header icons ----
t('back button is an icon', $('back').querySelector('svg.ic') !== null);
// v78: on Home (where the app opens) it is the ⋯ menu; anywhere else, the home icon
t('on opening, the right-hand button is the ⋯ menu', /\u22ef/.test($('hdMenu').textContent) && $('hdMenu').style.display !== 'none');
w.showScreen('reports');
t('home button is an icon', $('hdMenu').querySelector('svg.ic') !== null);
w.showScreen('home');
t('home icon exists in the set', !!g('ICONS').home && !!g('ICONS').chev);

// ---- hierarchical back ----
const P = g('PARENT');
t('belt goes up to the dashboard', P.belt === 'dash');
t('dashboard goes up to home', P.dash === 'home');
t('contacts goes up to the account picker', P.contacts === 'account');
setCall(mk('c1'));
t('parentOf walks the tree', w.parentOf('belt') === 'dash' && w.parentOf('dash') === 'home');
w.eval('call = null');
t('a call screen with no call open falls back to home', w.parentOf('belt') === 'home');
t('an unlisted screen fails safe to home', w.parentOf('nonsense') === 'home');

// two presses from a belt should reach home
setCall(mk('c2'));
w.showScreen('belt');
$('back').click();
t('first press leaves the belt for the dashboard', g('screen') === 'dash', g('screen'));
$('back').click();
t('second press reaches home', g('screen') === 'home', g('screen'));

// home from depth, in one tap
setCall(mk('c3'));
w.showScreen('belt');
$('hdMenu').click();
t('home button works from inside a call', g('screen') === 'home');
t('the call is still open after going home', g('call') !== null);
w.showScreen('home');
// v85: on Home the right-hand button is the ⋯ menu: Settings and Help
t('on Home the right-hand button is the Settings and Help menu', $('hdMenu').style.display !== 'none' && $('hdMenu').getAttribute('aria-label') === 'Settings and help');
$('hdMenu').click();
t('the ⋯ menu offers Settings and Help',
  $('vmdlg').hasAttribute('open') && [...$('vmBody').querySelectorAll('button')].map(b => b.textContent.trim()).join() === 'Settings,Help');
[...$('vmBody').querySelectorAll('button')].find(b => /Settings/.test(b.textContent)).click();
t('Settings opens Settings', g('screen') === 'settings' && !$('vmdlg').hasAttribute('open'));
w.showScreen('home');
$('hdMenu').click();
[...$('vmBody').querySelectorAll('button')].find(b => /Help/.test(b.textContent)).click();
t('Help opens Help', g('screen') === 'help' && $('title').textContent === 'Help');
t('Help has Getting started and How do I…',
  [...$('s-help').querySelectorAll('h2')].map(h => h.textContent).join('|') === 'Getting started|How do I\u2026');
const hx = [...$('s-help').querySelectorAll('details.hx')];
t('every help section starts closed', hx.length >= 20 && hx.every(x => !x.open), hx.length);
t('every section has a title and a line under it', hx.every(x => x.querySelector('summary b').textContent && x.querySelector('summary .sxs').textContent));
t('back from Help goes Home', (w.eval("parentOf('help')")) === 'home');
w.showScreen('home');
t('back button hides on home', $('back').style.display === 'none');

// ---- photo buffers on all four ----
const PRE = g('SHOT_PREFIX');
t('four entry screens have buffers', Object.keys(PRE).join(',') === 'belt,project,note,health');
['b','p','n','h'].forEach(pre => {
  t(pre+' has camera and photos buttons', !!$(pre+'Cam') && !!$(pre+'Gal'));
  t(pre+' buttons carry icons', $(pre+'Cam').querySelector('svg.ic') !== null
    && $(pre+'Gal').querySelector('svg.ic') !== null);
  t(pre+' has a thumbnail strip and a count', !!$(pre+'Shots') && !!$(pre+'ShotN'));
});
t('one shared pair of file inputs', !!$('entCamIn') && !!$('entGalIn'));
t('camera input captures, gallery input does not',
  $('entCamIn').getAttribute('capture') === 'environment' && !$('entGalIn').hasAttribute('capture'));
t('the per-screen health inputs are gone', !$('hCamIn') && !$('hGalIn'));

// buffer behaviour
setCall(mk('c4'));
w.eval("SHOTS.belt.push('data:image/png;base64,AAA','data:image/png;base64,BBB')");
w.renderShots('belt');
t('count reflects the buffer', $('bShotN').textContent === '2 photos ready', $('bShotN').textContent);
t('thumbnails rendered', $('bShots').querySelectorAll('img').length === 2);
const taken = w.takeShots('belt');
t('takeShots hands over the list', taken.length === 2);
t('takeShots empties the buffer, so a second save cannot double up', g('SHOTS').belt.length === 0);
t('count clears with the buffer', $('bShotN').textContent === '');

// ---- leaving an entry form ----
t('required fields defined for all four',
  Object.keys(g('ENTRY_REQUIRED')).join(',') === 'belt,project,note,health');
setCall(mk('c5'));
w.showScreen('belt');
t('an untouched belt form is empty', w.entryIsEmpty('belt') === true);
t('an untouched belt form lacks its required field', w.entryHasRequired('belt') === false);
$('bAsset').value = 'CV-100';
t('required field satisfied once filled', w.entryHasRequired('belt') === true);
t('form no longer counts as empty', w.entryIsEmpty('belt') === false);
$('bAsset').value = '';
$('bDesc').value = 'half typed';
t('part filled is neither empty nor complete',
  w.entryIsEmpty('belt') === false && w.entryHasRequired('belt') === false);

// empty form: leaving must leave nothing behind
setCall(mk('c6'));
w.showScreen('belt');
w.resetBelt();
$('back').click();
t('backing out of an untouched form logs nothing', g('call').entries.length === 0);
t('and leaves no draft', !g('call').drafts || !g('call').drafts.belt);

// ---- save buttons gone ----
['bSave','pSave','nSave','hSave'].forEach(id =>
  t(id+' is hidden', $(id).hidden === true));
// v82: one Done, in the call toolbar at the top; none left at the foot of the forms
t('Done replaced back-without-saving',
  d.querySelectorAll('.backcall').length === 1 && $('barDone').textContent === 'Done');
t('Done is the primary action, at the top',
  $('barDone').classList.contains('pri') && !!$('barDone').closest('#bar') &&
  ['s-belt','s-project','s-note','s-health'].every(id => !$(id).querySelector('.backcall')));

// ---- viewer zoom ----
t('zoom helpers exist',
  typeof w.pvSetZoom === 'function' && typeof w.pvReset === 'function');
t('viewer has Fit and Remove controls', !!$('pvReset') && !!$('pvDel'));
w.pvSetZoom(3, null, null);
t('zoom applies a transform', $('pvImg').style.transform.includes('scale(3)'), $('pvImg').style.transform);
t('Fit appears once zoomed', $('pvReset').hidden === false);
w.pvSetZoom(0.2);
t('zoom cannot go below fit', g('pvZoom') === 1);
w.pvSetZoom(99);
t('zoom is capped', g('pvZoom') === g('PV_MAX'));
w.pvReset();
t('reset returns to fit and centre', g('pvZoom') === 1 && g('pvX') === 0 && g('pvY') === 0);
t('Fit hides again at fit', $('pvReset').hidden === true);
// remove callback
let removedAt = null;
const list = ['a','b','c'];
w.openPhoto(list, 1, 'Test', {onRemove: i => { removedAt = i; list.splice(i,1); }});
t('Remove shows when a handler is given', $('pvDel').hidden === false);
$('pvDel').click();
t('remove reports the right index', removedAt === 1);
t('viewer stays open with photos left', $('pview').classList.contains('on'));
w.closePhoto();
w.openPhoto(['only'], 0, 'Test');
t('Remove hidden without a handler', $('pvDel').hidden === true);
w.closePhoto();

// ---- v82: the call toolbar is at the top, with one main action ----
setCall(mk('c7'));
w.showScreen('dash');
t('toolbar shows inside a call', $('bar').style.display === 'block');
t('toolbar is above the screens, not fixed to the bottom',
  !!($('bar').compareDocumentPosition(d.querySelector('.wrap')) & 4));
t('toolbar icons carry names',
  ['barCamera','barGallery','barManuals'].every(id => $(id).querySelector('svg') && $(id).getAttribute('aria-label')));
t('call menu: Create and share, no Done', !$('doOutput').hidden && $('barDone').hidden);
t('no Call menu button any more', !$('barMenu'));
w.showScreen('note');
t('a form: Done, no Create and share', $('barDone').hidden === false && $('doOutput').hidden === true);
t('Log a fault sits up with the asset, above the belt data',
  !!($('bFault').compareDocumentPosition($('bxBelt')) & 4));

// ---- v82: chips for short known lists; the select underneath keeps the value ----
for (const id of ['nTopic','pStat','hType','dType','dDur','cMgr'])
  t(id + ' shows as chips, its dropdown hidden', $(id).hidden && $(id + 'Chips') && $(id + 'Chips').querySelectorAll('button').length > 0);
t('note topic starts on Other', $('nTopicChips').querySelector('button.on').textContent === 'Other');
let changed = 0; $('nTopic').addEventListener('change', () => changed++);
[...$('nTopicChips').querySelectorAll('button')].find(b => b.textContent === 'Commercial').click();
t('tapping a chip sets the value', $('nTopic').value === 'Commercial');
t('and fires change, as the dropdown did', changed === 1);
t('only that chip is on', [...$('nTopicChips').querySelectorAll('button.on')].map(b => b.textContent).join() === 'Commercial');
[...$('nTopicChips').querySelectorAll('button')].find(b => b.textContent === 'Commercial').click();
t('tapping it again keeps it where the list has no blank answer', $('nTopic').value === 'Commercial');
$('pStat').value = 'Quoted';
t('a value set from code lights its chip', $('pStatChips').querySelector('button.on').textContent === 'Quoted');
w.eval("META = {managers: ['Ann','Bob']}; fillManagers()");
await new Promise(r => setTimeout(r, 20));
t('a rebuilt list rebuilds its chips',
  [...$('cMgrChips').querySelectorAll('button')].map(b => b.textContent).join() === 'Ann,Bob', $('cMgrChips').textContent);
// a note saved through the top Done keeps the topic picked on the chips
setCall(mk('c8'));
w.showScreen('note');
[...$('nTopicChips').querySelectorAll('button')].find(b => b.textContent === 'Plant').click();
$('nText').value = 'New line going in next year';
$('barDone').click();
await new Promise(r => setTimeout(r, 200));
const nEnt = g('call').entries.find(e => e.type === 'note');
t('Done at the top saves the note', !!nEnt && nEnt.text === 'New line going in next year');
t('with the topic from the chips', nEnt && nEnt.topic === 'Plant', nEnt && nEnt.topic);
t('and returns to the call menu', g('screen') === 'dash');

// ---- v83: call log cards - tap to open, ⋯ for the rest, Duplicate ----
{
  const c9 = mk('c9');
  c9.entries = [
    {type:'note', topic:'Plant', text:'Second line planned', photos:['data:image/png;base64,AAA','data:image/png;base64,BBB']},
    {type:'project', project:'Freezer upgrade', status:'Scoping', next:'Site measure', target:'Q1', owner:'', notes:'', photos:[]}
  ];
  setCall(c9);
  w.showScreen('dash'); await new Promise(r => setTimeout(r, 50));
  const cards = $('logList').querySelectorAll('.card.entry');
  t('each entry is a card with a ⋯', cards.length === 2 && cards[0].querySelector('[data-emenu]'));
  t('no button row on the cards any more', !$('logList').querySelector('.cardbar') && !$('logList').querySelector('[data-del]'));
  t('the photo count is on the card', /2 photos/.test(cards[0].textContent));
  t('the photos are still on the card', cards[0].querySelectorAll('.thumbs img').length === 2);
  cards[0].querySelector('[data-emenu]').click();
  const acts = [...$('vmBody').querySelectorAll('button')].map(b => b.textContent.trim());
  t('⋯ offers photo, gallery, Duplicate, then Delete last', acts.join() === 'Take a photo,Add from photos,Duplicate,Delete', acts.join());
  t('Delete is the warning one', $('vmBody').querySelector('button.danger').textContent.trim() === 'Delete');
  let asked = '';
  w.confirm = m => { asked = m; return false; };
  [...$('vmBody').querySelectorAll('button')].find(b => /Delete/.test(b.textContent)).click();
  await new Promise(r => setTimeout(r, 20));
  t('Delete names the entry and its photos', /Note - Plant/.test(asked) && /2 photos/.test(asked), asked);
  t('Cancel keeps it', g('call').entries.length === 2);
  w.confirm = () => true;
  // tap the card: opens to edit
  $('logList').querySelector('[data-edit="0"]').click(); await new Promise(r => setTimeout(r, 20));
  t('tapping the card opens it to edit', g('screen') === 'note' && $('nText').value === 'Second line planned' && g('editingIdx') === 0);
  w.showScreen('dash'); w.eval('editingIdx = null');
  // Duplicate: opens a copy; Done adds a new entry, original untouched, no photos
  $('logList').querySelector('[data-emenu="0"]').click();
  [...$('vmBody').querySelectorAll('button')].find(b => /Duplicate/.test(b.textContent)).click();
  await new Promise(r => setTimeout(r, 20));
  t('Duplicate opens the copy in the form, not saved yet',
    g('screen') === 'note' && $('nText').value === 'Second line planned' && g('editingIdx') === null && g('call').entries.length === 2);
  $('nText').value = 'Third line planned';
  $('barDone').click(); await new Promise(r => setTimeout(r, 200));
  const es = g('call').entries;
  t('Done adds the copy as a new entry', es.length === 3 && es[2].text === 'Third line planned' && es[2].topic === 'Plant');
  t('the original is untouched', es[0].text === 'Second line planned' && es[0].photos.length === 2);
  t('photos are not copied', (es[2].photos || []).length === 0);
  // a project copy has its name cleared
  w.showScreen('dash'); await new Promise(r => setTimeout(r, 50));
  $('logList').querySelector('[data-emenu="1"]').click();
  [...$('vmBody').querySelectorAll('button')].find(b => /Duplicate/.test(b.textContent)).click();
  await new Promise(r => setTimeout(r, 20));
  t('a project copy keeps the details but clears the name', g('screen') === 'project' && $('pName').value === '' && $('pNext').value === 'Site measure');
  w.showScreen('dash');
}

// ---- v88: manuals from intralox.com ----
{
  await w.renderIx();
  const rows = [...$('ixList').querySelectorAll('.ixrow')];
  t('three manuals to download: MPB, ThermoDrive, installation',
    rows.length === 3 && rows.map(r => r.querySelector('b').textContent).join('|') === 'MPB engineering manual|ThermoDrive engineering manual|MPB installation manual',
    rows.map(r => r.textContent).join(' / '));
  t('each says Download until it has been', rows.every(r => r.querySelector('[data-ixget]').textContent === 'Download'));
  t('the check needs a signed-in device', (await w.checkManualEditions(true)) === false);
  t('not signed in, it says how to get the weekly check', /Sign in to cloud sync/.test($('ixList').textContent));
  // a device that downloaded the ThermoDrive manual, and a check that found a newer one
  await w.kvSet('manualSrc', {td: {url: 'https://example.org/old-td.pdf', modified: 'Mon, 02 Feb 2026 20:21:12 GMT', id: 'THERMODRIVET', at: Date.now()}});
  w.eval(`IX_LATEST = {checked: new Date().toISOString(), docs: {td: {url: 'https://example.org/new-td.pdf', modified: 'Mon, 01 Feb 2027 10:00:00 GMT', bytes: 17000000}}}`);
  await w.renderIx();
  const td = [...$('ixList').querySelectorAll('.ixrow')][1];
  t('a newer edition is flagged on its row', td.classList.contains('new') && /newer edition/.test(td.textContent) && td.querySelector('[data-ixget]').textContent === 'Get the new one');
  t('and the download uses the new link', w.eval(`ixDoc('td').url`) === 'https://example.org/new-td.pdf');
  t('the Engineering manuals line says so too', /new edition is out/.test($('sumMan').textContent), $('sumMan').textContent);
  w.eval(`IX_LATEST = {checked: new Date().toISOString(), docs: {td: {url: 'https://example.org/old-td.pdf', modified: 'Mon, 02 Feb 2026 20:21:12 GMT'}}}`);
  await w.renderIx();
  t('the same edition is not flagged', !$('ixList').querySelector('.ixrow.new') && /Downloaded/.test([...$('ixList').querySelectorAll('.ixrow')][1].textContent));
  await w.kvSet('manualSrc', {}); w.eval('IX_LATEST = {}'); await w.renderIx();
  // Reference: the Intralox website tab
  w.showRef('web');
  const links = [...$('webList').querySelectorAll('a')];
  t('Reference has the Intralox website links', $('refTabs').querySelector('[data-pane="web"]').classList.contains('on') && links.length === 6 && !$('paneWeb').hidden);
  t('they open outside the app, safely', links.every(a => a.target === '_blank' && a.rel === 'noopener' && /^https:\/\//.test(a.href)));
  t('Belt Finder and the videos are there', links.some(a => /belt-finder/.test(a.href)) && links.some(a => /how-to-videos/.test(a.href)));
  w.showRef('man');
  t('the Manuals tab still works', !$('paneMan').hidden && $('paneWeb').hidden && $('paneFlt').hidden);
  w.showScreen('home');
}

// Branding: red is never a button (v81). No rule that styles a button, or a
// .big/.btn/.pri class, may fill or border it in the brand red.
{
  const css = [...d.querySelectorAll('style')].map(x => x.textContent).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
  const redBtn = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim(), body = m[2];
    if (/(^|[\s,>])button\b|\.big\b|\.btn\b|\.pri\b/.test(sel) && /background(-color)?:\s*(var\(--red(-dark)?\)|#ED1C24|#9D0A0E)/i.test(body)) redBtn.push(sel);
  }
  t('no red buttons: ' + redBtn.join(' | '), redBtn.length === 0);
  t('primary action colour is navy', /--act:\s*#00287B/i.test(css));
}

console.log('\nPASS ' + ok.length);
if(bad.length){ console.log('\nFAIL ' + bad.length); bad.forEach(b=>console.log('  x '+b)); }
const real = errs.filter(e=>!/Not implemented|Could not parse CSS|zones\.js/i.test(e));
if(real.length){ console.log('\nconsole.error:'); real.slice(0,10).forEach(e=>console.log('  ! '+e)); }
process.exit(bad.length||real.length?1:0);
