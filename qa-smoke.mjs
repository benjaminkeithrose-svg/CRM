import { JSDOM } from 'jsdom';
import fs from 'fs';
import 'fake-indexeddb/auto';

const errs=[];
const dom = new JSDOM(fs.readFileSync('index.html','utf8'), {runScripts:'dangerously', url:'https://example.org/'});
const w=dom.window, d=w.document;
w.indexedDB=indexedDB; w.IDBKeyRange=IDBKeyRange;
w.scrollTo=()=>{}; w.alert=()=>{}; w.confirm=()=>true;
w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
w.navigator.storage={persist:async()=>true,persisted:async()=>true};
w.URL.createObjectURL=()=>'blob:stub'; w.URL.revokeObjectURL=()=>{};
if(!w.HTMLElement.prototype.showModal) w.HTMLElement.prototype.showModal=function(){this.setAttribute('open','')};
if(!w.HTMLElement.prototype.close) w.HTMLElement.prototype.close=function(){this.removeAttribute('open')};
w.HTMLCanvasElement.prototype.getContext=()=>null;
w.console.error=(...a)=>errs.push(a.join(' '));
for(const f of ['zones.js','manuals.js','healthlib.js','app.js']){
  const el=d.createElement('script'); el.textContent=fs.readFileSync(f,'utf8'); d.body.appendChild(el);
}
d.dispatchEvent(new w.Event('DOMContentLoaded'));
await new Promise(r=>setTimeout(r,500));

const g=e=>w.eval('('+e+')');
const bad=[];
// walk every screen the way the user would, with and without a call open
const screens=[...d.querySelectorAll('.scr')].map(s=>s.id.slice(2));
for(const s of screens){ try{ w.showScreen(s); }catch(e){ bad.push('showScreen('+s+'): '+e.message); } }
w.__t={id:'c9',customer:'Acme',date:'01/09/2026',type:'Site call',mgr:'B',site:'',contacts:[{name:'X',crm:true}],
  entries:[],loose:[],closed:false,updated:Date.now(),status:'in progress'};
w.eval('call = window.__t');
for(const s of screens){ try{ w.showScreen(s); }catch(e){ bad.push('with call, showScreen('+s+'): '+e.message); } }
w.__t=Object.assign({},w.__t,{id:'q9',rectype:'quote',reqby:'soon'});
w.eval('call = window.__t');
for(const s of screens){ try{ w.showScreen(s); }catch(e){ bad.push('with quote, showScreen('+s+'): '+e.message); } }
// every [data-go] tile must resolve to a handler without throwing
for(const b of d.querySelectorAll('[data-go]')){
  try{ b.click(); }catch(e){ bad.push('tile '+b.dataset.go+': '+e.message); }
}
await new Promise(r=>setTimeout(r,300));
const real=errs.filter(e=>!/Not implemented|Could not parse CSS|zones\.js/i.test(e));
console.log('screens walked:', screens.length);
console.log(bad.length? 'THROWN:\n  '+bad.join('\n  ') : 'no exceptions walking any screen in either mode');
console.log(real.length? 'console.error:\n  '+real.slice(0,10).join('\n  ') : 'no console errors');
process.exit(bad.length||real.length?1:0);
