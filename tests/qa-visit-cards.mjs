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

// an account with two contacts, one of which has no number
w.eval(`
  ACC_BY_NAME.set('Hazeldenes', {a:'Hazeldenes', sub:'Lockwood', z:'cvic', foc:'high', c:[
    {id:'k1', n:'Damo Field', p:'0400 000 000', e:['damo@haz.com.au'], t:'Maintenance Manager'},
    {id:'k2', n:'Brad', p:'', e:[], r:'Engineer'},
    {id:'k3', n:'Smith, John; Jr', p:'0400 111 111', e:[], t:'Fitter'}
  ]});
  APPTS.length = 0;
  APPTS.push({id:'a1', acct:'Hazeldenes', date:todayISOdate(), start:'09:30', dur:90,
              type:'Site call', contacts:[0,1], status:'planned', agenda:'Retrofit follow-up on the sizer line, plus the spare sprocket count and the wear strip question'});
  APPTS.push({id:'a2', acct:'Hazeldenes', date:todayISOdate(), start:'13:00', dur:60,
              type:'Site call', contacts:[2], status:'done'});
`);

// ---------- 1. the condensed card ----------
const card = () => { const x = d.createElement('div'); x.innerHTML = w.visitCard(g("APPTS[0]")); return x; };
const c1 = card();

t('the card carries a tap target', !!c1.querySelector('[data-open="a1"]'));
t('the tap target is the reading area', c1.querySelector('.vopen').querySelector('.who'));
t('the card carries an overflow button', !!c1.querySelector('[data-vmenu="a1"]'));
t('no button is nested inside another button', !c1.querySelector('button button'));
t('the Start button is gone', !c1.querySelector('[data-start]'));
t('the wrapping action row is gone', !c1.querySelector('.acts'));

t('the account name is on the card', /Hazeldenes/.test(c1.textContent));
t('the time is on the card', /09:30/.test(c1.textContent));
t('the contacts show as names', /Damo Field/.test(c1.textContent) && /Brad/.test(c1.textContent));
t('no phone numbers on the card', !/0400/.test(c1.textContent));
t('no tel links on the card', !c1.querySelector('a[href^="tel:"]'));
t('no "no number on file" clutter', !/no number on file/.test(c1.textContent));
t('the suburb rides on the contacts line', /Lockwood/.test(c1.querySelector('.vsub').textContent));
t('the zone is gone', !/Central|cvic/i.test(c1.textContent));
t('the duration is gone', !/90 min/.test(c1.textContent));
t('the call type is gone', !/Site call/.test(c1.textContent));

t('a planned visit shows no status word', !c1.querySelector('.st'));
const c2 = (()=>{ const x = d.createElement('div'); x.innerHTML = w.visitCard(g("APPTS[1]")); return x; })();
t('a settled visit does show its status', !!c2.querySelector('.st'));
t('a settled visit is marked settled', c2.querySelector('.vis').classList.contains('settled'));

t('the agenda is present but clamped', !!c1.querySelector('.ag'));
t('the agenda is not the old wrapping block',
  !/pre-wrap/.test(readFileSync('index.html','utf8').match(/\.vis \.ag\{[^}]*\}/)[0]));

// ---------- 2. vCards ----------
const vc = w.vCardFor(g("ACC_BY_NAME.get('Hazeldenes').c[0]"), 'Hazeldenes');
t('a vCard opens and closes properly',
  vc.startsWith('BEGIN:VCARD') && vc.trim().endsWith('END:VCARD'));
t('a vCard declares its version', vc.includes('VERSION:3.0'));
t('a vCard uses CRLF line endings', vc.includes('\r\n') && !/[^\r]\n/.test(vc));
t('a vCard carries the display name', vc.includes('FN:Damo Field'));
t('a vCard splits the structured name', vc.includes('N:Field;Damo;;;'));
t('a vCard carries the account as the organisation', vc.includes('ORG:Hazeldenes'));
t('a vCard carries the job title', vc.includes('TITLE:Maintenance Manager'));
t('a vCard carries the mobile', vc.includes('TEL;TYPE=CELL:0400 000 000'));
t('a vCard carries the email', vc.includes('EMAIL;TYPE=WORK:damo@haz.com.au'));

