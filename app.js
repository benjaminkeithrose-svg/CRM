/* Field CRM - offline PWA
   Plan a visit, do the visit, keep the record against the account.
   State lives in IndexedDB. Nothing leaves the device unless shared.

   Storage names are load-bearing: GitHub Pages puts every repo on one
   origin, so this app shares an origin with the live Belt Call Log.
   Database 'fieldcrm', cache prefix 'fieldcrm-', localStorage 'fcrm.'.
   Never the beltcall names - that is the other app's data. */

const DB_NAME = 'fieldcrm', DB_VER = 5;
const LS = k => 'fcrm.' + k;
let db, dbReady = null, REF = null, call = null, screen = 'home', photoTarget = null;
/* Set while the account and contacts screens are being used to raise a quote
   request rather than start a call. Cleared the moment the record is made. */
let quoteMode = false;

/* ---------- storage ---------- */
function openDB(){
  if(dbReady) return dbReady;
  dbReady = new Promise((res, rej) => {
    let r;
    try { r = indexedDB.open(DB_NAME, DB_VER); }
    catch(e){ rej(new Error('this browser is blocking local storage')); return; }
    r.onupgradeneeded = e => {
      const d = e.target.result;
      if(!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
      if(!d.objectStoreNames.contains('calls')) d.createObjectStore('calls', {keyPath:'id'});
      // v2: accounts move out of a single kv blob into their own store, keyed on
      // the CRM account name. 1,201 records is too much to rewrite wholesale on
      // every change, and the account view (step 6) reads them one at a time.
      if(!d.objectStoreNames.contains('accounts')) d.createObjectStore('accounts', {keyPath:'a'});
      // v3: the schedule. Owned by the desktop, sent to the phone as a plan file.
      if(!d.objectStoreNames.contains('appts')) d.createObjectStore('appts', {keyPath:'id'});
      // v4: tasks. Each sits on the calendar for 30 minutes on its date.
      if(!d.objectStoreNames.contains('tasks')) d.createObjectStore('tasks', {keyPath:'id'});
      // v5 (app v97): the Lists tile - saved notes and the Not stocked products list
      if(!d.objectStoreNames.contains('snippets')) d.createObjectStore('snippets', {keyPath:'id'});
      if(!d.objectStoreNames.contains('products')) d.createObjectStore('products', {keyPath:'id'});
    };
    r.onsuccess = e => { db = e.target.result; res(db); };
    r.onerror = () => rej(r.error || new Error('the database would not open'));
    r.onblocked = () => rej(new Error('another copy of this app is open - close it and reopen'));
  });
  dbReady.catch(() => { dbReady = null; });   // let the next attempt try again
  return dbReady;
}
async function ready(){
  if(db) return db;
  await openDB();
  if(!db) throw new Error('local storage unavailable');
  return db;
}
async function kvGet(k){
  const d = await ready();
  return new Promise((res,rej)=>{
    const t = d.transaction('kv','readonly').objectStore('kv').get(k);
    t.onsuccess = ()=>res(t.result); t.onerror = ()=>rej(t.error);
  });
}
async function kvSet(k,v){
  const d = await ready();
  await new Promise((res,rej)=>{
    const t = d.transaction('kv','readwrite').objectStore('kv').put(v,k);
    t.onsuccess = ()=>res(); t.onerror = ()=>rej(t.error);
  });
  if(CLOUD_KV[k]) cloudMark(CLOUD_KV[k]);    // reference data changed: cloud sync sends it
}
async function callsPut(c){
  const d = await ready();
  await new Promise((res,rej)=>{
    const t = d.transaction('calls','readwrite').objectStore('calls').put(c);
    t.onsuccess = ()=>res(); t.onerror = ()=>rej(t.error);
  });
  cloudMarkRec('calls', c.id, c.updated);       // cloud sync sends it
}
async function callsDel(id){
  const d = await ready();
  await new Promise((res,rej)=>{
    const t = d.transaction('calls','readwrite').objectStore('calls').delete(id);
    t.onsuccess = ()=>res(); t.onerror = ()=>rej(t.error);
  });
  cloudMarkRec('calls', id, Date.now(), true);  // and the delete reaches the other devices
}
async function accAll(){
  const d = await ready();
  return new Promise((res,rej)=>{
    const t = d.transaction('accounts','readonly').objectStore('accounts').getAll();
    t.onsuccess = ()=>res(t.result||[]); t.onerror = ()=>rej(t.error);
  });
}
// One transaction for the whole book. Opening 1,201 of them is the difference
// between a second and a minute on a phone.
async function accReplaceAll(list){
  const d = await ready();
  return new Promise((res,rej)=>{
    const tx = d.transaction('accounts','readwrite'), st = tx.objectStore('accounts');
    st.clear();
    for(const a of list) st.put(a);
    tx.oncomplete = ()=>res(); tx.onerror = ()=>rej(tx.error); tx.onabort = ()=>rej(tx.error);
  }).then(() => { cloudMark('crm'); });
}
async function accMerge(list){
  const d = await ready();
  return new Promise((res,rej)=>{
    const tx = d.transaction('accounts','readwrite'), st = tx.objectStore('accounts');
    for(const a of list) st.put(a);
    tx.oncomplete = ()=>res(); tx.onerror = ()=>rej(tx.error); tx.onabort = ()=>rej(tx.error);
  }).then(() => { cloudMark('crm'); });
}
async function apptsAll(){
  const d = await ready();
  return new Promise((res,rej)=>{
    const t = d.transaction('appts','readonly').objectStore('appts').getAll();
    t.onsuccess = ()=>res(t.result||[]); t.onerror = ()=>rej(t.error);
  });
}
async function apptsPut(ap){
  const d = await ready();
  await new Promise((res,rej)=>{
    const t = d.transaction('appts','readwrite').objectStore('appts').put(ap);
    t.onsuccess = ()=>res(); t.onerror = ()=>rej(t.error);
  });
  cloudMarkRec('appts', ap.id, ap.touchedAt);
}
async function apptsDel(id){
  const d = await ready();
  await new Promise((res,rej)=>{
    const t = d.transaction('appts','readwrite').objectStore('appts').delete(id);
    t.onsuccess = ()=>res(); t.onerror = ()=>rej(t.error);
  });
  cloudMarkRec('appts', id, Date.now(), true);
}
async function tasksAll(){
  const d = await ready();
  return new Promise((res,rej)=>{
    const t = d.transaction('tasks','readonly').objectStore('tasks').getAll();
    t.onsuccess = ()=>res(t.result||[]); t.onerror = ()=>rej(t.error);
  });
}
async function tasksPut(task){
  const d = await ready();
  await new Promise((res,rej)=>{
    const t = d.transaction('tasks','readwrite').objectStore('tasks').put(task);
    t.onsuccess = ()=>res(); t.onerror = ()=>rej(t.error);
  });
  cloudMarkRec('tasks', task.id, task.updated);
}
async function tasksDel(id){
  const d = await ready();
  await new Promise((res,rej)=>{
    const t = d.transaction('tasks','readwrite').objectStore('tasks').delete(id);
    t.onsuccess = ()=>res(); t.onerror = ()=>rej(t.error);
  });
  cloudMarkRec('tasks', id, Date.now(), true);
}
/* Saved notes and products (v97) are plain records like tasks: one store
   each, the change marked for cloud sync on every write. */
async function storeAll(name){
  const d = await ready();
  return new Promise((res,rej)=>{
    const t = d.transaction(name,'readonly').objectStore(name).getAll();
    t.onsuccess = ()=>res(t.result||[]); t.onerror = ()=>rej(t.error);
  });
}
async function storePut(name, rec){
  const d = await ready();
  await new Promise((res,rej)=>{
    const t = d.transaction(name,'readwrite').objectStore(name).put(rec);
    t.onsuccess = ()=>res(); t.onerror = ()=>rej(t.error);
  });
  cloudMarkRec(name, rec.id, rec.updated);
}
async function storeDel(name, id){
  const d = await ready();
  await new Promise((res,rej)=>{
    const t = d.transaction(name,'readwrite').objectStore(name).delete(id);
    t.onsuccess = ()=>res(); t.onerror = ()=>rej(t.error);
  });
  cloudMarkRec(name, id, Date.now(), true);
}
const snippetsAll = () => storeAll('snippets'), snippetsPut = r => storePut('snippets', r), snippetsDel = id => storeDel('snippets', id);
const productsAll = () => storeAll('products'), productsPut = r => storePut('products', r), productsDel = id => storeDel('products', id);
async function recordsAll(){
  const d = await ready();
  return new Promise((res,rej)=>{
    const t = d.transaction('calls','readonly').objectStore('calls').getAll();
    t.onsuccess = ()=>res(t.result||[]); t.onerror = ()=>rej(t.error);
  });
}
/* Calls and quote requests share the 'calls' store, so backup, restore and the
   device merge keep working untouched. They are told apart by rectype, and this
   is the only place that filter lives.

   Not 'kind'. The old GitHub call sync (removed in v78) overwrote 'kind' on the
   way out and stripped it on the way back, so a quote marked that way returned
   as an ordinary call, landed in Reports and reset the account's cadence. Call
   files and backups from that time still carry 'kind', so it stays off-limits.

   Everything downstream reads callsAll(), so anything that has not been told
   about quote requests excludes them. That is the safe answer, and it is the
   default rather than something each of the twenty-odd call sites has to
   remember. */
const QUOTE = 'quote';
function isQuote(r){ return !!r && r.rectype === QUOTE; }
async function callsAll(){  return (await recordsAll()).filter(r => !isQuote(r)); }
async function quotesAll(){ return (await recordsAll()).filter(isQuote); }

/* ---------- helpers ---------- */
const $ = id => document.getElementById(id);
const esc = s => String(s==null?'':s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function toast(msg){
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(()=>t.classList.remove('show'), 2200);
}
function todayISO(){
  const d = new Date(), p = n => (n<10?'0':'')+n;
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
}
function ddmmyyyy(iso){
  if(!iso) return '';
  const p = iso.split('-'); return p[2]+'/'+p[1]+'/'+p[0];
}
function saveCall(){
  if(!call) return;
  call.updated = Date.now();
  // keep the account history index in step, so the account view is right the
  // moment you come back out of a call rather than after the next home render
  const list = CALLS_BY_ACCT.get(call.customer);
  if(list){
    const i = list.findIndex(c => c.id === call.id);
    if(i >= 0) list[i] = call; else list.unshift(call);
  } else if(call.customer){
    CALLS_BY_ACCT.set(call.customer, [call]);
  }
  // a quote request on the calendar follows its record (v86)
  if(isQuote(call)) return callsPut(call).then(r => loadQuotes().then(() => r));
  return callsPut(call);
}

/* ---------- zones ---------- */
/* Lookup order is account override -> spelling correction -> suburb table -> Z12,
   and an override wins outright. suburbOf() is a line-for-line port of the build
   script's Python and must stay that way; if the two drift the zone map and the
   app disagree about where a site is. ZONE_DATA ships in zones.js and carries
   geography only. The overrides and the spelling map contain customer account
   names, so they live in IndexedDB and are loaded from a file that never enters
   the repository. */
const ZONES = (typeof ZONE_DATA !== 'undefined' && ZONE_DATA.zones) ? ZONE_DATA.zones : {};
const ZONE_ORDER = (typeof ZONE_DATA !== 'undefined' && ZONE_DATA.zoneOrder) ? ZONE_DATA.zoneOrder : Object.keys(ZONES);
const SUB2ZONE = {};
/* Known fault carried over from the planner: SUB2ZONE is built in zone order and
   the later zone wins, so ST. KILDA is claimed by Z19 and then taken by Z7. A new
   unpinned St Kilda account lands in whichever is last. Not fixed here - it needs
   a decision about which zone owns the suburb, not a code change. */
ZONE_ORDER.forEach(z => (ZONES[z] ? ZONES[z].subs : []).forEach(x => SUB2ZONE[x.toUpperCase()] = z));

let OVERRIDES = {acctZone:{}, spelling:{}, loaded:null};

function titleCase(s){ return s.toLowerCase().replace(/\b[a-z]/g, m => m.toUpperCase()); }
function suburbOf(name){
  const n = String(name).replace(/\u00a0/g,' ').trim();
  const parts = n.split(/\s-\s*|\s*-\s/);
  if(parts.length === 1) return null;
  return parts[parts.length-1].replace(/\(.*?\)/g,'').trim().toUpperCase();
}
function zoneOf(acctName, sub){
  if(OVERRIDES.acctZone[acctName]) return OVERRIDES.acctZone[acctName];   // overrides win outright
  if(!sub) return 'Z12';
  const canon = (OVERRIDES.spelling[sub] || titleCase(sub)).toUpperCase();
  return SUB2ZONE[canon] || SUB2ZONE[sub] || 'Z12';
}
function zoneName(z){ return ZONES[z] ? (z + ' ' + ZONES[z].name) : (z || 'unzoned'); }
/* CAMBRIDGE NZ resolves to Z24 Tasmania and PICTON NZ to Z1 Sydney, because the
   suburb name matches an Australian one and nothing in the lookup knows about the
   country. Both are wrong answers rather than near misses. Rather than guess, the
   import counts them and says so, so they can be pinned with an override. */
function looksNZ(sub, zone){
  if(!sub) return false;
  if(!/\bNZ\b|NEW ZEALAND/.test(sub)) return false;
  const z = ZONES[zone];
  return !z || !/NZ|NEW ZEALAND/i.test(z.cov || '');
}

/* ---------- contact ranking ---------- */
/* The Job Role picklist in the export's hiddenSheet is authoritative and holds 17
   values. The planner ranked 9 of them; the other 8 fell to 99 and sorted below a
   blank role, which put Hygienic / Sanitation - someone you want on a belt call -
   at the bottom of every contact list. The full picklist is ranked here. The nine
   the planner already ranked keep their order relative to each other; the eight
   new ones are slotted around them. Order matters: engineer - packaging is tested
   before engineer, or it never matches. */
const RANK_RULES = [
  [/engineer\s*[-\/]\s*packaging/, 8],
  [/maintenance/, 1],
  [/plant\s*manager/, 2],
  [/engineer/, 3],
  [/operations|production/, 4],
  [/hygien|sanitation/, 5],
  [/purchasing/, 6],
  [/project\s*manager/, 7],
  [/quality\s*assurance|\bqa\b|compliance/, 9],
  [/c-?suite|president|owner/, 10],
  [/product\s*manager/, 11],
  [/research|development|\br\s*&\s*d\b/, 12],
  [/consultant|contractor/, 13],
  [/sales/, 14],
  [/marketing/, 15],
  [/accounting/, 16],
  [/unknown/, 17]
];
function roleRank(r){
  const s = String(r||'').toLowerCase();
  for(const [re,n] of RANK_RULES) if(re.test(s)) return n;
  return 99;
}

/* ---------- phone ---------- */
/* The planner handled +61 and 61 only, so every New Zealand mobile fell through to
   'check' and printed exactly as stored. NZ is handled here, but only when the
   source carried an explicit +64 or 64 prefix. A bare 021... is ambiguous - it is
   a valid NZ mobile and a valid Australian Sydney landline - and guessing would
   reformat Australian numbers wrongly. Ambiguous numbers still return 'check'. */
function normPhone(v){
  const s = String(v==null?'':v).trim();
  if(!s) return ['','none'];
  let t = s.replace(/[\s()\-\.]/g,'');
  let nz = false;
  if(t.startsWith('+64')){ nz = true; t = '0'+t.slice(3); }
  else if(t.startsWith('0064')){ nz = true; t = '0'+t.slice(4); }
  else if(/^64[23479]/.test(t) && t.length > 9){ nz = true; t = '0'+t.slice(2); }
  else if(t.startsWith('+61')) t = '0'+t.slice(3);
  else if(t.startsWith('61') && t.length > 10) t = '0'+t.slice(2);
  if(nz){
    if(/^02\d{7,8}$/.test(t)) return [t.slice(0,3)+' '+t.slice(3,6)+' '+t.slice(6), 'mobile'];
    if(/^0\d{7,8}$/.test(t))  return [t.slice(0,2)+' '+t.slice(2,5)+' '+t.slice(5), 'landline'];
    return [s, 'check'];
  }
  if(/^\d{10}$/.test(t)){
    if(t.startsWith('04')) return [t.slice(0,4)+' '+t.slice(4,7)+' '+t.slice(7), 'mobile'];
    return ['('+t.slice(0,2)+') '+t.slice(2,6)+' '+t.slice(6), 'landline'];
  }
  return [s, 'check'];
}

/* ================= belt reference data =================
   Ported from Belt Call Log v13. Reads Plant_Audit_Template_1.xlsm and keeps the
   catalogue in kv under beltref: every valid Series > Style > Material > Colour,
   the link geometry the width check needs, and the sprocket table. */

/* ---------- belt reference import ----------
   Read straight out of Plant_Audit_Template_1.xlsm so the app stays in step with the
   workbook rather than carrying its own copy of the catalogue. Three sheets matter:

     Belt Audit Data      Series_Ind / Belt_Style_Ind / Material_Ind / COLOR_IND
                          -> every valid Series > Style > Material > Colour combination
                          Series_Ind / Belt_Style_Ind / Material_Ind / Current_Lnk_Wth_Mm /
                          Belt_Link_Increment / Minimum_Width_In_L / Protrusion_Thk_Mm
                          -> link geometry, which is what makes the width check possible
     SPROCKET SPILL DATA  Belt Series / Bore Description / Size Description / Material /
                          Description / Part Number
     BELT DATA            Series + Pitch, and the master lists the FORM sheet validates against

   Both blocks on 'Belt Audit Data' repeat the same three header names, so columns are found
   relative to an anchor that appears once (COLOR_IND, Current_Lnk_Wth_Mm, Belt Series) rather
   than by a bare name lookup, which would silently pick up the wrong block. */
const REF_SHEETS = ['Belt Audit Data','SPROCKET SPILL DATA','BELT DATA'];
const norm = s => String(s==null?'':s).replace(/\s+/g,' ').trim().toLowerCase();
const cell = v => (v==null ? '' : String(v).trim());
const num  = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

function findSheet(wb, want){
  if(wb.Sheets[want]) return wb.Sheets[want];
  const k = wb.SheetNames.find(n => norm(n) === norm(want));
  if(!k) throw new Error('sheet "'+want+'" is not in that workbook');
  return wb.Sheets[k];
}
function headerRow(rows, anchor){
  for(let i=0; i<Math.min(rows.length, 8); i++){
    if((rows[i]||[]).some(v => norm(v) === anchor)) return i;
  }
  throw new Error('could not find the "'+anchor+'" column');
}
function colAt(H, name, anchor, dir){
  const t = norm(name);
  if(dir < 0){ for(let i=anchor-1; i>=0; i--) if(H[i]===t) return i; }
  else { for(let i=anchor+1; i<H.length; i++) if(H[i]===t) return i; }
  throw new Error('could not find the "'+name+'" column');
}
function colOf(H, name){
  const i = H.indexOf(norm(name));
  if(i < 0) throw new Error('could not find the "'+name+'" column');
  return i;
}
function uniqSort(arr){
  return [...new Set(arr.filter(x => x !== '' && x != null))].sort((a,b)=>{
    const na = Number(a), nb = Number(b);
    const A = a !== '' && !isNaN(na), B = b !== '' && !isNaN(nb);
    if(A && B) return na - nb;
    if(A) return -1;
    if(B) return 1;
    return String(a).localeCompare(String(b));
  });
}

async function importRef(file){
  toast('Reading workbook - this takes a moment...');
  await new Promise(r => setTimeout(r, 60));     // let the toast paint before we block the thread
  const buf = await file.arrayBuffer();
  const opts = {type:'array', cellStyles:false, cellNF:false, cellHTML:false, cellFormula:false};
  let wb = XLSX.read(buf, Object.assign({sheets:REF_SHEETS}, opts));
  if(!REF_SHEETS.every(n => wb.SheetNames.includes(n) && wb.Sheets[n])) wb = XLSX.read(buf, opts);
  const grid = ws => XLSX.utils.sheet_to_json(ws, {header:1, raw:true, blankrows:true, defval:''});

  /* combinations and link geometry */
  const bad = grid(findSheet(wb, 'Belt Audit Data'));
  const bh = headerRow(bad, 'color_ind');
  const BH = (bad[bh]||[]).map(norm);
  const cCol = colOf(BH, 'COLOR_IND');
  const cSer = colAt(BH, 'Series_Ind', cCol, -1);
  const cSty = colAt(BH, 'Belt_Style_Ind', cCol, -1);
  const cMat = colAt(BH, 'Material_Ind', cCol, -1);
  const gLw  = colOf(BH, 'Current_Lnk_Wth_Mm');
  const gSer = colAt(BH, 'Series_Ind', gLw, -1);
  const gSty = colAt(BH, 'Belt_Style_Ind', gLw, -1);
  const gMat = colAt(BH, 'Material_Ind', gLw, -1);
  const gInc = colAt(BH, 'Belt_Link_Increment', gLw, 1);
  const gMin = colAt(BH, 'Minimum_Width_In_L', gLw, 1);
  const gPro = colAt(BH, 'Protrusion_Thk_Mm', gLw, 1);
  if(gSer === cSer) throw new Error('the geometry block on "Belt Audit Data" is missing');

  const combos = [], geom = [];
  for(let i=bh+1; i<bad.length; i++){
    const r = bad[i] || [];
    if(cell(r[cSer])) combos.push([cell(r[cSer]), cell(r[cSty]), cell(r[cMat]), cell(r[cCol])]);
    if(cell(r[gSer])) geom.push([cell(r[gSer]), cell(r[gSty]), cell(r[gMat]),
      num(r[gLw]), num(r[gInc]) || 1, num(r[gMin]), num(r[gPro])]);
  }

  /* sprockets */
  const spl = grid(findSheet(wb, 'SPROCKET SPILL DATA'));
  const sh = headerRow(spl, 'belt series');
  const SH = (spl[sh]||[]).map(norm);
  const sSer = colOf(SH, 'Belt Series');
  const sBor = colAt(SH, 'Bore Description', sSer, 1);
  const sPd  = colAt(SH, 'Size Description', sSer, 1);
  const sMat = colAt(SH, 'Material', sSer, 1);
  const sDsc = colAt(SH, 'Description', sSer, 1);
  const sPn  = colAt(SH, 'Part Number', sSer, 1);
  const sprockets = [];
  for(let i=sh+1; i<spl.length; i++){
    const r = spl[i] || [];
    if(!cell(r[sSer])) continue;
    sprockets.push([cell(r[sSer]), cell(r[sBor]), cell(r[sPd]), cell(r[sMat]), cell(r[sDsc]), cell(r[sPn])]);
  }

  /* master lists and per-series pitch */
  const bd = grid(findSheet(wb, 'BELT DATA'));
  const dh = headerRow(bd, 'rod material');
  const DH = (bd[dh]||[]).map(norm);
  const dSer = colOf(DH, 'Series'), dPit = colOf(DH, 'Pitch');
  const dMat = colOf(DH, 'Material'), dCol = colOf(DH, 'Colour');
  const dRod = colOf(DH, 'Rod Material'), dFlt = colOf(DH, 'Flight Style');
  const dSg  = colOf(DH, 'Sideguard Style'), dInd = colOf(DH, 'Indent');

  const pitch = {}, materials = [], colours = [], rods = [], flightTypes = [], sideguardTypes = [];
  const indentGroups = [];
  for(let i=dh+1; i<bd.length; i++){
    const r = bd[i] || [];
    const s = cell(r[dSer]);
    if(/^series[_ ]/i.test(s)){
      const p = num(r[dPit]);
      if(p > 0) pitch[s.replace(/^series[_ ]/i,'')] = p;
    }
    if(cell(r[dMat])) materials.push(cell(r[dMat]));
    if(cell(r[dCol])) colours.push(cell(r[dCol]));
    if(cell(r[dRod])) rods.push(cell(r[dRod]));
    if(cell(r[dFlt])) flightTypes.push(cell(r[dFlt]));
    if(cell(r[dSg]))  sideguardTypes.push(cell(r[dSg]));
    const iv = cell(r[dInd]);
    if(iv){
      const head = iv.match(/^-{2,}\s*(.+?)\s*-{2,}$/);
      if(head) indentGroups.push([head[1], []]);
      else if(indentGroups.length) indentGroups[indentGroups.length-1][1].push(iv);
    }
  }

  if(!combos.length) throw new Error('no belt combinations found - check the workbook is the right one');
  if(!sprockets.length) throw new Error('no sprocket rows found on "SPROCKET SPILL DATA"');

  const payload = {
    combos, geom, sprockets, pitch, indentGroups,
    materials, colours, rods, flightTypes, sideguardTypes,
    imported: Date.now(),
    counts: {combos:combos.length, geom:geom.length, sprockets:sprockets.length,
             series:new Set(combos.map(c=>c[0])).size}
  };
  await kvSet('beltref', payload);
  await logLoad(file.name || 'plant audit workbook', 'beltref',
    payload.combos.length + ' belt combinations, ' + payload.sprockets.length + ' sprocket rows');
  REF = payload;
  renderRefStat(); renderHomeSetup(); buildBeltRef();
  toast('Loaded '+payload.counts.combos+' belt specs and '+payload.counts.sprockets+' sprockets');
}
function renderRefStat(){
  const el = $('refStat');
  if(!el) return;
  if(!REF){ el.textContent = 'No data loaded.'; return; }
  const d = new Date(REF.imported);
  el.innerHTML = '<b>'+REF.counts.combos+'</b> belt specs across <b>'+REF.counts.series+'</b> series, <b>'+
    REF.counts.sprockets+'</b> sprockets, <b>'+REF.counts.geom+'</b> geometry rows<br>Imported '+
    d.toLocaleDateString()+' '+d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
}
function renderManStat(){
  const el = $('manStat');
  if(!el || !window.Manuals) return;
  Manuals.statusHTML().then(h=>{
    el.innerHTML = h;
    el.querySelectorAll('[data-delman]').forEach(b=>b.addEventListener('click', async ()=>{
      const id = b.dataset.delman;
      if(!confirm('Remove the '+id+' manual and all of its stored pages from this device?')) return;
      try { await Manuals.deleteManual(id); toast('Manual removed'); renderManStat(); renderManCount(); }
      catch(e){ console.error(e); toast('Could not remove it: '+e.message); }
    }));
  }).catch(e=>{ el.textContent = 'Could not read the manual library - '+e.message; });
}
function renderManCount(){
  const el = $('manInfo');
  if(!el) return;
  if(!window.Manuals){ el.textContent = 'Not available'; return; }
  Manuals.listManuals()
    .then(list => { el.textContent = list.length
      ? list.length + ' manual' + (list.length===1?'':'s') + ' loaded'
      : 'Nothing loaded'; })
    .catch(() => { el.textContent = 'Nothing loaded'; });
}

function renderHomeSetup(){
  const el = $('homeSetup');
  if(!el) return;
  const missing = [];
  if(!ACCOUNTS.length) missing.push('contact database');
  if(!REF) missing.push('belt reference data');
  if(!missing.length){ el.className = 'msg'; el.innerHTML = ''; return; }
  el.className = 'msg info show';
  el.innerHTML = 'No '+missing.join(' or ')+' loaded yet. <span class="lnk" data-go="settings">open Settings to import it</span>';
}

/* ================= the plant audit register =================

   Not the same thing as the belt reference data, and the two are easy to
   confuse. The reference workbook is a CATALOGUE - which belts exist and what
   goes with what. This is a REGISTER - which belts are actually installed, by
   Intralox asset number.

   It is customer data: asset numbers against named plants. It never enters the
   repository and never travels in the GitHub appointment sync. It is reloaded
   whenever it is refreshed, and a reload replaces it wholesale rather than
   merging, because a refresh is the whole file.

   The point of it: type 61-201 on the belt form and every spec field fills, so
   the only things left to add are the condition and the photos. */

const ASSET_COLS = {
  asset:'Intralox Asset Number', oracle:'Oracle Account Number', desc:'Application Description',
  series:'Belt Series', style:'Belt Style', material:'Belt Material', colour:'Belt Colour',
  rod:'Rod Material', cvlen:'Conveyor Length (m)', frame:'Inside Frame Width (mm)',
  width:'Belt Width (mm)', beltlen:'Belt Length (m)',
  sprpd:'Sprocket Pitch Diameter', sprbore:'Sprocket Bore', sprmat:'Sprocket Material',
  sprdesc:'Sprocket Description', sprpn:'Sprocket Part Number',
  sprdrive:'Sprocket Drive QTY', spridle:'Sprocket Idle QTY',
  indent:'Indent (mm)', notch:'Centre Notch (mm)',
  fltype:'Flight Type', flmat:'Flight Material', flheight:'Flight Height (mm)',
  flspacing:'Flight Spacing (mm)',
  sgtype:'Sideguard Type', sgmat:'Sideguard Material', sgheight:'Sideguard Height (mm)',
  condition:'Belt Condition', elong:'Elongation (%)'
};

/* The sheet uses a literal 0 as a filler for "nothing here" - Flight Type 0,
   Sideguard Material 0, Belt Condition 0. Treating that as a value would put a
   zero into the flight type picker. So 0 and '0' mean not recorded, for every
   column, and a genuinely zero indent is indistinguishable from a blank one -
   which is the sheet's limitation, not something the app can invent around. */
function assetVal(v){
  if(v === null || v === undefined) return '';
  const s = String(v).trim();
  if(s === '' || s === '0') return '';
  // Excel float noise: 6.6499999999999995 is 6.65
  const n = Number(s);
  if(!isNaN(n) && /\./.test(s) && s.length > 6) return String(Math.round(n * 1000) / 1000);
  return s;
}
// 61-201, 61201 and "61-201 boning line 2" are the same asset
const assetNo = v => String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');

let ASSETS = null;

async function importAssets(file){
  toast('Reading the register...');
  const name = (file.name || '').toLowerCase();
  let rows = null, sheetUsed = '', sheetsSeen = [], headersSeen = [];

  if(name.endsWith('.csv')){
    rows = csvToObjects(await file.text());
    sheetUsed = 'csv';
    headersSeen = rows.length ? Object.keys(rows[0]) : [];
  } else {
    if(typeof XLSX === 'undefined')
      throw new Error('the spreadsheet library has not loaded. Open the app once with a ' +
        'connection, or save the register as .csv and load that.');
    const wb = XLSX.read(await file.arrayBuffer(), {type:'array'});
    sheetsSeen = wb.SheetNames.slice();
    /* Every sheet is searched, not just the first. A working copy of the master
       database can easily gain a cover sheet or a pivot in front of the data,
       and failing on that would be a silly reason to say the file is wrong. */
    for(const sn of wb.SheetNames){
      const r = XLSX.utils.sheet_to_json(wb.Sheets[sn], {defval:'', raw:false});
      if(!r.length) continue;
      const heads = Object.keys(r[0]);
      if(!headersSeen.length) headersSeen = heads;
      if(r.some(x => pick(x, ASSET_COLS.asset))){ rows = r; sheetUsed = sn; headersSeen = heads; break; }
    }
    if(!rows){
      /* No sheet carried the column. Fall back to the first sheet that has any
         rows at all, so the error can say what the file DOES contain - "no rows"
         and "wrong columns" are different problems and used to report the same. */
      for(const sn of wb.SheetNames){
        const r = XLSX.utils.sheet_to_json(wb.Sheets[sn], {defval:'', raw:false});
        if(r.length){ headersSeen = Object.keys(r[0]); sheetUsed = sn; rows = r; break; }
      }
    }
  }

  if(!rows || !rows.length){
    throw new Error('no rows could be read. Sheets in the file: ' +
      (sheetsSeen.join(', ') || 'none') + '.' +
      (headersSeen.length ? ' First columns seen: ' + headersSeen.slice(0,6).join(', ') + '.' : ''));
  }
  if(!rows.some(r => pick(r, ASSET_COLS.asset))){
    throw new Error('no "Intralox Asset Number" column. Looked in ' +
      (sheetsSeen.length ? sheetsSeen.join(', ') : 'the file') +
      '. The columns found were: ' + headersSeen.slice(0,10).join(', ') +
      (headersSeen.length > 10 ? ', and ' + (headersSeen.length-10) + ' more' : '') +
      '. The header row has to be the first row of the sheet.');
  }

  const map = {};
  let withData = 0, dupes = 0;
  for(const r of rows){
    const raw = pick(r, ASSET_COLS.asset);
    if(!raw) continue;
    const key = assetNo(raw);
    if(!key) continue;
    const rec = {no: String(raw).trim()};
    for(const [k, col] of Object.entries(ASSET_COLS)){
      if(k === 'asset') continue;
      const v = assetVal(pick(r, col));
      if(v) rec[k] = v;
    }
    // an asset number with nothing against it is a placeholder, not a belt
    rec.has = Object.keys(rec).length > 1;
    if(rec.has) withData++;
    if(map[key]){
      dupes++;
      map[key] = Array.isArray(map[key]) ? map[key].concat([rec]) : [map[key], rec];
    } else {
      map[key] = rec;
    }
  }
  if(!Object.keys(map).length)
    throw new Error('the "Intralox Asset Number" column is there but every row is empty');

  /* Which of the belt columns were actually recognised. If the register has been
     rebuilt with different headings, this is what says so - rather than loading
     a thousand asset numbers with nothing attached and looking like it worked. */
  const matched = Object.entries(ASSET_COLS).filter(([k]) => k !== 'asset')
    .filter(([, col]) => rows.some(r => pick(r, col) !== '')).length;

  ASSETS = {
    imported: Date.now(), file: file.name || 'master database', sheet: sheetUsed,
    rows: map,
    counts: {assets: Object.keys(map).length, withData: withData, dupes: dupes,
             columns: matched, ofColumns: Object.keys(ASSET_COLS).length - 1}
  };
  await kvSet('assets', ASSETS);
  renderAssetStat();
  renderHomeSetup();
  await logLoad(file.name || 'master database', 'assets',
    ASSETS.counts.assets + ' asset numbers, ' + withData + ' with belt data, ' +
    matched + ' of ' + ASSETS.counts.ofColumns + ' belt columns recognised' +
    (sheetUsed && sheetUsed !== 'csv' ? ' (sheet: ' + sheetUsed + ')' : '') +
    (dupes ? ', ' + dupes + ' duplicated' : ''));
  if(!withData){
    toast('Loaded ' + ASSETS.counts.assets + ' asset numbers, but none carry belt data');
  } else {
    toast(withData + ' assets with belt data loaded');
  }
}

function assetLookup(v){
  if(!ASSETS) return [];
  const k = assetNo(v);
  if(k.length < 3) return [];
  const hit = ASSETS.rows[k];
  if(hit) return Array.isArray(hit) ? hit : [hit];
  /* Typing carries on past the number - "61-201 boning line 2" - so a prefix
     match keeps working while the description is still being typed. */
  const near = [];
  for(const key of Object.keys(ASSETS.rows)){
    if(k.startsWith(key) && key.length >= 4){
      const r = ASSETS.rows[key];
      Array.isArray(r) ? near.push(...r) : near.push(r);
    }
  }
  return near;
}

function renderAssetStat(){
  const el = $('assetStat');
  if(!el) return;
  if(!ASSETS){ el.textContent = 'No register loaded.'; return; }
  const d = new Date(ASSETS.imported);
  const c = ASSETS.counts;
  el.innerHTML = '<b>'+c.withData+'</b> assets with belt data, of <b>'+c.assets+'</b> numbers<br>'+
    'Loaded '+esc(ASSETS.file)+
    (ASSETS.sheet && ASSETS.sheet !== 'csv' ? ' &middot; sheet '+esc(ASSETS.sheet) : '')+'<br>'+
    d.toLocaleDateString()+' '+d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})+
    (c.columns != null ? '<br>'+c.columns+' of '+c.ofColumns+' belt columns recognised' : '')+
    (!c.withData ? '<br><span class="flagline">No belt data came through. The asset numbers '+
      'loaded but none of the spec columns matched.</span>' : '')+
    (c.dupes ? '<br><span class="flagline">'+c.dupes+
      ' asset number'+(c.dupes===1?'':'s')+' appear more than once</span>' : '');
}
$('assetBtn').addEventListener('click', async ()=>{
  const f = $('assetFile').files[0];
  if(!f){ toast('Choose the master database first'); return; }
  try { await importAssets(f); }
  catch(e){ console.error(e); toast('Register import failed: '+e.message);
    await logLoad(f.name || 'master database', 'assets', e.message, true); }
});

/* ---------- filling the belt form from the register ---------- */
/* Offered, never automatic. The register is what was installed last time it was
   audited, and a line gets rebuilt without anyone updating a spreadsheet. One
   tap keeps you looking at what it filled in. */
let assetMatches = [];
function renderAssetMatch(){
  const el = $('bAssetHit');
  if(!el) return;
  assetMatches = assetLookup($('bAsset').value);
  if(!assetMatches.length){ showMsg(el, '', ''); return; }
  const withData = assetMatches.filter(r => r.has);
  if(!withData.length){
    showMsg(el, 'info', '<b>'+esc(assetMatches[0].no)+'</b> is in the register but has no belt '+
      'data against it yet.');
    return;
  }
  showMsg(el, 'ok', withData.map((r,i) =>
    '<b>'+esc(r.no)+'</b>' + (r.desc ? ' \u2014 '+esc(r.desc) : '') + '<br>' +
    esc([r.series && ('Series '+r.series), r.style, r.material, r.colour,
         r.width && (r.width+' mm'), r.beltlen && (r.beltlen+' m')]
        .filter(Boolean).join(' \u00b7 ')) +
    ' <span class="lnk" data-usea="'+i+'">Use this</span>').join('<hr style="border:0;border-top:1px solid var(--line-2);margin:8px 0">'));
  el.querySelectorAll('[data-usea]').forEach(b => b.addEventListener('click', ()=>{
    applyAssetRecord(withData[+b.dataset.usea]);
  }));
}
function applyAssetRecord(r, opts){
  opts = opts || {};
  const setVal = (id, v) => { const f = $(id); if(f && v){ if(f.tagName === 'SELECT') selEnsure(f, v); f.value = v; } };
  const missed = [];

  /* The belt cascade already has a function for this - the same one the "copy
     spec from a belt already logged" button uses. Setting the selects by hand
     skipped the change handlers, so the colour chips were still showing the
     previous belt's list and the colour silently failed to land. */
  setCascade(r.series || '', r.style || '', r.material || '', r.colour || '');
  if(r.series && serSel().value !== r.series) missed.push('series ' + r.series);
  if(r.style && stySel().value !== r.style) missed.push('style ' + r.style);
  if(r.material && !beltMat()) missed.push('material ' + r.material);
  // colour was being set and never checked, so a failure here said nothing
  // beltColour() reads Other as well as the chips, so a value carried across
  // into Other counts as landed - it is on the form and it will save
  if(r.colour && !beltColour()) missed.push('colour ' + r.colour);
  if(r.rod && !setChip('bRodChips', r.rod, 'bRodOther')) missed.push('rod ' + r.rod);

  setVal('bCvLen', r.cvlen); setVal('bFrame', r.frame);
  setVal('bWidth', r.width); setVal('bLen', r.beltlen);
  setVal('bNotch', r.notch);
  if(r.indent) setSelLoose('bIndent', r.indent);

  /* Sprockets are the awkward part. The register writes the pitch diameter as a
     code - SERIES_2400_PD_163mm_20T - while the reference data writes it as
     "6.4 in (163 mm) PD, 20T". Nothing matches on text, so the millimetres and
     the tooth count are pulled out of the code and matched on those.

     The bore is often blank in the register but is spelled out at the end of the
     sprocket description, so that is read as a fallback. Without a bore the
     pitch diameter list cannot populate at all. */
  let bore = r.sprbore || '';
  if(!bore && r.sprdesc){
    const m = String(r.sprdesc).match(/WITH\s+([\d.\/\s"]+(?:MM|IN|INCH)?)\s*(SQUARE|ROUND)\s*BORE/i);
    if(m) bore = (m[1].trim() + ' ' + m[2].toLowerCase()).replace(/\s+/g,' ').toLowerCase();
  }
  if(bore && !setSelLoose('bSprBore', bore)) missed.push('sprocket bore ' + bore);
  if($('bSprBore').value){
    onSprBore();
    if(r.sprpd){
      /* The register holds two formats side by side, depending on who typed the
         row: SERIES_400_PD_132mm_8T and "5.2 in (132 mm) PD, 8T". Rather than
         parse either shape, take the millimetres and the tooth count from
         wherever they appear and match the option on those two numbers. */
      const mm = String(r.sprpd).match(/(\d+)\s*mm/i);
      const tt = String(r.sprpd).match(/(\d+)\s*T\b/i);
      let ok = false;
      if(mm && tt){
        const want = [...$('bSprPd').options].find(o =>
          new RegExp('\\b' + mm[1] + '\\s*mm').test(o.value) &&
          new RegExp('\\b' + tt[1] + 'T\\b').test(o.value));
        if(want){ $('bSprPd').value = want.value; onSprPd(); ok = true; }
      }
      if(!ok) missed.push('pitch diameter ' + r.sprpd);
    }
    if(r.sprmat && $('bSprPd').value && !setSelLoose('bSprMat', r.sprmat)){
      missed.push('sprocket material');
    } else if($('bSprMat').value){ onSprMat(); }
  } else if(r.sprpd){
    missed.push('pitch diameter (no bore recorded against this asset)');
  }
  /* The description, part number and quantities are written last and on purpose:
     the pickers derive them, so setting them first would have them overwritten. */
  setVal('bSprDesc', r.sprdesc); setVal('bSprPn', r.sprpn);
  setVal('bSprDrive', r.sprdrive); setVal('bSprIdle', r.spridle);

  if(r.fltype && !setSelLoose('bFlType', r.fltype)) missed.push('flight type ' + r.fltype);
  setVal('bFlMat', r.flmat); setVal('bFlHeight', r.flheight); setVal('bFlMm', r.flspacing);
  if(r.sgtype && !setSelLoose('bSgType', r.sgtype)) missed.push('sideguard type ' + r.sgtype);
  setVal('bSgMat', r.sgmat); setVal('bSgHeight', r.sgheight);
  if(r.desc && !$('bDesc').value) $('bDesc').value = r.desc;

  try { runWidthCheck(); runFrameCheck(); } catch(e){}
  /* Say what did not fit rather than filling most of it and going quiet. A value
     the catalogue does not recognise usually means the register is ahead of the
     reference workbook, which is worth knowing. */
  /* Listing four values that "did not match" is useless when the real answer is
     that there was nothing to match them against. Name the actual cause. */
  let why = '';
  if(missed.length){
    const combos = (REF && REF.combos) ? REF.combos.length : 0;
    const seriesList = combos ? [...new Set(REF.combos.map(c => String(c[0])))] : [];
    if(!REF){
      why = '<b>No belt reference data is loaded</b>, so the series, style, material and ' +
        'sprocket pickers are empty and nothing can match. Load Plant_Audit_Template_1.xlsm ' +
        'under Data on the home screen. The measurements and descriptions above still filled.';
    } else if(!combos){
      why = '<b>The belt reference workbook loaded but no belt specs came out of it</b> (' +
        combos + ' combinations). It may be the wrong workbook, or its Belt Audit Data sheet ' +
        'has been rebuilt. Re-import it and check the count under Data.';
    } else if(r.series && !seriesList.includes(String(r.series))){
      why = '<b>Series ' + esc(r.series) + ' is not in the belt reference workbook</b>, which ' +
        'holds ' + seriesList.length + ' series. The register is ahead of the reference data - ' +
        'a fresh export of the reference workbook should fix it.';
    } else {
      why = '<b>' + missed.length + ' value' + (missed.length===1?'':'s') +
        ' did not match the reference data</b> and were left for you: ' +
        esc(missed.join(', ')) + '.';
    }
  }
  if(opts.quiet){
    showMsg($('bAssetHit'), missed.length ? 'warn' : '', missed.length ? why : '');
    return;
  }
  showMsg($('bAssetHit'), missed.length ? 'warn' : 'ok',
    missed.length ? 'Filled from the register. ' + why
                  : 'Filled from the register. Add the condition and photos.');
  toast('Filled from ' + r.no);
}
/* Reopening a logged belt reuses applyAssetRecord rather than duplicating it.
   That function already solves the awkward parts - the series cascade, matching
   a pitch diameter on millimetres and tooth count, falling back to the Other
   box when a value is not in the catalogue - and a second copy would drift from
   it the first time either is fixed. Entry field names are mapped onto the
   register names it expects. */
function fillBeltFromEntry(e){
  $('bAsset').value = e.asset || '';
  applyAssetRecord({
    no: e.asset, series: e.series, style: e.style, material: e.beltmat,
    colour: e.colour, rod: e.rodmat, cvlen: e.clength, frame: e.frame,
    width: e.width, beltlen: e.beltlen, notch: e.cnotch, indent: e.findent,
    sprbore: e.sprbore, sprpd: e.sprpd, sprmat: e.sprmat, sprdesc: e.sprocket,
    sprpn: e.sprpn, sprdrive: e.sprdrive, spridle: e.spridle,
    fltype: e.fstyle, flmat: e.flmat, flheight: e.fheight, flspacing: e.fspacing,
    sgtype: e.sgtype, sgmat: e.sgmat, sgheight: e.sgheight, desc: e.beltdesc
  }, {quiet:true});

  /* Fields applyAssetRecord does not carry, because the register has no column
     for them. */
  $('bDesc').value = e.beltdesc || '';
  $('bQc').value = e.qcontact || '';
  $('bQty').value = e.qty || '';
  $('bComment').value = e.comment || '';
  loadShots('belt', []);   // stored photos stay on the entry; the buffer is for new ones
  $('bTsg').checked = !!e.tsg;
  applyBeltQuoteFields();
  bRetroVal = e.retrofit || '';
  document.querySelectorAll('#bRetro button').forEach(x =>
    x.classList.toggle('on', !!bRetroVal && x.dataset.v === bRetroVal));

  const hasSpr = !!(e.sprbore || e.sprpd || e.sprocket);
  $('bSkipSpr').checked = !hasSpr;
  $('bSprBody').classList.toggle('hide', !hasSpr);
  $('bSprSpacers').checked = !!e.sprspacers;
  $('bSprHdRet').checked = !!e.sprhdret;
  try { updateSprExtras(); } catch(err){}
  if(e.sprvar && !$('bSprVarWrap').classList.contains('hide')) $('bSprVar').value = e.sprvar;

  const hasAcc = !!(e.fstyle || e.flmat || e.fheight || e.sgtype || e.sgmat);
  $('bSkipAcc').checked = !hasAcc;
  $('bAccBody').classList.toggle('hide', !hasAcc);
  $('bFlRows').value = e.frows || '';

  /* The description and part number are derived by the sprocket pickers, so they
     are written last and flagged as touched - otherwise the next change to an
     adjacent field silently overwrites what was logged. */
  if(e.sprocket){ $('bSprDesc').value = e.sprocket; sprDescTouched = true; $('bSprDescAuto').classList.add('off'); }
  if(e.sprpn){ $('bSprPn').value = e.sprpn; sprPnTouched = true; $('bSprPnAuto').classList.add('off'); }
  if(e.sprdrive){ $('bSprDrive').value = e.sprdrive; sprDriveTouched = true; $('bSprDrvAuto').classList.add('off'); }
  if(e.spridle){ $('bSprIdle').value = e.spridle; sprIdleTouched = true; $('bSprIdlAuto').classList.add('off'); }
  if(e.beltlen){ $('bLen').value = e.beltlen; lenTouched = true; $('bLenAuto').classList.add('off'); }
  if(e.flmat){ selEnsure($('bFlMat'), e.flmat); $('bFlMat').value = e.flmat; flMatTouched = true; $('bFlMatAuto').classList.add('off'); }
}
/* A saved value a dropdown no longer lists (the flight material when it differs
   from the belt material: the picker only ever adds the current belt material)
   gets its option back, or setting .value silently does nothing and the field
   falls back to matching the belt (fixed v93). */
function selEnsure(sel, v){
  if(!sel || !v || [...sel.options].some(o => o.value === v)) return;
  const o = document.createElement('option'); o.value = o.textContent = v; sel.appendChild(o);
}

// selects are matched case- and punctuation-insensitively, because the register
// and the reference workbook are maintained by different hands
function setSelLoose(id, v){
  const sel = $(id);
  if(!sel || !v) return false;
  const norm = x => String(x).toUpperCase().replace(/[^A-Z0-9]/g,'');
  const want = norm(v);
  const opt = [...sel.options].find(o => norm(o.value) === want);
  if(!opt) return false;
  sel.value = opt.value;
  return true;
}
$('bAsset').addEventListener('input', renderAssetMatch);

/* ---------- one importer ---------- */
/* Planner schema, call-log dedupe. .xlsx goes through SheetJS, .csv through the
   parser below; both land in the same array of header-keyed rows and take the
   same path from there. */
/* Four, two and one a year. No Focus carries no cadence - there is nothing it
   is late for, so it can never be overdue. */
/* Most calls are short. The invite templates override this when one is picked -
   a health check is two hours whatever the default says. */
/* Bumped with every release so a device can say which build it is running.
   Kept in step with the service worker cache name by hand - if these two ever
   disagree, the app is running files from a cache it did not expect. */
/* Must match the build meta in index.html and CACHE in sw.js. All three are
   uploaded together and all three must agree; the app says so on the home
   screen when they do not. */
const APP_BUILD = 'v103';
/* Feather icons, inline. Same set as the home tiles - one place to change if
   the icon language ever moves. */
const ICONS = {
  home:   '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5"/>'+
          '<path d="M9.5 21v-6h5v6"/>',
  chev:   '<path d="M15 5 8 12l7 7"/>',
  edit:   '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>'+
          '<path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/>',
  trash:  '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'+
          '<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>'+
          '<circle cx="12" cy="13" r="4"/>',
  image:  '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>'+
          '<path d="M21 15l-5-5L5 21"/>',
  plus:   '<circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/>',
  calplus:'<path d="M21 12V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7"/>'+
          '<path d="M16 2v4M8 2v4M3 10h18"/><path d="M18 15v6M15 18h6"/>',
  check:  '<path d="M20 6L9 17l-5-5"/>',
  copy:   '<rect x="9" y="9" width="12" height="12" rx="2"/>'+
          '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  person: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  book:   '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>',
  folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  close:  '<path d="M18 6L6 18M6 6l12 12"/>',
  gear:   '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  help:   '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>'
};
function icon(k){
  return '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    ICONS[k] + '</svg>';
}
const DEF_DUR = 25;
const CAD = {'High':'P1 Quarterly','Medium':'P2 Half-yearly','Low':'P3 Yearly','No Focus':'P4 No cadence'};
/* What the old export wrote, so accounts already loaded can be moved across
   without a re-import. */
const CAD_OLD = {'P1 Monthly':'P1 Quarterly','P2 Quarterly':'P2 Half-yearly',
                 'P3 Half-yearly':'P3 Yearly','P4 Validate & rate':'P4 No cadence'};
const FOCUS_RANK = {'High':0,'Medium':1,'Low':2,'No Focus':3};
/* Category names written into the ICS. They have to match what is set up in
   Outlook character for character, so they are defined once, here. */
const FOCUS_CAT = {'High':'Focus High','Medium':'Focus Medium','Low':'Focus Low','No Focus':'Focus None'};

/* Column names as they appear in the ANZ Active Food Contacts view. Matching is
   case-insensitive, whitespace-tolerant, and accepts the '(Account Name) (Account)'
   suffix on the account-level fields, so a minor export change will not break it.
   A renamed column will. The leading space on ' Full Name' is real. */
const COL = {
  cid:'(Do Not Modify) Contact', chk:'(Do Not Modify) Row Checksum', mod:'(Do Not Modify) Modified On',
  ctype:'Contact Type', full:'Full Name', first:'First Name', last:'Last Name',
  acct:'Account Name', role:'Job Role', title:'Job Title',
  e1:'Email 1', e2:'Email 2', e3:'Email 3', mob:'Mobile',
  mgr:'Account Manager', tier:'Account Tier', foc:'Account Focus', rep:'Account Representative',
  lad:'Last Activity Date', lastAppt:'Last Appointment', team:'Industry Team', seg:'Segment'
};
function pick(row, name){
  const want = name.trim().toLowerCase();
  if(row[name] != null) return String(row[name]).trim();
  const k = Object.keys(row).find(x => {
    const h = x.replace(/\u00a0/g,' ').trim().toLowerCase();
    return h === want || h.startsWith(want + ' (');
  });
  return k && row[k] != null ? String(row[k]).replace(/\u00a0/g,' ').trim() : '';
}
function parseCsv(text){
  const rows=[]; let f='', row=[], q=false;
  for(let i=0;i<text.length;i++){
    const c = text[i];
    if(q){
      if(c === '"'){ if(text[i+1] === '"'){ f+='"'; i++; } else q=false; } else f+=c;
    } else if(c === '"'){ q=true; }
    else if(c === ','){ row.push(f); f=''; }
    else if(c === '\n'){ row.push(f); rows.push(row); row=[]; f=''; }
    else if(c !== '\r'){ f+=c; }
  }
  if(f.length || row.length){ row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim() !== ''));
}
function csvToObjects(text){
  const rows = parseCsv(text);
  if(rows.length < 2) throw new Error('that file has headers but no data rows');
  const hdr = rows[0];
  return rows.slice(1).map(r => {
    const o = {};
    hdr.forEach((h,i) => o[h] = r[i] == null ? '' : r[i]);
    return o;
  });
}
async function readRows(file){
  const name = (file.name||'').toLowerCase();
  if(name.endsWith('.csv')){
    return {rows: csvToObjects(await file.text()), hidden: null};
  }
  if(typeof XLSX === 'undefined'){
    throw new Error('the spreadsheet library has not loaded - open the app online once, or import a .csv');
  }
  const wb = XLSX.read(await file.arrayBuffer(), {type:'array'});
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, {defval:'', raw:false});
  /* hiddenSheet maps every visible header to its Dynamics schema name and carries
     the account entity GUID. It is the shape Dynamics accepts back through the
     import wizard, so it is kept whole for the write-back path rather than being
     read as CRM metadata and discarded. Losing it loses the round trip. */
  let hidden = null;
  const hs = wb.SheetNames.find(n => n.toLowerCase() === 'hiddensheet');
  if(hs) hidden = XLSX.utils.sheet_to_json(wb.Sheets[hs], {header:1, defval:''});
  return {rows, hidden};
}

function buildAccounts(rows){
  const groups = {};
  for(const r of rows){
    const nm = pick(r, COL.acct);
    if(!nm) continue;
    (groups[nm] = groups[nm] || []).push(r);
  }
  const out = [];
  for(const nm of Object.keys(groups)){
    const rs = groups[nm];
    const sub = suburbOf(nm), z = zoneOf(nm, sub);
    const disp = sub ? (OVERRIDES.spelling[sub] || titleCase(sub)) : '';
    const foc = pick(rs[0], COL.foc) || 'No Focus';

    // latest Last Activity Date across the account's rows, and days since
    let last = '', lastT = -1;
    for(const r of rs){
      const v = pick(r, COL.lad); if(!v) continue;
      const t = Date.parse(v); if(!isNaN(t) && t > lastT){ lastT = t; last = v; }
    }
    let lastAppt = '', laT = -1;
    for(const r of rs){
      const v = pick(r, COL.lastAppt); if(!v) continue;
      const t = Date.parse(v); if(!isNaN(t) && t > laT){ laT = t; lastAppt = v; }
    }

    /* Call-log dedupe: collapse duplicate contacts within the account, keeping the
       row that scores highest on completeness. The (Do Not Modify) values belong to
       a specific row, so the winning row's identifiers are the ones kept - writing
       back under a losing row's checksum would be rejected. */
    const seen = {};
    for(const r of rs){
      let n = pick(r, COL.full);
      if(!n || n === '.' || n === '. .') n = (pick(r,COL.first)+' '+pick(r,COL.last)).trim();
      if(!n || n === '.') continue;
      const emails = [pick(r,COL.e1), pick(r,COL.e2), pick(r,COL.e3)].filter(Boolean);
      const [p, pk] = normPhone(pick(r, COL.mob));
      const role = pick(r, COL.role);
      const score = (emails.length?2:0) + (p?2:0) + (role?1:0);
      const k = n.toLowerCase();
      if(!seen[k] || score > seen[k]._s){
        seen[k] = {n:n, r:role, t:pick(r,COL.title), p:p, pk:pk, e:emails,
                   ct:pick(r,COL.ctype), id:pick(r,COL.cid), chk:pick(r,COL.chk),
                   mod:pick(r,COL.mod), _s:score};
      }
    }
    const cs = Object.values(seen)
      .map(c => { delete c._s; return c; })
      .sort((a,b) => roleRank(a.r) - roleRank(b.r) || a.n.localeCompare(b.n));

    out.push({
      a:nm, sub:disp, z:z, tier:pick(rs[0],COL.tier), foc:foc, cad:CAD[foc]||CAD['No Focus'],
      seg:pick(rs[0],COL.seg), team:pick(rs[0],COL.team), mgr:pick(rs[0],COL.mgr),
      rep:pick(rs[0],COL.rep), last:last, lastAppt:lastAppt,
      idle: lastT > 0 ? Math.round((Date.now()-lastT)/86400000) : null,
      c:cs
    });
  }
  out.sort((a,b) => (FOCUS_RANK[a.foc] ?? 3) - (FOCUS_RANK[b.foc] ?? 3) ||
    a.sub.localeCompare(b.sub) || a.a.localeCompare(b.a));
  return out;
}

let ACCOUNTS = [], ACC_BY_NAME = new Map(), META = null;
/* ---------- account keys ----------
   An appointment travelling to GitHub refers to its account by key, never by
   name, so no customer name is ever written to the repository.

   FNV-1a, 64 bits, rendered as 16 hex characters. Deliberately not a crypto
   hash, and it is worth being straight about why that makes no difference: the
   account list is a thousand-odd names, so anyone holding it could rebuild the
   mapping from any hash in seconds. This is not encryption and does not pretend
   to be. What it does is keep the names out of the file and out of git history,
   which is the actual requirement. Collisions across 1,201 accounts at 64 bits
   are about one in ten trillion. */
function acctKey(name){
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  const s = String(name == null ? '' : name).trim().toUpperCase();
  for(let i = 0; i < s.length; i++){
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (c + i), 0x85ebca6b) >>> 0;
  }
  return ('00000000' + h1.toString(16)).slice(-8) + ('00000000' + h2.toString(16)).slice(-8);
}
let KEY_TO_ACCT = new Map();
function indexAccounts(list){
  /* Accounts imported before the cadences changed carry the old label, which is
     no longer in CAD_DAYS and would read as no cadence at all. Moved across on
     load rather than on import, so it also fixes a device restored from an old
     backup. */
  let moved = 0;
  list.forEach(a => { if(CAD_OLD[a.cad]){ a.cad = CAD_OLD[a.cad]; moved++; } });
  if(moved) console.log('[cadence] moved '+moved+' accounts to the new cadences');
  ACCOUNTS = list;
  ACC_BY_NAME = new Map(list.map(a => [a.a, a]));
  KEY_TO_ACCT = new Map(list.map(a => [acctKey(a.a), a.a]));
}
async function loadAccounts(){
  indexAccounts(await accAll());
  APPTS = await apptsAll();
  TASKS = await tasksAll();
  await loadQuotes();
  await loadLists();
  REF = await kvGet('beltref') || null;
  ASSETS = await kvGet('assets') || null;
  await loadUse();
  WEEKS = await kvGet('weeks') || {};
  MGR_OF = await kvGet('mgrOf') || {};
  LOAD_LOG = await kvGet('loadLog') || [];
  META = await kvGet('meta') || null;
  const ov = await kvGet('overrides');
  if(ov) OVERRIDES = Object.assign({acctZone:{}, spelling:{}}, ov);
}

async function importCrm(file){
  toast('Reading file...');
  const {rows, hidden} = await readRows(file);
  if(!rows.length) throw new Error('no rows found in that file');
  if(!rows.some(r => pick(r, COL.acct))) throw new Error('no "Account Name" column found');
  const list = buildAccounts(rows);
  if(!list.length) throw new Error('no accounts could be read from that file');

  await accReplaceAll(list);
  const mgrCount = {}, repCount = {};
  for(const a of list){
    if(a.mgr) mgrCount[a.mgr] = (mgrCount[a.mgr]||0)+1;
    if(a.rep) repCount[a.rep] = (repCount[a.rep]||0)+1;
  }
  const contacts = list.reduce((n,a) => n + a.c.length, 0);
  const meta = {
    imported: Date.now(),
    source: file.name || 'import',
    rows: rows.length,
    counts: {accounts:list.length, contacts:contacts},
    managers: Object.keys(mgrCount).sort((a,b) => mgrCount[b]-mgrCount[a]),
    reps: Object.keys(repCount).sort((a,b) => repCount[b]-repCount[a]),
    hiddenSheet: hidden,          // kept whole for the Dynamics write-back path
    unzoned: list.filter(a => a.z === 'Z12').length,
    nzSuspect: list.filter(a => looksNZ(suburbOf(a.a), a.z)).map(a => a.a),
    noEmail: list.reduce((n,a) => n + a.c.filter(c => !c.e.length).length, 0),
    noMobile: list.reduce((n,a) => n + a.c.filter(c => c.pk === 'none').length, 0),
    phoneCheck: list.reduce((n,a) => n + a.c.filter(c => c.pk === 'check').length, 0),
    unranked: list.reduce((n,a) => n + a.c.filter(c => roleRank(c.r) === 99).length, 0)
  };
  await kvSet('meta', meta);
  META = meta;
  indexAccounts(list);
  await logLoad(file.name || 'CRM export', 'crm',
    list.length + ' accounts, ' + contacts + ' contacts, ' + rows.length + ' rows read');
  // the planner's rule, kept: an appointment against an account that no longer
  // exists is dropped rather than left pointing at nothing
  const orphans = APPTS.filter(ap => !ACC_BY_NAME.has(ap.acct));
  for(const ap of orphans) await apptsDel(ap.id);
  if(orphans.length){
    APPTS = APPTS.filter(ap => ACC_BY_NAME.has(ap.acct));
    meta.orphanedAppts = orphans.length;
  }
  const lostMoves = Object.keys(MGR_OF).filter(n => !ACC_BY_NAME.has(n));
  if(lostMoves.length){
    lostMoves.forEach(n => { delete MGR_OF[n]; });
    await saveMgrOf();
    meta.orphanedMoves = lostMoves.length;
  }
  Object.keys(WEEKS).forEach(k => { if(!ZONES[(WEEKS[k]||{}).zone]) delete WEEKS[k]; });
  await saveWeeks();
  plan.zone = '';
  renderDbStat();
  fillManagers();
  toast('Imported '+list.length+' accounts');
}

async function importOverrides(file){
  const o = JSON.parse(await file.text());
  if(!o || (!o.acctZone && !o.spelling)) throw new Error('that file has no acctZone or spelling map');
  OVERRIDES = {acctZone:o.acctZone||{}, spelling:o.spelling||{}, loaded:Date.now(),
               file: file.name || 'zone-overrides.json'};
  await kvSet('overrides', OVERRIDES);
  renderDbStat();
  await logLoad(file.name || 'zone-overrides.json', 'overrides',
    Object.keys(OVERRIDES.acctZone).length + ' account pins, ' +
    Object.keys(OVERRIDES.spelling).length + ' spelling corrections');
  toast('Loaded ' + (file.name || 'zone overrides') + ' - ' +
    Object.keys(OVERRIDES.acctZone).length + ' pins, ' +
    Object.keys(OVERRIDES.spelling).length + ' spellings');
}

function renderDbStat(){
  const el = $('dbStat');
  if(!META){ el.textContent = 'No data loaded.'; return; }
  const d = new Date(META.imported);
  const ov = Object.keys(OVERRIDES.acctZone).length;
  el.innerHTML =
    '<b>'+META.counts.accounts+'</b> accounts, <b>'+META.counts.contacts+'</b> contacts<br>'+
    'Imported '+d.toLocaleDateString()+' '+d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})+
    ' from '+esc(META.source)+'<br>'+
    ov+' zone override'+(ov===1?'':'s')+' loaded';
  renderImportReport();
}
function renderImportReport(){
  const el = $('impReport');
  if(!el) return;
  if(!META){ el.innerHTML = ''; return; }
  const L = [];
  L.push(META.unzoned+' account'+(META.unzoned===1?'':'s')+' fell to Z12 Interstate / Unconfirmed');
  if(META.nzSuspect && META.nzSuspect.length)
    L.push('<span class="flagline">'+META.nzSuspect.length+' New Zealand site'+
      (META.nzSuspect.length===1?'':'s')+' resolved to an Australian zone &mdash; pin with an override</span>');
  L.push(META.noEmail+' contacts without an email, '+META.noMobile+' without a mobile');
  if(META.phoneCheck) L.push(META.phoneCheck+' phone numbers did not normalise and print as stored');
  if(META.unranked) L.push(META.unranked+' contacts have a job role outside the picklist and sort last');
  if(META.orphanedMoves) L.push(META.orphanedMoves+' manager reassignment'+
    (META.orphanedMoves===1?'':'s')+' pointed at accounts not in this export and were dropped');
  if(META.orphanedAppts) L.push('<span class="flagline">'+META.orphanedAppts+
    ' planned appointment'+(META.orphanedAppts===1?'':'s')+
    ' pointed at accounts that are not in this export and were dropped</span>');
  if(!META.hiddenSheet) L.push('<span class="flagline">No hiddenSheet in that file &mdash; the Dynamics write-back path needs the original .xlsx</span>');
  el.innerHTML = '<ul class="rep">'+L.map(x=>'<li>'+x+'</li>').join('')+'</ul>';
}
function fillManagers(){
  const sel = $('cMgr'); sel.innerHTML = '';
  const list = (META && META.managers.length) ? META.managers : ['Unassigned'];
  list.forEach(m => { const o = document.createElement('option'); o.textContent = m; sel.appendChild(o); });
  const saved = localStorage.getItem(LS('mgr'));
  if(saved && list.includes(saved)) sel.value = saved;
  updateMgrHint();
}
function updateMgrHint(){
  if(!META) return;
  const m = $('cMgr').value;
  const n = ACCOUNTS.filter(a => a.mgr === m).length;
  $('mgrHint').textContent = n + ' accounts for ' + m + ' - search covers all accounts';
}

/* ---------- navigation ---------- */
const TITLES = {
  home:['Field CRM',''], account:['New call','Account'], contacts:['New call','Contacts'],
  accounts:['Accounts',''], acct:['Account',''], plan:['Plan',''], today:['Today',''],
  manuals:['Manuals',''], people:['Contacts',''], reports:['Reports',''],
  dash:['Call','Menu'], belt:['Add belt',''], project:['Add project',''],
  settings:['Settings',''], help:['Help',''], directory:['Directory',''], reference:['Reference',''],
  ccontacts:['People on this call','Call'],
  note:['General note',''], health:['Health check',''], lists:['Lists','']
};
/* ---------- navigation ----------
   Screens are swapped, but every move is also pushed onto the browser history,
   so the Android back gesture moves back a screen instead of closing the app.
   Before this, the app was a single history entry: one swipe from the middle of
   a call and you were out of an installed PWA with no obvious way back in.

   The URL never changes. A hash would survive a reload but would also mean a
   cold start could land on a screen whose data has not been read yet, so state
   objects carry the screen instead.

   Dialogs get their own entry, so a back gesture with the appointment dialog
   open closes the dialog rather than leaving the screen behind it. */

const DIALOGS = ['dlg','mvdlg','rdlg','opendlg','planmenu','outdlg','vmdlg','taskdlg','srchdlg','aidlg','snipdlg','proddlg','tidydlg','coachdlg'];
function openDialogs(){
  return DIALOGS.filter(id => { const d = $(id); return d && d.hasAttribute('open'); });
}
function closeDialogsNow(){
  closePhoto();
  closeManualsOverlay();
  DIALOGS.forEach(id => {
    const d = $(id);
    if(!d || !d.hasAttribute('open')) return;
    if(d.close) d.close(); else d.removeAttribute('open');
  });
  dlgAppt = null; editingAppt = null; movingAppt = null;
}
// Push an entry when a dialog opens, so back closes it. Called by the openers.
function pushDialog(id){
  const st = {screen: screen, dialog: id};
  try {
    if(staleEntry()) history.replaceState(st, '', location.href);
    else history.pushState(st, '', location.href);
  } catch(e){}
  leftover = false;
}
/* A menu that closes itself when one of its actions is tapped (the visit menu,
   the card menu, Create and share) leaves its history entry behind. Before
   v103 that entry cost an extra back - or worse: Move opened over it, and
   Cancel on Move went back onto it and left the Move sheet open. Now the next
   screen or dialog takes that entry over, and a back from it steps past. */
let leftover = false;
DIALOGS.forEach(id => { const d = $(id); if(d) d.addEventListener('close', () => { if(staleEntry()) leftover = true; }); });
function entryShowing(id){
  if(id === true) return true;                    // an unnamed entry from before v103
  const el = $(id);
  if(!el) return false;
  return el.tagName === 'DIALOG' ? el.hasAttribute('open') : el.classList.contains('on');
}
function staleEntry(){
  const s = history.state;
  return !!(s && s.dialog) && !entryShowing(s.dialog);
}

/* Screens that read the open call. Reaching one without a call - a stale history
   entry after the call was closed, a back gesture into a finished call - threw on
   the first property read and left a blank screen with no way forward. */
const CALL_SCREENS = ['dash','belt','project','note','health'];
/* On Home the right-hand header button is the ⋯ menu (Settings); everywhere
   else it goes home. Also run at boot, which shows Home without showScreen. */
function paintHeaderMenu(name){
  $('hdMenu').style.display = 'block';
  $('hdMenu').innerHTML = name === 'home' ? '<span class="dots" aria-hidden="true">&#8943;</span>' : icon('home');
  $('hdMenu').title = name === 'home' ? 'Settings and help' : 'Home';
  $('hdMenu').setAttribute('aria-label', name === 'home' ? 'Settings and help' : 'Home');
}
// the call toolbar is sticky just under the sticky header
function headerHeight(){
  const h = document.querySelector('header');
  if(h) document.documentElement.style.setProperty('--hdh', h.offsetHeight + 'px');
}
function showScreen(name){
  if(CALL_SCREENS.includes(screen) && screen !== 'dash') captureDraft(screen);
  if(CALL_SCREENS.includes(name)) lastCallScreen = name;
  if(CALL_SCREENS.includes(name) && !call) name = 'home';
  /* The page viewer is fixed over everything, so leaving the manuals screen has
     to close it - otherwise a back gesture changes the screen underneath and the
     viewer stays up, covering it. */
  if(window.Manuals && name !== 'manuals') Manuals.closeViewer();
  if(window.HealthLib && name !== 'health') HealthLib.closePicker();
  screen = name;
  document.querySelectorAll('.scr').forEach(s=>s.classList.remove('on'));
  $('s-'+name).classList.add('on');
  $('back').style.display = (name==='home') ? 'none' : 'block';
  paintHeaderMenu(name);
  $('title').textContent = TITLES[name] ? TITLES[name][0] : 'Field CRM';
  // an entry already in the call log is being changed, not added
  if(name === 'belt' && editingIdx != null) $('title').textContent = 'Belt';
  if(name === 'project' && editingProject && editingProject.inThisCall) $('title').textContent = 'Project';
  $('subtitle').textContent = call ? (call.customer + (call.site?' - '+call.site:'')) : 'No call open';
  const inCall = call && CALL_SCREENS.includes(name);
  $('bar').style.display = inCall ? 'block' : 'none';
  // one main action in the toolbar: Create and share on the call menu, Done on a form
  $('doOutput').hidden = name !== 'dash';
  $('barDone').hidden = name === 'dash';
  window.scrollTo(0,0);
  if(name==='dash') renderDash();
  if(name==='home') renderHome();
  if(name==='directory') renderDirPane();
  if(name==='reference') renderRefPane();
  if(name==='ccontacts') renderCallContacts();
  if(name==='settings'){ renderExchange(); renderDbStat(); renderBackupStat(); fillManagers();
    if($('setImgMode')) $('setImgMode').value = defaultImgMode();
    renderSettingsSummary(); }
  if(name==='reports'){ renderReports().catch(e=>console.error('reports', e)); renderPcFolder().catch(e=>console.error('pc folder', e)); }
  if(name==='plan') renderPlan();
  if(name==='today') renderToday();   // renderToday sets the title, which moves with the date
  // the plan breaks out of the phone column; everything else stays in it
  document.body.classList.toggle('planning', name === 'plan');
  renderCallStrip();
}
function go(name, replace){
  /* Re-showing the same screen is a redraw, not a move. Pushing an entry for it
     would mean two back presses to leave a screen you never navigated twice. */
  const same = (name === screen) || replace || staleEntry();
  showScreen(name);
  leftover = false;
  try {
    const st = {screen: name};
    if(same) history.replaceState(st, '', location.href);
    else history.pushState(st, '', location.href);
  } catch(e){ /* history unavailable - the app still works, the gesture does not */ }
}
window.addEventListener('popstate', e => {
  const st = e.state || {screen:'home'};
  const wasLeftover = leftover;
  leftover = false;
  // reached an entry whose dialog has already closed: step past it
  if(st.dialog && !entryShowing(st.dialog)){ closeDialogsNow(); history.back(); return; }
  // a dialog was open and the entry behind it has been reached: just close it
  // the photo viewer is an overlay, not a dialog element, so it is closed here too
  if($('pview') && $('pview').classList.contains('on') && !st.dialog){ closePhoto(); return; }
  if($('manOverlay') && $('manOverlay').classList.contains('on') && !st.dialog){
    closeManualsOverlay(); return;
  }
  // the AI sheet can sit over the task form: back closes the sheet, not both
  if(st.dialog !== 'aidlg' && $('aidlg').hasAttribute('open')){ closeAi(); return; }
  // and so can the coach's sheet, over the visit editor (v102)
  if(st.dialog !== 'coachdlg' && $('coachdlg').hasAttribute('open')){ closeCoach(); return; }
  if(openDialogs().length && !st.dialog){ closeDialogsNow(); return; }
  if(st.dialog) return;      // going forward into a dialog entry: leave it be
  // off a menu's leftover entry onto the screen already showing: one more, so one back is one step
  if(wasLeftover && st.screen === screen){ history.back(); return; }
  showScreen(st.screen || 'home');
});
/* ---------- back goes up, not backwards ----------
   This used to call history.back(), so the button and the Android gesture could
   never disagree. The cost was that "back" meant "wherever I came from", which
   is not what the screens look like: a belt is part of a call, a call sits under
   home, and you expect two presses to get you out of a belt no matter how you
   arrived at it.

   So the button walks a fixed tree. The gesture still walks history, and the two
   now differ - deliberately. The button is the considered action and is the one
   worth making predictable.

   Anything not listed goes home, so a screen added later fails safe rather than
   trapping you on it. */
const PARENT = {
  belt:'dash', project:'dash', note:'dash', health:'dash', ccontacts:'dash',
  dash:'home', contacts:'account', account:'home', acct:'directory',
  directory:'home', reference:'home', reports:'home', plan:'home',
  today:'home', settings:'home', help:'home', lists:'home'
};
function parentOf(name){
  const up = PARENT[name] || 'home';
  // a call screen with no call open has nothing to go up to
  if(CALL_SCREENS.includes(up) && !call) return 'home';
  return up;
}
$('back').addEventListener('click', ()=>{
  if(screen === 'home') return;
  // leaving an entry form saves or discards it; see leaveEntry
  if(CALL_SCREENS.includes(screen) && screen !== 'dash' && leaveEntry(screen)) return;
  /* replace rather than push: walking up should not deepen the stack, or twenty
     presses would leave twenty entries behind the home screen. */
  go(parentOf(screen), true);
});

function renderHomeCounts(){
  if(!ACCOUNTS.length){
    $('acctInfo').textContent = 'Nothing loaded';
    $('dueInfo').textContent = 'Nothing loaded';
    return;
  }
  const mgr = $('cMgr').value;
  const mine = ACCOUNTS.filter(a => a.mgr === mgr).length;
  $('acctInfo').textContent = mine + ' yours of ' + ACCOUNTS.length;
  const cv = coverage(mgr);
  $('dueInfo').textContent = (cv.due + cv.never)
    ? (cv.due + cv.never) + ' to book' + (cv.booked ? ', ' + cv.booked + ' already in' : '')
    : (cv.booked ? cv.booked + ' booked, nothing else due' : 'nothing due');
  renderPlanCount();
}

/* ---------- the account record ---------- */
/* Cadence stops being a label here. The planner's `idle` counts days since CRM
   activity, which moves when anyone touches the record for any reason. What is
   actually wanted is days since you were last there, and now that visits are
   stored the app can work that out from its own calls.

   Both are kept and shown side by side, because they answer different questions
   and they disagree often enough to be worth seeing. `due` is computed from your
   own visits where there are any, and falls back to the CRM date where there are
   none - otherwise every account you have not yet visited would read as overdue
   on day one. */
const CAD_DAYS = {'P1 Quarterly':91, 'P2 Half-yearly':182, 'P3 Yearly':365, 'P4 No cadence':null};
let CALLS_BY_ACCT = new Map();

function indexCalls(all){
  CALLS_BY_ACCT = new Map();
  for(const c of all){
    if(!c.customer) continue;
    const k = c.customer;
    if(!CALLS_BY_ACCT.has(k)) CALLS_BY_ACCT.set(k, []);
    CALLS_BY_ACCT.get(k).push(c);
  }
  CALLS_BY_ACCT.forEach(list => list.sort((a,b) => (b.when||b.updated||0) - (a.when||a.updated||0)));
}
function callsFor(name){ return CALLS_BY_ACCT.get(name) || []; }
function callWhen(c){
  if(c.when) return c.when;
  // dates are stored DD/MM/YYYY; fall back to the record timestamp
  const p = String(c.date||'').split('/');
  if(p.length === 3){ const t = Date.parse(p[2]+'-'+p[1]+'-'+p[0]); if(!isNaN(t)) return t; }
  return c.updated || 0;
}
function lastVisit(name){
  const list = callsFor(name).filter(c => c.status !== 'cancelled' && c.status !== 'missed');
  if(!list.length) return null;
  return Math.max(...list.map(callWhen));
}
function daysSince(t){ return t == null ? null : Math.floor((Date.now()-t)/86400000); }
/* An account with a visit already booked is not a job to do. Left out of this,
   the Due list keeps naming accounts that are already handled, which is the
   fastest way to make a list nobody reads. Booked is its own state. */
function nextBooked(name){
  const t = todayISOdate();
  const dates = APPTS
    .filter(ap => ap.acct === name && ap.date >= t &&
                  !['cancelled','missed','done'].includes(apStatus(ap)))
    .map(ap => ap.date).sort();
  return dates.length ? dates[0] : null;
}
/* Days since the account was last covered, whether that is past its cadence,
   which clock the answer came from, and whether something is already in the
   diary. state is what the UI reads:
     covered  inside its cadence
     booked   past it, but a visit is planned
     due      past it, nothing planned
     never    no visit and no CRM activity to go on */
function dueState(a){
  const target = CAD_DAYS[a.cad];
  /* No cadence means nothing is outstanding. Returning 'covered' keeps every
     caller working without a special case at each one. */
  if(target == null) return {days:null, over:false, basis:'none', target:null,
                             booked:nextBooked(a.a), state:'covered'};
  const booked = nextBooked(a.a);
  const lv = lastVisit(a.a);
  let days = null, basis = 'never', over = true;
  if(lv != null){ days = daysSince(lv); basis = 'visit'; over = days > target; }
  else if(a.idle != null){ days = a.idle; basis = 'crm'; over = a.idle > target; }
  const state = !over ? 'covered' : (booked ? 'booked' : (basis === 'never' ? 'never' : 'due'));
  return {days, over, basis, target, booked, state};
}
/* Booked accounts are excluded by default. They are still past cadence, and the
   caller can ask for them, but they are not work outstanding. */
function overdueAccounts(mgr, opts){
  opts = opts || {};
  return ACCOUNTS
    .filter(a => !mgr || effMgr(a) === mgr)
    .map(a => ({a:a, d:dueState(a)}))
    .filter(x => x.d.over && (opts.includeBooked || !x.d.booked))
    .sort((x,y) => (FOCUS_RANK[x.a.foc] ?? 3) - (FOCUS_RANK[y.a.foc] ?? 3) ||
                   (y.d.days ?? 99999) - (x.d.days ?? 99999));
}
// How the book stands, for one manager or for everyone.
function coverage(mgr){
  const out = {covered:0, booked:0, due:0, never:0, total:0};
  ACCOUNTS.forEach(a=>{
    if(mgr && effMgr(a) !== mgr) return;
    out.total++;
    out[dueState(a).state]++;
  });
  return out;
}
function dueLabel(d){
  if(d.booked) return 'booked ' + dayLabel(d.booked) +
    (d.days == null ? '' : ', ' + d.days + ' days since your last call');
  if(d.basis === 'never') return 'never covered';
  const who = d.basis === 'visit' ? 'since your last call' : 'since CRM activity';
  return d.days + ' days ' + who + (d.over ? ' - past ' + d.target : '');
}
const DUE_CLS = {covered:'done', booked:'open', due:'overdue', never:'overdue'};

/* ---------- account browse ---------- */
let browseScope = 'mine';
/* The list on the screen, or (given q, el and hint) the results inside the
   full-screen search, which replaced the permanent search box in v94. */
function renderBrowse(q, el, hint, before){
  const search = typeof q === 'string';
  q = search ? q.trim().toLowerCase() : '';
  el = el || $('abRes'); hint = hint || $('abHint');
  const mgr = $('cMgr').value;
  if(search && !q){ el.innerHTML = ''; hint.textContent = ACCOUNTS.length ? 'Type an account name or suburb' : ''; return; }
  if(!ACCOUNTS.length){
    hint.textContent = 'Import the CRM export first';
    el.innerHTML = '<p class="empty">No accounts loaded.</p>';
    return;
  }
  /* Scope applies to the list only while the search box is empty. Typing suspends
     it, because equipment builders, bearing suppliers and head offices routinely
     sit under another manager and you still have to call on them. */
  let pool;
  if(q){
    pool = ACCOUNTS.filter(a => a.a.toLowerCase().includes(q) ||
      (a.sub && a.sub.toLowerCase().includes(q)));
  } else if(browseScope === 'due'){
    pool = overdueAccounts(mgr).map(x => x.a);
  } else if(browseScope === 'mine'){
    pool = ACCOUNTS.filter(a => effMgr(a) === mgr);
  } else {
    pool = ACCOUNTS.slice();
  }
  const out = q
    ? pool.slice().sort((a,b)=>{
        const am = a.mgr===mgr, bm = b.mgr===mgr;
        if(am!==bm) return am?-1:1;
        return (FOCUS_RANK[a.foc] ?? 3) - (FOCUS_RANK[b.foc] ?? 3) || a.a.length - b.a.length;
      })
    : pool;
  const outOfZone = q ? out.filter(a => effMgr(a) !== mgr).length : 0;
  const cv = coverage(mgr);
  const cover = ACCOUNTS.length
    ? '<br><span class="cov">'+cv.covered+' covered &middot; '+cv.booked+' booked &middot; '+
      (cv.due+cv.never)+' to book, of '+cv.total+' yours</span>' : '';
  if(search){
    hint.textContent = out.length
      ? out.length+' account'+(out.length===1?'':'s')+(out.length>40?' - showing 40':'')+
        (outOfZone ? ', '+outOfZone+' under another manager' : '')
      : 'No matches';
  } else {
    hint.innerHTML = (out.length
      ? out.length+' account'+(out.length===1?'':'s')+(out.length>40?' - showing 40':'')
      : 'No matches') + cover;
  }
  el.innerHTML = out.slice(0,40).map(a=>{
    const d = dueState(a);
    /* Suburb is already in the account name and a day count is a number to
       decode, so both go. What is left is the name, who owns it if not you, and
       two coloured signals. */
    return '<button data-acct="'+esc(a.a)+'">'+
      '<span class="fd '+FOC_CLS[a.foc]+'" title="'+esc(a.foc||'No Focus')+' focus"></span>'+esc(a.a)+
      (a.mgr===mgr ? '' : '<span class="tag">'+esc(a.mgr||'no manager')+'</span>')+
      (d.state === 'covered' ? '' :
        '<span class="pip '+d.state+'" title="'+esc(dueLabel(d))+'"></span>')+
      '</button>';
  }).join('');
  el.querySelectorAll('[data-acct]').forEach(b =>
    b.addEventListener('click', ()=>{ if(before) before(); openAccount(b.dataset.acct); }));
}
$('abSearch').innerHTML = icon('search');
$('abSearch').addEventListener('click', () => openSearch({
  placeholder: 'Account or suburb',
  render: (q, el, hint) => renderBrowse(q, el, hint, closeSearch)
}));
$('abScope').querySelectorAll('button').forEach(b => b.addEventListener('click', ()=>{
  browseScope = b.dataset.v;
  $('abScope').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  renderBrowse();
}));

/* ---------- account view ---------- */
let viewAcct = null, cameFromAcct = false;
function openAccount(name){
  viewAcct = ACC_BY_NAME.get(name);
  if(!viewAcct){ toast('That account is not in the database'); return; }
  renderAccount();
  go('acct');
}
function renderAccount(){
  const a = viewAcct;
  if(!a) return;
  const d = dueState(a);
  const lv = lastVisit(a.a);
  const rows = [
    ['Zone', zoneName(a.z) + (a.sub ? ' - '+a.sub : '')],
    ['Focus', a.foc],
    ['Cadence', a.cad + ' (every ' + d.target + ' days)'],
    ['Tier', a.tier],
    ['Segment', a.seg],
    ['Industry team', a.team],
    ['Account manager', effMgr(a) + (isMoved(a) ? ' (reassigned from '+(a.mgr||'unassigned')+')' : '')],
    ['Representative', a.rep],
    ['Next visit booked', d.booked ? dayLabel(d.booked) : ''],
    ['Last call logged here', lv ? new Date(lv).toLocaleDateString() + ' - ' + daysSince(lv) + ' days ago' : 'none'],
    ['Last CRM activity', a.last ? a.last + (a.idle != null ? ' - ' + a.idle + ' days ago' : '') : ''],
    ['Last appointment (CRM)', a.lastAppt]
  ];
  $('avHead').innerHTML =
    '<div class="avname"><span class="fd '+FOC_CLS[a.foc]+'"></span>'+esc(a.a)+
      (d.state === 'covered' ? '' : '<span class="st '+DUE_CLS[d.state]+'">'+
        (d.state === 'never' ? 'never covered' : d.state)+'</span>')+'</div>'+
    '<div class="avsub">'+esc(dueLabel(d))+'</div>'+
    '<dl class="kv">'+rows.filter(r=>r[1]).map(r=>
      '<dt>'+esc(r[0])+'</dt><dd>'+esc(r[1])+'</dd>').join('')+'</dl>';

  $('avContacts').innerHTML = a.c.length
    ? a.c.map(c=>{
        const email = c.e && c.e.length ? c.e[0] : '';
        const extra = c.e && c.e.length > 1 ? ' +'+(c.e.length-1) : '';
        return '<div class="ct"><span><div class="cn">'+esc(c.n)+'</div>'+
          '<div class="cr">'+esc(c.t || c.r || 'role not recorded')+'</div></span>'+
          '<span class="cp">'+
            (email ? esc(email)+esc(extra) : '<span class="miss">no email</span>')+'<br>'+
            (c.p ? esc(c.p)+(c.pk==='check'?' <span class="miss">check</span>':'')
                 : '<span class="miss">no mobile</span>')+
          '</span></div>';
      }).join('')
    : '<p class="empty">No contacts on file for this account.</p>';

  const hist = callsFor(a.a);
  $('avHistory').innerHTML = hist.length
    ? hist.map(c=>{
        const st = callStatus(c);
        const n = (c.entries||[]).length;
        const belts = (c.entries||[]).filter(e=>e.type==='belt').length;
        const bits = [n ? n+' entr'+(n===1?'y':'ies') : 'no report'];
        if(belts) bits.push(belts+' belt'+(belts===1?'':'s'));
        if(c.site) bits.push(c.site);
        return '<div class="card"><div class="hd"><span class="t">'+esc(c.date)+
          '<span class="st '+st.cls+'">'+st.label+'</span></span>'+
          '<button class="x" data-openc="'+esc(c.id)+'">Open</button></div>'+
          '<p class="meta">'+esc(bits.join(' \u00b7 '))+'</p></div>';
      }).join('')
    : '<p class="empty">No calls logged here yet.</p>';
  $('avHistory').querySelectorAll('[data-openc]').forEach(b =>
    b.addEventListener('click', async ()=>{
      const all = await callsAll();
      call = all.find(x => x.id === b.dataset.openc);
      if(call){ call.loose = call.loose || []; go('dash'); }
    }));
}
/* A planned visit that never happened, one that happened but was never written up,
   and one compiled and sent are three different things. Planned, cancelled and
   missed arrive with the scheduler; until then a call is created in progress. */
function callStatus(c){
  const s = c.status || (c.shared ? 'compiled' : (c.closed ? 'done' : 'in progress'));
  if(s === 'compiled') return {label:'compiled', cls:'compiled'};
  if(s === 'done') return {label:'done', cls:'done'};
  if(s === 'cancelled') return {label:'cancelled', cls:'done'};
  if(s === 'missed') return {label:'missed', cls:'overdue'};
  if(s === 'planned') return {label:'planned', cls:'open'};
  return {label:'open', cls:'open'};
}
$('avStart').addEventListener('click', ()=>{
  if(!viewAcct) return;
  $('cDate').value = todayISO();
  cameFromAcct = true;
  if($('cType')) $('cType').value = 'Site call';
  syncQuoteMode();
  chooseAccount(viewAcct.a);
});

/* ================= the plan =================
   Ported from the Zone Call Planner. Behaviour is meant to be identical; what
   changed is where the data lives. The planner held 1,201 accounts baked into the
   file and kept the schedule in memory until you remembered to save a JSON file.
   Here accounts come from the import and appointments are written to IndexedDB on
   every change, which is the largest single thing this merge fixes.

   Planning is desktop-shaped on purpose. Drag and drop onto a calendar grid is a
   mouse gesture; the phone gets Today and This Week as a read-and-act list. */

const DAYNM = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const MONNM = ['January','February','March','April','May','June','July','August',
               'September','October','November','December'];
const LEVELS = [['High','high'],['Medium','med'],['Low','low'],['No Focus','none']];

function startOfWeek(d){ const x=new Date(d); const dow=(x.getDay()+6)%7; x.setDate(x.getDate()-dow); x.setHours(0,0,0,0); return x; }
function iso(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function parseIso(s){ const [a,b,c]=String(s).split('-').map(Number); return new Date(a,b-1,c); }
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function isWeekday(d){ const g=d.getDay(); return g>=1 && g<=5; }
const todayISOdate = () => iso(new Date());

let APPTS = [];
let TASKS = [];
const plan = {
  mgr:'', zone:'', view:'week', anchor:startOfWeek(new Date()),
  focus:new Set(LEVELS.map(l=>l[0])), q:'', seq:1, dueOnly:false
};

/* An appointment is one of three things:
     new      never downloaded, so it is not in Outlook at all
     changed  downloaded, then edited here - Outlook is holding a stale copy
     synced   downloaded and untouched since
   The revision string is everything that ends up in the invite. Move it to
   another day, retime it, retype the agenda or change who is listed and it goes
   back to changed. Dragging it to a new day counts. */
function apRev(ap){
  return [ap.acct, ap.type, ap.date, ap.start, ap.dur,
          (ap.agenda||'').trim(), (ap.contacts||[]).join('.'),
          // notes are part of the invite body, so writing them up flips it to
          // changed and the existing export button sweeps a week in one file
          sumRev(ap.callSummary)].join('|');
}
function apState(ap){
  if(!ap.exp) return 'new';
  return ap.exp === apRev(ap) ? 'synced' : 'changed';
}
const ST_LABEL = {new:'Not in Outlook yet', changed:'Edited since last download', synced:'In your Outlook calendar'};
const ST_SHORT = {new:'not downloaded', changed:'changed', synced:'in Outlook'};
function pendingAppts(list){ return (list||APPTS).filter(ap => apState(ap) !== 'synced'); }
/* Every write stamps the record. The exchange resolves an appointment edited on
   both sides newest-wins, and it cannot do that without knowing when. */
async function saveAppt(ap){ ap.touchedAt = Date.now(); await apptsPut(ap); }

/* ---------- filtering ---------- */
/* A search reaches the entire account book - every zone, every manager. Equipment
   builders, bearing suppliers and head offices routinely sit in someone else's
   zone or under someone else's name, and you still have to call on them. Zone and
   manager scope the rail only while nothing is being searched. */
function haystack(a){
  if(a._hay) return a._hay;
  const z = ZONES[a.z];
  const bits = [a.a, a.sub, a.z, z?z.name:'', a.tier, a.foc, a.seg, a.team, a.mgr, effMgr(a), a.rep];
  (a.c||[]).forEach(c => bits.push(c.n, c.r, c.t, (c.e||[])[0]));
  return (a._hay = bits.filter(Boolean).join(' ').toLowerCase());
}
// Every token has to land somewhere, so two words narrow rather than widen.
function matchQ(a, q){
  q = q == null ? plan.q : q;
  if(!q) return true;
  const h = haystack(a);
  return q.toLowerCase().split(/\s+/).filter(Boolean).every(t => h.includes(t));
}
const searching = () => plan.q.length > 0;
// Reassignment overrides the CRM manager everywhere, so scoping uses effMgr.
function inPlanScope(a){ return !plan.mgr || effMgr(a) === plan.mgr; }
function zoneAccounts(){ return ACCOUNTS.filter(a => a.z === plan.zone && inPlanScope(a)); }
function searchAll(q){
  return ACCOUNTS.filter(a => matchQ(a, q)).sort((x,y)=>
    (FOCUS_RANK[x.foc] ?? 3) - (FOCUS_RANK[y.foc] ?? 3) ||
    (x.z === plan.zone ? 0 : 1) - (y.z === plan.zone ? 0 : 1) ||
    ZONE_ORDER.indexOf(x.z) - ZONE_ORDER.indexOf(y.z) ||
    x.a.localeCompare(y.a));
}
function visibleAccounts(){
  const pool = (searching() ? searchAll() : zoneAccounts()).filter(a => plan.focus.has(a.foc));
  // "needs booking" means past cadence with nothing in the diary, not merely past
  return plan.dueOnly ? pool.filter(a => { const d = dueState(a); return d.over && !d.booked; }) : pool;
}

/* ---------- controls ---------- */
function fillPlanControls(){
  // whoever appears in the file, plus anyone accounts have been moved to
  const mgrs = allManagers().length ? allManagers()
             : (META && META.managers ? META.managers.slice().sort() : []);
  const zsel = $('pZone'), msel = $('pMgr');
  msel.innerHTML = '<option value="">Every manager</option>' +
    mgrs.map(m => '<option'+(m===plan.mgr?' selected':'')+'>'+esc(m)+'</option>').join('');
  // zones that actually hold an account, so an empty book does not list 31 of them
  const used = new Set(ACCOUNTS.map(a => a.z));
  const zlist = ZONE_ORDER.filter(z => used.has(z));
  if(!plan.zone && zlist.length) plan.zone = zlist[0];
  zsel.innerHTML = zlist.map(z =>
    '<option value="'+z+'"'+(z===plan.zone?' selected':'')+'>'+esc(zoneName(z))+'</option>').join('');
}
function renderDueToggle(){
  const el = $('pDueOnly');
  if(!el) return;
  const pool = searching() ? searchAll() : zoneAccounts();
  const n = pool.filter(a => { const d = dueState(a); return d.over && !d.booked; }).length;
  el.setAttribute('aria-pressed', String(plan.dueOnly));
  el.innerHTML = 'Needs booking<span class="n">'+n+'</span>';
  el.disabled = !n && !plan.dueOnly;
}
function renderChips(){
  const pool = searching() ? searchAll() : zoneAccounts();
  const by = {};
  pool.forEach(a => by[a.foc] = (by[a.foc]||0)+1);
  $('pChips').innerHTML = LEVELS.map(([lvl,cls])=>
    '<button type="button" class="chip '+cls+'" data-lvl="'+lvl+'" aria-pressed="'+
    plan.focus.has(lvl)+'"'+(by[lvl]?'':' disabled')+
    ' title="'+(by[lvl]||0)+' accounts">'+lvl+'</button>').join('');
  $('pChips').querySelectorAll('[data-lvl]').forEach(b => b.addEventListener('click', ()=>{
    const l = b.dataset.lvl;
    if(plan.focus.has(l)) plan.focus.delete(l); else plan.focus.add(l);
    if(!plan.focus.size) LEVELS.forEach(x => plan.focus.add(x[0]));
    renderPlan();
  }));
}
function renderRail(){
  const scope = $('pScope');
  if(searching()){
    const hits = searchAll();
    const out = hits.filter(a => a.z !== plan.zone).length;
    const others = plan.mgr ? hits.filter(a => effMgr(a) !== plan.mgr).length : 0;
    $('zTitle').textContent = 'Search: \u201c'+plan.q+'\u201d';
    $('zHub').textContent = hits.length+(hits.length===1?' account':' accounts')+' across the whole book';
    scope.hidden = false;
    scope.innerHTML = '<span></span><button type="button">Clear</button>';
    scope.querySelector('span').textContent =
      'Searching every zone and every manager' +
      (out ? ' \u2014 '+out+' outside '+plan.zone : '') +
      (others ? ', '+others+' not yours' : '');
    scope.querySelector('button').onclick = ()=>{ plan.q=''; renderPlan(); };
  } else {
    const z = ZONES[plan.zone];
    $('zTitle').textContent = plan.zone ? zoneName(plan.zone) : 'No zone';
    $('zHub').textContent = z ? (z.hub === 'n/a' ? 'no hub' : 'Hub: '+z.hub) : '';
    scope.hidden = true;
  }
  const list = $('pList'); list.innerHTML = '';
  const rows = visibleAccounts();
  if(!rows.length){
    list.innerHTML = '<div class="empty">'+(ACCOUNTS.length
      ? (searching() ? 'Nothing in the account book matches that at this focus level.'
                     : 'No accounts match this zone, manager and focus.')
      : 'Import the CRM export first.')+'</div>';
    return;
  }
  rows.forEach(a=>{
    const el = document.createElement('div');
    el.className = 'acct ' + FOC_CLS[a.foc];
    el.draggable = true; el.tabIndex = 0; el.dataset.acct = a.a;
    const d = dueState(a);
    const stale = d.over;
    el.innerHTML = '<div class="bar-c"></div>'+
      '<div><div class="nm"></div><div class="mt"></div></div>'+
      '<div class="cad"></div>';
    el.querySelector('.nm').textContent = a.a;
    const em = effMgr(a);
    const mb = document.createElement('button');
    mb.type = 'button';
    mb.className = 'mgrb' + (isMoved(a) ? ' moved' : '');
    mb.textContent = em ? em.split(/\s+/).map(x => x[0]).join('').toUpperCase() : '--';
    mb.title = (em || 'Unassigned') + (isMoved(a) ? ' (moved from '+(a.mgr||'unassigned')+')' : '') +
      ' - click to reassign';
    mb.draggable = false;
    mb.addEventListener('click', ev => { ev.stopPropagation(); openReassign({account:a.a}); });
    el.querySelector('.nm').appendChild(mb);
    /* Nothing goes under the name. Suburb is already in the account name, the
       contact count is not a reason to call anyone, and a day count is a number
       to decode. Focus is what decides how a call is approached, and that is the
       dot - so a tier line underneath was saying nothing the dot did not. */
    const mt = el.querySelector('.mt');
    mt.textContent = '';
    if(d.state !== 'covered'){
      const pip = document.createElement('span');
      pip.className = 'pip ' + d.state;
      pip.title = dueLabel(d);
      el.querySelector('.nm').appendChild(pip);
    }
    // Tag hits that sit outside the zone on screen, so a search result is never
    // mistaken for something on this trip.
    if(searching() && a.z !== plan.zone){
      const t = document.createElement('span'); t.className = 'zt';
      t.textContent = a.z; t.title = zoneName(a.z);
      mt.prepend(t);
    }
    if(stale) mt.classList.add('stale');
    el.querySelector('.cad').textContent = String(a.cad||'').split(' ')[0];
    el.addEventListener('dragstart', e=>{
      e.dataTransfer.setData('text/plain', JSON.stringify({kind:'acct', acct:a.a}));
      e.dataTransfer.effectAllowed = 'copy';
    });
    el.addEventListener('click', ()=>openDialog(null, {acct:a.a}));
    el.addEventListener('keydown', e=>{ if(e.key==='Enter') openDialog(null, {acct:a.a}); });
    list.appendChild(el);
  });
}

/* ---------- calendar ---------- */
/* Monday to Sunday (v94), as the month has been since v90: a task or quote
   request on a Saturday was in the data but nowhere on the PC's Week or Day. */
function weekDays(){ const s = startOfWeek(plan.anchor); return [0,1,2,3,4,5,6].map(i => addDays(s,i)); }
function apptsOn(dISO){ return APPTS.filter(a => a.date === dISO).sort((x,y)=>x.start.localeCompare(y.start)); }
function apptFocusCls(ap){ const a = ACC_BY_NAME.get(ap.acct); return a ? FOC_CLS[a.foc] : 'none'; }

/* ---------- hour grid ----------
   Business hours only. Everything else is a band you cannot drop into, so the
   usable area of the column is the part of the day you actually work. */
/* 7am to 5pm by default; a day with anything earlier or later stretches to
   show it (fitDayHours). Ben's rule: no boundaries on when a call or task can
   be. */
let DAY_FROM = 7, DAY_TO = 17;
const PX_MIN = 0.8;                          // 48px an hour
const SNAP = 5;                              // minutes
let GRID_H = (DAY_TO - DAY_FROM) * 60 * PX_MIN;

function minOf(hhmm){
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || '');
  return m ? (+m[1]) * 60 + (+m[2]) : DAY_FROM * 60;
}
function hhmm(mins){
  mins = Math.max(0, Math.min(24 * 60 - 1, Math.round(mins)));
  return String(Math.floor(mins / 60)).padStart(2, '0') + ':' +
         String(mins % 60).padStart(2, '0');
}
function topFor(ap){ return (minOf(ap.start) - DAY_FROM * 60) * PX_MIN; }

function fitDayHours(dayKeys){
  let from = 7 * 60, to = 17 * 60;
  for(const k of dayKeys){
    for(const x of apptsOn(k).concat(tasksOn(k), quotesOn(k))){
      const m = minOf(x.start);
      from = Math.min(from, m);
      to = Math.max(to, m + (x.dur || TASK_DUR));
    }
  }
  DAY_FROM = Math.max(0, Math.floor(from / 60));
  DAY_TO = Math.min(24, Math.ceil(to / 60));
  GRID_H = (DAY_TO - DAY_FROM) * 60 * PX_MIN;
}
function hourGutter(){
  const g = document.createElement('div');
  g.className = 'gut';
  for(let hgt = DAY_FROM; hgt < DAY_TO; hgt++){
    const s = document.createElement('div');
    s.className = 'gh';
    s.style.height = (60 * PX_MIN) + 'px';
    s.textContent = (hgt % 12 || 12) + (hgt < 12 ? 'am' : 'pm');
    g.appendChild(s);
  }
  return g;
}

/* Pointer drag. Vertical moves the time, horizontal moves the day, and the
   label updates as it goes so the time is read off the thing being moved rather
   than guessed from where it sits. */
function makeDraggableAppt(el, ap, save){
  let dragging = false, holdT = null, startY = 0, startTop = 0, moved = false;
  const coarse = window.matchMedia && window.matchMedia('(pointer:coarse)').matches;

  function begin(e){
    dragging = true; moved = false;
    startY = e.clientY;
    startTop = parseFloat(el.style.top) || 0;
    el.classList.add('dragging');
    el.setPointerCapture(e.pointerId);
  }
  el.addEventListener('pointerdown', e => {
    if(e.button != null && e.button !== 0) return;
    /* A mouse pointerdown on the delete button starts a drag before the click
       ever reaches it - setPointerCapture() below grabs every event after
       this one for the whole card. A touch hold is slow enough (450ms) that a
       tap never reaches that point, which is why this only showed up testing
       with a mouse, not the phone this is actually built for. */
    if(e.target.closest('.del, .tick')) return;
    if(coarse){
      /* Half a second before it lifts. Short enough not to feel slow, long
         enough that a scroll never picks a call up. */
      holdT = setTimeout(() => { holdT = null; begin(e); }, 450);
    } else {
      begin(e);
    }
  });
  el.addEventListener('pointermove', e => {
    if(holdT){ clearTimeout(holdT); holdT = null; return; }   // it was a scroll
    if(!dragging) return;
    e.preventDefault();
    moved = true;
    const raw = startTop + (e.clientY - startY);
    const mins = DAY_FROM * 60 + raw / PX_MIN;
    const snapped = Math.round(mins / SNAP) * SNAP;
    const clamped = Math.max(DAY_FROM * 60, Math.min(DAY_TO * 60 - ap.dur, snapped));
    el.style.top = ((clamped - DAY_FROM * 60) * PX_MIN) + 'px';
    el.dataset.newStart = hhmm(clamped);
    const lab = el.querySelector('.t span');
    if(lab) lab.textContent = el.dataset.newStart + ' \u00b7 ' + ap.dur + ' min';
    /* Which column is under the finger decides the day. */
    const col = document.elementFromPoint(e.clientX, e.clientY);
    const day = col && col.closest ? col.closest('.day') : null;
    if(day && day.dataset.k) el.dataset.newDate = day.dataset.k;
  });
  async function end(e){
    if(holdT){ clearTimeout(holdT); holdT = null; }
    if(!dragging) return;
    dragging = false;
    el.classList.remove('dragging');
    try { el.releasePointerCapture(e.pointerId); } catch(_){}
    if(!moved) return;                              // a hold that never moved
    /* A click event follows the pointer sequence. Without this the dialog opens
       for the call you have just finished dragging. */
    el.addEventListener('click', ev => { ev.stopPropagation(); ev.preventDefault(); },
      {capture:true, once:true});
    const ns = el.dataset.newStart, nd = el.dataset.newDate;
    if((ns && ns !== ap.start) || (nd && nd !== ap.date)){
      if(ns) ap.start = ns;
      if(nd) ap.date = nd;
      await (save || saveAppt)(ap);
      renderPlan();
    }
  }
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

function renderCalendar(){
  renderKinds();
  const body = $('calBody'), TODAY = todayISOdate();
  body.innerHTML = '';
  const openTasks = TASKS.filter(t => !t.done).length;
  $('calHint').textContent = (APPTS.length
    ? APPTS.length+' appointment'+(APPTS.length===1?'':'s')+' planned'
    : 'Click an account, or drag it onto a day.') +
    (openTasks ? ' \u00b7 ' + openTasks + ' open task' + (openTasks===1?'':'s') : '');

  if(plan.view === 'week' || plan.view === 'day'){
    const oneDay = plan.view === 'day';
    const days = oneDay ? [plan.anchor] : weekDays();
    $('calTitle').textContent = oneDay
      ? DAYNM[(days[0].getDay()+6)%7]+' '+days[0].getDate()+' '+
        MONNM[days[0].getMonth()].slice(0,3)+' '+days[0].getFullYear()
      : days[0].getDate()+' '+MONNM[days[0].getMonth()].slice(0,3)+' \u2013 '+
        days[6].getDate()+' '+MONNM[days[6].getMonth()].slice(0,3)+' '+days[6].getFullYear();
    const grid = document.createElement('div');
    grid.className = 'week' + (oneDay ? ' oneday' : '');
    fitDayHours(days.map(iso));
    grid.appendChild(hourGutter());
    days.forEach((d,i)=>{
      const k = iso(d);
      const col = document.createElement('div');
      col.className = 'day' + (k === TODAY ? ' today' : '') + (!oneDay && !isWeekday(d) ? ' wknd' : '');
      col.innerHTML = '<div class="dh"><b>'+(oneDay ? DAYNM[(d.getDay()+6)%7] : DAYNM[i].slice(0,3))+'</b><span>'+d.getDate()+' '+
        MONNM[d.getMonth()].slice(0,3)+'</span></div>';
      col.dataset.k = k;
      const b = document.createElement('div'); b.className = 'dbody hours';
      b.style.height = GRID_H + 'px';
      for(let hgt = DAY_FROM + 1; hgt < DAY_TO; hgt++){
        const ln = document.createElement('div');
        ln.className = 'hl';
        ln.style.top = ((hgt - DAY_FROM) * 60 * PX_MIN) + 'px';
        b.appendChild(ln);
      }
      (showKind('visit') ? apptsOn(k) : []).forEach(ap => {
        const el = apptEl(ap, false);
        const start = minOf(ap.start);
        const out = start < DAY_FROM * 60 || start >= DAY_TO * 60;
        el.style.top = Math.max(0, Math.min(GRID_H - 18, topFor(ap))) + 'px';
        el.style.height = Math.max(18, ap.dur * PX_MIN) + 'px';
        /* A 25 minute call is 20px tall, and the card wants about 40 for its
           three lines. Rather than stretch the box and lie about the duration,
           short calls drop to a single line - the account name, which is the
           part you are scanning for. The time is in the tooltip and on the
           card once it is opened. */
        /* Native drag has to go, or the browser swallows the pointer stream the
           moment the mouse moves and the time never changes. Moving between days
           is handled by the pointer drag instead. */
        el.draggable = false;
        if(!oneDay && ap.dur * PX_MIN < 36) el.classList.add('tiny');
        if(out) el.classList.add('oob');
        el.title = (el.title || '') + (out ? '\nOutside 7am-5pm, shown at the edge' : '');
        makeDraggableAppt(el, ap);
        b.appendChild(el);
      });
      (showKind('task') ? tasksOn(k) : []).forEach(t => {
        const el = taskEl(t, false);
        el.style.top = Math.max(0, Math.min(GRID_H - 18, topFor(t))) + 'px';
        el.style.height = Math.max(18, TASK_DUR * PX_MIN) + 'px';
        if(!oneDay) el.classList.add('tiny');
        makeDraggableAppt(el, t, taskMoved);
        b.appendChild(el);
      });
      // quote requests sit where they were made; they do not move
      (showKind('quote') ? quotesOn(k) : []).forEach(q => {
        const el = quoteEl(q, false);
        el.style.top = Math.max(0, Math.min(GRID_H - 18, topFor(q))) + 'px';
        el.style.height = Math.max(18, TASK_DUR * PX_MIN) + 'px';
        if(!oneDay) el.classList.add('tiny');
        b.appendChild(el);
      });
      /* Clicking empty space books at the time that was clicked, which is the
         whole point of having an hour axis. */
      b.addEventListener('dblclick', e => {
        if(e.target !== b) return;
        const mins = DAY_FROM * 60 + (e.offsetY / PX_MIN);
        openDialog(null, {date:k, start:hhmm(Math.round(mins / 15) * 15)});
      });
      col.appendChild(b);
      const add = document.createElement('button');
      add.className = 'add'; add.type = 'button'; add.textContent = '+ Add call';
      add.onclick = ()=>openDialog(null, {date:k});
      col.appendChild(add);
      const addT = document.createElement('button');
      addT.className = 'add'; addT.type = 'button'; addT.textContent = '+ Task';
      addT.onclick = ()=>openTask(null, {date:k});
      col.appendChild(addT);
      makeDrop(col, k);
      grid.appendChild(col);
    });
    body.appendChild(grid);
  } else {
    const y = plan.anchor.getFullYear(), m = plan.anchor.getMonth();
    $('calTitle').textContent = MONNM[m]+' '+y;
    const grid = document.createElement('div'); grid.className = 'month';
    /* Seven days (v90). Weekdays only hid the tasks and quote requests that
       land on a Saturday or Sunday; the weekend columns are narrower and shaded. */
    ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach((n,i)=>{ const h=document.createElement('div'); h.className='mh'+(i>4?' wknd':''); h.textContent=n; grid.appendChild(h); });
    let cur = startOfWeek(new Date(y,m,1));
    const last = new Date(y,m+1,0);
    while(cur <= last || cur.getMonth() === m){
      for(let i=0;i<7;i++){
        const d = addDays(cur,i), k = iso(d);
        const cell = document.createElement('div');
        cell.className = 'mcell' + (i>4 ? ' wknd' : '') + (d.getMonth()!==m ? ' out' : '') + (k===TODAY ? ' today' : '');
        cell.innerHTML = '<div class="n">'+d.getDate()+'</div>';
        if(showKind('visit')) apptsOn(k).forEach(ap => cell.appendChild(apptEl(ap,true)));
        if(showKind('task')) tasksOn(k).forEach(t => cell.appendChild(taskEl(t,true)));
        if(showKind('quote')) quotesOn(k).forEach(q => cell.appendChild(quoteEl(q,true)));
        cell.addEventListener('dblclick', ()=>openDialog(null, {date:k}));
        makeDrop(cell, k);
        grid.appendChild(cell);
      }
      cur = addDays(cur,7);
      if(cur.getMonth() !== m && cur > last) break;
    }
    body.appendChild(grid);
  }
}
function apptTitle(ap){ return ap.type+': '+ap.acct; }   // a colon, not a dash: account names contain hyphens
function apptEl(ap, pill){
  const a = ACC_BY_NAME.get(ap.acct);
  const st = apState(ap);
  const el = document.createElement('div');
  el.className = (pill ? 'pill ' : 'appt ') + 's-' + st;
  el.draggable = true; el.tabIndex = 0;
  const stTip = ST_LABEL[st] + (ap.expAt ? ' \u00b7 last downloaded '+new Date(ap.expAt).toLocaleString() : '');
  if(pill){
    el.innerHTML = '<span class="pt"></span>'+
                   '<button type="button" class="del" aria-label="Delete" title="Delete">'+icon('trash')+'</button>';
    el.querySelector('.pt').textContent = ap.start+' '+ap.acct;
    el.title = apptTitle(ap)+'\n'+stTip;
    el.querySelector('.del').addEventListener('click', e=>{
      e.stopPropagation();
      deleteApptQuick(ap).catch(err=>{ console.error(err); toast('Could not delete: '+err.message); });
    });
  } else {
    el.innerHTML = '<button type="button" class="del" aria-label="Delete" title="Delete">'+icon('trash')+'</button>'+
                   '<div class="t"><i class="stx"></i><span></span></div>'+
                   '<div class="a"><i class="fd"></i><span></span></div><div class="k"></div>';
    el.querySelector('.t span').textContent = ap.start+' \u00b7 '+ap.dur+' min';
    const fd = el.querySelector('.fd');
    fd.className = 'fd ' + apptFocusCls(ap);
    fd.title = (a ? a.foc : 'No Focus') + ' focus';
    el.querySelector('.a span').textContent = ap.acct;
    el.querySelector('.k').textContent = (ap.unplanned ? 'unplanned \u00b7 ' : '')+
      ST_SHORT[st]+' \u00b7 '+ap.type+(a ? ' \u00b7 '+(a.sub||'no suburb') : '');
    el.title = stTip;
    /* Deleting used to mean opening the dialog just to find the delete button
       inside it. This skips straight there - stopPropagation so the tap
       doesn't also open the dialog underneath it. */
    el.querySelector('.del').addEventListener('click', e=>{
      e.stopPropagation();
      deleteApptQuick(ap).catch(err=>{ console.error(err); toast('Could not delete: '+err.message); });
    });
  }
  el.addEventListener('dragstart', e=>{
    e.dataTransfer.setData('text/plain', JSON.stringify({kind:'appt', id:ap.id}));
    e.dataTransfer.effectAllowed = 'move';
    el.classList.add('drag');
  });
  el.addEventListener('dragend', ()=>el.classList.remove('drag'));
  el.addEventListener('click', e=>{ e.stopPropagation(); openDialog(ap.id); });
  el.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.stopPropagation(); openDialog(ap.id); } });
  return el;
}
async function deleteApptQuick(ap){
  if(!confirm('Delete '+apptTitle(ap)+' on '+ap.date+'?')) return;
  await apptsDel(ap.id);
  APPTS = APPTS.filter(x => x.id !== ap.id);
  renderPlan();
}
function makeDrop(el, k){
  el.addEventListener('dragover', e=>{ e.preventDefault(); el.classList.add('over'); });
  el.addEventListener('dragleave', ()=>el.classList.remove('over'));
  el.addEventListener('drop', async e=>{
    e.preventDefault(); el.classList.remove('over');
    let p; try { p = JSON.parse(e.dataTransfer.getData('text/plain')); } catch(_){ return; }
    if(p.kind === 'appt'){
      const ap = APPTS.find(x => x.id === p.id);
      // moving it to another day is an edit, so it goes back to changed
      if(ap && ap.date !== k){ ap.date = k; await saveAppt(ap); renderPlan(); }
    } else if(p.kind === 'acct'){
      openDialog(null, {acct:p.acct, date:k});
    }
  });
}

/* ---------- appointment dialog ---------- */
let editingAppt = null, dlgAppt = null;
function openDialog(id, seed){
  seed = seed || {};
  let ap;
  if(id){
    ap = APPTS.find(x => x.id === id);
    if(!ap) return;
    editingAppt = id;
  } else {
    const acct = seed.acct || (visibleAccounts()[0]||{}).a;
    if(!acct){ toast('Pick an account first'); return; }
    const a = ACC_BY_NAME.get(acct);
    ap = {id:null, acct:acct, type:'Intralox site visit',
          date: seed.date || iso(weekDays()[0]), start:seed.start || '09:00', dur:DEF_DUR, agenda:'',
          /* The contact list is already role-ranked, so the first few are the
             people a belt call is actually for. Ticking all fourteen on a large
             account put all fourteen onto any visit started from the
             appointment, and from there onto the report. */
          contacts: (a && a.c ? a.c.map((_,i)=>i).slice(0, 3) : [])};
    editingAppt = null;
  }
  const a = ACC_BY_NAME.get(ap.acct);
  $('dTitle').textContent = (id ? 'Edit ' : 'New ') + 'appointment \u2014 ' + ap.acct;
  $('dSub').textContent = a
    ? [zoneName(a.z), a.sub||'no suburb', a.foc+' focus', a.tier||'no tier',
       a.seg||'no segment', a.cad, a.mgr||'unassigned'].join(' \u00b7 ')
    : 'Not in the account database';
  $('dType').value = ap.type;
  $('dDate').value = ap.date;
  $('dTime').value = ap.start;
  $('dDur').value = String(ap.dur);
  $('dAgenda').value = ap.agenda || '';

  const box = $('dCts'); box.innerHTML = '';
  const cs = a && a.c ? a.c : [];
  cs.forEach((c,i)=>{
    const row = document.createElement('label'); row.className = 'ct';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.dataset.i = i; cb.checked = ap.contacts.includes(i);
    row.appendChild(cb);
    const l = document.createElement('div');
    l.innerHTML = '<div class="cn"></div><div class="cr"></div>';
    l.querySelector('.cn').textContent = c.n;
    l.querySelector('.cr').textContent = [c.r, c.t].filter(Boolean).join(' \u2014 ') || 'no role recorded';
    row.appendChild(l);
    const p = document.createElement('div'); p.className = 'cp';
    if(c.p){ p.textContent = c.p + (c.pk === 'check' ? ' (check)' : ''); if(c.pk === 'check') p.classList.add('miss'); }
    else { p.textContent = 'no number on file'; p.classList.add('miss'); }
    row.appendChild(p);
    box.appendChild(row);
  });
  const withP = cs.filter(c => c.p).length;
  const cover = $('dCover');
  cover.textContent = withP+' of '+cs.length+' contacts have a phone number on file. '+
    'Missing numbers are marked in the invite.';
  cover.className = 'note' + (withP === 0 ? ' warn' : '');

  const sync = $('dSync');
  if(id){
    const st = apState(ap);
    sync.hidden = false;
    sync.className = 'note sync' + (st==='synced' ? ' ok' : st==='changed' ? ' chg' : '');
    sync.textContent = ST_LABEL[st] +
      (ap.expAt ? ' \u00b7 downloaded '+new Date(ap.expAt).toLocaleString() : '') +
      (st === 'changed' ? '. Download again to update the Outlook entry.' : '');
  } else {
    sync.hidden = true;
  }
  $('dHold').checked = !!ap.hold;
  $('dDel').hidden = !id;
  /* The details stay here for the invite; this goes into the call (v86).
     Only for a saved visit: a new one has nothing to start yet. A finished
     visit with no call behind it has nothing to open. */
  $('dStart').hidden = !id || (apSettled(ap) && !ap.callId);
  $('dStart').textContent = ap.callId ? 'Open the call' : 'Start the call';
  $('dPrep').hidden = !id;                 // the sales coach's brief, for a saved visit
  dlgAppt = ap;
  const dlg = $('dlg');
  if(dlg.showModal) dlg.showModal(); else dlg.setAttribute('open','');
  pushDialog('dlg');
}
function closeDialog(){
  const dlg = $('dlg');
  if(!dlg.hasAttribute('open')){ dlgAppt = null; editingAppt = null; return; }
  // let popstate do the closing, so the history entry is consumed either way
  if(history.state && history.state.dialog === 'dlg'){ history.back(); return; }
  if(dlg.close) dlg.close(); else dlg.removeAttribute('open');
  dlgAppt = null; editingAppt = null;
}
async function saveDialog(keepOpen){
  const ap = dlgAppt;
  if(!ap) return;
  ap.type = $('dType').value;
  ap.date = $('dDate').value;
  ap.start = $('dTime').value || '09:00';
  ap.dur = parseInt($('dDur').value,10) || DEF_DUR;
  ap.agenda = $('dAgenda').value;
  ap.hold = $('dHold').checked;
  ap.contacts = [...$('dCts').querySelectorAll('input:checked')].map(x => +x.dataset.i);
  /* A visit on a Saturday or Sunday stays there (v94). It used to move to the
     Monday because the Week view had no weekend to show it on; it has now. */
  if(!editingAppt){
    ap.id = 'ap' + Date.now().toString(36) + (plan.seq++);
    APPTS.push(ap);
  }
  await saveAppt(ap);
  if(keepOpen) return ap;
  closeDialog();
  renderPlan();
}
/* Start the call from the appointment: keep whatever was just edited, then go
   into the call. The dialog is shut directly rather than through history.back,
   which would race the move to the call screen. */
async function startFromDialog(){
  if(!editingAppt) return;
  const ap = await saveDialog(true);
  const dlg = $('dlg');
  if(dlg.close) dlg.close(); else dlg.removeAttribute('open');
  dlgAppt = null; editingAppt = null;
  if(ap) await openVisit(ap.id);
}
async function deleteDialog(){
  if(!editingAppt) return;
  const ap = APPTS.find(x => x.id === editingAppt);
  if(!confirm('Delete '+(ap ? apptTitle(ap)+' on '+ap.date : 'this appointment')+'?')) return;
  await apptsDel(editingAppt);
  APPTS = APPTS.filter(x => x.id !== editingAppt);
  closeDialog();
  renderPlan();
}
$('dSave').addEventListener('click', ()=>saveDialog().catch(e=>{ console.error(e); toast('Could not save: '+e.message); }));
$('dCancel').addEventListener('click', closeDialog);
$('dStart').addEventListener('click', ()=>startFromDialog().catch(e=>{ console.error(e); toast('Could not start the call: '+e.message); }));
$('dDel').addEventListener('click', ()=>deleteDialog().catch(e=>{ console.error(e); toast('Could not delete: '+e.message); }));

/* ---------- plan wiring ---------- */
function renderPlan(){
  fillPlanControls();
  renderChips();
  renderDueToggle();
  renderRail();
  renderCalendar();
  renderTerritory();
  renderPlanCount();
}
function renderPlanCount(){
  const el = $('planInfo');
  if(!el) return;
  if(!APPTS.length){ el.textContent = 'Nothing planned'; return; }
  const p = pendingAppts(APPTS).length;
  el.textContent = APPTS.length+' planned'+(p ? ', '+p+' not in Outlook' : '');
}
$('pDueOnly').addEventListener('click', ()=>{ plan.dueOnly = !plan.dueOnly; renderPlan(); });
$('pSearch').innerHTML = icon('search') + '<span>Search the whole account book</span>';
$('pSearch').addEventListener('click', () => openSearch({
  placeholder: 'Account, suburb, contact, zone or manager',
  value: plan.q,
  render(q, el, hint){
    if(!q){ el.innerHTML = ''; hint.textContent = ''; return; }
    const hits = searchAll(q);
    hint.textContent = hits.length ? hits.length + (hits.length === 1 ? ' account' : ' accounts') + ' across the whole book'
      : 'Nothing matches that.';
    /* Picking one books it, as clicking it in the list does. Dragging needs the
       list, so the matches can be put there too. */
    el.innerHTML = (hits.length > 1 ? '<button type="button" class="ghost fs-all" id="fsToList">Show these ' + hits.length + ' in the planner list</button>' : '') +
      hits.slice(0, 100).map(a => '<button type="button" class="fs-acct ' + (FOC_CLS[a.foc] || 'none') + '" data-fsacct="' + esc(a.a) + '">' +
        '<div class="an">' + esc(a.a) + '</div>' +
        '<div class="am">' + [a.sub, zoneName(a.z), a.foc, effMgr(a)].filter(Boolean).map(esc).join(' &middot; ') + '</div></button>').join('') +
      (hits.length > 100 ? '<p class="hint">' + (hits.length - 100) + ' more \u2014 add another word</p>' : '');
    const all = el.querySelector('#fsToList');
    if(all) all.addEventListener('click', () => { plan.q = q; closeSearch(); renderPlan(); });
    el.querySelectorAll('[data-fsacct]').forEach(b => b.addEventListener('click', () => {
      closeSearch(); openDialog(null, {acct: b.dataset.fsacct});
    }));
  }
}));
$('pMgr').addEventListener('change', ()=>{ plan.mgr = $('pMgr').value; renderPlan(); });
$('pZone').addEventListener('change', ()=>{ plan.zone = $('pZone').value; renderPlan(); });
$('pView').querySelectorAll('button').forEach(b => b.addEventListener('click', ()=>{
  plan.view = b.dataset.v;
  $('pView').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  renderCalendar(); renderTerritory();
}));
$('calPrev').addEventListener('click', ()=>{
  plan.anchor = plan.view === 'day' ? addDays(plan.anchor,-1)
    : plan.view === 'week' ? addDays(plan.anchor,-7)
    : new Date(plan.anchor.getFullYear(), plan.anchor.getMonth()-1, 1);
  renderCalendar(); renderTerritory();
});
$('calNext').addEventListener('click', ()=>{
  plan.anchor = plan.view === 'day' ? addDays(plan.anchor,1)
    : plan.view === 'week' ? addDays(plan.anchor,7)
    : new Date(plan.anchor.getFullYear(), plan.anchor.getMonth()+1, 1);
  renderCalendar(); renderTerritory();
});
$('calToday').addEventListener('click', ()=>{
  plan.anchor = plan.view === 'week' ? startOfWeek(new Date()) : new Date();   // day and month both want today
  renderCalendar(); renderTerritory();
});

/* ================= territory weeks and reassignment =================

   A territory week is a whole-week banner saying which zone you are working,
   published into other people's calendars so they can see where you are without
   opening your calls. Deliberately not an appointment: an all-day Monday to
   Friday event marked FREE, so it never blocks your availability or anyone's
   free/busy lookup. Keyed by the Monday, one zone per week.

   Reassignment overrides the CRM's Account Manager everywhere in this app -
   filtering, zone counts, focus chips, invites, the high-focus cap. It never
   writes to Dynamics; the CSV is what goes to whoever does. */

let WEEKS = {}, MGR_OF = {};

const effMgr = a => (MGR_OF[a.a] !== undefined ? MGR_OF[a.a] : a.mgr);
const isMoved = a => MGR_OF[a.a] !== undefined && MGR_OF[a.a] !== a.mgr;
function allManagers(){
  const s = new Set();
  ACCOUNTS.forEach(a => { if(a.mgr) s.add(a.mgr); const e = effMgr(a); if(e) s.add(e); });
  return [...s].sort();
}
// No more than 5 High-focus accounts per manager per zone. Past that the answer
// is to split the zone, not to carry the load.
const HIGH_CAP = 5;

function wkRev(w){ return (w.zone||'')+'|'+(w.note||''); }
function wkState(w){ return !w.exp ? 'new' : (w.exp === wkRev(w) ? 'synced' : 'changed'); }
function weeksList(){
  return Object.keys(WEEKS).filter(k => WEEKS[k] && WEEKS[k].zone)
    .sort().map(k => Object.assign({mon:k}, WEEKS[k]));
}
function pendingWeeks(list){ return list.filter(w => wkState(w) !== 'synced'); }
async function saveWeeks(){ await kvSet('weeks', WEEKS); }
async function saveMgrOf(){ await kvSet('mgrOf', MGR_OF); }

/* Which weeks the current view covers. Counts and export buttons act on what is
   on screen, so this has to agree with the calendar. */
function viewWeeks(){
  if(plan.view === 'week') return [iso(startOfWeek(plan.anchor))];
  const y = plan.anchor.getFullYear(), m = plan.anchor.getMonth();
  const out = [];
  let cur = startOfWeek(new Date(y,m,1));
  const last = new Date(y,m+1,0);
  while(cur <= last || cur.getMonth() === m){
    out.push(iso(cur));
    cur = addDays(cur,7);
    if(cur.getMonth() !== m && cur > last) break;
  }
  return out;
}
// Where the calls that week actually are, so the marker can be suggested rather
// than typed from memory.
function suggestZone(mon){
  const start = parseIso(mon), end = addDays(start,4), n = {};
  APPTS.forEach(ap=>{
    const d = parseIso(ap.date);
    if(d < start || d > end) return;
    const a = ACC_BY_NAME.get(ap.acct);
    if(a) n[a.z] = (n[a.z]||0)+1;
  });
  const best = Object.keys(n).sort((x,y)=>n[y]-n[x])[0];
  return best ? {zone:best, n:n[best]} : null;
}

function renderTerritory(){
  const bar = $('terr');
  if(!bar) return;
  const mons = viewWeeks();
  bar.innerHTML = '';
  bar.className = 'terr';

  const lab = document.createElement('div');
  lab.className = 'tl';
  lab.textContent = plan.view === 'week' ? 'Territory this week' : 'Territory weeks';
  bar.appendChild(lab);

  mons.forEach(mon=>{
    const w = WEEKS[mon] || {};
    const box = document.createElement('div'); box.className = 'wk';
    if(plan.view !== 'week'){
      const l = document.createElement('label');
      const d = parseIso(mon);
      l.textContent = 'wk '+d.getDate()+' '+MONNM[d.getMonth()].slice(0,3);
      box.appendChild(l);
    }
    const sel = document.createElement('select');
    const none = document.createElement('option');
    none.value = ''; none.textContent = '\u2014 no marker \u2014';
    sel.appendChild(none);
    const sug = suggestZone(mon);
    ZONE_ORDER.filter(z => ZONES[z]).forEach(z=>{
      const o = document.createElement('option');
      o.value = z;
      o.textContent = zoneName(z) +
        (sug && sug.zone === z ? '  ('+sug.n+' call'+(sug.n===1?'':'s')+' booked)' : '');
      sel.appendChild(o);
    });
    sel.value = w.zone || '';
    /* Z12 is the unresolved bucket, not a geography. A week marker saying you
       are "in Z12" tells a colleague nothing about where you actually are. */
    if(w.zone === 'Z12') sel.title = 'Z12 is the catch-all for accounts whose suburb would not resolve. '+
      'It is not a place - pick the real region you will be in.';
    else if(!w.zone && sug) sel.title = 'Suggestion: '+sug.zone+' - '+sug.n+' call'+(sug.n===1?'':'s')+' booked that week';
    sel.onchange = async ()=>{
      if(!sel.value) delete WEEKS[mon];
      else WEEKS[mon] = Object.assign({}, WEEKS[mon]||{}, {zone: sel.value});
      await saveWeeks();
      renderTerritory();
    };
    box.appendChild(sel);
    bar.appendChild(box);
  });

  const list = weeksList().filter(w => mons.includes(w.mon));
  if(plan.view === 'week' && list.length){
    const w = list[0], st = wkState(w), z = ZONES[w.zone];
    const s = document.createElement('div');
    s.className = 'sum s-'+st;
    s.innerHTML = '<i class="stx"></i>';
    s.appendChild(document.createTextNode(
      (z && z.hub !== 'n/a' ? 'Hub '+z.hub+' \u00b7 ' : '') + ST_SHORT[st]));
    bar.appendChild(s);
  }

  const rt = document.createElement('div'); rt.className = 'rt';
  const pend = pendingWeeks(weeksList()).length;
  const b = document.createElement('button');
  b.className = 'btn'; b.type = 'button';
  b.textContent = 'Download week markers' + (pend ? ' ('+pend+')' : '');
  b.disabled = !weeksList().length;
  b.onclick = ()=>exportWeeks(pend ? 'pending' : 'all').catch(reportErr);
  rt.appendChild(b);
  bar.appendChild(rt);
}

/* ---------- week marker ICS ----------
   No VTIMEZONE and no VALUE=DATE-TIME anywhere here. An all-day event is a
   floating date, so the marker reads Monday to Friday in Perth, Auckland and
   Brisbane alike, without any of the Z12 assumed-timezone trouble. */
function dstamp(d){ const p = n => String(n).padStart(2,'0');
  return d.getFullYear()+p(d.getMonth()+1)+p(d.getDate()); }
function buildWeekIcs(list){
  const L = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Intralox//Field CRM//EN',
             'CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:Intralox territory weeks'];
  list.forEach(w=>{
    const z = ZONES[w.zone] || {name:'unzoned', hub:'n/a', cov:''};
    const mon = parseIso(w.mon), fri = addDays(mon,4);
    const who = plan.mgr || '';
    const calls = APPTS.filter(ap=>{
      const d = parseIso(ap.date); return d >= mon && d <= fri;
    });
    const inZone = calls.filter(ap=>{ const a = ACC_BY_NAME.get(ap.acct); return a && a.z === w.zone; });
    const txt = [];
    txt.push('Working ' + zoneName(w.zone));
    if(z.hub && z.hub !== 'n/a') txt.push('Hub: '+z.hub);
    if(z.cov && z.cov !== 'unresolved') txt.push('Covers: '+z.cov);
    txt.push('Week of '+mon.getDate()+' '+MONNM[mon.getMonth()]+' '+mon.getFullYear()+', Monday to Friday.');
    if(calls.length){
      txt.push('', calls.length+' call'+(calls.length===1?'':'s')+' planned'+
        (inZone.length !== calls.length ? ' ('+inZone.length+' in zone)' : '')+':');
      calls.slice().sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start))
        .forEach(ap=>{
          const a = ACC_BY_NAME.get(ap.acct);
          txt.push('  '+DAYNM[(parseIso(ap.date).getDay()+6)%7].slice(0,3)+' '+ap.start+
            '  '+ap.acct+(a && a.z !== w.zone ? '  ['+a.z+']' : ''));
        });
    } else {
      txt.push('', 'No calls booked yet.');
    }
    if(w.note) txt.push('', w.note);
    txt.push('', 'Availability marker only \u2014 shown as free, so it will not block bookings.');

    L.push('BEGIN:VEVENT');
    L.push('UID:wk-'+w.mon+'@field-crm.intralox');
    L.push('SEQUENCE:'+(w.icsSeq||0));
    L.push('DTSTAMP:'+stamp());
    L.push('LAST-MODIFIED:'+stamp());
    // DTEND on an all-day event is exclusive, so Saturday closes a Mon-Fri span
    L.push('DTSTART;VALUE=DATE:'+dstamp(mon));
    L.push('DTEND;VALUE=DATE:'+dstamp(addDays(mon,5)));
    L.push('SUMMARY:'+icsEsc((who ? who+' \u2014 ' : '')+w.zone+' '+z.name));
    L.push('LOCATION:'+icsEsc(z.hub && z.hub !== 'n/a' ? z.hub : z.name));
    L.push('DESCRIPTION:'+icsEsc(txt.join('\n')));
    L.push('CATEGORIES:'+icsEsc('Territory week,'+w.zone));
    // A week-long banner must never eat availability.
    L.push('TRANSP:TRANSPARENT');
    L.push('X-MICROSOFT-CDO-BUSYSTATUS:FREE');
    L.push('X-MICROSOFT-CDO-INTENDEDSTATUS:FREE');
    L.push('X-MICROSOFT-CDO-ALLDAYEVENT:TRUE');
    L.push('END:VEVENT');
  });
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}
async function exportWeeks(mode){
  const all = weeksList();
  if(!all.length){ toast('No territory weeks set. Pick a zone above the calendar.'); return; }
  const list = mode === 'all' ? all : pendingWeeks(all);
  if(!list.length){ toast('Every week marker is already downloaded.'); return; }
  for(const w of list){
    const cur = WEEKS[w.mon];
    if(cur.icsSeq == null) cur.icsSeq = 0;
    else if(wkState(cur) === 'changed') cur.icsSeq++;
    w.icsSeq = cur.icsSeq;
  }
  downloadFile('territory-weeks-'+list[0].mon+(list.length>1?'-x'+list.length:'')+'.ics',
               buildWeekIcs(list), 'text/calendar;charset=utf-8');
  const now = Date.now();
  for(const w of list){ const cur = WEEKS[w.mon]; cur.exp = wkRev(cur); cur.expAt = now; }
  await saveWeeks();
  renderTerritory();
  toast(list.length+' week marker'+(list.length===1?'':'s')+' downloaded');
}

/* ---------- reassignment ---------- */
let rScopes = [], rPick = 0;
function scopeAccounts(sc){
  if(!sc) return [];
  if(sc.kind === 'account')  return ACCOUNTS.filter(a => a.a === sc.account);
  if(sc.kind === 'zone')     return ACCOUNTS.filter(a => a.z === sc.zone);
  if(sc.kind === 'filtered') return visibleAccounts();
  if(sc.kind === 'mgrzone')  return ACCOUNTS.filter(a => a.z === sc.zone && effMgr(a) === sc.from);
  return [];
}
function openReassign(seed){
  seed = seed || {};
  if(!ACCOUNTS.length){ toast('Import the CRM export first'); return; }
  rScopes = [];
  if(seed.account){
    const a = ACC_BY_NAME.get(seed.account);
    if(a) rScopes.push({kind:'account', account:seed.account, label:'This account only', detail:a.a});
  }
  const z = plan.zone;
  if(z && ZONES[z]){
    rScopes.push({kind:'zone', zone:z, label:'Every account in '+zoneName(z),
      detail: ACCOUNTS.filter(a => a.z === z).length+' accounts, all managers'});
    if(plan.mgr){
      rScopes.push({kind:'mgrzone', zone:z, from:plan.mgr,
        label: plan.mgr+"'s accounts in "+z,
        detail: ACCOUNTS.filter(a => a.z === z && effMgr(a) === plan.mgr).length+' accounts'});
    }
  }
  rScopes.push({kind:'filtered', label:'The '+visibleAccounts().length+' accounts currently listed',
    detail:'Respects the zone, manager, focus and search filters'});
  rPick = 0;

  const box = $('rScope'); box.innerHTML = '';
  rScopes.forEach((sc,i)=>{
    const l = document.createElement('label');
    l.dataset.on = (i === 0);
    l.innerHTML = '<input type="radio" name="rsc" value="'+i+'"'+(i===0?' checked':'')+'>'+
      '<div><div>'+esc(sc.label)+'</div><div class="sc-n">'+esc(sc.detail)+'</div></div>';
    l.querySelector('input').onchange = ()=>{
      rPick = i;
      [...box.children].forEach((c,j)=>c.dataset.on = (j === i));
      rRefresh();
    };
    box.appendChild(l);
  });

  const sel = $('rTo'); sel.innerHTML = '';
  allManagers().forEach(m=>{ const o = document.createElement('option'); o.value = m; o.textContent = m; sel.appendChild(o); });
  const un = document.createElement('option'); un.value = '__none__'; un.textContent = 'Unassigned'; sel.appendChild(un);
  const nw = document.createElement('option'); nw.value = '__new__'; nw.textContent = 'Add a new manager\u2026'; sel.appendChild(nw);
  sel.onchange = ()=>{ $('rNewWrap').hidden = sel.value !== '__new__'; rRefresh(); };
  $('rNew').oninput = rRefresh;
  $('rNewWrap').hidden = true;
  rRefresh();
  const dlg = $('rdlg');
  if(dlg.showModal) dlg.showModal(); else dlg.setAttribute('open','');
  pushDialog('rdlg');
}
function rTarget(){
  const v = $('rTo').value;
  if(v === '__new__') return $('rNew').value.trim();
  if(v === '__none__') return '';
  return v;
}
function rRefresh(){
  const sc = rScopes[rPick], to = rTarget();
  const accts = scopeAccounts(sc);
  const moving = accts.filter(a => effMgr(a) !== to);
  const hi = moving.filter(a => a.foc === 'High').length;
  const prev = $('rPreview');
  prev.className = 'note';
  prev.textContent = !to
    ? 'Moving '+moving.length+' of '+accts.length+' accounts to unassigned. '+
      'Unassigned accounts still appear under "Every manager".'
    : 'Moving '+moving.length+' of '+accts.length+' accounts to '+to+
      (hi ? ', including '+hi+' High-focus.' : '.')+
      (moving.length === 0 ? ' Nothing to do - they are already there.' : '');

  // Project the cap as it would stand after the move, not as it stands now.
  const after = {};
  ACCOUNTS.forEach(a=>{
    if(a.foc !== 'High') return;
    const m = moving.includes(a) ? to : effMgr(a);
    if(!m) return;
    (after[m] = after[m] || {})[a.z] = (after[m][a.z]||0)+1;
  });
  const cap = $('rCap'); cap.innerHTML = '';
  const rows = [];
  Object.keys(after).sort().forEach(m => Object.keys(after[m]).forEach(z => rows.push([m,z,after[m][z]])));
  const breaches = rows.filter(r => r[2] > HIGH_CAP);
  const show = breaches.length ? breaches
             : rows.filter(r => to && r[0] === to).sort((a,b)=>b[2]-a[2]).slice(0,6);
  if(!show.length){
    cap.innerHTML = '<div class="caprow"><span class="cz">No High-focus accounts affected.</span></div>';
  } else {
    cap.innerHTML = show.map(([m,z,n]) =>
      '<div class="caprow'+(n > HIGH_CAP ? ' over' : '')+'">'+
      '<span class="cz">'+esc(m)+' \u00b7 '+esc(zoneName(z))+'</span>'+
      '<span class="cn">'+n+' / '+HIGH_CAP+'</span></div>').join('');
  }
  if(breaches.length){
    prev.className = 'note warn';
    prev.textContent += ' This breaches the '+HIGH_CAP+' High-focus cap in '+breaches.length+
      ' manager/zone combination'+(breaches.length===1?'':'s')+' - the answer is to split the zone.';
  }
}
async function applyReassign(revert){
  const accts = scopeAccounts(rScopes[rPick]);
  if(revert){
    accts.forEach(a => { delete MGR_OF[a.a]; });
  } else {
    if($('rTo').value === '__new__' && !rTarget()){
      toast('Type a name for the new manager, or pick an existing one');
      return;
    }
    const to = rTarget();
    accts.forEach(a => { if(a.mgr === to) delete MGR_OF[a.a]; else MGR_OF[a.a] = to; });
  }
  await saveMgrOf();
  if(plan.mgr && !allManagers().includes(plan.mgr)) plan.mgr = '';
  ACCOUNTS.forEach(a => { delete a._hay; });   // manager is searchable, so recache
  closeReassign();
  renderPlan();
  toast((revert ? 'Put back to the CRM: ' : 'Reassigned ')+accts.length+' account'+(accts.length===1?'':'s'));
}
function closeReassign(){
  const dlg = $('rdlg');
  if(!dlg.hasAttribute('open')) return;
  if(history.state && history.state.dialog === 'rdlg'){ history.back(); return; }
  if(dlg.close) dlg.close(); else dlg.removeAttribute('open');
}
$('rApply').addEventListener('click', ()=>applyReassign(false).catch(reportErr));
$('rRevert').addEventListener('click', ()=>applyReassign(true).catch(reportErr));
$('rCancel').addEventListener('click', closeReassign);
$('pReassign').addEventListener('click', ()=>openReassign({}));

/* ================= notes back into Dynamics =================

   Two problems, one answer.

   Dynamics server-side sync reads DESCRIPTION, not X-ALT-DESC. Outlook reads the
   HTML. So both bodies are written, and both are built from the same data rather
   than one being derived from the other by stripping tags out of the other.

   Photos cannot go in a calendar invite at all: cid: has no MIME parts to point
   at in an .ics, external URLs are blocked until the recipient clicks through,
   and Outlook desktop blocks data: base64 outright. So the calendar copy is an
   index, not the record - it says what photos exist and which file has them. The
   full HTML with the images still goes to OneDrive by share sheet.

   And the calendar is not the system of record either. Notes that only ever
   reach Outlook leave the next CRM export showing those accounts idle and
   unrated, so call-notes.csv is the paste-ready route into Dynamics. */

/* The extra belt fields, in the order they read on a datasheet. Anything empty
   is dropped, so a belt logged without flights does not print eight blank rows. */
const BELT_DETAIL = [
  ['sprbore','Sprocket bore'], ['sprpd','Pitch diameter / teeth'], ['sprmat','Sprocket material'],
  ['sprvar','Sprocket variant'], ['sprspacers','Sprocket spacers'],
  ['sprhdret','Heavy duty retainers'], ['sprhdretqty','Retainer qty'],
  ['fstyle','Flight type'], ['flmat','Flight material'], ['fheight','Flight height (mm)'],
  ['frows','Flights every N rows'], ['fspacing','Flight spacing (mm)'],
  ['findent','Indent (mm)'], ['cnotch','Centre notch (mm)'],
  ['sgtype','Sideguard type'], ['sgmat','Sideguard material'], ['sgheight','Sideguard height (mm)']
];
function callSummary(c){
  if(!c) return null;
  const E = t => (c.entries||[]).filter(e => e.type === t);
  const photos = (c.entries||[]).reduce((n,e) =>
      n + (e.photos||[]).length + (e.detached ? e.detached.n : 0), 0) +
    (c.loose||[]).length + (c.looseDetached ? c.looseDetached.n : 0);
  return {
    date: c.date, type: c.type, site: c.site || '',
    status: c.status || (c.closed ? 'done' : 'in progress'),
    noReport: !!c.noReport && !(c.entries||[]).length,
    // the invite is a customer document, so it follows the same tick as the rest
    contacts: (c.contacts||[]).filter(docContact)
                .map(x => ({n:x.name, r:x.role||'', crm:x.crm !== false})),
    belts: E('belt').map(e => ({
      asset:e.asset, desc:e.beltdesc, series:e.series, style:e.style,
      width:e.width, clen:e.clength, frame:e.frame, beltlen:e.beltlen,
      mat:e.beltmat, colour:e.colour, rod:e.rodmat, retro:e.retrofit,
      sprk:e.sprocket, sprpn:e.sprpn, sprdrive:e.sprdrive, spridle:e.spridle,
      qc:e.qcontact,
      // the v13 form carries far more than the five flight fields v8 had
      flights: BELT_DETAIL.map(([k,label]) => [label, e[k]])
                 .filter(x => x[1] !== '' && x[1] != null && x[1] !== false && x[1] !== 'N/A')
    })),
    projects: E('project').map(e => ({
      name:e.project, status:e.status, next:e.next, target:e.target, owner:e.owner, notes:e.notes
    })),
    notes: E('note').map(e => ({topic:e.topic, text:e.text})),
    health: E('health').slice().sort(byWorkOrder).map(e => ({
      asset:e.asset, fault:e.fault, htype:e.htype, severity:e.severity, action:e.action,
      priority:e.priority, owner:e.owner, due:e.due
    })),
    photos: photos,
    file: c.sharedAs || ''
  };
}
// What the invite body actually says, so a change to it flips the appointment.
function sumRev(s){ return s ? JSON.stringify(s) : ''; }

const NO_OUTLOOK_EDITS =
  'Written in Field CRM. Do not type into this invite - re-downloading replaces the body ' +
  'and anything added in Outlook is lost.';

function notesText(s){
  if(!s) return '';
  const L = [], D = v => (v == null || String(v).trim() === '' || v === 'N/A') ? '\u2014' : String(v).trim();
  L.push('CALL NOTES \u2014 ' + s.date + (s.site ? ' \u00b7 ' + s.site : ''));
  if(s.noReport){
    L.push('', 'Visit completed. Nothing to report.');
  } else {
    if(s.contacts.length) L.push('Seen: ' + s.contacts.map(c =>
      c.n + (c.r ? ' (' + c.r + ')' : '') + (c.crm ? '' : ' [not in CRM]')).join(', '));
    s.belts.forEach((b,i)=>{
      L.push('', 'BELT ' + (i+1) + ' \u2014 ' + D(b.asset));
      L.push('  Belt: ' + D(b.desc) + '   Width: ' + D(b.width) + ' mm   Centre line: ' + D(b.clen) + ' m');
      L.push('  Belt material: ' + D(b.mat) + '   Rod: ' + D(b.rod) + '   Retrofit: ' + D(b.retro));
      L.push('  Sprockets: ' + D(b.sprk));
      b.flights.forEach(([k,v]) => L.push('  ' + k + ': ' + D(v)));
      if(b.qc) L.push('  Quote to: ' + b.qc);
    });
    s.health.forEach((h,i)=>{
      L.push('', 'HEALTH CHECK ' + (i+1) + ' \u2014 ' + D(h.asset));
      L.push('  ' + D(h.fault));
      L.push('  Type: ' + D(h.htype) + '   Severity: ' + D(h.severity));
      if(h.action) L.push('  Action: ' + h.action);
    });
    s.projects.forEach(p=>{
      L.push('', 'PROJECT \u2014 ' + D(p.name));
      L.push('  Status: ' + D(p.status) + '   Target: ' + D(p.target) + '   Owner: ' + D(p.owner));
      if(p.next) L.push('  Next: ' + p.next);
      if(p.notes) L.push('  ' + p.notes);
    });
    s.notes.forEach(n => L.push('', (n.topic || 'Note').toUpperCase(), '  ' + n.text));
  }
  // An index, not the record: the invite cannot carry the images.
  if(s.photos) L.push('', s.photos + ' photo' + (s.photos===1?'':'s') + ' taken. ' +
    (s.file ? 'Full notes with images: ' + s.file : 'Full notes with images shared to OneDrive.'));
  L.push('', NO_OUTLOOK_EDITS);
  return L.join('\n');
}
/* Built from the same data as the text, not by stripping the full HTML. Outlook
   converts the body to RTF and keeps only inline styles - a <style> block and
   every CSS class is discarded, so there are none here. */
function notesHtml(s){
  if(!s) return '';
  const F = 'font-family:Arial,Helvetica,sans-serif';
  const D = v => (v == null || String(v).trim() === '' || v === 'N/A') ? '&mdash;' : esc(String(v).trim());
  const H = t => '<p style="margin:16px 0 4px;color:#00708D;font-size:11px;letter-spacing:.08em">'+
    '<b>'+esc(t)+'</b></p>';
  const tbl = rows => '<table cellpadding="5" style="border-collapse:collapse;font-size:12px;'+
    'border:1px solid #CCCCCC;'+F+'">' + rows.map(([k,v]) =>
      '<tr><td style="background:#F7F8F8;color:#4D4D4F;border:1px solid #CCCCCC;white-space:nowrap">'+
      esc(k)+'</td><td style="border:1px solid #CCCCCC">'+D(v)+'</td></tr>').join('') + '</table>';

  let h = '<div style="'+F+';font-size:13px;color:#222222">';
  h += '<div style="border-left:4px solid #ED1C24;padding-left:10px;margin:14px 0 10px">'+
       '<div style="font-size:14px;font-weight:bold">Call notes &mdash; '+esc(s.date)+
       (s.site ? ' &middot; '+esc(s.site) : '')+'</div></div>';
  if(s.noReport){
    h += '<p>Visit completed. Nothing to report.</p>';
  } else {
    if(s.contacts.length) h += '<p style="font-size:12px;color:#4D4D4F">Seen: '+
      s.contacts.map(c => esc(c.n) + (c.r ? ' ('+esc(c.r)+')' : '') +
        (c.crm ? '' : ' <span style="color:#B2232F">[not in CRM]</span>')).join(', ')+'</p>';
    s.belts.forEach((b,i)=>{
      h += H('BELT '+(i+1)+' \u2014 '+(b.asset||''));
      h += tbl([['Belt', b.desc], ['Width (mm)', b.width], ['Centre line (m)', b.clen],
                ['Belt material', b.mat], ['Rod material', b.rod], ['Retrofit', b.retro],
                ['Sprockets', b.sprk]].concat(b.flights)
                .concat(b.qc ? [['Quote to', b.qc]] : []));
    });
    s.health.forEach((x,i)=>{
      h += H('HEALTH CHECK '+(i+1)+' \u2014 '+(x.asset||''));
      h += tbl([['Fault', x.fault], ['Type', x.htype], ['Severity', x.severity], ['Action', x.action]]);
    });
    s.projects.forEach(p=>{
      h += H('PROJECT \u2014 '+(p.name||''));
      h += tbl([['Status', p.status], ['Next action', p.next], ['Target', p.target],
                ['Owner', p.owner], ['Notes', p.notes]]);
    });
    s.notes.forEach(n=>{
      h += H((n.topic || 'Note').toUpperCase());
      h += '<div style="font-size:12.5px">'+esc(n.text).replace(/\n/g,'<br>')+'</div>';
    });
  }
  if(s.photos) h += '<p style="margin-top:14px;font-size:12px;color:#4D4D4F">'+
    '<b>'+s.photos+' photo'+(s.photos===1?'':'s')+' taken.</b> Images cannot travel in a calendar '+
    'invite. '+(s.file ? 'Full notes with images: '+esc(s.file) : 'Full notes with images shared to OneDrive.')+'</p>';
  h += '<p style="margin-top:16px;font-size:10px;color:#77787A;border-top:1px solid #E3E3E3;'+
       'padding-top:8px">'+esc(NO_OUTLOOK_EDITS)+'</p>';
  return h + '</div>';
}

/* ---------- ICS export ----------
   Outlook is the target and Outlook is fussy. Three things carry the whole
   thing and none of them are obvious:

   UID must not contain the date. Outlook keys off it. A date-bearing UID made a
   moved appointment arrive as a second entry and left the original sitting on
   the old day. A stable UID plus a rising SEQUENCE makes a re-download update
   the item in place.

   SEQUENCE rises only when the appointment has actually changed since it was
   last written. Bumping it every time would be harmless but noisy; never
   bumping it means Outlook silently ignores the update.

   The green state is set after the file is handed over, not before. If the
   download fails the appointment stays amber and gets written again. */

const TZDB = {
  'Australia/Sydney':   {std:['+1100','+1000','AEST','19700405T030000','FREQ=YEARLY;BYMONTH=4;BYDAY=1SU'],
                         dst:['+1000','+1100','AEDT','19701004T020000','FREQ=YEARLY;BYMONTH=10;BYDAY=1SU']},
  'Australia/Adelaide': {std:['+1030','+0930','ACST','19700405T030000','FREQ=YEARLY;BYMONTH=4;BYDAY=1SU'],
                         dst:['+0930','+1030','ACDT','19701004T020000','FREQ=YEARLY;BYMONTH=10;BYDAY=1SU']},
  'Australia/Brisbane': {std:['+1000','+1000','AEST','19700101T000000',null]},
  'Australia/Darwin':   {std:['+0930','+0930','ACST','19700101T000000',null]},
  'Australia/Perth':    {std:['+0800','+0800','AWST','19700101T000000',null]},
  'Pacific/Auckland':   {std:['+1300','+1200','NZST','19700405T030000','FREQ=YEARLY;BYMONTH=4;BYDAY=1SU'],
                         dst:['+1200','+1300','NZDT','19700927T020000','FREQ=YEARLY;BYMONTH=9;BYDAY=-1SU']}
};
const TZ_FALLBACK = 'Australia/Sydney';
function zoneTz(z){ const zz = ZONES[z]; return (zz && zz.tz) || TZ_FALLBACK; }
function zoneTzAssumed(z){ const zz = ZONES[z]; return !zz || !!zz.tzAssumed; }

// ICS escaping. Deliberately not the HTML esc() above - different rules, and
// mixing them up puts backslashes in the invite body.
function icsEsc(s){
  return String(s==null?'':s).replace(/\\/g,'\\\\').replace(/;/g,'\\;')
    .replace(/,/g,'\\,').replace(/\r?\n/g,'\\n');
}
/* RFC 5545 limits a line to 75 OCTETS, not 75 characters, and the planner's
   fold counted characters. The invite body is full of em dashes and middot
   separators, each three bytes in UTF-8, so a 73-character line was running to
   77 octets - over the limit on every appointment with a suburb in it. This
   folds on the byte count and never splits a character across two lines. */
function byteLen(s){
  if(typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s).length;
  return unescape(encodeURIComponent(s)).length;
}
function fold(line){
  const MAX = 75;
  if(byteLen(line) <= MAX) return line;
  const parts = [];
  let cur = '', used = 0, budget = MAX;
  // Array.from splits by code point, so a surrogate pair stays whole
  for(const ch of Array.from(line)){
    const n = byteLen(ch);
    if(used + n > budget){
      parts.push(cur);
      cur = ch; used = n;
      budget = MAX - 1;          // a continuation spends one octet on its leading space
    } else {
      cur += ch; used += n;
    }
  }
  if(cur) parts.push(cur);
  return parts[0] + parts.slice(1).map(p => '\r\n ' + p).join('');
}
function stamp(){ return new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,''); }
function dtLocal(dISO, hhmm, addMin){
  const [y,m,d] = dISO.split('-').map(Number), [H,M] = hhmm.split(':').map(Number);
  const t = new Date(y, m-1, d, H, M + (addMin||0));
  const p = n => String(n).padStart(2,'0');
  return t.getFullYear()+p(t.getMonth()+1)+p(t.getDate())+'T'+p(t.getHours())+p(t.getMinutes())+'00';
}
function vtimezone(tzid){
  const z = TZDB[tzid];
  if(!z) return [];
  const L = ['BEGIN:VTIMEZONE','TZID:'+tzid];
  const blk = (kind, spec)=>{
    const [from,to,nm,dtstart,rrule] = spec;
    L.push('BEGIN:'+kind,'DTSTART:'+dtstart,'TZOFFSETFROM:'+from,'TZOFFSETTO:'+to,'TZNAME:'+nm);
    if(rrule) L.push('RRULE:'+rrule);
    L.push('END:'+kind);
  };
  blk('STANDARD', z.std);
  if(z.dst) blk('DAYLIGHT', z.dst);
  L.push('END:VTIMEZONE');
  return L;
}

function inviteParts(ap){
  const a = ACC_BY_NAME.get(ap.acct);
  const z = ZONES[a.z] || {name:'unzoned', hub:'n/a', cov:''};
  const cts = (ap.contacts||[]).map(i => a.c[i]).filter(Boolean);
  const withP = cts.filter(c => c.p).length;
  const d = dueState(a);
  const head = [
    ['Zone', zoneName(a.z) + (z.hub && z.hub !== 'n/a' ? ' (hub '+z.hub+')' : '')],
    ['Location', a.sub || 'suburb not derivable from the account name'],
    ['Focus / tier / segment', [a.foc, a.tier||'no tier', a.seg||'no segment'].join(' \u00b7 ')+' \u2014 '+a.cad],
    ['Account manager', (effMgr(a) || 'unassigned') +
       (isMoved(a) ? ' (reassigned here from '+(a.mgr||'unassigned')+')' : '')],
    ['Representative', a.rep || 'unassigned'],
    ['Last call logged', dueLabel(d)],
    ['Last CRM activity', a.last || 'none recorded'],
    ['Phone coverage', withP+' of '+cts.length+' listed contacts have a number on file']
  ];
  const agenda = (ap.agenda||'').trim() || 'No agenda entered.';
  const sum = ap.callSummary || null;

  const txt = [];
  head.forEach(([k,v]) => txt.push(k+': '+v));
  txt.push('', 'AGENDA', agenda, '', 'CONTACTS');
  cts.forEach(c=>{
    txt.push('- '+c.n+' | '+([c.r,c.t].filter(Boolean).join(' \u2014 ')||'no role recorded')+
      ' | '+(c.p ? c.p+(c.pk==='check'?' (check)':'') : 'NO NUMBER ON FILE')+
      ' | '+((c.e&&c.e[0])||'no email on file'));
  });
  if(d.over) txt.push('', 'This account is past its ' + a.cad + ' cadence: ' + dueLabel(d) + '.');
  // Dynamics server-side sync reads this body, not the HTML one.
  if(sum) txt.push('', '\u2014\u2014\u2014', notesText(sum));

  /* Outlook renders this as the invite body. Arial and inline styles only:
     Outlook will not have Roboto and cannot fetch a webfont, and it strips
     anything that is not inline. */
  const F = 'font-family:Arial,Helvetica,sans-serif';
  let html = '<html><body style="'+F+';font-size:13px;color:#222222">';
  html += '<div style="border-left:4px solid #ED1C24;padding-left:10px;margin:0 0 12px">'+
          '<div style="font-size:15px;font-weight:bold;color:#222222">'+esc(a.a)+'</div>'+
          '<div style="font-size:11px;color:#4D4D4F;letter-spacing:.04em;text-transform:uppercase">'+
          esc(ap.type)+'</div></div>';
  html += '<table cellpadding="3" style="border-collapse:collapse;font-size:12px">';
  head.forEach(([k,v])=>{ html += '<tr><td style="color:#77787A;padding-right:12px">'+esc(k)+
    '</td><td style="color:#222222"><b>'+esc(v)+'</b></td></tr>'; });
  html += '</table><p style="margin:14px 0 4px;color:#00708D;font-size:11px;letter-spacing:.08em"><b>AGENDA</b></p>'+
          '<div>'+esc(agenda).replace(/\n/g,'<br>')+'</div>';
  html += '<p style="margin:16px 0 4px;color:#00708D;font-size:11px;letter-spacing:.08em"><b>CONTACTS</b></p>';
  html += '<table cellpadding="6" style="border-collapse:collapse;font-size:12px;border:1px solid #CCCCCC">';
  html += '<tr style="background:#E3F0F5;color:#00708D">'+
          '<th align="left">Name</th><th align="left">Role / title</th>'+
          '<th align="left">Phone</th><th align="left">Email</th></tr>';
  cts.forEach((c,i)=>{
    const ph = c.p ? esc(c.p)+(c.pk==='check' ? ' <span style="color:#B2232F">(check)</span>' : '')
                   : '<span style="color:#B2232F">no number on file</span>';
    const em = (c.e&&c.e[0]) ? esc(c.e[0]) : '<span style="color:#B2232F">no email on file</span>';
    const bg = i%2 ? ' style="background:#F8F8F8"' : '';
    html += '<tr'+bg+'><td>'+esc(c.n)+'</td><td>'+
      esc([c.r,c.t].filter(Boolean).join(' \u2014 ')||'no role recorded')+
      '</td><td>'+ph+'</td><td>'+em+'</td></tr>';
  });
  html += '</table>';
  if(d.over) html += '<p style="color:#B2232F;margin-top:12px">Past its '+esc(a.cad)+' cadence: '+esc(dueLabel(d))+'.</p>';
  if(sum) html += '<hr style="border:0;border-top:1px solid #E3E3E3;margin:18px 0">' + notesHtml(sum);
  html += '<p style="margin-top:18px;font-size:10px;color:#77787A;border-top:1px solid #E3E3E3;padding-top:8px">'+
          'Intralox Field CRM \u00b7 built from the CRM export of '+
          esc(META && META.imported ? new Date(META.imported).toLocaleDateString() : 'unknown date')+'</p>';
  html += '</body></html>';
  return {txt: txt.join('\n'), html: html, tz: zoneTz(a.z), assumed: zoneTzAssumed(a.z)};
}

function buildIcs(list){
  const L = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Intralox//Field CRM//EN',
             'CALSCALE:GREGORIAN','METHOD:PUBLISH'];
  const tzs = [...new Set(list.map(ap => {
    const a = ACC_BY_NAME.get(ap.acct);
    return zoneTz(a ? a.z : '');
  }))];
  tzs.forEach(t => L.push(...vtimezone(t)));
  list.forEach(ap=>{
    const p = inviteParts(ap), a = ACC_BY_NAME.get(ap.acct);
    L.push('BEGIN:VEVENT');
    L.push('UID:'+ap.id+'@field-crm.intralox');      // no date in the UID - see above
    L.push('SEQUENCE:'+(ap.icsSeq||0));
    L.push('DTSTAMP:'+stamp());
    L.push('LAST-MODIFIED:'+stamp());
    L.push('DTSTART;TZID='+p.tz+':'+dtLocal(ap.date, ap.start, 0));
    L.push('DTEND;TZID='+p.tz+':'+dtLocal(ap.date, ap.start, ap.dur));
    L.push('SUMMARY:'+icsEsc(apptTitle(ap)));
    L.push('LOCATION:'+icsEsc([a.sub, a.a].filter(Boolean).join(', ')));
    /* A placeholder is time blocked for you, so nobody is written as an
       attendee. Otherwise the contacts ticked on the appointment go on, and the
       organiser is you - Outlook needs an organiser before it will treat the
       import as a meeting rather than a bare appointment. */
    const myEmail = (localStorage.getItem(LS('email')) || '').trim();
    if(!ap.hold && myEmail){
      const invitees = (ap.contacts||[]).map(i => a.c[i]).filter(Boolean)
        .map(c => ({name: c.n, email: (c.e && c.e[0]) || ''}))
        .filter(c => c.email);
      if(invitees.length){
        L.push('ORGANIZER;CN='+icsEsc(localStorage.getItem(LS('mgr')) || myEmail)+
               ':MAILTO:'+myEmail);
        invitees.forEach(c => L.push(
          'ATTENDEE;CN='+icsEsc(c.name)+';ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE'+
          ':MAILTO:'+c.email));
      }
    }
    L.push('DESCRIPTION:'+icsEsc(p.txt));
    L.push('X-ALT-DESC;FMTTYPE=text/html:'+icsEsc(p.html));
    /* Outlook colours a calendar item from its own category list, matching on
       name - the file can only carry the name. Focus goes first so it is the
       one that colours the item, and the names are explicit rather than a bare
       "High", which would collide with anything else already categorised that
       way. Creating these three once in Outlook is a one-off. */
    L.push('CATEGORIES:'+icsEsc(FOCUS_CAT[ap._foc || (a && a.foc)] || 'Focus None') + ',' + icsEsc(a.z));
    // a site visit is time out of the office; a planned phone call is not
    L.push('X-MICROSOFT-CDO-BUSYSTATUS:'+(ap.type === 'Intralox site visit' ? 'OOF' : 'BUSY'));
    L.push('TRANSP:OPAQUE');
    L.push('END:VEVENT');
  });
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}

function inRange(ap){
  const d = parseIso(ap.date);
  if(plan.view === 'week'){ const s = startOfWeek(plan.anchor); return d >= s && d <= addDays(s,4); }
  return d.getFullYear() === plan.anchor.getFullYear() && d.getMonth() === plan.anchor.getMonth();
}
function downloadFile(name, text, mime){
  const b = new Blob([text], {type: mime || 'text/plain;charset=utf-8'});
  const u = URL.createObjectURL(b);
  const a = document.createElement('a');
  a.href = u; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(u), 4000);
}
async function doExport(mode){
  const inView = APPTS.filter(inRange);
  if(!inView.length){ toast('Nothing planned in this '+plan.view+'. Add an appointment first.'); return; }
  const list = mode === 'all' ? inView : pendingAppts(inView);
  if(!list.length){ toast('Everything in this '+plan.view+' is already in your Outlook calendar.'); return; }
  if(mode === 'all' && list.length > pendingAppts(inView).length &&
     !confirm('Re-download all '+list.length+' appointment'+(list.length===1?'':'s')+' in this '+plan.view+
              '?\n\nOutlook will update the ones it already has rather than duplicate them.')) return;
  const assumed = list.filter(ap => { const a = ACC_BY_NAME.get(ap.acct); return zoneTzAssumed(a ? a.z : ''); });
  if(assumed.length && !confirm(assumed.length+' appointment'+(assumed.length===1?' is':'s are')+
     ' in a zone with no verified timezone. '+(assumed.length===1?'It':'They')+
     ' will be written as '+TZ_FALLBACK+'.\n\nDownload anyway?')) return;

  // SEQUENCE rises before the file is written, so Outlook accepts an edited
  // event as an update to the one it is already holding.
  for(const ap of list){
    if(ap.icsSeq == null) ap.icsSeq = 0;
    else if(apState(ap) === 'changed') ap.icsSeq++;
  }
  const name = 'field-calls-'+iso(plan.anchor)+(mode === 'all' ? '-all' : '')+'.ics';
  downloadFile(name, buildIcs(list), 'text/calendar;charset=utf-8');

  // Green only once the file has actually been handed over.
  const now = Date.now();
  for(const ap of list){ ap.exp = apRev(ap); ap.expAt = now; await saveAppt(ap); }
  renderPlan();
  toast(list.length+' appointment'+(list.length===1?'':'s')+' written to '+name);
}
$('pExport').addEventListener('click', ()=>doExport('pending').catch(e=>{ console.error(e); toast('Export failed: '+e.message); }));
$('pExportAll').addEventListener('click', ()=>doExport('all').catch(e=>{ console.error(e); toast('Export failed: '+e.message); }));

/* ================= Today and This Week =================
   The phone half of the planner. Read and act: what is on, tap to start, tap to
   close out, tap to move. No drag, no rail, no month grid.

   An appointment carries its own status. Deliberately NOT part of apRev, so
   doing the visit does not make Outlook think the invite changed and ask to be
   re-downloaded. Only the invite fields do that.

   Closing out with no report is a finished state, not a half-done one. Nothing
   here counts uncompiled calls or nags about them. It still writes a call
   record, so the visit appears in the account history and resets the cadence
   clock - you were there, whether or not there was anything to write down. */

const AP_STATUS = {
  planned:   {label:'planned',    cls:'open'},
  'in progress':{label:'in progress', cls:'open'},
  done:      {label:'done',       cls:'done'},
  missed:    {label:'missed',     cls:'overdue'},
  cancelled: {label:'cancelled',  cls:'done'}
};
const apStatus = ap => ap.status || 'planned';
const apSettled = ap => ['done','missed','cancelled'].includes(apStatus(ap));
/* 900px is the same breakpoint the plan screen's CSS uses, so the routing and
   the layout can never disagree. If matchMedia is missing, fall back to the
   width rather than assuming a phone - guessing phone would send a desktop to
   the wrong screen, which is the worse of the two mistakes. */
const PHONE_MAX = 900;
const isPhone = () => window.matchMedia
  ? window.matchMedia('(max-width: '+PHONE_MAX+'px)').matches
  : (window.innerWidth || 1024) <= PHONE_MAX;

/* Week by default. On the road the useful question is what the rest of the week
   looks like; the day is one tap away and is always where the arrows land. */
let todayView = 'week';

function apptsBetween(fromISO, toISO){
  return APPTS.filter(a => a.date >= fromISO && a.date <= toISO)
    .sort((x,y) => x.date.localeCompare(y.date) || x.start.localeCompare(y.start));
}
function visitCard(ap, opts){
  opts = opts || {};
  const a = ACC_BY_NAME.get(ap.acct);
  const st = apStatus(ap);
  const cls = ['vis', a ? FOC_CLS[a.foc] : 'none'];
  if(apSettled(ap)) cls.push('settled');
  if(opts.late) cls.push('late');
  const cts = a ? (ap.contacts||[]).map(i => a.c[i]).filter(Boolean) : [];

  const when = (opts.showDate ? dayLabel(ap.date)+' ' : '') + ap.start;
  /* Names only. The numbers moved into the menu behind the card, where they can
     be copied or saved to the phone rather than dialled by accident.

     Zone, call type and duration are gone. Suburb stays because it is the one
     thing here that tells you where you are driving, and it costs no extra row
     riding on the end of the contacts line. */
  const sub = [cts.map(c => c.n).join(', '), a ? a.sub : ''].filter(Boolean).map(esc).join(' &middot; ');

  /* The status word only appears when it is not the ordinary case. Every card
     reading "planned" is a column of noise. */
  const badge = st === 'planned' ? ''
    : '<span class="st '+AP_STATUS[st].cls+'">'+AP_STATUS[st].label+'</span>';

  const tapId = esc(ap.id);
  return '<div class="'+cls.join(' ')+'">'+
    '<button class="vopen" data-open="'+tapId+'">'+
      '<div class="vtop"><span class="when">'+esc(when)+'</span>'+
      '<span class="who">'+esc(ap.acct)+'</span>'+badge+'</div>'+
      (sub ? '<div class="vsub">'+sub+'</div>' : '')+
      (ap.agenda && ap.agenda.trim() ? '<div class="ag">'+esc(ap.agenda.trim())+'</div>' : '')+
    '</button>'+
    '<button class="vmore" data-vmenu="'+tapId+'" aria-label="More for '+esc(ap.acct)+'">&#8943;</button>'+
  '</div>';
}
/* DAYNM runs Monday first, for the planner's grid; this one is in getDay()
   order, for labelling any date straight from a Date. */
const DAYNM7 = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
function dayLabel(dISO){
  const d = parseIso(dISO);
  return DAYNM7[d.getDay()].slice(0,3)+' '+d.getDate()+' '+MONNM[d.getMonth()].slice(0,3);
}

/* The day the phone planner is looking at. Defaults to today and is reset to it
   by the Today button, so the screen still opens on "now" however far you
   wandered last time. */
let tvCursor = null;
function tvDate(){ return tvCursor || todayISOdate(); }
function tvShift(days){
  tvCursor = iso(addDays(parseIso(tvDate()), days));
  renderToday();
}
// a month at a time, landing on the 1st so a 31st never skips a short month
function tvShiftMonth(n){
  const d = parseIso(tvDate());
  tvCursor = iso(new Date(d.getFullYear(), d.getMonth() + n, 1));
  renderToday();
}
function renderToday(){
  renderKinds();
  const el = $('tvBody');
  $('tvPlanner').hidden = isPhone();
  if(todayView === 'today') renderTodayList(el);
  else if(todayView === 'month') renderMonthGrid(el);
  else renderWeekList(el);
  wireVisitCards(el);
  /* Today is a no-op when you are already on today, so it dims rather than
     disappearing - a control that comes and goes is harder to aim at. */
  const now = tvDate() === todayISOdate();
  $('tvNow').style.opacity = now ? '.45' : '1';
  $('title').textContent = tvTitle();
}
function tvTitle(){
  if(todayView === 'today'){
    return tvDate() === todayISOdate() ? 'Today' : dayLabel(tvDate());
  }
  if(todayView === 'month'){
    const d = parseIso(tvDate());
    return MONNM[d.getMonth()] + ' ' + d.getFullYear();
  }
  const mon = tvWeekStart(), thisMon = startOfWeek(new Date());
  return iso(mon) === iso(thisMon) ? 'This week'
    : iso(mon) === iso(addDays(thisMon, 7)) ? 'Next week'
    : 'Week of ' + mon.getDate() + ' ' + MONNM[mon.getMonth()].slice(0,3);
}
/* A task on the phone's Day and Week lists: a tick box, then the same layout as
   a visit card. Tapping it opens the task. */
function taskCard(t){
  return '<div class="vis task' + (t.done ? ' settled done' : '') + '">' +
    '<button class="ttick" data-ttick="' + esc(t.id) + '" aria-label="' + (t.done ? 'Mark not completed' : 'Mark completed') + '">' +
      (t.done ? icon('check') : '') + '</button>' +
    '<button class="vopen" data-topen="' + esc(t.id) + '">' +
      '<div class="vtop"><span class="when">' + esc(t.start || '') + '</span><span class="who">' + esc(taskTitle(t)) + '</span></div>' +
      '<div class="vsub">' + ['Task', t.type && t.type !== t.title ? t.type : '', t.acct].filter(Boolean).map(esc).join(' &middot; ') + '</div>' +
    '</button></div>';
}
// visits and tasks for one day, in time order
function dayItems(k){
  return calA().filter(a => a.date === k).map(a => ({at: a.start || '', html: visitCard(a)}))
    .concat(calT().filter(x => x.date === k).map(x => ({at: x.start || '', html: taskCard(x)})))
    .concat(calQ().filter(q => q.date === k).map(q => ({at: q.start, html: quoteCard(q)})))
    .sort((a,b) => a.at.localeCompare(b.at)).map(x => x.html).join('');
}
const countWords = (v, t, q) => {
  const w = [v && v + ' visit' + (v === 1 ? '' : 's'), t && t + ' task' + (t === 1 ? '' : 's'),
    q && q + ' quote request' + (q === 1 ? '' : 's')].filter(Boolean);
  return w.length > 1 ? w.slice(0, -1).join(', ') + ' and ' + w[w.length - 1] : (w[0] || '');
};
function renderTodayList(el){
  const t = tvDate(), isNow = t === todayISOdate();
  const mine = calA().filter(a => a.date === t).sort((x,y)=>x.start.localeCompare(y.start));
  const myTasks = calT().filter(x => x.date === t);
  const myQuotes = calQ().filter(x => x.date === t);
  const mon = iso(startOfWeek(new Date()));
  // earlier in the week, planned and never resolved
  const late = isNow ? calA().filter(a => a.date >= mon && a.date < t && !apSettled(a))
    .sort((x,y)=>x.date.localeCompare(y.date) || x.start.localeCompare(y.start)) : [];

  const when = isNow ? 'today' : 'on ' + dayLabel(t).toLowerCase();
  $('tvHint').textContent = (mine.length || myTasks.length || myQuotes.length)
    ? countWords(mine.length, myTasks.length, myQuotes.length)+' '+when
    : 'Nothing planned '+when+'.';

  let html = dayItems(t);
  if(late.length){
    html += '<div class="late"><h2>Earlier this week</h2>'+
      late.map(ap => visitCard(ap, {late:true, showDate:true})).join('')+'</div>';
  }
  el.innerHTML = html;
}
/* On a Saturday or Sunday, "this week" means the week ahead. startOfWeek rolls
   backwards to the Monday just gone, which on a Sunday evening is a list of
   days you have already worked. */
function weekViewStart(){
  const now = new Date(), g = now.getDay();
  return (g === 0 || g === 6) ? startOfWeek(addDays(now, 2)) : startOfWeek(now);
}
/* With no cursor set this is the weekend-aware "week you care about"; once you
   have paged, it is simply the week the cursor falls in. */
function tvWeekStart(){
  return tvCursor ? startOfWeek(parseIso(tvCursor)) : weekViewStart();
}
function renderWeekList(el){
  const mon = tvWeekStart(), t = todayISOdate();
  // Monday to Friday, plus Saturday and Sunday whenever something is on them
  const days = [0,1,2,3,4,5,6].map(i => addDays(mon,i))
    .filter((d,i) => i < 5 || calA().some(a => a.date === iso(d)) || calT().some(x => x.date === iso(d)) || calQ().some(x => x.date === iso(d)));
  const from = iso(mon), to = iso(addDays(mon,6));
  const n = calA().filter(a => a.date >= from && a.date <= to).length;
  const nt = calT().filter(x => x.date >= from && x.date <= to).length;
  const nq = calQ().filter(x => x.date >= from && x.date <= to).length;
  const thisWk = iso(mon) === iso(startOfWeek(new Date()));
  const wk = thisWk ? 'this week' : 'that week';
  $('tvHint').textContent = (n || nt || nq) ? countWords(n, nt, nq)+' '+wk
    : 'Nothing planned '+wk+'.';
  el.innerHTML = days.map(d=>{
    const k = iso(d), items = dayItems(k);
    return '<div class="dayblk'+(k===t?' isToday':'')+'">'+
      '<h3>'+DAYNM7[d.getDay()]+'<span class="dt">'+d.getDate()+' '+MONNM[d.getMonth()].slice(0,3)+'</span></h3>'+
      (items || '<div class="none">Nothing planned.</div>')+
      '</div>';
  }).join('');
}

/* Month on the phone: a Monday-to-Sunday grid with a count of visits and tasks
   on each day. Tapping a day opens that day's list - the grid is for seeing
   where the month is full, the Day list is where the work is. */
function renderMonthGrid(el){
  const c = parseIso(tvDate()), y = c.getFullYear(), m = c.getMonth();
  const first = new Date(y, m, 1), last = new Date(y, m + 1, 0);
  const from = iso(first), to = iso(last), t = todayISOdate();
  const nv = {}, nt = {}, nq = {};
  calA().forEach(a => { if(a.date >= from && a.date <= to) nv[a.date] = (nv[a.date] || 0) + 1; });
  calT().forEach(x => { if(x.date >= from && x.date <= to) nt[x.date] = (nt[x.date] || 0) + 1; });
  calQ().forEach(x => { if(x.date >= from && x.date <= to) nq[x.date] = (nq[x.date] || 0) + 1; });
  const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
  const v = sum(nv), k = sum(nt), kq = sum(nq);
  $('tvHint').textContent = (v || k || kq) ? countWords(v, k, kq) + ' in ' + MONNM[m]
    : 'Nothing planned in ' + MONNM[m] + '.';
  let cells = '';
  for(let i = (first.getDay() + 6) % 7; i > 0; i--) cells += '<span class="pm-cell pad"></span>';
  for(let n = 1; n <= last.getDate(); n++){
    const key = iso(new Date(y, m, n)), a = nv[key] || 0, b = nt[key] || 0, c = nq[key] || 0;
    const words = [DAYNM7[new Date(y, m, n).getDay()] + ' ' + n + ' ' + MONNM[m], countWords(a, b, c) || 'nothing planned'].join(', ');
    cells += '<button type="button" class="pm-cell' + (key === t ? ' isToday' : '') + (a || b || c ? ' busy' : '') +
      '" data-mday="' + key + '" aria-label="' + esc(words) + '">' +
      '<span class="pm-n">' + n + '</span>' +
      (a ? '<span class="pm-v">' + a + '</span>' : '') +
      (b ? '<span class="pm-t">' + b + '</span>' : '') +
      (c ? '<span class="pm-q">' + c + '</span>' : '') +
    '</button>';
  }
  el.innerHTML = '<div class="pm-grid">' +
    ['M','T','W','T','F','S','S'].map(x => '<span class="pm-hd">' + x + '</span>').join('') + cells + '</div>' +
    '<p class="pm-key"><span class="pm-v">2</span> visits <span class="pm-t">1</span> tasks' +
      (kq ? ' <span class="pm-q">1</span> quotes' : '') + '</p>';
  el.querySelectorAll('[data-mday]').forEach(b => b.addEventListener('click', () => {
    tvCursor = b.dataset.mday;
    tvSetView('today');
  }));
}
function tvSetView(v){
  todayView = v;
  $('tvView').querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.v === v));
  renderToday();
}

/* ---- contacts out of the app and into the phone ----

   There is no web API that writes to the address book. The Contact Picker API
   reads only, so the route is a vCard: a few lines of text the phone already
   knows how to import. Share hands it to Contacts; if the share sheet is not
   available, or Contacts does not appear in it, the download fallback puts the
   .vcf in Downloads and tapping it there opens the same import.

   Escaping matters more than it looks. A name like "Smith, John" or a title
   with a semicolon will split the record into the wrong fields if the commas
   and semicolons are not escaped. */
function vcEsc(s){
  return String(s == null ? '' : s).replace(/\\/g,'\\\\').replace(/\n/g,'\\n')
    .replace(/,/g,'\\,').replace(/;/g,'\\;');
}
function vCardFor(c, org){
  const name = String(c.n || '').trim();
  /* N wants structured family;given. The contact database holds one display
     name, so the last word is taken as the family name and the rest as given -
     wrong for some names, and better than dumping everything in one field. */
  const bits = name.split(/\s+/).filter(Boolean);
  const fam = bits.length > 1 ? bits[bits.length-1] : name;
  const giv = bits.length > 1 ? bits.slice(0,-1).join(' ') : '';
  const L = ['BEGIN:VCARD','VERSION:3.0',
    'N:'+vcEsc(fam)+';'+vcEsc(giv)+';;;',
    'FN:'+vcEsc(name)];
  if(org) L.push('ORG:'+vcEsc(org));
  const title = c.t || c.r;
  if(title) L.push('TITLE:'+vcEsc(title));
  if(c.p) L.push('TEL;TYPE=CELL:'+vcEsc(c.p));
  if(c.e && c.e[0]) L.push('EMAIL;TYPE=WORK:'+vcEsc(c.e[0]));
  L.push('END:VCARD');
  return L.join('\r\n');
}
async function saveContacts(list, org, label){
  const cards = list.map(c => vCardFor(c, org)).join('\r\n');
  const raw = String(label || org || 'contacts');
  const fname = (raw.replace(/[^A-Za-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,40) || 'contacts') + '.vcf';
  const file = new File([cards], fname, {type:'text/vcard'});
  if(navigator.canShare && navigator.canShare({files:[file]})){
    try {
      await navigator.share({files:[file], title:fname});
      return;
    } catch(e){
      if(e && e.name === 'AbortError') return;   // the user backed out, not a failure
      /* anything else falls through to the download */
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = fname;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 30000);
  toast('Saved to Downloads \u2014 open it to add the contact');
}
/* Clipboard needs a secure context and can still be refused. Showing the number
   in a prompt is not elegant, but it beats a button that silently does nothing
   when you are standing in a plant trying to ring someone. */
async function copyText(s, what){
  try {
    if(navigator.clipboard && navigator.clipboard.writeText){
      await navigator.clipboard.writeText(s);
      toast((what || 'Copied') + ' copied');
      return;
    }
  } catch(e){ /* fall through */ }
  try { window.prompt('Copy this' + (what ? ' ' + what.toLowerCase() : '') + ':', s); }
  catch(e){ toast('Could not copy'); }
}

function wireVisitCards(el){
  const on = (attr, fn) => el.querySelectorAll('['+attr+']').forEach(b =>
    b.addEventListener('click', ()=>fn(b.getAttribute(attr))));
  on('data-open',     id => openVisit(id).catch(reportErr));
  on('data-vmenu',    id => openVisitMenu(id));
  on('data-start',    id => startVisit(id).catch(reportErr));
  on('data-topen',    id => openTask(id));
  on('data-qopen',    id => openQuote(id).catch(reportErr));
  on('data-ttick',    id => { const t = TASKS.find(x => x.id === id); if(t) taskToggle(t).catch(reportErr); });
  on('data-closeout', id => closeOutVisit(id).catch(reportErr));
  on('data-move',     id => openMoveDialog(id));
  on('data-missed',   id => setVisitStatus(id, 'missed').catch(reportErr));
  on('data-cancel',   id => setVisitStatus(id, 'cancelled').catch(reportErr));
  on('data-reopen',   id => setVisitStatus(id, 'planned', true).catch(reportErr));
}
/* Tapping the card goes into the call. For a live visit that is startVisit,
   which opens the existing call or builds one.

   A settled visit is different. Running startVisit on it would flip it back to
   in progress, so a stray tap on a finished visit would quietly undo the fact
   that it was finished. If it produced a call, that call opens for reading or
   editing; if it never did, the tap does nothing and Reopen stays in the menu. */
async function openVisit(id){
  const ap = APPTS.find(x => x.id === id);
  if(!ap) return;
  if(apSettled(ap)){
    if(ap.callId){
      const existing = (await callsAll()).find(c => c.id === ap.callId);
      if(existing){ call = existing; call.loose = call.loose || []; go('dash'); return; }
    }
    toast('This visit is ' + AP_STATUS[apStatus(ap)].label + ' \u2014 reopen it from the menu');
    return;
  }
  await startVisit(id);
}
function reportErr(e){ console.error(e); toast('That did not work: '+e.message); }

/* Build the call straight from the appointment: account, date, contacts and site
   are already decided, so the contact picker would only ask again. */
function callFromAppt(ap, extra){
  const a = ACC_BY_NAME.get(ap.acct);
  const chosen = a ? (ap.contacts||[]).map(i => a.c[i]).filter(Boolean).map(c => ({
    name:c.n, role:c.t||c.r, email:(c.e&&c.e[0])||'', mobile:c.p, crm:true, cid:c.id
  })) : [];
  return Object.assign({
    id: 'c'+Date.now(),
    date: ddmmyyyy(ap.date),
    type: ap.type === 'Planned phone call' ? 'Phone call' : 'Site call',
    mgr: $('cMgr').value,
    customer: ap.acct,
    manualAccount: !a,
    zone: a ? a.z : '',
    suburb: a ? a.sub : '',
    focus: a ? a.foc : '',
    site: '',
    contacts: chosen,
    entries: [],
    loose: [],
    apptId: ap.id,
    status: 'in progress',
    when: Date.parse(ap.date) || Date.now(),
    closed: false,
    updated: Date.now()
  }, extra || {});
}
async function startVisit(id){
  const ap = APPTS.find(x => x.id === id);
  if(!ap) return;
  if(ap.callId){
    const all = await callsAll();
    const existing = all.find(c => c.id === ap.callId);
    if(existing){ call = existing; call.loose = call.loose || []; go('dash'); return; }
  }
  const draft = callFromAppt(ap);
  const reuse = await offerExistingCall(ap.acct, ap.date, draft.contacts, '');
  call = reuse || draft;
  if(reuse) toast('Continuing the call from ' + reuse.date);
  await saveCall();
  ap.status = 'in progress';
  ap.callId = call.id;
  await saveAppt(ap);
  go('dash');
}
async function closeOutVisit(id){
  const ap = APPTS.find(x => x.id === id);
  if(!ap) return;
  if(!confirm('Close out '+ap.acct+' with no report?\n\nThe visit is filed against the account and counts '+
              'towards its cadence. Nothing is written up.')) return;
  let filed = null;
  if(ap.callId){
    const all = await callsAll();
    const c = all.find(x => x.id === ap.callId);
    if(c){
      c.closed = true; c.status = 'done'; c.noReport = !c.entries.length; c.updated = Date.now();
      await callsPut(c);
      filed = c;
    }
  }
  if(!filed){
    filed = callFromAppt(ap, {status:'done', closed:true, noReport:true});
    await callsPut(filed);
    ap.callId = filed.id;
  }
  ap.status = 'done';
  /* Still write a summary. "Nothing to report" is an outcome, and the invite
     saying so is the difference between a visit that happened quietly and one
     that looks like it never happened. */
  ap.callSummary = callSummary(filed);
  await saveAppt(ap);
  indexCalls(await callsAll());
  renderToday(); renderHomeCounts();
  toast('Closed out - no report');
}
async function setVisitStatus(id, status, quiet){
  const ap = APPTS.find(x => x.id === id);
  if(!ap) return;
  if(!quiet && !confirm('Mark '+ap.acct+' as '+status+'?')) return;
  ap.status = status;
  await saveAppt(ap);
  renderToday(); renderHomeCounts();
  if(!quiet) toast('Marked '+status);
}

/* ================= one call per account per week =================
   Two visits to the same plant in the same week are usually one job: you were
   there Tuesday, went back Thursday for the thing you could not get to. Starting
   a second record splits the notes across two files and two rows of history.

   So before a new call is created, the week is checked. If there is already a
   call at that account, it is offered - and taking it carries everything across,
   because it IS the same record. Contacts picked this time are merged in rather
   than replacing what was there. */
function weekBounds(dISO){
  const d = dISO ? parseIso(dISO) : new Date();
  const mon = startOfWeek(d);
  return {from: mon.getTime(), to: addDays(mon, 6).getTime() + 86399999};
}
function callsSameWeek(customer, dISO, excludeId){
  const {from, to} = weekBounds(dISO);
  return callsFor(customer)
    .filter(c => c.id !== excludeId && c.status !== 'cancelled' && c.status !== 'missed')
    .filter(c => { const t = callWhen(c); return t >= from && t <= to; })
    .sort((a,b) => callWhen(b) - callWhen(a));
}
function describeCall(c){
  const n = (c.entries||[]).length;
  const belts = (c.entries||[]).filter(e => e.type === 'belt').length;
  const bits = [n ? n + ' entr' + (n===1?'y':'ies') : 'nothing logged yet'];
  if(belts) bits.push(belts + ' belt' + (belts===1?'':'s'));
  if(c.site) bits.push(c.site);
  bits.push(c.closed ? 'closed' : 'still open');
  return c.date + ' - ' + bits.join(', ');
}
/* Returns the existing call if the user chooses it, or null to start a new one. */
async function offerExistingCall(customer, dISO, chosenContacts, site){
  const found = callsSameWeek(customer, dISO);
  if(!found.length) return null;
  const c = found[0];
  const more = found.length > 1 ? '\n\n(' + (found.length - 1) + ' other call' +
    (found.length === 2 ? '' : 's') + ' this week as well - the most recent is offered.)' : '';
  if(!confirm('There is already a call at ' + customer + ' this week:\n\n' +
      describeCall(c) + more +
      '\n\nContinue that one? Everything already on it is kept.\n\n' +
      'Cancel to start a separate call instead.')) return null;

  const all = await callsAll();
  const live = all.find(x => x.id === c.id) || c;
  live.loose = live.loose || [];
  // anyone picked this time who was not on it before
  const have = new Set((live.contacts||[]).map(x => (x.name||'').toLowerCase()));
  (chosenContacts||[]).forEach(x => {
    if(!have.has((x.name||'').toLowerCase())){ live.contacts.push(x); have.add((x.name||'').toLowerCase()); }
  });
  if(site && !live.site) live.site = site;
  if(live.closed){ live.closed = false; live.status = 'in progress'; }
  return live;
}

/* ---------- an unplanned call books itself ----------
   A call started without a plan behind it still happened, and the desktop should
   see it on the calendar rather than only in the account history. So the call
   creates its own appointment, on the day it is being done, and that appointment
   travels back with the calls.

   Only for accounts that are in the account book. An appointment against a
   manually typed account would have nothing to look up - the invite builder
   reads the zone, and the next CRM import drops appointments whose account is
   not in the export. The call itself still syncs either way; it just does not
   get a calendar entry. */
async function bookUnplanned(c, acc){
  if(!c || !acc || c.apptId) return null;
  const now = new Date();
  const ap = {
    id: 'ap' + Date.now().toString(36) + (plan.seq++),
    acct: acc.a,
    // Phone and Teams are remote; 'Phone call' is what a planned phone call's own call carries
    type: ['Phone', 'Teams', 'Phone call'].includes(c.type) ? 'Planned phone call' : 'Intralox site visit',
    date: isoFromDdmmyyyy(c.date) || todayISOdate(),
    start: String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0'),
    dur: DEF_DUR,
    agenda: '',
    contacts: (c.contacts||[]).map(x => acc.c.findIndex(y => y.n === x.name)).filter(i => i >= 0),
    /* origin marks it as made on this device and not yet seen by the other one.
       The plan-file deletion rule is authoritative for its date range, and would
       otherwise wipe this the moment a plan arrived that predates it. */
    origin: isPhone() ? 'phone' : 'desktop',
    acked: false,
    status: 'in progress',
    callId: c.id,
    unplanned: true
  };
  APPTS.push(ap);
  await saveAppt(ap);
  c.apptId = ap.id;
  await saveCall();
  renderPlanCount();
  return ap;
}
// call dates are stored DD/MM/YYYY; appointments are keyed on ISO
function isoFromDdmmyyyy(d){
  const p = String(d||'').split('/');
  if(p.length !== 3) return null;
  return p[2] + '-' + p[1].padStart(2,'0') + '-' + p[0].padStart(2,'0');
}

/* ---------- move ---------- */
let movingAppt = null;
function openMoveDialog(id){
  const ap = APPTS.find(x => x.id === id);
  if(!ap) return;
  movingAppt = ap;
  $('mvTitle').textContent = 'Move ' + ap.acct;
  // mvSub belongs to the manual page viewer; the move dialog uses mvDlgSub
  $('mvDlgSub').textContent = 'Currently ' + dayLabel(ap.date) + ' at ' + ap.start;
  const mon = startOfWeek(new Date());
  const days = [];
  for(let i=0;i<14;i++){
    const d = addDays(mon,i);
    if(isWeekday(d)) days.push(d);
  }
  $('mvDays').innerHTML = days.map(d=>{
    const k = iso(d);
    return '<button data-day="'+k+'"'+(k===ap.date?' disabled':'')+'>'+esc(dayLabel(k))+
      (k===todayISOdate() ? ' <span class="tag">today</span>' : '')+
      (k===ap.date ? ' <span class="tag">where it is now</span>' : '')+'</button>';
  }).join('');
  $('mvDays').querySelectorAll('[data-day]').forEach(b =>
    b.addEventListener('click', ()=>moveTo(b.dataset.day).catch(reportErr)));
  const dlg = $('mvdlg');
  if(dlg.showModal) dlg.showModal(); else dlg.setAttribute('open','');
  pushDialog('mvdlg');
}
function closeMove(){
  const dlg = $('mvdlg');
  if(!dlg.hasAttribute('open')){ movingAppt = null; return; }
  if(history.state && history.state.dialog === 'mvdlg'){ history.back(); return; }
  if(dlg.close) dlg.close(); else dlg.removeAttribute('open');
  movingAppt = null;
}
async function moveTo(k){
  const ap = movingAppt;
  if(!ap) return;
  ap.date = k;
  /* Moving a visit here edits a record the desktop owns. The exchange resolves
     that newest-wins, so the edit is stamped rather than silently applied. */
  ap.movedAt = Date.now();
  ap.movedOn = 'phone';
  await saveAppt(ap);
  closeMove();
  renderToday();
  toast('Moved to ' + dayLabel(k));
}
$('mvCancel').addEventListener('click', closeMove);

$('tvView').querySelectorAll('button').forEach(b => b.addEventListener('click', () => tvSetView(b.dataset.v)));
/* Paging is by day, week or month to match the view, so the arrows always
   move by whatever is on the screen. */
$('tvPrev').innerHTML = icon('chev');
$('tvNext').innerHTML = icon('chev');
$('tvUnplanned').innerHTML = icon('plus');
$('tvBook').innerHTML = icon('calplus');
/* Week paging steps from the week on screen, not from today: at the weekend
   the list opens on the coming week, and stepping from Saturday's date landed
   on that same week, so the first tap did nothing (fixed v90). */
const tvStep = n => {
  if(todayView === 'month') return tvShiftMonth(n);
  if(todayView === 'today') return tvShift(n);
  tvCursor = iso(addDays(tvWeekStart(), 7 * n));
  renderToday();
};
$('tvPrev').addEventListener('click', ()=>tvStep(-1));
$('tvNext').addEventListener('click', ()=>tvStep(1));
$('tvNow').addEventListener('click', ()=>{ tvCursor = null; renderToday(); });
/* Booking ahead from the phone. The unplanned path already creates an
   appointment as a side effect of starting a call; this is the same thing
   without doing the visit - "I said I'd come back Thursday". Same origin and
   acknowledgement flags, so it survives the next plan file the same way. */
let bookAcct = null;
function startBooking(){
  if(!ACCOUNTS.length){ toast('Import the CRM export first'); return; }
  bookAcct = null;
  cameFromAcct = false;
  bookingMode = true;
  if($('cType')) $('cType').value = 'Site call';
  syncQuoteMode();
  $('cDate').value = todayISO();
  newMark('book');
  go('account'); renderAccSearch();
  $('accHint').textContent = 'Pick the account to book a visit at';
}
let bookingMode = false;
async function bookVisitFor(name){
  const acc = ACC_BY_NAME.get(name);
  bookingMode = false;
  if(!acc){
    toast('Only accounts from the CRM export can be booked');
    go('today');
    return;
  }
  bookAcct = acc;
  const ap = {
    id: 'ap' + Date.now().toString(36) + (plan.seq++),
    acct: acc.a, type: 'Intralox site visit',
    date: todayISOdate(), start: '09:00', dur: DEF_DUR, agenda: '',
    contacts: acc.c.map((_, i) => i).slice(0, 3),
    origin: isPhone() ? 'phone' : 'desktop', acked: false,
    status: 'planned'
  };
  APPTS.push(ap);
  await saveAppt(ap);
  renderPlanCount();
  go('today');
  // straight into the day picker, because the date is the point of booking
  openMoveDialog(ap.id);
  $('mvTitle').textContent = 'Book ' + acc.a;
  $('mvDlgSub').textContent = 'Pick the day. It travels to the PC with your calls.';
}
$('tvBook').addEventListener('click', startBooking);
$('tvUnplanned').addEventListener('click', ()=>{
  cameFromAcct = false; bookingMode = false;
  if($('cType')) $('cType').value = 'Site call';
  syncQuoteMode();
  $('cDate').value = todayISO();
  newMark('site');
  go('account'); renderAccSearch();
});
$('tvPlanner').addEventListener('click', ()=>go('plan'));
$('pToday2').addEventListener('click', ()=>go('today'));

/* ================= device exchange =================
   Not whole-database sync. Plan Monday on the PC, log calls Tuesday to Friday on
   the phone, open the PC on Friday and save, and last-write-wins eats the week.
   Instead each side sends only what it owns and the other side merges by record
   id, never overwriting the database:

     plan file   PC -> phone    appointments, sync state, optionally accounts
     call file   phone -> PC    calls, entries, and the visit outcomes

   Deletion is the awkward case. Rather than keeping tombstones, a plan file
   declares the date range it covers and is authoritative for it: an appointment
   inside that range that is not in the file has been deleted on the desktop, so
   it goes - unless the phone has touched it since, in which case it is kept and
   reported. Nothing outside the range is ever touched. The phone cannot create
   appointments, so there is no case where this discards something the phone
   made and the desktop never had.

   The one real conflict is an appointment edited on both sides. Newest wins by
   touchedAt, and the count is reported rather than resolved silently. */

const EXCHANGE_VER = 1;
const PLAN_KIND = 'field-crm-plan', CALL_KIND = 'field-crm-calls';

/* The range must NOT be derived from what is still in the file. Deriving the end
   from the latest surviving appointment means deleting the last one shrinks the
   range past it, so the deletion never propagates - the record it was meant to
   remove sits just outside the window and is treated as none of the file's
   business. The window is open-ended forward instead: a plan is authoritative
   for this week onwards, and never touches anything before it. */
function apptRange(){
  return {from: iso(startOfWeek(new Date())), to: '9999-12-31'};
}
async function buildPlanFile(withAccounts){
  const range = apptRange();
  return {
    kind: PLAN_KIND,
    version: EXCHANGE_VER,
    made: Date.now(),
    device: isPhone() ? 'phone' : 'desktop',
    range: range,
    /* Deep copy, not the live objects. A file is a snapshot: handing out
       references means anything that touches APPTS between building and
       serialising silently changes what was already described as sent. */
    appts: JSON.parse(JSON.stringify(APPTS.filter(a => a.date >= range.from))),
    weeks: JSON.parse(JSON.stringify(WEEKS)),
    mgrOf: JSON.parse(JSON.stringify(MGR_OF)),
    accounts: withAccounts ? ACCOUNTS : null,
    meta: withAccounts ? META : null,
    overrides: withAccounts ? OVERRIDES : null
  };
}
/* The phone owns calls, and it owns what happened to a visit. Those two things
   travel together: the desktop needs to know a visit was done, missed or moved,
   and that is not the whole appointment - just the outcome. */
async function buildCallFile(withPhotos){
  const calls = await callsAll();
  return {
    kind: CALL_KIND,
    version: EXCHANGE_VER,
    made: Date.now(),
    device: isPhone() ? 'phone' : 'desktop',
    withPhotos: !!withPhotos,
    calls: withPhotos ? await Promise.all(calls.map(inlinePhotos)) : calls.map(stripPhotos),
    /* Appointments made on this device that the other side has never seen. Sent
       whole, because there is nothing there to update - it does not exist yet. */
    newAppts: JSON.parse(JSON.stringify(
      APPTS.filter(a => a.origin && !a.acked))),
    apptUpdates: APPTS
      .filter(a => a.status || a.callId || a.movedOn)
      .map(a => ({id:a.id, status:a.status||null, date:a.date, callId:a.callId||null,
                  movedOn:a.movedOn||null, touchedAt:a.touchedAt||0,
                  callSummary:a.callSummary||null}))
  };
}

async function mergePlanFile(data){
  const incoming = Array.isArray(data.appts) ? data.appts : [];
  const byId = new Map(APPTS.map(a => [a.id, a]));
  let added = 0, updated = 0, kept = 0, removed = 0, keptOutside = 0;

  for(const ap of incoming){
    if(!ap || !ap.id) continue;
    const mine = byId.get(ap.id);
    if(!mine){ await apptsPut(Object.assign({}, ap, {acked:true})); added++; continue; }
    /* The file contains it, so the other side has seen it and it is no longer
       this device's private record. Persisted here rather than in a sweep at the
       end - a later sweep would write back records the deletion pass removed. */
    const wasPrivate = mine.origin && !mine.acked;
    if(wasPrivate) mine.acked = true;
    // newest wins, and a tie goes to what is already here rather than churning
    if((mine.touchedAt||0) > (ap.touchedAt||0)){
      if(wasPrivate) await apptsPut(mine);
      kept++; continue;
    }
    /* The phone's outcome is not in the desktop's copy, so carry it over rather
       than losing that the visit was done. */
    const merged = Object.assign({}, ap);
    if(mine.status && !ap.status) merged.status = mine.status;
    if(mine.callId && !ap.callId) merged.callId = mine.callId;
    if(mine.callSummary && !ap.callSummary) merged.callSummary = mine.callSummary;
    if(mine.origin && !merged.origin) merged.origin = mine.origin;
    merged.acked = true;
    await apptsPut(merged);
    updated++;
  }

  const inFile = new Set(incoming.map(a => a.id));
  const r = data.range || {from:'0000-00-00', to:'9999-99-99'};
  for(const mine of APPTS){
    if(inFile.has(mine.id)) continue;
    if(mine.date < r.from || mine.date > r.to){ keptOutside++; continue; }
    /* Made here and not yet sent anywhere. The file cannot be authoritative about
       a record whose existence it has never been told of. */
    if(mine.origin && !mine.acked){ kept++; continue; }
    // touched here since the file was made: keep it and say so
    if((mine.touchedAt||0) > (data.made||0)){ kept++; continue; }
    await apptsDel(mine.id);
    removed++;
  }

  /* Weeks and reassignments are desktop-owned outright - the phone has no way to
     set either - so they are taken wholesale rather than merged record by record. */
  if(data.weeks){ WEEKS = data.weeks; await kvSet('weeks', WEEKS); }
  if(data.mgrOf){ MGR_OF = data.mgrOf; await kvSet('mgrOf', MGR_OF); }
  if(Array.isArray(data.accounts) && data.accounts.length){
    await accReplaceAll(data.accounts);
    if(data.meta) await kvSet('meta', data.meta);
    if(data.overrides) await kvSet('overrides', data.overrides);
  }
  await loadAccounts();
  return {added, updated, kept, removed, keptOutside,
          accounts: (data.accounts||[]).length};
}

async function mergeCallFile(data){
  const calls = Array.isArray(data.calls) ? data.calls : [];
  const existing = await callsAll();
  const have = new Map(existing.map(c => [c.id, c]));
  let added = 0, updated = 0, skipped = 0;
  for(const c of calls){
    if(!c || !c.id) continue;
    const mine = have.get(c.id);
    if(mine && (mine.updated||0) > (c.updated||0)){ skipped++; continue; }
    (c.entries||[]).forEach(e => {
      e.photos = (e.photos||[]).map(p => {
        try { return typeof p === 'string' && p.startsWith('data:') ? dataURLToBlob(p) : p; }
        catch(err){ return null; }
      }).filter(Boolean);
    });
    c.loose = (c.loose||[]).map(p => {
      try { return typeof p === 'string' && p.startsWith('data:') ? dataURLToBlob(p) : p; }
      catch(err){ return null; }
    }).filter(Boolean);
    if(mine) updated++; else added++;
    await callsPut(c);
  }
  // appointments the other device created for calls that were not planned
  let booked = 0;
  for(const ap of (data.newAppts || [])){
    if(!ap || !ap.id) continue;
    if(APPTS.some(x => x.id === ap.id)) continue;
    if(!ACC_BY_NAME.has(ap.acct)) continue;   // nothing to hang it on here
    const copy = Object.assign({}, ap, {acked: true});
    await apptsPut(copy);
    booked++;
  }
  if(booked) APPTS = await apptsAll();

  // visit outcomes ride back with the calls
  let visits = 0, visitsKept = 0;
  /* Newest-wins is the wrong rule for the whole record here. The phone owns the
     outcome - whether the visit happened, which call it became, what was written
     up - and only the phone can produce those. The desktop owns the invite. So
     the outcome always applies, and only the contested field (the date) falls
     back to newest-wins. Without this split, a desktop that merely touched the
     appointment later silently discards a week's notes. */
  for(const u of (data.apptUpdates||[])){
    const ap = APPTS.find(x => x.id === u.id);
    if(!ap) continue;
    let touched = false;
    if(u.status && u.status !== ap.status){ ap.status = u.status; touched = true; }
    if(u.callId && u.callId !== ap.callId){ ap.callId = u.callId; touched = true; }
    if(u.callSummary && sumRev(u.callSummary) !== sumRev(ap.callSummary)){
      ap.callSummary = u.callSummary; touched = true;
    }
    if(u.date && u.date !== ap.date){
      if((ap.touchedAt||0) > (u.touchedAt||0)) visitsKept++;
      else { ap.date = u.date; touched = true; }
    }
    if(!touched) continue;
    ap.touchedAt = Math.max(ap.touchedAt||0, u.touchedAt||0, Date.now());
    await apptsPut(ap);
    visits++;
  }
  APPTS = await apptsAll();
  indexCalls(await callsAll());
  return {added, updated, skipped, visits, visitsKept, booked,
          photos: data.withPhotos ? 'with photos' : 'no photos'};
}

async function receiveExchange(file){
  const data = JSON.parse(await file.text());
  if(!data || !data.kind){
    if(data && data.format === BACKUP_FORMAT)
      throw new Error('that is a backup file - use Restore from backup instead');
    throw new Error('that is not a Field CRM exchange file');
  }
  if(data.kind === PLAN_KIND){
    const r = await mergePlanFile(data);
    renderPlanCount(); renderDbStat(); fillManagers();
    if(screen === 'today') renderToday();
    if(screen === 'plan') renderPlan();
    await renderHome();
    const bits = [r.added+' added', r.updated+' updated'];
    if(r.removed) bits.push(r.removed+' removed');
    if(r.kept) bits.push(r.kept+' kept, edited here since');
    if(r.accounts) bits.push(r.accounts+' accounts');
    return 'Plan merged: ' + bits.join(', ');
  }
  if(data.kind === CALL_KIND){
    const r = await mergeCallFile(data);
    await renderHome();
    const bits = [r.added+' calls added', r.updated+' updated'];
    if(r.skipped) bits.push(r.skipped+' already newer here');
    if(r.booked) bits.push(r.booked+' unplanned visit'+(r.booked===1?'':'s')+' added to the plan');
    if(r.visits) bits.push(r.visits+' visit outcomes');
    return 'Calls merged: ' + bits.join(', ') + ' (' + r.photos + ')';
  }
  throw new Error('unrecognised exchange file: ' + data.kind);
}

/* Kept as a name because several places still call it after loading a file.
   The Exchange panel, its folder and GitHub syncs (v78) and the on-screen load
   log and Dynamics CSVs (v79) are gone; the log is still kept in kv 'loadLog'. */
function renderExchange(){ renderLoadLog(); }

/* ================= one door for every incoming file =================

   The share target, the Receive button and the Restore button all end up here.
   Android hands over whatever the user tapped Share on, with no way to say what
   kind of file it is, so the app has to work it out - and once it can, there is
   no reason the on-screen buttons should be fussier than the share sheet.

   Sniffing is on content, not the filename. A plan file renamed by OneDrive to
   "field-crm-plan-2026-09-07 (1).json" still has its kind inside it. */
async function routeIncomingFile(file, opts){
  try { return await routeIncomingFileInner(file, opts); }
  catch(e){
    // a refusal is worth logging too - during testing the question is always
    // "did that file load?", and "no, and here is why" is a real answer
    await logLoad(file.name || '(no name)', 'unknown', e.message, true);
    throw e;
  }
}
async function routeIncomingFileInner(file, opts){
  opts = opts || {};
  const name = (file.name || '').toLowerCase();

  if(name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')){
    await importCrm(file);
    return 'Imported ' + (META ? META.counts.accounts + ' accounts' : 'the CRM export');
  }

  let data;
  try { data = JSON.parse(await file.text()); }
  catch(e){
    throw new Error('that is not a file Field CRM knows what to do with. Expected a plan, ' +
      'a call file, a backup, the zone overrides, or a CRM export.');
  }

  if(data && (data.kind === PLAN_KIND || data.kind === CALL_KIND)){
    const msg = await receiveExchange(file);
    await logLoad(file.name || 'exchange file',
      data.kind === PLAN_KIND ? 'plan' : 'calls', msg);
    return msg;
  }
  if(data && data.format === BACKUP_FORMAT){
    /* A backup arriving through the share sheet is almost always deliberate, but
       it is the one route that can pull a whole database in, so it asks. */
    if(!opts.silent && !confirm('That is a backup file, not a plan.\n\nRestore from it?\n\n' +
       'Records are added and updated by id. Nothing already on this device is deleted.')) {
      return 'Restore cancelled';
    }
    await doRestore(file);
    await logLoad(file.name || 'backup', 'backup',
      (data.calls||[]).length + ' calls, ' + (data.accounts||[]).length + ' accounts' +
      (data.withPhotos ? ', with photos' : ', no photos'));
    return 'Backup restored';
  }
  if(data && (data.acctZone || data.spelling)){
    await importOverrides(file);
    return Object.keys(OVERRIDES.acctZone).length + ' zone overrides loaded';
  }
  if(data && data.source === TS_SOURCE){
    const rep = await importTaskSlaughterer(data);
    await logLoad(file.name || 'Task Slaughterer tasks', 'tasks', rep.line);
    return rep.line;
  }
  throw new Error('that JSON file is not a Field CRM plan, call file, backup, zone overrides or Task Slaughterer tasks');
}

/* ---------- share target hand-off ----------
   The service worker parks the shared file in a cache and redirects here, because
   a File cannot survive the redirect itself. Collected once, then deleted - a
   file left in the cache would re-import itself on every launch. */
const SHARE_CACHE = 'fieldcrm-share', SHARE_KEY = './shared-file';
async function takeSharedFile(){
  if(typeof caches === 'undefined') return null;
  try {
    const c = await caches.open(SHARE_CACHE);
    const res = await c.match(SHARE_KEY);
    if(!res) return null;
    await c.delete(SHARE_KEY);
    const name = decodeURIComponent(res.headers.get('x-filename') || 'shared-file');
    const blob = await res.blob();
    return new File([blob], name, {type: res.headers.get('content-type') || blob.type || ''});
  } catch(e){ console.warn('share hand-off', e); return null; }
}
async function consumeSharedFile(){
  const file = await takeSharedFile();
  // strip ?shared=1 either way, so it cannot linger in the history entries
  try {
    if(location.search) history.replaceState(history.state || {screen:'home'}, '',
      location.pathname + location.hash);
  } catch(e){}
  if(!file) return;
  toast('Reading ' + file.name + '...');
  try {
    const msg = await routeIncomingFile(file);
    renderExchange(); renderDbStat(); fillManagers(); renderBackupStat();
    await renderHome();
    toast(msg);
  } catch(e){
    console.error(e);
    toast(file.name + ': ' + e.message);
  }
}

/* ================= what has been loaded =================
   Every file that comes in or goes out is written to a short log with its
   filename, when, and what it did. During testing the constant question is "did that
   actually load?" and a toast that has already faded is no answer. */
let LOAD_LOG = [];
const LOAD_LOG_MAX = 12;
const LOAD_KIND = {
  crm:'CRM export', overrides:'Zone overrides', beltref:'Belt reference data',
  assets:'Plant audit register',
  manual:'Engineering manual', ghpull:'Pulled from GitHub', ghpush:'Pushed to GitHub',
  ghtest:'GitHub connection', cloud:'Cloud sync', plan:'Plan from PC',
  calls:'Calls from phone', backup:'Backup restore', sent:'Sent', folder:'Folder',
  tasks:'Task Slaughterer tasks'
};
async function logLoad(filename, kind, detail, failed){
  LOAD_LOG.unshift({at: Date.now(), file: filename || '(no name)', kind: kind,
                    detail: detail || '', failed: !!failed});
  LOAD_LOG = LOAD_LOG.slice(0, LOAD_LOG_MAX);
  try { await kvSet('loadLog', LOAD_LOG); } catch(e){}
  renderLoadLog();
}
function renderLoadLog(){
  const el = $('loadLog');
  if(!el) return;
  if(!LOAD_LOG.length){
    el.innerHTML = '<p class="empty">No files loaded on this device yet.</p>';
    return;
  }
  el.innerHTML = LOAD_LOG.map(r => {
    const d = new Date(r.at);
    return '<div class="ldrow'+(r.failed ? ' bad' : '')+'">'+
      '<div class="ldtop"><span class="ldok">'+(r.failed ? '\u2717 Failed' : '\u2713 Loaded successfully')+
      '</span><span class="ldkind">'+esc(LOAD_KIND[r.kind] || r.kind)+'</span></div>'+
      '<div class="ldfile">'+esc(r.file)+'</div>'+
      '<div class="lddet">'+esc(r.detail)+'</div>'+
      '<div class="ldwhen">'+d.toLocaleDateString()+' '+
        d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})+'</div></div>';
  }).join('');
}

/* ================= Task Slaughterer import (v89) =================
   A one-off move of the tasks out of Task Slaughterer 9000 (a Claude artifact
   that kept them in its own database). Tasks only, by Ben's decision: its
   emails, saved notes, appointments and Not stocked list stay where they are.
   The file is {source: TS_SOURCE, tasks: [...]} with Task Slaughterer's own
   records. Its fields are the ones the CRM's tasks were modelled on, so the
   mapping is one to one.

   Where they land (Ben, 2026-10-09): open tasks on the import day, from 8am,
   half an hour apart, in the order they were made, so they are in front of
   him; done tasks on the day they were ticked off, as history.

   Each keeps its Task Slaughterer id as 'ts-<id>', so a second import of the
   same file adds nothing, and a task edited here since is never overwritten. */
const TS_SOURCE = 'task-slaughterer-9000';
const TS_KIND = {add_project: 'Add project to Dynamics', update_project: 'Update project',
  contact_update: 'Update contact details', email: 'Write email', book_travel: 'Book travel',
  book_call: 'Book customer call', call: 'Call', other: 'Other'};
// Task Slaughterer accounts were typed freely: exact name first, then the one
// CRM account whose name holds every word typed. Otherwise the text is kept.
function tsAccount(text){
  const t = String(text || '').trim();
  if(!t) return {acct: '', how: 'none'};
  const norm = x => x.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const n = norm(t);
  const exact = ACCOUNTS.find(a => norm(a.a) === n);
  if(exact) return {acct: exact.a, how: 'matched'};
  const words = n.split(' ').filter(w => w.length > 1);
  const hits = words.length ? ACCOUNTS.filter(a => { const h = ' ' + norm(a.a) + ' '; return words.every(w => h.includes(' ' + w + ' ')); }) : [];
  if(hits.length === 1) return {acct: hits[0].a, how: 'matched'};
  return {acct: t, how: 'kept'};
}
// the CRM contact whose email is this address, for an email draft with no account
function tsContactByEmail(addr){
  const a = String(addr || '').split(/[;,\s]+/).filter(Boolean)[0];
  if(!a) return null;
  const low = a.toLowerCase();
  for(const acc of ACCOUNTS) for(const c of (acc.c || [])) if((c.e || []).some(e => String(e).toLowerCase() === low)) return {acct: acc.a, contact: c.n};
  return null;
}
async function importTaskSlaughterer(data){
  /* Tasks, and (v91) its email drafts as Write email tasks carrying the draft.
     Both become one list so open ones share the import day's slots in the
     order they were made. */
  const tasksIn = (Array.isArray(data.tasks) ? data.tasks : []).filter(x => x && x.id && (x.title || x.kind))
    .map(x => Object.assign({}, x, {key: 'ts-' + x.id}));
  const mailsIn = (Array.isArray(data.emails) ? data.emails : []).filter(x => x && x.id && (x.subject || x.body)).map(x => {
    const who = tsContactByEmail(x.to);
    return {key: 'ts-mail-' + x.id, kind: 'email', title: x.subject || 'Email', account: who ? who.acct : null,
      contact: who ? who.contact : null, email: x.to || null, mailTo: x.to || '', mailSubject: x.subject || '', mailBody: x.body || '',
      done: !!x.used, doneAt: x.used ? (x.usedAt || x.createdAt || null) : null, createdAt: x.createdAt};
  });
  const list = tasksIn.concat(mailsIn);
  const lists = await tsImportLists(data);
  if(!list.length){
    if(!lists.total) throw new Error('that Task Slaughterer file has nothing in it this app takes');
    return {added: lists.added, skipped: lists.skipped, open: 0, done: 0, mails: 0, kept: lists.kept, line: lists.line};
  }
  const have = new Set(TASKS.map(t => t.id));
  const today = todayISOdate();
  const open = list.filter(x => !x.done).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const done = list.filter(x => x.done);
  const kept = new Set();
  let added = 0, skipped = 0, slot = 0, mails = 0;
  const str = v => v == null ? '' : String(v);
  const make = (x, date, start) => {
    const a = tsAccount(x.account);
    if(a.how === 'kept') kept.add(a.acct);
    if(x.kind === 'email' && x.mailSubject != null) mails++;
    return {
      id: x.key, type: TS_KIND[x.kind] || 'Other', title: str(x.title).trim(),
      date, start, dur: TASK_DUR, acct: a.acct, contact: str(x.contact), email: str(x.email),
      mobile: str(x.mobile), project: str(x.project), revenue: x.revenue == null ? '' : str(x.revenue),
      notes: str(x.notes), mailTo: str(x.mailTo), mailSubject: str(x.mailSubject), mailBody: str(x.mailBody),
      done: !!x.done, doneAt: x.done ? (x.doneAt || null) : null, callId: null,
      created: x.createdAt || Date.now(), updated: Date.now(), from: TS_SOURCE
    };
  };
  for(const x of open){
    if(have.has(x.key)){ skipped++; continue; }
    const mins = Math.min(8 * 60 + 30 * slot++, 23 * 60 + 30);
    await tasksPut(make(x, today, hhmm(mins)));
    added++;
  }
  for(const x of done){
    if(have.has(x.key)){ skipped++; continue; }
    const when = new Date(x.doneAt || x.createdAt || Date.now());
    await tasksPut(make(x, iso(when), hhmm(Math.floor((when.getHours() * 60 + when.getMinutes()) / 30) * 30)));
    added++;
  }
  TASKS = await tasksAll();
  taskRefresh();
  const nOpen = open.filter(x => !have.has(x.key)).length, nDone = added - nOpen;
  const line = added
    ? added + ' task' + (added === 1 ? '' : 's') + ' brought in' + (mails ? ' (' + mails + ' of them email drafts)' : '') + ': ' +
      nOpen + ' open on today, ' + nDone + ' done on the day done' +
      (skipped ? '. ' + skipped + ' were already here' : '') +
      (kept.size ? '. ' + kept.size + ' account name' + (kept.size === 1 ? '' : 's') + ' not in the CRM, kept as typed: ' + [...kept].join(', ') : '')
    : 'Nothing new: all ' + skipped + ' tasks in that file are already here';
  return {added: added + lists.added, skipped: skipped + lists.skipped, open: nOpen, done: nDone, mails,
    kept: [...kept].concat(lists.kept), line: line + (lists.total ? '. ' + lists.line : '')};
}
/* Its saved notes (the 'templates' collection) and Not stocked list
   ('products'), v97. Each keeps its id as 'ts-<id>' in its own store, so a
   second import adds nothing and never overwrites one changed here. */
async function tsImportLists(data){
  const tpls = (Array.isArray(data.templates) ? data.templates : []).filter(x => x && x.id && (x.label || x.text));
  const prods = (Array.isArray(data.products) ? data.products : []).filter(x => x && x.id && (x.name || x.part));
  const haveS = new Set(SNIPS.map(x => x.id)), haveP = new Set(PRODS.map(x => x.id));
  const str = v => v == null ? '' : String(v);
  const kept = new Set();
  let sn = 0, pr = 0, skipped = 0;
  for(const x of tpls){
    const id = 'ts-' + x.id;
    if(haveS.has(id)){ skipped++; continue; }
    await snippetsPut({id, label: str(x.label).trim(), reason: str(x.reason).trim(), text: str(x.text),
      created: x.createdAt || Date.now(), lastUsed: x.lastUsed || 0, updated: Date.now(), from: TS_SOURCE});
    sn++;
  }
  for(const x of prods){
    const id = 'ts-' + x.id;
    if(haveP.has(id)){ skipped++; continue; }
    const a = tsAccount(x.account);
    if(a.how === 'kept') kept.add(a.acct);
    const status = PR_STATUS.includes(x.status) ? x.status : 'Not stocked';
    await productsPut({id, name: str(x.name).trim(), part: str(x.part).trim(), status, acct: a.acct, notes: str(x.notes),
      stocked: !!x.stocked, stockedAt: x.stocked ? (x.stockedAt || Date.now()) : null,
      created: x.createdAt || Date.now(), updated: Date.now(), from: TS_SOURCE});
    pr++;
  }
  await loadLists();
  if(screen === 'lists') renderLists();
  const n = (k, w) => k + ' ' + w + (k === 1 ? '' : 's');
  const total = tpls.length + prods.length;
  const line = !total ? '' : (sn + pr)
    ? n(sn, 'saved note') + ' and ' + n(pr, 'product') + ' brought in to Lists' +
      (skipped ? ' (' + skipped + ' already here)' : '') +
      (kept.size ? '. Product account' + (kept.size === 1 ? '' : 's') + ' not in the CRM, kept as typed: ' + [...kept].join(', ') : '')
    : 'Saved notes and products: all ' + skipped + ' already here';
  return {added: sn + pr, skipped, total, kept: [...kept], line};
}
document.addEventListener('DOMContentLoaded', () => {
  const b = $('tsBtn');
  if(b) b.addEventListener('click', async () => {
    const f = $('tsFile').files[0], msg = $('tsMsg');
    if(!f){ toast('Choose the Task Slaughterer file first'); return; }
    b.disabled = true;
    try {
      let data;
      try { data = JSON.parse(await f.text()); } catch(e){ throw new Error('that is not a Task Slaughterer file'); }
      if(!data || data.source !== TS_SOURCE) throw new Error('that is not a Task Slaughterer file');
      const rep = await importTaskSlaughterer(data);
      showMsg(msg, 'ok', esc(rep.line) + '.');
      await logLoad(f.name, 'tasks', rep.line);
      toast(rep.added ? rep.added + ' brought in from Task Slaughterer' : 'Nothing new to bring in');
    } catch(e){
      console.error(e);
      showMsg(msg, 'warn', 'That did not work: ' + esc(e.message) + '. Nothing was changed.');
    } finally { b.disabled = false; }
  });
});

/* ================= tasks =================

   Ben's tasks, brought in from Task Slaughterer 9000 (IDEAS.md) with the same
   fields, the account and contact picked from the CRM. Every task sits on the
   calendar for 30 minutes on its date. A new one lands on the day it is added,
   at the next half hour, and is moved from there - by dragging it in the week
   or day view, or by changing its date and time. A task added from inside a
   call carries that call's id and is listed under it on the call screen.

   The form follows Ben's Done rule (PREFERENCES.md): no Save button - Done
   leaves and saves; nothing entered is discarded silently; a task with no
   title is kept as a draft and says so. Closing it any other way (Escape,
   the back gesture) counts as Done, so nothing typed is lost. */
const TASK_TYPES = ['Add project to Dynamics', 'Update project', 'Update contact details', 'Write email',
                    'Book travel', 'Book customer call', 'Call', 'Other'];
const TASK_DUR = 30;
let taskEdit = null, taskIsNew = false, taskBefore = '';

function tasksOn(dISO){ return TASKS.filter(t => t.date === dISO).sort((x,y)=>(x.start||'').localeCompare(y.start||'')); }

/* ---------- quote requests on the calendar (v86) ----------
   A quote request is not a visit, so it never becomes an appointment: no
   Outlook invite, nothing towards the account's cadence. It shows on the day it
   was made, read straight from the quote records, at the time it was started
   (its id is that moment), and opens the request when tapped. */
let QUOTES = [];
function quoteCal(q){
  const made = parseInt(String(q.id).slice(1), 10);
  const d = isFinite(made) && made > 0 ? new Date(made) : null;
  const date = isoFromDdmmyyyy(q.date) || (d ? iso(d) : '');
  // backdated to another day: no real time to show, so the start of the day
  const start = d && iso(d) === date ? hhmm(Math.floor((d.getHours() * 60 + d.getMinutes()) / 15) * 15) : '08:00';
  return {id: q.id, acct: q.customer || 'Quote request', date, start, done: !!q.closed,
    belts: (q.entries || []).filter(e => e.type === 'belt').length};
}
async function loadQuotes(){
  QUOTES = (await quotesAll()).map(quoteCal).filter(q => q.date);
}
function quotesOn(dISO){ return QUOTES.filter(q => q.date === dISO).sort((x,y) => x.start.localeCompare(y.start)); }
const quoteLabel = q => (q.start || '') + ' RFQ ' + q.acct;
function quoteEl(q, pill){
  const el = document.createElement('div');
  el.className = (pill ? 'pill' : 'appt') + ' quote' + (q.done ? ' done' : '');
  el.tabIndex = 0;
  el.innerHTML = pill ? '<span class="pt"></span>' : '<div class="a"><span></span></div>';
  el.querySelector(pill ? '.pt' : '.a span').textContent = quoteLabel(q);
  el.title = 'Quote request: ' + q.acct + (q.belts ? '\n' + q.belts + ' belt' + (q.belts === 1 ? '' : 's') : '') + (q.done ? '\nDone' : '');
  const open = e => { e.stopPropagation(); openQuote(q.id).catch(reportErr); };
  el.addEventListener('click', open);
  el.addEventListener('keydown', e => { if(e.key === 'Enter') open(e); });
  return el;
}
// the phone's Day and Week lists
function quoteCard(q){
  return '<div class="vis quote' + (q.done ? ' settled' : '') + '">' +
    '<button class="vopen" data-qopen="' + esc(q.id) + '">' +
      '<div class="vtop"><span class="when">' + esc(q.start) + '</span><span class="who">' + esc(q.acct) + '</span></div>' +
      '<div class="vsub">' + ['Quote request', q.belts ? q.belts + ' belt' + (q.belts === 1 ? '' : 's') : '', q.done ? 'done' : ''].filter(Boolean).map(esc).join(' &middot; ') + '</div>' +
    '</button></div>';
}
/* ---------- calendar filter and search (v87) ----------
   All, Visits, Tasks or Quotes, on the PC calendar and the phone's Day, Week
   and Month alike. Held in memory only: it is back on All every time the app
   opens, so a filter left on Tasks cannot quietly hide next week's visits. */
let calKind = 'all';
const CAL_KINDS = [['all', 'All'], ['visit', 'Visits'], ['task', 'Tasks'], ['quote', 'Quotes']];
const showKind = k => calKind === 'all' || calKind === k;
const calA = () => showKind('visit') ? APPTS : [];
const calT = () => showKind('task') ? TASKS : [];
const calQ = () => showKind('quote') ? QUOTES : [];
function renderKinds(){
  ['tvKinds', 'pKinds'].forEach(id => {
    const el = $(id);
    if(!el) return;
    el.innerHTML = '<div class="chips">' + CAL_KINDS.map(([k, label]) =>
      '<button type="button" data-kind="' + k + '" aria-pressed="' + (calKind === k) + '"' + (calKind === k ? ' class="on"' : '') + '>' + label + '</button>').join('') +
      '</div><button type="button" class="tvi" data-calsearch="1" aria-label="Search the calendar" title="Search the calendar">' + icon('search') + '</button>';
    el.querySelectorAll('[data-kind]').forEach(b => b.addEventListener('click', () => {
      // tap the one that is on again to go back to All
      calKind = (b.dataset.kind === calKind) ? 'all' : b.dataset.kind;
      renderKinds();
      if(screen === 'today') renderToday();
      if(screen === 'plan') renderCalendar();
    }));
    el.querySelector('[data-calsearch]').addEventListener('click', openCalSearch);
  });
}
// one searchable line per calendar item
function calHay(kind, x){
  if(kind === 'task') return [x.title, x.type, x.acct, x.contact, x.notes, x.project, x.email, x.mailTo, x.mailSubject, x.mailBody].filter(Boolean).join(' ').toLowerCase();
  if(kind === 'quote') return [x.acct, 'quote request rfq'].join(' ').toLowerCase();
  const a = ACC_BY_NAME.get(x.acct);
  const cts = a ? (x.contacts || []).map(i => a.c[i]).filter(Boolean).map(c => c.n) : [];
  return [x.acct, x.type, x.agenda, a ? a.sub : ''].concat(cts).filter(Boolean).join(' ').toLowerCase();
}
function calJump(dISO){
  if(screen === 'plan'){ plan.view = 'day'; plan.anchor = parseIso(dISO);
    $('pView').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === 'day'));
    renderCalendar(); return; }
  tvCursor = dISO; tvSetView('today');
}
function openCalSearch(){
  const what = calKind === 'all' ? 'tasks, visits and quote requests' : CAL_KINDS.find(k => k[0] === calKind)[1].toLowerCase();
  openSearch({
    placeholder: 'Search ' + what,
    render(q, el, hint){
      const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
      if(!terms.length){ el.innerHTML = ''; hint.textContent = ''; return; }
      const hit = (kind, x) => terms.every(t => calHay(kind, x).includes(t));
      const rows = calT().filter(x => hit('task', x)).map(x => ({kind: 'task', x, date: x.date, done: x.done}))
        .concat(calA().filter(x => hit('visit', x)).map(x => ({kind: 'visit', x, date: x.date, done: apSettled(x)})))
        .concat(calQ().filter(x => hit('quote', x)).map(x => ({kind: 'quote', x, date: x.date, done: x.done})))
        // what is still to do first, then the most recent
        .sort((a, b) => (a.done - b.done) || b.date.localeCompare(a.date));
      hint.textContent = rows.length ? rows.length + ' found' : 'Nothing matches that.';
      el.innerHTML = rows.slice(0, 100).map((r, i) => {
        const x = r.x, label = r.kind === 'task' ? 'Task' : r.kind === 'quote' ? 'Quote request' : (x.type || 'Visit');
        const name = r.kind === 'task' ? taskTitle(x) : x.acct;
        const sub = [label, dayLabel(x.date) + (x.start ? ' ' + x.start : ''), r.kind === 'task' ? x.acct : '', r.done ? 'done' : '']
          .filter(Boolean).map(esc).join(' &middot; ');
        return '<button type="button" class="fs-acct cal-' + r.kind + (r.done ? ' done' : '') + '" data-fs="' + i + '">' +
          '<div class="an">' + esc(name) + '</div><div class="am">' + sub + '</div></button>';
      }).join('') + (rows.length > 100 ? '<p class="hint">' + (rows.length - 100) + ' more \u2014 add another word</p>' : '');
      el.querySelectorAll('[data-fs]').forEach(b => b.addEventListener('click', () => {
        const r = rows[+b.dataset.fs];
        closeSearch();
        if(r.kind === 'quote'){ openQuote(r.x.id).catch(reportErr); return; }
        calJump(r.x.date);
        if(r.kind === 'task') openTask(r.x.id);
      }));
    }
  });
}

async function openQuote(id){
  const found = (await recordsAll()).find(c => c.id === id);
  if(!found){ toast('That quote request could not be found'); return; }
  call = found;
  call.loose = call.loose || [];
  go('dash');
}
const taskTitle = t => t.title || t.type || 'Untitled task';
// the next half hour after now: added at 10:12, it sits at 10:30; at 9:12pm, 9:30pm
function nextHalfHour(d){
  const m = d.getHours() * 60 + d.getMinutes();
  return hhmm(Math.min(Math.ceil((m + 1) / 30) * 30, 23 * 60 + 30));
}
async function taskMoved(t){ t.updated = Date.now(); await tasksPut(t); }
async function taskToggle(t){
  t.done = !t.done;
  t.doneAt = t.done ? Date.now() : null;
  t.updated = Date.now();
  await tasksPut(t);
  toast(t.done ? 'Completed: ' + taskTitle(t) : 'Not completed: ' + taskTitle(t));
  taskRefresh();
}
function taskRefresh(){
  if(screen === 'plan') renderPlan();
  if(screen === 'today') renderToday();
  if(screen === 'dash' && call) renderDashTasks();
}

function taskEl(t, pill){
  const el = document.createElement('div');
  el.className = (pill ? 'pill' : 'appt') + ' task' + (t.done ? ' done' : '');
  el.tabIndex = 0;
  const tick = '<button type="button" class="tick" aria-label="' + (t.done ? 'Mark not completed' : 'Mark completed') +
    '" title="' + (t.done ? 'Completed - tap to undo' : 'Mark completed') + '">' + (t.done ? icon('check') : '') + '</button>';
  if(pill){
    el.innerHTML = tick + '<span class="pt"></span>';
    el.querySelector('.pt').textContent = (t.start || '') + ' ' + taskTitle(t);
  } else {
    // one line: 30 minutes is too short for the three lines an appointment card has
    el.innerHTML = tick + '<div class="a"><span></span></div>';
    el.querySelector('.a span').textContent = (t.start || '') + ' ' + taskTitle(t);
  }
  el.title = 'Task: ' + taskTitle(t) + (t.acct ? '\n' + t.acct : '') + (t.done ? '\nCompleted' : '');
  el.querySelector('.tick').addEventListener('click', e => {
    e.stopPropagation();
    taskToggle(t).catch(err => { console.error(err); toast('Could not update the task: ' + err.message); });
  });
  el.addEventListener('click', e => { e.stopPropagation(); openTask(t.id); });
  el.addEventListener('keydown', e => { if(e.key === 'Enter'){ e.stopPropagation(); openTask(t.id); } });
  return el;
}

/* Tasks raised in this call, under the call log. */
function renderDashTasks(){
  const el = $('dashTasks');
  if(!el || !call) return;
  const list = TASKS.filter(t => t.callId === call.id).sort((a,b) => (a.date + a.start).localeCompare(b.date + b.start));
  $('dashTasksHead').hidden = !list.length;
  el.innerHTML = '';
  for(const t of list){
    const row = taskEl(t, true);
    row.classList.add('row');
    const when = document.createElement('span');
    when.className = 'when'; when.textContent = ddmmyyyy(t.date);
    row.appendChild(when);
    el.appendChild(row);
  }
}

function taskFillContacts(acct, keep){
  const sel = $('tkContact'), a = ACC_BY_NAME.get(acct);
  sel.innerHTML = '<option value="">(none)</option>';
  const names = a ? a.c.map(c => c.n) : [];
  if(keep && !names.includes(keep)) names.unshift(keep);     // a contact since removed from the CRM stays visible
  for(const n of names){ const o = document.createElement('option'); o.value = o.textContent = n; sel.appendChild(o); }
  sel.value = keep || '';
}
/* Email and mobile fill from the contact, but never over something typed. */
function taskAutoFill(){
  const a = ACC_BY_NAME.get($('tkAcct').value.trim());
  const c = a ? a.c.find(x => x.n === $('tkContact').value) : null;
  [['tkEmail', c ? (c.e || [])[0] || '' : ''], ['tkMobile', c ? c.p || '' : '']].forEach(([id, v]) => {
    const f = $(id);
    if(!f.value || f.value === f.dataset.auto){ f.value = v; f.dataset.auto = v; }
  });
  taskSyncTo();
}
/* ---------- Write email tasks (v91) ----------
   The task carries the draft: To, Subject, Body. To follows the task's email
   (itself filled from the contact) until something is typed over it, and is
   badged while it does. Open in Outlook hands a mailto link to the phone or
   PC: a new message in the default mail app with everything filled in.
   Nothing is downloaded, which is what sank .eml on Android. */
const MAIL_TYPE = 'Write email';
const MAILTO_MAX = 1800;            // longer links get cut short by some mail apps and by Windows
function taskTypeNow(){ const on = $('tkType').querySelector('button.on'); return on ? on.dataset.v : ''; }
function taskShowMail(){ $('tkMail').hidden = taskTypeNow() !== MAIL_TYPE; taskSyncTo(); }
function taskSyncTo(){
  const to = $('tkTo'), v = $('tkEmail').value.trim();
  if(!to.value || to.value === to.dataset.auto){ to.value = v; to.dataset.auto = v; }
  $('tkToAuto').hidden = !(to.value && to.value === to.dataset.auto);
}
function mailtoFor(to, subject, body){
  const q = [];
  if(subject) q.push('subject=' + encodeURIComponent(subject));
  if(body) q.push('body=' + encodeURIComponent(body.replace(/\r?\n/g, '\r\n')));
  return 'mailto:' + to.split(/[;,\s]+/).filter(Boolean).map(encodeURIComponent).join(',') + (q.length ? '?' + q.join('&') : '');
}
function taskOpenMail(){
  const to = $('tkTo').value.trim(), subject = $('tkSubject').value.trim() || $('tkTitle').value.trim(), body = $('tkBody').value;
  if(!to && !subject && !body.trim()){ toast('Nothing to send yet'); return; }
  let url = mailtoFor(to, subject, body);
  if(url.length > MAILTO_MAX){
    // too long to carry: open with To and Subject, and hand the body over by the clipboard
    url = mailtoFor(to, subject, '');
    copyText(body, 'Email body');
    toast('The body is too long to pass to Outlook - it is copied, paste it in');
  }
  const a = document.createElement('a');
  a.href = url; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
}
function taskRead(){
  const t = taskEdit;
  const on = $('tkType').querySelector('button.on');
  t.type = on ? on.dataset.v : '';
  t.title = $('tkTitle').value.trim();
  t.date = $('tkDate').value || todayISOdate();
  t.start = $('tkTime').value || nextHalfHour(new Date());
  t.dur = TASK_DUR;
  t.acct = $('tkAcct').value.trim();
  t.contact = $('tkContact').value;
  t.email = $('tkEmail').value.trim();
  t.mobile = $('tkMobile').value.trim();
  t.mailTo = $('tkTo').value.trim();
  t.mailSubject = $('tkSubject').value.trim();
  t.mailBody = $('tkBody').value;
  t.project = $('tkProject').value.trim();
  t.revenue = $('tkRevenue').value.trim();
  t.notes = $('tkNotes').value;
  if($('tkDone').checked !== !!t.done){ t.done = $('tkDone').checked; t.doneAt = t.done ? Date.now() : null; }
  return t;
}
function openTask(id, extra){
  const t = id ? TASKS.find(x => x.id === id) : null;
  if(id && !t){ toast('That task could not be found'); return; }
  taskIsNew = !t;
  taskEdit = t ? Object.assign({}, t) : Object.assign({
    id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    type: '', title: '', date: todayISOdate(), start: nextHalfHour(new Date()), dur: TASK_DUR,
    acct: '', contact: '', email: '', mobile: '', project: '', revenue: '', notes: '',
    mailTo: '', mailSubject: '', mailBody: '',
    done: false, doneAt: null, callId: null, created: Date.now()
  }, extra || {});
  const e = taskEdit;
  $('tkHead').textContent = taskIsNew ? 'New task' : 'Task';
  $('tkType').innerHTML = TASK_TYPES.map(x => '<button type="button" data-v="' + esc(x) + '"' + (x === e.type ? ' class="on"' : '') + '>' + esc(x) + '</button>').join('');
  $('tkMail').hidden = e.type !== MAIL_TYPE;
  $('tkTitle').value = e.title || '';
  $('tkDate').value = e.date || '';
  $('tkTime').value = e.start || '';
  const dl = $('tkAcctList');
  if(dl.childElementCount !== ACCOUNTS.length){
    dl.innerHTML = '';
    for(const a of ACCOUNTS){ const o = document.createElement('option'); o.value = a.a; dl.appendChild(o); }
  }
  $('tkAcct').value = e.acct || '';
  taskFillContacts(e.acct, e.contact);
  $('tkEmail').value = e.email || ''; $('tkEmail').dataset.auto = '';
  $('tkTo').value = e.mailTo || ''; $('tkTo').dataset.auto = '';
  $('tkSubject').value = e.mailSubject || ''; $('tkBody').value = e.mailBody || '';
  $('tkToAuto').hidden = true;
  $('tkMobile').value = e.mobile || ''; $('tkMobile').dataset.auto = '';
  if(e.contact && !e.email && !e.mobile) taskAutoFill();
  $('tkProject').value = e.project || '';
  $('tkRevenue').value = e.revenue || '';
  $('tkNotes').value = e.notes || '';
  $('tkDone').checked = !!e.done;
  const from = e.callId ? (CALLS_BY_ACCT.get(e.acct) || []).find(c => c.id === e.callId) : null;
  $('tkFrom').hidden = !e.callId;
  $('tkFrom').textContent = e.callId ? 'Raised in the call with ' + (from ? from.customer + ' on ' + from.date : (e.acct || 'this account')) : '';
  $('tkDel').hidden = taskIsNew;
  taskBefore = JSON.stringify(taskRead());
  const d = $('taskdlg');
  if(d.showModal) d.showModal(); else d.setAttribute('open', '');
  if(taskIsNew) setTimeout(() => { try { $('tkTitle').focus(); } catch(_){} }, 50);
}
async function taskFinish(){
  if(!taskEdit) return;
  const t = taskRead();
  taskEdit = null;
  const d = $('taskdlg');
  if(d.open){ if(d.close) d.close(); else d.removeAttribute('open'); }
  const blank = !t.title && !t.type && !t.acct && !t.notes.trim() && !t.project && !t.revenue && !t.email && !t.mobile &&
    !t.mailTo && !t.mailSubject && !(t.mailBody || '').trim();
  if(taskIsNew && blank) return;                         // nothing entered: no empty ghost task
  if(!taskIsNew && JSON.stringify(t) === taskBefore) return;   // opened and closed: nothing to save
  t.updated = Date.now();
  await tasksPut(t);
  TASKS = TASKS.filter(x => x.id !== t.id).concat([t]);
  const when = ddmmyyyy(t.date) + ' at ' + t.start;
  toast(!t.title && !t.type ? 'Kept as a draft — it has no title yet (' + when + ')'
    : taskIsNew ? 'Task on the calendar: ' + when : 'Task saved');
  taskRefresh();
}
async function taskDelete(){
  const t = taskEdit;
  if(!t) return;
  if(!confirm('Delete the task "' + taskTitle(t) + '" on ' + ddmmyyyy(t.date) + '?\n\nIt is gone from this device' +
      (sbUser ? ' and from your other devices when they next sync' : '') + '. This cannot be undone.')) return;
  taskEdit = null;
  const d = $('taskdlg');
  if(d.close) d.close(); else d.removeAttribute('open');
  await tasksDel(t.id);
  TASKS = TASKS.filter(x => x.id !== t.id);
  toast('Task deleted');
  taskRefresh();
}
$('tkType').addEventListener('click', e => {
  const b = e.target.closest('button'); if(!b) return;
  const was = b.classList.contains('on');
  $('tkType').querySelectorAll('button').forEach(x => x.classList.remove('on'));
  if(!was) b.classList.add('on');                        // tap again to deselect
  taskShowMail();
});
$('tkEmail').addEventListener('input', taskSyncTo);
$('tkTo').addEventListener('input', () => { $('tkToAuto').hidden = true; });
$('tkOutlook').addEventListener('click', taskOpenMail);
$('tkCopy').addEventListener('click', () => {
  const body = $('tkBody').value;
  if(!body.trim()){ toast('The body is empty'); return; }
  copyText(body, 'Email body');
});
$('tkAcct').addEventListener('change', () => { taskFillContacts($('tkAcct').value.trim(), ''); taskAutoFill(); });
$('tkContact').addEventListener('change', taskAutoFill);
$('tkOk').addEventListener('click', () => taskFinish().catch(e => { console.error(e); toast('Could not save the task: ' + e.message); }));
$('tkDel').addEventListener('click', () => taskDelete().catch(e => { console.error(e); toast('Could not delete: ' + e.message); }));
// Escape, or the dialog closed by the back gesture: treated as Done
$('taskdlg').addEventListener('cancel', e => { e.preventDefault(); taskFinish().catch(console.error); });
$('taskdlg').addEventListener('close', () => { if(taskEdit) taskFinish().catch(console.error); });

/* ================= Lists: saved notes and products (v97) =================
   The last two Task Slaughterer lists, on a Lists tile on Home (Ben's choice,
   2026-10-10) with a tab each.

   Saved notes: reusable text, mostly closing notes for Dynamics
   opportunities - a label, a close reason (Won / Lost / Not Qualified, or
   Other typed in) and the text. Copy is the point of them, so it is the
   first thing in the sheet and on the card's menu, and the list is ordered by
   when each was last copied.

   Products: the Not stocked list - product, part number, status (Not
   stocked / New product / Requested to stock), account and notes, ticked
   when stocked. Open and Stocked tabs.

   Both behave like tasks: tap the card to open it, Done leaves and saves,
   nothing entered is dropped, the bin asks first, Duplicate opens an unsaved
   copy. Both sync through the cloud as their own record stores. */
let SNIPS = [], PRODS = [];
const SN_REASONS = ['Won', 'Lost', 'Not Qualified', 'Other'];
const PR_STATUS = ['Not stocked', 'New product', 'Requested to stock'];
let listsPane = 'notes', prView = 'open';
async function loadLists(){
  try { SNIPS = await snippetsAll(); PRODS = await productsAll(); }
  catch(e){ console.error('lists', e); }
}
function showLists(p){ listsPane = p || listsPane; go('lists'); renderLists(); }
const newId = pre => pre + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const snTitle = r => (r.label || '').trim() || (r.text || '').trim().split('\n')[0].slice(0, 60) || 'Saved note';
const prTitle = r => (r.name || '').trim() || (r.part || '').trim() || 'Product';
function snSorted(list){ return list.slice().sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0) || (b.created || 0) - (a.created || 0)); }
function prSorted(list){
  return list.slice().sort((a, b) => a.stocked ? (b.stockedAt || 0) - (a.stockedAt || 0) : (b.created || 0) - (a.created || 0));
}
function snRow(r){
  const meta = [r.reason, (r.text || '').replace(/\s+/g, ' ').trim().slice(0, 90)].filter(Boolean).join(' · ');
  return '<div class="rprow">' +
    '<button class="rpt" data-snopen="' + esc(r.id) + '">' +
    '<div class="rn">' + esc(snTitle(r)) + '</div>' +
    '<div class="rm">' + esc(meta || 'No text yet') + '</div></button>' +
    '<button class="rpmore" data-snmenu="' + esc(r.id) + '" aria-label="More for ' + esc(snTitle(r)) + '">&#8943;</button></div>';
}
function prRow(r){
  const meta = [r.part, r.acct, r.stocked && r.stockedAt ? 'stocked ' + new Date(r.stockedAt).toLocaleDateString() : ''].filter(Boolean).join(' · ');
  return '<div class="rprow">' +
    '<button class="rpt" data-propen="' + esc(r.id) + '">' +
    (r.status ? '<div class="rt"><span class="rd"></span><span class="st ' + (r.stocked ? 'done' : 'open') + '">' + esc(r.stocked ? 'stocked' : r.status) + '</span></div>' : '') +
    '<div class="rn">' + esc(prTitle(r)) + '</div>' +
    '<div class="rm">' + esc(meta || 'No details yet') + '</div></button>' +
    '<button class="rpmore" data-prmenu="' + esc(r.id) + '" aria-label="More for ' + esc(prTitle(r)) + '">&#8943;</button></div>';
}
function wireListRows(el, before){
  el.querySelectorAll('[data-snopen]').forEach(b => b.addEventListener('click', () => { if(before) before(); openSnip(b.dataset.snopen); }));
  el.querySelectorAll('[data-snmenu]').forEach(b => b.addEventListener('click', () => snMenu(b.dataset.snmenu)));
  el.querySelectorAll('[data-propen]').forEach(b => b.addEventListener('click', () => { if(before) before(); openProd(b.dataset.propen); }));
  el.querySelectorAll('[data-prmenu]').forEach(b => b.addEventListener('click', () => prMenu(b.dataset.prmenu)));
}
function renderLists(){
  const notes = listsPane === 'notes';
  $('paneNotes').hidden = !notes;
  $('paneProds').hidden = notes;
  document.querySelectorAll('#lsTabs button').forEach(b => b.classList.toggle('on', b.dataset.pane === listsPane));
  if(notes){
    $('snHint').textContent = SNIPS.length ? SNIPS.length + ' saved note' + (SNIPS.length === 1 ? '' : 's') : '';
    $('snRes').innerHTML = SNIPS.length ? snSorted(SNIPS).map(snRow).join('') : '<p class="empty">No saved notes yet.</p>';
    wireListRows($('snRes'));
  } else {
    const open = PRODS.filter(r => !r.stocked), stocked = PRODS.filter(r => r.stocked);
    $('prHint').textContent = PRODS.length ? open.length + ' open, ' + stocked.length + ' stocked' : '';
    document.querySelectorAll('#prView button').forEach(b => b.classList.toggle('on', b.dataset.v === prView));
    const list = prSorted(prView === 'open' ? open : stocked);
    $('prRes').innerHTML = list.length ? list.map(prRow).join('')
      : '<p class="empty">' + (PRODS.length ? 'Nothing here.' : 'No products yet.') + '</p>';
    wireListRows($('prRes'));
  }
}
document.querySelectorAll('#lsTabs button').forEach(b => b.addEventListener('click', () => { listsPane = b.dataset.pane; renderLists(); }));
document.querySelectorAll('#prView button').forEach(b => b.addEventListener('click', () => { prView = b.dataset.v; renderLists(); }));
const snHay = r => [r.label, r.reason, r.text].filter(Boolean).join(' ').toLowerCase();
const prHay = r => [r.name, r.part, r.status, r.acct, r.notes, r.stocked ? 'stocked' : ''].filter(Boolean).join(' ').toLowerCase();
function listSearch(kind){
  const isSn = kind === 'sn';
  openSearch({
    placeholder: isSn ? 'Label, reason or any word in the text' : 'Product, part number, account or status',
    render(q, el, hint){
      const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
      if(!terms.length){ el.innerHTML = ''; hint.textContent = ''; return; }
      const all = isSn ? snSorted(SNIPS) : prSorted(PRODS);
      const hits = all.filter(r => terms.every(t => (isSn ? snHay(r) : prHay(r)).includes(t)));
      hint.textContent = hits.length ? hits.length + ' of ' + all.length : 'Nothing matches that.';
      el.innerHTML = hits.slice(0, 100).map(isSn ? snRow : prRow).join('');
      wireListRows(el, closeSearch);
    }
  });
}
$('snSearch').innerHTML = icon('search');
$('prSearch').innerHTML = icon('search');
$('snSearch').addEventListener('click', () => listSearch('sn'));
$('prSearch').addEventListener('click', () => listSearch('pr'));
$('snNew').addEventListener('click', () => openSnip(null));
$('prNew').addEventListener('click', () => openProd(null));

/* ---- chips, tap again to deselect ---- */
function chipRow(el, opts, on){
  el.innerHTML = opts.map(x => '<button type="button" data-v="' + esc(x) + '"' + (x === on ? ' class="on"' : '') + '>' + esc(x) + '</button>').join('');
}
function chipVal(el){ const b = el.querySelector('button.on'); return b ? b.dataset.v : ''; }
function chipTap(el, after){
  el.addEventListener('click', e => {
    const b = e.target.closest('button'); if(!b) return;
    const was = b.classList.contains('on');
    el.querySelectorAll('button').forEach(x => x.classList.remove('on'));
    if(!was) b.classList.add('on');
    if(after) after();
  });
}

/* ---- a saved note ---- */
let snEdit = null, snIsNew = false, snBefore = '';
function openSnip(id, copyOf){
  const r = id ? SNIPS.find(x => x.id === id) : null;
  if(id && !r){ toast('That saved note could not be found'); return; }
  snIsNew = !r;
  snEdit = r ? Object.assign({}, r) : Object.assign({id: newId('sn'), label: '', reason: '', text: '', created: Date.now(), lastUsed: 0},
    copyOf ? {label: copyOf.label ? copyOf.label + ' (copy)' : '', reason: copyOf.reason || '', text: copyOf.text || ''} : {});
  const e = snEdit;
  $('snHead').textContent = snIsNew ? (copyOf ? 'Copy of saved note' : 'New saved note') : 'Saved note';
  $('snLabel').value = e.label || '';
  const known = SN_REASONS.slice(0, -1).includes(e.reason);
  chipRow($('snReason'), SN_REASONS, !e.reason ? '' : known ? e.reason : 'Other');
  $('snOther').value = e.reason && !known ? e.reason : '';
  $('snOther').hidden = chipVal($('snReason')) !== 'Other';
  $('snText').value = e.text || '';
  $('snDel').hidden = snIsNew;
  snBefore = JSON.stringify(snRead());
  const d = $('snipdlg');
  if(d.showModal) d.showModal(); else d.setAttribute('open', '');
  if(snIsNew && !copyOf) setTimeout(() => { try { $('snLabel').focus(); } catch(_){} }, 50);
}
function snRead(){
  const pick = chipVal($('snReason'));
  return Object.assign({}, snEdit, {label: $('snLabel').value.trim(),
    reason: pick === 'Other' ? ($('snOther').value.trim() || 'Other') : pick, text: $('snText').value});
}
async function snFinish(){
  if(!snEdit) return;
  const r = snRead();
  snEdit = null;
  const d = $('snipdlg');
  if(d.open){ if(d.close) d.close(); else d.removeAttribute('open'); }
  if(snIsNew && !r.label && !r.text.trim()) return;               // nothing entered: nothing kept
  if(!snIsNew && JSON.stringify(r) === snBefore) return;
  r.updated = Date.now();
  await snippetsPut(r);
  SNIPS = SNIPS.filter(x => x.id !== r.id).concat([r]);
  toast(!r.label ? 'Saved — it has no label yet' : 'Saved note saved');
  if(screen === 'lists') renderLists();
}
async function snCopy(r){
  if(!(r.text || '').trim()){ toast('There is no text to copy'); return; }
  await copyText(r.text, 'Saved note');
  const cur = SNIPS.find(x => x.id === r.id);
  if(cur){ cur.lastUsed = Date.now(); cur.updated = Date.now(); await snippetsPut(cur); }
  if(screen === 'lists') renderLists();
}
async function snDelete(r){
  if(!confirm('Delete the saved note "' + snTitle(r) + '"?\n\nIt is gone from this device' +
      (sbUser ? ' and from your other devices when they next sync' : '') + '. This cannot be undone.')) return false;
  await snippetsDel(r.id);
  SNIPS = SNIPS.filter(x => x.id !== r.id);
  toast('Saved note deleted');
  if(screen === 'lists') renderLists();
  return true;
}
function snMenu(id){
  const r = SNIPS.find(x => x.id === id);
  if(!r) return;
  openCardMenu(snTitle(r), r.reason || '', [
    {label: 'Copy the text', icon: 'copy', run: () => snCopy(r).catch(reportErr)},
    {label: 'Duplicate', icon: 'plus', run: () => openSnip(null, r)},
    {label: 'Delete', icon: 'trash', danger: true, run: () => snDelete(r).catch(reportErr)}
  ]);
}
chipTap($('snReason'), () => {
  const other = chipVal($('snReason')) === 'Other';
  $('snOther').hidden = !other;
  if(other) setTimeout(() => { try { $('snOther').focus(); } catch(_){} }, 30);
});
$('snCopy').addEventListener('click', () => {
  const r = snRead();
  if(!r.text.trim()){ toast('There is no text to copy'); return; }
  copyText(r.text, 'Saved note');
  if(snEdit) snEdit.lastUsed = Date.now();
});
$('snOk').addEventListener('click', () => snFinish().catch(e => { console.error(e); toast('Could not save: ' + e.message); }));
$('snDel').addEventListener('click', async () => {
  const r = snEdit;
  if(!r) return;
  snEdit = null;                                    // the close handler must not save it back
  const d = $('snipdlg');
  if(!await snDelete(r).catch(e => { reportErr(e); return false; })){ snEdit = r; return; }
  if(d.close) d.close(); else d.removeAttribute('open');
});
$('snipdlg').addEventListener('cancel', e => { e.preventDefault(); snFinish().catch(console.error); });
$('snipdlg').addEventListener('close', () => { if(snEdit) snFinish().catch(console.error); });

/* ---- a product ---- */
let prEdit = null, prIsNew = false, prBefore = '';
function openProd(id, copyOf){
  const r = id ? PRODS.find(x => x.id === id) : null;
  if(id && !r){ toast('That product could not be found'); return; }
  prIsNew = !r;
  prEdit = r ? Object.assign({}, r) : Object.assign({id: newId('pr'), name: '', part: '', status: 'Not stocked', acct: '', notes: '',
    stocked: false, stockedAt: null, created: Date.now()},
    copyOf ? {name: copyOf.name || '', part: copyOf.part || '', status: copyOf.status || 'Not stocked', acct: copyOf.acct || '', notes: copyOf.notes || ''} : {});
  const e = prEdit;
  $('prHead').textContent = prIsNew ? (copyOf ? 'Copy of product' : 'New product') : 'Product';
  $('prName').value = e.name || '';
  $('prPart').value = e.part || '';
  chipRow($('prStatus'), PR_STATUS, e.status || '');
  const dl = $('prAcctList');
  if(dl.childElementCount !== ACCOUNTS.length){
    dl.innerHTML = '';
    for(const a of ACCOUNTS){ const o = document.createElement('option'); o.value = a.a; dl.appendChild(o); }
  }
  $('prAcct').value = e.acct || '';
  $('prNotes').value = e.notes || '';
  $('prStocked').checked = !!e.stocked;
  prStockedLine();
  $('prDel').hidden = prIsNew;
  prBefore = JSON.stringify(prRead());
  const d = $('proddlg');
  if(d.showModal) d.showModal(); else d.setAttribute('open', '');
  if(prIsNew && !copyOf) setTimeout(() => { try { $('prName').focus(); } catch(_){} }, 50);
}
function prStockedLine(){
  const on = $('prStocked').checked, at = prEdit && prEdit.stocked && prEdit.stockedAt;
  $('prStockedAt').textContent = on ? (at ? 'Stocked ' + new Date(at).toLocaleDateString() + '.' : 'Stocked today, once you tap Done.')
    : 'Tick it when it’s on the shelf. It moves to the Stocked tab.';
}
function prRead(){
  const stocked = $('prStocked').checked;
  return Object.assign({}, prEdit, {name: $('prName').value.trim(), part: $('prPart').value.trim(), status: chipVal($('prStatus')),
    acct: $('prAcct').value.trim(), notes: $('prNotes').value, stocked,
    stockedAt: stocked ? (prEdit.stocked && prEdit.stockedAt) || Date.now() : null});
}
async function prFinish(){
  if(!prEdit) return;
  const r = prRead();
  const was = prEdit;
  prEdit = null;
  const d = $('proddlg');
  if(d.open){ if(d.close) d.close(); else d.removeAttribute('open'); }
  if(prIsNew && !r.name && !r.part && !r.acct && !r.notes.trim()) return;
  // the stocked date is filled in on reading, so it is left out of the comparison; the tick is not
  const strip = x => JSON.stringify(Object.assign({}, x, {stockedAt: null}));
  if(!prIsNew && strip(r) === strip(JSON.parse(prBefore))) return;
  r.updated = Date.now();
  await productsPut(r);
  PRODS = PRODS.filter(x => x.id !== r.id).concat([r]);
  toast(!r.name ? 'Saved — it has no product name yet' : r.stocked && !was.stocked ? 'Marked stocked' : 'Product saved');
  if(screen === 'lists') renderLists();
}
async function prSetStocked(r, on){
  const cur = PRODS.find(x => x.id === r.id);
  if(!cur) return;
  cur.stocked = on; cur.stockedAt = on ? Date.now() : null; cur.updated = Date.now();
  await productsPut(cur);
  toast(on ? 'Marked stocked' : 'Back on the open list');
  if(screen === 'lists') renderLists();
}
async function prDelete(r){
  if(!confirm('Delete "' + prTitle(r) + '"' + (r.acct ? ' for ' + r.acct : '') + ' from the products list?\n\nIt is gone from this device' +
      (sbUser ? ' and from your other devices when they next sync' : '') + '. This cannot be undone.')) return false;
  await productsDel(r.id);
  PRODS = PRODS.filter(x => x.id !== r.id);
  toast('Product deleted');
  if(screen === 'lists') renderLists();
  return true;
}
function prMenu(id){
  const r = PRODS.find(x => x.id === id);
  if(!r) return;
  openCardMenu(prTitle(r), [r.part, r.acct].filter(Boolean).join(' · '), [
    r.stocked ? {label: 'Not stocked after all', icon: 'close', run: () => prSetStocked(r, false).catch(reportErr)}
              : {label: 'Mark stocked', icon: 'check', run: () => prSetStocked(r, true).catch(reportErr)},
    {label: 'Duplicate', icon: 'plus', run: () => openProd(null, r)},
    {label: 'Delete', icon: 'trash', danger: true, run: () => prDelete(r).catch(reportErr)}
  ]);
}
chipTap($('prStatus'));
$('prStocked').addEventListener('change', prStockedLine);
$('prOk').addEventListener('click', () => prFinish().catch(e => { console.error(e); toast('Could not save: ' + e.message); }));
$('prDel').addEventListener('click', async () => {
  const r = prEdit;
  if(!r) return;
  prEdit = null;
  const d = $('proddlg');
  if(!await prDelete(r).catch(e => { reportErr(e); return false; })){ prEdit = r; return; }
  if(d.close) d.close(); else d.removeAttribute('open');
});
$('proddlg').addEventListener('cancel', e => { e.preventDefault(); prFinish().catch(console.error); });
$('proddlg').addEventListener('close', () => { if(prEdit) prFinish().catch(console.error); });

/* ================= cloud sync (Supabase) =================

   BACKEND-PLAN.md, Step 2: connect and sign in; Step 3: the passphrase and the
   data key. Nothing syncs yet.

   The project address and publishable key are typed in on each device and kept
   in kv 'cloud', never in this repo, so a colleague can be handed the same app
   and point it at their own project. The password is never stored by the app:
   the library keeps a session token in localStorage, under a key prefixed like
   every other key here, because GitHub Pages puts this app on the same origin
   as the Belt Call Log.

   The library is shipped in the repo (supabase-2.117.1.js) and cached by the
   service worker, not loaded from a CDN - see the SheetJS note in CLAUDE.md. If
   it failed to load, everything here says so instead of throwing. */

let SB = {url:'', key:''};
let sbClient = null, sbUser = null, sbErr = '';

/* Accepts the full address or just the project ref. */
function sbNormUrl(v){
  v = String(v || '').trim().replace(/\/+$/, '');
  if(/^[a-z0-9]{20}$/.test(v)) return 'https://' + v + '.supabase.co';
  return v;
}
/* The secret key, or the legacy service_role key, bypasses every access rule.
   It must never sit in a browser, so it is refused and never stored. */
function sbKeyProblem(k){
  if(!k) return '';
  if(/^sb_secret_/.test(k)) return 'that is the secret key - use the publishable key';
  if(/^eyJ/.test(k)){
    try {
      const p = JSON.parse(atob(k.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
      if(p.role === 'service_role') return 'that is the service_role key - use the publishable key';
    } catch(e){ return 'that key is not readable'; }
    return '';
  }
  if(/^sb_publishable_/.test(k)) return '';
  return 'that does not look like a Supabase publishable key';
}
const sbReady = () => !!(SB.url && SB.key && !sbKeyProblem(SB.key));

let sbSub = null;
function sbMake(){
  // the old connection keeps refreshing its token and reporting sign-ins unless stopped
  if(sbSub){ try { sbSub.unsubscribe(); } catch(e){} sbSub = null; }
  if(sbClient){ try { sbClient.auth.stopAutoRefresh(); } catch(e){} }
  sbClient = null; sbUser = null; sbErr = '';
  if(!sbReady()) return;
  if(!window.supabase || !window.supabase.createClient){ sbErr = 'The cloud library did not load. Reload the app once with signal.'; return; }
  if(!/^https:\/\/[^\/]+$/.test(SB.url)){ sbErr = 'The project address should look like https://xxxx.supabase.co'; return; }
  const ref = SB.url.replace(/^https:\/\//, '').split('.')[0];
  try {
    sbClient = window.supabase.createClient(SB.url, SB.key, {auth:{
      storageKey: LS('sb.' + ref), persistSession: true,
      autoRefreshToken: true, detectSessionInUrl: false}});
    sbSub = sbClient.auth.onAuthStateChange((ev, session) => {
      sbUser = session ? session.user : null;
      renderSb();
    }).data.subscription;
  } catch(e){ console.error(e); sbClient = null; sbErr = 'Could not start the cloud connection: ' + e.message; }
}
/* The stored session is read from this device, so this works offline. */
async function loadSb(){
  try { SB = Object.assign(SB, await kvGet('cloud') || {}); } catch(e){}
  sbMake();
  if(sbClient){
    try {
      const r = await sbClient.auth.getSession();
      sbUser = r.data && r.data.session ? r.data.session.user : null;
    } catch(e){ console.warn('cloud session', e); }
    try {
      const k = await kvGet('cloudKey');
      if(k && k.key && sbUser && k.uid === sbUser.id){ sbKeyRec = k; sbVault = 'open'; }
    } catch(e){ console.warn('cloud key', e); }
  }
  await cloudSetsLoad(); await cloudDirtyLoad();
  renderSb();
  sbCheckVault();     // not awaited: a slow network must not hold up the app opening
  if(cloudCan()) cloudSync().catch(e => console.warn('cloud sync', e));
}

/* Sign-in errors in plain words. The library's own messages are for developers. */
function sbSay(e){
  const m = String(e && e.message || e || '');
  if(!navigator.onLine || /fetch|network|load failed/i.test(m)) return 'No connection - try again when you have signal.';
  if(/invalid login credentials/i.test(m)) return 'That email and password do not match an account in this project.';
  if(/email not confirmed/i.test(m)) return 'That account has not been confirmed yet. Confirm it in the Supabase dashboard.';
  if(/invalid api key|no api key/i.test(m)) return 'The project does not accept that key. Check the publishable key.';
  return m || 'Something went wrong.';
}

function renderSb(){
  const el = $('sbStat');
  if(!el) return;
  [['sbUrl','url'],['sbKey','key']].forEach(([id,k]) => {
    const f = $(id); if(f && document.activeElement !== f) f.value = SB[k] || '';
  });
  let line;
  if(!sbReady()) line = '<span class="flagline">Not set up.</span> Needs the project address and the publishable key, below.';
  else if(sbErr) line = '<span class="flagline">' + esc(sbErr) + '</span>';
  else if(sbUser) line = 'Signed in as <b>' + esc(sbUser.email || 'this account') + '</b>' +
    (navigator.onLine ? '' : ' &middot; offline, will reconnect');
  else line = 'Not signed in.';
  const signedIn = !!(sbClient && sbUser);
  if(signedIn) line += '<br>' + ({
    open:    'Encryption: <b>unlocked on this device</b>.',
    none:    '<span class="flagline">Encryption: no passphrase set yet.</span> Set one below &mdash; every device uses the same one.',
    locked:  '<span class="flagline">Encryption: locked on this device.</span> Type your passphrase below.',
    offline: '<span class="flagline">Encryption: locked.</span> Unlocking needs signal the first time on each device.',
    error:   '<span class="flagline">Encryption: could not check.</span> ' + esc(sbVaultMsg),
    unknown: 'Encryption: checking&hellip;'
  }[sbVault] || '');
  const open = signedIn && sbVault === 'open';
  if(open){
    const last = Number(localStorage.getItem(LS('cloudSync')) || 0);
    const waiting = (cloudSets ? CLOUD_SETS.filter(n => cloudSets[n] && cloudSets[n].dirty).length : 0) +
      (cloudDirty ? Object.keys(cloudDirty).length : 0);
    line += '<br>Sync: ' + (cloudRun ? 'syncing&hellip;' + (cloudProgress ? ' ' + esc(cloudProgress) : '')
      : cloudLast.failed ? '<span class="flagline">last sync failed &mdash; ' + esc(cloudLast.msg) + '</span>'
      : last ? 'last synced ' + new Date(last).toLocaleString() : 'not synced from this device yet') +
      (waiting ? ' &middot; <span class="flagline">' + waiting + ' change' + (waiting === 1 ? '' : 's') + ' waiting to send</span>' : '');
    line += '<br>Live updates: ' + (!navigator.onLine ? 'off until there is signal'
      : liveState === 'SUBSCRIBED' ? 'on' : liveState && liveState !== 'SUBSCRIBED' && liveState !== 'CLOSED' ? 'reconnecting&hellip;' : 'connecting&hellip;');
  }
  el.innerHTML = line;
  liveEnsure();
  $('sbIn').hidden = signedIn;
  $('sbSignOut').hidden = !signedIn;
  $('sbSync').hidden = !open;
  $('sbSync').disabled = !!cloudRun;
  const ask = signedIn && (sbVault === 'none' || sbVault === 'locked');
  $('sbLock').hidden = !ask;
  if(ask){
    const first = sbVault === 'none';
    $('sbPhLbl').textContent = first ? 'New passphrase' : 'Passphrase';
    $('sbPh2Wrap').hidden = !first;
    $('sbPhGo').textContent = first ? 'Set passphrase' : 'Unlock';
    $('sbPhHint').innerHTML = first
      ? 'At least ' + PH_MIN + ' characters. It locks everything before it leaves this device, and unlocks it on your other devices. <b>If it is lost, nobody can read the cloud copy</b> &mdash; not even you. Keep it in your password manager.'
      : 'The passphrase you set on your first device.';
  }
}
[['sbUrl','url'],['sbKey','key']].forEach(([id,k]) => {
  const f = $(id);
  if(!f) return;
  f.addEventListener('change', async ()=>{
    const v = k === 'url' ? sbNormUrl(f.value) : f.value.trim();
    const prob = k === 'key' ? sbKeyProblem(v) : '';
    if(prob){
      // never kept, not even on this device
      f.value = SB.key || '';
      toast('Key not saved: ' + prob);
      return;
    }
    if(v === SB[k]){ f.value = v; return; }
    if(sbClient && sbUser){ try { await sbClient.auth.signOut({scope:'local'}); } catch(e){} }
    await sbForget();
    SB[k] = v;
    await kvSet('cloud', SB);
    sbMake();
    renderSb();
  });
});
$('sbSignIn').addEventListener('click', async ()=>{
  const btn = $('sbSignIn');
  const email = $('sbEmail').value.trim(), pass = $('sbPass').value;
  // never greyed out: a button that ignores a tap looks broken, so it says what is missing
  if(!sbClient){ toast(sbErr || 'Paste the project address and the publishable key (below) first'); return; }
  if(!email || !pass){ toast('Type the email and password first'); return; }
  btn.disabled = true;
  try {
    const r = await sbClient.auth.signInWithPassword({email: email, password: pass});
    if(r.error) throw r.error;
    sbUser = r.data.user;
    $('sbPass').value = '';
    toast('Signed in as ' + (sbUser.email || email));
    await logLoad(SB.url, 'cloud', 'Signed in as ' + (sbUser.email || email));
    await sbLoadKey();
  } catch(e){ console.warn(e); toast(sbSay(e)); }
  finally { btn.disabled = false; renderSb(); }
  if(sbUser) await sbCheckVault();
});
$('sbSignOut').addEventListener('click', async ()=>{
  if(!sbClient) return;
  // local scope: signs this device out only, and works with no signal
  try { await sbClient.auth.signOut({scope:'local'}); } catch(e){ console.warn(e); }
  sbUser = null;
  await sbForget();
  toast('Signed out of this device');
  await logLoad(SB.url, 'cloud', 'Signed out');
  renderSb();
});
window.addEventListener('online', ()=>{
  renderSb();
  if(sbVault === 'offline' || sbVault === 'error') sbCheckVault();
  if(cloudCan()) cloudSync().catch(e => console.warn('cloud sync', e));
});
window.addEventListener('offline', renderSb);

/* ---------- Step 3: the passphrase and the data key ----------

   Envelope encryption, all in the browser's own Web Crypto:
   - A random AES-GCM data key encrypts everything that will be synced.
   - The passphrase, stretched with PBKDF2 (600,000 rounds, so each guess is
     slow), makes a second key whose only job is to lock the data key.
   - Only the locked data key goes to Supabase, in 'vaults'. The passphrase
     and the unlocked key never leave the device.
   Changing the passphrase later re-locks the one data key; nothing else has to
   be re-encrypted. A colleague can be given the data key the same way.

   Once unlocked, the device keeps the data key in IndexedDB (kv 'cloudKey') as
   a non-extractable CryptoKey: the app can use it, but no script can read the
   key's bytes out. Signing out forgets it.

   The vault is only ever inserted, never updated: overwriting it would orphan
   everything already encrypted with the old key. If two devices race to set a
   passphrase, the second one is told to use the first one's. */

const VAULT_KDF = {alg:'PBKDF2', hash:'SHA-256', iterations:600000};
const PH_MIN = 12;
const TE = new TextEncoder(), TD = new TextDecoder();
let sbKeyRec = null;              // {uid, key_id, key: CryptoKey}
let sbVault = 'unknown', sbVaultMsg = '';

function u8b64(u8){
  let s = '';
  for(let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64u8(s){
  const b = atob(s), u = new Uint8Array(b.length);
  for(let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
  return u;
}
const toHex = u8 => Array.from(u8, b => b.toString(16).padStart(2, '0')).join('');
// binds the locked key to this account, so a vault row moved to another account will not open
const vaultAad = uid => TE.encode('fieldcrm-vault/' + uid);

async function sbPassKey(pass, kdf){
  const base = await crypto.subtle.importKey('raw', TE.encode(pass.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2', hash:kdf.hash, iterations:kdf.iterations, salt:b64u8(kdf.salt)},
    base, {name:'AES-GCM', length:256}, false, ['wrapKey','unwrapKey']);
}
async function sbUnwrap(row, wk, uid){
  return crypto.subtle.unwrapKey('raw', b64u8(row.wrapped_key), wk,
    {name:'AES-GCM', iv:b64u8(row.wrap_iv), additionalData:vaultAad(uid)},
    {name:'AES-GCM'}, false, ['encrypt','decrypt']);
}
async function sbKeep(uid, key_id, key){
  sbKeyRec = {uid: uid, key_id: key_id, key: key};
  await kvSet('cloudKey', sbKeyRec);
  sbVault = 'open';
}
async function sbForget(){
  sbKeyRec = null; sbVault = 'unknown';
  try { await kvSet('cloudKey', null); } catch(e){}
}
async function sbLoadKey(){
  try {
    const k = await kvGet('cloudKey');
    if(k && k.key && sbUser && k.uid === sbUser.id){ sbKeyRec = k; sbVault = 'open'; }
  } catch(e){ console.warn('cloud key', e); }
}
async function sbVaultRow(){
  const r = await sbClient.from('vaults').select('key_id,kdf,wrapped_key,wrap_iv').limit(1);
  if(r.error) throw r.error;
  return r.data && r.data[0] || null;
}
async function sbCheckVault(){
  if(!sbClient || !sbUser) return;
  if(sbKeyRec && sbKeyRec.uid === sbUser.id){ sbVault = 'open'; renderSb(); return; }
  if(!navigator.onLine){ sbVault = 'offline'; renderSb(); return; }
  try {
    sbVault = (await sbVaultRow()) ? 'locked' : 'none';
  } catch(e){ console.warn('vault', e); sbVault = 'error'; sbVaultMsg = sbSay(e); }
  renderSb();
}

async function sbCreateVault(pass){
  const uid = sbUser.id;
  const kdf = Object.assign({}, VAULT_KDF, {salt: u8b64(crypto.getRandomValues(new Uint8Array(16)))});
  const wk = await sbPassKey(pass, kdf);
  // extractable only so it can be locked; this copy is dropped at the end of the function
  const dk = await crypto.subtle.generateKey({name:'AES-GCM', length:256}, true, ['encrypt','decrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = new Uint8Array(await crypto.subtle.wrapKey('raw', dk, wk, {name:'AES-GCM', iv:iv, additionalData:vaultAad(uid)}));
  const row = {key_id: 'k-' + toHex(crypto.getRandomValues(new Uint8Array(8))), kdf: kdf,
               wrapped_key: u8b64(wrapped), wrap_iv: u8b64(iv)};
  const r = await sbClient.from('vaults').insert(row);
  if(r.error){
    if(r.error.code === '23505') throw new Error('vault exists');
    throw r.error;
  }
  // the device keeps a non-extractable copy, unlocked the same way any other device will
  await sbKeep(uid, row.key_id, await sbUnwrap(row, wk, uid));
}
async function sbUnlock(pass){
  const row = await sbVaultRow();
  if(!row) throw new Error('no vault');
  const wk = await sbPassKey(pass, row.kdf);
  let key;
  try { key = await sbUnwrap(row, wk, sbUser.id); }
  catch(e){ throw new Error('passphrase mismatch'); }   // AES-GCM refuses: wrong passphrase, or a tampered vault
  await sbKeep(sbUser.id, row.key_id, key);
}

$('sbPhGo').addEventListener('click', async ()=>{
  const btn = $('sbPhGo'), p1 = $('sbPh').value, p2 = $('sbPh2').value;
  const first = sbVault === 'none';
  if(!sbClient || !sbUser) return;
  if(!navigator.onLine){ toast('No connection - try again when you have signal.'); return; }
  if(first){
    if(p1.length < PH_MIN){ toast('The passphrase needs at least ' + PH_MIN + ' characters'); return; }
    if(p1 !== p2){ toast('The two passphrases are different - type them again'); return; }
  } else if(!p1){ toast('Type the passphrase first'); return; }
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = 'Working\u2026';
  try {
    if(first){
      await sbCreateVault(p1);
      toast('Passphrase set. Encryption is on.');
      await logLoad(SB.url, 'cloud', 'Passphrase set, encryption on');
    } else {
      await sbUnlock(p1);
      toast('Unlocked on this device');
      await logLoad(SB.url, 'cloud', 'Encryption unlocked on this device');
    }
    $('sbPh').value = ''; $('sbPh2').value = '';
    // a new device brings everything in straight away; the first device sends what it has
    cloudSync().catch(e => console.warn('cloud sync', e));
  } catch(e){
    console.warn(e);
    const m = e && e.message;
    if(m === 'passphrase mismatch'){ toast('That passphrase does not match the one set on your first device.'); $('sbPh').value = ''; }
    else if(m === 'vault exists'){ toast('A passphrase was already set on another device. Type that one.'); $('sbPh').value = ''; $('sbPh2').value = ''; await sbCheckVault(); }
    else if(m === 'no vault'){ await sbCheckVault(); toast('No passphrase is set yet - set one now.'); }
    else toast(sbSay(e));
  } finally {
    btn.disabled = false; btn.textContent = label;
    renderSb();
  }
});

/* Encrypt and decrypt one synced thing. The JSON is gzipped first (the CRM
   export shrinks several times over, which is upload time on one bar of signal
   and free-tier storage), then encrypted. The store and ID are bound into the
   encryption (AES-GCM additional data), so the server cannot swap one record's
   body into another and have it open. */
async function sbPipe(u8, stream){
  const w = stream.writable.getWriter();
  w.write(u8); w.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}
async function sbSeal(store, id, obj){
  if(!sbKeyRec) throw new Error('encryption is locked on this device');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const packed = await sbPipe(TE.encode(JSON.stringify(obj)), new CompressionStream('gzip'));
  const ct = await crypto.subtle.encrypt({name:'AES-GCM', iv:iv, additionalData:TE.encode(sbKeyRec.uid + '/' + store + '/' + id)},
    sbKeyRec.key, packed);
  return {key_id: sbKeyRec.key_id, iv: u8b64(iv), body: u8b64(new Uint8Array(ct))};
}
async function sbOpen(store, id, row){
  if(!sbKeyRec) throw new Error('encryption is locked on this device');
  if(row.key_id !== sbKeyRec.key_id) throw new Error('encrypted with a different key');
  const pt = await crypto.subtle.decrypt({name:'AES-GCM', iv:b64u8(row.iv), additionalData:TE.encode(sbKeyRec.uid + '/' + store + '/' + id)},
    sbKeyRec.key, b64u8(row.body));
  return JSON.parse(TD.decode(await sbPipe(new Uint8Array(pt), new DecompressionStream('gzip'))));
}

/* ---------- Step 4: reference data, loaded once ----------

   Each dataset travels whole, as one encrypted row in 'records' with
   store = 'datasets' and the dataset name as its id:
     crm        the accounts store plus kv 'meta' (they are one import)
     beltref    belt/sprocket catalogue
     assets     plant audit register
     overrides  zone pins and suburb spellings
     weeks      planning week markers
     mgrOf      reassignments
   Accounts are only ever replaced wholesale by an import, a plan file or a
   restore - never edited one at a time - so a whole-dataset copy loses nothing.
   kv 'usage', the load log and everything else device-only stays put.

   Newest wins, by each dataset's own import time where it has one (META.imported,
   REF.imported, ASSETS.imported, OVERRIDES.loaded) and otherwise by when it was
   changed here. Using the import time means an older catalogue that turns up
   later - restored from a backup, or pulled from GitHub - cannot push a newer one
   out of the cloud. The server enforces the same rule (records_before_write).

   Every local change marks its dataset dirty in kv 'cloudSets' via kvSet() and
   accReplaceAll()/accMerge(), whether or not cloud sync is set up, so a change
   made offline is sent next time. Applying a pulled copy is done with marking
   switched off, or every pull would bounce straight back up.

   A device that had data before cloud sync existed has no entry yet. Where its
   data carries an import time it competes on that. Weeks and reassignments carry
   none, so the cloud's copy wins if there is one; if not, this device seeds it. */

var cloudQuiet = false;
var cloudSets = null;            // {name: {ver, dirty, at}}
var cloudRun = null, cloudAgain = false, cloudTimer = null;
var cloudLast = {at: 0, msg: '', failed: false};
var CLOUD_KV = {beltref:'beltref', assets:'assets', overrides:'overrides', weeks:'weeks', mgrOf:'mgrOf', meta:'crm'};
const CLOUD_SETS = ['crm', 'beltref', 'assets', 'overrides', 'weeks', 'mgrOf'];
const CLOUD_NAME = {crm:'CRM accounts', beltref:'belt reference data', assets:'plant audit register',
                    overrides:'zone overrides', weeks:'planning weeks', mgrOf:'reassignments'};

async function cloudSetsLoad(){
  if(!cloudSets){
    try { cloudSets = (await kvGet('cloudSets')) || {}; } catch(e){ cloudSets = {}; }
  }
  return cloudSets;
}
async function cloudSetsSave(){ await kvSet('cloudSets', cloudSets); }

/* Called on every local change to a synced dataset. Never throws: a failure
   here must not break the import that triggered it. */
async function cloudMark(name){
  if(cloudQuiet) return;
  try {
    await cloudSetsLoad();
    cloudSets[name] = Object.assign({}, cloudSets[name], {dirty: true, at: Date.now()});
    await cloudSetsSave();
    clearTimeout(cloudTimer);
    cloudTimer = setTimeout(() => { if(cloudCan()) cloudSync().catch(()=>{}); }, 3000);
    renderSb();
  } catch(e){ console.warn('cloud mark', name, e); }
}

/* The dataset's own time, where it has one. */
function cloudOwnVer(name){
  const t = {crm: META && META.imported, beltref: REF && REF.imported,
             assets: ASSETS && ASSETS.imported, overrides: OVERRIDES && OVERRIDES.loaded}[name];
  return typeof t === 'number' ? t : null;
}
function cloudHasLocal(name){
  switch(name){
    case 'crm': return ACCOUNTS.length > 0;
    case 'beltref': return !!REF;
    case 'assets': return !!ASSETS;
    case 'overrides': return !!(OVERRIDES && (Object.keys(OVERRIDES.acctZone||{}).length || Object.keys(OVERRIDES.spelling||{}).length));
    case 'weeks': return Object.keys(WEEKS||{}).length > 0;
    case 'mgrOf': return Object.keys(MGR_OF||{}).length > 0;
  }
  return false;
}
/* The version this device holds: null means "nothing worth sending". */
function cloudLocalVer(name){
  const e = cloudSets[name];
  if(!cloudHasLocal(name)) return e && e.dirty ? (cloudOwnVer(name) || e.at) : null;
  if(e && e.dirty) return cloudOwnVer(name) || e.at;
  if(e && e.ver != null) return e.ver;
  return cloudOwnVer(name) || 0;          // here before cloud sync: see the note above
}
async function cloudPack(name){
  switch(name){
    case 'crm': return {accounts: await accAll(), meta: await kvGet('meta') || null};
    case 'beltref': return await kvGet('beltref') || null;
    case 'assets': return await kvGet('assets') || null;
    case 'overrides': return await kvGet('overrides') || null;
    case 'weeks': return await kvGet('weeks') || {};
    case 'mgrOf': return await kvGet('mgrOf') || {};
  }
}
async function cloudApply(name, data){
  cloudQuiet = true;
  try {
    if(name === 'crm'){
      if(!data || !Array.isArray(data.accounts)) throw new Error('the CRM copy in the cloud is not readable');
      await accReplaceAll(data.accounts);
      await kvSet('meta', data.meta || null);
    } else {
      await kvSet(name, data);
    }
  } finally { cloudQuiet = false; }
}
function cloudSummary(name, data){
  try {
    if(name === 'crm') return data.accounts.length + ' accounts';
    if(name === 'beltref') return data.counts.combos + ' belt combinations, ' + data.counts.sprockets + ' sprocket rows';
    if(name === 'assets') return data.counts.assets + ' asset numbers';
    if(name === 'overrides') return Object.keys(data.acctZone||{}).length + ' pins, ' + Object.keys(data.spelling||{}).length + ' spellings';
    if(name === 'weeks' || name === 'mgrOf') return Object.keys(data||{}).length + ' entries';
  } catch(e){}
  return '';
}

const cloudCan = () => !!(sbClient && sbUser && sbKeyRec && navigator.onLine);

/* ---------- Step 6: live updates (v92) ----------
   While this device is signed in, unlocked and online, it listens on Supabase
   Realtime for changes to its own rows in 'records' (migration 0002; the "own
   records" policy means it only ever hears its own). Any change - from another
   device, or this one's own push echoing back - runs the normal sync a moment
   later, so everything still arrives through sbOpen() and the open-call guard.
   The payload itself (an encrypted envelope) is never used.
   Coming back to the app (the phone out of a pocket) syncs too, since a
   backgrounded phone drops the connection. */
let liveCh = null, liveClient = null, liveUid = '', liveState = '', liveTimer = null, liveSubs = 0;
function liveEnsure(){
  const want = !!(sbClient && sbUser && sbKeyRec && navigator.onLine && sbClient.channel);
  if(want && liveCh && liveClient === sbClient && liveUid === sbUser.id) return;
  if(liveCh){
    try { liveClient.removeChannel(liveCh); } catch(e){}
    liveCh = null; liveClient = null; liveUid = ''; liveState = ''; liveSubs = 0;
  }
  if(!want) return;
  const client = liveClient = sbClient; liveUid = sbUser.id;
  try {
    // held before subscribing: a status that comes back at once must find it set
    const ch = liveCh = sbClient.channel('records-' + liveUid)
      .on('postgres_changes', {event: '*', schema: 'public', table: 'records', filter: 'owner=eq.' + liveUid}, () => liveNudge());
    /* The connection has to carry the signed-in session, or the "own records"
       rule filters every row out and nothing arrives. The library is meant to
       pass it on by itself; tested against the real project it had not by the
       time the channel joined, so it is handed over here first. */
    client.auth.getSession()
      .then(r => {
        const tok = r && r.data && r.data.session && r.data.session.access_token;
        return tok && client.realtime && client.realtime.setAuth ? client.realtime.setAuth(tok) : null;
      })
      .catch(e => console.warn('live updates auth', e))
      .then(() => {
        if(liveCh !== ch) return;   // stopped or replaced meanwhile
        ch.subscribe(status => {
          liveState = status;
          // reconnected after a drop: catch up on whatever arrived meanwhile
          if(status === 'SUBSCRIBED' && liveSubs++ > 0) liveNudge();
          setTimeout(renderSb, 0);      // never from inside renderSb's own call
        });
      });
  } catch(e){ console.warn('live updates', e); liveCh = null; liveClient = null; }
}
function liveNudge(){
  clearTimeout(liveTimer);
  // a burst of rows from one save arrives as one run
  liveTimer = setTimeout(() => { if(cloudCan()) cloudSync().catch(e => console.warn('live sync', e)); }, 1500);
}
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState !== 'visible' || !cloudCan()) return;
  const last = Number(localStorage.getItem(LS('cloudSync')) || 0);
  if(Date.now() - last > 20000) cloudSync().catch(e => console.warn('cloud sync', e));
});

/* One sync at a time. A change made while one is running gets its own run
   straight after. */
async function cloudSync(){
  if(cloudRun){ cloudAgain = true; return cloudRun; }
  cloudRun = (async () => {
    let out;
    do { cloudAgain = false; out = await cloudSyncOnce(); } while(cloudAgain);
    return out;
  })();
  renderSb();       // "syncing..." and the button greyed out while it runs
  try { return await cloudRun; } finally { cloudRun = null; renderSb(); }
}
async function cloudSyncOnce(){
  if(!cloudCan()) throw new Error(!navigator.onLine ? 'no connection' : 'sign in and unlock first');
  await cloudSetsLoad();
  const sent = [], got = [];
  try {
    const r = await sbClient.from('records').select('id,client_updated').eq('store', 'datasets');
    if(r.error) throw r.error;
    const cloud = {};
    for(const row of r.data || []) cloud[row.id] = Number(row.client_updated);

    const pull = [];
    for(const name of CLOUD_SETS){
      const mine = cloudLocalVer(name), theirs = cloud[name];
      if(theirs == null){
        if(mine != null) await cloudPush(name, mine || Date.now(), sent);
      } else if(mine != null && mine > theirs){
        await cloudPush(name, mine, sent);
      } else if(mine == null || theirs > mine){
        pull.push(name);
      } else if(!cloudSets[name] || cloudSets[name].dirty || cloudSets[name].ver !== theirs){
        cloudSets[name] = {ver: theirs, dirty: false};      // already the same version
        await cloudSetsSave();
      }
    }
    if(pull.length){
      const b = await sbClient.from('records').select('id,key_id,iv,body,client_updated')
        .eq('store', 'datasets').in('id', pull);
      if(b.error) throw b.error;
      for(const row of b.data || []){
        const data = await sbOpen('datasets', row.id, row);
        await cloudApply(row.id, data);
        cloudSets[row.id] = {ver: Number(row.client_updated), dirty: false};
        await cloudSetsSave();
        got.push(row.id);
        await logLoad('Cloud', 'cloud', 'Pulled ' + CLOUD_NAME[row.id] + (cloudSummary(row.id, data) ? ' - ' + cloudSummary(row.id, data) : ''));
      }
      if(got.length) await cloudAfterPull(got);
    }
    const recs = await cloudSyncRecs();
    const bits = [];
    if(sent.length) bits.push('sent ' + sent.map(n => CLOUD_NAME[n]).join(', '));
    if(got.length) bits.push('brought in ' + got.map(n => CLOUD_NAME[n]).join(', '));
    bits.push(...recs);
    cloudLast = {at: Date.now(), msg: bits.length ? bits.join('; ') : 'everything already in step', failed: false};
    localStorage.setItem(LS('cloudSync'), String(cloudLast.at));
    return cloudLast.msg;
  } catch(e){
    cloudLast = {at: Date.now(), msg: sbSay(e), failed: true};
    throw e;
  }
}
async function cloudPush(name, ver, sent){
  const at = cloudSets[name] && cloudSets[name].at;
  const sealed = await sbSeal('datasets', name, await cloudPack(name));
  const r = await sbClient.from('records').upsert(Object.assign({owner: sbUser.id, store: 'datasets', id: name,
    client_updated: ver, deleted: false}, sealed), {onConflict: 'owner,store,id'});
  if(r.error) throw r.error;
  // changed again while uploading: leave it dirty for the next run
  if(cloudSets[name] && cloudSets[name].at !== at && cloudSets[name].dirty) return;
  cloudSets[name] = {ver: ver, dirty: false};
  await cloudSetsSave();
  sent.push(name);
}
$('sbSync').addEventListener('click', async ()=>{
  try { toast('Synced: ' + await cloudSync()); }
  catch(e){ console.warn(e); toast('Sync failed: ' + sbSay(e)); }
  renderSb();
});
/* Everything that reads the reference data is rebuilt, as at boot. */
async function cloudAfterPull(names){
  await loadAccounts();
  renderDbStat(); renderRefStat(); renderAssetStat(); renderHomeSetup();
  fillManagers();
  if(names.includes('beltref')){ try { buildBeltRef(); } catch(e){ console.error('belt reference', e); } }
  try { await renderHome(); } catch(e){ console.error('home', e); }
  toast('Brought in ' + names.map(n => CLOUD_NAME[n]).join(', '));
}
async function cloudWaiting(){
  await cloudSetsLoad(); await cloudDirtyLoad();
  return CLOUD_SETS.filter(n => cloudSets[n] && cloudSets[n].dirty).length + Object.keys(cloudDirty).length;
}

/* ---------- Step 5: calls, quote requests and appointments ----------

   One encrypted row per record in 'records': store 'calls' (calls and quote
   requests together - quotes stay marked by rectype inside the body, as
   everywhere else) and store 'appts'. Newest edit wins by the time the app
   already keeps: call.updated, appointment.touchedAt. Deletes travel as a row
   marked deleted, so they reach the other devices.

   callsPut()/callsDel()/apptsPut()/apptsDel() mark the record as waiting to send
   (kv 'cloudDirty'), whether or not cloud sync is set up, so nothing written
   offline is lost. Applying a pulled record is done with cloudQuiet set.

   PHOTOS stay exactly as the app keeps them - Blobs (or old data-URI strings)
   in entry.photos and call.loose - so nothing that shows or compiles photos
   changes. On the way out each photo is named by a hash of its own bytes,
   encrypted, and stored once at <user>/<call>/<hash> in the private 'photos'
   bucket, at the 1400px it was taken at, not recompressed. The call's row
   carries the names in place of the pictures. A device bringing a call in
   downloads only the photos it does not already hold. Photos are fetched when
   the call arrives rather than when it is opened: simpler, works offline
   afterwards, and about 50 photos a week is far inside the free download
   allowance.

   A call still open on this device is never overwritten under you: its update
   waits (kv 'cloudLater') and is applied once you have left it.

   The first sync after this arrives sends every call and appointment already
   on the device. Calls the GitHub sync brought in carry 800px copies
   (syncedPhotos); they go up one millisecond older than their own time, so the
   device holding the 1400px originals wins, and a device holding the copies
   takes the originals when they arrive. */

var cloudDirty = null;           // {'calls/<id>': {v, del, at}}
var cloudProgress = '';
var cloudRecTimer = null;
const CLOUD_REC_STORES = ['calls', 'appts', 'tasks', 'snippets', 'products'];

async function cloudDirtyLoad(){
  if(!cloudDirty){
    try { cloudDirty = (await kvGet('cloudDirty')) || {}; } catch(e){ cloudDirty = {}; }
  }
  return cloudDirty;
}
async function cloudDirtySave(){ await kvSet('cloudDirty', cloudDirty); }

async function cloudMarkRec(store, id, v, del){
  if(cloudQuiet || id == null) return;
  try {
    await cloudDirtyLoad();
    cloudDirty[store + '/' + id] = {v: v || Date.now(), del: !!del, at: Date.now()};
    await cloudDirtySave();
    // a little longer than for an import: a call being written saves often
    clearTimeout(cloudRecTimer);
    cloudRecTimer = setTimeout(() => { if(cloudCan()) cloudSync().catch(()=>{}); }, 10000);
    renderSb();
  } catch(e){ console.warn('cloud mark', store, id, e); }
}

function recGet(store, id){
  return ready().then(d => new Promise((res,rej)=>{
    const t = d.transaction(store,'readonly').objectStore(store).get(id);
    t.onsuccess = ()=>res(t.result || null); t.onerror = ()=>rej(t.error);
  }));
}
const recVer = (store, r) => store === 'appts' ? (r.touchedAt || 0) : (r.updated || 0);

/* Everything already here before cloud sync goes up once. */
async function cloudSeed(){
  if(await kvGet('cloudSeeded')) return;
  await cloudDirtyLoad();
  const now = Date.now();
  for(const c of await recordsAll()) if(!cloudDirty['calls/' + c.id]) cloudDirty['calls/' + c.id] = {v: recVer('calls', c) || now, del: false, at: now};
  for(const a of await apptsAll()) if(!cloudDirty['appts/' + a.id]) cloudDirty['appts/' + a.id] = {v: recVer('appts', a) || now, del: false, at: now};
  for(const t of await tasksAll()) if(!cloudDirty['tasks/' + t.id]) cloudDirty['tasks/' + t.id] = {v: recVer('tasks', t) || now, del: false, at: now};
  for(const st of ['snippets', 'products'])
    for(const r of await storeAll(st)) if(!cloudDirty[st + '/' + r.id]) cloudDirty[st + '/' + r.id] = {v: recVer(st, r) || now, del: false, at: now};
  await cloudDirtySave();
  await kvSet('cloudSeeded', true);
}

/* ---- photos ---- */
function blobBytes(b){
  if(b.arrayBuffer) return b.arrayBuffer().then(x => new Uint8Array(x));
  return new Promise((res,rej)=>{
    const r = new FileReader();
    r.onload = ()=>res(new Uint8Array(r.result)); r.onerror = ()=>rej(r.error);
    r.readAsArrayBuffer(b);
  });
}
// anything Blob-like, not only this window's Blob: a Blob read back from storage
// can come from another realm, and instanceof would call it a data URI
const blobLike = p => !!p && typeof p === 'object' && typeof p.arrayBuffer === 'function';
const photoBytesOf = p => blobBytes(isBlobPhoto(p) || blobLike(p) ? p : dataURLToBlob(p));
async function photoId(bytes){
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).slice(0, 32);
}
const cloudPhotoDir = callId => sbUser.id + '/' + callId;
const photoAad = (callId, pid) => TE.encode(sbKeyRec.uid + '/photo/' + callId + '/' + pid);
async function sbSealBytes(aad, bytes){
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM', iv:iv, additionalData:aad}, sbKeyRec.key, bytes));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv); out.set(ct, 12);
  return out;
}
async function sbOpenBytes(aad, u8){
  return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM', iv:u8.subarray(0, 12), additionalData:aad},
    sbKeyRec.key, u8.subarray(12)));
}
async function cloudPhotoList(callId){
  const r = await sbClient.storage.from('photos').list(cloudPhotoDir(callId), {limit: 1000});
  if(r.error) throw r.error;
  return new Set((r.data || []).map(x => x.name));
}
async function cloudPhotoGet(callId, pid){
  const r = await sbClient.storage.from('photos').download(cloudPhotoDir(callId) + '/' + pid);
  if(r.error || !r.data) return null;
  try { return new Blob([await sbOpenBytes(photoAad(callId, pid), await blobBytes(r.data))], {type: 'image/jpeg'}); }
  catch(e){ console.warn('photo would not open', callId, pid, e); return null; }
}

/* The call as it travels: photos replaced by their names, their bytes kept aside. */
async function cloudCallOut(c){
  const files = new Map();
  const refs = async list => {
    const out = [];
    for(const p of list){
      try { const b = await photoBytesOf(p), id = await photoId(b); files.set(id, b); out.push({ph: id}); }
      catch(e){ console.warn('photo left out of sync', e); }
    }
    return out;
  };
  const body = Object.assign({}, c);
  body.entries = [];
  for(const e of c.entries || []){
    const o = Object.assign({}, e);
    if(Array.isArray(e.photos)) o.photos = await refs(e.photos);
    body.entries.push(o);
  }
  if(Array.isArray(c.loose)) body.loose = await refs(c.loose);
  return {body: body, files: files};
}
/* And back: names replaced by pictures, reusing any this device already holds. */
async function cloudCallIn(body, local){
  const have = new Map();
  if(local){
    const all = [].concat(...(local.entries || []).map(e => e.photos || []), local.loose || []);
    for(const p of all){ try { have.set(await photoId(await photoBytesOf(p)), isBlobPhoto(p) || blobLike(p) ? p : dataURLToBlob(p)); } catch(e){} }
  }
  let fetched = 0, missing = 0;
  const back = async list => {
    const out = [];
    for(const x of list || []){
      if(!x || !x.ph){ out.push(x); continue; }
      let b = have.get(x.ph);
      if(!b){ b = await cloudPhotoGet(body.id, x.ph); if(b) fetched++; }
      if(b) out.push(b); else missing++;
    }
    return out;
  };
  const c = Object.assign({}, body);
  c.entries = [];
  for(const e of body.entries || []){
    const o = Object.assign({}, e);
    if(Array.isArray(e.photos)) o.photos = await back(e.photos);
    c.entries.push(o);
  }
  if(Array.isArray(body.loose)) c.loose = await back(body.loose);
  return {call: c, fetched: fetched, missing: missing};
}

/* ---- push ---- */
async function cloudUpsert(rows){
  const r = await sbClient.from('records').upsert(rows.map(x => Object.assign({owner: sbUser.id}, x)),
    {onConflict: 'owner,store,id'}).select('store,id');
  if(r.error) throw r.error;
  // rows the server skipped as older than its own copy are not returned
  return new Set((r.data || []).map(x => x.store + '/' + x.id));
}
async function cloudPushRecs(stats){
  await cloudDirtyLoad();
  const keys = Object.keys(cloudDirty);
  const done = (k, at) => { if(cloudDirty[k] && cloudDirty[k].at === at) delete cloudDirty[k]; };
  const batch = [];
  const flush = async () => {
    if(!batch.length) return;
    const written = await cloudUpsert(batch.map(b => b.row));
    for(const b of batch){
      if(written.has(b.key) && b.row.deleted && b.row.store === 'calls'){
        const gone = [...await cloudPhotoList(b.row.id)];
        if(gone.length) await sbClient.storage.from('photos').remove(gone.map(n => cloudPhotoDir(b.row.id) + '/' + n));
      }
      done(b.key, b.at);
    }
    batch.length = 0;
    await cloudDirtySave();
  };
  let i = 0;
  for(const k of keys){
    const d = cloudDirty[k]; if(!d) continue;
    const [store, id] = [k.slice(0, k.indexOf('/')), k.slice(k.indexOf('/') + 1)];
    i++;
    cloudProgress = 'sending ' + i + ' of ' + keys.length;
    renderSb();
    const rec = d.del ? null : await recGet(store, id);
    if(!d.del && !rec){ done(k, d.at); continue; }                  // gone since; its delete is marked separately
    if(d.del){
      batch.push({key: k, at: d.at, row: Object.assign({store: store, id: id, client_updated: d.v, deleted: true},
        await sbSeal(store, id, null))});
      stats.gone++;
    } else if(store !== 'calls'){
      batch.push({key: k, at: d.at, row: Object.assign({store: store, id: id, client_updated: recVer(store, rec) || d.v, deleted: false},
        await sbSeal(store, id, rec))});
      stats[store]++;
    } else {
      await flush();
      // the 800px copies from the GitHub sync lose to the originals of the same edit
      const ver = (recVer(store, rec) || d.v) - (rec.syncedPhotos ? 1 : 0);
      const out = await cloudCallOut(rec);
      const listed = await cloudPhotoList(id);
      let n = 0;
      const added = [];
      for(const [pid, bytes] of out.files){
        if(listed.has(pid)) continue;
        cloudProgress = 'sending photos for call ' + i + ' of ' + keys.length + ' (' + (++n) + ' of ' + out.files.size + ')';
        renderSb();
        const r = await sbClient.storage.from('photos').upload(cloudPhotoDir(id) + '/' + pid,
          await sbSealBytes(photoAad(id, pid), bytes), {upsert: true, contentType: 'application/octet-stream'});
        if(r.error) throw r.error;
        added.push(pid);
        stats.photosUp++;
      }
      const written = await cloudUpsert([Object.assign({store: store, id: id, client_updated: ver, deleted: false},
        await sbSeal(store, id, out.body))]);
      // photos this call no longer uses - only once its new version is the one in the cloud
      if(written.has(k)){
        const stale = [...listed].filter(x => !out.files.has(x));
        if(stale.length) await sbClient.storage.from('photos').remove(stale.map(x => cloudPhotoDir(id) + '/' + x));
      } else if(added.length){
        // the cloud kept a newer version, which cannot use photos that were not there before this push
        await sbClient.storage.from('photos').remove(added.map(x => cloudPhotoDir(id) + '/' + x));
        stats.photosUp -= added.length;
      }
      done(k, d.at);
      await cloudDirtySave();
      stats.calls++;
    }
    if(batch.length >= 50) await flush();
  }
  await flush();
}

/* ---- pull ---- */
async function cloudApplyRec(row, stats){
  const store = row.store, id = row.id, k = store + '/' + id, v = Number(row.client_updated);
  const local = await recGet(store, id);
  const lv = local ? recVer(store, local) : -1;
  if(cloudDirty[k] && (cloudDirty[k].del ? cloudDirty[k].v : lv) >= v) return;   // ours is newer: it goes up instead
  // newer wins; the same edit wins too when this device only holds the 800px copies
  if(!(v > lv || (store === 'calls' && local && local.syncedPhotos && !row.deleted && v >= lv))) return;
  if(store === 'calls' && call && call.id === id){
    const later = (await kvGet('cloudLater')) || [];
    if(!later.includes(id)){ later.push(id); await kvSet('cloudLater', later); }
    stats.waiting++;
    return;
  }
  cloudQuiet = true;
  try {
    if(row.deleted){
      if(local){ await ({calls: callsDel, appts: apptsDel, tasks: tasksDel, snippets: snippetsDel, products: productsDel})[store](id); stats.gone++; }
    } else if(store !== 'calls'){
      await ({appts: apptsPut, tasks: tasksPut, snippets: snippetsPut, products: productsPut})[store](await sbOpen(store, id, row));
      stats[store]++;
    } else {
      const got = await cloudCallIn(await sbOpen(store, id, row), local);
      await callsPut(got.call);
      stats.calls++; stats.photosDown += got.fetched; stats.missing += got.missing;
    }
  } finally { cloudQuiet = false; }
  delete cloudDirty[k];
}
async function cloudPullRecs(stats){
  const cols = 'store,id,key_id,iv,body,client_updated,deleted,server_updated';
  // updates held back while their call was open
  const later = (await kvGet('cloudLater')) || [];
  const ready_ = later.filter(id => !(call && call.id === id));
  if(ready_.length){
    await kvSet('cloudLater', later.filter(id => !ready_.includes(id)));
    const r = await sbClient.from('records').select(cols).eq('store', 'calls').in('id', ready_);
    if(r.error) throw r.error;
    for(const row of r.data || []) await cloudApplyRec(row, stats);
  }
  const cursor = (await kvGet('cloudCursor')) || '1970-01-01T00:00:00Z';
  let newest = Date.parse(cursor), from = 0, page;
  do {
    const r = await sbClient.from('records').select(cols).in('store', CLOUD_REC_STORES)
      .gt('server_updated', cursor).order('server_updated').order('store').order('id').range(from, from + 199);
    if(r.error) throw r.error;
    page = r.data || [];
    for(const row of page){
      await cloudApplyRec(row, stats);
      newest = Math.max(newest, Date.parse(row.server_updated));
    }
    from += page.length;
  } while(page.length === 200);
  await cloudDirtySave();
  /* A minute's overlap: a write that began before this read but finished after
     it carries an earlier server time. Re-reading a minute is harmless - the
     versions match and nothing is applied twice. */
  const next = Math.max(Date.parse(cursor), newest - 60000);
  await kvSet('cloudCursor', new Date(next).toISOString());
}

async function cloudSyncRecs(){
  const stats = {calls: 0, appts: 0, tasks: 0, snippets: 0, products: 0, gone: 0, photosUp: 0, photosDown: 0, missing: 0, waiting: 0};
  await cloudSeed();
  const up = {calls: 0, appts: 0, tasks: 0, snippets: 0, products: 0, gone: 0, photosUp: 0};
  try {
    await cloudPushRecs(up);
    const down = stats;
    await cloudPullRecs(down);
  } finally { cloudProgress = ''; }
  const bits = [], n = (x, w) => x + ' ' + w + (x === 1 ? '' : 's');
  const list = x => [x.calls && n(x.calls, 'call'), x.appts && n(x.appts, 'appointment'), x.tasks && n(x.tasks, 'task'),
    x.snippets && n(x.snippets, 'saved note'), x.products && n(x.products, 'product'),
    x.gone && n(x.gone, 'deletion'), x.photos && n(x.photos, 'photo')].filter(Boolean).join(', ');
  if(up.calls + up.appts + up.tasks + up.snippets + up.products + up.gone) bits.push('sent ' + list(Object.assign({}, up, {photos: up.photosUp})));
  if(stats.calls + stats.appts + stats.tasks + stats.snippets + stats.products + stats.gone){
    const got = list(Object.assign({}, stats, {photos: stats.photosDown}));
    bits.push('brought in ' + got);
    await logLoad('Cloud', 'cloud', 'Brought in ' + got);
    APPTS = await apptsAll();
    TASKS = await tasksAll();
    await loadQuotes();
    await loadLists();
    if(screen === 'lists') try { renderLists(); } catch(e){ console.error('lists', e); }
    if(screen === 'dash') try { renderDashTasks(); } catch(e){ console.error('tasks', e); }
    try { await renderHome(); } catch(e){ console.error('home', e); }
    if(screen === 'plan') try { renderPlan(); } catch(e){ console.error('plan', e); }
  }
  if(stats.missing) bits.push(n(stats.missing, 'photo') + ' could not be fetched');
  if(stats.waiting) bits.push('the open call will update when you leave it');
  return bits;
}

/* ================= contacts and accounts, outside a call =================

   Everything the app knew about a contact used to be reachable only by starting
   a call at their account. Ringing someone from the car meant opening a call you
   did not want, or going to Dynamics. This is the same data with a search box on
   it and the phone number as a link.

   Search reaches names, roles, job titles, emails, numbers and account names at
   once, because you do not always know which one you remember. */

function peopleIndex(){
  const out = [];
  for(const a of ACCOUNTS){
    for(let i = 0; i < a.c.length; i++){
      const c = a.c[i];
      out.push({c: c, a: a, i: i,
        hay: [c.n, c.r, c.t, (c.e||[]).join(' '), c.p, a.a, a.sub].filter(Boolean).join(' ').toLowerCase()});
    }
  }
  return out;
}
let peView = 'all';
/* As renderBrowse: the screen's list, or the full-screen search's results. */
function renderPeople(q, el, hint, before){
  const search = typeof q === 'string';
  q = search ? q.trim().toLowerCase() : '';
  el = el || $('peRes'); hint = hint || $('peHint');
  if(search && !q){ el.innerHTML = ''; hint.textContent = ACCOUNTS.length ? 'Type a name, account, role, email or number' : ''; return; }
  if(!ACCOUNTS.length){
    hint.textContent = 'Import the CRM export first';
    el.innerHTML = '<p class="empty">No contacts loaded.</p>';
    return;
  }
  const terms = q.split(/\s+/).filter(Boolean);
  const hit = h => terms.every(t => h.includes(t));

  const accts = (peView === 'people') ? []
    : ACCOUNTS.filter(a => !q || hit((a.a + ' ' + (a.sub||'') + ' ' + (effMgr(a)||'')).toLowerCase()));
  const folk = (peView === 'accounts') ? []
    : (q ? peopleIndex().filter(p => hit(p.hay)) : []);

  if(!q){
    hint.textContent = peView === 'people'
      ? 'Search to find a name, role, email or number'
      : ACCOUNTS.length + ' accounts loaded. Search to find people as well.';
  } else {
    const bits = [];
    if(folk.length) bits.push(folk.length + ' ' + (folk.length===1?'person':'people'));
    if(accts.length) bits.push(accts.length + ' account' + (accts.length===1?'':'s'));
    hint.textContent = bits.length ? bits.join(', ') : 'Nothing matches that';
  }

  const P = [];
  if(folk.length){
    P.push('<div class="pgroup">People</div>');
    folk.slice(0, 40).forEach((p, n) => {
      const c = p.c, email = (c.e && c.e[0]) || '';
      P.push('<div class="pcard '+FOC_CLS[p.a.foc]+'">'+
        '<div class="pn">'+esc(c.n)+'</div>'+
        '<div class="pr">'+esc(c.t || c.r || 'role not recorded')+'</div>'+
        '<div class="pa">'+esc(p.a.a)+(p.a.sub ? ' \u00b7 '+esc(p.a.sub) : '')+'</div>'+
        '<div class="pl">'+
          (c.p ? '<a href="tel:'+esc(c.p.replace(/\s/g,''))+'">Call '+esc(c.p)+'</a>'
               : '<span class="missing">No number on file</span>')+
          (email ? '<a href="mailto:'+esc(email)+'">Email</a>'
                 : '<span class="missing">No email</span>')+
          '<button data-peacct="'+esc(p.a.a)+'">Account</button>'+
        '</div></div>');
    });
    if(folk.length > 40) P.push('<p class="hint">'+(folk.length-40)+' more \u2014 narrow the search</p>');
  }
  if(accts.length){
    P.push('<div class="pgroup">Accounts</div>');
    const shown = q ? accts.slice(0, 40) : accts.slice(0, 40);
    shown.forEach(a => {
      const d = dueState(a);
      P.push('<div class="pcard '+FOC_CLS[a.foc]+'">'+
        '<div class="pn">'+esc(a.a)+'</div>'+
        '<div class="pr">'+esc([a.sub, zoneName(a.z), a.foc, a.c.length+' contact'+(a.c.length===1?'':'s')]
          .filter(Boolean).join(' \u00b7 '))+'</div>'+
        '<div class="pa">'+esc(dueLabel(d))+'</div>'+
        '<div class="pl"><button data-peacct="'+esc(a.a)+'">Open account</button></div></div>');
    });
    if(accts.length > 40) P.push('<p class="hint">'+(accts.length-40)+' more \u2014 narrow the search</p>');
  }
  el.innerHTML = P.join('') || '<p class="empty">Nothing matches that.</p>';
  el.querySelectorAll('[data-peacct]').forEach(b =>
    b.addEventListener('click', ()=>{ if(before) before(); openAccount(b.dataset.peacct); }));
}
$('peSearch').innerHTML = icon('search');
$('peSearch').addEventListener('click', () => {
  if(!ACCOUNTS.length){ toast('Import the CRM export first'); return; }
  openSearch({placeholder: 'Name, account, role, email or number',
    render: (q, el, hint) => renderPeople(q, el, hint, closeSearch)});
});
$('peView').querySelectorAll('button').forEach(b => b.addEventListener('click', ()=>{
  peView = b.dataset.v;
  $('peView').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  renderPeople();
}));
function renderPeopleCount(){
  const el = $('peopleInfo');
  if(!el) return;
  if(!ACCOUNTS.length){ el.textContent = 'Nothing loaded'; return; }
  const n = ACCOUNTS.reduce((t,a) => t + a.c.length, 0);
  el.textContent = n + ' contacts, ' + ACCOUNTS.length + ' accounts';
}

/* ================= reports =================
   Every call, newest first, as something big enough to hit. Searchable by
   account, by who was seen, and by what was logged - an asset number is often
   the only thing you remember about a visit six weeks later. */

let rpView = 'all';
function reportHay(c){
  if(c._hay) return c._hay;
  const bits = [c.customer, c.site, c.date, c.type, c.mgr];
  (c.contacts||[]).forEach(x => bits.push(x.name, x.role));
  (c.entries||[]).forEach(e => bits.push(e.asset, e.beltdesc, e.series, e.style,
    e.project, e.status, e.fault, e.htype, e.text, e.topic, e.action, e.next));
  return (c._hay = bits.filter(Boolean).join(' ').toLowerCase());
}
function reportLine(c){
  const E = t => (c.entries||[]).filter(e => e.type === t).length;
  const bits = [];
  if(E('belt')) bits.push(E('belt') + ' belt' + (E('belt')===1?'':'s'));
  if(E('health')) bits.push(E('health') + ' health');
  if(E('project')) bits.push(E('project') + ' project' + (E('project')===1?'':'s'));
  if(E('note')) bits.push(E('note') + ' note' + (E('note')===1?'':'s'));
  if(!bits.length) bits.push(c.noReport ? 'no report' : 'nothing logged');
  if(c.photosArchived) bits.push('photos archived');
  if(c.site) bits.push(c.site);
  return bits.join(' \u00b7 ');
}
async function renderReports(){
  const all = (await callsAll()).slice().sort((a,b) => callWhen(b) - callWhen(a));
  let list = all;
  /* Filtering on callStatus, not on c.closed. A call that has been compiled but
     not closed out is neither open nor done, and the old two-way split had to
     put it on one side or the other. */
  if(rpView === 'open') list = list.filter(c => !c.closed && callStatus(c).label !== 'compiled');
  else if(rpView === 'compiled') list = list.filter(c => !c.closed && callStatus(c).label === 'compiled');
  else if(rpView === 'done') list = list.filter(c => c.closed);

  const open = all.filter(c => !c.closed).length;
  $('rpHint').textContent = all.length
    ? (rpView !== 'all'
        ? list.length + ' of ' + all.length + ' calls'
        : all.length + ' call' + (all.length === 1 ? '' : 's') + ', ' + (open ? open + ' still open' : 'none open'))
    : 'No calls logged yet';

  const el = $('rpRes');
  /* A row is a tap target plus the ⋯, so it cannot be one button - a button
     inside a button is not valid and Android picks the wrong one. The row is a
     div; the reading area is the button. Mark done and Delete used to sit on
     the row as a tick and a bin, side by side; they are behind the ⋯ (v83). */
  el.innerHTML = list.length
    ? list.slice(0, 60).map(reportRow).join('') + (list.length > 60 ? '<p class="hint">'+(list.length-60)+' more \u2014 search to find older calls</p>' : '')
    : '<p class="empty">'+(all.length ? 'Nothing here.' : 'No calls logged yet.')+'</p>';
  wireReportRows(el, list);
}
function reportRow(c){
  const st = callStatus(c);
  return '<div class="rprow'+(c.closed ? '' : ' open')+'">'+
    '<button class="rpt" data-rpt="'+esc(c.id)+'">'+
    '<div class="rt"><span class="rd">'+esc(c.date)+'</span>'+
    '<span class="st '+st.cls+'">'+st.label+'</span></div>'+
    '<div class="rn">'+esc(c.customer)+'</div>'+
    '<div class="rm">'+esc(reportLine(c))+'</div></button>'+
    '<button class="rpmore" data-rpmenu="'+esc(c.id)+'" aria-label="More for '+esc(c.customer)+'">&#8943;</button>'+
    '</div>';
}
// before is run first when a row is opened - the search closes itself there
function wireReportRows(el, list, before){
  el.querySelectorAll('[data-rpt]').forEach(b => b.addEventListener('click', async ()=>{
    const found = (await callsAll()).find(c => c.id === b.dataset.rpt);
    if(!found){ toast('That call could not be opened'); return; }
    if(before) before();
    /* Reopening a finished call to edit it does not un-finish it. The status
       only moves when you actually change something and close it again. */
    call = found;
    call.loose = call.loose || [];
    go('dash');
  }));
  el.querySelectorAll('[data-rpmenu]').forEach(b => b.addEventListener('click', ()=>{
    const c = list.find(x => x.id === b.dataset.rpmenu);
    if(c) openReportMenu(c);
  }));
}
function openReportMenu(c){
  const refresh = () => { renderReports().catch(e=>console.error('reports', e)); renderHome();
    if($('srchdlg').hasAttribute('open')) runSearch(); };
  const fresh = async () => (await callsAll()).find(x => x.id === c.id);
  const acts = [];
  if(!c.closed) acts.push({label: 'Mark done', icon: 'check', run: async () => {
    const found = await fresh();
    if(!found){ toast('That call could not be found'); return; }
    if(!await markCallDone(found)) return;
    toast('Marked done'); refresh();
  }});
  acts.push({label: 'Delete', icon: 'trash', danger: true, run: async () => {
    const found = await fresh();
    if(!found){ toast('That call could not be found'); return; }
    if(!await deleteCallRecord(found)) return;
    refresh();
  }});
  openCardMenu(c.customer, c.date + ' \u00b7 ' + callStatus(c).label, acts);
}
$('rpSearch').innerHTML = icon('search');
$('rpSearch').addEventListener('click', () => openSearch({
  placeholder: 'Account, contact, asset or note',
  async render(q, el, hint){
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if(!terms.length){ el.innerHTML = ''; hint.textContent = ''; return; }
    const all = (await callsAll()).slice().sort((a,b) => callWhen(b) - callWhen(a));
    const hits = all.filter(c => terms.every(t => reportHay(c).includes(t)));
    hint.textContent = hits.length ? hits.length + ' of ' + all.length + ' calls' : 'Nothing matches that.';
    el.innerHTML = hits.slice(0, 100).map(reportRow).join('') +
      (hits.length > 100 ? '<p class="hint">' + (hits.length - 100) + ' more \u2014 add another word</p>' : '');
    wireReportRows(el, hits, closeSearch);
  }
}));
$('rpView').querySelectorAll('button').forEach(b => b.addEventListener('click', ()=>{
  rpView = b.dataset.v;
  $('rpView').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  renderReports().catch(reportErr);
}));
/* ================= save to a PC folder (v94) =================
   Done calls and quote requests written into a folder on the PC. Pick one
   inside OneDrive and they are backed up and searchable like any other file:

     Customer\Site\2026-10-09\            the call notes and its photos
     Customer\Quote requests\2026-10-09\  a quote request and its photos

   The account name is split at its first " - " into customer and site. With
   no " - " the call's own Site field is used, and with neither the date
   folder sits straight under the customer.

   Chrome and Edge on a PC only - it needs the File System Access API, and the
   button is not shown anywhere else. The folder is remembered on this device
   and Chrome asks once a session to allow it again. Only done calls that are
   new or changed since they were last saved are written; a changed call
   replaces its earlier copy by removing the files this app wrote for it -
   never anything else in the folder. None of this goes to the cloud. */
const PC_DIR = 'pcFolder', PC_SAVED = 'pcSaved';
const pcFolderOk = () => !!window.showDirectoryPicker && !isPhone();
// Windows will not take <>:"/\|?* or a trailing dot or space, or a device name
function pcName(v, fallback){
  let n = String(v == null ? '' : v).replace(/[<>:"\/\\|?*\x00-\x1f]+/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 80).replace(/[. ]+$/, '');
  if(/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(n)) n += '_';
  return n || fallback;
}
function pcPath(c){
  let date = isoFromDdmmyyyy(c.date);
  if(!/^\d{4}-\d\d-\d\d$/.test(date || '')) date = iso(new Date(c.updated || Date.now()));
  const name = String(c.customer || ''), cut = name.indexOf(' - ');
  const cust = pcName(cut > 0 ? name.slice(0, cut) : name, 'No customer');
  if(isQuote(c)) return [cust, 'Quote requests', date];
  const site = pcName(cut > 0 ? name.slice(cut + 3) : c.site, '');
  return site ? [cust, site, date] : [cust, date];
}
const pcBlob = p => (isBlobPhoto(p) || blobLike(p)) ? p : dataURLToBlob(String(p));
const pcAllPhotos = c => [].concat(...(c.entries || []).map(e => e.photos || []), c.loose || []);
/* What each photo is called in the folder: the entry it belongs to, then a
   count. skip holds the ids of photos already archived (v96) - their
   full-size files are in the folder and must not be overwritten by the small
   copy - and used the names already taken there. */
async function pcPhotos(c, skip, used){
  const out = [], n = {belt: 0, health: 0};
  used = new Set([...(used || [])].map(x => x.toLowerCase()));
  const add = async (p, base) => {
    let blob, id = '';
    try { blob = pcBlob(p); } catch(e){ return; }
    try { id = await photoId(await photoBytesOf(p)); } catch(e){}
    if(id && skip && skip.has(id)) return;
    const ext = /png/.test(blob.type) ? '.png' : /webp/.test(blob.type) ? '.webp' : '.jpg';
    let name = pcName(base, 'Photo') + ext;
    for(let k = 2; used.has(name.toLowerCase()); k++) name = pcName(base, 'Photo') + ' (' + k + ')' + ext;
    used.add(name.toLowerCase());
    out.push({name, blob, id});
  };
  for(const e of c.entries || []){
    const label = e.type === 'belt' ? 'Belt ' + (++n.belt)
                : e.type === 'health' ? 'Health ' + (++n.health) : (e.type || 'Entry');
    const ph = e.photos || [];
    for(let k = 0; k < ph.length; k++) await add(ph[k], label + (e.asset ? ' ' + e.asset : '') + ' - ' + (k + 1));
  }
  const lo = c.loose || [];
  for(let k = 0; k < lo.length; k++) await add(lo[k], 'Additional - ' + (k + 1));
  return out;
}
async function pcSavedMap(){
  try { return (await kvGet(PC_SAVED)) || {}; } catch(e){ return {}; }
}
async function pcPending(saved){
  saved = saved || await pcSavedMap();
  return (await recordsAll()).filter(c => c.closed && (!saved[c.id] || saved[c.id].u !== (c.updated || 0)));
}
let pcHandle = null;   // also kept in kv, so the folder survives a restart
async function pcStored(){
  if(!pcHandle){ try { pcHandle = (await kvGet(PC_DIR)) || null; } catch(e){} }
  return pcHandle;
}
async function pcRoot(pick){
  const h = pick ? null : await pcStored();
  if(h){
    const o = {mode: 'readwrite'};
    if(h.queryPermission && await h.queryPermission(o) === 'granted') return h;
    if(h.requestPermission && await h.requestPermission(o) === 'granted') return h;
    return null;
  }
  let picked;
  try { picked = await window.showDirectoryPicker({id: 'fieldcrm', mode: 'readwrite'}); }
  catch(e){ if(e.name === 'AbortError') return null; throw e; }
  pcHandle = picked;
  try { await kvSet(PC_DIR, picked); } catch(e){ console.warn('pc folder not remembered', e); }
  await kvSet(PC_SAVED, {});     // a new folder starts empty, so everything done goes in
  return picked;
}
async function pcSub(root, parts, create){
  let d = root;
  for(const p of parts) d = await d.getDirectoryHandle(p, {create: !!create});
  return d;
}
async function pcWrite(dir, name, data){
  const w = await (await dir.getFileHandle(name, {create: true})).createWritable();
  await w.write(data);
  await w.close();
}
/* Removes the files written for this call last time, and the folders that
   leaves empty if the call has moved (a changed date or account). A folder
   with anything else in it is left alone - removeEntry without recursive
   refuses, which is the point. */
async function pcClear(root, prev, parts){
  let d;
  try { d = await pcSub(root, prev.dir); } catch(e){ return; }   // moved or deleted by hand
  for(const f of prev.files || []){ try { await d.removeEntry(f); } catch(e){} }
  if(prev.dir.join('/') === parts.join('/')) return;
  for(let i = prev.dir.length - 1; i >= 0; i--){
    try { await (await pcSub(root, prev.dir.slice(0, i))).removeEntry(prev.dir[i]); }
    catch(e){ break; }
  }
}
/* The record kept per call (kv pcSaved): u, the call's updated when saved;
   dir and files, what was written; map, photo id -> file name; keep, the
   full-size files of archived photos (v96), which are never removed and
   never moved - an archived call stays in the folder its originals are in. */
async function pcSaveOne(root, c, saved){
  const prev = saved[c.id], keep = (prev && prev.keep) || [];
  let parts;
  if(keep.length) parts = prev.dir.slice();
  else {
    parts = pcPath(c);
    // two calls at one site on one day get a folder each
    const taken = new Set(Object.keys(saved).filter(id => id !== c.id).map(id => (saved[id].dir || []).join('/')));
    const day = parts[parts.length - 1];
    for(let k = 2; taken.has(parts.join('/')); k++) parts[parts.length - 1] = day + ' (' + k + ')';
  }
  if(prev) await pcClear(root, Object.assign({}, prev, {files: (prev.files || []).filter(f => !keep.includes(f))}), parts);
  const dir = await pcSub(root, parts, true);
  const q = isQuote(c), mode = defaultImgMode();
  const html = q ? await buildRFQHTML(mode, c) : await buildNotesHTML('full', mode, c);
  const files = [fileName(q ? 'rfq' : 'full', c)];
  await pcWrite(dir, files[0], new Blob([html], {type: 'text/html'}));
  // where this folder holds the originals, the small copies are not written over them
  const skip = keep.length ? new Set((c.photosArchived && c.photosArchived.ids) || []) : null;
  const photos = await pcPhotos(c, skip, keep.concat(files));
  const map = Object.assign({}, keep.length && prev.map || {});
  for(const ph of photos){ await pcWrite(dir, ph.name, ph.blob); files.push(ph.name); if(ph.id) map[ph.id] = ph.name; }
  return {u: c.updated || 0, dir: parts, files: files.concat(keep), keep, map, photos: photos.length};
}
let pcBusy = false;
async function pcSaveAll(pick){
  if(pcBusy){ toast('Already saving'); return; }
  pcBusy = true;
  try {
    let root;
    try { root = await pcRoot(pick); }
    catch(e){ console.error('pc folder', e); toast('Could not open that folder: ' + e.message); return; }
    if(!root){ toast('Nothing saved — the folder was not allowed'); return; }
    const saved = await pcSavedMap();
    const todo = await pcPending(saved);
    const where = root.name || 'the folder';
    if(!todo.length){ toast('Every done call is already in ' + where); renderPcFolder(); return; }
    let calls = 0, quotes = 0, photos = 0, failed = 0;
    for(let i = 0; i < todo.length; i++){
      const c = todo[i];
      toast('Saving ' + (i + 1) + ' of ' + todo.length + '...');
      try {
        saved[c.id] = await pcSaveOne(root, c, saved);
        await kvSet(PC_SAVED, saved);
        if(isQuote(c)) quotes++; else calls++;
        photos += saved[c.id].photos;
      } catch(e){ console.error('pc folder', c.id, e); failed++; }
    }
    const bits = [];
    if(calls) bits.push(calls + ' call' + (calls === 1 ? '' : 's'));
    if(quotes) bits.push(quotes + ' quote request' + (quotes === 1 ? '' : 's'));
    toast((bits.length ? 'Saved ' + bits.join(' and ') + (photos ? ', ' + photos + ' photo' + (photos === 1 ? '' : 's') : '') +
      ' to ' + where : 'Nothing saved') + (failed ? '. ' + failed + ' could not be saved — try again' : ''));
    renderPcFolder();
  } finally { pcBusy = false; }
}
// the button on Reports: PC only, and it says how many are waiting
async function renderPcFolder(){
  const b = $('rpFolder');
  if(!b) return;
  b.hidden = !pcFolderOk();
  if(b.hidden) return;
  const n = (await pcPending()).length;
  b.innerHTML = icon('folder') + '<span>Save to PC folder' + (n ? ' (' + n + ')' : '') + '</span>';
}
$('rpFolder') && $('rpFolder').addEventListener('click', async () => {
  const h = await pcStored();
  if(!h){ pcSaveAll(true).catch(reportErr); return; }
  const n = (await pcPending()).length;
  openCardMenu('Save to PC folder', 'Folder: ' + (h.name || 'the one you picked'), [
    {label: 'Save new and changed' + (n ? ' (' + n + ')' : ''), icon: 'folder', run: () => pcSaveAll(false).catch(reportErr)},
    {label: 'Archive photos older than 12 months', icon: 'image', run: () => archAll().catch(reportErr)},
    {label: 'Choose a different folder', icon: 'folder', run: () => pcSaveAll(true).catch(reportErr)}
  ]);
});

/* ================= photo archive (v96) =================
   BACKEND-PLAN.md Step 10, with Ben's answers: done calls (and quote
   requests) dated more than 12 months ago keep 800px copies of their photos
   in the app and the cloud; the full-size photos live in the PC folder.

   Only when tapped (Save to PC folder, then Archive photos older than 12
   months), on the PC, after a confirmation that names what it will do. For
   each call:
     1. the call is saved to the PC folder if it is not there or has changed;
     2. every full-size photo is read back from the folder and its size
        checked against the one in the app - if any is missing or short the
        call is saved again and checked again, and skipped if it still fails;
     3. only then are the photos replaced with 800px copies, and the call is
        marked photosArchived (when, where, and the ids of the small copies).
   The call is written through callsPut with a new updated, so cloud sync
   sends the small copies and removes the full-size ones from the photos
   bucket, and the other devices take the small copies in place of theirs.

   A photo added to an archived call later is full size and not in the ids,
   so the next run archives it too. Later saves to the same folder never
   overwrite or remove the originals (pcSaveOne, keep). */
const ARCH_MONTHS = 12, ARCH_PX = 800, ARCH_Q = 0.72;
function archCutoff(){ const d = new Date(); d.setMonth(d.getMonth() - ARCH_MONTHS); return d.getTime(); }
async function archCandidates(){
  const cut = archCutoff(), out = [];
  for(const c of await recordsAll()){
    if(!c.closed || !(callWhen(c) < cut) || (call && call.id === c.id)) continue;
    const done = new Set((c.photosArchived && c.photosArchived.ids) || []);
    const todo = [];
    for(const p of pcAllPhotos(c)){
      try { const id = await photoId(await photoBytesOf(p)); if(!done.has(id)) todo.push({p, id}); } catch(e){}
    }
    if(todo.length) out.push({c, todo});
  }
  return out;
}
async function archCheck(root, rec, todo){
  let dir;
  try { dir = await pcSub(root, rec.dir); } catch(e){ return false; }
  for(const t of todo){
    const name = rec.map && rec.map[t.id];
    if(!name) return false;
    try {
      const f = await (await dir.getFileHandle(name)).getFile();
      if(f.size !== pcBlob(t.p).size) return false;
    } catch(e){ return false; }
  }
  return true;
}
async function archOne(root, item, saved){
  const c = item.c, todo = item.todo;
  // 1 and 2: the full-size copies are on the PC, whole
  if(!saved[c.id] || saved[c.id].u !== (c.updated || 0) || !await archCheck(root, saved[c.id], todo)){
    saved[c.id] = await pcSaveOne(root, c, saved);
    await kvSet(PC_SAVED, saved);
    if(!await archCheck(root, saved[c.id], todo)) throw new Error('the copies on the PC could not be checked');
  }
  const rec = saved[c.id];
  // 3: the small copies
  const small = new Map(), ids = [];
  let freed = 0;
  for(const t of todo){
    const b = pcBlob(t.p);
    let s;
    try { s = await shrink(b, ARCH_PX, ARCH_Q); } catch(e){ console.warn('archive shrink', e); continue; }
    if(!s || s.size >= b.size) s = b;          // already small: kept as it is, still counted as archived
    small.set(t.p, s);
    ids.push(await photoId(await photoBytesOf(s)));
    freed += b.size - s.size;
  }
  if(!small.size) throw new Error('none of its photos could be made smaller');
  // a sync may have brought a newer copy in while this ran: leave that one for next time
  const now = (await recordsAll()).find(x => x.id === c.id);
  if(!now || (now.updated || 0) !== (c.updated || 0)) throw new Error('it changed while archiving');
  for(const e of c.entries || []) if(Array.isArray(e.photos)) e.photos = e.photos.map(p => small.get(p) || p);
  if(Array.isArray(c.loose)) c.loose = c.loose.map(p => small.get(p) || p);
  const was = c.photosArchived || {};
  c.photosArchived = {at: Date.now(), ids: (was.ids || []).concat(ids), n: (was.n || 0) + small.size,
    folder: root.name || '', path: rec.dir.join('\\')};
  c.updated = Date.now();
  await callsPut(c);
  const kept = todo.filter(t => small.has(t.p)).map(t => rec.map[t.id]);
  saved[c.id] = Object.assign({}, rec, {u: c.updated, keep: [...new Set((rec.keep || []).concat(kept))]});
  await kvSet(PC_SAVED, saved);
  return {n: small.size, freed};
}
const mbOf = b => (b / 1048576).toFixed(b < 10485760 ? 1 : 0) + ' MB';
async function archAll(){
  if(pcBusy){ toast('Already saving'); return; }
  pcBusy = true;
  try {
    let root;
    try { root = await pcRoot(false); }
    catch(e){ console.error('archive', e); toast('Could not open the folder: ' + e.message); return; }
    if(!root){ toast('Nothing archived \u2014 the folder was not allowed'); return; }
    toast('Looking for old photos...');
    const list = await archCandidates();
    if(!list.length){ toast('No photos older than 12 months to archive'); return; }
    const nPh = list.reduce((a, x) => a + x.todo.length, 0);
    const bytes = list.reduce((a, x) => a + x.todo.reduce((b, t) => b + pcBlob(t.p).size, 0), 0);
    if(!confirm('Archive ' + nPh + ' photo' + (nPh === 1 ? '' : 's') + ' on ' + list.length + ' call' + (list.length === 1 ? '' : 's') +
        ' older than 12 months?\n\nThe full-size photos are saved to ' + (root.name || 'the PC folder') +
        ' and checked first. Then this PC, your phone and the cloud keep 800px copies, freeing about ' +
        mbOf(bytes * 0.75) + '.\n\nThe full-size photos will only be in the PC folder. This cannot be undone in the app.')) return;
    const saved = await pcSavedMap();
    let calls = 0, photos = 0, freed = 0;
    const failed = [];
    for(let i = 0; i < list.length; i++){
      toast('Archiving ' + (i + 1) + ' of ' + list.length + '...');
      try { const r = await archOne(root, list[i], saved); calls++; photos += r.n; freed += r.freed; }
      catch(e){ console.error('archive', list[i].c.id, e); failed.push(list[i].c.customer + ' ' + list[i].c.date + ': ' + e.message); }
    }
    const msg = (calls ? 'Archived ' + photos + ' photo' + (photos === 1 ? '' : 's') + ' on ' + calls + ' call' + (calls === 1 ? '' : 's') +
      ', freeing ' + mbOf(freed) : 'Nothing archived');
    if(failed.length) alert(msg + '.\n\nNot archived (their photos are unchanged):\n' + failed.join('\n'));
    else toast(msg);
    renderPcFolder();
    renderReports().catch(e => console.error('reports', e));
  } finally { pcBusy = false; }
}

async function renderReportsCount(){
  const el = $('reportsInfo');
  if(!el) return;
  const all = await callsAll();
  const open = all.filter(c => !c.closed).length;
  el.textContent = all.length
    ? all.length + ' call' + (all.length===1?'':'s') + (open ? ', ' + open + ' open' : '')
    : 'No calls yet';
}

/* ---------- leaving an entry form ----------
   There is no Save button and no "back without saving". Leaving a form is the
   save, and it is also the discard - which one depends only on whether the form
   has anything in it:

     required fields filled  ->  saved to the call log
     nothing entered at all  ->  dropped silently, so backing out of a form you
                                 opened by mistake leaves no ghost entry
     part filled             ->  nothing enters the log, and the draft is kept
                                 and offered back next time you open the form

   The third case is the one worth being clear about. The draft is not a log
   entry - it is invisible until you return to that screen - so it cannot clutter
   anything, and it means missing one required field does not throw away the
   other thirty you just typed.

   Every one of these paths runs the form's own save handler, so validation, the
   series cascade, the frequency bumps and the photo buffer all behave exactly as
   they did when a button triggered them. */
const ENTRY_REQUIRED = {
  belt:    ['bAsset'],
  project: ['pName'],
  note:    ['nText'],
  health:  ['hFault']
};
/* The save buttons still exist in the markup, hidden. Done clicks them rather
   than the logic being lifted out, so there is exactly one save path per form
   and no chance of the two drifting apart. */
const ENTRY_SAVE_BTN = {belt:'bSave', project:'pSave', note:'nSave', health:'hSave'};
function entryHasRequired(kind){
  return (ENTRY_REQUIRED[kind] || []).every(id => {
    const el = $(id);
    return el && el.value && el.value.trim() !== '';
  });
}
function entryIsEmpty(kind){
  const ids = DRAFT_FIELDS[kind] || [];
  const blank = ids.every(id => { const el = $(id); return !el || !el.value || !el.value.trim(); });
  return blank && !(SHOTS[kind] && SHOTS[kind].length);
}
/* Called on the way out of a form. Returns true if it handled the exit itself -
   the save handlers navigate to the dashboard when they succeed. */
function leaveEntry(kind){
  if(!call || !ENTRY_SAVE_BTN[kind]) return false;
  if(entryHasRequired(kind)){
    if(kind === 'belt') beltSaveSilent = false;
    $(ENTRY_SAVE_BTN[kind]).click();
    return true;
  }
  if(entryIsEmpty(kind)){
    // opened and backed out of: leave nothing behind, not even a draft
    resetShots(kind);
    draftSaved(kind);   // nothing typed, so there is no draft worth keeping
    return false;
  }
  // part filled: the draft survives, nothing reaches the log
  toast('Kept as a draft \u2014 ' + ENTRY_REQUIRED[kind].length + ' required field still empty');
  return false;
}
document.querySelectorAll('.backcall').forEach(b =>
  b.addEventListener('click', ()=>{
    if(CALL_SCREENS.includes(screen) && screen !== 'dash' && leaveEntry(screen)) return;
    go(call ? 'dash' : 'home', true);
  }));

/* ================= getting around =================

   Two things the app never had. A way back to the hub from any depth - the back
   arrow retraces history, so leaving was proportional to how deep you had gone
   and the menu was always at the bottom of the stack. And any indication that a
   call was still open once you had left it.

   Together they turn "check a manual mid-call" from seven taps out and two back
   into two out and one back, landing on the screen you left rather than the
   dashboard. */

function resetNote(){ $('nText').value=''; resetShots('note'); }
const CALL_SUBS = {belt:'Belt form', project:'Project form', note:'Note form',
                   health:'Health check', dash:'Call'};
let lastCallScreen = 'dash';

function renderCallStrip(){
  const el = $('callStrip');
  if(!el) return;
  const away = call && !CALL_SCREENS.includes(screen);
  el.classList.toggle('on', !!away);
  if(!away) return;
  el.innerHTML = '<span class="cs1">In a call</span>' +
    '<span class="cs2">' + esc(call.customer) + '</span>' +
    '<span class="cs3">' + esc(CALL_SUBS[lastCallScreen] || 'Call') + ' \u203a</span>';
}
$('callStrip').addEventListener('click', ()=>{
  if(!call) return;
  /* Back to where you actually were. Returning to the dashboard would mean
     finding the entry again, which is most of the cost of having left. */
  go(CALL_SCREENS.includes(lastCallScreen) ? lastCallScreen : 'dash');
});
// icons rather than the words "Menu" and a chevron character
$('back').innerHTML = icon('chev');
$('hdMenu').innerHTML = icon('home');
/* Home from anywhere, in a call or out of it. This is a move, not a close - the
   call stays open and the call strip keeps saying so - which is what makes going
   in and out of two calls possible. */
$('hdMenu').addEventListener('click', ()=>{
  // on Home it is the ⋯ menu: Settings, and Help (v85)
  if(screen === 'home'){
    openCardMenu('Field CRM', 'Version ' + APP_BUILD, [
      {label: 'Settings', icon: 'gear', run: () => go('settings')},
      {label: 'Help', icon: 'help', run: () => go('help')}
    ]);
    return;
  }
  if(CALL_SCREENS.includes(screen) && screen !== 'dash' && leaveEntry(screen)) return;
  go('home', true);
});

/* ---------- drafts ----------
   Leaving a half-filled form used to discard it, which is why leaving felt like
   a decision rather than a step. The values are kept against the call as you
   type and restored when you come back. Saving the entry, or backing out on
   purpose, clears the draft. */
const DRAFT_FIELDS = {
  belt:    ['bAsset','bDesc','bCvLen','bFrame','bWidth','bLen','bSprDesc','bSprPn',
            'bSprDrive','bSprIdle','bNotch','bFlMat','bFlHeight','bFlMm','bSgMat',
            'bSgHeight','bQc','bComment','bFault'],
  project: ['pName','pStat','pNext','pTarg','pOwner','pNotes'],
  note:    ['nTopic','nText'],
  health:  ['hAsset','hFault','hType','hAction','hComment']
};
/* Leaving a form captures whatever is in it - including immediately after a
   save, when the fields still hold what was just filed. Without this the draft
   was written back a moment after being deleted, and the next visit offered to
   restore an entry that is already in the call log. */
let justSaved = null;
function draftSaved(kind){
  justSaved = kind;
  if(call && call.drafts) delete call.drafts[kind];
}
function captureDraft(kind){
  if(justSaved === kind){ justSaved = null; return; }
  if(!call || !DRAFT_FIELDS[kind]) return;
  const d = {};
  let any = false;
  DRAFT_FIELDS[kind].forEach(id => {
    const f = $(id);
    if(!f) return;
    d[id] = f.value;
    if(f.value && f.value.trim && f.value.trim() !== '') any = true;
  });
  call.drafts = call.drafts || {};
  if(any) call.drafts[kind] = d; else delete call.drafts[kind];
}
function restoreDraft(kind){
  if(!call || !call.drafts || !call.drafts[kind]) return false;
  const d = call.drafts[kind];
  Object.keys(d).forEach(id => { const f = $(id); if(f) f.value = d[id]; });
  showMsg($('draft_' + kind), 'info',
    'Picked up where you left off. <span class="lnk" data-cleardraft="' + kind +
    '">Start fresh instead</span>');
  const el = $('draft_' + kind);
  if(el) el.querySelectorAll('[data-cleardraft]').forEach(b =>
    b.addEventListener('click', ()=>{ clearDraft(kind); openEntry(kind, true); }));
  return true;
}
async function clearDraft(kind){
  if(!call || !call.drafts) return;
  delete call.drafts[kind];
  await saveCall();
  showMsg($('draft_' + kind), '', '');
}
/* One way in to every entry form, so the draft is applied wherever it is opened
   from - the dashboard, the call menu, or coming back off the call strip. */
function openEntry(kind, fresh){
  const reset = {belt:resetBelt, project:resetProject, note:resetNote, health:resetHealth}[kind];
  if(reset) try { reset(); } catch(e){ console.error(kind, e); }
  showMsg($('draft_' + kind), '', '');
  if(!fresh) restoreDraft(kind);
  go(kind);
}
// every form keeps its draft as it is typed
Object.keys(DRAFT_FIELDS).forEach(kind => {
  DRAFT_FIELDS[kind].forEach(id => {
    const f = $(id);
    if(!f) return;
    const keep = () => { captureDraft(kind); if(call) saveCall(); };
    f.addEventListener('input', keep);
    f.addEventListener('change', keep);
  });
});

/* ---------- manuals without leaving the call ----------
   The manual page viewer is already a full-screen overlay that closes back to
   whatever was behind it, so the browser in front of it can be too. Opened this
   way there is nothing to restore, because nothing was navigated away from. */
/* The manuals pane is MOVED into the overlay rather than duplicated. manuals.js
   works against #mQ, #mBody and the rest by id, and two copies of those ids on
   one page would be the duplicate-id bug this project has been bitten by three
   times. Moving it keeps exactly one of each, and it goes back where it came
   from on close so the Reference screen is unchanged. */
let manHome = null;
function openManualsOverlay(){
  if(!window.Manuals){ toast('The manual library is not loaded'); return; }
  const ov = $('manOverlay'), pane = $('paneMan');
  if(!ov || !pane) return go('reference');
  if(!manHome) manHome = {parent: pane.parentNode, next: pane.nextSibling};
  $('manOvBody').appendChild(pane);
  pane.hidden = false;
  ov.classList.add('on');
  try { history.pushState({screen: screen, dialog:'manOverlay'}, '', location.href); } catch(e){}
  Manuals.render().catch(e => console.error('manuals', e));
}
function closeManualsOverlay(){
  const ov = $('manOverlay');
  if(!ov || !ov.classList.contains('on')) return;
  if(window.Manuals) Manuals.closeViewer();
  ov.classList.remove('on');
  const pane = $('paneMan');
  if(pane && manHome && manHome.parent){
    manHome.parent.insertBefore(pane, manHome.next || null);
  }
}
$('manOvClose').addEventListener('click', ()=>{
  if(history.state && history.state.dialog === 'manOverlay') history.back();
  else closeManualsOverlay();
});
$('barManuals').addEventListener('click', openManualsOverlay);

/* ---------- home ---------- */
async function renderHome(){
  const every = await recordsAll();
  // only calls index into the account history and the cadence figures
  const all = every.filter(c => !isQuote(c));
  indexCalls(all);
  const open = every.filter(c=>!c.closed).sort((a,b)=>b.updated-a.updated);
  $('resumeInfo').textContent = open.length ? open[0].customer : 'None open';
  renderHomeCounts();
  renderPeopleCount(); renderReportsCount().catch(()=>{});
  const done = all.sort((a,b)=>b.updated-a.updated).slice(0,8);
  renderBackupAge();
  /* Past calls moved to Reports, which lists the same calls with a search box
     and an All/Open/Finished filter. The block below is kept and guarded so the
     list can be put back on any screen by adding the element again. */
  const el = $('pastList');
  if(!el) return;
  if(!done.length){ el.innerHTML = '<p class="empty">No saved calls.</p>'; return; }
  el.innerHTML = done.map(c=>
    '<div class="card"><div class="hd"><span class="t">'+esc(c.date)+'</span>'+
    '<span class="acts"><button class="x" data-open="'+c.id+'">Open</button>'+
    '<button class="x bin" data-delcall="'+c.id+'">&#128465; Delete</button></span></div>'+
    '<p>'+esc(c.customer)+'<span class="st '+callStatus(c).cls+'">'+callStatus(c).label+'</span></p>'+
    '<p class="meta">'+(c.entries.length ? c.entries.length+' entries' : 'no report')+'</p></div>'
  ).join('');
  el.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click', async ()=>{
    const all2 = await callsAll();
    call = all2.find(x=>x.id===b.dataset.open);
    if(call) call.loose = call.loose || [];
    go('dash');
  }));
  el.querySelectorAll('[data-delcall]').forEach(b=>b.addEventListener('click', async ()=>{
    const c = done.find(x=>x.id===b.dataset.delcall);
    if(!c){ toast('That call could not be found'); return; }
    if(!await deleteCallRecord(c)) return;
    renderHome();
  }));
}
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click', async ()=>{
  const t = b.dataset.go;
  if(t==='newcall'){
    // nothing chosen yet: the screen shows only "What would you like to do?"
    cameFromAcct = false; bookingMode = false;
    $('cDate').value = todayISO();
    $('cReqBy').value = '';
    $('cRef').value = '';
    $('cType').value = 'Site call';
    syncQuoteMode();
    newMark('');
    $('s-account').classList.add('choosing');
    go('account'); renderAccSearch();
  } else if(t==='accounts'){
    browseScope = 'mine';
    $('abScope').querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.v === 'mine'));
    showDir('acc');
  } else if(t==='people'){
    if(!ACCOUNTS.length){ toast('Import the CRM export first'); return; }
    showDir('ppl');
  } else if(t==='newtask'){
    openTask(null);
  } else if(t==='calltask'){
    if(!call){ toast('Open a call first'); return; }
    const first = (call.contacts||[])[0] || {};
    openTask(null, {callId: call.id, acct: call.customer, contact: first.name || '', email: first.email || '', mobile: first.mobile || ''});
  } else if(t==='lists'){
    showLists();
  } else if(t==='reports'){
    go('reports');
  } else if(t==='manuals'){
    if(!window.Manuals){ toast('manuals.js did not load'); return; }
    showRef('man');
  } else if(t==='faults'){
    if(!window.HealthLib){ toast('healthlib.js did not load'); return; }
    showRef('flt');
  } else if(t==='plan'){
    if(!ACCOUNTS.length){ toast('Import the CRM export first'); return; }
    if(!plan.mgr && $('cMgr').value) plan.mgr = $('cMgr').value;
    // the phone gets the read-and-act list, the desktop gets the planning surface
    go(isPhone() ? 'today' : 'plan');
  } else if(t==='due'){
    browseScope = 'due';
    $('abScope').querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.v === 'due'));
    showDir('acc');
  } else if(t==='resume'){
    /* Calls and quote requests together. They were separate tiles briefly; one
       Resume is simpler, and the picker names each one so a half-finished
       request is not mistaken for a half-finished call. */
    const all = await recordsAll();
    const open = all.filter(c=>!c.closed).sort((a,b)=>b.updated-a.updated);
    if(!open.length){ toast('Nothing open'); return; }
    /* One open call is the common case and asking which would be noise. More
       than one, and picking the most recent silently is how you end up writing
       into the wrong plant. */
    if(open.length === 1){ call = open[0]; call.loose = call.loose || []; go('dash'); return; }
    showOpenPicker(open);
  } else if(t==='belt'){ openEntry('belt'); }
  else if(t==='project'){ openEntry('project'); }
  else if(t==='note'){ openEntry('note'); }
  else if(t==='health'){ openEntry('health'); }
  else if(t==='settings'){ go('settings'); }
  else if(t==='directory'){ showDir('acc'); }
  else if(t==='reference'){ showRef('man'); }
}));

/* ---------- import wiring ---------- */
$('importBtn').addEventListener('click', async ()=>{
  const f = $('xlsxFile').files[0];
  if(!f){ toast('Choose an .xlsx or .csv file first'); return; }
  try { await importCrm(f); }
  catch(e){ console.error(e); toast('Import failed: '+e.message); }
});
$('manBtn').addEventListener('click', async ()=>{
  const f = $('manFile').files[0];
  if(!f){ toast('Choose the manual PDF first'); return; }
  if(!window.Manuals){ toast('manuals.js did not load'); return; }
  const btn = $('manBtn'), msg = $('manMsg');
  btn.disabled = true;
  showMsg(msg, 'info', 'Starting - leave this screen on.');
  try {
    const meta = await Manuals.importManual(f, $('manMode').value, (stage, done, total)=>{
      showMsg(msg, 'info', esc(stage)+' '+done+' of '+total+String.fromCharCode(8230));
    });
    showMsg(msg, 'ok', '<b>'+esc(meta.name)+'</b> imported - '+meta.sections.length+
      ' series, '+meta.renderedPages+' page images stored.');
    await logLoad(f.name || meta.name, 'manual',
      meta.sections.length + ' series sections, ' + meta.renderedPages + ' page images');
    toast('Manual imported');
    renderManStat(); renderManCount();
  } catch(e){
    console.error(e);
    showMsg(msg, 'warn', 'Import failed: '+esc(e.message)+
      ' The manuals already on this device are untouched.');
    await logLoad(f.name || 'manual PDF', 'manual', e.message, true);
  } finally { btn.disabled = false; }
});

$('refBtn').addEventListener('click', async ()=>{
  const f = $('refFile').files[0];
  if(!f){ toast('Choose the plant audit workbook first'); return; }
  try { await importRef(f); }
  catch(e){ console.error(e); toast('Belt reference import failed: '+e.message); }
});
$('ovBtn').addEventListener('click', async ()=>{
  const f = $('ovFile').files[0];
  if(!f){ toast('Choose the zone overrides file first'); return; }
  try { await importOverrides(f); }
  catch(e){ console.error(e); toast('Overrides failed: '+e.message); }
});

/* ---------- account search ---------- */
/* Search reaches the whole account book, always. Equipment builders, bearing
   suppliers and head offices routinely sit in another manager's zone and you still
   have to call on them. The chosen manager's own accounts sort to the top; the rest
   carry a tag naming whose they are. Do not scope this to the manager. */
function renderAccSearch(){
  $('accQ').value=''; $('accRes').innerHTML='';
  $('accHint').textContent = META ? META.counts.accounts+' accounts loaded' : 'Import contact data first';
  renderNewSummary();
}

/* ---------- New: "What would you like to do?" ----------
   One tap picks what is being made; the next step - the account - appears on
   the same screen. The date (today) and the account manager (the one last used)
   are on one line with a Change link rather than two boxes to get past. Every
   other way into this screen (the phone's + button, booking, an account's Start
   call) arrives with the choice already made, and shows it highlighted. */
const NEW_TYPE = {site: 'Site call', phone: 'Phone', teams: 'Teams', quote: 'Quote request'};   // QUOTE_TYPE is defined further down
function newMark(kind){
  $('newPick').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.new === kind));
  $('s-account').classList.remove('choosing');
  if(!kind) $('cMore').hidden = true;
}
function renderNewSummary(){
  const el = $('cSummary');
  if(!el) return;
  if(bookingMode || $('s-account').classList.contains('choosing')){ el.innerHTML = ''; return; }
  const d = $('cDate').value, today = todayISO();
  el.innerHTML = esc(d === today ? 'Today' : ddmmyyyy(d)) + ' &middot; ' + esc($('cMgr').value || 'no account manager') +
    ' <button type="button" class="lnk" id="cChange">' + ($('cMore').hidden ? 'Change' : 'Hide') + '</button>';
  $('cChange').addEventListener('click', () => { $('cMore').hidden = !$('cMore').hidden; renderNewSummary(); });
}
$('newPick').addEventListener('click', e => {
  const b = e.target.closest('button[data-new]'); if(!b) return;
  const kind = b.dataset.new;
  if(kind === 'task'){
    $('s-account').classList.add('choosing');
    go('home');
    openTask(null);
    return;
  }
  if(kind === 'book'){ startBooking(); return; }
  if(!ACCOUNTS.length) toast('No contact database - manual account entry only');
  bookingMode = false;
  $('cType').value = NEW_TYPE[kind];
  syncQuoteMode();
  newMark(kind);
  renderAccSearch();
  setTimeout(() => { try { $('accQ').focus(); } catch(_){} }, 50);
});
$('cDate').addEventListener('change', renderNewSummary);
$('cMgr').addEventListener('change', renderNewSummary);
$('cMgr').addEventListener('change', ()=>{ localStorage.setItem(LS('mgr'), $('cMgr').value); updateMgrHint(); });
$('accQ').addEventListener('input', ()=>{
  const q = $('accQ').value.trim().toLowerCase();
  const res = $('accRes'); res.innerHTML='';
  if(!ACCOUNTS.length || !q){
    $('accHint').textContent = META ? META.counts.accounts+' accounts loaded' : '';
    return;
  }
  const mgr = $('cMgr').value;
  const hits = ACCOUNTS.filter(a => a.a.toLowerCase().includes(q) ||
    (a.sub && a.sub.toLowerCase().includes(q)));
  hits.sort((a,b)=>{
    const am = a.mgr===mgr, bm = b.mgr===mgr;
    if(am!==bm) return am?-1:1;
    return (FOCUS_RANK[a.foc] ?? 3) - (FOCUS_RANK[b.foc] ?? 3) || a.a.length - b.a.length;
  });
  $('accHint').textContent = hits.length+' match'+(hits.length===1?'':'es')+
    (hits.length>12 ? ' - showing 12' : '');
  hits.slice(0,12).forEach(a=>{
    const b = document.createElement('button');
    const meta = [a.sub, zoneName(a.z), a.foc, a.c.length+' contact'+(a.c.length===1?'':'s')]
      .filter(Boolean).map(esc).join(' &middot; ');
    b.innerHTML = '<span class="fd '+FOC_CLS[a.foc]+'"></span>' + esc(a.a) +
      (a.mgr===mgr ? '' : '<span class="tag">'+esc(a.mgr||'no manager')+'</span>') +
      '<div class="mt">'+meta+'</div>';
    b.addEventListener('click', ()=>chooseAccount(a.a));
    res.appendChild(b);
  });
});
const FOC_CLS = {'High':'high','Medium':'med','Low':'low','No Focus':'none'};
$('accManualGo').addEventListener('click', ()=>{
  const m = $('accManual').value.trim();
  if(!m){ toast('Enter an account name'); return; }
  if(bookingMode){
    bookingMode = false;
    toast('Only accounts from the CRM export can be booked - log it as a call instead');
    return;
  }
  chooseAccount(m, true);
});

let pendingAcct = null;
/* The account and contacts screens are the same two screens either way - the
   same search, the same manual-account fallback, the same contact list. Only the
   fields differ, so they are shown and hidden rather than duplicated into a
   parallel pair of screens that would then drift. */
const QUOTE_TYPE = 'Quote request';
/* The mode is whatever the call type says. It used to be a separate home tile,
   which meant two ways to start the same two screens and a second Resume beside
   the first. One entry point, and the type picker decides what gets made. */
function syncQuoteMode(){
  quoteMode = ($('cType') && $('cType').value === QUOTE_TYPE);
  applyQuoteMode();
}
function applyQuoteMode(){
  const q = quoteMode;
  // cTypeRow stays: it is the control that sets the mode
  [['cReqByRow', q], ['cRefRow', q]].forEach(([id, show]) => {
    const el = $(id); if(el) el.hidden = !show;
  });
  const dl = $('cDateLbl');
  if(dl) dl.textContent = q ? 'Date raised' : 'Date';
  const t = $('acctHead');
  if(t) t.textContent = q ? 'Quote request details' : 'Call details';
  const ct = $('ctHead');
  if(ct) ct.textContent = q ? 'Who rang?' : 'Who did you see?';
  const ob = $('openCall');
  if(ob) ob.textContent = q ? 'Start the quote request' : 'Start the call';
  TITLES.account[0] = q ? 'Quote request' : 'New call';
  TITLES.contacts[0] = q ? 'Quote request' : 'New call';
}
function chooseAccount(name, manual){
  if(bookingMode){ bookVisitFor(name).catch(reportErr); return; }
  const acc = manual ? null : (ACC_BY_NAME.get(name) || null);
  pendingAcct = {name, manual: !!manual, acc};
  $('ctAcc').textContent = name;
  $('ctQ').value=''; $('ncName').value=''; $('ncRole').value=''; $('ncEmail').value=''; $('ncMob').value='';
  $('cSite').value=''; $('ctErr').classList.remove('show');
  const sub = $('ctSub');
  if(sub) sub.textContent = acc
    ? [acc.sub, zoneName(acc.z), acc.foc, acc.cad].filter(Boolean).join(' \u00b7 ')
    : 'Not in the CRM export - will be flagged as needing adding to Dynamics';
  const list = $('ctList');
  const cs = acc ? acc.c : [];
  if(!cs.length){
    list.innerHTML = '<p class="empty">No contacts on file. Add one below.</p>';
  } else {
    list.innerHTML = cs.map((c,i)=>{
      const email = c.e && c.e.length ? c.e[0] : '';
      const meta = [c.t || c.r || 'Role not recorded', email, c.p].filter(Boolean).map(esc).join(' &middot; ');
      const bits = [];
      if(!email) bits.push('no email');
      if(c.pk === 'none') bits.push('no mobile');
      if(c.pk === 'check') bits.push('check number');
      const tag = bits.length ? '<span class="tag">'+bits.join(', ')+'</span>' : '';
      return '<label class="pick"><input type="checkbox" data-i="'+i+'">'+
        '<span><div class="nm">'+esc(c.n)+tag+'</div><div class="mt">'+meta+'</div></span></label>';
    }).join('');
  }
  go('contacts');
}
$('cType').addEventListener('change', syncQuoteMode);
$('ctQ').addEventListener('input', ()=>{
  const q = $('ctQ').value.trim().toLowerCase();
  $('ctList').querySelectorAll('.pick').forEach(r=>{
    const box = r.querySelector('input');
    const txt = r.textContent.toLowerCase();
    r.style.display = (!q || txt.includes(q) || box.checked) ? 'flex' : 'none';
  });
});
$('openCall').addEventListener('click', async ()=>{
  const cs = pendingAcct.acc ? pendingAcct.acc.c : [];
  const chosen = [];
  $('ctList').querySelectorAll('input:checked').forEach(b=>{
    const c = cs[+b.dataset.i];
    if(c) chosen.push({name:c.n, role:c.t||c.r, email:(c.e&&c.e[0])||'', mobile:c.p, crm:true, cid:c.id});
  });
  const nn = $('ncName').value.trim();
  if(nn) chosen.push({name:nn, role:$('ncRole').value.trim(), email:$('ncEmail').value.trim(), mobile:$('ncMob').value.trim(), crm:false});
  if(!chosen.length){ $('ctErr').classList.add('show'); return; }

  const acc = pendingAcct.acc;
  const site = $('cSite').value.trim();

  // read off the control rather than the flag, so the two can never disagree
  if($('cType').value === QUOTE_TYPE){
    /* No offerExistingCall and no bookUnplanned. A quote request is not a visit:
       it must not merge into a call already open on this account, and it must
       not put an appointment in the plan or touch the account's cadence. */
    call = {
      id: 'q'+Date.now(),
      rectype: QUOTE,
      type: QUOTE_TYPE,
      date: ddmmyyyy($('cDate').value),
      mgr: $('cMgr').value,
      customer: pendingAcct.name,
      manualAccount: pendingAcct.manual,
      zone: acc ? acc.z : '',
      suburb: acc ? acc.sub : '',
      focus: acc ? acc.foc : '',
      site: site,
      reqby: $('cReqBy').value.trim(),
      ref: $('cRef').value.trim(),
      contacts: chosen,
      entries: [],
      loose: [],
      status: 'in progress',
      when: Date.parse($('cDate').value) || Date.now(),
      closed: false,
      updated: Date.now()
    };
    quoteMode = false;
    await saveCall();
    go('dash');
    toast('Quote request started');
    return;
  }

  const reuse = await offerExistingCall(pendingAcct.name, $('cDate').value, chosen, site);
  if(reuse){
    call = reuse;
    await saveCall();
    go('dash');
    toast('Continuing the call from ' + reuse.date);
    return;
  }
  call = {
    id: 'c'+Date.now(),
    date: ddmmyyyy($('cDate').value),
    type: $('cType').value,
    mgr: $('cMgr').value,
    customer: pendingAcct.name,
    manualAccount: pendingAcct.manual,
    zone: acc ? acc.z : '',
    suburb: acc ? acc.sub : '',
    focus: acc ? acc.foc : '',
    site: $('cSite').value.trim(),
    contacts: chosen,
    entries: [],
    loose: [],
    status: 'in progress',
    when: Date.parse($('cDate').value) || Date.now(),
    closed: false,
    updated: Date.now()
  };
  await saveCall();
  await bookUnplanned(call, acc);
  const noMob = chosen.filter(c=>!c.mobile).map(c=>c.name);
  const noEm = chosen.filter(c=>!c.email).map(c=>c.name);
  go('dash');
  if(noMob.length || noEm.length){
    let m = [];
    if(noEm.length) m.push('no email: '+noEm.join(', '));
    if(noMob.length) m.push('no mobile: '+noMob.join(', '));
    toast(m.join(' | '));
  }
});

/* ---------- dashboard ---------- */
function renderDash(){
  if(!call) return go('home');
  const c = call;
  renderDashTasks();
  const onDoc = c.contacts.filter(docContact).length;
  $('dashStat').innerHTML =
    '<b>'+esc(c.customer)+'</b><br>'+esc(c.date)+' &middot; '+esc(c.type)+' &middot; '+esc(c.mgr)+
    (c.site?'<br>'+esc(c.site):'')+
    '<br>'+c.contacts.map(x=>esc(x.name)+(x.crm?'':' <span class="tag">not in CRM</span>')).join(', ')+
    '<br><span class="hint">'+onDoc+' of '+c.contacts.length+
    ' on customer documents &middot; tap to change</span>';
  const n = t => c.entries.filter(e=>e.type===t).length;
  $('cntBelt').textContent = n('belt')+' logged';
  $('cntProj').textContent = n('project')+' logged';
  $('cntNote').textContent = n('note')+' logged';
  $('cntHealth').textContent = n('health')+' logged';

  /* A quote request is the belt and whatever customer service needs told. There
     is no visit, so project discovery and the health check are not offered. */
  const q = isQuote(c);
  ['project','health'].forEach(k => {
    const b = document.querySelector('#s-dash [data-go="'+k+'"]');
    if(b) b.hidden = q;
  });
  const addHead = $('dashAddHead');
  if(addHead) addHead.textContent = q ? 'Add to request' : 'Add to call';
  const logHead = $('dashLogHead');
  if(logHead) logHead.textContent = q ? 'On this request' : 'Call log';
  const looseHead = $('dashLooseHead');
  if(looseHead) looseHead.textContent = q ? 'Photos from the customer' : 'Loose photos';
  /* Before the early return below, or a call with nothing logged yet would show
     no summary line at all. The pickers themselves are rendered when the sheet
     opens, not here. */
  renderOutSummary();
  renderVisitSummary();

  renderLoose();

  const el = $('logList');
  if(!c.entries.length){ el.innerHTML = '<p class="empty">Nothing logged yet.</p>'; return; }
  el.innerHTML = c.entries.map((e,i)=>{
    let head='', body='';
    const line = parts => parts.filter(Boolean).map(esc).join(' &middot; ');
    if(e.type==='belt'){ head='Belt - '+e.asset; body=line([e.beltdesc,e.width?e.width+' mm':'',e.beltmat,e.rodmat,e.retrofit?'retrofit '+e.retrofit:'',e.sprocket]); }
    if(e.type==='project'){ head='Project - '+e.project; body=line([e.status,e.next,e.target]); }
    if(e.type==='note'){ head='Note - '+e.topic; body=esc(e.text); }
    if(e.type==='health'){ head='Health - '+(e.asset||'unspecified'); body=line([e.fault,e.severity]); }
    /* A comment is the thing most worth knowing is there, and it would otherwise
       be invisible on the dashboard until the file was compiled. */
    if(e.comment) body += (body ? '<br>' : '') + '<b>' + esc(e.comment.slice(0,120)) +
      (e.comment.length > 120 ? '\u2026' : '') + '</b>';
    const ph = e.photos||[];
    /* Tapping a photo used to go straight to "Remove this photo?". Checking
       whether a picture is on the right conveyor is the commonest reason to
       touch it, and being asked to delete it instead is the wrong answer to the
       wrong question. The photo opens; the cross deletes. */
    const th = ph.map((p,j)=>'<span class="thumb"><img src="'+photoSrc(p)+
      '" data-view="'+i+':'+j+'" alt="Photo '+(j+1)+'">'+
      '<button class="thx" data-rm="'+i+':'+j+'" title="Delete this photo" '+
      'aria-label="Delete photo '+(j+1)+'">&times;</button></span>').join('');
    const gone = e.detached
      ? '<p class="meta"><span class="tag">'+e.detached.n+' photo'+(e.detached.n===1?'':'s')+
        ' sent '+new Date(e.detached.at).toLocaleDateString()+', dropped from this phone</span></p>' : '';
    /* Tap the card to open it; everything else is behind the ⋯ (v83). It used to
       carry a row of camera, photos, edit and bin buttons, bin and all, on every
       entry. The photos stay on the card, because seeing them is the point. */
    const phn = ph.length ? ph.length + ' photo' + (ph.length===1?'':'s') : '';
    return '<div class="card entry"><div class="ehd">'+
      '<button type="button" class="eopen" data-edit="'+i+'"><span class="t">'+esc(head)+'</span>'+
        '<span class="meta">'+[body, phn].filter(Boolean).join(' &middot; ')+'</span></button>'+
      '<button type="button" class="emore" data-emenu="'+i+'" aria-label="More for '+esc(head)+'">&#8943;</button>'+
      '</div>'+ gone +
      (th?'<div class="thumbs">'+th+'</div>':'')+
      '</div>';
  }).join('');
  el.querySelectorAll('[data-emenu]').forEach(b=>b.addEventListener('click', ()=>openEntryMenu(+b.dataset.emenu)));
  el.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click', ()=>openLogged(+b.dataset.edit)));
  el.querySelectorAll('[data-view]').forEach(img=>img.addEventListener('click', ()=>{
    const p = img.dataset.view.split(':').map(Number);
    openPhoto(call.entries[p[0]].photos, p[1],
      (call.entries[p[0]].asset || call.entries[p[0]].project || 'Entry') + ' \u2014 photo');
  }));
  el.querySelectorAll('[data-rm]').forEach(b=>b.addEventListener('click', async ev=>{
    ev.stopPropagation();
    const p = b.dataset.rm.split(':').map(Number);
    if(!confirm('Delete this photo?')) return;
    releasePhoto(call.entries[p[0]].photos[p[1]]);
    call.entries[p[0]].photos.splice(p[1],1); await saveCall(); renderDash();
  }));
}
function entryHead(e){
  if(e.type==='belt') return 'Belt - ' + e.asset;
  if(e.type==='project') return 'Project - ' + e.project;
  if(e.type==='note') return 'Note - ' + e.topic;
  if(e.type==='health') return 'Health - ' + (e.asset || 'unspecified');
  return 'Entry';
}
function openEntryMenu(i){
  const e = call && call.entries[i];
  if(!e) return;
  const n = (e.photos || []).length;
  openCardMenu(entryHead(e), n ? n + ' photo' + (n===1?'':'s') : 'No photos', [
    {label: 'Take a photo', icon: 'camera', run: () => { photoTarget = i; $('camInput').value=''; $('camInput').click(); }},
    {label: 'Add from photos', icon: 'image', run: () => { photoTarget = i; $('galInput').value=''; $('galInput').click(); }},
    {label: 'Duplicate', icon: 'copy', run: () => openLogged(i, true)},
    {label: 'Delete', icon: 'trash', danger: true, run: () => deleteEntry(i)}
  ]);
}
async function deleteEntry(i){
  const e = call && call.entries[i];
  if(!e) return;
  const n = (e.photos || []).length;
  if(!confirm('Delete ' + entryHead(e) + (n ? ' and its ' + n + ' photo' + (n===1?'':'s') : '') + '?\n\nThis cannot be undone.')) return;
  (e.photos||[]).forEach(releasePhoto);
  call.entries.splice(i,1); await saveCall(); renderDash();
}
/* Open an entry in its form. With copy, the form opens filled from it but cut
   loose: Done adds a new entry and the original is untouched. Photos are not
   copied - they belong to the thing that was photographed. A project's name is
   cleared, because one project logged twice in a visit is what the project form
   exists to stop. */
function openLogged(i, copy){
  const e = call && call.entries[i];
  if(!e) return;
  editingIdx = i;
  if(e.type==='belt'){
    resetBelt(); editingIdx = i;      // resetBelt clears it, so set it back
    fillBeltFromEntry(e);
    beltFold(false);                  // a logged belt opens folded, each part summed up in a line
  } else if(e.type==='note'){
    $('nTopic').value = e.topic || ''; $('nText').value = e.text || '';
    $('nErr').classList.remove('show');
  } else if(e.type==='health'){
    resetHealth(); editingIdx = i;
    $('hAsset').value = e.asset || ''; $('hFault').value = e.fault || '';
    $('hAction').value = e.action || ''; $('hComment').value = e.comment || '';
    const opt = Array.from($('hType').options).find(o => o.value === e.htype);
    if(!opt && e.htype){ const o=document.createElement('option'); o.value=o.textContent=e.htype; $('hType').appendChild(o); }
    if(e.htype) $('hType').value = e.htype;
    hSevVal = e.severity || '';
    document.querySelectorAll('#hSev button').forEach(x=>x.classList.toggle('on', x.dataset.v===hSevVal));
    /* The fault library fields ride along untouched, so editing the wording
       does not strip the priority, risks or the link to the belt entry. */
    healthExtra = {};
    ['faultId','faultCode','libVersion','category','conditions','what','leads',
     'priority','thresholds','source','owner','due','refImages','beltRef','beltSeries',
     'risks','benefit'].forEach(k => { if(e[k] !== undefined) healthExtra[k] = e[k]; });
  } else if(e.type==='project'){
    $('pName').value = e.project || ''; $('pStat').value = e.status || '';
    $('pNext').value = e.next || ''; $('pTarg').value = e.target || '';
    $('pOwner').value = e.owner || ''; $('pNotes').value = e.notes || '';
    editingProject = {key: projKey(e.project), inThisCall: true, fromStatus: e.fromStatus || ''};
    editingIdx = null;                // project replaces through its own path
    if(copy){ editingProject = null; $('pName').value = ''; }
    $('pErr').classList.remove('show');
  } else return;
  if(copy) editingIdx = null;
  go(e.type);
  toast(copy ? 'A copy \u2014 change what differs, then Done. Photos are not copied.' : 'Editing \u2014 tap Done to save');
}

/* ---------- full-screen search (v84) ----------
   No permanent search boxes. An icon opens this and the searching happens
   here; whoever opens it supplies what is searched and what a result does. */
let fsOpts = null, fsSeq = 0;
function openSearch(opts){
  fsOpts = opts;
  $('fsQ').placeholder = opts.placeholder || 'Search';
  $('fsQ').value = opts.value || '';
  runSearch();
  const d = $('srchdlg');
  if(d.showModal) d.showModal(); else d.setAttribute('open','');
  pushDialog('srchdlg');
  $('fsQ').focus();
}
async function runSearch(){
  if(!fsOpts) return;
  // a slow search must not paint over a newer one
  const n = ++fsSeq, q = $('fsQ').value.trim();
  const el = document.createElement('div'), hint = {textContent: ''};
  try { await fsOpts.render(q, el, hint); } catch(e){ console.error('search', e); }
  if(n !== fsSeq) return;
  $('fsRes').replaceChildren(...el.childNodes);
  $('fsHint').textContent = hint.textContent;
}
function closeSearch(){
  const d = $('srchdlg');
  if(d.close) d.close(); else d.removeAttribute('open');
}
$('fsClose').innerHTML = icon('close');
$('fsClose').addEventListener('click', () => {
  if(history.state && history.state.dialog === 'srchdlg') history.back();
  else closeSearch();
});
$('fsQ').addEventListener('input', runSearch);

/* A ⋯ menu for any card: a title, a line under it, then the actions. It uses
   the visit menu's sheet. Delete goes last, set apart, in the warning colour. */
function openCardMenu(title, sub, actions){
  $('vmName').textContent = title;
  $('vmWhen').textContent = sub || '';
  const body = $('vmBody');
  body.innerHTML = '<div class="vmacts">' + actions.map((a, k) =>
    '<button type="button" data-cm="' + k + '"' + (a.danger ? ' class="danger"' : '') + '>' +
      (a.icon ? icon(a.icon) : '') + esc(a.label) + '</button>').join('') + '</div>';
  /* closed first, synchronously in the tap: the camera and photo pickers only
     open from inside a user's tap */
  body.querySelectorAll('[data-cm]').forEach(b => b.addEventListener('click', () => {
    closeVisitMenu();
    actions[+b.dataset.cm].run();
  }));
  pushDialog('vmdlg');
  const dlg = $('vmdlg');
  if(dlg.showModal) dlg.showModal(); else dlg.setAttribute('open','');
}
function renderLoose(){
  const el = $('looseWrap');
  if(!el || !call) return;
  const ph = call.loose || [];
  const th = ph.map((p,j)=>'<span class="thumb"><img src="'+photoSrc(p)+
    '" data-lview="'+j+'" alt="Photo '+(j+1)+'">'+
    '<button class="thx" data-lrm="'+j+'" title="Delete this photo" '+
    'aria-label="Delete photo '+(j+1)+'">&times;</button></span>').join('');
  const gone = call.looseDetached
    ? '<p class="meta"><span class="tag">'+call.looseDetached.n+' photo'+(call.looseDetached.n===1?'':'s')+
      ' sent '+new Date(call.looseDetached.at).toLocaleDateString()+', dropped from this phone</span></p>' : '';
  el.innerHTML = '<div class="card"><div class="hd"><span class="t">Not tied to an entry</span></div>'+
    '<p class="meta">These come out at the end of the notes, after the health check.</p>'+ gone +
    (th?'<div class="thumbs">'+th+'</div>':'')+
    '<div class="cardbar">'+
    '<button id="looseCam" title="Take a photo" aria-label="Take a photo">'+icon('camera')+'</button>'+
    '<button id="looseGal" title="Add from photos" aria-label="Add from photos">'+icon('image')+'</button>'+
    '<span class="phc">'+(ph.length? ph.length+' photo'+(ph.length===1?'':'s') : 'no photos')+'</span></div></div>';
  $('looseCam').addEventListener('click', ()=>{ photoTarget='loose'; $('camInput').value=''; $('camInput').click(); });
  $('looseGal').addEventListener('click', ()=>{ photoTarget='loose'; $('galInput').value=''; $('galInput').click(); });
  el.querySelectorAll('[data-lview]').forEach(img=>img.addEventListener('click', ()=>{
    openPhoto(call.loose, +img.dataset.lview, 'Loose photo');
  }));
  el.querySelectorAll('[data-lrm]').forEach(b=>b.addEventListener('click', async ev=>{
    ev.stopPropagation();
    if(!confirm('Delete this photo?')) return;
    releasePhoto(call.loose[+b.dataset.lrm]);
    call.loose.splice(+b.dataset.lrm,1); await saveCall(); renderLoose();
  }));
}

/* ---------- getting photos off the phone and into the gallery ----------
   A photo taken through the app's camera button never reaches the gallery.
   That is Android, not a bug here: a file input with capture hands the image
   straight to the page and nothing is written to the camera roll. No web API
   can write to it either - there is no permission a page can ask for.

   So the photos are handed over as downloads instead. They land in Downloads,
   which the gallery indexes on most phones, and they are named after the call
   and the asset rather than IMG_0431 so they mean something months later.

   The reliable route, if you want them in the gallery for certain, is still to
   use the phone's own camera app and add them from the gallery afterwards. This
   is the insurance policy for the ones already taken in here. */
function photoFileName(c, entry, n, total){
  const clean = v => String(v||'').replace(/[^A-Za-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,28);
  const date = String(c.date||'').replace(/\//g,'-');
  const what = entry ? clean(entry.asset || entry.project || entry.topic || entry.type) : 'loose';
  return [clean(c.customer), date, what, String(n).padStart(2,'0')].filter(Boolean).join('_') + '.jpg';
}
async function savePhotosToPhone(){
  if(!call) return;
  const jobs = [];
  (call.entries||[]).forEach(e => (e.photos||[]).forEach((p,j) =>
    jobs.push([p, photoFileName(call, e, j+1)])));
  (call.loose||[]).forEach((p,j) => jobs.push([p, photoFileName(call, null, j+1)]));
  if(!jobs.length){ toast('No photos on this call yet'); return; }
  if(!confirm(jobs.length + ' photo' + (jobs.length===1?'':'s') + ' will be saved to this phone.\n\n' +
     'They go to Downloads, named after the call and the asset. Your gallery picks that ' +
     'folder up on most phones. Chrome may ask once whether to allow multiple downloads.')) return;

  let done = 0;
  for(const [p, name] of jobs){
    try {
      const blob = isBlobPhoto(p) ? p : dataURLToBlob(String(p));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(url), 8000);
      done++;
      // a gap between each: Chrome drops downloads fired in a tight loop
      await new Promise(r => setTimeout(r, 220));
    } catch(e){ console.error('photo save', name, e); }
  }
  toast(done + ' of ' + jobs.length + ' photo' + (jobs.length===1?'':'s') + ' saved to Downloads');
}
$('savePhotos').addEventListener('click', ()=>savePhotosToPhone().catch(reportErr));

/* ---------- looking at a photo ----------
   Full screen, with next and previous, because the question being asked is
   almost always "is this the right conveyor" and that cannot be answered from a
   66px square. It sits over everything and closes on the back gesture, the same
   way the manual page viewer does. */
let photoSet = [], photoAt = 0;
/* ---------- zoom ----------
   Two conveyors in the same plant look the same at thumbnail size. Checking a
   photo used to mean leaving the app for the gallery and coming back, which is
   the going-backwards-and-forwards that made attaching photos tedious.

   Pinch with two fingers, or double-tap to jump to 2.5x and again to come back.
   Panning is a one-finger drag once zoomed; below 1x nothing moves, so a
   single finger still does nothing surprising at rest. Transform only - the
   image itself is never re-encoded, so this costs nothing and is instant. */
let pvZoom = 1, pvX = 0, pvY = 0, pvOnRemove = null;
const PV_MAX = 6, PV_DBL = 2.5;

function pvApply(){
  const img = $('pvImg');
  img.style.transform = 'translate('+pvX+'px,'+pvY+'px) scale('+pvZoom+')';
  img.style.cursor = pvZoom > 1 ? 'grab' : 'zoom-in';
  const r = $('pvReset');
  if(r) r.hidden = pvZoom <= 1.01;
}
function pvSetZoom(z, cx, cy){
  const img = $('pvImg'), prev = pvZoom;
  pvZoom = Math.max(1, Math.min(PV_MAX, z));
  if(pvZoom <= 1.01){ pvZoom = 1; pvX = 0; pvY = 0; pvApply(); return; }
  if(cx != null){
    /* Keep the point under the fingers where it is, rather than zooming to the
       middle - otherwise the detail you are trying to look at slides away. */
    const b = img.getBoundingClientRect();
    const ox = cx - (b.left + b.width/2), oy = cy - (b.top + b.height/2);
    const k = pvZoom / prev;
    pvX = ox - (ox - pvX) * k;
    pvY = oy - (oy - pvY) * k;
  }
  pvApply();
}
function pvReset(){ pvZoom = 1; pvX = 0; pvY = 0; pvApply(); }

function openPhoto(list, i, title, opts){
  photoSet = list || []; photoAt = i || 0;
  if(!photoSet.length) return;
  pvOnRemove = (opts && typeof opts.onRemove === 'function') ? opts.onRemove : null;
  $('pvTtl').textContent = title || 'Photo';
  if($('pvDel')) $('pvDel').hidden = !pvOnRemove;
  paintPhoto();
  $('pview').classList.add('on');
  try { history.pushState({screen: screen, dialog:'pview'}, '', location.href); } catch(e){}
}
function paintPhoto(){
  const p = photoSet[photoAt];
  if(!p) return closePhoto();
  $('pvImg').src = photoSrc(p);
  pvReset();                      // a new photo always opens unzoomed
  $('pvSub').textContent = (photoAt+1) + ' of ' + photoSet.length;
  $('pvPrev').disabled = photoAt <= 0;
  $('pvNext').disabled = photoAt >= photoSet.length - 1;
}
function closePhoto(){
  if(!$('pview').classList.contains('on')) return;
  $('pview').classList.remove('on');
  $('pvImg').removeAttribute('src');
  photoSet = []; pvOnRemove = null; pvReset();
}
$('pvPrev').addEventListener('click', ()=>{ if(photoAt > 0){ photoAt--; paintPhoto(); } });
$('pvNext').addEventListener('click', ()=>{ if(photoAt < photoSet.length-1){ photoAt++; paintPhoto(); } });
if($('pvReset')) $('pvReset').addEventListener('click', pvReset);
if($('pvDel')) $('pvDel').addEventListener('click', ()=>{
  if(!pvOnRemove) return;
  if(!confirm('Remove this photo?')) return;
  const at = photoAt;
  pvOnRemove(at);
  photoSet.splice(at, 1);
  if(!photoSet.length){ closePhoto(); return; }
  photoAt = Math.min(at, photoSet.length - 1);
  paintPhoto();
});

/* ---------- gestures on the image ---------- */
(function(){
  const body = $('pvbody') || document.querySelector('.pvbody');
  const img = $('pvImg');
  if(!body || !img) return;
  let pts = new Map(), startDist = 0, startZoom = 1, panFrom = null, lastTap = 0;

  const dist = a => { const v = [...a.values()];
    return Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y); };
  const mid  = a => { const v = [...a.values()];
    return {x:(v[0].x + v[1].x)/2, y:(v[0].y + v[1].y)/2}; };

  body.addEventListener('pointerdown', e => {
    pts.set(e.pointerId, {x:e.clientX, y:e.clientY});
    if(pts.size === 2){ startDist = dist(pts); startZoom = pvZoom; panFrom = null; }
    else if(pts.size === 1 && pvZoom > 1){ panFrom = {x:e.clientX - pvX, y:e.clientY - pvY}; }
    try { body.setPointerCapture(e.pointerId); } catch(err){}
  });
  body.addEventListener('pointermove', e => {
    if(!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, {x:e.clientX, y:e.clientY});
    if(pts.size === 2 && startDist > 0){
      const m = mid(pts);
      pvSetZoom(startZoom * (dist(pts)/startDist), m.x, m.y);
      e.preventDefault();
    } else if(pts.size === 1 && panFrom && pvZoom > 1){
      pvX = e.clientX - panFrom.x; pvY = e.clientY - panFrom.y;
      pvApply();
      e.preventDefault();
    }
  });
  const up = e => {
    pts.delete(e.pointerId);
    if(pts.size < 2) startDist = 0;
    if(pts.size === 0) panFrom = null;
  };
  body.addEventListener('pointerup', up);
  body.addEventListener('pointercancel', up);

  // double tap, and double click for the desktop
  body.addEventListener('click', e => {
    const now = Date.now();
    if(now - lastTap < 300){
      lastTap = 0;
      if(pvZoom > 1.01) pvReset(); else pvSetZoom(PV_DBL, e.clientX, e.clientY);
    } else lastTap = now;
  });
  // a mouse wheel zooms on the desktop, where there is nothing to pinch with
  body.addEventListener('wheel', e => {
    if(!$('pview').classList.contains('on')) return;
    e.preventDefault();
    pvSetZoom(pvZoom * (e.deltaY < 0 ? 1.15 : 1/1.15), e.clientX, e.clientY);
  }, {passive:false});
})();
$('pvClose').addEventListener('click', ()=>{
  if(history.state && history.state.dialog === 'pview') history.back(); else closePhoto();
});
/* Marking a call done. This used to be a button on the dashboard, which put it
   next to the output controls and made it read like an output option. It is not:
   compiled means a document was produced, done means the call is finished, and a
   call can be either without the other. It now lives on the report row, which is
   where you look when you are tidying up rather than working.

   It is the only thing that closes out the matching visit in the plan, so it
   cannot simply be deleted. */
/* Deleting a call for good. Shared by the bin on the home screen and the bin on
   a report row, so the two can never drift apart.

   The confirm comes first. The home-screen version released the photo blob URLs
   before asking, so cancelling left the call intact but its images broken until
   the next reload.

   Local only. A call that has already gone to the sync repo still has a copy
   there, and the next pull can bring it back. Saying so in the confirm is
   cheaper than half-implementing a tombstone in the sync format. */
async function deleteCallRecord(c){
  if(!c) return false;
  const ph = c.entries.reduce((a,e)=>a+(e.photos?e.photos.length:0),0) + (c.loose?c.loose.length:0);
  if(!confirm('Delete ' + c.customer + ' on ' + c.date + '?\n\n' +
      c.entries.length + ' entr' + (c.entries.length===1?'y':'ies') + ' and ' + ph +
      ' photo' + (ph===1?'':'s') + ' will be erased. This cannot be undone.' +
      (sbUser ? '\n\nIt is also deleted from your other devices when they next sync.' : ''))) return false;
  (c.entries||[]).forEach(e => (e.photos||[]).forEach(releasePhoto));
  (c.loose||[]).forEach(releasePhoto);
  await callsDel(c.id);
  if(isQuote(c)) await loadQuotes();
  if(call && call.id === c.id) call = null;
  toast('Call deleted');
  return true;
}
async function markCallDone(c){
  if(!c) return false;
  const q = isQuote(c);
  if(!confirm((q ? 'Mark this quote request done?' : 'Mark this call done?') + '\n\n' +
      c.customer + ' on ' + c.date + '.' +
      (c.shared ? '' : ' Nothing has been produced for it yet.') +
      ' It stays saved and searchable, and drops out of ' + (q ? 'Resume request' : 'Resume') + '.')) return false;
  c.closed = true;
  if(c.status === 'in progress' || !c.status) c.status = 'done';
  if(!c.entries.length) c.noReport = true;
  await callsPut(c);
  if(q) await loadQuotes();
  await syncApptFromCall(c);
  /* The open call and the row can be the same record reached two ways, so the
     working copy is dropped rather than left pointing at a closed call. */
  if(call && call.id === c.id){ releaseAllPhotos(); call = null; }
  return true;
}
/* The menu behind the card. Contacts first with their numbers, then the actions
   that used to wrap across the foot of every card. */
function openVisitMenu(id){
  const ap = APPTS.find(x => x.id === id);
  if(!ap) return;
  const a = ACC_BY_NAME.get(ap.acct);
  const cts = a ? (ap.contacts||[]).map(i => a.c[i]).filter(Boolean) : [];
  const settled = apSettled(ap);
  const eid = esc(ap.id);

  let html = '';
  if(cts.length){
    html += '<div class="vmsec">Contacts</div>';
    html += cts.map((c, i) => {
      const num = c.p ? '<span class="vmnum">'+esc(c.p)+'</span>'
                      : '<span class="vmnone">no number on file</span>';
      return '<div class="vmrow">'+
        '<div class="vmwho"><b>'+esc(c.n)+'</b>'+(c.t||c.r ? '<span class="vmrole">'+esc(c.t||c.r)+'</span>' : '')+num+'</div>'+
        (c.p ? '<button class="vmi" data-vcopy="'+i+'" aria-label="Copy number">'+icon('copy')+'</button>' : '')+
        '<button class="vmi" data-vsave="'+i+'" aria-label="Save to contacts">'+icon('person')+'</button>'+
      '</div>';
    }).join('');
    if(cts.length > 1) html += '<button class="vmall" data-vsaveall="1">Save all to contacts</button>';
  }

  html += '<div class="vmsec">Visit</div><div class="vmacts">';
  if(settled){
    // a finished visit that produced a call can still open it
    if(ap.callId) html += '<button class="go" data-open="'+eid+'">Open the call</button>';
    html += '<button data-reopen="'+eid+'">Reopen</button>';
  } else {
    html += '<button class="go" data-open="'+eid+'">'+(ap.callId ? 'Open the call' : 'Start the call')+'</button>'+
            '<button data-prep="'+eid+'">'+(ap.brief && ap.brief.text ? 'Brief' : 'Prepare')+'</button>'+
            '<button data-closeout="'+eid+'">Close out</button>'+
            '<button data-move="'+eid+'">Move</button>'+
            '<button class="quiet" data-missed="'+eid+'">Missed</button>'+
            '<button class="quiet" data-cancel="'+eid+'">Cancel</button>';
  }
  html += '</div>';

  $('vmName').textContent = ap.acct;
  $('vmWhen').textContent = dayLabel(ap.date) + ' ' + ap.start + ' \u00b7 ' + ap.type;
  const body = $('vmBody');
  body.innerHTML = html;

  body.querySelectorAll('[data-vcopy]').forEach(b => b.addEventListener('click', ()=>{
    const c = cts[+b.dataset.vcopy];
    if(c && c.p) copyText(c.p, 'Number');
  }));
  body.querySelectorAll('[data-vsave]').forEach(b => b.addEventListener('click', ()=>{
    const c = cts[+b.dataset.vsave];
    if(c) saveContacts([c], ap.acct, c.n).catch(reportErr);
  }));
  body.querySelectorAll('[data-vsaveall]').forEach(b => b.addEventListener('click', ()=>{
    saveContacts(cts, ap.acct, ap.acct).catch(reportErr);
  }));
  /* The visit actions each navigate or redraw, so the menu closes first rather
     than being left open over a screen that has moved on; whatever they open
     then takes over the menu's history entry (v103). */
  body.querySelectorAll('[data-open],[data-closeout],[data-move],[data-missed],[data-cancel],[data-reopen]')
    .forEach(b => b.addEventListener('click', closeVisitMenu));
  wireVisitCards(body);
  body.querySelectorAll('[data-prep]').forEach(b => b.addEventListener('click', () => {
    closeVisitMenu();
    prepareBrief(ap.acct, ap.id).catch(reportErr);
  }));

  pushDialog('vmdlg');
  const dlg = $('vmdlg');
  if(dlg.showModal) dlg.showModal(); else dlg.setAttribute('open','');
}
function closeVisitMenu(){
  const dlg = $('vmdlg');
  if(dlg.close) dlg.close(); else dlg.removeAttribute('open');
}
$('vmClose').addEventListener('click', closeVisitMenu);

/* The output block lives at the top of the dashboard now; the pickers are in the
   sheet it opens. There is no compile screen to navigate to. */
function openOutDlg(){
  if(!call) return;
  renderCompileStat();
  renderOutControls();
  $('outSub').textContent = call.customer + ' \u2014 ' + call.date;
  pushDialog('outdlg');
  const dlg = $('outdlg');
  if(dlg.showModal) dlg.showModal(); else dlg.setAttribute('open','');
}
function closeOutDlg(){
  const dlg = $('outdlg');
  if(dlg.close) dlg.close(); else dlg.removeAttribute('open');
}
$('doOutput').addEventListener('click', openOutDlg);
$('outCancel').addEventListener('click', closeOutDlg);
$('outGo').addEventListener('click', ()=>{
  if(!call) return;
  closeOutDlg();
  sendNotes(currentOutScope(), $('outDest').value, $('outImg').value);
});
$('outScope').addEventListener('change', renderOutHint);
$('outDest').addEventListener('change', renderOutHint);
$('outImg').addEventListener('change', renderOutHint);

/* ================= entry: belt =================
   Ported from Belt Call Log v13. The fork was taken from a v8 snapshot in the
   project library, which predates the whole belt reference database and the
   form that reads it - five versions of work that never came across.

   renderChips is the planner's focus-chip renderer in this app, so the belt
   version is renderBeltChips here. Nothing else needed renaming. */

/* ---------- what you reach for most ----------
   The workbook lists everything alphabetically and carries no notion of what is common,
   so the ordering has to come from here. Every saved belt bumps a counter for each value
   picked, held against the context it was picked in: style counts sit under the series,
   material counts under series|style, and so on. Ranking then reads the specific context
   first and falls back to how often the value has been used anywhere, so a material you
   reach for constantly still floats in a series you have not logged before.
   Counts live on this phone only, alongside everything else. */
let USE = null;
const CTX_ALL = '*';

async function loadUse(){
  USE = (await kvGet('usage')) || {};
  return USE;
}
function bump(field, ctx, value){
  if(!value) return;
  USE = USE || {};
  const f = USE[field] = USE[field] || {};
  [ctx || '', CTX_ALL].forEach(k => {
    const c = f[k] = f[k] || {};
    c[value] = (c[value] || 0) + 1;
  });
}
function counts(field, ctx){
  return (USE && USE[field] && USE[field][ctx || '']) || {};
}
/* Most used first, then everything else in the workbook's alphabetical order. */
function rank(values, field, ctx){
  const here = counts(field, ctx), any = counts(field, CTX_ALL);
  const base = uniqSort(values);
  const scored = base.map((v, i) => ({v, i, n:here[v] || 0, g:any[v] || 0}));
  scored.sort((a, b) => (b.n - a.n) || (b.g - a.g) || (a.i - b.i));
  const top = scored.filter(x => x.n > 0 || x.g > 0).map(x => x.v);
  const rest = scored.filter(x => !(x.n > 0 || x.g > 0)).map(x => x.v);
  return {all: top.concat(rest), top, rest};
}
async function saveUse(){ try { await kvSet('usage', USE); } catch(e){ console.warn('usage', e); } }

/* ---------- chip groups ----------
   Same control as the rod material chips, but rebuilt whenever the cascade above them
   changes, since the valid materials and colours depend on the series and style. */
const chipSel = {};
function renderBeltChips(id, values, o){
  const el = $(id);
  if(!el) return;
  o = o || {};
  const cur = chipSel[id] || '';
  if(!values.length){
    /* An empty list still needs Other. The reference workbook carries no colours
       at all for some style and material combinations, and without this there is
       literally no way to record the colour of a belt you are standing next to -
       or for the register to carry one across. */
    el.innerHTML = '<span class="none">'+esc(o.empty || 'Nothing to choose yet')+'</span>' +
      (o.other ? '<button type="button" data-v="OTHER">Other...</button>' : '');
    if(!o.other){ chipSel[id] = ''; return; }
    el.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      const was = b.classList.contains('on');
      el.querySelectorAll('button').forEach(x => x.classList.remove('on'));
      chipSel[id] = '';
      if(!was){ b.classList.add('on'); chipSel[id] = b.dataset.v; }
      $(o.other).classList.toggle('hide', chipSel[id] !== 'OTHER');
      if(o.onPick) o.onPick();
    }));
    if(cur === 'OTHER') setChip(id, 'OTHER', o.other);
    else { chipSel[id] = ''; $(o.other).classList.add('hide'); }
    return;
  }
  const r = rank(values, o.field, o.ctx);
  el.innerHTML = r.all.map(v =>
      '<button type="button" data-v="'+esc(v)+'"'+(r.top.includes(v) ? ' class="top"' : '')+'>'+esc(v)+'</button>').join('') +
    (o.other ? '<button type="button" data-v="OTHER">Other...</button>' : '');
  el.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    const was = b.classList.contains('on');
    el.querySelectorAll('button').forEach(x => x.classList.remove('on'));
    chipSel[id] = '';
    if(!was){ b.classList.add('on'); chipSel[id] = b.dataset.v; }
    if(o.other) $(o.other).classList.toggle('hide', chipSel[id] !== 'OTHER');
    if(o.onPick) o.onPick();
  }));
  /* keep the current pick if it survived the rebuild, so changing style does not
     silently drop a material that is still valid */
  if(cur && (r.all.includes(cur) || cur === 'OTHER')) setChip(id, cur, o.other);
  else { chipSel[id] = ''; if(o.other) $(o.other).classList.add('hide'); }
}
function chipValue(id, otherId){
  const v = chipSel[id] || '';
  return (v === 'OTHER' && otherId) ? $(otherId).value.trim() : v;
}
function setChip(id, v, otherId){
  const el = $(id);
  el.querySelectorAll('button').forEach(x => x.classList.remove('on'));
  chipSel[id] = '';
  if(!v) { if(otherId) $(otherId).classList.add('hide'); return true; }
  const hit = [...el.querySelectorAll('button')].find(x => x.dataset.v === v);
  if(hit){ hit.classList.add('on'); chipSel[id] = v; if(otherId) $(otherId).classList.add('hide'); return true; }
  const other = [...el.querySelectorAll('button')].find(x => x.dataset.v === 'OTHER');
  if(other && otherId){
    other.classList.add('on'); chipSel[id] = 'OTHER';
    $(otherId).classList.remove('hide'); $(otherId).value = v;
    return true;
  }
  return false;
}
function clearChip(id, otherId){ setChip(id, '', otherId); if(otherId) $(otherId).value = ''; }

/* Chips for a dropdown with a short, known set of answers (v82). The <select>
   stays in the page, hidden, and is still the one place the value lives, so
   every reader, draft and change listener carries on using it unchanged. The
   chips only show it and set it. A value set from code - opening a saved entry,
   restoring a draft, resetting the form - repaints them, because this element's
   own value setter is wrapped; a list rebuilt from code (the account managers)
   repaints through the observer. */
const SEL_VALUE = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
const SEL_INDEX = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');
function selectChips(id){
  const sel = $(id);
  if(!sel || sel.dataset.chips) return;
  sel.dataset.chips = '1';
  const box = document.createElement('div');
  box.className = 'chips'; box.id = id + 'Chips';
  sel.after(box); sel.hidden = true;
  const paint = () => {
    const v = SEL_VALUE.get.call(sel);
    box.innerHTML = [...sel.options].filter(o => o.value !== '').map(o => {
      const on = o.value === v;
      return '<button type="button" data-v="' + esc(o.value) + '" aria-pressed="' + on + '"' + (on ? ' class="on"' : '') + '>' + esc(o.textContent) + '</button>';
    }).join('');
  };
  Object.defineProperty(sel, 'value', {configurable: true,
    get(){ return SEL_VALUE.get.call(this); }, set(v){ SEL_VALUE.set.call(this, v); paint(); }});
  Object.defineProperty(sel, 'selectedIndex', {configurable: true,
    get(){ return SEL_INDEX.get.call(this); }, set(v){ SEL_INDEX.set.call(this, v); paint(); }});
  new MutationObserver(paint).observe(sel, {childList: true, subtree: true});
  box.addEventListener('click', e => {
    const b = e.target.closest('button');
    if(!b) return;
    // tap again to clear - only where the dropdown itself allowed a blank answer
    const blank = [...sel.options].some(o => o.value === '');
    const v = (b.classList.contains('on') && blank) ? '' : b.dataset.v;
    if(v === SEL_VALUE.get.call(sel)) return;
    sel.value = v;
    sel.dispatchEvent(new Event('change', {bubbles: true}));
    sel.dispatchEvent(new Event('input', {bubbles: true}));
  });
  paint();
}
// note topic, project status, fault type, visit type and length, account manager
['nTopic', 'pStat', 'hType', 'dType', 'dDur', 'cMgr'].forEach(selectChips);

/* ---------- entry: belt ----------
   Mirrors the plant audit line entry form: the same Series > Style > Material > Colour
   cascade, the same width and frame checks off the link geometry, the same sprocket
   cascade and quantity rule, and the same flight spacing conversion. Everything is driven
   by the imported workbook, so with no reference data loaded the pickers sit empty and the
   free-text fields still carry the call. Health check stays its own entry type. */

const DEFAULT_BORE = '40 mm square';
const FALLBACK_ROD = ['ACETAL','POLYPROPYLENE','POLYETHYLENE','PK','NYLON'];

function populateSel(el, values, placeholder, withOther, field, ctx){
  if(!el) return;
  const opt = v => '<option value="'+esc(v)+'">'+esc(v)+'</option>';
  const tail = withOther ? '<option value="OTHER">Other...</option>' : '';
  const head = '<option value="">'+esc(placeholder)+'</option>';
  const list = field ? rank(values, field, ctx).all : uniqSort(values);
  el.innerHTML = head + list.map(opt).join('') + tail;
}
function keepValue(el, prev){
  if(prev && [...el.options].some(o => o.value === prev)) el.value = prev;
}
function showMsg(el, cls, html){
  el.className = html ? 'msg '+cls+' show' : 'msg';
  el.innerHTML = html || '';
}
function otherPair(sel, other){
  const sync = () => other.classList.toggle('hide', sel.value !== 'OTHER');
  sel.addEventListener('change', sync);
  return () => sel.value === 'OTHER' ? other.value.trim() : sel.value;
}

/* ---------- populate everything the workbook drives ---------- */
function buildBeltRef(){
  const warn = $('refWarn');
  if(!REF){
    showMsg(warn, 'info', 'No belt reference data loaded, so the pickers below are empty. ' +
      'The description and measurement fields still work. ' +
      '<span class="lnk" data-go="settings">Import the workbook</span>');
  } else {
    showMsg(warn, '', '');
  }
  const R = REF || {combos:[], geom:[], sprockets:[], pitch:{}, indentGroups:[],
                    materials:[], colours:[], rods:[], flightTypes:[], sideguardTypes:[]};

  populateSel($('bSeries'), R.combos.map(c=>c[0]),
    R.combos.length ? 'Select series...' : 'Import reference data', false, 'series', '');

  const mats = R.materials.length ? R.materials : uniqSort(R.combos.map(c=>c[2]));
  populateSel($('bFlMat'), mats, 'Select flight material...', false, 'flmat', '');
  populateSel($('bSgMat'), mats, 'Select sideguard material...', false, 'sgmat', '');
  populateSel($('bFlType'), R.flightTypes, 'Select flight type...', true, 'fltype', '');
  populateSel($('bSgType'), R.sideguardTypes, 'Select sideguard type...', true, 'sgtype', '');

  renderBeltChips('bRodChips', R.rods.length ? R.rods : FALLBACK_ROD,
    {field:'rod', ctx:'', other:'bRodOther', empty:'Import reference data'});

  renderMatChips();
  populateSprBores();
  populateIndent();
  updatePitch();
}
const rodValue = () => chipValue('bRodChips', 'bRodOther');
const beltMat = () => chipValue('bMatChips', 'bMatOther');
const beltColour = () => chipValue('bColourChips', 'bColourOther');

/* Material depends on series and style, colour on all three, so both are rebuilt
   every time something above them moves. */
function renderMatChips(){
  const s = serSel().value, st = stySel().value;
  const vals = (s && st) ? combos().filter(c=>c[0]===s && c[1]===st).map(c=>c[2]) : [];
  renderBeltChips('bMatChips', vals, {
    field:'material', ctx:s+'|'+st, other:'bMatOther',
    empty: st ? 'No materials on file' : 'Pick a series and style first',
    onPick: onMaterial
  });
  renderColourChips();
}
function renderColourChips(){
  const s = serSel().value, st = stySel().value, m = beltMat();
  const vals = (s && st && m) ? combos().filter(c=>c[0]===s && c[1]===st && c[2]===m).map(c=>c[3]) : [];
  renderBeltChips('bColourChips', vals, {
    field:'colour', ctx:s+'|'+st+'|'+m, other:'bColourOther',
    empty: m ? 'No colours on file' : 'Pick a material first',
    onPick: runWidthCheck
  });
}

/* ---------- Series > Style > Material > Colour ---------- */
const serSel = () => $('bSeries'), stySel = () => $('bStyle');
const combos = () => (REF ? REF.combos : []);

function onSeries(){
  const s = serSel().value;
  populateSel(stySel(), combos().filter(c=>c[0]===s).map(c=>c[1]),
    s ? 'Select style...' : 'Select series first', false, 'style', s);
  stySel().disabled = !s;
  renderMatChips();
  runWidthCheck();
  populateSprBores();
  const p = pitchMm(), rows = parseFloat($('bFlRows').value);
  if(p && rows > 0) $('bFlMm').value = round1(rows * p);
  updatePitch();
}
function onStyle(){
  renderMatChips();
  runWidthCheck();
  populateIndent();
}
function onMaterial(){
  renderColourChips();
  runWidthCheck();
  /* A loaded belt marks the flight material touched so the load doesn't clobber
     it, but picking a different belt material here means it's due to follow the
     new choice again - onMaterial only ever fires from a chip click, never
     during a programmatic load, so this can't undo the load-time protection. */
  flMatTouched = false; $('bFlMatAuto').classList.remove('off');
  syncFlightMaterial();
}
function setCascade(s, st, m, c){
  serSel().value = s || ''; onSeries();
  stySel().value = st || ''; onStyle();
  setChip('bMatChips', m || '', 'bMatOther'); renderColourChips();
  setChip('bColourChips', c || '', 'bColourOther');
  syncFlightMaterial();
  runWidthCheck();
}

/* ---------- belt width against buildable increments ----------
   The same arithmetic the workbook does in its EU..FC columns: from the link width,
   protrusion, increment and minimum link count for this spec, work out the widths that
   can actually be built and flag anything landing between them. */
function runWidthCheck(){
  const el = $('bWidthMsg');
  const s = serSel().value, st = stySel().value, m = beltMat();
  const w = parseFloat($('bWidth').value);
  showMsg(el, '', '');
  if(!REF || !s || !st || !m || isNaN(w) || w <= 0) return;
  const g = REF.geom.find(x => x[0]===s && x[1]===st && x[2]===m);
  if(!g) return;
  const linkW = g[3], inc = g[4] || 1, minL = g[5] || 0, prot = g[6] || 0;
  if(!linkW) return;
  const working = w - 2*prot;
  const above = (working - minL*linkW) / linkW;
  const lower = (minL + Math.floor(above/inc)*inc) * linkW + 2*prot;
  const upper = (minL + Math.ceil(above/inc)*inc) * linkW + 2*prot;
  if(Math.abs(w-lower) < 0.5 || Math.abs(w-upper) < 0.5){
    showMsg(el, 'ok', w+' mm is a standard built width for this spec.');
  } else if(Math.abs(lower-upper) < 0.5){
    showMsg(el, 'warn', w+' mm is not a standard increment. Nearest built width is <b>'+Math.round(lower)+' mm</b>.');
  } else {
    showMsg(el, 'warn', w+' mm is not a standard increment. Nearest built widths are <b>'+
      Math.round(lower)+' mm</b> or <b>'+Math.round(upper)+' mm</b>.');
  }
}
/* The belt has to sit inside the frame, so equal or narrower means a figure is wrong. */
function runFrameCheck(){
  const el = $('bFrameMsg'), fe = $('bFrame'), be = $('bWidth');
  const f = parseFloat(fe.value), b = parseFloat(be.value);
  showMsg(el, '', '');
  fe.classList.remove('alert'); be.classList.remove('alert');
  if(isNaN(f) || isNaN(b) || f <= 0 || b <= 0) return;
  if(f < b){
    showMsg(el, 'warn', 'Inside frame ('+f+' mm) is narrower than the belt ('+b+' mm). Check both measurements.');
    fe.classList.add('alert'); be.classList.add('alert');
  } else if(f === b){
    showMsg(el, 'warn', 'Frame and belt are both '+b+' mm, so there is no clearance. Check both measurements.');
    fe.classList.add('alert'); be.classList.add('alert');
  }
}

/* ---------- sprockets: Bore > PD/teeth > Material > variant ---------- */
const sprPool = () => {
  if(!REF) return [];
  const s = serSel().value;
  return s ? REF.sprockets.filter(x => x[0] === s) : REF.sprockets;
};
function populateSprBores(){
  const el = $('bSprBore'), prev = el.value;
  const bores = uniqSort(sprPool().map(x => x[1]));
  populateSel(el, bores, bores.length ? 'Select bore...' : 'No sprockets for this series',
    false, 'sprbore', serSel().value);
  if(bores.includes(prev)) el.value = prev;
  else if(bores.includes(DEFAULT_BORE)) el.value = DEFAULT_BORE;
  onSprBore(false);
}
function onSprBore(reset){
  const b = $('bSprBore').value;
  const pds = uniqSort(sprPool().filter(x => x[1]===b).map(x => x[2]));
  populateSel($('bSprPd'), pds, pds.length ? 'Select pitch diameter...' : 'No data for this bore',
    false, 'sprpd', serSel().value+'|'+b);
  $('bSprPd').disabled = !b;
  if(reset !== false){ populateSel($('bSprMat'), [], 'Select pitch diameter first'); $('bSprMat').disabled = true; }
  matchSprocket();
}
function onSprPd(){
  const b = $('bSprBore').value, p = $('bSprPd').value;
  const ms = uniqSort(sprPool().filter(x => x[1]===b && x[2]===p).map(x => x[3]));
  populateSel($('bSprMat'), ms, ms.length ? 'Select material...' : 'No data for this pitch',
    false, 'sprmat', serSel().value+'|'+b+'|'+p);
  $('bSprMat').disabled = !p;
  onSprMat();
}
/* The variant picker only appears where a spec genuinely has more than one build on
   file - EZ Clean, Split Metal, Double Wide Rim and so on. */
function onSprMat(){
  const b = $('bSprBore').value, p = $('bSprPd').value, m = $('bSprMat').value;
  const vs = uniqSort(sprPool().filter(x => x[1]===b && x[2]===p && x[3]===m).map(x => x[4]));
  const wrap = $('bSprVarWrap'), sel = $('bSprVar');
  if(vs.length > 1){
    populateSel(sel, vs, 'Select build type...');
    wrap.classList.remove('hide');
  } else {
    wrap.classList.add('hide');
    sel.innerHTML = vs.length ? '<option value="'+esc(vs[0])+'" selected>'+esc(vs[0])+'</option>' : '';
  }
  matchSprocket();
}
function sprVariant(){
  const sel = $('bSprVar');
  if(!$('bSprVarWrap').classList.contains('hide')) return sel.value;
  return sel.options.length ? sel.options[0].value : '';
}
let sprDescTouched = false, sprPnTouched = false, sprDriveTouched = false, sprIdleTouched = false;
/* Reopening a logged belt marks the description and part number touched so the
   load itself doesn't clobber them (see fillBeltFromEntry). But a deliberate
   change to the bore, pitch diameter, material or variant afterwards means the
   sprocket picked is a different one, so the old description and part number
   are wrong, not just stale - they must be free to recompute again. */
function resetSprMatch(){
  sprDescTouched = false; sprPnTouched = false;
  /* Clear rather than leave the old sprocket's description/part number on
     screen until a full new bore+pd+material match is found - a stale value
     sitting there looking valid is exactly what caused the confusion. */
  $('bSprDesc').value = ''; $('bSprPn').value = '';
  $('bSprDescAuto').classList.remove('off'); $('bSprPnAuto').classList.remove('off');
}
function matchSprocket(){
  const b = $('bSprBore').value, p = $('bSprPd').value, m = $('bSprMat').value;
  if(!b || !p || !m) return;
  const pool = sprPool().filter(x => x[1]===b && x[2]===p && x[3]===m);
  const v = sprVariant();
  const hit = (v ? pool.find(x => x[4]===v) : null) || pool[0];
  if(!hit) return;
  if(!sprDescTouched) $('bSprDesc').value = hit[4] || '';
  if(!sprPnTouched && hit[5]) $('bSprPn').value = hit[5];
}
/* Drive and idle quantity follow the workbook's own =ODD(width/152) rule,
   152 mm being the maximum sprocket centre spacing. */
function oddUp(n){ let v = Math.ceil(n); if(v % 2 === 0) v += 1; return Math.max(v, 1); }
function updateSprQty(){
  const w = parseFloat($('bWidth').value);
  if(isNaN(w) || w <= 0) return;
  const q = oddUp(w / 152);
  if(!sprDriveTouched) $('bSprDrive').value = q;
  if(!sprIdleTouched) $('bSprIdle').value = q;
}

/* ---------- flights, spacing and indent ---------- */
let flMatTouched = false;
function syncFlightMaterial(){
  if(flMatTouched) return;
  const m = beltMat();
  if(!m) return;
  const sel = $('bFlMat');
  if(![...sel.options].some(o => o.value === m)){
    const o = document.createElement('option'); o.value = m; o.textContent = m; sel.appendChild(o);
  }
  sel.value = m;
}
const round1 = n => Math.round(n*10)/10;
const pitchMm = () => {
  const s = serSel().value;
  return (REF && s && REF.pitch[s]) ? REF.pitch[s] : null;
};
function fmtIn(mm){
  const i = mm/25.4;
  return (Math.abs(i - Math.round(i)) < 0.01 ? Math.round(i) : i.toFixed(2)) + '"';
}
function updatePitch(){
  const el = $('bPitchMsg'), p = pitchMm(), s = serSel().value;
  if(!p){
    $('bFlRows').disabled = !!s;
    showMsg(el, 'info', s ? 'No pitch on file for Series '+esc(s)+'. Enter spacing in millimetres.' : '');
    return;
  }
  $('bFlRows').disabled = false;
  let m = 'Series '+esc(s)+' runs a <b>'+p+' mm ('+fmtIn(p)+') pitch</b>.';
  const rows = parseFloat($('bFlRows').value), mm = parseFloat($('bFlMm').value);
  if(rows > 0){
    m += ' '+rows+' row'+(rows===1?'':'s')+' = <b>'+round1(rows*p)+' mm</b> ('+fmtIn(rows*p)+').';
  } else if(mm > 0){
    const r = mm/p;
    m += Math.abs(r - Math.round(r)) < 0.02
      ? ' '+round1(mm)+' mm = <b>'+Math.round(r)+' rows</b>.'
      : ' '+round1(mm)+' mm = <b>'+r.toFixed(2)+' rows</b>, which is not a whole number of rows.';
  }
  showMsg(el, 'info', m);
}
/* Indent values are grouped by surface in the workbook, so the belt style decides which
   group applies. Flights carry their own values, added once a flight type is set. */
let indentAll = false;
function surfaceGroups(style){
  const s = (style || '').toUpperCase(), g = [];
  if(!s) return g;
  if(/FRICT(ION)?\s*TOP|OHFT|^FT[\s\/]|NON-SKID|MINI-RIB|RAISED RIB/.test(s)) g.push('Friction Top');
  if(/ROLLER/.test(s)) g.push('Roller Top');
  if(/NUB|CONE|DIAMOND|MESH|BALL/.test(s)) g.push('Nub / Cone etc');
  return g;
}
function populateIndent(){
  const sel = $('bIndent'), note = $('bIndentMsg'), prev = sel.value;
  const groups = (REF && REF.indentGroups.length) ? REF.indentGroups : [];
  if(!groups.length){
    populateSel(sel, [], 'Import reference data', true);
    showMsg(note, '', '');
    return;
  }
  const active = indentAll ? groups.map(g=>g[0]) : surfaceGroups(stySel().value);
  if(!indentAll && flightType()) active.push('Flights');
  const shown = groups.filter(([l]) => active.includes(l));

  if(!indentAll && !shown.length){
    /* Flat and open surfaces carry no indent of their own until flights are fitted,
       so offer Zero rather than every value from every unrelated group. */
    sel.innerHTML = '<option value="">Select indent...</option><option value="Zero">Zero</option>' +
      '<option value="OTHER">Other...</option>';
    keepValue(sel, prev);
    $('bIndentOther').classList.toggle('hide', sel.value !== 'OTHER');
    showMsg(note, 'info', (stySel().value
      ? '<b>'+esc(stySel().value)+'</b> has no surface indent, so normally <b>Zero</b> unless flights are fitted.'
      : 'Pick a style to narrow these down.') + ' <span class="lnk" id="indentAllLnk">show all values</span>');
    wireIndentToggle();
    return;
  }
  const use = shown.length ? shown : groups;
  const opt = v => '<option value="'+esc(v)+'">'+esc(v)+'</option>';
  const ctx = serSel().value+'|'+stySel().value;
  sel.innerHTML = '<option value="">Select indent...</option>' +
    use.map(([l, vals]) => '<optgroup label="'+esc(l)+'">' +
      rank(vals, 'indent', ctx).all.map(opt).join('') + '</optgroup>').join('') +
    '<option value="OTHER">Other...</option>';
  keepValue(sel, prev);
  $('bIndentOther').classList.toggle('hide', sel.value !== 'OTHER');
  const n = use.reduce((a,g)=>a+g[1].length, 0);
  showMsg(note, 'info', indentAll
    ? 'Showing all <b>'+n+'</b> indent values. <span class="lnk" id="indentAllLnk">filter to this belt</span>'
    : 'Filtered to <b>'+esc(use.map(g=>g[0]).join(' + '))+'</b> ('+n+' values) from the belt style. ' +
      '<span class="lnk" id="indentAllLnk">show all</span>');
  wireIndentToggle();
}
function wireIndentToggle(){
  const l = $('indentAllLnk');
  if(l) l.addEventListener('click', () => { indentAll = !indentAll; populateIndent(); });
}

/* ---------- value readers ---------- */
let flightType, sgType, indentValue;

/* ---------- wiring ---------- */
serSel().addEventListener('change', onSeries);
stySel().addEventListener('change', onStyle);
$('bWidth').addEventListener('input', () => { runWidthCheck(); runFrameCheck(); updateSprQty(); });
/* Same reasoning as resetSprMatch: a loaded belt marks the drive/idle quantity
   touched so the load doesn't clobber it, but a committed width change means the
   =ODD(width/152) count is due to recompute. Fires on change (blur/enter), not
   every keystroke, so a same-session manual override survives a typo correction. */
$('bWidth').addEventListener('change', () => {
  sprDriveTouched = false; sprIdleTouched = false;
  $('bSprDrvAuto').classList.remove('off'); $('bSprIdlAuto').classList.remove('off');
  updateSprQty();
});
$('bFrame').addEventListener('input', runFrameCheck);
$('bSprBore').addEventListener('change', () => { resetSprMatch(); onSprBore(); });
$('bSprPd').addEventListener('change', () => { resetSprMatch(); onSprPd(); });
$('bSprMat').addEventListener('change', () => { resetSprMatch(); onSprMat(); });
$('bSprVar').addEventListener('change', () => { resetSprMatch(); matchSprocket(); });
$('bSprDesc').addEventListener('input', () => { sprDescTouched = true; $('bSprDescAuto').classList.add('off'); });
$('bSprPn').addEventListener('input', () => { sprPnTouched = true; $('bSprPnAuto').classList.add('off'); });
$('bSprDrive').addEventListener('input', () => { sprDriveTouched = true; $('bSprDrvAuto').classList.add('off'); });
$('bSprIdle').addEventListener('input', () => { sprIdleTouched = true; $('bSprIdlAuto').classList.add('off'); });
$('bFlMat').addEventListener('change', () => { flMatTouched = true; $('bFlMatAuto').classList.add('off'); });

flightType = otherPair($('bFlType'), $('bFlTypeOther'));
sgType     = otherPair($('bSgType'), $('bSgTypeOther'));
indentValue = otherPair($('bIndent'), $('bIndentOther'));
$('bFlType').addEventListener('change', populateIndent);

let lenTouched = false;
$('bLen').addEventListener('input', () => { lenTouched = true; $('bLenAuto').classList.add('off'); });
$('bCvLen').addEventListener('input', () => {
  if(lenTouched) return;
  const v = parseFloat($('bCvLen').value);
  if(!isNaN(v)) $('bLen').value = (v*2.05 + 0.5).toFixed(2);
});

let spacingSync = false;
$('bFlRows').addEventListener('input', () => {
  if(spacingSync) return;
  const p = pitchMm(), rows = parseFloat($('bFlRows').value);
  spacingSync = true;
  if(p && rows > 0) $('bFlMm').value = round1(rows*p);
  else if($('bFlRows').value === '') $('bFlMm').value = '';
  spacingSync = false;
  updatePitch();
});
$('bFlMm').addEventListener('input', () => {
  if(spacingSync) return;
  const p = pitchMm(), mm = parseFloat($('bFlMm').value);
  spacingSync = true;
  if(p && mm > 0){
    const r = mm/p;
    $('bFlRows').value = Math.abs(r - Math.round(r)) < 0.02 ? Math.round(r) : '';
  } else if($('bFlMm').value === '') $('bFlRows').value = '';
  spacingSync = false;
  updatePitch();
});

function toggleSkip(box, bodyId){
  $(bodyId).classList.toggle('hide', box.checked);
}
const HD_RETAINER_QTY = 8;
const SPACER_NOTE = 'Yes - see TSG for specification';
function updateSprExtras(){
  const bits = [];
  if($('bSprSpacers').checked) bits.push('Spacers will be recorded as "'+SPACER_NOTE+'".');
  if($('bSprHdRet').checked) bits.push('Heavy duty retainers will be recorded with a quantity of '+HD_RETAINER_QTY+'.');
  $('bSprExtraNote').innerHTML = bits.join(' ');
}
$('bSprSpacers').addEventListener('change', updateSprExtras);
$('bSprHdRet').addEventListener('change', updateSprExtras);
$('bSkipSpr').addEventListener('change', e => toggleSkip(e.target, 'bSprBody'));
$('bSkipAcc').addEventListener('change', e => toggleSkip(e.target, 'bAccBody'));

let bRetroVal = '';
document.querySelectorAll('#bRetro button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('#bRetro button').forEach(x => x.classList.remove('on'));
  b.classList.add('on'); bRetroVal = b.dataset.v;
}));

/* ---------- copy the spec off a belt already on this call ---------- */
function refreshBeltCopy(){
  const sel = $('bCopy');
  const belts = call ? call.entries.filter(e => e.type === 'belt') : [];
  $('bCopyWrap').classList.toggle('hide', !belts.length);
  sel.innerHTML = '<option value="">Start from blank</option>' +
    belts.map((b, i) => '<option value="'+i+'">'+esc(b.asset || ('Belt '+(i+1)))+
      (b.beltdesc ? ' - '+esc(b.beltdesc) : '')+'</option>').join('');
}
$('bCopy').addEventListener('change', () => {
  const belts = call.entries.filter(e => e.type === 'belt');
  const b = belts[+$('bCopy').value];
  if(!b) return;
  $('bDesc').value = b.beltdesc || '';
  setCascade(b.series, b.style, b.beltmat, b.colour);
  setChip('bRodChips', b.rodmat || '', 'bRodOther');
  $('bFrame').value = b.frame || '';
  $('bWidth').value = b.width || '';
  if(b.sprbore){
    $('bSprBore').value = b.sprbore; onSprBore(false);
    $('bSprPd').value = b.sprpd || ''; onSprPd();
    $('bSprMat').value = b.sprmat || ''; onSprMat();
  }
  runWidthCheck(); runFrameCheck(); updateSprQty();
  toast('Copied the spec from '+(b.asset || 'that belt'));
});

/* ---------- reset and save ---------- */
/* ---------- editing a logged entry ----------
   Entries used to be push-only: a typo in a belt spec meant deleting the entry
   and re-keying 38 fields. editingIdx holds the position in call.entries being
   edited, or null when adding. Save branches on it.

   Usage counters are deliberately NOT bumped on an edit. They rank the pickers
   by what gets used most, and re-saving one belt three times while correcting
   it would tell the ranking that belt is three times as common as it is. */
let editingIdx = null;

function clearEditing(){ editingIdx = null; }

/* Commits the form to call.entries and returns the index, without leaving the
   screen. Used by save, and by the fault button so a belt never has to be
   saved by hand first. */
function commitEntry(entry, keepPhotos){
  if(editingIdx != null && call.entries[editingIdx]){
    const prev = call.entries[editingIdx];
    if(keepPhotos !== false) entry.photos = prev.photos || [];
    if(prev.detached) entry.detached = prev.detached;
    call.entries[editingIdx] = entry;
    return editingIdx;
  }
  call.entries.push(entry);
  draftSaved('belt');   // saved, so there is nothing to pick up
  editingIdx = call.entries.length - 1;
  return editingIdx;
}

/* The belt form is the same form either way - the same series cascade, the same
   sprocket matching, the same width check. Two fields are quote-only and are
   shown rather than the whole form being forked. */
function applyBeltQuoteFields(){
  const q = isQuote(call);
  const row = $('bQuoteRow');
  if(row) row.hidden = !q;
}
function resetBelt(){
  try { showMsg($('bAssetHit'), '', ''); } catch(e){}
  ['bAsset','bDesc','bCvLen','bFrame','bWidth','bLen','bSprDesc','bSprPn','bSprDrive','bSprIdle',
   'bFlHeight','bFlRows','bFlMm','bNotch','bSgHeight','bQc','bQty','bComment','bRodOther','bFlTypeOther',
   'bSgTypeOther','bIndentOther'].forEach(i => { if($(i)) $(i).value = ''; });
  ['bRodOther','bMatOther','bColourOther','bFlTypeOther','bSgTypeOther','bIndentOther']
    .forEach(i => { $(i).value = ''; $(i).classList.add('hide'); });
  clearChip('bRodChips', 'bRodOther');
  clearChip('bMatChips', 'bMatOther');
  clearChip('bColourChips', 'bColourOther');
  bRetroVal = ''; document.querySelectorAll('#bRetro button').forEach(x => x.classList.remove('on'));
  sprDescTouched = sprPnTouched = sprDriveTouched = sprIdleTouched = false;
  flMatTouched = lenTouched = false; indentAll = false;
  ['bSprDescAuto','bSprPnAuto','bSprDrvAuto','bSprIdlAuto','bFlMatAuto','bLenAuto']
    .forEach(i => $(i).classList.remove('off'));
  $('bSkipSpr').checked = false; $('bSprBody').classList.remove('hide');
  $('bSprSpacers').checked = false; $('bSprHdRet').checked = false; updateSprExtras();
  $('bSkipAcc').checked = true;  $('bAccBody').classList.add('hide');
  $('bFlType').value = ''; $('bFlMat').value = ''; $('bSgType').value = ''; $('bSgMat').value = '';
  $('bTsg').checked = false;
  resetShots('belt');
  applyBeltQuoteFields();
  clearEditing();
  $('bErr').classList.remove('show');
  $('bFrame').classList.remove('alert'); $('bWidth').classList.remove('alert');
  showMsg($('bWidthMsg'), '', ''); showMsg($('bFrameMsg'), '', '');
  setCascade('', '', '', '');
  populateSprBores(); populateIndent(); updatePitch();
  refreshBeltCopy();
  beltFold(true);
  document.querySelectorAll('#s-belt .fromphoto').forEach(x => x.classList.remove('fromphoto'));
  try { showMsg($('bScanMsg'), '', ''); } catch(e){}
}

/* ---------- the belt form's sections (v98) ----------
   Belt data, Sprockets, Flights and sideguards, Photos and comments, and
   Quote contact each fold, with one line saying what is in them, so a whole
   belt reads on one screen. A new belt opens on Belt data; a logged belt (or a
   copy of one) opens with everything folded. Same on the phone and the PC
   (Ben, 2026-10-10). The asset field sits above them all and is the only
   required field, so Done never has to open a section to show an error. */
const BELT_SECS = ['bxBelt', 'bxSpr', 'bxAcc', 'bxPho', 'bxQuo'];
function beltFold(fresh){
  BELT_SECS.forEach(id => { const d = $(id); if(d) d.open = !!fresh && id === 'bxBelt'; });
  beltSummaries();
}
function beltSummaries(){
  const v = id => ($(id) && $(id).value || '').trim();
  const set = (id, t, empty) => { const el = $(id); if(el) el.textContent = t || empty; };
  const width = v('bWidth'), len = v('bLen');
  const desc = v('bDesc') || [serSel().value, stySel().value].filter(Boolean).join(' ');
  set('sumBelt', [desc, [beltMat(), beltColour()].filter(Boolean).join(' '),
    width && len ? width + ' mm × ' + len + ' m' : width ? width + ' mm wide' : len ? len + ' m long' : ''].filter(Boolean).join(' · '), 'Not filled in');
  if($('bSkipSpr').checked) set('sumSpr', 'Not assessed');
  else {
    const drv = v('bSprDrive'), idl = v('bSprIdle');
    const pd = $('bSprPd').value ? $('bSprPd').options[$('bSprPd').selectedIndex].textContent : '';
    set('sumSpr', [v('bSprDesc') || pd, drv && drv + ' drive', idl && idl + ' idle'].filter(Boolean).join(' · '), 'Not filled in');
  }
  if($('bSkipAcc').checked) set('sumAcc', 'None on this belt');
  else {
    const fl = flightType(), fh = v('bFlHeight'), sg = sgType();
    set('sumAcc', [fl && (fl + (fh ? ' ' + fh + ' mm' : '')), indentValue() && 'indent ' + indentValue(), sg && sg + ' sideguards']
      .filter(Boolean).join(' · '), 'Not filled in');
  }
  const kept = (editingIdx != null && call && call.entries[editingIdx] && call.entries[editingIdx].photos || []).length;
  const ph = Math.max(kept, document.querySelectorAll('#bShots img').length);
  const cm = v('bComment').replace(/\s+/g, ' ');
  set('sumPho', [ph && ph + ' photo' + (ph === 1 ? '' : 's'), cm && (cm.length > 50 ? cm.slice(0, 50) + '…' : cm)].filter(Boolean).join(' · '), 'None yet');
  const q = call && isQuote(call);
  if($('bxQuoHead')) $('bxQuoHead').textContent = q ? 'For the quote' : 'Quote contact';
  set('sumQuo', [q && v('bQty') && 'Qty ' + v('bQty'), q && ($('bTsg').checked ? 'ID confirmed with TSG' : 'ID not confirmed'),
    v('bQc') ? 'Contact: ' + v('bQc') : 'Uses the call contacts'].filter(Boolean).join(' · '), '');
}
// typing, a chip or a picker anywhere on the form brings the lines up to date
let beltSumT = null;
['input', 'change', 'click'].forEach(ev => $('s-belt').addEventListener(ev, () => {
  clearTimeout(beltSumT); beltSumT = setTimeout(() => { try { beltSummaries(); } catch(e){ console.warn('belt summary', e); } }, 60);
}));

/* ---------- read a spec sheet (v101) ----------
   Photograph a paper belt spec - a printed table filled in by hand, or plain
   handwriting - and the ai-tidy function reads it. What comes back goes only
   into boxes that are still empty: anything already typed or picked stays as
   it is (PREFERENCES.md). Each box filled this way is tinted until it is
   changed, the sections holding them open, and a line under the button says
   what was filled, what was left alone and what could not be read. The photo
   itself is kept with the belt. Nothing is saved until Done. */
const SPEC_NONE = /^(none|nil|no|n\/?a|-+|—|–)$/i;
const SPEC_BOX = {asset: ['bAsset', 'asset'], desc: ['bDesc', 'description'], cvlen: ['bCvLen', 'conveyor length'],
  frame: ['bFrame', 'frame width'], width: ['bWidth', 'belt width'], beltlen: ['bLen', 'belt length'], notch: ['bNotch', 'centre notch'],
  sprdesc: ['bSprDesc', 'sprocket'], sprpn: ['bSprPn', 'sprocket part number'], sprdrive: ['bSprDrive', 'drive qty'],
  spridle: ['bSprIdle', 'idle qty'], flheight: ['bFlHeight', 'flight height'], flspacing: ['bFlMm', 'flight spacing'],
  sgheight: ['bSgHeight', 'sideguard height'], qty: ['bQty', 'quantity'], comment: ['bComment', 'comments']};
const specNorm = x => String(x || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
// an option or chip that matches loosely: same letters and digits, or for a series the same number
function specOption(values, v, byNumber){
  const w = specNorm(v);
  if(!w) return '';
  const hit = values.find(o => specNorm(o) === w);
  if(hit) return hit;
  const num = (String(v).match(/\d+/) || [])[0];
  if(byNumber && num) return values.find(o => (String(o).match(/\d+/) || [])[0] === num) || '';
  return values.find(o => specNorm(o) && (specNorm(o).includes(w) || w.includes(specNorm(o)))) || '';
}
function specFill(s){
  const filled = [], kept = [], unmatched = [];
  const mark = el => { if(!el) return; el.classList.add('fromphoto'); const d = el.closest('details'); if(d) d.open = true; };
  const has = v => v != null && String(v).trim() && !SPEC_NONE.test(String(v).trim());
  // the pickers first, so the cascade has populated what the boxes below depend on
  if(has(s.series)){
    if(serSel().value) kept.push('series');
    else {
      const ser = specOption([...serSel().options].map(o => o.value).filter(Boolean), s.series, true);
      if(ser){ serSel().value = ser; onSeries(); mark(serSel()); filled.push('series'); }
      else unmatched.push('series ' + s.series);
    }
  }
  if(has(s.style)){
    if(stySel().value) kept.push('style');
    else if(serSel().value){
      const st = specOption([...stySel().options].map(o => o.value).filter(Boolean), s.style);
      if(st){ stySel().value = st; onStyle(); mark(stySel()); filled.push('style'); }
      else unmatched.push('style ' + s.style);
    } else unmatched.push('style ' + s.style);
  }
  const chips = (id, otherId, v, label, after) => {
    if(!has(v)) return;
    if(chipValue(id, otherId)){ kept.push(label); return; }
    const vals = [...$(id).querySelectorAll('button')].map(b => b.dataset.v).filter(x => x && x !== 'OTHER');
    const exact = specOption(vals, v) || String(v).trim();
    if(setChip(id, exact, otherId) && chipValue(id, otherId)){ mark($(id)); filled.push(label); if(after) after(); }
    else unmatched.push(label + ' ' + v);
  };
  chips('bMatChips', 'bMatOther', s.material, 'material', () => renderColourChips());
  chips('bColourChips', 'bColourOther', s.colour, 'colour');
  chips('bRodChips', 'bRodOther', s.rod, 'rod material');
  try { syncFlightMaterial(); } catch(e){}
  // sprockets and flights are only opened up if the sheet has something for them
  if(['sprdesc', 'sprpn', 'sprdrive', 'spridle'].some(k => has(s[k])) && $('bSkipSpr').checked){
    $('bSkipSpr').checked = false; $('bSkipSpr').dispatchEvent(new Event('change'));
  }
  const flights = has(s.fltype) || ['flheight', 'flspacing', 'sgtype', 'sgheight'].some(k => has(s[k]));
  if(flights && $('bSkipAcc').checked){ $('bSkipAcc').checked = false; $('bSkipAcc').dispatchEvent(new Event('change')); }
  const pick = (id, v, label) => {
    if(!has(v)) return;
    if($(id).value){ kept.push(label); return; }
    if(setSelLoose(id, v) || setSelLoose(id, specOption([...$(id).options].map(o => o.value).filter(Boolean), v))){ mark($(id)); filled.push(label); }
    else unmatched.push(label + ' ' + v);
  };
  pick('bFlType', s.fltype, 'flight type');
  pick('bSgType', s.sgtype, 'sideguard type');
  for(const [k, [id, label]] of Object.entries(SPEC_BOX)){
    const el = $(id);
    if(!el || !has(s[k])) continue;
    if(id === 'bQty' && !isQuote(call)) continue;              // quantity is asked for on a quote request only
    // an estimate the app worked out (badged) is not something typed, so the sheet replaces it
    const estimate = {bSprDesc: !sprDescTouched, bSprPn: !sprPnTouched, bSprDrive: !sprDriveTouched,
      bSprIdle: !sprIdleTouched, bLen: !lenTouched}[id];
    if(el.value.trim() && !estimate){ kept.push(label); continue; }
    el.value = String(s[k]).trim();
    mark(el); filled.push(label);
  }
  // a value from the sheet is not an estimate, so the auto badges go off
  if($('bSprDesc').classList.contains('fromphoto')){ sprDescTouched = true; $('bSprDescAuto').classList.add('off'); }
  if($('bSprPn').classList.contains('fromphoto')){ sprPnTouched = true; $('bSprPnAuto').classList.add('off'); }
  if($('bSprDrive').classList.contains('fromphoto')){ sprDriveTouched = true; $('bSprDrvAuto').classList.add('off'); }
  if($('bSprIdle').classList.contains('fromphoto')){ sprIdleTouched = true; $('bSprIdlAuto').classList.add('off'); }
  if($('bLen').classList.contains('fromphoto')){ lenTouched = true; $('bLenAuto').classList.add('off'); }
  try { runWidthCheck(); runFrameCheck(); updatePitch(); } catch(e){}
  try { beltSummaries(); } catch(e){}
  return {filled, kept, unmatched};
}
async function readSpecSheet(file){
  if(!file) return;
  const why = aiBlocked();
  if(why){ toast(why); return; }
  showMsg($('bScanMsg'), 'info', 'Reading the sheet' + String.fromCharCode(8230) + ' usually 5 to 10 seconds.');
  let small;
  try { small = await shrink(file, 1568, 0.85); }
  catch(e){ showMsg($('bScanMsg'), 'warn', 'That photo could not be read. Nothing was changed.'); return; }
  try { await addShots('belt', [file]); } catch(e){ console.warn('spec photo', e); }   // the sheet stays with the belt
  let r;
  try {
    const b64 = String(await blobToDataURL(small)).split(',')[1] || '';
    r = await aiAsk({kind: 'spec', image: b64, media: 'image/jpeg'});
  } catch(e){
    showMsg($('bScanMsg'), 'warn', 'That did not work: ' + esc(e.message || String(e)) + '. Nothing was filled in; the photo is kept with the belt.');
    return;
  }
  const res = specFill(r.spec || {});
  const unread = (r.unread || []).map(String).filter(Boolean);
  const bits = [];
  bits.push(res.filled.length ? '<b>Filled from the photo, tinted — check each before Done:</b> ' + esc(res.filled.join(', ')) + '.'
    : '<b>Nothing new could be filled from the photo.</b>');
  if(res.kept.length) bits.push('Already filled, so left as you had them: ' + esc(res.kept.join(', ')) + '.');
  if(res.unmatched.length) bits.push((REF ? 'Not in the belt reference data' : 'No belt reference data loaded') +
    ', so left for you: ' + esc(res.unmatched.join(', ')) + '.');
  if(unread.length) bits.push('Could not read: ' + esc(unread.join(', ')) + '.');
  showMsg($('bScanMsg'), res.filled.length && !res.unmatched.length && !unread.length ? 'ok' : 'warn', bits.join('<br>'));
  if(res.filled.length && call) saveCall();
}
$('bScan').addEventListener('click', () => {
  const why = aiBlocked();
  if(why){ toast(why); return; }
  $('bScanFile').value = '';
  $('bScanFile').click();
});
$('bScanFile').addEventListener('change', () => readSpecSheet($('bScanFile').files[0]).catch(reportErr));
// typing over a filled box, or picking again, takes the tint off; looking at it does not
['input', 'change', 'click'].forEach(ev => $('s-belt').addEventListener(ev, e => {
  const t = e.target && e.target.closest && e.target.closest(ev === 'click' ? '.chips.fromphoto' : '.fromphoto');
  if(t) t.classList.remove('fromphoto');
}, true));

/* Set by the fault button so the belt is committed without the toast and the
   jump to the dashboard. Read into a local immediately, because the handler
   awaits and the flag would otherwise be cleared before it is used. */
let beltSaveSilent = false;
$('bSave').addEventListener('click', async () => {
  const silent = beltSaveSilent; beltSaveSilent = false;
  const a = $('bAsset').value.trim();
  if(!a){ $('bErr').classList.add('show'); $('bAsset').focus(); return; }
  const skipSpr = $('bSkipSpr').checked, skipAcc = $('bSkipAcc').checked;
  const v = id => $(id).value.trim();

  const e = {
    type:'belt', asset:a, beltdesc:v('bDesc'),
    series:serSel().value, style:stySel().value, beltmat:beltMat(), colour:beltColour(),
    rodmat:rodValue(),
    clength:v('bCvLen'), frame:v('bFrame'), width:v('bWidth'), beltlen:v('bLen'),
    retrofit:bRetroVal,
    sprocket: skipSpr ? '' : v('bSprDesc'),
    sprbore: skipSpr ? '' : $('bSprBore').value,
    sprpd:   skipSpr ? '' : $('bSprPd').value,
    sprmat:  skipSpr ? '' : $('bSprMat').value,
    sprvar:  skipSpr ? '' : sprVariant(),
    sprpn:   skipSpr ? '' : v('bSprPn'),
    sprdrive:skipSpr ? '' : v('bSprDrive'),
    spridle: skipSpr ? '' : v('bSprIdle'),
    sprspacers: !skipSpr && $('bSprSpacers').checked,
    sprhdret:   !skipSpr && $('bSprHdRet').checked,
    sprhdretqty:(!skipSpr && $('bSprHdRet').checked) ? String(HD_RETAINER_QTY) : '',
    flights: !skipAcc,
    fstyle:  skipAcc ? '' : flightType(),
    flmat:   skipAcc ? '' : $('bFlMat').value,
    fheight: skipAcc ? '' : v('bFlHeight'),
    frows:   skipAcc ? '' : v('bFlRows'),
    fspacing:skipAcc ? '' : v('bFlMm'),
    findent: skipAcc ? '' : indentValue(),
    cnotch:  skipAcc ? '' : v('bNotch'),
    sgtype:  skipAcc ? '' : sgType(),
    sgmat:   skipAcc ? '' : $('bSgMat').value,
    sgheight:skipAcc ? '' : v('bSgHeight'),
    qcontact:v('bQc'), comment:v('bComment'),
    /* Quantity and the TSG confirmation are asked for on a quote request and
       nowhere else. On a site call quantity is derived, and the belt in front
       of you is the belt - there is nothing to confirm with TSG. */
    qty: v('bQty'),
    tsg: $('bTsg').checked,
    photos:[]
  };
  const wasEdit = editingIdx != null;
  /* Photos shot on the form are added to whatever the entry already carries,
     rather than replacing it, so editing a belt to fix a width does not wipe the
     pictures. keepPhotos is false because this line has already done the
     merging. */
  const beltKept = (wasEdit && call.entries[editingIdx]) ? (call.entries[editingIdx].photos || []) : [];
  const beltShots = takeShots('belt');
  e.photos = beltKept.concat(beltShots);
  beltJustSaved = commitEntry(e, false);
  const ctxS = e.series, ctxT = e.series+'|'+e.style, ctxM = ctxT+'|'+e.beltmat;
  if(!wasEdit){
  bump('series', '', e.series);
  bump('style', ctxS, e.style);
  bump('material', ctxT, e.beltmat);
  bump('colour', ctxM, e.colour);
  bump('rod', '', e.rodmat);
  if(!skipSpr){
    bump('sprbore', ctxS, e.sprbore);
    bump('sprpd', ctxS+'|'+e.sprbore, e.sprpd);
    bump('sprmat', ctxS+'|'+e.sprbore+'|'+e.sprpd, e.sprmat);
  }
  if(!skipAcc){
    bump('fltype', '', e.fstyle);   bump('flmat', '', e.flmat);
    bump('sgtype', '', e.sgtype);   bump('sgmat', '', e.sgmat);
    bump('indent', ctxT, e.findent);
  }
  }
  /* Ranking is what the pickers sort by, so an edit must not vote again. */
  await Promise.all([saveCall(), wasEdit ? Promise.resolve() : saveUse()]);
  clearEditing();
  if(silent) return;
  toast(wasEdit ? ('Belt '+a+' updated') : ('Belt '+a+' logged - add a photo if you want one'));
  go('dash');
});

/* ---------- entry: project ---------- */
/* ---------- carrying a project forward ----------
   Every visit used to create a new project entry, so six calls at one plant left
   six copies of the same job at different stages and nothing said which was
   current. A project is a thing that moves, not a thing that repeats.

   So the form offers what is already running at this account. Taking one fills
   the form in and records the move - Scoping to Awaiting quote - which is what
   turns a pile of entries into something you can read back.

   Matching is on the project name, case and spacing ignored. Two genuinely
   different projects at one plant need two different names, which they would
   need anyway to be told apart in a report. */
const PROJECT_DONE = ['Complete', 'Not proceeding'];
const projKey = n => String(n||'').trim().toLowerCase().replace(/\s+/g,' ');

function projectsHere(){
  if(!call) return [];
  const seen = new Map();
  // this call first, then previous ones, newest first
  const sources = [call].concat(callsFor(call.customer).filter(c => c.id !== call.id)
    .sort((a,b) => callWhen(b) - callWhen(a)));
  for(const c of sources){
    for(const e of (c.entries||[])){
      if(e.type !== 'project' || !e.project) continue;
      const k = projKey(e.project);
      if(seen.has(k)) continue;              // the newest sighting wins
      seen.set(k, {e: e, when: c === call ? Date.now() : callWhen(c), date: c.date,
                   here: c === call});
    }
  }
  return [...seen.values()].filter(x => !PROJECT_DONE.includes(x.e.status));
}

let editingProject = null;   // {key, fromStatus, inThisCall}
function renderProjectCarry(){
  const el = $('pCarry');
  if(!el) return;
  const list = projectsHere();
  if(!list.length){ el.innerHTML = ''; el.classList.remove('show'); return; }
  el.classList.add('show');
  el.innerHTML = '<div class="carrylab">Already running at this account</div>' +
    list.map((x,i) => '<button type="button" class="carry" data-proj="'+i+'">' +
      '<b>'+esc(x.e.project)+'</b>' +
      '<span>'+esc(x.e.status||'no status')+
      (x.e.target ? ' \u00b7 target '+esc(x.e.target) : '') +
      (x.here ? ' \u00b7 logged in this call' : ' \u00b7 last seen '+esc(x.date))+'</span></button>').join('') +
    '<button type="button" class="carry new" data-proj="new">Start a different project</button>';
  el.querySelectorAll('[data-proj]').forEach(b => b.addEventListener('click', ()=>{
    if(b.dataset.proj === 'new'){ editingProject = null; resetProjectFields(); el.classList.remove('show'); return; }
    loadProject(list[+b.dataset.proj]);
  }));
}
function loadProject(x){
  const e = x.e;
  editingProject = {key: projKey(e.project), fromStatus: e.status || '', inThisCall: x.here};
  $('pName').value = e.project;
  $('pStat').value = e.status || 'Being considered';
  $('pNext').value = e.next || '';
  $('pTarg').value = e.target || '';
  $('pOwner').value = e.owner || '';
  $('pNotes').value = '';                    // notes are per visit, not carried
  $('pErr').classList.remove('show');
  $('pCarry').classList.remove('show');
  $('pSave').textContent = 'Update project';
  showMsg($('pMsg'), 'info', 'Carried forward from ' + esc(x.date) +
    '. Change the status and next action; the move is recorded.');
}
function resetProjectFields(){
  resetShots('project');
  ['pName','pNext','pTarg','pOwner','pNotes'].forEach(i=>$(i).value='');
  $('pStat').value='Being considered';
  $('pErr').classList.remove('show');
  $('pSave').textContent = 'Add project';
  showMsg($('pMsg'), '', '');
}
function resetProject(){
  editingProject = null;
  resetProjectFields();
  renderProjectCarry();
}
$('pSave').addEventListener('click', async ()=>{
  const p = $('pName').value.trim();
  if(!p){ $('pErr').classList.add('show'); $('pName').focus(); return; }
  const status = $('pStat').value;
  const carried = editingProject && editingProject.key === projKey(p);
  const entry = {type:'project', project:p, status:status, next:$('pNext').value.trim(),
    target:$('pTarg').value.trim(), owner:$('pOwner').value.trim(),
    notes:$('pNotes').value.trim(), photos:takeShots('project')};
  if(carried && editingProject.fromStatus && editingProject.fromStatus !== status){
    entry.fromStatus = editingProject.fromStatus;   // the report reads this as a move
  }
  /* Updating a project already logged in THIS call replaces it. Two entries for
     one project in one visit is the duplication this was built to stop. */
  let replaced = false;
  if(carried && editingProject.inThisCall){
    const i = call.entries.findIndex(e => e.type==='project' && projKey(e.project) === editingProject.key);
    // keep what the earlier entry carried and add anything shot this time
    if(i >= 0){ entry.photos = (call.entries[i].photos || []).concat(entry.photos); call.entries[i] = entry; replaced = true; }
  }
  if(!replaced) call.entries.push(entry);
  draftSaved('project');
  editingProject = null;
  await saveCall();
  toast(entry.fromStatus ? ('Project moved to ' + status) : (replaced ? 'Project updated' : 'Project logged'));
  go('dash');
});

/* ---------- entry: note ---------- */
$('nSave').addEventListener('click', async ()=>{
  const t = $('nText').value.trim();
  if(!t){ $('nErr').classList.add('show'); $('nText').focus(); return; }
  const wasEdit = editingIdx != null;
  const noteKept = (wasEdit && call.entries[editingIdx]) ? (call.entries[editingIdx].photos || []) : [];
  commitEntry({type:'note', topic:$('nTopic').value, text:t,
    photos: noteKept.concat(takeShots('note'))}, false);
  clearEditing();
  draftSaved('note');
  await saveCall(); toast(wasEdit ? 'Note updated' : 'Note logged'); go('dash');
});

/* ---------- entry: health ---------- */
let hSevVal='';
/* ---------- has this been logged before? ----------
   Every previous call at the account is already held and indexed, so the app can
   answer a question you would otherwise have to remember: was this asset on the
   list last time? Three things fall out of it - you stop writing the same fault
   twice, you can say how long it has been outstanding while standing in front of
   the person, and an escalation from Monitor to Plan to Urgent becomes a fact
   rather than a feeling.

   Matched on the asset field, loosely: CV-114, cv114 and CV 114 drive end are
   the same conveyor as far as this is concerned. */
const assetKey = v => String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');
/* Fields the fault library adds to a health entry, held between the picker
   closing and the form being saved. */
let healthExtra = null;

/* Opens the fault library picker and fills the health form from the chosen
   check. Guarded everywhere, so the button simply does nothing if the module
   is absent. */
function openFaultPicker(ctx){
  if(!window.HealthLib){ toast('healthlib.js did not load'); return; }
  HealthLib.openPicker(ctx || {asset:$('hAsset').value.trim()}, e => {
    healthExtra = e;
    if(e.asset && !$('hAsset').value.trim()) $('hAsset').value = e.asset;
    $('hFault').value  = e.fault;
    $('hAction').value = e.action;
    const opt = Array.from($('hType').options).find(o => o.value === e.htype);
    if(!opt){ const o = document.createElement('option'); o.value = o.textContent = e.htype; $('hType').appendChild(o); }
    $('hType').value = e.htype;
    $('hSev').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === e.severity));
    $('hSevErr').classList.remove('show');
    toast(e.faultCode + ' selected');
  });
}

/* ---------- people on the call ----------
   `doc` marks a contact as appearing on documents that go to the customer. It is
   absent on every call written before this existed, so absent means included -
   an old call exports exactly as it always did. */
function docContact(x){ return x.doc !== false; }

function renderCallContacts(){
  if(!call) return;
  const on = $('ccOn');
  on.innerHTML = call.contacts.length ? call.contacts.map((x,i)=>{
    const meta = [x.role, x.email, x.mobile].filter(Boolean).map(esc).join(' \u00b7 ');
    return '<div class="ccrow">' +
      '<input type="checkbox" data-doc="'+i+'"'+(docContact(x)?' checked':'')+
      ' aria-label="Include '+esc(x.name)+' on compiled documents">' +
      '<span class="who"><div class="nm">'+esc(x.name)+
      (x.crm?'':' <span class="tag">not in CRM</span>')+'</div>' +
      '<div class="mt">'+(meta||'no details on file')+'</div></span>' +
      '<button type="button" class="x" data-rm="'+i+'">Remove</button></div>';
  }).join('') : '<p class="empty">Nobody on this call yet.</p>';

  on.querySelectorAll('[data-doc]').forEach(b=>b.addEventListener('change', async ()=>{
    call.contacts[+b.dataset.doc].doc = b.checked;
    await saveCall(); renderCallContacts(); renderDash();
  }));
  on.querySelectorAll('[data-rm]').forEach(b=>b.addEventListener('click', async ()=>{
    const x = call.contacts[+b.dataset.rm];
    if(!confirm('Remove '+x.name+' from this call? This takes them off the record, not just off the documents.')) return;
    call.contacts.splice(+b.dataset.rm,1);
    await saveCall(); renderCallContacts(); renderDash();
  }));

  /* Only contacts not already on the call are offered, so the same person
     cannot be added twice. */
  const acc = ACC_BY_NAME.get(call.customer);
  const pool = (acc && acc.c) ? acc.c : [];
  const have = new Set(call.contacts.map(x=>(x.cid!=null?'id:'+x.cid:'nm:'+x.name.toLowerCase())));
  const q = ($('ccQ').value||'').trim().toLowerCase();
  const rest = pool.filter(p => !have.has(p.id!=null?'id:'+p.id:'nm:'+String(p.n).toLowerCase()))
    .filter(p => !q || (p.n+' '+(p.t||p.r||'')).toLowerCase().includes(q));
  $('ccAdd').innerHTML = rest.length ? rest.map((p,i)=>{
    const meta = [p.t||p.r, (p.e&&p.e[0])||'', p.p].filter(Boolean).map(esc).join(' \u00b7 ');
    return '<div class="ccrow"><span class="who"><div class="nm">'+esc(p.n)+'</div>'+
      '<div class="mt">'+(meta||'no details on file')+'</div></span>'+
      '<button type="button" class="x" data-add="'+pool.indexOf(p)+'">Add</button></div>';
  }).join('') : '<p class="empty">'+(pool.length?'Everyone is already on the call.':'No contacts on file for this account.')+'</p>';

  $('ccAdd').querySelectorAll('[data-add]').forEach(b=>b.addEventListener('click', async ()=>{
    const p = pool[+b.dataset.add];
    if(!p) return;
    call.contacts.push({name:p.n, role:p.t||p.r, email:(p.e&&p.e[0])||'', mobile:p.p,
      crm:true, cid:p.id, doc:true});
    await saveCall(); renderCallContacts(); renderDash();
    toast(p.n+' added');
  }));
}

function healthHistory(asset){
  const k = assetKey(asset);
  if(k.length < 3 || !call) return [];        // too short to match on
  const out = [];
  const sources = callsFor(call.customer).filter(c => c.id !== call.id)
    .sort((a,b) => callWhen(b) - callWhen(a));
  for(const c of sources){
    for(const e of (c.entries||[])){
      if(e.type !== 'health' || !e.asset) continue;
      const ek = assetKey(e.asset);
      if(ek === k || ek.startsWith(k) || k.startsWith(ek)) out.push({e:e, date:c.date, when:callWhen(c)});
    }
  }
  return out;
}
function renderHealthHistory(){
  const el = $('hPrev');
  if(!el) return;
  const hits = healthHistory($('hAsset').value);
  if(!hits.length){ showMsg(el, '', ''); return; }
  const h = hits[0];
  const older = hits.length > 1 ? ' (' + (hits.length-1) + ' earlier ' +
    (hits.length === 2 ? 'one' : 'ones') + ' as well)' : '';
  const days = Math.floor((Date.now() - h.when) / 86400000);
  // an unresolved Urgent from last time is the one worth shouting about
  const cls = h.e.severity === 'Urgent' ? 'warn' : 'info';
  showMsg(el, cls, '<b>Logged here before.</b> ' + esc(h.date) +
    (days > 0 ? ' (' + days + ' days ago)' : '') + ' as ' +
    esc(h.e.htype || 'a fault') + (h.e.severity ? ', ' + esc(h.e.severity) : '') + older +
    '<br>' + esc(String(h.e.fault||'').slice(0,160)) +
    (h.e.action ? '<br>Action was: ' + esc(h.e.action) : ''));
}
$('hAsset').addEventListener('input', renderHealthHistory);

/* ---------- photos on the form ----------
   An entry almost always wants a photo, and taking one used to mean saving the
   entry first, finding its card on the dashboard and tapping Camera there. Only
   the health screen had buttons; belt, project and note had none at all, which
   is backwards - the belt is the thing you are standing in front of.

   The obstacle was that an entry has no photos array until it is saved, so a
   photo taken before saving has nowhere to go. Health solved it with a pending
   buffer. This is that solution generalised to all four, with one pair of file
   inputs shared between them and the kind held in shotsTarget.

   Photos attach the moment you pick them. Tapping a thumbnail opens it full
   screen, where pinch and double-tap zoom in far enough to tell one conveyor
   from another, and it can be dropped from there. No confirm step on the way
   in: the photo is usually right, and paying a tap every time to catch the
   times it is not costs more than it saves. */
const SHOT_PREFIX = {belt:'b', project:'p', note:'n', health:'h'};
const SHOTS = {belt:[], project:[], note:[], health:[]};
let shotsTarget = null;

function shotEl(kind, suffix){ return $(SHOT_PREFIX[kind] + suffix); }

function renderShots(kind){
  const list = SHOTS[kind], el = shotEl(kind, 'Shots');
  if(!el) return;
  el.innerHTML = list.map((p,i) => '<img src="'+photoSrc(p)+'" data-shot="'+i+'" '+
    'alt="Photo '+(i+1)+'">').join('');
  el.querySelectorAll('[data-shot]').forEach(img => img.addEventListener('click', ()=>{
    // straight to the viewer; removal lives in there, next to the zoom
    openPhoto(list, +img.dataset.shot, 'Photo on this entry', {
      onRemove: i => { releasePhoto(list[i]); list.splice(i,1); renderShots(kind); }
    });
  }));
  const n = list.length, cnt = shotEl(kind, 'ShotN');
  if(cnt) cnt.textContent = n ? n + (n===1 ? ' photo' : ' photos') + ' ready' : '';
}
async function addShots(kind, files){
  let bad = 0;
  for(const f of files){
    try { SHOTS[kind].push(await shrink(f)); }
    catch(err){ bad++; console.error('skipped', f.name, err); }
  }
  renderShots(kind);
  if(bad) toast(bad + (bad===1 ? ' photo could not be read' : ' photos could not be read'));
}
function resetShots(kind){
  SHOTS[kind].forEach(releasePhoto);
  SHOTS[kind] = [];
  renderShots(kind);
}
/* Hands the buffer to the entry being saved and empties it in one step, so a
   second save cannot attach the same photos twice. */
function takeShots(kind){
  const list = SHOTS[kind];
  SHOTS[kind] = [];
  renderShots(kind);
  return list;
}
function loadShots(kind, photos){
  SHOTS[kind].forEach(releasePhoto);
  SHOTS[kind] = (photos || []).slice();
  renderShots(kind);
}
Object.keys(SHOT_PREFIX).forEach(kind => {
  const cam = shotEl(kind, 'Cam'), gal = shotEl(kind, 'Gal');
  if(cam) cam.innerHTML = icon('camera');
  if(gal) gal.innerHTML = icon('image');
  if(cam) cam.addEventListener('click', ()=>{
    shotsTarget = kind; $('entCamIn').value=''; $('entCamIn').click();
  });
  if(gal) gal.addEventListener('click', ()=>{
    shotsTarget = kind; $('entGalIn').value=''; $('entGalIn').click();
  });
});
/* One shared pair of inputs. shotsTarget is cleared straight after use - a stale
   one would drop the next set of photos onto the wrong entry, which is the same
   trap photoTarget already carries a warning about. */
function entryShotsPicked(e){
  const kind = shotsTarget; shotsTarget = null;
  const files = [...e.target.files];
  if(!kind || !files.length) return;
  addShots(kind, files);
}
$('entCamIn').addEventListener('change', entryShotsPicked);
$('entGalIn').addEventListener('change', entryShotsPicked);

function resetHealth(){ clearEditing(); healthExtra = null;
  ['hAsset','hFault','hAction','hComment'].forEach(i=>$(i).value=''); hSevVal='';
  document.querySelectorAll('#hSev button').forEach(x=>x.classList.remove('on'));
  $('hErr').classList.remove('show'); $('hSevErr').classList.remove('show');
  resetShots('health');
  showMsg($('hPrev'), '', ''); }
document.querySelectorAll('#hSev button').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('#hSev button').forEach(x=>x.classList.remove('on'));
  b.classList.add('on'); hSevVal=b.dataset.v;
  $('hSevErr').classList.remove('show');
}));
$('hSave').addEventListener('click', async ()=>{
  const f = $('hFault').value.trim();
  if(!f){ $('hErr').classList.add('show'); $('hFault').focus(); return; }
  /* Severity used to save empty and then print as if nothing was wrong. An
     unanswered question is not the same as "not important", so it is asked. */
  if(!hSevVal){
    $('hSevErr').classList.add('show');
    // jsdom has no scrollIntoView, and neither do some older webviews
    if($('hSev').scrollIntoView) $('hSev').scrollIntoView({block:'center'});
    return;
  }
  /* Library fields first, form fields second, so a hand-typed edit always wins
     over a stale library value. */
  const wasEdit = editingIdx != null;
  /* On an edit the photos already on the entry are kept and anything newly shot
     is added, rather than the form's list replacing what is stored. */
  const kept = (wasEdit && call.entries[editingIdx]) ? (call.entries[editingIdx].photos || []) : [];
  const shots = takeShots('health');
  const n = shots.length;
  commitEntry(Object.assign({}, (wasEdit ? call.entries[editingIdx] : null) || {}, healthExtra || {}, {
    type:'health', asset:$('hAsset').value.trim(), fault:f, htype:$('hType').value,
    severity:hSevVal, action:$('hAction').value.trim(), comment:$('hComment').value.trim(),
    photos: kept.concat(shots)}), false);
  healthExtra = null;
  clearEditing();
  await saveCall();
  toast(wasEdit ? 'Fault updated'
                : (n ? ('Fault logged with '+n+' photo'+(n===1?'':'s')) : 'Fault logged'));
  draftSaved('health'); await saveCall();
  go('dash');
});

/* ---------- photos ---------- */
/* Photos are stored as Blobs, not data URIs. Base64 inflates a JPEG by about a
   third and forces it to be held as a string; IndexedDB stores a Blob natively.
   Conversion to base64 happens once, inside the compile step, so the output file
   is unchanged. Roughly 25% of the largest thing in the database, saved.

   Calls written before this change hold data-URI strings. Both shapes are read
   everywhere, so an existing call keeps working and quietly converts nothing. */
const isBlobPhoto = p => (typeof Blob !== 'undefined') && (p instanceof Blob);
function photoBytes(p){
  if(isBlobPhoto(p)) return p.size;
  const s = String(p||''); const i = s.indexOf(',');
  return i < 0 ? s.length : Math.round((s.length - i - 1) * 0.75);
}
function callBytes(c){
  let n = 0;
  (c.entries||[]).forEach(e => (e.photos||[]).forEach(p => n += photoBytes(p)));
  (c.loose||[]).forEach(p => n += photoBytes(p));
  return n;
}
function humanSize(b){
  if(b < 1024) return b+' B';
  if(b < 1024*1024) return Math.round(b/1024)+' KB';
  return (b/1048576).toFixed(1)+' MB';
}
function blobToDataURL(b){
  return new Promise((res,rej)=>{
    const r = new FileReader();
    r.onload = ()=>res(r.result);
    r.onerror = ()=>rej(r.error || new Error('could not read image'));
    r.readAsDataURL(b);
  });
}
function dataURLToBlob(u){
  const s = String(u), i = s.indexOf(',');
  if(i < 0) throw new Error('not a data URI');
  const mime = (s.slice(0,i).match(/data:([^;]+)/) || [,'image/jpeg'])[1];
  const bin = atob(s.slice(i+1));
  const arr = new Uint8Array(bin.length);
  for(let k=0;k<bin.length;k++) arr[k] = bin.charCodeAt(k);
  return new Blob([arr], {type:mime});
}
async function photoDataURL(p){ return isBlobPhoto(p) ? await blobToDataURL(p) : String(p); }

/* Object URLs for the thumbnails. Held in a map keyed on the Blob so a re-render
   reuses the same URL rather than leaking a new one every time the dashboard
   redraws, and released when the call is put down. */
const OBJ_URLS = new Map();
function photoSrc(p){
  if(!isBlobPhoto(p)) return String(p);
  let u = OBJ_URLS.get(p);
  if(!u){ u = URL.createObjectURL(p); OBJ_URLS.set(p, u); }
  return u;
}
function releasePhoto(p){
  const u = OBJ_URLS.get(p);
  if(u){ URL.revokeObjectURL(u); OBJ_URLS.delete(p); }
}
function releaseAllPhotos(){
  OBJ_URLS.forEach(u => URL.revokeObjectURL(u));
  OBJ_URLS.clear();
}

function barPhotoTap(input){
  if(!call){ toast('Open a call first'); return; }
  photoTarget = call.entries.length ? null : 'loose';
  input.value=''; input.click();
}
$('barCamera').innerHTML = icon('camera');
$('barGallery').innerHTML = icon('image');
$('barManuals').innerHTML = icon('book');
$('barCamera').addEventListener('click', ()=>barPhotoTap($('camInput')));
$('barGallery').addEventListener('click', ()=>barPhotoTap($('galInput')));

async function addPhotos(files){
  const target = photoTarget;
  photoTarget = null;
  if(!files.length) return;
  if(!call){ toast('Open a call first'); return; }

  let bucket, label;
  if(target === 'loose' || (target == null && !call.entries.length)){
    call.loose = call.loose || [];
    bucket = call.loose; label = 'loose photos';
  } else {
    const idx = (typeof target === 'number' && call.entries[target]) ? target : call.entries.length-1;
    const entry = call.entries[idx];
    entry.photos = entry.photos || [];
    bucket = entry.photos;
    label = entry.asset || entry.project || entry.topic || 'entry';
  }

  let ok = 0;
  for(const f of files){
    try { bucket.push(await shrink(f)); ok++; }
    catch(err){ console.error('skipped', f.name, err); }
  }
  await saveCall();
  const n = bucket.length;
  toast(ok===1 ? ('Photo '+n+' held against '+label)
               : (ok+' photos held against '+label+' ('+n+' total)'));
  if(screen==='dash') renderDash();
}
$('camInput').addEventListener('change', e => addPhotos([...e.target.files]));
$('galInput').addEventListener('change', e => addPhotos([...e.target.files]));
function shrink(file, max=1400, q=0.72){
  return new Promise((res,rej)=>{
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = ()=>{
      let {width:w, height:h} = img;
      if(w>max || h>max){ const s = Math.min(max/w, max/h); w = Math.round(w*s); h = Math.round(h*s); }
      const cv = document.createElement('canvas'); cv.width=w; cv.height=h;
      cv.getContext('2d').drawImage(img,0,0,w,h);
      URL.revokeObjectURL(url);
      // toBlob rather than toDataURL: the result goes straight into IndexedDB
      if(cv.toBlob){
        cv.toBlob(b => b ? res(b) : rej(new Error('could not encode image')), 'image/jpeg', q);
      } else {
        try { res(dataURLToBlob(cv.toDataURL('image/jpeg', q))); }
        catch(e){ rej(e); }
      }
    };
    img.onerror = ()=>{ URL.revokeObjectURL(url); rej(new Error('bad image')); };
    img.src = url;
  });
}

/* Urgent first. Nobody reads to the bottom of a list, so the order has to carry
   the meaning rather than the reader having to find it. */
const SEV_ORDER = {Urgent:0, Plan:1, Monitor:2};
const bySeverity = (a,b) => (SEV_ORDER[a.severity] ?? 3) - (SEV_ORDER[b.severity] ?? 3);
/* Priority is the maintenance work order; severity is the condition found.
   They usually agree. Where they don't the work order wins, because that is the
   list the maintenance team acts from. Findings with no priority - anything
   logged before the fault library existed - keep their severity order among
   themselves and sit below anything prioritised. */
const PRI_ORDER = {Critical:0, High:1, Medium:2, Low:3};
const byWorkOrder = (a,b) => {
  const pa = PRI_ORDER[a.priority], pb = PRI_ORDER[b.priority];
  if (pa !== undefined || pb !== undefined) return (pa ?? 9) - (pb ?? 9);
  return bySeverity(a,b);
};

/* ---------- compile ---------- */
const DASH_CH = '\u2014';
const V = v => { v = (v==null?'':String(v)).trim(); return (v===''||v==='N/A') ? DASH_CH : esc(v); };
// Blobs become base64 here and nowhere else, so the output file is byte-for-byte
// what it was when photos were stored as data URIs.
/* ---------- image mode ----------
   'full'      - 420px, stacked. What a customer report needs.
   'thumb'     - the same bytes, rendered at 148px, expandable by tapping.
   'thumbonly' - genuinely re-encoded small. The only mode that shrinks the file,
                 and the only one where there is nothing behind the thumbnail.

   The default is set once in Settings; the dashboard picker overrides it for a
   single output without changing the default. Remembering the last choice
   instead would mean one customer PDF quietly changing every RFQ after it. */
const IMG_MODES = ['full','thumb','thumbonly'];
const THUMB_PX = 320, THUMB_Q = 0.6;
function defaultImgMode(){
  const v = localStorage.getItem(LS('imgMode'));
  return IMG_MODES.includes(v) ? v : 'full';
}
function setDefaultImgMode(v){
  if(IMG_MODES.includes(v)) localStorage.setItem(LS('imgMode'), v);
}
async function photoImgs(list, mode){
  const out = [];
  for(const p of list){
    if(mode === 'thumbonly'){
      /* Re-encoded small, so the bytes actually leave the file. A photo that
         will not re-encode falls back to the full one rather than vanishing -
         a missing picture is worse than a large file. */
      let src;
      try {
        const blob = isBlobPhoto(p) ? p : dataURLToBlob(String(p));
        src = await blobToDataURL(await shrink(blob, THUMB_PX, THUMB_Q));
      } catch(e){ console.warn('thumbnail', e); src = await photoDataURL(p); }
      out.push('<img src="'+src+'">');
    } else {
      out.push('<img src="'+(await photoDataURL(p))+'">');
    }
  }
  return out.join('');
}
/* The in-document control. Only emitted where there is something to toggle, so
   a thumbonly file does not offer to show full-size images it does not carry.

   This needs a <script>, which runs when the file is opened as an attachment in
   a browser - how these files are delivered. Pasted into an email body instead,
   scripts and <style> blocks are stripped and the file arrives frozen in the
   mode it compiled in, which is why the compile-time choice is the one that has
   to be right. */
function imgToggleHTML(mode){
  if(mode === 'thumbonly') return '<div class="otog"><p>Images are thumbnails only. '+
    'Full-size copies were not included in this file.</p></div>';
  return '<div class="otog"><button type="button" id="imgtog"></button>'+
    '<p>Tap any photo to open it on its own.</p></div>';
}
function imgToggleScript(mode){
  if(mode === 'thumbonly') return '';
  return '<script>(function(){var b=document.body,t=document.getElementById("imgtog");'+
    'if(!t)return;function lbl(){t.textContent=b.className.indexOf("tn")>=0?'+
    '"Show images full size":"Show thumbnails";}'+
    't.onclick=function(){var big=document.querySelectorAll(".ph img.big");'+
    'for(var i=0;i<big.length;i++)big[i].className="";'+
    'b.className=b.className.indexOf("tn")>=0?"":"tn";lbl();};'+
    'document.addEventListener("click",function(e){var el=e.target;'+
    'if(!el||el.tagName!=="IMG")return;var p=el.parentNode;'+
    'if(!p||p.className.indexOf("ph")<0)return;'+
    'if(b.className.indexOf("tn")<0)return;'+
    'el.className=el.className?"":"big";});lbl();})();<\/script>';
}

function renderCompileStat(){
  const n = t => call.entries.filter(e=>e.type===t).length;
  const ph = call.entries.reduce((a,e)=>a+(e.photos?e.photos.length:0),0) + (call.loose?call.loose.length:0);
  const bytes = callBytes(call);
  const sent = call.entries.reduce((a,e)=>a+(e.detached?e.detached.n:0),0) +
               (call.looseDetached ? call.looseDetached.n : 0);
  $('compStat').innerHTML = '<b>'+esc(call.customer)+'</b><br>'+
    [['belt','belt'],['project','project'],['note','note'],['health','health item']]
      .map(([t,w]) => n(t)+' '+w+(n(t)===1?'':'s')).join(', ')+'<br>'+
    ph+' photo'+(ph===1?'':'s')+' to embed'+(ph?' ('+humanSize(bytes)+' held on this phone)':'')+
    (sent ? '<br><span class="tag">'+sent+' photo'+(sent===1?'':'s')+' already sent and dropped</span>' : '') +
    (call.photosArchived ? '<br><span class="tag">Full-size photos archived on the PC, '+
      esc(new Date(call.photosArchived.at).toLocaleDateString())+': '+
      esc([call.photosArchived.folder, call.photosArchived.path].filter(Boolean).join('\\'))+'</span>' : '');
  renderDetach();
}
/* The offer to drop image data. Never automatic, never before a confirmed share -
   the photos exist in OneDrive at that point and the phone is holding a second
   copy of the largest thing in the database. A call goes from ~25 MB to ~20 KB. */
function renderDetach(){
  const el = $('detachWrap');
  if(!el) return;
  const bytes = callBytes(call);
  if(!call.shared || !bytes){ el.innerHTML = ''; return; }
  el.innerHTML = '<div class="card"><div class="hd"><span class="t">Photos still on this phone</span></div>'+
    '<p class="meta">These notes were shared '+new Date(call.shared).toLocaleString()+'. '+
    'The photos went with the file, and this phone is holding a second copy of '+humanSize(bytes)+'.</p>'+
    '<div class="cardbar wide"><button id="detachBtn">Drop the photos, keep the record</button></div></div>';
  $('detachBtn').addEventListener('click', detachPhotos);
}
async function detachPhotos(){
  const bytes = callBytes(call), when = Date.now();
  if(!confirm('Drop the image data from this call?\n\n'+humanSize(bytes)+' will be freed. The notes '+
     'file already sent keeps the photos. This cannot be undone, and the photos cannot be recovered '+
     'from this phone afterwards.')) return;
  call.entries.forEach(e => {
    const n = (e.photos||[]).length;
    if(!n) return;
    e.photos.forEach(releasePhoto);
    e.detached = {n: (e.detached ? e.detached.n : 0) + n, at: when, file: call.sharedAs || ''};
    e.photos = [];
  });
  const ln = (call.loose||[]).length;
  if(ln){
    call.loose.forEach(releasePhoto);
    call.looseDetached = {n: (call.looseDetached ? call.looseDetached.n : 0) + ln, at: when, file: call.sharedAs || ''};
    call.loose = [];
  }
  await saveCall();
  /* The log list carries thumbnails of the photos just dropped, so the whole
     dashboard is redrawn. The summary inside the sheet is redrawn too - the
     detach offer is in there, and it is the thing that just changed. */
  if(screen === 'dash') renderDash();
  renderCompileStat();
  renderOutSummary();
  toast(humanSize(bytes)+' freed - the record and the photo count are kept');
}
/* ---------- the compiled document ----------
   The stylesheet and the masthead are shared by every output: call notes,
   the health and belt extracts, and the belt RFQ. They sat inside
   buildNotesHTML() as locals, which meant a second builder had to either
   duplicate 90 lines of CSS and a 20 KB base64 logo or inherit every branch
   of the first one. Hoisted, unchanged. */
const NOTES_CSS =
  /* ---------- A4 ----------
     These files are read on a laptop and then printed or saved as a PDF for a
     customer, so the page is an A4 sheet rather than whatever width the window
     happens to be. Full-width text was the complaint: a 1600px monitor gave
     lines of 200 characters that nobody reads and that reflowed completely when
     printed, so what you checked on screen was not what came out.

     210mm wide with 15mm side margins leaves a 180mm text column - the same
     measure as the printed page, so the screen is now a preview of the PDF.
     print-color-adjust keeps the red masthead and the tinted label cells; left
     to itself a browser drops background colours when printing and the document
     comes out as grey text on white. */
  '@page{size:A4;margin:14mm}'+
  'html{background:#E9EAEB;-webkit-print-color-adjust:exact;print-color-adjust:exact}'+
  'body{font-family:Roboto,Arial,"Helvetica Neue",Helvetica,sans-serif;font-size:11pt;'+
    'color:#222222;margin:12px auto;padding:0;max-width:210mm;background:#FFFFFF;'+
    'box-shadow:0 1px 6px rgba(0,0,0,.18)}'+
  '.pg{padding:0 15mm 15mm}'+
  /* ---------- where the pages break ----------
     A heading stranded at the foot of a page, or a belt table split from the
     photographs underneath it, is what "printed strangely" means in practice.
     Headings hold on to what follows them, rows do not split, and the blocks
     already carry page-break-inside:avoid. A block taller than a page still
     splits - nothing can prevent that - but nothing splits that fits. */
  '@media print{'+
    'html{background:#FFFFFF}'+
    'body{max-width:none;box-shadow:none;margin:0}'+
    '.pg{padding:0 0 8mm}'+
    '.mast{margin:0 0 16px;padding:10px 12px}'+
    'h1,h2,h3,th{page-break-after:avoid;break-after:avoid}'+
    'tr,img{page-break-inside:avoid;break-inside:avoid}'+
    'table{page-break-inside:auto}'+
    'thead{display:table-header-group}'+
    '.sep{page-break-after:avoid}'+
    'p{orphans:3;widows:3}'+
  '}'+
  '.mast{background:#ED1C24;padding:13px 15mm;margin:0 0 22px}'+
  '.mast img{height:26px;width:auto;display:block}'+
  /* The document used to be a grid of boxes: every cell ruled on all four
     sides, headings underlined, blocks outlined. Accurate and hard to read -
     the eye has to cross a line to get to every value.

     The vertical rules are gone. Rows are separated by a hairline and the
     label column is set in grey small-caps rather than boxed in, so the page
     reads as columns of information instead of a spreadsheet. Nothing about
     the content or the field order changed. */
  'h1{font-size:17pt;margin:0 0 2px;color:#222222;letter-spacing:-.015em;font-weight:bold}'+
  'h2{font-size:11pt;margin:26px 0 10px;padding:0 0 5px;border-bottom:1px solid #E3E3E3;'+
    'color:#00708D;letter-spacing:.09em;text-transform:uppercase;font-weight:bold}'+
  'h3{font-size:12pt;margin:18px 0 7px;color:#222222;letter-spacing:-.01em}'+
  '.sub{color:#77787A;font-size:9.5pt;margin:0 0 16px;line-height:1.5}'+
  /* The masthead carries the logo as an image. An image can fail - blocked by a
     mail client, stripped on a paste - and the document then names no company at
     all, which for something going outside is not good enough. The name is set
     as text above the title as well. */
  '.eyebrow{font-size:8.5pt;font-weight:bold;letter-spacing:.14em;text-transform:uppercase;'+
    'color:#479EBC;margin:0 0 4px}'+
  /* ---------- tables ----------
     These were set without vertical rules: labels in 8.5pt grey uppercase, two
     fields to a row, four columns and nothing between them. It reads well
     enough as a screen of prose and badly as a specification on paper - with no
     rule between the second value and the third label, the eye has to count
     across to work out which value belongs to which field, and at 8.5pt
     uppercase the labels themselves are slow to read.

     So: ruled on all four sides, label cells filled, headers filled and bold,
     labels back to sentence case at a readable size. A spec sheet is a
     reference document - somebody hunting for a rod material should land on it
     without reading anything else. */
  'table{border-collapse:collapse;width:100%;margin:0 0 14px;font-size:10pt;'+
    'border:1px solid #B9BCBF}'+
  'th{background:#E3F0F5;color:#00708D;text-align:left;padding:7px 10px;'+
    'border:1px solid #B9BCBF;font-size:9pt;font-weight:bold;letter-spacing:.06em;'+
    'text-transform:uppercase}'+
  'td{padding:7px 10px;border:1px solid #D4D6D8;vertical-align:top;line-height:1.4}'+
  'td.l{background:#F7F8F8;width:38%;color:#4D4D4F;font-weight:bold;font-size:9.5pt;'+
    'letter-spacing:0;text-transform:none}'+
  'td.v{background:#FFFFFF}'+
  /* The group band. A belt carries thirty-odd fields across three subsystems,
     and a flat list of thirty rows is a wall. Banding them means somebody after
     a bore size looks in one place instead of scanning the lot. */
  'th.grp{background:#ACD3E1;color:#222222;font-size:9.5pt;letter-spacing:.09em}'+
  '.flag{color:#B2232F;font-weight:bold}'+
  '.sent{font-size:9.5pt;color:#77787A;font-style:italic;margin:2px 0 12px}'+
  /* ---------- blocks ----------
     The document deliberately dropped its grid of boxes, and the body text is
     better for it. A belt specification is not body text: it is a form, and
     read as bare rows it was hard to tell where one belt stopped and the next
     started. So the box comes back here and nowhere else - a ruled card with a
     cyan spine, the same device the app uses for a section header.

     The label column gets the input background from the brand palette, so a
     field reads as a field rather than as grey text floating beside a value. */
  '.blk{page-break-inside:avoid;margin:0 0 22px;border:1px solid #EDEDED;'+
    'border-left:3px solid #479EBC;border-radius:4px;padding:14px 16px 6px;'+
    'background:#FFFFFF}'+
  '.blk h3{margin:0 0 12px;padding:0 0 8px;border-bottom:2px solid #E3F0F5}'+
  '.blk table{margin:0 0 6px}'+
  /* The rule between one block and the next. Asked for explicitly, and it does
     work the card border alone does not: at a page break the border can end up
     off-screen, and this keeps the two apart wherever they land. */
  '.sep{height:0;border:0;border-top:2px solid #E3F0F5;margin:0 0 22px}'+
  /* General comments. Set bold because they are only ever written when
     something needs saying - a condition, a non-standard item, the thing that
     would otherwise be missed between rows of dimensions. */
  '.cmt{margin:10px 0 8px;padding:9px 12px;background:#F7F8F8;border-left:3px solid #479EBC;'+
    'font-weight:bold;color:#222222;font-size:10pt;line-height:1.45;page-break-inside:avoid}'+
  '.cmt b{display:block;font-size:8pt;letter-spacing:.07em;text-transform:uppercase;'+
    'color:#77787A;margin:0 0 4px}'+
  /* One comment can now hold several paragraphs and bullet lists, not just one
     run of text, so the inner blocks need their own spacing rather than the
     default browser margin on every <p>/<ul>. */
  '.cmt p{margin:0 0 6px}.cmt p:last-child{margin-bottom:0}'+
  '.cmt ul{margin:0 0 6px 18px;padding:0}.cmt ul:last-child{margin-bottom:0}'+
  '.cmt li{margin:0 0 2px}'+
  '.ph{margin:10px 0 16px}'+
  '.ph img{max-width:420px;width:auto;height:auto;border:1px solid #E3E3E3;'+
    'border-radius:3px;margin:0 10px 10px 0}'+
  'img{max-width:100%}'+
  'td,th{word-wrap:break-word;overflow-wrap:break-word}'+
  '.ft{background:#363738;color:#FFFFFF;font-size:8pt;letter-spacing:.04em;padding:9px 18px;margin:32px 0 0}'+
  /* Fault cards. The app stylesheet is not available here, so the rules are
     repeated with print in mind: one finding per page, so the sheet handed to
     a fitter covers one job and nothing else. */
  '.hc{border:1px solid #E3E3E3;border-radius:4px;margin:0 0 18px;page-break-inside:avoid;'+
    'overflow:hidden}'+
  '.hc + .hc{page-break-before:always}'+
  '.hc-top{background:#F7F8F8;border-bottom:1px solid #E3E3E3;padding:9px 14px;overflow:hidden}'+
  '.hc-asset{float:left;font-weight:bold;color:#00708D;font-size:12pt}'+
  '.hc-tags{float:right}'+
  '.fl-pill{display:inline-block;padding:2px 9px;margin-left:5px;font-size:8pt;font-weight:bold;'+
    'border:1px solid #E3E3E3;border-radius:10px;letter-spacing:.03em}'+
  '.fl-p-critical{background:#FBE7E8;color:#B2232F;border-color:#B2232F}'+
  '.fl-p-high{background:#FBEFE2;color:#B35100}.fl-p-medium{background:#E3F0F5;color:#00708D}'+
  '.fl-p-low{background:#F7F8F8;color:#77787A}.fl-s{background:#FFFFFF;color:#4D4D4F}'+
  '.fl-state{background:#FFFFFF;color:#77787A}'+
  '.hc-fault{margin:10px 12px 6px;font-size:12pt;font-weight:bold}'+
  '.hc-code{font-size:9pt;color:#77787A;font-weight:normal}'+
  '.hc-row{border-top:1px solid #E6E6E6;overflow:hidden}'+
  '.hc-lbl{float:left;width:32%;padding:7px 12px;background:#F7F8F8;font-size:9pt;font-weight:bold;color:#4D4D4F}'+
  '.hc-val{margin-left:32%;padding:7px 12px;overflow:hidden}'+
  '.hc-val p{margin:0 0 4px}.hc-val ul{margin:0;padding-left:16px}'+
  '.hc-risk li{color:#B2232F}.hc-gain{color:#00708D;font-weight:bold}'+
  '.hc-spec li{color:#4D4D4F;font-size:9.5pt}'+
  '.hc-src{margin-top:4px;font-size:8pt;color:#77787A}'+
  '.hc-tbl{width:100%;border-collapse:collapse;font-size:9.5pt;margin:0}'+
  '.hc-tbl th{background:transparent;border:0;padding:2px 8px 2px 0;text-align:left;white-space:nowrap;width:1%;color:#4D4D4F}'+
  '.hc-tbl td{border:0;padding:2px 0}'+
  /* ---------- image display ----------
     Two audiences want opposite things. Customer service is reading for the
     specification and full-bleed photographs get in the way; a site report going
     to a customer as a PDF needs every photo legible.

     Thumbnails are a display size, not a second copy. The full-resolution image
     is embedded once and rendered small, so the file is the same size either
     way, to the byte. Only 'thumbonly' is genuinely smaller, because it drops
     the full images rather than shrinking how they are shown.

     Toggling swaps one class on <body>, and that is also what prints: whatever
     is on screen when you print is what comes out. */
  'body.tn .ph{margin:8px 0 14px}'+
  'body.tn .ph img{max-width:148px;max-height:148px;cursor:zoom-in;margin:0 8px 8px 0}'+
  'body.tn .ph img.big{max-width:420px;max-height:none;cursor:zoom-out}'+
  '.otog{margin:0 0 18px}'+
  '.otog button{font:inherit;font-size:9pt;color:#00708D;background:#F7F8F8;'+
    'border:1px solid #E3E3E3;border-radius:3px;padding:6px 13px;cursor:pointer}'+
  '.otog p{margin:6px 0 0;font-size:8.5pt;color:#77787A}'+
  '@media print{.otog{display:none}}';
const NOTES_LOGO = 'data:image/png;base64,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';

/* The browser-tab icon for the compiled documents - the app icon at 32x32, not
   the full letterhead logo, so it stays small. Purely cosmetic: it makes the
   file look like it belongs to Field CRM once opened, nothing more. It can't
   change the icon shown on the file itself before it's opened (Explorer, an
   Outlook attachment list, the Android share sheet) - that's the OS's .html
   file association, not anything this file's content can override. */
const NOTES_FAVICON = 'data:image/png;base64,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';

/* ---------- the belt specification table ----------
   One field list, used by the call notes and by the RFQ. Split out because two
   copies would drift the moment a field was added to the form, and customer
   service would get a different spec depending on which button was pressed.

   Banded into the three subsystems the form itself is banded into. A belt
   carries thirty-odd fields; presented flat they are a wall, and somebody after
   a bore size has to read all of it. Grouped, they look in one place.

   Rows are [label, value, required]. A required one always prints, with an em
   dash when empty, because a missing width is information. An optional one that
   was never filled is dropped rather than printed as a dash - a belt with no
   flights used to produce ten empty rows. An entire group with nothing in it
   drops out, band and all. */
function beltSpecGroups(b, opts){
  opts = opts || {};
  const belt = [
    ['Line / description',      b.beltdesc, 0],
    ['Series',                  b.series,   1],
    ['Style / surface',         b.style,    1],
    ['Belt material',           b.beltmat,  1],
    ['Colour',                  b.colour,   0],
    ['Rod material',            b.rodmat,   1],
    ['Belt width (mm)',         b.width,    1],
    ['Belt length (m)',         b.beltlen,  0],
    ['Conveyor length (m)',     b.clength,  0],
    ['Inside frame width (mm)', b.frame,    0],
    ['Retrofit',                b.retrofit, 0]
  ];
  // quantity leads on a quote request: it is the thing being ordered
  if(opts.qty) belt.unshift(['Quantity', b.qty, 1]);
  if(opts.qcontact && b.qcontact) belt.push(['Quote contact', b.qcontact, 0]);
  const spr = [
    ['Description',          b.sprocket, 0],
    ['Part number',          b.sprpn,    0],
    ['Bore',                 b.sprbore,  0],
    ['Pitch diameter',       b.sprpd,    0],
    ['Material',             b.sprmat,   0],
    ['Build type or variant',b.sprvar,   0],
    ['Drive quantity',       b.sprdrive, 0],
    ['Idle quantity',        b.spridle,  0],
    ['Spacers fitted',       b.sprspacers ? 'Yes' : '', 0],
    ['Heavy duty retainers', b.sprhdret ? ('Yes' + (b.sprhdretqty ? ' \u00d7 '+b.sprhdretqty : '')) : '', 0]
  ];
  const acc = [
    ['Flight type',           b.fstyle,   0],
    ['Flight material',       b.flmat,    0],
    ['Flight height (mm)',    b.fheight,  0],
    ['Every N rows',          b.frows,    0],
    ['Flight spacing (mm)',   b.fspacing, 0],
    ['Indent (mm)',           b.findent,  0],
    ['Centre notch (mm)',     b.cnotch,   0],
    ['Sideguard type',        b.sgtype,   0],
    ['Sideguard material',    b.sgmat,    0],
    ['Sideguard height (mm)', b.sgheight, 0]
  ];
  const keep = r => r[2] || (r[1] !== '' && r[1] != null && r[1] !== false);
  return [['Belt', belt.filter(keep)],
          ['Sprockets', spr.filter(keep)],
          ['Flights and sideguards', acc.filter(keep)]]
    .filter(g => g[1].length);
}
// flat view of the same list, for anything that wants the rows without the bands
function beltSpecRows(b, opts){
  return beltSpecGroups(b, opts).reduce((a,g) => a.concat(g[1]), []).map(r => [r[0], r[1]]);
}
/* One field per row, ruled, with the band across the top of each group. The old
   layout ran two fields to a row to keep the table short; without a rule between
   the second value and the third label you had to count across to see which
   value went with which field, which is slower than the extra rows ever were. */
function beltSpecTableHTML(groups){
  const p = ['<table class="spec">'];
  groups.forEach(([name, rows]) => {
    p.push('<tr><th class="grp" colspan="2">'+esc(name)+'</th></tr>');
    rows.forEach(r => p.push('<tr><td class="l">'+r[0]+'</td><td class="v">'+V(r[1])+'</td></tr>'));
  });
  p.push('</table>');
  return p.join('');
}
/* Free text on a belt or a fault. Emitted only when there is something in it -
   an empty comment box is not a finding, and an em dash here would read as one.
   The field itself stays a plain textarea - no rich-text editor - but a blank
   line is read as a paragraph break, and a line starting with -, * or a bullet
   character becomes a real <ul><li> rather than a flat run of <br>, so notes
   taken in a meeting keep their shape in the output. */
const COMMENT_BULLET_RE = /^[-*•]\s+/;
function commentHTML(e){
  const body = commentBodyHTML(e && e.comment);
  return body ? '<div class="cmt"><b>General comments</b>'+body+'</div>' : '';
}
// paragraphs on blank lines, and a run of lines starting with - or a bullet as a list
function commentBodyHTML(text){
  const t = (text ? String(text) : '').trim();
  if(!t) return '';
  return t.split(/\n\s*\n/).map(para => {
    const lines = para.split('\n').map(l => l.trim()).filter(Boolean);
    if(!lines.length) return '';
    const runs = [];
    lines.forEach(l => {
      const kind = COMMENT_BULLET_RE.test(l) ? 'ul' : 'p';
      const last = runs[runs.length-1];
      if(last && last.kind === kind) last.items.push(l);
      else runs.push({kind, items:[l]});
    });
    return runs.map(r => r.kind === 'ul'
      ? '<ul>'+r.items.map(l => '<li>'+esc(l.replace(COMMENT_BULLET_RE,''))+'</li>').join('')+'</ul>'
      : '<p>'+r.items.map(esc).join('<br>')+'</p>'
    ).join('');
  }).join('');
}
/* Typing "* " or "- " for a bullet is easy enough at a keyboard but fiddly on
   a phone's on-screen one, so a button inserts the actual bullet character
   commentHTML() looks for at the cursor, on its own line. */
function insertCommentBullet(id){
  const el = $(id);
  const pos = el.selectionStart ?? el.value.length;
  const before = el.value.slice(0, pos), after = el.value.slice(pos);
  const needsNL = before.length && !before.endsWith('\n');
  const insert = (needsNL ? '\n' : '') + '• ';
  el.value = before + insert + after;
  const newPos = pos + insert.length;
  el.focus();
  el.setSelectionRange(newPos, newPos);
}
/* ================= AI tidy-up and Draft it (v95) =================
   BACKEND-PLAN.md Step 8. The Anthropic key lives in the Supabase project's
   secrets and the ai-tidy function uses it; the app never sees it. Tidy sends
   the one text box it sits under, Draft it sends the email's points and the
   task's details. Both go as plain text - the one place call text leaves the
   device unencrypted, and only when the button is tapped.

   The answer comes back into a sheet beside what you had, editable, and
   nothing changes until Use this. Keep mine, back, or closing the sheet
   leaves the field exactly as it was. */
let aiSeq = 0, aiApply = null;
async function aiAsk(payload){
  const {data, error} = await sbClient.functions.invoke('ai-tidy', {body: payload});
  if(error){
    let m = error.message || String(error);
    try { const j = await error.context.json(); if(j && j.message) m = j.message; } catch(e){}
    throw new Error(m);
  }
  if(!data) throw new Error('No answer came back');
  return data;
}
// the reasons it cannot run, said before anything opens
function aiBlocked(){
  if(!sbClient || !sbUser) return 'Sign in to cloud sync first: ⋯ on Home, Settings, Cloud sync';
  if(!navigator.onLine) return 'This needs signal';
  return '';
}
function aiOpen(head, outLabel, orig, email){
  $('aiHead').textContent = head;
  $('aiOutL').textContent = outLabel;
  $('aiOrig').textContent = orig || '—';
  $('aiSubjF').hidden = !email;
  $('aiOutF').hidden = true;
  $('aiSubj').value = ''; $('aiOut').value = '';
  $('aiUse').disabled = true;
  showMsg($('aiMsg'), 'info', 'Asking' + String.fromCharCode(8230) + ' usually a few seconds.');
  const d = $('aidlg');
  if(d.showModal) d.showModal(); else d.setAttribute('open','');
  pushDialog('aidlg');
  return ++aiSeq;
}
function aiAnswer(n, subject, text){
  if(n !== aiSeq || !$('aidlg').hasAttribute('open')) return false;   // closed, or a newer ask
  showMsg($('aiMsg'), '', '');
  $('aiOutF').hidden = false;
  if(subject != null) $('aiSubj').value = subject;
  $('aiOut').value = text;
  $('aiUse').disabled = false;
  return true;
}
function aiFailed(n, e){
  if(n !== aiSeq || !$('aidlg').hasAttribute('open')) return;
  console.warn('ai', e);
  showMsg($('aiMsg'), 'warn', 'That did not work: ' + esc(e.message || String(e)) + '. Nothing was changed.');
}
function closeAi(){
  aiSeq++; aiApply = null;
  const d = $('aidlg');
  if(d.close) d.close(); else d.removeAttribute('open');
}
function aiLeave(){
  if(history.state && history.state.dialog === 'aidlg') history.back();
  else closeAi();
}
// a field changed in code still has to look typed-in to the draft and dirty checks
function aiSet(el, v){ el.value = v; el.dispatchEvent(new Event('input', {bubbles: true})); }

async function aiTidy(id, field){
  const ta = $(id);
  const text = (ta.value || '').trim();
  if(!text){ toast('Type or dictate something first'); return; }
  const why = aiBlocked();
  if(why){ toast(why); return; }
  const n = aiOpen('Tidied', 'Tidied — change anything before you use it', ta.value, false);
  // a one-line box (Next action, Recommended action) takes it as one line
  aiApply = () => aiSet(ta, ta.tagName === 'INPUT' ? $('aiOut').value.replace(/\s*\n+\s*/g, '; ').trim() : $('aiOut').value);
  try {
    const r = await aiAsk({kind: 'tidy', field, text});
    aiAnswer(n, null, String(r.text || ''));
  } catch(e){ aiFailed(n, e); }
}
async function aiDraft(){
  const body = $('tkBody'), subj = $('tkSubject');
  const points = (body.value || '').trim(), title = ($('tkTitle').value || '').trim();
  if(!points && !title){ toast('Dictate the points into Body first'); return; }
  const why = aiBlocked();
  if(why){ toast(why); return; }
  const ct = $('tkContact');
  const contact = ct && ct.selectedIndex > 0 ? ct.options[ct.selectedIndex].textContent : '';
  const n = aiOpen('Draft', 'Body — change anything before you use it', points || title, true);
  aiApply = () => { aiSet(subj, $('aiSubj').value); aiSet(body, $('aiOut').value); };
  try {
    const r = await aiAsk({kind: 'email', points, details: {title, contact,
      account: $('tkAcct').value, project: $('tkProject').value, subject: subj.value}});
    aiAnswer(n, String(r.subject || ''), String(r.body || ''));
  } catch(e){ aiFailed(n, e); }
}
/* ---------- the visit summary and Tidy all (v100) ----------
   The summary heads the full call notes (only - the health check and belt
   requirements documents go to customers and already leave out notes and
   projects). Written by hand, dictated, or drafted by Write summary from
   everything logged, through the same sheet as Tidy. Tidy all runs Tidy on
   every box in the call, three at a time, and lists each with a tick. */
function renderVisitSummary(){
  const box = $('dashSum');
  if(!box || !call) return;
  box.hidden = isQuote(call);              // a quote request has no visit to sum up
  if(document.activeElement !== $('vSummary')) $('vSummary').value = call.summary || '';
  const t = (call.summary || '').replace(/\s+/g, ' ').trim();
  $('sumVisit').textContent = t ? (t.length > 70 ? t.slice(0, 70) + '…' : t) : 'Not written yet';
  $('vCoach').textContent = call.coaching && call.coaching.text ? 'Coaching' : 'Coach me';
}
$('vSummary').addEventListener('input', () => {
  if(!call) return;
  call.summary = $('vSummary').value;
  saveCall();
  renderVisitSummary();
});
// the call as plain text, for the AI to sum up: what was logged, nothing more
function callDigest(c){
  const L = [];
  const v = x => (x == null ? '' : String(x)).trim();
  const line = (k, x) => { x = v(x); if(x) L.push(k + ': ' + x); };
  line('Customer', c.customer); line('Site', c.site); line('Date', c.date); line('Call type', c.type);
  const ppl = (c.contacts || []).filter(docContact).map(x => [x.name, x.role].map(v).filter(Boolean).join(', ')).filter(Boolean);
  if(ppl.length) line('People seen', ppl.join('; '));
  let nb = 0, nh = 0;
  for(const e of c.entries || []){
    if(e.type === 'note') line('Note' + (v(e.topic) ? ' (' + v(e.topic) + ')' : ''), e.text);
    else if(e.type === 'project') line('Project ' + v(e.project), ['status ' + v(e.status), v(e.next) && 'next action ' + v(e.next),
      v(e.target) && 'target ' + v(e.target), v(e.owner) && 'owner ' + v(e.owner), v(e.notes) && 'notes ' + v(e.notes)].filter(x => v(x) && x !== 'status ').join('; '));
    else if(e.type === 'belt') line('Belt ' + (++nb) + (v(e.asset) ? ' (' + v(e.asset) + ')' : ''), [...new Set([v(e.beltdesc), [v(e.series), v(e.style)].filter(Boolean).join(' ')]),
      [v(e.beltmat), v(e.colour)].filter(Boolean).join(' '), v(e.width) && v(e.width) + ' mm wide', v(e.beltlen) && v(e.beltlen) + ' m long',
      v(e.sprocket) && 'sprockets ' + v(e.sprocket), v(e.qty) && 'quantity ' + v(e.qty), v(e.comment) && 'comments ' + v(e.comment)].filter(Boolean).join('; '));
    else if(e.type === 'health') line('Health check ' + (++nh) + (v(e.asset) ? ' (' + v(e.asset) + ')' : ''), [v(e.fault), v(e.severity) && 'severity ' + v(e.severity),
      v(e.action) && 'recommended action ' + v(e.action), v(e.comment) && 'comments ' + v(e.comment)].filter(Boolean).join('; '));
  }
  const tasks = (typeof TASKS !== 'undefined' ? TASKS : []).filter(t => t.callId === c.id).map(t => v(t.title)).filter(Boolean);
  if(tasks.length) line('Tasks raised', tasks.join('; '));
  return L.join('\n');
}
async function aiSummary(){
  if(!call) return;
  if(!(call.entries || []).length){ toast('Log something in the call first'); return; }
  const why = aiBlocked();
  if(why){ toast(why); return; }
  const n = aiOpen('Summary', 'Summary — change anything before you use it', $('vSummary').value, false);
  aiApply = () => aiSet($('vSummary'), $('aiOut').value);
  try {
    const r = await aiAsk({kind: 'summary', text: callDigest(call)});
    aiAnswer(n, null, String(r.text || ''));
  } catch(e){ aiFailed(n, e); }
}
$('vSumAi').addEventListener('click', () => aiSummary().catch(reportErr));

// every box in the call with something in it, and what kind of box it is
function tidyTargets(c){
  const out = [];
  let nb = 0, nh = 0;
  (c.entries || []).forEach((e, i) => {
    const add = (key, field, label) => { if(String(e[key] || '').trim()) out.push({i, key, field, label, text: String(e[key])}); };
    if(e.type === 'note') add('text', 'note', 'Note' + (e.topic ? ' — ' + e.topic : ''));
    else if(e.type === 'project'){
      const p = 'Project' + (e.project ? ' ' + e.project : '');
      add('next', 'short', p + ': next action'); add('notes', 'project', p + ': notes');
    } else if(e.type === 'belt'){
      add('comment', 'belt', 'Belt ' + (++nb) + (e.asset ? ' — ' + e.asset : '') + ': comments');
    } else if(e.type === 'health'){
      const h = 'Health check ' + (++nh) + (e.asset ? ' — ' + e.asset : '');
      add('fault', 'fault', h + ': fault'); add('action', 'short', h + ': recommended action'); add('comment', 'health', h + ': comments');
    }
  });
  return out;
}
let taSeq = 0, taItems = [];
function taRender(){
  $('taList').innerHTML = taItems.map((it, k) =>
    '<div class="taitem' + (it.err ? ' fail' : '') + '">' +
      '<label class="tah"><input type="checkbox" data-tause="' + k + '"' + (it.out == null || it.err ? ' disabled' : it.use ? ' checked' : '') + '><span>' + esc(it.label) + '</span></label>' +
      (it.err ? '<p class="hint">Not tidied: ' + esc(it.err) + '</p>'
        : it.out == null ? '<p class="hint">Tidying' + String.fromCharCode(8230) + '</p>'
        : '<textarea data-taout="' + k + '" rows="' + Math.min(8, Math.max(2, it.out.split('\n').length + 1)) + '">' + esc(it.out) + '</textarea>') +
      '<details><summary class="hint">Yours</summary><div class="aiorig">' + esc(it.text) + '</div></details>' +
    '</div>').join('');
  $('taList').querySelectorAll('[data-taout]').forEach(t => t.addEventListener('input', () => { taItems[+t.dataset.taout].out = t.value; }));
  $('taList').querySelectorAll('[data-tause]').forEach(b => b.addEventListener('change', () => { taItems[+b.dataset.tause].use = b.checked; }));
}
async function tidyAll(){
  if(!call) return;
  const items = tidyTargets(call);
  if(!items.length){ toast('Nothing written in this call yet'); return; }
  const why = aiBlocked();
  if(why){ toast(why); return; }
  const n = ++taSeq;
  taItems = items.map(x => Object.assign(x, {out: null, err: '', use: true}));
  $('taUse').disabled = true;
  showMsg($('taMsg'), 'info', 'Tidying ' + items.length + ' box' + (items.length === 1 ? '' : 'es') + String.fromCharCode(8230));
  taRender();
  const d = $('tidydlg');
  if(d.showModal) d.showModal(); else d.setAttribute('open','');
  pushDialog('tidydlg');
  let next = 0, done = 0;
  const worker = async () => {
    while(next < taItems.length){
      const it = taItems[next++];
      try { it.out = String((await aiAsk({kind: 'tidy', field: it.field, text: it.text})).text || ''); }
      catch(e){ it.err = e.message || String(e); it.use = false; }
      if(n !== taSeq) return;
      done++;
      showMsg($('taMsg'), 'info', 'Tidied ' + done + ' of ' + taItems.length + String.fromCharCode(8230));
      // keep anything typed in an answer already shown
      $('taList').querySelectorAll('[data-taout]').forEach(t => { taItems[+t.dataset.taout].out = t.value; });
      taRender();
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  if(n !== taSeq) return;
  const ok = taItems.filter(x => !x.err).length, bad = taItems.length - ok;
  showMsg($('taMsg'), bad ? 'warn' : 'ok', ok + ' tidied' + (bad ? ', ' + bad + ' not' : '') +
    '. Untick any you would rather keep as they are, change any wording, then tap Use ticked.');
  $('taUse').disabled = !ok;
}
function closeTidy(){
  taSeq++;
  const d = $('tidydlg');
  if(d.close) d.close(); else d.removeAttribute('open');
}
function tidyLeave(){
  if(history.state && history.state.dialog === 'tidydlg') history.back();
  else closeTidy();
}
$('vTidyAll').addEventListener('click', () => tidyAll().catch(reportErr));
$('taKeep').addEventListener('click', tidyLeave);
$('taUse').addEventListener('click', async () => {
  if(!call){ tidyLeave(); return; }
  $('taList').querySelectorAll('[data-taout]').forEach(t => { taItems[+t.dataset.taout].out = t.value; });
  let used = 0, moved = 0;
  for(const it of taItems){
    if(!it.use || it.err || it.out == null) continue;
    const e = call.entries[it.i];
    // changed or removed since it was sent: left alone rather than overwritten
    if(!e || String(e[it.key] || '') !== it.text){ moved++; continue; }
    e[it.key] = it.field === 'short' ? it.out.replace(/\s*\n+\s*/g, '; ').trim() : it.out;
    used++;
  }
  if(used) await saveCall();
  tidyLeave();
  renderDash();
  toast(used ? 'Used ' + used + (moved ? '; ' + moved + ' had changed meanwhile and were left' : '') : 'Nothing changed');
});
$('tidydlg').addEventListener('cancel', () => { taSeq++; });

/* ---------- the sales coach (v102) ----------
   Prepare: before a visit, a brief for the account from its records - where
   things stand, the aim, SPIN questions to ask, what was promised, and the
   buying influences and red flags to watch for. Saved on the visit, so it
   syncs to the phone and reads with no signal on site.
   Coach me: after a call, coaching on it - what went well, what is still
   unknown, next steps, what to ask next time. Saved on the call, never in a
   report, and read back into the next brief for the account.
   The method (SPIN Selling, Strategic Selling, Value First Then Price, The
   Speed of Trust) lives in the ai-tidy function; Claude Haiku 5.5, by Ben's
   choice on cost. Only that one account's records go, only when tapped. */
const COACH_HEADS = ['Where things stand', 'Aim for this visit', 'Questions to ask', 'Promised last time', 'Watch for',
  'What went well', 'Still unknown', 'Next steps', 'Ask next time'];
function coachHTML(text){
  const out = [];
  let list = false;
  for(const raw of String(text || '').split('\n')){
    const l = raw.trim();
    if(!l) continue;
    if(/^[•\-*]\s+/.test(l)){
      if(!list){ out.push('<ul>'); list = true; }
      out.push('<li>' + esc(l.replace(/^[•\-*]\s+/, '')) + '</li>');
    } else {
      if(list){ out.push('</ul>'); list = false; }
      const h = l.replace(/^#+\s*/, '').replace(/^\*+/, '').replace(/[:*#\s]+$/, '').trim();
      out.push(COACH_HEADS.some(x => x.toLowerCase() === h.toLowerCase()) ? '<h3>' + esc(h) + '</h3>' : '<p>' + esc(l) + '</p>');
    }
  }
  if(list) out.push('</ul>');
  return out.join('');
}
// who and what the account is
function accountText(name){
  const a = ACC_BY_NAME.get(name);
  const L = ['Account: ' + name];
  if(a){
    if(a.sub || a.z) L.push('Where: ' + [a.sub, zoneName(a.z)].filter(Boolean).join(', '));
    if(a.foc) L.push('Focus: ' + a.foc + (a.cad ? ' (' + a.cad + ')' : ''));
    if(a.seg || a.team) L.push('Segment: ' + [a.seg, a.team].filter(Boolean).join(', '));
    const ppl = (a.c || []).map(c => [c.n, c.t || c.r].filter(Boolean).join(', ')).filter(Boolean);
    if(ppl.length) L.push('Contacts on file: ' + ppl.slice(0, 15).join('; '));
  }
  return L.join('\n');
}
// its history, newest first: each call with its summary and the coaching after it, then open tasks and products
function accountHistory(name, skipId){
  const calls = callsFor(name).filter(c => c.id !== skipId).slice().sort((x, y) => callWhen(y) - callWhen(x)).slice(0, 6);
  const parts = calls.map(c => {
    const L = ['Call on ' + c.date + ' (' + (c.type || 'call') + ')' + (c.closed ? '' : ', still open')];
    if((c.summary || '').trim()) L.push('Summary: ' + c.summary.trim());
    const d = callDigest(c).split('\n').filter(l => !/^(Customer|Date|Call type):/.test(l)).join('\n');
    if(d.trim()) L.push(d);
    if(c.coaching && c.coaching.text) L.push('Coaching after that call:\n' + c.coaching.text);
    return L.join('\n');
  });
  const tasks = (typeof TASKS !== 'undefined' ? TASKS : []).filter(t => t.acct === name && !t.done).map(t => t.title || t.type).filter(Boolean);
  if(tasks.length) parts.push('Open tasks: ' + tasks.join('; '));
  const prods = (typeof PRODS !== 'undefined' ? PRODS : []).filter(p => p.acct === name && !p.stocked).map(p => [p.name, p.status].filter(Boolean).join(' - '));
  if(prods.length) parts.push('Products not yet stocked: ' + prods.join('; '));
  let out = parts.join('\n\n');
  if(out.length > 22000) out = out.slice(0, 22000);
  return out;
}
function nextVisitFor(name){
  const today = todayISOdate();
  return APPTS.filter(a => a.acct === name && a.date >= today && !apSettled(a))
    .sort((x, y) => (x.date + x.start).localeCompare(y.date + y.start))[0] || null;
}
let coSeq = 0, coAgain = null;
function coachOpen(head, sub){
  $('coHead').textContent = head;
  $('coSub').textContent = sub || '';
  $('coBody').innerHTML = '';
  showMsg($('coMsg'), '', '');
  $('coAgain').disabled = true;
  const d = $('coachdlg');
  if(!d.hasAttribute('open')){
    if(d.showModal) d.showModal(); else d.setAttribute('open','');
    pushDialog('coachdlg');
  }
  return ++coSeq;
}
function closeCoach(){
  coSeq++;
  const d = $('coachdlg');
  if(d.close) d.close(); else d.removeAttribute('open');
}
function coachLeave(){
  if(history.state && history.state.dialog === 'coachdlg') history.back();
  else closeCoach();
}
$('coClose').addEventListener('click', coachLeave);
$('coAgain').addEventListener('click', () => { if(coAgain) coAgain().catch(reportErr); });
$('coachdlg').addEventListener('cancel', () => { coSeq++; });
const writtenOn = t => new Date(t).toLocaleDateString();
async function coachAsk(n, payload){
  showMsg($('coMsg'), 'info', 'Writing' + String.fromCharCode(8230) + ' usually 10 to 30 seconds.');
  try {
    const r = await aiAsk(payload);
    if(n !== coSeq) return null;
    const text = String(r.text || '').trim();
    if(!text) throw new Error('the answer came back empty');
    showMsg($('coMsg'), '', '');
    $('coBody').innerHTML = coachHTML(text);
    return text;
  } catch(e){
    if(n === coSeq) showMsg($('coMsg'), 'warn', 'That did not work: ' + esc(e.message || String(e)) + '.');
    return null;
  } finally { if(n === coSeq) $('coAgain').disabled = false; }
}
async function prepareBrief(name, apId, fresh){
  if(!name) return;
  const ap = apId ? APPTS.find(x => x.id === apId) : nextVisitFor(name);
  coAgain = () => prepareBrief(name, ap && ap.id, true);
  const head = 'Brief: ' + name;
  if(ap && ap.brief && ap.brief.text && !fresh){
    coachOpen(head, 'Written ' + writtenOn(ap.brief.at) + ', for the visit on ' + dayLabel(ap.date) + ' at ' + ap.start + '.');
    $('coBody').innerHTML = coachHTML(ap.brief.text);
    $('coAgain').disabled = false;
    return;
  }
  const why = aiBlocked();
  if(why){ toast(why); return; }
  const n = coachOpen(head, ap ? 'For the visit on ' + dayLabel(ap.date) + ' at ' + ap.start + '.'
    : 'No visit booked, so this brief is not kept. Book a visit and prepare from it to keep one.');
  const a = ACC_BY_NAME.get(name);
  const seeing = ap && a ? (ap.contacts || []).map(i => a.c[i]).filter(Boolean).map(c => [c.n, c.t || c.r].filter(Boolean).join(', ')) : [];
  const visit = ap ? [dayLabel(ap.date) + ' at ' + ap.start, ap.type, (ap.agenda || '').trim() && 'Agenda: ' + ap.agenda.trim(),
    seeing.length && 'Seeing: ' + seeing.join('; ')].filter(Boolean).join('\n') : '';
  const text = await coachAsk(n, {kind: 'brief', a: accountText(name), b: accountHistory(name), visit});
  if(!text || !ap) return;
  const cur = APPTS.find(x => x.id === ap.id);
  if(cur){
    cur.brief = {text, at: Date.now()};
    await saveAppt(cur);
    if(n === coSeq) $('coSub').textContent = 'Written just now, for the visit on ' + dayLabel(cur.date) + ' at ' + cur.start + '. Saved with the visit.';
  }
}
async function coachCall(fresh){
  const c = call;
  if(!c) return;
  coAgain = () => coachCall(true);
  const head = 'Coaching: ' + c.customer;
  if(c.coaching && c.coaching.text && !fresh){
    coachOpen(head, 'Written ' + writtenOn(c.coaching.at) + ', on the call of ' + c.date + '.');
    $('coBody').innerHTML = coachHTML(c.coaching.text);
    $('coAgain').disabled = false;
    return;
  }
  if(!(c.entries || []).length && !(c.summary || '').trim()){ toast('Log something in the call first'); return; }
  const why = aiBlocked();
  if(why){ toast(why); return; }
  const n = coachOpen(head, 'On the call of ' + c.date + '.');
  const text = await coachAsk(n, {kind: 'coach',
    a: callDigest(c) + ((c.summary || '').trim() ? '\nSummary written for the report: ' + c.summary.trim() : ''),
    b: accountHistory(c.customer, c.id)});
  if(!text) return;
  c.coaching = {text, at: Date.now()};
  if(call === c){ await saveCall(); renderVisitSummary(); }
  else { c.updated = Date.now(); await callsPut(c); }
  if(n === coSeq) $('coSub').textContent = 'Written just now, on the call of ' + c.date + '. Kept with the call; not in any report.';
}
$('vCoach').addEventListener('click', () => coachCall(false).catch(reportErr));
$('avPrep').addEventListener('click', () => { if(viewAcct) prepareBrief(viewAcct.a).catch(reportErr); });
$('dPrep').addEventListener('click', () => {
  const ap = APPTS.find(x => x.id === editingAppt);
  if(ap) prepareBrief(ap.acct, ap.id).catch(reportErr);
});

document.querySelectorAll('[data-ai]').forEach(b =>
  b.addEventListener('click', () => aiTidy(b.dataset.ai, b.dataset.field).catch(reportErr)));
$('tkDraft').addEventListener('click', () => aiDraft().catch(reportErr));
$('aiKeep').addEventListener('click', aiLeave);
$('aiUse').addEventListener('click', () => {
  const apply = aiApply;
  if(apply) apply();
  aiLeave();
  toast('Used');
});
$('aidlg').addEventListener('cancel', () => { aiSeq++; aiApply = null; });   // Esc on the PC

$('bCommentBullet').addEventListener('click', () => insertCommentBullet('bComment'));
$('hCommentBullet').addEventListener('click', () => insertCommentBullet('hComment'));
// c is the open call unless one is passed - the PC folder save passes each one
async function buildNotesHTML(scope, mode, c){
  c = c || call;
  mode = IMG_MODES.includes(mode) ? mode : defaultImgMode();
  /* 'full' is the call record. 'health' and 'belts' are documents that leave
     for a customer, so general notes and project discovery are excluded from
     both - they carry commercial and internal context. */
  scope = scope || 'full';
  const wantNotes  = scope === 'full';
  const wantProj   = scope === 'full';
  const wantBelts  = scope === 'full' || scope === 'belts';
  const wantHealth = scope === 'full' || scope === 'health';
  const TITLE = {full:'Call notes', health:'Conveyor health check', belts:'Belt requirements'}[scope];
  const css = NOTES_CSS, LOGO = NOTES_LOGO;
  const p = [];
  const bodyCls = (mode === 'full') ? '' : ' class="tn"';
  p.push('<!DOCTYPE html><html><head><meta charset="utf-8"><title>'+TITLE+' '+DASH_CH+' '+esc(c.customer)+
    '</title><link rel="icon" href="'+NOTES_FAVICON+'"><style>'+css+'</style></head><body'+bodyCls+'>');
  p.push('<div class="mast"><img src="'+LOGO+'" alt="Intralox"></div><div class="pg">');
  p.push('<p class="eyebrow">Intralox</p>');
  p.push('<h1>'+TITLE+' '+DASH_CH+' '+esc(c.customer)+'</h1>');
  p.push('<p class="sub">'+[c.site,c.type,c.date].filter(Boolean).map(esc).join(' &middot; ')+'</p>');
  const anyPhoto = c.entries.some(e => e.photos && e.photos.length) || (c.loose && c.loose.length);
  if(anyPhoto && mode !== 'full') p.push(imgToggleHTML(mode));

  // the visit summary (v100) heads the full call notes only
  if(scope === 'full' && (c.summary || '').trim()) p.push('<h2>Summary</h2>' + commentBodyHTML(c.summary));
  p.push('<h2>Call details</h2><table>');
  [['Date',c.date],['Call type',c.type],['Account manager',c.mgr],['Customer',c.customer],['Site or area',c.site]]
    .forEach(([l,v])=>p.push('<tr><td class="l">'+l+'</td><td>'+V(v)+'</td></tr>'));
  if(c.manualAccount) p.push('<tr><td class="l">Account status</td><td><span class="flag">Not in CRM &mdash; needs adding to Dynamics</span></td></tr>');
  p.push('</table>');

  /* The tick on the Contacts screen governs every document, the full notes
     included. It used to list everyone on the call on the grounds that the full
     report is the record - but the record is the stored call, which still holds
     all of them and still goes into the backup. What the document needs is the
     people the reader cares about, and a dozen rows of everyone who happened to
     be on site buries the two who matter.

     Unticking hides a contact from the page. It never removes them from the
     call. */
  const shownContacts = c.contacts.filter(docContact);
  if(shownContacts.length){
    p.push('<h2>Contacts</h2><table><tr><th>Name</th><th>Role</th><th>Email</th><th>Mobile</th><th>CRM</th></tr>');
    shownContacts.forEach(x=>p.push('<tr><td>'+V(x.name)+'</td><td>'+V(x.role)+'</td><td>'+V(x.email)+'</td><td>'+V(x.mobile)+
      '</td><td>'+(x.crm?'On file':'<span class="flag">Needs adding to Dynamics</span>')+'</td></tr>'));
    p.push('</table>');
  }

  const notes = wantNotes ? c.entries.filter(e=>e.type==='note') : [];
  if(notes.length){
    p.push('<h2>General notes</h2><table><tr><th>Topic</th><th>Note</th></tr>');
    notes.forEach(n=>p.push('<tr><td>'+V(n.topic)+'</td><td>'+V(n.text)+'</td></tr>'));
    p.push('</table>');
  }

  const projects = wantProj ? c.entries.filter(e=>e.type==='project') : [];
  if(projects.length){
    p.push('<h2>Project discovery</h2><table><tr><th>Project or site</th><th>Status</th><th>Next action</th><th>Target</th><th>Owner</th><th>Notes</th></tr>');
    projects.forEach(x=>p.push('<tr><td>'+V(x.project)+'</td><td>'+V(x.status)+'</td><td>'+V(x.next)+
      '</td><td>'+V(x.target)+'</td><td>'+V(x.owner)+'</td><td>'+V(x.notes)+'</td></tr>'));
    p.push('</table>');
  }

  const belts = wantBelts ? c.entries.filter(e=>e.type==='belt') : [];
  if(belts.length){
    p.push('<h2>Belts to quote</h2>');
    for(let i=0;i<belts.length;i++){
      const b = belts[i];
      if(i) p.push('<hr class="sep">');
      p.push('<div class="blk"><h3>Belt '+(i+1)+' '+DASH_CH+' '+V(b.asset)+'</h3>');
      p.push(beltSpecTableHTML(beltSpecGroups(b, {qcontact: scope === 'full'})));
      p.push(commentHTML(b));
      if(b.photos && b.photos.length) p.push('<div class="ph">'+(await photoImgs(b.photos, mode))+'</div>');
      else if(b.detached) p.push('<p class="sent">'+b.detached.n+' photo'+(b.detached.n===1?'':'s')+
        ' were sent with the notes issued '+new Date(b.detached.at).toLocaleDateString()+
        ' and are no longer held on the device.</p>');
      p.push('</div>');
    }
  }

  const health = wantHealth ? c.entries.filter(e=>e.type==='health').slice().sort(byWorkOrder) : [];
  if(health.length){
    p.push('<h2>Health check</h2>');
    for(let i=0;i<health.length;i++){
      const h = health[i];
      if(i) p.push('<hr class="sep">');
      /* The fault library renders the four-row customer card - observations,
         risk of no action, recommendation, gain once corrected, and the
         replacement belt spec pulled from the linked belt entry. Falls back to
         the original table when healthlib.js is absent. */
      const linkedBelt = (h.beltRef != null) ? c.entries[h.beltRef] : null;
      if(window.HealthLib && h.faultId){
        p.push('<div class="hc">');
        p.push(HealthLib.cardHTML(h, linkedBelt).replace('class="hc-card"', 'class="hc-inner"'));
      } else {
        p.push('<div class="blk"><h3>Item '+(i+1)+' '+DASH_CH+' '+V(h.asset)+'</h3><table>');
        [['Fault or observation',h.fault],['Type',h.htype],['Severity',h.severity],['Recommended action',h.action]]
          .forEach(([l,v])=>p.push('<tr><td class="l">'+l+'</td><td>'+V(v)+'</td></tr>'));
        p.push('</table>');
      }
      p.push(commentHTML(h));
      if(h.photos && h.photos.length){
        p.push('<div class="ph">'+(await photoImgs(h.photos, mode))+'</div>');
      } else if(linkedBelt && linkedBelt.photos && linkedBelt.photos.length){
        /* A job sheet that says "edge modules broken or missing" with no picture
           makes a fitter go and find the conveyor before they know what they are
           looking at. Where the fault has no photo of its own, the linked belt's
           photos stand in, captioned so nobody mistakes them for the fault.

           In the full report the belt section already carries these images a few
           pages up, so a pointer goes in instead - embedding them twice would
           double their bytes in a file that is mostly photographs. */
        if(scope === 'full'){
          p.push('<p class="sent">No photo was taken of this fault. Photos of '+
            V(linkedBelt.asset)+' are in the Belts to quote section.</p>');
        } else {
          p.push('<p class="sent">No photo was taken of this fault. Shown below is '+
            V(linkedBelt.asset)+' from the same visit.</p>');
          p.push('<div class="ph">'+(await photoImgs(linkedBelt.photos, mode))+'</div>');
        }
      } else if(h.detached) p.push('<p class="sent">'+h.detached.n+' photo'+(h.detached.n===1?'':'s')+
        ' were sent with the notes issued '+new Date(h.detached.at).toLocaleDateString()+
        ' and are no longer held on the device.</p>');
      p.push('</div>');
    }
  }

  if(scope === 'full' && c.loose && c.loose.length){
    p.push('<h2>Additional photos</h2>');
    p.push('<div class="ph">'+(await photoImgs(c.loose, mode))+'</div>');
  } else if(c.looseDetached){
    p.push('<h2>Additional photos</h2>');
    p.push('<p class="sent">'+c.looseDetached.n+' photo'+(c.looseDetached.n===1?'':'s')+
      ' were sent with the notes issued '+new Date(c.looseDetached.at).toLocaleDateString()+
      ' and are no longer held on the device.</p>');
  }

  if(scope === 'full') p.push(historyBlock(c));

  p.push('</div><p class="ft">Compiled from site call notes. Final belt selection subject to Intralox review.</p>');
  if(anyPhoto && mode !== 'full') p.push(imgToggleScript(mode));
  p.push('</body></html>');
  return p.join('');
}


/* ---------- the belt RFQ ----------
   A quote request is a transaction, not a visit: a customer rings, the belt is
   specified with them on the phone, and the result goes to customer service.
   So this is a separate builder rather than a fourth scope inside
   buildNotesHTML - there is no call type, no visit history, no project
   discovery and no health check, and the things it does carry (required-by,
   quantity, the TSG confirmation) have no place in a set of call notes.

   Same stylesheet and masthead, so it reads as part of the same family, and the
   same beltSpecRows(), so a belt specified on the phone and a belt logged in a
   plant say the same things in the same order. */
async function buildRFQHTML(mode, c){
  c = c || call;
  mode = IMG_MODES.includes(mode) ? mode : defaultImgMode();
  const p = [];
  const TITLE = 'Belt request for quote';
  const bodyCls = (mode === 'full') ? '' : ' class="tn"';
  p.push('<!DOCTYPE html><html><head><meta charset="utf-8"><title>'+TITLE+' '+DASH_CH+' '+
    esc(c.customer)+'</title><link rel="icon" href="'+NOTES_FAVICON+'"><style>'+NOTES_CSS+'</style></head><body'+bodyCls+'>');
  p.push('<div class="mast"><img src="'+NOTES_LOGO+'" alt="Intralox"></div><div class="pg">');
  p.push('<p class="eyebrow">Intralox</p>');
  p.push('<h1>'+TITLE+' '+DASH_CH+' '+esc(c.customer)+'</h1>');
  p.push('<p class="sub">'+[c.site,c.date].filter(Boolean).map(esc).join(' &middot; ')+'</p>');

  const belts = c.entries.filter(e => e.type === 'belt');
  const anyPhoto = belts.some(e => e.photos && e.photos.length) || (c.loose && c.loose.length);
  if(anyPhoto && mode !== 'full') p.push(imgToggleHTML(mode));

  p.push('<h2>Request</h2><table>');
  [['Customer', c.customer], ['Site or area', c.site], ['Date raised', c.date],
   ['Required by', c.reqby], ['Account manager', c.mgr], ['Your reference', c.ref]]
    .forEach(([l,v]) => p.push('<tr><td class="l">'+l+'</td><td>'+V(v)+'</td></tr>'));
  if(c.manualAccount) p.push('<tr><td class="l">Account status</td><td>'+
    '<span class="flag">Not in CRM &mdash; needs adding to Dynamics</span></td></tr>');
  p.push('</table>');

  // same tick as the call notes - customer service wants who to talk to, not
  // everyone who was on the phone
  const rfqContacts = (c.contacts || []).filter(docContact);
  if(rfqContacts.length){
    p.push('<h2>Requested by</h2><table><tr><th>Name</th><th>Role</th><th>Email</th><th>Mobile</th><th>CRM</th></tr>');
    rfqContacts.forEach(x => p.push('<tr><td>'+V(x.name)+'</td><td>'+V(x.role)+'</td><td>'+V(x.email)+
      '</td><td>'+V(x.mobile)+'</td><td>'+(x.crm ? 'On file'
        : '<span class="flag">Needs adding to Dynamics</span>')+'</td></tr>'));
    p.push('</table>');
  }

  if(belts.length){
    p.push('<h2>Belts to quote</h2>');
    for(let i=0;i<belts.length;i++){
      const b = belts[i];
      if(i) p.push('<hr class="sep">');
      p.push('<div class="blk"><h3>Belt '+(i+1)+' '+DASH_CH+' '+V(b.asset)+'</h3>');
      /* Quantity is asked for here and nowhere else, and prints even when blank:
         customer service needs to see it was not given rather than guess. */
      p.push(beltSpecTableHTML(beltSpecGroups(b, {qty: true, qcontact: true})));
      p.push(commentHTML(b));
      /* Unticked and deliberately-not-confirmed look the same, which is fine
         here: the safe reading and the default reading are both "check it". */
      p.push(b.tsg
        ? '<p class="sent">Belt ID confirmed with TSG.</p>'
        : '<p class="sent"><span class="flag">Belt ID not yet confirmed with TSG.</span></p>');
      if(b.photos && b.photos.length) p.push('<div class="ph">'+(await photoImgs(b.photos, mode))+'</div>');
      else if(b.detached) p.push('<p class="sent">'+b.detached.n+' photo'+(b.detached.n===1?'':'s')+
        ' were sent with the request issued '+new Date(b.detached.at).toLocaleDateString()+
        ' and are no longer held on the device.</p>');
      p.push('</div>');
    }
  } else {
    p.push('<h2>Belts to quote</h2><p class="sub">No belt was specified on this request.</p>');
  }

  const notes = c.entries.filter(e => e.type === 'note');
  if(notes.length){
    p.push('<h2>Notes</h2><table><tr><th>Topic</th><th>Note</th></tr>');
    notes.forEach(n => p.push('<tr><td>'+V(n.topic)+'</td><td>'+V(n.text)+'</td></tr>'));
    p.push('</table>');
  }

  if(c.loose && c.loose.length){
    p.push('<h2>Photos from the customer</h2>');
    p.push('<div class="ph">'+(await photoImgs(c.loose, mode))+'</div>');
  } else if(c.looseDetached){
    p.push('<h2>Photos from the customer</h2>');
    p.push('<p class="sent">'+c.looseDetached.n+' photo'+(c.looseDetached.n===1?'':'s')+
      ' were sent with the request issued '+new Date(c.looseDetached.at).toLocaleDateString()+
      ' and are no longer held on the device.</p>');
  }

  p.push('</div><p class="ft">Quote request raised from the field. Final belt selection subject to Intralox review.</p>');
  if(anyPhoto && mode !== 'full') p.push(imgToggleScript(mode));
  p.push('</body></html>');
  return p.join('');
}

/* ---------- account history ----------
   What was found here last time, in the same file as what was found today. The
   whole point of storing visits rather than emailing them and forgetting.

   Two limits, both deliberate. Only the most recent HISTORY_MAX visits appear,
   with a line saying how many older ones exist - otherwise a monthly account
   turns every set of notes into a two-year archive nobody scrolls through. And
   each visit is one row, not a reproduction: asset numbers and headlines, no
   field tables and no photos. It is a pointer to the earlier notes file, not a
   substitute for it. */
const HISTORY_MAX = 6;
function histLine(c){
  const bits = [];
  const E = t => (c.entries||[]).filter(e => e.type === t);
  const belts = E('belt');
  if(belts.length) bits.push(belts.length+' belt'+(belts.length===1?'':'s')+': '+
    trimList(belts.map(e => e.asset || 'unnumbered')));
  const health = E('health');
  if(health.length) bits.push(health.length+' health item'+(health.length===1?'':'s')+': '+
    trimList(health.map(e => [e.asset, e.severity].filter(Boolean).join(' ') || e.htype || 'noted')));
  const proj = E('project');
  if(proj.length) bits.push(proj.length+' project'+(proj.length===1?'':'s')+': '+
    trimList(proj.map(e => e.project || 'unnamed')));
  const notes = E('note');
  if(notes.length) bits.push(notes.length+' note'+(notes.length===1?'':'s')+
    ' ('+trimList([...new Set(notes.map(e => e.topic || 'Other'))])+')');
  if(!bits.length) return c.noReport ? 'Visited, nothing to report' : 'No entries logged';
  return bits.join('; ');
}
function trimList(arr, max){
  max = max || 3;
  const shown = arr.slice(0, max).join(', ');
  return arr.length > max ? shown + ' +' + (arr.length - max) + ' more' : shown;
}
function histPhotos(c){
  const n = (c.entries||[]).reduce((t,e) => t + (e.photos||[]).length + (e.detached?e.detached.n:0), 0) +
    (c.loose||[]).length + (c.looseDetached ? c.looseDetached.n : 0);
  return n;
}
function historyBlock(c){
  const prior = callsFor(c.customer)
    .filter(x => x.id !== c.id && (x.closed || x.status === 'done' || x.status === 'compiled'))
    .sort((a,b) => callWhen(b) - callWhen(a));
  if(!prior.length) return '';
  const a = ACC_BY_NAME.get(c.customer);
  const shown = prior.slice(0, HISTORY_MAX);
  const p = [];
  p.push('<h2>Previous calls at this account</h2>');
  if(a){
    const d = dueState(a);
    p.push('<p class="sub">'+esc(a.cad)+' cadence \u00b7 '+esc(dueLabel(d))+'</p>');
  }
  p.push('<table><tr><th>Date</th><th>Outcome</th><th>Logged</th><th>Photos</th><th>Notes file</th></tr>');
  shown.forEach(x=>{
    const st = callStatus(x);
    const n = histPhotos(x);
    p.push('<tr><td>'+V(x.date)+'</td><td>'+V(st.label)+'</td><td>'+esc(histLine(x))+'</td>'+
      '<td>'+(n ? n : DASH_CH)+'</td><td>'+V(x.sharedAs)+'</td></tr>');
  });
  p.push('</table>');
  if(prior.length > shown.length){
    p.push('<p class="sub">'+(prior.length - shown.length)+' older call'+
      (prior.length - shown.length === 1 ? '' : 's')+' not shown. '+
      'Full notes for each were shared at the time.</p>');
  }
  return p.join('');
}
function fileName(scope, c){
  c = c || call;
  const cust = (c.customer||'').replace(/[^A-Za-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,40);
  const site = c.site ? '_'+c.site.replace(/[^A-Za-z0-9]+/g,'_') : '';
  const date = (c.date||'').replace(/\//g,'-');
  const tag = scope === 'health' ? 'health_check'
            : scope === 'belts'  ? 'belt_requirements'
            : scope === 'rfq'    ? 'belt_RFQ'
            : 'call_notes';
  return cust+site+'_'+tag+'_'+date+'.html';
}
const SHARE_TITLE = {full:'Call notes ', health:'Health check ', belts:'Belt requirements ', rfq:'Belt RFQ '};
/* One path for every output. Scope decides what is in the document, mode decides
   how the photos are shown, dest decides where it goes. They used to be five
   buttons that each hard-coded one combination. */
async function sendNotes(scope, dest, mode){
  toast('Building...');
  let html;
  try {
    html = (scope === 'rfq') ? await buildRFQHTML(mode) : await buildNotesHTML(scope, mode);
  }
  catch(e){ console.error(e); toast('Could not build the file: '+e.message); return; }
  const name = fileName(scope);
  /* Only the full call record counts as the call having been issued. A health
     sheet handed to a fitter is not the call report, so it must not mark the
     call compiled or offer to detach its photos. A quote request is its own
     record and marks itself issued. */
  const marks = (scope === 'full' || scope === 'rfq');
  /* Open is a preview: the file is rendered in a tab and nothing has left the
     device, so it deliberately does not mark the call issued and does not
     trigger the offer to drop the photos. Print to PDF from the tab. */
  if(dest === 'open'){
    openInTab(html, name);
    return;
  }
  if(dest === 'download'){
    download(html, name);
    if(marks) await markShared(name);
    return;
  }
  const file = new File([html], name, {type:'text/html'});
  if(navigator.canShare && navigator.canShare({files:[file]})){
    try{
      await navigator.share({files:[file], title:(SHARE_TITLE[scope]||'')+call.customer});
      // Only a share that came back without throwing counts as confirmed. An
      // AbortError means it was dismissed, and nothing left the phone.
      if(marks) await markShared(name);
      toast('Shared');
    }catch(e){ if(e.name!=='AbortError'){ console.error(e); toast('Share failed - try Save to this phone'); } }
  } else {
    toast('Sharing not supported here - saving instead');
    download(html, name);
    if(marks) await markShared(name);
  }
}
/* ---------- the output block ----------
   Five buttons on a screen of their own became three pickers and one button at
   the foot of the dashboard. The compile screen held nothing but the options for
   leaving it, and the image mode would have made it six. */
function outScopeOptions(){
  const q = isQuote(call);
  return q ? [['rfq','Belt RFQ']]
           : [['full','Full call notes'],['health','Health check only'],['belts','Belt requirements only']];
}
function currentOutScope(){
  const el = $('outScope');
  const opts = outScopeOptions().map(o => o[0]);
  const v = el ? el.value : '';
  return opts.includes(v) ? v : opts[0];
}
/* The share sheet is an Android thing. On a PC it either is not there at all or
   hands the file to something useless, and what you actually want is to read it
   or print it to PDF. So the destinations differ by device: the phone leads with
   Share, the PC leads with Open and never offers Share unless the browser says
   it can. */
function outDestOptions(){
  const phone = isPhone();
  const canShare = !!(navigator.canShare && navigator.share);
  const open = ['open', phone ? 'Open in a new tab' : 'Open in a new tab'];
  const save = ['download', phone ? 'Save to this phone' : 'Download to this PC'];
  const share = ['share', 'Share sheet'];
  if(phone) return canShare ? [share, save, open] : [save, open];
  return canShare ? [open, save, share] : [open, save];
}
function renderOutDest(){
  const sel = $('outDest');
  if(!sel) return;
  const opts = outDestOptions(), prev = sel.value;
  sel.innerHTML = opts.map(([v,l]) => '<option value="'+v+'">'+l+'</option>').join('');
  if(opts.some(o => o[0] === prev)) sel.value = prev;
}
function renderOutControls(){
  const sel = $('outScope');
  if(!sel) return;
  renderOutDest();
  const opts = outScopeOptions(), prev = sel.value;
  sel.innerHTML = opts.map(([v,l]) => '<option value="'+v+'">'+l+'</option>').join('');
  if(opts.some(o => o[0] === prev)) sel.value = prev;
  // a quote request has one output, so the picker is noise
  const row = $('outScopeRow');
  if(row) row.hidden = opts.length < 2;
  const img = $('outImg');
  if(img && !IMG_MODES.includes(img.value)) img.value = defaultImgMode();
  renderOutHint();
}
/* The one line under the button on the dashboard. It says what state the call is
   in, not what the pickers are set to - those are not on this screen any more. */
function renderOutSummary(){
  const hint = $('outHint');
  if(!hint || !call) return;
  const n = call.entries.length;
  const ph = call.entries.reduce((a,e)=>a+(e.photos?e.photos.length:0),0) + (call.loose?call.loose.length:0);
  if(call.shared){
    hint.textContent = 'Issued ' + new Date(call.shared).toLocaleDateString() +
      '. Producing it again replaces nothing \u2014 it just makes another file.';
  } else if(!n){
    hint.textContent = 'Nothing logged yet.';
  } else {
    hint.textContent = n + ' entr' + (n===1?'y':'ies') + ', ' + ph + ' photo' + (ph===1?'':'s') +
      '. Not issued yet.';
  }
}
function renderOutHint(){
  const btn = $('outGo'), hint = $('outDlgHint');
  if(!btn) return;
  const dest = $('outDest') ? $('outDest').value : 'share';
  btn.textContent = dest === 'open' ? 'Create and open'
                  : dest === 'download' ? 'Create and save'
                  : 'Create and share';
  if(!hint) return;
  const scope = currentOutScope();
  const bits = [];
  bits.push(dest === 'open'
    ? 'Renders the file in a new tab so you can read it or print it to PDF. Nothing leaves this device, and the call is not marked issued.'
    : dest === 'download'
    ? (isPhone() ? 'Saves the file to this phone.' : 'Saves the file to your Downloads folder.')
    : 'Sends the file to the Android share sheet \u2014 pick OneDrive, Outlook or Teams.');
  if(scope === 'health' || scope === 'belts'){
    bits.push('This is for handing to the customer. It leaves out general notes, '+
      'project discovery and the visit history'+
      (scope === 'health' ? ', and prints one fault per page so it can go straight to a fitter' : '')+
      '. It does not mark the call as issued.');
  } else if(scope === 'full' && dest !== 'open'){
    bits.push('Marks the call as issued.');
  }
  const mode = $('outImg') ? $('outImg').value : 'full';
  if(mode === 'thumbonly') bits.push('Thumbnails only \u2014 the full-size images are left out, so the file is much smaller.');
  else if(mode === 'thumb') bits.push('Thumbnails, expandable in the file. Same size as full.');
  hint.textContent = bits.join(' ');
}
async function markShared(name){
  call.shared = Date.now();
  call.sharedAs = name;
  call.status = 'compiled';
  call.noReport = false;
  await saveCall();
  await syncApptFromCall(call);
  renderCompileStat();
  renderOutSummary();   // the line under the button now reads "Issued ..."
}
/* The appointment follows the call it became. Status is not part of apRev, so
   doing the visit never makes Outlook think the invite changed. */
async function syncApptFromCall(c){
  if(!c || !c.apptId) return;
  const ap = APPTS.find(x => x.id === c.apptId);
  if(!ap) return;
  const next = (c.status === 'compiled' || c.status === 'done') ? 'done' : 'in progress';
  const sum = (next === 'done') ? callSummary(c) : null;
  const changed = ap.status !== next || sumRev(ap.callSummary) !== sumRev(sum);
  if(!changed) return;
  ap.status = next;
  if(sum) ap.callSummary = sum;
  await saveAppt(ap);
}
/* Blob URL in a new tab. Chrome on the desktop renders an HTML blob; some
   Android builds download it instead, which is why this is offered rather than
   made the default on a phone. The URL is held for a while because revoking it
   immediately can blank a tab that has not finished loading. */
function openInTab(html, name){
  const url = URL.createObjectURL(new Blob([html], {type:'text/html'}));
  const win = window.open(url, '_blank');
  if(!win){
    URL.revokeObjectURL(url);
    toast('The browser blocked the new tab - allow pop-ups, or use Download');
    return;
  }
  try { win.document.title = name; } catch(e){ /* cross-origin blob, not important */ }
  setTimeout(()=>URL.revokeObjectURL(url), 60000);
  toast('Opened in a new tab - print to PDF from there');
}
function download(html, name){
  const url = URL.createObjectURL(new Blob([html], {type:'text/html'}));
  const a = document.createElement('a'); a.href = url; a.download = name || fileName();
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 4000);
  toast('Saved to Downloads');
}

/* ---------- backup and restore ---------- */
/* Structured backup is the whole database as JSON with the image data left out:
   accounts, calls, entries, overrides, import meta. A few hundred KB a month and
   fully restorable into a fresh install. Full backup adds the photos and is large
   and slow, for use before a deliberate reinstall.

   The device is the risk, not GitHub. Site settings -> Clear & reset, Clear
   browsing data with site data ticked, and uninstalling the app are three routes
   to losing everything, storage is scoped to the origin so clearing the domain
   takes both apps at once, and there is no pre-uninstall hook. The answer is
   routine backup, not careful uninstalling.

   Restore merges by record id and never wipes what is already there. A backup that
   has never been restored is not a backup - restore into a fresh install and check
   the counts before trusting it. */
const BACKUP_FORMAT = 'fieldcrm-backup', BACKUP_VER = 1;

function stripPhotos(c){
  // Blobs do not survive JSON, so a structured backup drops the image data and
  // keeps the count. Cloning by hand rather than through JSON.stringify, which
  // would turn a Blob into {} and hide the fact that anything was there.
  const out = {};
  for(const k of Object.keys(c)){
    if(k === 'entries' || k === 'loose') continue;
    out[k] = c[k];
  }
  let n = 0;
  out.entries = (c.entries||[]).map(e => {
    const o = {};
    for(const k of Object.keys(e)) if(k !== 'photos') o[k] = e[k];
    const ln = (e.photos||[]).length;
    if(ln){ n += ln; o.photoCount = ln; }
    o.photos = [];
    return o;
  });
  const ll = (c.loose||[]).length;
  if(ll){ n += ll; out.looseCount = ll; }
  out.loose = [];
  out.photosOmitted = n;
  return out;
}
async function inlinePhotos(c){
  const out = {};
  for(const k of Object.keys(c)){
    if(k === 'entries' || k === 'loose') continue;
    out[k] = c[k];
  }
  out.entries = [];
  for(const e of (c.entries||[])){
    const o = {};
    for(const k of Object.keys(e)) if(k !== 'photos') o[k] = e[k];
    o.photos = [];
    for(const p of (e.photos||[])) o.photos.push(await photoDataURL(p));
    out.entries.push(o);
  }
  out.loose = [];
  for(const p of (c.loose||[])) out.loose.push(await photoDataURL(p));
  return out;
}
async function buildBackup(withPhotos){
  // recordsAll, not callsAll: a backup that quietly omitted quote requests
  // would look complete and restore incomplete.
  const calls = await recordsAll();
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VER,
    withPhotos: !!withPhotos,
    taken: Date.now(),
    app: 'Field CRM',
    meta: META,
    overrides: OVERRIDES,
    prefs: {mgr: localStorage.getItem(LS('mgr')) || ''},
    accounts: ACCOUNTS,
    appts: APPTS,
    tasks: TASKS,
    snippets: SNIPS,
    products: PRODS,
    weeks: WEEKS,
    mgrOf: MGR_OF,
    calls: withPhotos ? await Promise.all(calls.map(inlinePhotos)) : calls.map(stripPhotos)
  };
}
function backupName(withPhotos){
  const d = new Date(), p = n => String(n).padStart(2,'0');
  return 'field_crm_backup'+(withPhotos?'_with_photos':'')+'_'+
    d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'.json';
}
async function doBackup(withPhotos){
  toast(withPhotos ? 'Building full backup...' : 'Building backup...');
  const data = await buildBackup(withPhotos);
  const text = JSON.stringify(data);
  const name = backupName(withPhotos);
  const file = new File([text], name, {type:'application/json'});
  let done = false;
  if(navigator.canShare && navigator.canShare({files:[file]})){
    try { await navigator.share({files:[file], title:name}); done = true; }
    catch(e){ if(e.name === 'AbortError') return; console.error(e); }
  }
  if(!done){
    const url = URL.createObjectURL(new Blob([text], {type:'application/json'}));
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 4000);
  }
  localStorage.setItem(LS('lastBackup'), String(Date.now()));
  renderBackupStat();
  toast('Backup '+Math.round(text.length/1024)+' KB - keep it off this device');
}
async function doRestore(file){
  const data = JSON.parse(await file.text());
  if(!data || data.format !== BACKUP_FORMAT) throw new Error('that is not a Field CRM backup file');
  const calls = Array.isArray(data.calls) ? data.calls : [];
  const accounts = Array.isArray(data.accounts) ? data.accounts : [];
  const existing = await recordsAll();
  const have = new Set(existing.map(c => c.id));
  let added = 0, updated = 0;
  for(const c of calls){
    if(!c || !c.id) continue;
    if(have.has(c.id)) updated++; else added++;
    // a full backup carries photos as base64; they go back to Blobs on the way in
    (c.entries||[]).forEach(e => {
      e.photos = (e.photos||[]).map(p => {
        try { return typeof p === 'string' && p.startsWith('data:') ? dataURLToBlob(p) : p; }
        catch(err){ console.warn('photo skipped on restore', err); return null; }
      }).filter(Boolean);
    });
    c.loose = (c.loose||[]).map(p => {
      try { return typeof p === 'string' && p.startsWith('data:') ? dataURLToBlob(p) : p; }
      catch(err){ console.warn('loose photo skipped on restore', err); return null; }
    }).filter(Boolean);
    await callsPut(c);
  }
  if(accounts.length) await accMerge(accounts);
  // appointments merge by id like everything else, so a restore never drops a
  // visit that was planned on this device and is not in the file
  const appts = Array.isArray(data.appts) ? data.appts : [];
  let apptsAdded = 0;
  const haveAp = new Set(APPTS.map(a => a.id));
  for(const ap of appts){
    if(!ap || !ap.id) continue;
    if(!haveAp.has(ap.id)) apptsAdded++;
    await apptsPut(ap);
  }
  if(appts.length) APPTS = await apptsAll();
  const tasks = Array.isArray(data.tasks) ? data.tasks : [];
  for(const t of tasks) if(t && t.id) await tasksPut(t);
  if(tasks.length) TASKS = await tasksAll();
  // saved notes and products (v97), by id like everything else
  for(const r of (Array.isArray(data.snippets) ? data.snippets : [])) if(r && r.id) await snippetsPut(r);
  for(const r of (Array.isArray(data.products) ? data.products : [])) if(r && r.id) await productsPut(r);
  await loadLists();
  await loadQuotes();   // restored quote requests go back on the calendar
  if(data.weeks){ WEEKS = data.weeks; await kvSet('weeks', WEEKS); }
  if(data.mgrOf){ MGR_OF = data.mgrOf; await kvSet('mgrOf', MGR_OF); }
  if(data.overrides){
    OVERRIDES = Object.assign({acctZone:{}, spelling:{}}, data.overrides);
    await kvSet('overrides', OVERRIDES);
  }
  if(data.meta){ META = data.meta; await kvSet('meta', META); }
  if(data.prefs && data.prefs.mgr) localStorage.setItem(LS('mgr'), data.prefs.mgr);
  await loadAccounts();
  renderDbStat(); fillManagers(); renderBackupStat();
  await renderHome();
  const noPh = data.withPhotos ? '' : ' Photos were not in this backup.';
  renderPlanCount();
  toast(added+' calls added, '+updated+' updated, '+accounts.length+' accounts merged, '+
        apptsAdded+' appointments added.'+noPh);
}
function renderBackupStat(){
  const el = $('bkStat');
  if(!el) return;
  const raw = localStorage.getItem(LS('lastBackup'));
  if(!raw){ el.innerHTML = '<span class="flagline">No backup has been taken on this device.</span>'; return; }
  const t = Number(raw), days = Math.floor((Date.now()-t)/86400000);
  const d = new Date(t);
  const when = 'Last backup '+d.toLocaleDateString()+' '+d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  el.innerHTML = days >= 7
    ? '<span class="flagline">'+when+' &mdash; '+days+' days ago.</span>'
    : when + (days ? ', '+days+' day'+(days===1?'':'s')+' ago.' : ', today.');
}
$('bkBtn').addEventListener('click', ()=>doBackup(false).catch(e=>{ console.error(e); toast('Backup failed: '+e.message); }));
$('rsBtn').addEventListener('click', async ()=>{
  const f = $('rsFile').files[0];
  if(!f){ toast('Choose a backup file first'); return; }
  if(!confirm('Restore from '+f.name+'?\n\nThis adds and updates records by id. Nothing already on this device is deleted.')) return;
  try { await doRestore(f); }
  catch(e){ console.error(e); toast('Restore failed: '+e.message); }
});

/* ---------- boot ---------- */
(async function(){
  let dbErr = null;
  if(navigator.storage && navigator.storage.persist){
    try { await navigator.storage.persist(); } catch(e){ console.warn('persist', e); }
  }
  try {
    await openDB();
    await loadAccounts();
  } catch(e){ dbErr = e; console.error('storage', e); }
  renderDbStat(); renderRefStat(); renderAssetStat(); renderHomeSetup();
  fillManagers(); renderBackupStat();
  renderManStat(); renderManCount();
  try { await loadSb(); } catch(e){ console.error('cloud', e); }
  $('cMgr').addEventListener('change', renderHomeCounts);
  $('cDate').value = todayISO();
  /* buildBeltRef was only called from importRef, so the pickers were built the
     once and never again. Reopen the app the next day and every belt select was
     empty even though the reference data was sitting in IndexedDB - the belt
     form looked broken, and anything filling it from the register failed on
     every value. It has to run at boot, off whatever was loaded before. */
  try { buildBeltRef(); } catch(e){ console.error('belt reference', e); }
  try { resetBelt(); } catch(e){ console.error('belt form', e); }
  try { history.replaceState({screen:'home'}, '', location.href); } catch(e){}
  paintHeaderMenu(screen);
  headerHeight(); window.addEventListener('resize', headerHeight);
  try { await renderHome(); } catch(e){ console.error('home', e); }
  try { await consumeSharedFile(); } catch(e){ console.error('shared file', e); }
  if(dbErr){
    $('dbStat').textContent = 'Storage error - ' + dbErr.message;
    toast('Storage error - ' + dbErr.message);
  }
  if('serviceWorker' in navigator){
    // updateViaCache:'none' stops the browser serving its own stale copy of
    // sw.js, which would otherwise hide a genuinely new worker for up to a day
    navigator.serviceWorker.register('sw.js', {updateViaCache:'none'}).catch(()=>{});
  }
})();


/* ---------- fault library wiring ----------
   Added by healthlib.js integration. Everything here is guarded; with the
   module absent the buttons report it and nothing else changes. */
let beltJustSaved = null;

document.addEventListener('DOMContentLoaded', () => {
  const pick = $('hPickFault');
  if(pick) pick.addEventListener('click', () => openFaultPicker());

  /* Belt spec first, then the fault - the asset and belt series carry across,
     and the picker filters itself to modular or ThermoDrive off the series so
     the modular sag advice can never be offered on a ThermoDrive line. */
  const bf = $('bFault');
  if(bf) bf.addEventListener('click', () => {
    if(!window.HealthLib){ toast('healthlib.js did not load'); return; }
    /* Commit whatever is on the form first. A belt logged against a fault is
       often barely filled in - asset and series and little else - and the detail
       and photos get added later, so demanding a completed save first was wrong.
       Only the asset is required, because the fault needs something to hang on. */
    const asset = $('bAsset').value.trim();
    if(!asset){ $('bErr').classList.add('show'); $('bAsset').focus(); return; }
    let idx = beltJustSaved, belt = (idx != null && call && call.entries) ? call.entries[idx] : null;
    if(!belt || belt.asset !== asset){
      beltSaveSilent = true;
      $('bSave').click();   // commitEntry runs before the first await, so the index is set
      idx = beltJustSaved;
      belt = call.entries[idx];
    }
    if(!belt){ toast('Could not save the belt'); return; }
    go('health');
    $('hAsset').value = belt.asset || '';
    HealthLib.openFor(belt, idx, e => {
      healthExtra = e;
      $('hFault').value  = e.fault;
      $('hAction').value = e.action;
      const opt = Array.from($('hType').options).find(o => o.value === e.htype);
      if(!opt){ const o = document.createElement('option'); o.value = o.textContent = e.htype; $('hType').appendChild(o); }
      $('hType').value = e.htype;
      $('hSev').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === e.severity));
      $('hSevErr').classList.remove('show');
    });
  });

  const ex = $('flExport'), ib = $('flImportBtn'), inp = $('flImport');
  if(ex) ex.addEventListener('click', () => HealthLib.exportLibrary());
  if(ib && inp){
    ib.addEventListener('click', () => inp.click());
    inp.addEventListener('change', async () => {
      if(!inp.files[0]) return;
      try { const n = await HealthLib.importLibrary(inp.files[0]);
            showMsg($('flLibMsg'), 'ok', n + ' checks loaded'); }
      catch(err){ showMsg($('flLibMsg'), 'warn', 'Could not read that file'); }
      inp.value = '';
    });
  }
});


/* ---------- get the latest version ----------
   The button, plus a check once a day (dailyUpdateCheck, below) - Ben's choice,
   2026-10-09. The service worker is still cache-first, so between checks the
   app never goes looking for new files on its own.

   What this does NOT touch: IndexedDB. Calls, accounts, photos and settings are
   untouched by a refresh or the reload after it. The only thing a reload costs
   is whatever is typed into a form and not yet saved, which is why an open call
   gets asked first. */
/* Once a day, when the app opens with signal, ask the server which version it
   has. Only if it is newer does the refresh below run - and the app reloads
   straight away, before there is anything open to lose. The button stays for
   checking now. sw.js is asked for with cache 'no-store', which the service
   worker passes straight to the network rather than answering from its cache. */
async function serverBuild(){
  const r = await fetch('./sw.js', {cache: 'no-store'});
  if(!r.ok) return 0;
  const m = (await r.text()).match(/fieldcrm-v(\d+)/);
  return m ? +m[1] : 0;
}
async function dailyUpdateCheck(){
  if(!navigator.onLine || !('serviceWorker' in navigator)) return;
  const last = +(localStorage.getItem(LS('upCheck')) || 0);
  if(Date.now() - last < 864e5) return;
  localStorage.setItem(LS('upCheck'), String(Date.now()));
  const theirs = await serverBuild().catch(() => 0);
  if(theirs > +APP_BUILD.slice(1)){
    toast('Updating to v' + theirs + '\u2026');
    await pullLatestVersion();
  }
}
async function pullLatestVersion(){
  const stat = $('upStat');
  if(!('serviceWorker' in navigator)){
    showMsg(stat, 'warn', 'This browser has no service worker, so there is nothing to refresh.');
    return;
  }
  const reg = await navigator.serviceWorker.ready.catch(()=>null);
  if(!reg || !(reg.active || navigator.serviceWorker.controller)){
    showMsg(stat, 'warn', 'The app is not running from its cache yet. Reload once and try again.');
    return;
  }

  showMsg(stat, 'info', 'Checking for a newer version...');
  $('upBtn').disabled = true;

  // ask for sw.js itself first: a new version comes with a new worker
  try { await reg.update(); } catch(e){}

  /* A new worker means a new version. It downloads every file as it installs
     and then takes over - so wait for that and reload. Sending the refresh to
     the old worker instead was the "took too long" on the first tap: the new
     one replaced it mid-request and the answer never came. */
  const fresh = reg.installing || reg.waiting;
  if(fresh){
    showMsg(stat, 'info', 'Downloading the new version...');
    const ok = await new Promise(res => {
      if(fresh.state === 'activated') return res(true);
      const timer = setTimeout(() => res(false), 120000);
      fresh.addEventListener('statechange', () => {
        if(fresh.state === 'activated'){ clearTimeout(timer); res(true); }
        if(fresh.state === 'redundant'){ clearTimeout(timer); res(false); }
      });
    });
    $('upBtn').disabled = false;
    if(!ok){
      showMsg(stat, 'warn', 'The new version did not finish downloading. It carries on next time the app opens with signal.');
      return;
    }
    showMsg(stat, 'ok', 'New version ready. Reloading...');
    if(call && !confirm('A call is open.\n\nReloading keeps everything saved, but anything ' +
         'typed into a form and not yet saved will be lost.\n\nReload now?')){
      showMsg(stat, 'ok', 'Ready. Reload when you have finished the call.');
      return;
    }
    location.reload();
    return;
  }

  // the same version: refresh its files through whichever worker is in charge now
  const sw = reg.active || navigator.serviceWorker.controller;
  const result = await new Promise(res => {
    const ch = new MessageChannel();
    const timer = setTimeout(()=>res({ok:false, reason:'timeout'}), 60000);
    ch.port1.onmessage = ev => { clearTimeout(timer); res(ev.data || {ok:false, reason:'empty'}); };
    sw.postMessage({type:'refresh'}, [ch.port2]);
  });

  $('upBtn').disabled = false;

  if(!result.ok){
    const why = result.reason === 'offline'
      ? 'No connection, so nothing was changed. The app is still working from what it already has.'
      : result.reason === 'timeout'
        ? 'That took too long, so nothing was changed. Try again on a better connection.'
        : result.reason === 'status'
          ? 'The server would not hand over ' + esc(result.failed || 'a file') +
            ', so nothing was changed.'
          : 'Something went wrong, so nothing was changed.';
    showMsg(stat, 'warn', why);
    return;
  }

  showMsg(stat, 'ok', result.count + ' files refreshed. Reload to finish.');
  if(call && !confirm('A call is open.\n\nReloading keeps everything saved, but anything ' +
       'typed into a form and not yet saved will be lost.\n\nReload now?')){
    showMsg(stat, 'ok', 'Ready. Tap Reload when you have finished the call.');
    return;
  }
  location.reload();
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => dailyUpdateCheck().catch(e => console.warn('update check', e)), 4000);
  const b = $('upBtn');
  if(b) b.addEventListener('click', () => pullLatestVersion().catch(e => {
    console.error('update', e);
    showMsg($('upStat'), 'warn', 'Could not check for an update. Nothing was changed.');
    $('upBtn').disabled = false;
  }));
});


/* ---------- resume picker ----------
   Opened from the Resume tile when more than one call is still open. It used to
   be a list of chips on the front page, which made the first thing you see busy
   for something you need only at the moment of choosing. */
function showOpenPicker(open){
  const dlg = $('opendlg'), el = $('openList');
  if(!dlg || !el){ call = open[0]; call.loose = call.loose || []; go('dash'); return; }
  const q = open.every(isQuote);
  const nq = open.filter(isQuote).length, nc = open.length - nq;
  $('openSub').textContent = [nc ? nc + (nc===1?' call':' calls') : '',
    nq ? nq + (nq===1?' quote request':' quote requests') : ''].filter(Boolean).join(' and ') + ' still open';
  /* A mixed list has to say which is which, or a half-finished request reads as
     a half-finished call and gets written into. */
  el.innerHTML = open.map(c =>
    '<button type="button" data-resume="' + esc(c.id) + '">' +
    '<span class="who">' + esc(c.customer) + (c.site ? ' - ' + esc(c.site) : '') +
    (isQuote(c) ? ' <span class="tag">quote request</span>' : '') + '</span>' +
    '<span class="n">' + (c.entries.length ? c.entries.length + ' entries' : 'nothing logged') +
    '</span></button>').join('');
  el.querySelectorAll('[data-resume]').forEach(b => b.addEventListener('click', async () => {
    // recordsAll, not callsAll: this picker is shown for quote requests too, and
    // callsAll would never find one
    const all = await recordsAll();
    const picked = all.find(x => x.id === b.dataset.resume);
    closeOpenPicker();
    if(!picked){ toast(q ? 'That request is no longer here' : 'That call is no longer here'); return; }
    call = picked; call.loose = call.loose || [];
    go('dash');
  }));
  if(dlg.showModal) dlg.showModal(); else dlg.setAttribute('open','');
  pushDialog('opendlg');
}
/* Closed through history so the entry pushDialog added is consumed, exactly as
   the appointment dialog does. Otherwise a back gesture after the dialog closes
   eats a screen instead of the dialog. */
function closeOpenPicker(){
  const dlg = $('opendlg');
  if(!dlg || !dlg.hasAttribute('open')) return;
  if(history.state && history.state.dialog === 'opendlg'){ history.back(); return; }
  if(dlg.close) dlg.close(); else dlg.removeAttribute('open');
}

/* Everything lives on one device and clearing site data takes the lot, so the
   age of the last backup is worth seeing without going looking for it. */
/* The one line under each Settings heading, so the closed list says where
   things stand without opening anything. */
/* ---------- manuals from intralox.com (v88) ----------
   The engineering manuals download straight from Intralox's file host, which
   allows it, and go through the same importer as a PDF picked by hand. The
   links below are the editions current when this was written. A page cannot
   read intralox.com itself, so finding a NEW edition is done by the
   intralox-manuals function in the Supabase project (supabase/functions/),
   asked once a week by a signed-in device; its answer replaces these links. */
const IX_BASE = 'https://assets-us-01.kc-usercontent.com/19eb64b5-1815-003a-d268-e7109927ccad/';
const INTRALOX_DOCS = {
  mpb: {label: 'MPB engineering manual', bytes: 44684407,
    url: IX_BASE + '18fdc7fc-ce10-44df-af25-8c7231ffb194/5012156.5%20Summer%202026%20MPB%20Engineering%20Manual_EN-US.pdf'},
  td: {label: 'ThermoDrive engineering manual', bytes: 16141686,
    url: IX_BASE + '1cac0f10-8310-44ad-83fd-e80573b31912/5011939.5%20-%202026%20TD%20Engineering%20Manual_English_SO.pdf'},
  install: {label: 'MPB installation manual', bytes: 5830251,
    url: IX_BASE + '1a1322d8-1d18-4c30-a73c-09319948df43/5009841%202%202024%20MPB%20Conveyor%20Belting%20Install%20Maintenance%20Troubles%20Manual%20EN.US.pdf',
    doc: {id: 'MPBINSTALL', name: 'MPB Installation Manual', title: 'Installation, maintenance and troubleshooting'}},
  thermolace: {label: 'ThermoLace HDE installation instructions', bytes: 1450741,
    url: IX_BASE + '545a8573-bc2b-400d-9dac-9bfc3eda53e6/5013164.1_English_SO.pdf'}
};
const IX_DOWNLOADS = ['mpb', 'td', 'install'];
let IX_LATEST = null;                      // {checked, docs} from the function, kept in kv 'ixDocs'
const mb = n => (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + ' MB';
function ixDoc(kind){
  const l = IX_LATEST && IX_LATEST.docs && IX_LATEST.docs[kind];
  return Object.assign({}, INTRALOX_DOCS[kind], l && l.url ? {url: l.url, bytes: l.bytes || INTRALOX_DOCS[kind].bytes, modified: l.modified || ''} : {});
}
// a newer edition than the one downloaded here, as far as the last check knows
function ixNewer(kind, src){
  const l = IX_LATEST && IX_LATEST.docs && IX_LATEST.docs[kind];
  if(!l || !src) return false;
  return l.url !== src.url || !!(l.modified && src.modified && l.modified !== src.modified);
}
async function fetchWithProgress(url, onProg){
  const r = await fetch(url, {cache: 'no-store'});
  if(!r.ok) throw new Error('the Intralox site answered ' + r.status);
  const total = +r.headers.get('content-length') || 0;
  if(!r.body || !r.body.getReader) return r.blob();
  const reader = r.body.getReader(), parts = [];
  let got = 0;
  for(;;){
    const {done, value} = await reader.read();
    if(done) break;
    parts.push(value); got += value.length;
    onProg(got, total);
  }
  return new Blob(parts, {type: 'application/pdf'});
}
async function downloadManual(kind){
  const d = ixDoc(kind), msg = $('manMsg');
  if(!window.Manuals){ toast('manuals.js did not load'); return; }
  if(!navigator.onLine){ showMsg(msg, 'warn', 'No signal. Downloading a manual needs a connection, ideally Wi-Fi.'); return; }
  const btns = document.querySelectorAll('[data-ixget], #manBtn');
  btns.forEach(b => b.disabled = true);
  try {
    showMsg(msg, 'info', 'Downloading the ' + esc(d.label) + String.fromCharCode(8230) + ' Leave this screen on.');
    const blob = await fetchWithProgress(d.url, (got, total) => showMsg(msg, 'info',
      'Downloading the ' + esc(d.label) + ': ' + mb(got) + (total ? ' of ' + mb(total) : '') + String.fromCharCode(8230) + ' Leave this screen on.'));
    const file = new File([blob], decodeURIComponent(d.url.split('/').pop()), {type: 'application/pdf'});
    const srcAll = await kvGet('manualSrc') || {};
    const prev = srcAll[kind];
    const meta = await Manuals.importManual(file, d.doc ? 'full' : $('manMode').value, (stage, done, total) => {
      showMsg(msg, 'info', esc(stage) + ' ' + done + ' of ' + total + String.fromCharCode(8230) + ' Leave this screen on.');
    }, d.doc ? {doc: d.doc} : null);
    // a new edition that came in under another name replaces the old one
    if(prev && prev.id && prev.id !== meta.id) await Manuals.deleteManual(prev.id).catch(e => console.warn('old manual', e));
    srcAll[kind] = {url: d.url, modified: d.modified || '', id: meta.id, at: Date.now()};
    await kvSet('manualSrc', srcAll);
    showMsg(msg, 'ok', '<b>' + esc(meta.name) + '</b> downloaded from Intralox and imported' +
      (meta.doc ? ', ' : ' - ' + meta.sections.length + ' series, ') + meta.renderedPages + ' page images stored.');
    await logLoad(d.label + ' (intralox.com)', 'manual', meta.renderedPages + ' page images');
    toast('Manual imported');
    renderManStat(); renderManCount();
  } catch(e){
    console.error(e);
    showMsg(msg, 'warn', 'That did not work: ' + esc(e.message) + '. The manuals already on this device are untouched.');
  } finally {
    btns.forEach(b => b.disabled = false);
    renderIx().catch(() => {});
  }
}
// asked once a week by a signed-in device; force for the Check now button
async function checkManualEditions(force){
  if(!sbClient || !sbUser || !navigator.onLine) return false;
  const last = +(localStorage.getItem(LS('ixCheck')) || 0);
  if(!force && Date.now() - last < 7 * 864e5) return false;
  localStorage.setItem(LS('ixCheck'), String(Date.now()));
  const {data, error} = await sbClient.functions.invoke('intralox-manuals');
  if(error) throw error;
  if(!data || !data.docs || !Object.keys(data.docs).length) throw new Error('the check found no manuals on the Intralox pages');
  IX_LATEST = {checked: data.checked || new Date().toISOString(), docs: data.docs};
  await kvSet('ixDocs', IX_LATEST);
  await renderIx();
  return true;
}
async function renderIx(){
  const el = $('ixList');
  if(!el) return;
  if(!IX_LATEST) IX_LATEST = await kvGet('ixDocs') || {};
  const src = await kvGet('manualSrc') || {};
  let anyNew = false;
  el.innerHTML = IX_DOWNLOADS.map(k => {
    const d = ixDoc(k), mine = src[k], newer = ixNewer(k, mine);
    if(newer) anyNew = true;
    const state = !mine ? 'Not downloaded' : newer ? 'A newer edition is on the Intralox website'
      : 'Downloaded ' + new Date(mine.at).toLocaleDateString();
    return '<div class="ixrow' + (newer ? ' new' : '') + '"><div class="ixt"><b>' + esc(d.label[0].toUpperCase() + d.label.slice(1)) + '</b>' +
      '<span>' + esc(state) + ' &middot; ' + mb(d.bytes) + '</span></div>' +
      '<button type="button" class="btn' + (newer || !mine ? ' key' : '') + '" data-ixget="' + k + '">' +
      (newer ? 'Get the new one' : mine ? 'Download again' : 'Download') + '</button></div>';
  }).join('') +
  '<p class="hint">' + (IX_LATEST && IX_LATEST.checked
    ? 'Checked the Intralox website for new editions on ' + new Date(IX_LATEST.checked).toLocaleDateString() + '. '
    : '') + (sbUser ? 'It checks once a week by itself. <span class="lnk" id="ixCheckNow">Check now</span>'
    : 'Sign in to cloud sync and it checks for new editions once a week.') + '</p>';
  el.querySelectorAll('[data-ixget]').forEach(b => b.addEventListener('click', () => downloadManual(b.dataset.ixget)));
  const now = $('ixCheckNow');
  if(now) now.addEventListener('click', () => {
    showMsg($('manMsg'), 'info', 'Checking the Intralox website' + String.fromCharCode(8230));
    checkManualEditions(true).then(() => showMsg($('manMsg'), '', ''))
      .catch(e => showMsg($('manMsg'), 'warn', 'The check did not work: ' + esc(e.message || String(e))));
  });
  IX_ANY_NEW = anyNew;
  renderSettingsSummary();
}
let IX_ANY_NEW = false;
document.addEventListener('DOMContentLoaded', () => {
  renderIx().catch(e => console.warn('manual links', e));
  // after sign-in has had time to come back from storage
  setTimeout(() => checkManualEditions().catch(e => console.warn('manual check', e)), 8000);
});

/* Links to the Intralox website, under Reference. They open in the browser
   and need signal; the ThermoLace instructions follow the latest link. */
function renderWebLinks(){
  const el = $('webList');
  if(!el) return;
  const links = [
    ['Modular plastic belting resources', 'Engineering and installation manuals, brochures', 'https://www.intralox.com/products/modular-plastic-belting/resources'],
    ['ThermoDrive resources', 'Engineering manual, splicing, installation', 'https://www.intralox.com/products/thermodrive/resources'],
    ['ThermoLace HDE installation instructions', 'PDF, ' + mb(ixDoc('thermolace').bytes), ixDoc('thermolace').url],
    ['Technical resources', 'Everything Intralox publishes', 'https://www.intralox.com/resources'],
    ['Belt Finder', 'Find a belt by application', 'https://www.intralox.com/belt-finder'],
    ['Installation and maintenance videos', 'How-to videos', 'https://www.intralox.com/resources/how-to-videos']
  ];
  el.innerHTML = links.map(([t, sub, href]) =>
    '<a class="rpt weblink" href="' + esc(href) + '" target="_blank" rel="noopener">' +
      '<div class="rn">' + esc(t) + '</div><div class="rm">' + esc(sub) + '</div></a>').join('');
}

function renderSettingsSummary(){
  const put = (id, txt) => { const e = $(id); if(e) e.textContent = txt; };
  const first = id => (($(id) && $(id).innerText) || '').split('\n').map(x => x.trim()).filter(Boolean);
  put('sumCloud', first('sbStat').join(' \u00b7 ') || 'Not set up');
  put('sumData', META && META.counts ? META.counts.accounts + ' accounts' + (REF ? ', belt data' : '') + (ASSETS ? ', plant register' : '') : 'Nothing imported yet');
  put('sumMan', (first('manStat')[0] || 'No manuals loaded') + (IX_ANY_NEW ? ' \u00b7 a new edition is out' : ''));
  put('sumBk', (first('bkStat')[0] || '').replace(/\s+/g, ' ') || 'No backup taken on this device');
  put('sumMe', ($('setEmail') && $('setEmail').value) || 'Email not set');
  put('sumLog', LOAD_LOG.length ? LOAD_LOG.length + ' recent' : 'None yet');
  put('sumVer', 'Build ' + APP_BUILD);
}
function renderBackupAge(){
  const el = $('bkHomeStat');
  if(!el) return;
  const last = +(localStorage.getItem(LS('lastBackup')) || 0);
  if(!last){
    el.className = 'stat bkold';
    el.textContent = 'Never backed up.';
    return;
  }
  const days = Math.floor((Date.now() - last) / 86400000);
  el.className = 'stat' + (days >= 14 ? ' bkold' : '');
  el.textContent = days <= 0 ? 'Backed up today.'
    : 'Last backup ' + days + ' day' + (days === 1 ? '' : 's') + ' ago.';
}


document.addEventListener('DOMContentLoaded', () => {
  const c = $('openCancel');
  if(c) c.addEventListener('click', closeOpenPicker);
});


/* ---------- standard meeting invites ----------
   These land in the Agenda field, which becomes the ICS DESCRIPTION and so the
   body of the Outlook invite. Filling the field rather than storing a template
   reference means every invite stays editable and nothing changes under an
   appointment that was already sent.

   {customer} and {mgr} fill from the appointment and settings. {project} cannot
   be known, so the project template asks. */
const INVITE_TMPL = {
  health: {
    name: 'Health check',
    mins: 120,
    body:
"Hi {customer},\n\n" +
"Thanks for taking the time to speak with me.\n\n" +
"The purpose of this visit is to conduct a high-level health check of the conveyor " +
"systems and discuss any upcoming projects, challenges, or opportunities at the site.\n\n" +
"While I'm there, if there are any conveyors causing downtime, reliability issues, or " +
"elevated maintenance requirements, please feel free to make the most of my time on " +
"site and we can review them together.\n\n" +
"Please feel free to share the meeting invitation with the team if they have any " +
"conveyor related needs.\n\n" +
"Thanks again, and I look forward to meeting you.\n\n" +
"{mgr}"
  },
  project: {
    name: 'Project discussion',
    mins: 60,
    asks: 'project',
    body:
"Hi {customer},\n\n" +
"Thanks for taking the time to speak with me.\n\n" +
"The purpose of this visit is to discuss {project} \u2014 where it currently sits, what " +
"the requirements are, and how we can best support you through it.\n\n" +
"If it suits, I am happy to also carry out a high-level health check of the conveyor " +
"systems while I am on site. If there are any conveyors causing downtime, reliability " +
"issues, or elevated maintenance requirements, we can review them together at the same " +
"time.\n\n" +
"Please feel free to share the meeting invitation with the team if they have any " +
"conveyor related needs.\n\n" +
"Thanks again, and I look forward to meeting you.\n\n" +
"{mgr}"
  },
  /* Left deliberately as a skeleton. Writing the body for these would be me
     inventing how you pitch, which is not mine to guess at. */
  pov: { name: 'Proof of value', mins: 60, stub: true, body:
"Hi {customer},\n\n\n\n{mgr}" },
  survey: {
    name: 'Belt survey',
    mins: 120,
    body:
"Hi {customer},\n\n" +
"Thanks for taking the time to speak with me.\n\n" +
"The purpose of this visit is to continue documenting the belts across the plant, " +
"building a complete record of what is installed, where it runs, and what condition " +
"it is in.\n\n" +
"While I'm there, if there are any conveyors causing downtime, reliability issues, or " +
"elevated maintenance requirements, please feel free to make the most of my time on " +
"site and we can review them together.\n\n" +
"Please feel free to share the meeting invitation with the team if they have any " +
"conveyor related needs.\n\n" +
"Thanks again, and I look forward to meeting you.\n\n" +
"{mgr}"
  }
};

function fillInvite(key){
  const t = INVITE_TMPL[key];
  if(!t) return;
  const note = $('dTmplNote');
  /* ap.acct carries the account name straight on the appointment; the ak map is
     the fallback for one written on another device. */
  const customer = (dlgAppt && (dlgAppt.acct ||
    (dlgAppt.ak && KEY_TO_ACCT.get(dlgAppt.ak)))) || '';
  const mgr = localStorage.getItem(LS('mgr')) || '';

  let project = '';
  if(t.asks === 'project'){
    project = (prompt('Project name') || '').trim();
    if(!project) return;                 // cancelled - leave the agenda alone
  }

  const body = t.body
    .replace(/\{customer\}/g, customer || 'there')
    .replace(/\{project\}/g, project)
    .replace(/\{mgr\}/g, mgr);

  const ta = $('dAgenda');
  if(ta.value.trim() && !confirm('Replace what is already in the agenda?')) return;
  ta.value = body;

  const dur = $('dDur');
  if(dur && t.mins){
    const opt = Array.from(dur.options).find(o => +o.value === t.mins);
    if(opt) dur.value = String(t.mins);
  }
  document.querySelectorAll('#dTmpl button').forEach(b =>
    b.classList.toggle('on', b.dataset.tmpl === key));
  if(note) note.textContent = t.stub
    ? t.name + ' is a blank template - type the body in.'
    : t.name + ' filled in. Edit it however you like before saving.';
  if(t.stub){ ta.focus(); ta.setSelectionRange(body.indexOf('\n\n') + 2, body.indexOf('\n\n') + 2); }
}

document.addEventListener('DOMContentLoaded', () => {
  const box = $('dTmpl');
  if(box) box.addEventListener('click', e => {
    const b = e.target.closest('button[data-tmpl]');
    if(b) fillInvite(b.dataset.tmpl);
  });
});


document.addEventListener('DOMContentLoaded', () => {
  const head = $('dashStat');
  if(head) head.addEventListener('click', () => { if(call) go('ccontacts'); });
  const q = $('ccQ');
  if(q) q.addEventListener('input', renderCallContacts);
  const done = $('ccDone');
  if(done) done.addEventListener('click', () => go('dash'));
  const add = $('ccAddNew');
  if(add) add.addEventListener('click', async () => {
    const n = $('ccName').value.trim();
    if(!n){ toast('Enter a name first'); return; }
    call.contacts.push({name:n, role:$('ccRole').value.trim(), email:$('ccEmail').value.trim(),
      mobile:$('ccMob').value.trim(), crm:false, doc:true});
    ['ccName','ccRole','ccEmail','ccMob'].forEach(i => $(i).value = '');
    await saveCall(); renderCallContacts(); renderDash();
    toast(n + ' added');
  });
});


document.addEventListener('DOMContentLoaded', () => {
  const e = $('setEmail');
  if(e){
    e.value = localStorage.getItem(LS('email')) || '';
    e.addEventListener('change', () => {
      localStorage.setItem(LS('email'), e.value.trim());
      toast(e.value.trim() ? 'Saved' : 'Cleared');
    });
  }
  /* The default, set once. The dashboard picker overrides it for one output
     without changing it - remembering the last choice instead would mean one
     customer PDF quietly changing every RFQ after it. */
  const im = $('setImgMode');
  if(im){
    im.value = defaultImgMode();
    im.addEventListener('change', () => {
      setDefaultImgMode(im.value);
      const o = $('outImg');
      if(o) { o.value = im.value; renderOutHint(); }
      toast('Saved');
    });
  }
  /* Ticking placeholder makes the invitee list moot, so the dialog says so
     rather than leaving the contact ticks looking like they still apply. */
  const hold = $('dHold');
  if(hold) hold.addEventListener('change', () => {
    const cover = $('dCover');
    if(cover && hold.checked){
      cover.textContent = 'Placeholder - the time is blocked for you and nobody is invited.';
      cover.className = 'note';
    } else if(cover && dlgAppt){
      const a = ACC_BY_NAME.get(dlgAppt.acct);
      const cs = (a && a.c) ? a.c : [];
      const withP = cs.filter(c => c.p).length;
      cover.textContent = withP+' of '+cs.length+' contacts have a phone number on file. '+
        'Missing numbers are marked in the invite.';
      cover.className = 'note' + (withP === 0 ? ' warn' : '');
    }
  });
});


/* ---------- merged screens ----------
   The panes are the original screens' own markup, so every render function
   below writes into the elements it always did. Only which pane is visible
   changes. */
let dirPane = 'acc', refPane = 'man';

function showDir(p){ dirPane = p || dirPane; go('directory'); renderDirPane(); }
function showRef(p){ refPane = p || refPane; go('reference'); renderRefPane(); }

function renderDirPane(){
  const acc = dirPane === 'acc';
  $('paneAcc').hidden = !acc;
  $('panePpl').hidden = acc;
  document.querySelectorAll('#dirTabs button').forEach(b =>
    b.classList.toggle('on', b.dataset.pane === dirPane));
  if(acc) renderBrowse(); else renderPeople();
}
function renderRefPane(){
  const man = refPane === 'man';
  $('paneMan').hidden = !man;
  $('paneFlt').hidden = refPane !== 'flt';
  $('paneWeb').hidden = refPane !== 'web';
  if(refPane === 'web') renderWebLinks();
  document.querySelectorAll('#refTabs button').forEach(b =>
    b.classList.toggle('on', b.dataset.pane === refPane));
  if(man){ if(window.Manuals) Manuals.render().catch(e=>console.error('manuals', e)); }
  else if(refPane === 'flt'){ if(window.HealthLib) HealthLib.render(); }
}

document.addEventListener('DOMContentLoaded', () => {
  const dt = $('dirTabs');
  if(dt) dt.addEventListener('click', e => {
    const b = e.target.closest('button[data-pane]');
    if(b){ dirPane = b.dataset.pane; renderDirPane(); }
  });
  const rt = $('refTabs');
  if(rt) rt.addEventListener('click', e => {
    const b = e.target.closest('button[data-pane]');
    if(b){ refPane = b.dataset.pane; renderRefPane(); }
  });
});


document.addEventListener('DOMContentLoaded', () => {
  renderBuildCheck();
});

/* ---------- is this one build, or a mix of two? ----------
   app.js, index.html and sw.js are uploaded by hand and any one can be missed.
   Miss index.html and the app looks like the previous version while behaving
   like this one, which from the outside is indistinguishable from the app going
   backwards - and index.html is the file this check was missing, because it
   carried no version of its own. It does now.

   The line is repeated on the home screen, because Settings is not where you
   look when something seems wrong. */
function buildReport(){
  const meta = document.querySelector('meta[name="build"]');
  const page = meta ? meta.getAttribute('content') : null;
  let cache = null;
  try {
    if(typeof caches !== 'undefined') return caches.keys().then(ks => {
      const mine = ks.filter(k => /^fieldcrm-v\d+$/.test(k))
        .sort((a,b) => Number(b.split('-v')[1]) - Number(a.split('-v')[1]));
      return {code: APP_BUILD, page: page, cache: mine.length ? 'v'+mine[0].split('-v')[1] : null};
    }).catch(() => ({code: APP_BUILD, page: page, cache: null}));
  } catch(e){}
  return Promise.resolve({code: APP_BUILD, page: page, cache: cache});
}
function paintBuild(el, st){
  if(!el) return;
  const bad = [];
  if(!st.page) bad.push('index.html (no build marker - it is an older copy)');
  else if(st.page !== st.code) bad.push('index.html');
  if(st.cache && st.cache !== st.code) bad.push('sw.js');
  if(!bad.length){
    el.className = el.id === 'appVer' ? 'hint' : 'msg';
    el.innerHTML = 'Build ' + esc(st.code) + (st.cache ? ' \u00b7 cache ' + esc(st.cache) : '');
    return;
  }
  el.className = 'msg warn show';
  el.innerHTML = '<b>This app is a mix of versions.</b> app.js is <b>' + esc(st.code) +
    '</b>, index.html is <b>' + esc(st.page || 'older') + '</b>' +
    (st.cache ? ', the running cache is <b>' + esc(st.cache) + '</b>' : '') +
    '.<br>Re-upload ' + esc(bad.join(' and ')) + ' from the same set as app.js, then close the app ' +
    'completely and open it again.' +
    (bad.some(b => b.indexOf('sw.js') === 0)
      ? '<br>Until the cache matches, the phone serves the older build whatever is in the repository.'
      : '');
}
function renderBuildCheck(){
  buildReport().then(st => {
    paintBuild($('appVer'), st);
    paintBuild($('buildStat'), st);
  }).catch(()=>{});
}


/* ---------- plan menu ----------
   Everything that is not navigation lives behind one button. The manager is set
   once and other people's accounts are still reachable through the search box,
   so it belongs here rather than taking a permanent slot in the rail.

   The controls in here are proxies: each one clicks the original hidden button,
   so none of the existing handlers had to move or be rewritten. */
function openPlanMenu(){
  const dlg = $('planmenu');
  if(!dlg) return;
  /* Mirror the manager select rather than moving it, so whatever populates the
     original keeps working. */
  const src = $('pMgr'), dst = $('pmMgr');
  dst.innerHTML = src.innerHTML;
  dst.value = src.value;
  $('pmHint').textContent = $('calHint').textContent || '';
  $('pmSub').textContent = $('zTitle').textContent || '';
  if(dlg.showModal) dlg.showModal(); else dlg.setAttribute('open','');
  pushDialog('planmenu');
}
function closePlanMenu(){
  const dlg = $('planmenu');
  if(!dlg || !dlg.hasAttribute('open')) return;
  if(history.state && history.state.dialog === 'planmenu'){ history.back(); return; }
  if(dlg.close) dlg.close(); else dlg.removeAttribute('open');
}

document.addEventListener('DOMContentLoaded', () => {
  const more = $('planMore');
  if(more) more.addEventListener('click', openPlanMenu);
  const close = $('pmClose');
  if(close) close.addEventListener('click', closePlanMenu);

  const mgr = $('pmMgr');
  if(mgr) mgr.addEventListener('change', () => {
    $('pMgr').value = mgr.value;
    $('pMgr').dispatchEvent(new Event('change'));
  });

  /* Download leaves the menu open - it reports what it did and you often do the
     other one straight after. The rest close, because they take you elsewhere. */
  [['pmExport','pExport',false],['pmExportAll','pExportAll',false],
   ['pmToday','pToday2',true],['pmReassign','pReassign',true]].forEach(([from,to,shut]) => {
    const b = $(from);
    if(b) b.addEventListener('click', () => {
      if(shut) closePlanMenu();
      $(to).click();
      if(!shut) setTimeout(() => { $('pmHint').textContent = $('calHint').textContent || ''; }, 60);
    });
  });
});
