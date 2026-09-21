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
t('home button is an icon', $('hdMenu').querySelector('svg.ic') !== null);
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
t('home button hides on home', $('hdMenu').style.display === 'none');
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
t('Done replaced back-without-saving',
  d.querySelectorAll('.backcall').length === 4 &&
  [...d.querySelectorAll('.backcall')].every(b => b.textContent === 'Done'));
t('Done is the primary action',
  [...d.querySelectorAll('.backcall')].every(b => b.classList.contains('big')));

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

console.log('\nPASS ' + ok.length);
if(bad.length){ console.log('\nFAIL ' + bad.length); bad.forEach(b=>console.log('  x '+b)); }
const real = errs.filter(e=>!/Not implemented|Could not parse CSS|zones\.js/i.test(e));
if(real.length){ console.log('\nconsole.error:'); real.slice(0,10).forEach(e=>console.log('  ! '+e)); }
process.exit(bad.length||real.length?1:0);