const vcNo = w.vCardFor(g("ACC_BY_NAME.get('Hazeldenes').c[1]"), 'Hazeldenes');
t('a contact with no number emits no TEL line', !vcNo.includes('TEL'));
t('a contact with no email emits no EMAIL line', !vcNo.includes('EMAIL'));
t('a single-word name still produces a valid card',
  vcNo.includes('FN:Brad') && vcNo.includes('N:Brad;;;;'));
t('a role is used when there is no title', vcNo.includes('TITLE:Engineer'));

// the escaping case: commas and semicolons inside a name would split the record
const vcEsc = w.vCardFor(g("ACC_BY_NAME.get('Hazeldenes').c[2]"), 'Haz, Pty; Ltd');
t('commas in a name are escaped', vcEsc.includes('\\,'));
t('semicolons in a name are escaped', vcEsc.includes('\\;'));
t('the escaped name does not leak a bare comma into FN',
  /FN:[^\r\n]*/.exec(vcEsc)[0].split('\\,').join('').indexOf(',') === -1);
t('commas in the organisation are escaped', vcEsc.includes('ORG:Haz\\,'));

t('several contacts concatenate into one file',
  w.eval("ACC_BY_NAME.get('Hazeldenes').c.map(c=>vCardFor(c,'Haz')).join('\\r\\n')")
    .match(/BEGIN:VCARD/g).length === 3);

// ---------- 3. the visit menu ----------
t('the menu dialog exists', !!$('vmdlg') && $('vmdlg').tagName === 'DIALOG');
t('the menu is registered so back closes it', g('DIALOGS').includes('vmdlg'));

w.openVisitMenu('a1');
t('opening the menu marks it open', $('vmdlg').hasAttribute('open'));
t('the menu names the account', $('vmName').textContent === 'Hazeldenes');
t('the menu gives the time and type', /09:30/.test($('vmWhen').textContent) && /Site call/.test($('vmWhen').textContent));

const body = $('vmBody');
t('the menu lists the contacts', /Damo Field/.test(body.textContent) && /Brad/.test(body.textContent));
t('the numbers live in the menu', /0400 000 000/.test(body.textContent));
t('a contact with a number offers copy', !!body.querySelector('[data-vcopy="0"]'));
t('a contact without a number offers no copy', !body.querySelector('[data-vcopy="1"]'));
t('every contact offers save to contacts',
  !!body.querySelector('[data-vsave="0"]') && !!body.querySelector('[data-vsave="1"]'));
t('two contacts offer a save all', !!body.querySelector('[data-vsaveall]'));
t('the menu carries the visit actions',
  !!body.querySelector('[data-closeout="a1"]') && !!body.querySelector('[data-move="a1"]') &&
  !!body.querySelector('[data-cancel="a1"]'));
t('a live visit offers no reopen', !body.querySelector('[data-reopen]'));

w.closeVisitMenu();
t('closing the menu closes it', !$('vmdlg').hasAttribute('open'));

w.openVisitMenu('a2');
t('a settled visit offers reopen', !!$('vmBody').querySelector('[data-reopen="a2"]'));
t('a settled visit offers no close out', !$('vmBody').querySelector('[data-closeout]'));
t('one contact offers no save all', !$('vmBody').querySelector('[data-vsaveall]'));
w.closeVisitMenu();

// ---------- 4. tapping a card ----------
let went = null;
const realGo = w.go;
w.eval('window.__go = go');
w.go = (n)=>{ went = n; };

// a settled visit with no call must not reopen itself
w.eval('APPTS[1].callId = null');
await w.openVisit('a2');
t('tapping a settled visit does not restart it', g("APPTS[1].status") === 'done');
t('tapping a settled visit with no call goes nowhere', went === null);

// a settled visit that produced a call opens it
await w.callsPut({id:'cx', rectype:'call', customer:'Hazeldenes', date:'18-09-2026',
  type:'Site call', contacts:[], entries:[], loose:[], closed:true, status:'done'});
w.eval("APPTS[1].callId = 'cx'");
await w.openVisit('a2');
t('tapping a settled visit with a call opens it', g('call') && g('call.id') === 'cx');
t('opening it still does not restart the visit', g("APPTS[1].status") === 'done');

w.go = realGo;

const errs = [];
w.addEventListener('error', e => errs.push(e.message));
t('no errors raised during the run', errs.length === 0);

console.log('\nPASS ' + pass);
if(fails.length){ console.log('\nFAIL ' + fails.length); fails.forEach(f => console.log('  x ' + f)); }
process.exit(fails.length ? 1 : 0);
