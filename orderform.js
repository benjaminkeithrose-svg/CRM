/* Field CRM - the customer's order form (v183)

   Moved in from the Belt Order Builder (Ben's asset-management repository,
   2026-10-27). An account's order sheet holds that customer's favourites:
   belt and sprocket specs, each with a short list of the materials, colours,
   rods, widths, pitch diameters it may be ordered in. Send order form bakes
   the ticked ones into one self-contained HTML file for the customer: no
   catalogue, no link back to anything, no notes for sales. They open it, pick
   from what is on it, and Copy order for email puts the request on the
   clipboard as the same tables an Intralox order request reads as.

   orderFormHTML(d) builds the file. Everything the customer's copy runs is in
   ofFormRuntime below, which goes into the file as its own source text, so it
   may use nothing from outside itself except the data it is handed.

   Changes from the builder's form: buttons are navy, never red (the brand
   guideline; red stays on the logo box); Order or Quote is a segmented choice;
   messages show in the page instead of pop-ups; the order kept in the
   customer's browser is kept per form, so two forms never share one order. */

const OF_CSS = `
  :root { --ink:#222222; --ink-2:#4D4D4F; --ink-3:#77787A; --ground:#E1EAF0; --surface:#FFFFFF; --sunk:#F2F7FA;
    --line-2:#E3E3E3; --edge:#A6BDCB; --red:#ED1C24; --cyan:#479EBC; --cyan-dk:#00708D; --cyan-lt:#E3F0F5;
    --ok:#237F35; --ok-lt:#EEF5EF; --orange-dk:#E36C00; --orange-lt:#FFF1D9; --act:#00287B; --act-dk:#001A52;
    --r:12px; --r-sm:8px; --r-pill:999px; --lift:0 1px 2px rgba(0,40,60,.06), 0 2px 6px rgba(0,40,60,.07); }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Roboto, Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 15px; background: var(--ground); color: var(--ink); }
  button, input { font: inherit; color: inherit; }
  :focus-visible { outline: 2px solid var(--cyan-dk); outline-offset: 1px; }
  .wrap { max-width: 900px; margin: 0 auto; padding: 16px 16px 90px; }
  header { position: sticky; top: 0; z-index: 20; background: var(--surface); border-bottom: 1px solid var(--line-2);
    box-shadow: var(--lift); display: flex; align-items: stretch; min-height: 54px; }
  header .redbox { background: var(--red); width: 84px; flex: none; display: flex; align-items: center; justify-content: center; padding: 0 10px; }
  header .redbox img { width: 100%; height: auto; display: block; }
  header .hdt { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; padding: 8px 12px; }
  header h1 { font-size: 17px; margin: 0; font-weight: 700; letter-spacing: -.01em; }
  header .sub { color: var(--ink-3); font-size: 12px; margin-top: 2px; line-height: 1.4; }
  h2 { font-size: 15px; margin: 0 0 10px; font-weight: 700; }
  .card { background: var(--surface); border: 1px solid var(--edge); border-left: 3px solid var(--cyan); border-radius: var(--r);
    padding: 14px 16px; margin-bottom: 16px; box-shadow: var(--lift); }
  .row { display: flex; gap: 12px; flex-wrap: wrap; }
  .field { flex: 1 1 160px; margin-bottom: 12px; min-width: 0; }
  .field label { display: block; font-size: 12.5px; color: var(--ink-2); margin-bottom: 5px; }
  input[type="text"], input[type="number"], input[type="date"] { width: 100%; padding: 10px 12px; font-size: 16px;
    border: 1px solid var(--edge); border-radius: var(--r-sm); background: var(--sunk); }
  input:focus { outline: none; background: var(--surface); border-color: var(--cyan-dk); box-shadow: 0 0 0 3px var(--cyan-lt); }
  input:disabled { background: var(--line-2); color: var(--ink-3); }
  .seg { display: flex; border: 1px solid var(--edge); border-radius: var(--r-sm); overflow: hidden; background: var(--sunk); max-width: 360px; }
  .seg button { flex: 1; background: transparent; border: 0; border-left: 1px solid var(--line-2); padding: 11px 6px; color: var(--ink-2); cursor: pointer; }
  .seg button:first-child { border-left: 0; }
  .seg button.on { background: var(--ink-2); color: #fff; font-weight: 700; }
  .chips { display: flex; flex-wrap: wrap; gap: 7px; }
  .chips button { padding: 9px 13px; font-size: 14px; border-radius: var(--r-pill); border: 1px solid var(--edge); background: var(--surface); cursor: pointer; min-height: 40px; }
  .chips button.on { background: var(--cyan-lt); border-color: var(--cyan-dk); color: var(--cyan-dk); font-weight: 700; }
  .btn { padding: 10px 16px; border-radius: var(--r-sm); cursor: pointer; font-weight: 700; min-height: 42px; }
  .btn.go { background: var(--act); border: 1px solid var(--act); color: #fff; box-shadow: var(--lift); }
  .btn.go:active { background: var(--act-dk); }
  .btn.act2 { background: var(--surface); border: 1px solid var(--act); color: var(--act); }
  .btn.small { padding: 6px 12px; min-height: 36px; font-size: 13px; }
  .item { border: 1px solid var(--edge); border-radius: var(--r); padding: 10px 12px; margin-bottom: 8px; display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
  .item .kind { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: var(--ink-3); font-weight: 700; }
  .item .summary { font-size: 14px; line-height: 1.5; min-width: 0; }
  .empty { color: var(--ink-3); font-size: 13px; padding: 12px 0; }
  .msg { display: none; padding: 9px 11px; border-radius: var(--r-sm); font-size: 13px; margin-top: 8px; line-height: 1.45; }
  .msg.show { display: block; }
  .msg.ok { background: var(--ok-lt); color: #1B5F28; }
  .msg.warn { background: var(--orange-lt); color: #8A4B00; }
  .msg.info { background: var(--cyan-lt); color: var(--cyan-dk); }
  .footer-bar { position: sticky; bottom: 0; background: var(--surface); border-top: 1px solid var(--line-2);
    padding: 12px 16px; margin: 0 -16px; display: flex; justify-content: space-between; align-items: center; gap: 10px; }
  .footer-bar .count { font-size: 13px; color: var(--ink-3); }
  #previewWrap { display: none; } #previewWrap.show { display: block; }
  #previewHolder { border: 1px solid var(--edge); border-radius: var(--r); padding: 14px; background: var(--surface); margin-top: 10px; overflow-x: auto; }
  .locked { background: var(--sunk); border-radius: var(--r-sm); padding: 8px 10px; font-size: 13px; line-height: 1.5; margin-bottom: 10px; }
  .hide { display: none !important; }
  .spec { border: 1px solid var(--edge); border-radius: var(--r-sm); margin-bottom: 8px; overflow: hidden; }
  .specHead { display: flex; justify-content: space-between; align-items: center; width: 100%; text-align: left; background: var(--surface);
    border: none; padding: 12px 14px; cursor: pointer; font-size: 14px; font-weight: 700; }
  .specHead:active { background: var(--sunk); }
  .specSub { display: block; font-size: 12px; color: var(--ink-3); font-weight: 400; margin-top: 2px; }
  .specIcon { font-size: 20px; line-height: 1; color: var(--cyan-dk); flex-shrink: 0; margin-left: 10px; }
  .specBody { padding: 12px 14px 14px; border-top: 1px solid var(--line-2); }
`;

/* The customer's copy. D is the data baked in by orderFormHTML. */
function ofFormRuntime(D){
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const KEY = 'fieldcrmOrderForm.' + D.formId;
  function showMsg(el, cls, html){ el.className = html ? 'msg ' + cls + ' show' : 'msg'; el.innerHTML = html || ''; }
  function renderChips(el, values, selected){
    el.innerHTML = values.map(v => '<button type="button" data-v="' + esc(v) + '" class="' + (v === selected ? 'on' : '') + '" aria-pressed="' + (v === selected) + '">' + esc(v) + '</button>').join('');
  }
  function wireChips(el, onPick){
    el.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      el.querySelectorAll('button').forEach(x => { x.classList.remove('on'); x.setAttribute('aria-pressed', 'false'); });
      b.classList.add('on'); b.setAttribute('aria-pressed', 'true'); onPick(b.dataset.v);
    }));
  }
  const chipValue = el => { const on = el.querySelector('button.on'); return on ? on.dataset.v : ''; };

  let order = {customer: D.customer, project: '', orderNumber: '', orderType: 'quote', date: '', company: D.company, contact: D.contact, email: D.email, items: []};
  let nextId = 1;
  const saveOrder = () => { try { localStorage.setItem(KEY, JSON.stringify(order)); } catch(e){} };
  function readMeta(){
    order.project = $('orderProject').value.trim();
    order.orderNumber = $('orderNumber').value.trim();
    order.date = $('orderDate').value;
    saveOrder();
  }
  ['orderProject', 'orderNumber', 'orderDate'].forEach(id => $(id).addEventListener('input', readMeta));
  function paintType(){
    $('orderType').querySelectorAll('button').forEach(b => { const on = b.dataset.v === order.orderType; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    $('orderNumber').disabled = order.orderType !== 'order';
    $('orderNumber').placeholder = order.orderType === 'order' ? 'Your PO number' : 'Choose Order first';
  }
  $('orderType').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    order.orderType = b.dataset.v;
    if(order.orderType !== 'order') $('orderNumber').value = '';
    paintType(); readMeta();
  }));

  function itemSummary(item){
    if(item.type === 'belt'){
      const main = [item.series && ('Series ' + item.series), item.style, item.material, item.colour, item.width && (item.width + ' mm wide'), item.length && (item.length + ' m')].filter(Boolean).map(esc).join(' &middot; ');
      const extra = [];
      if(item.rollerConfig) extra.push('Configuration: ' + esc(item.rollerConfig));
      if(item.hasFlights) extra.push('Flights: ' + esc(item.flightType || '?'));
      if(item.hasSideguards) extra.push('Sideguards: ' + esc(item.sideguardType || '?'));
      if(item.hasSprocket && item.sprDesc) extra.push(['Sprocket: ' + esc(item.sprDesc), item.sprQty && (esc(item.sprQty) + ' off'),
        item.hasRetainers && ('heavy-duty retainers' + (item.retainerQty ? ' x' + esc(item.retainerQty) : ''))].filter(Boolean).join(' &middot; '));
      return {kind: 'Belt', main: main || '(not chosen yet)', extra: extra.join(' &middot; ')};
    }
    const main = [item.series && ('Series ' + item.series), item.bore, item.pd, item.material, item.qty && (item.qty + ' off')].filter(Boolean).map(esc).join(' &middot; ');
    return {kind: 'Sprocket', main: main || '(not chosen yet)', extra: esc(item.description || '')};
  }
  function addItem(item){ item.id = nextId++; order.items.push(item); renderItems(); showMsg($('addMsg'), 'ok', 'Added. ' + order.items.length + (order.items.length === 1 ? ' item' : ' items') + ' in this request.'); }
  function renderItems(){
    const list = $('itemList');
    list.innerHTML = order.items.map(item => {
      const s = itemSummary(item);
      return '<div class="item"><div class="summary"><span class="kind">' + s.kind + '</span><br>' + s.main +
        (s.extra ? '<br><span style="color:var(--ink-3);font-size:13px">' + s.extra + '</span>' : '') +
        (item.notes ? '<br><span style="color:var(--ink-3);font-size:12.5px">Note: ' + esc(item.notes) + '</span>' : '') + '</div>' +
        '<button type="button" class="btn act2 small" data-remove="' + item.id + '">Remove</button></div>';
    }).join('');
    $('emptyMsg').style.display = order.items.length ? 'none' : 'block';
    $('itemCount').textContent = order.items.length + (order.items.length === 1 ? ' item' : ' items');
    list.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => {
      order.items = order.items.filter(i => i.id !== Number(b.dataset.remove)); renderItems();
    }));
    saveOrder();
  }
  function wireFold(id){
    $('hd_' + id).addEventListener('click', () => {
      const body = $('body_' + id), opening = body.classList.contains('hide');
      body.classList.toggle('hide'); $('ic_' + id).textContent = opening ? '−' : '+';
      $('hd_' + id).setAttribute('aria-expanded', String(opening));
    });
  }
  const head = (f, sub) => '<button type="button" class="specHead" id="hd_' + f.id + '" aria-expanded="false"><span>' + esc(f.label) +
    '<span class="specSub">' + sub + '</span></span><span class="specIcon" id="ic_' + f.id + '" aria-hidden="true">+</span></button>';
  function beltHTML(f){
    const fixed = [];
    if(f.rollerConfig) fixed.push('Configuration: ' + esc(f.rollerConfig));
    if(f.indent) fixed.push('Indent: ' + esc(f.indent));
    if(f.hasFlights) fixed.push('Flights: ' + esc([f.flightType, f.flightHeightMm && f.flightHeightMm + ' mm'].filter(Boolean).join(', ') || '?'));
    if(f.hasSideguards) fixed.push('Sideguards: ' + esc([f.sideguardType, f.sideguardHeight && f.sideguardHeight + ' mm'].filter(Boolean).join(', ') || '?'));
    if(f.hasSprocket) fixed.push('Sprocket: ' + esc(f.sprDesc || [f.bore, f.pd].filter(Boolean).join(' / ')) + (f.hasRetainers ? ' + heavy-duty retainers' : ''));
    return '<div class="spec">' + head(f, esc(f.style)) + '<div class="specBody hide" id="body_' + f.id + '">' +
      '<div class="locked"><b>' + esc(f.style) + '</b>' + (fixed.length ? '<br>' + fixed.join(' &middot; ') : '') + '</div>' +
      '<div class="row"><div class="field"><label>Material</label><div class="chips" id="mat_' + f.id + '"></div></div>' +
      '<div class="field"><label>Colour</label><div class="chips" id="col_' + f.id + '"></div></div></div>' +
      '<div class="row"><div class="field"><label>Rod material</label><div class="chips" id="rod_' + f.id + '"></div></div>' +
      '<div class="field"><label>Width (mm)</label><div class="chips" id="wid_' + f.id + '"></div></div></div>' +
      '<div class="row"><div class="field"><label for="len_' + f.id + '">Length (m)</label><input type="number" min="0" step="0.1" id="len_' + f.id + '"></div>' +
      (f.hasSprocket ? '<div class="field"><label for="sprqty_' + f.id + '">Number of sprockets</label><input type="number" min="0" id="sprqty_' + f.id + '"></div>' : '') +
      (f.hasRetainers ? '<div class="field"><label for="retqty_' + f.id + '">Heavy-duty retainers, how many</label><input type="number" min="0" id="retqty_' + f.id + '"></div>' : '') +
      '<div class="field"><label for="notes_' + f.id + '">Notes</label><input type="text" id="notes_' + f.id + '"></div></div>' +
      '<button type="button" class="btn go" id="add_' + f.id + '">Add to order</button><div class="msg" id="err_' + f.id + '"></div></div></div>';
  }
  function wireBelt(f){
    wireFold(f.id);
    const matC = $('mat_' + f.id), colC = $('col_' + f.id), widC = $('wid_' + f.id), rodC = $('rod_' + f.id);
    const colours = () => { const pool = (f.materialColours && f.materialColours[chipValue(matC)]) || f.colours; renderChips(colC, pool, pool[0]); wireChips(colC, () => {}); };
    const rods = f.rods && f.rods.length ? f.rods : ['—'];
    renderChips(rodC, rods, rods[0]); wireChips(rodC, () => {});
    renderChips(matC, f.materials, f.materials[0]); wireChips(matC, colours); colours();
    renderChips(widC, f.widths, f.widths[0]); wireChips(widC, () => {});
    $('add_' + f.id).addEventListener('click', () => {
      const width = chipValue(widC);
      if(!width){ showMsg($('err_' + f.id), 'warn', 'Pick a width first.'); return; }
      showMsg($('err_' + f.id), '', '');
      addItem({type: 'belt', series: f.series, style: f.style, material: chipValue(matC), colour: chipValue(colC), width,
        rod: chipValue(rodC) === '—' ? '' : chipValue(rodC), indent: f.indent, rollerConfig: f.rollerConfig,
        hasFlights: f.hasFlights, flightType: f.flightType, flightMaterial: f.flightMaterial, flightRows: f.flightRows, flightHeightMm: f.flightHeightMm,
        hasSideguards: f.hasSideguards, sideguardType: f.sideguardType, sideguardMaterial: f.sideguardMaterial, sideguardHeight: f.sideguardHeight,
        hasSprocket: f.hasSprocket, bore: f.bore, pd: f.pd, sprMat: f.sprMat, sprVariant: f.sprVariant, sprDesc: f.sprDesc, sprPn: f.sprPn, hasRetainers: f.hasRetainers,
        length: $('len_' + f.id).value, sprQty: $('sprqty_' + f.id) ? $('sprqty_' + f.id).value : '',
        retainerQty: $('retqty_' + f.id) ? $('retqty_' + f.id).value : '', notes: $('notes_' + f.id).value.trim()});
      ['len_', 'notes_', 'sprqty_', 'retqty_'].forEach(p => { if($(p + f.id)) $(p + f.id).value = ''; });
    });
  }
  function sprocketHTML(f){
    return '<div class="spec">' + head(f, esc(f.bore)) + '<div class="specBody hide" id="body_' + f.id + '">' +
      '<div class="locked"><b>' + esc(f.bore) + '</b></div>' +
      '<div class="row"><div class="field"><label>Pitch diameter / teeth</label><div class="chips" id="pd_' + f.id + '"></div></div>' +
      '<div class="field"><label>Material</label><div class="chips" id="mat_' + f.id + '"></div></div></div>' +
      '<div class="locked hide" id="desc_' + f.id + '"></div>' +
      '<div class="row"><div class="field"><label for="qty_' + f.id + '">Quantity</label><input type="number" min="1" value="1" id="qty_' + f.id + '"></div>' +
      '<div class="field"><label for="notes_' + f.id + '">Notes</label><input type="text" id="notes_' + f.id + '"></div></div>' +
      '<button type="button" class="btn go" id="add_' + f.id + '">Add to order</button></div></div>';
  }
  function wireSprocket(f){
    wireFold(f.id);
    const pdC = $('pd_' + f.id), matC = $('mat_' + f.id);
    const hit = () => (f.materialLookup[chipValue(pdC)] || {})[chipValue(matC)] || {};
    const desc = () => { const h = hit(); $('desc_' + f.id).textContent = h.description || ''; $('desc_' + f.id).classList.toggle('hide', !h.description); };
    renderChips(pdC, f.pds, f.pds[0]); wireChips(pdC, desc);
    renderChips(matC, f.materials, f.materials[0]); wireChips(matC, desc); desc();
    $('add_' + f.id).addEventListener('click', () => {
      const h = hit();
      addItem({type: 'sprocket', series: f.series, bore: f.bore, pd: chipValue(pdC), material: chipValue(matC),
        variant: h.variant || '', description: h.description || '', partNumber: h.partNumber || '', qty: $('qty_' + f.id).value || 1, notes: $('notes_' + f.id).value.trim()});
      $('notes_' + f.id).value = '';
    });
  }
  const num = s => { const n = parseFloat(s); return isNaN(n) ? Infinity : n; };
  const series = [...new Set(D.belts.map(f => f.series).concat(D.sprockets.map(f => f.series)))].sort((a, b) => num(a) - num(b) || String(a).localeCompare(String(b)));
  series.forEach(s => {
    const bs = D.belts.filter(f => f.series === s), ss = D.sprockets.filter(f => f.series === s);
    $('specCards').insertAdjacentHTML('beforeend', '<div class="card"><h2>Series ' + esc(s) + '</h2>' + bs.map(beltHTML).join('') + ss.map(sprocketHTML).join('') + '</div>');
    bs.forEach(wireBelt); ss.forEach(wireSprocket);
  });

  /* ---- the request as an email: inline styles only, so it survives Outlook ---- */
  const W = 640;
  const dash = v => v !== '' && v != null ? esc(v) : '&mdash;';
  const h2 = t => '<h2 style="font-size:12px;margin:22px 0 10px;padding:0 0 5px;border-bottom:1px solid #E3E3E3;color:#00708D;letter-spacing:.08em;text-transform:uppercase;font-weight:bold;">' + esc(t) + '</h2>';
  const cell = (v, label) => '<td style="background:' + (label ? '#F7F8F8' : '#FFFFFF') + ';' + (label ? 'width:38%;color:#4D4D4F;font-weight:bold;' : 'color:#222222;') +
    'font-size:12px;padding:7px 10px;border:1px solid #D4D6D8;">' + (label ? esc(v) : dash(v)) + '</td>';
  const metaCell = (v, label) => '<td style="background:' + (label ? '#F7F8F8' : '#FFFFFF') + ';' + (label ? 'white-space:nowrap;color:#4D4D4F;font-weight:bold;' : 'color:#222222;') +
    'font-size:12px;padding:6px 10px;border:1px solid #D4D6D8;">' + (label ? esc(v) : dash(v)) + '</td>';
  function kvRows(pairs){
    const rows = [];
    for(let i = 0; i < pairs.length; i += 2) rows.push(pairs.slice(i, i + 2));
    return rows.map(r => '<tr>' + r.map(([k, v]) => metaCell(k, true) + metaCell(v, false)).join('') + '</tr>').join('');
  }
  function beltGroups(b){
    const req = (l, v) => [l, v, true], opt = (l, v) => [l, v, false];
    const belt = [req('Series', b.series), req('Style', b.style), req('Belt material', b.material), opt('Colour', b.colour), req('Rod material', b.rod),
      req('Width (mm)', b.width), opt('Length (m)', b.length), opt('Configuration', b.rollerConfig)];
    const fl = [opt('Flight type', b.hasFlights ? b.flightType : ''), opt('Flight material', b.hasFlights ? b.flightMaterial : ''),
      opt('Flight height (mm)', b.hasFlights ? b.flightHeightMm : ''), opt('Flight rows', b.hasFlights ? b.flightRows : ''), opt('Indent', b.indent),
      opt('Sideguard type', b.hasSideguards ? b.sideguardType : ''), opt('Sideguard material', b.hasSideguards ? b.sideguardMaterial : ''),
      opt('Sideguard height (mm)', b.hasSideguards ? b.sideguardHeight : '')];
    const spr = b.hasSprocket ? [opt('Description', b.sprDesc), opt('Part number', b.sprPn), opt('Bore', b.bore), opt('Pitch diameter', b.pd),
      opt('Material', b.sprMat), opt('Build type', b.sprVariant), opt('Number of sprockets', b.sprQty),
      opt('Heavy-duty retainers', b.hasRetainers ? (b.retainerQty ? b.retainerQty + ' off' : 'Yes') : '')] : [];
    const keep = r => r[2] || (r[1] !== '' && r[1] != null);
    return [['Belt', belt.filter(keep)], ['Flights and sideguards', fl.filter(keep)], ['Sprockets', spr.filter(keep)]].filter(g => g[1].length);
  }
  function beltBlock(b, n){
    let rows = '';
    beltGroups(b).forEach(([name, gr]) => {
      rows += '<tr><th colspan="2" style="background:#ACD3E1;color:#222222;text-align:left;padding:6px 10px;font-size:10px;font-weight:bold;letter-spacing:.08em;text-transform:uppercase;border:1px solid #B9BCBF;">' + esc(name) + '</th></tr>';
      gr.forEach(([l, v]) => { rows += '<tr>' + cell(l, true) + cell(v, false) + '</tr>'; });
    });
    return '<div style="border:1px solid #EDEDED;border-left:3px solid #479EBC;border-radius:4px;padding:14px 16px 10px;margin:0 0 16px;background:#FFFFFF;">' +
      '<h3 style="margin:0 0 10px;padding:0 0 8px;border-bottom:2px solid #E3F0F5;font-size:14px;color:#222222;">Belt ' + n + (b.series ? ' &mdash; Series ' + esc(b.series) : '') + '</h3>' +
      '<table style="border-collapse:collapse;width:' + W + 'px;max-width:100%;margin:0 0 6px;border:1px solid #B9BCBF;">' + rows + '</table>' +
      (b.notes ? '<div style="margin:8px 0 0;padding:8px 10px;background:#F7F8F8;border-left:3px solid #479EBC;font-weight:bold;color:#222222;font-size:12px;">' + esc(b.notes) + '</div>' : '') + '</div>';
  }
  function sprocketTable(items){
    const th = '<tr>' + ['#', 'Series', 'Bore', 'Pitch diameter', 'Material', 'Build type', 'Description', 'Part number', 'Qty'].map(h =>
      '<th style="text-align:left;background:#E3F0F5;color:#00708D;padding:7px 10px;border:1px solid #B9BCBF;font-size:10px;font-weight:bold;letter-spacing:.05em;text-transform:uppercase;">' + h + '</th>').join('') + '</tr>';
    const rows = items.map((s, i) => '<tr>' + [i + 1, s.series, s.bore, s.pd, s.material, s.variant, s.description, s.partNumber, s.qty].map(v =>
      '<td style="padding:6px 10px;border:1px solid #D4D6D8;font-size:12px;color:#222222;">' + dash(v) + '</td>').join('') + '</tr>').join('');
    return '<table style="border-collapse:collapse;width:' + W + 'px;max-width:100%;margin:0 0 20px;border:1px solid #B9BCBF;">' + th + rows + '</table>';
  }
  function orderHTML(){
    const q = order.orderType === 'quote';
    const meta = '<table style="border-collapse:collapse;width:auto;max-width:100%;margin:0 0 4px;border:1px solid #B9BCBF;">' + kvRows([
      ['Customer', order.customer], ['Project / Reference', order.project], ['Order / PO number', q ? '' : order.orderNumber],
      ['Date required', order.date], ['Company', order.company], ['Contact', order.contact], ['Email', order.email]]) + '</table>';
    let html = '<div style="font-family:Roboto,Arial,\'Helvetica Neue\',Helvetica,sans-serif;font-size:13px;color:#222222;width:680px;max-width:100%;border:1px solid #A6BDCB;border-radius:12px;overflow:hidden;background:#FFFFFF;">' +
      '<div style="background:#ED1C24;padding:14px 18px;"><img src="data:image/png;base64,' + D.logo + '" alt="Intralox" height="24" style="display:block;height:24px;width:auto;border:0;"></div>' +
      '<div style="padding:18px 20px 4px;"><p style="font-size:10px;font-weight:bold;letter-spacing:.12em;text-transform:uppercase;color:#479EBC;margin:0 0 4px;">Intralox</p>' +
      '<h1 style="font-size:19px;margin:0 0 4px;color:#222222;font-weight:bold;letter-spacing:-.01em;">Belt ' + (q ? 'Quote' : 'Order') + ' Request' + (order.customer ? ' &mdash; ' + esc(order.customer) : '') + '</h1>' +
      '<p style="color:#77787A;font-size:11px;margin:0 0 18px;">' + [order.project, order.date].filter(Boolean).map(esc).join(' &middot; ') + '</p>' + h2('Request') + meta;
    const belts = order.items.filter(i => i.type === 'belt'), sprs = order.items.filter(i => i.type === 'sprocket');
    if(belts.length){ html += h2('Belts'); belts.forEach((b, i) => { if(i) html += '<div style="height:14px;line-height:14px;font-size:1px;">&nbsp;</div>'; html += beltBlock(b, i + 1); }); }
    if(sprs.length) html += h2('Sprockets') + sprocketTable(sprs);
    html += '</div><div style="background:#363738;color:#FFFFFF;font-size:10px;letter-spacing:.03em;padding:9px 16px;margin:20px 0 0;">Belt ' + (q ? 'quote' : 'order') +
      ' request made from the Intralox order form' + (D.manager ? ' prepared by ' + esc(D.manager) : '') + '.</div></div>';
    return html;
  }
  function orderText(){
    const q = order.orderType === 'quote', L = [q ? 'BELT QUOTE REQUEST' : 'BELT ORDER REQUEST', ''];
    [['Customer', order.customer], ['Project / Reference', order.project], ['Order / PO number', q ? '' : order.orderNumber], ['Date required', order.date],
      ['Company', order.company], ['Contact', order.contact], ['Email', order.email]].forEach(([k, v]) => L.push(k + ': ' + (v || '—')));
    L.push('');
    order.items.filter(i => i.type === 'belt').forEach((b, i) => {
      L.push('--- Belt ' + (i + 1) + ' ---', [b.series, b.style, b.material, b.colour].filter(Boolean).join(' / '));
      if(b.width) L.push('Width: ' + b.width + ' mm');
      if(b.length) L.push('Length: ' + b.length + ' m');
      if(b.rod) L.push('Rod material: ' + b.rod);
      if(b.rollerConfig) L.push('Configuration: ' + b.rollerConfig);
      if(b.indent) L.push('Indent: ' + b.indent);
      if(b.hasFlights) L.push('Flights: ' + [b.flightType, b.flightMaterial, b.flightHeightMm && b.flightHeightMm + ' mm'].filter(Boolean).join(' / '));
      if(b.hasSideguards) L.push('Sideguards: ' + [b.sideguardType, b.sideguardMaterial, b.sideguardHeight && b.sideguardHeight + ' mm'].filter(Boolean).join(' / '));
      if(b.hasSprocket) L.push('Sprocket: ' + [b.sprDesc, b.sprPn, b.sprQty && (b.sprQty + ' off'), b.hasRetainers && ('heavy-duty retainers' + (b.retainerQty ? ' x' + b.retainerQty : ''))].filter(Boolean).join(' / '));
      if(b.notes) L.push('Notes: ' + b.notes);
      L.push('');
    });
    order.items.filter(i => i.type === 'sprocket').forEach((s, i) => {
      L.push('--- Sprocket ' + (i + 1) + ' ---', [s.series, s.bore, s.pd, s.material, s.variant].filter(Boolean).join(' / '),
        (s.description || '') + (s.partNumber ? ' (' + s.partNumber + ')' : ''), 'Qty: ' + s.qty);
      if(s.notes) L.push('Notes: ' + s.notes);
      L.push('');
    });
    return L.join('\n');
  }
  $('copyBtn').addEventListener('click', async () => {
    readMeta();
    $('previewWrap').classList.add('show');
    if(!order.items.length){ showMsg($('copyMsg'), 'warn', 'Add at least one item first.'); return; }
    const html = orderHTML(), text = orderText();
    $('previewHolder').innerHTML = html;
    try {
      if(navigator.clipboard && window.ClipboardItem){
        await navigator.clipboard.write([new ClipboardItem({'text/html': new Blob([html], {type: 'text/html'}), 'text/plain': new Blob([text], {type: 'text/plain'})})]);
        showMsg($('copyMsg'), 'ok', 'Copied. Paste it into an email' + (D.managerEmail ? ' to ' + esc(D.managerEmail) : '') + '.');
      } else if(navigator.clipboard){
        await navigator.clipboard.writeText(text);
        showMsg($('copyMsg'), 'warn', 'Copied as plain text. For the tables, tap Select all below, then copy.');
      } else showMsg($('copyMsg'), 'warn', 'This browser cannot copy by itself. Tap Select all below, then copy.');
    } catch(e){ showMsg($('copyMsg'), 'warn', 'It could not copy by itself. Tap Select all below, then copy.'); }
  });
  $('selectAllBtn').addEventListener('click', () => {
    const r = document.createRange(); r.selectNodeContents($('previewHolder'));
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  });
  let clearArmed = 0;
  $('clearBtn').addEventListener('click', () => {
    if((order.items.length || order.project || order.orderNumber) && Date.now() - clearArmed > 4000){
      clearArmed = Date.now(); $('clearBtn').textContent = 'Tap again to clear'; return;
    }
    clearArmed = 0; $('clearBtn').textContent = 'Clear';
    order = Object.assign({}, order, {project: '', orderNumber: '', orderType: 'quote', date: '', items: []});
    nextId = 1;
    $('orderProject').value = ''; $('orderDate').value = ''; $('orderNumber').value = '';
    paintType(); renderItems(); $('previewWrap').classList.remove('show'); showMsg($('addMsg'), '', '');
  });
  try { const kept = JSON.parse(localStorage.getItem(KEY) || 'null'); if(kept) order = Object.assign(order, kept, {customer: D.customer}); } catch(e){}
  nextId = 1 + order.items.reduce((m, i) => Math.max(m, i.id || 0), 0);
  $('orderProject').value = order.project || ''; $('orderDate').value = order.date || ''; $('orderNumber').value = order.orderNumber || '';
  paintType(); renderItems();
}

/* The file itself. d: {formId, customer, contact, email, company, manager,
   managerEmail, logo (PNG as base64), belts, sprockets}, the favourites
   already baked by the app (allowed colours per material, sprocket
   descriptions and part numbers per pitch diameter and material) and with
   no note for sales in them. */
function orderFormHTML(d){
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const data = JSON.stringify(d).replace(/</g, '\\u003c').split(String.fromCharCode(0x2028)).join('\\u2028').split(String.fromCharCode(0x2029)).join('\\u2029');
  return '<!DOCTYPE html><html lang="en-AU"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Order form - ' + esc(d.customer) + '</title><style>' + OF_CSS + '</style></head><body>' +
    '<header><div class="redbox"><img src="data:image/png;base64,' + d.logo + '" alt="Intralox"></div>' +
    '<div class="hdt"><h1>Order form &mdash; ' + esc(d.customer) + '</h1><div class="sub">Pick from the belts and sprockets below, then copy the request into an email.' +
    (d.manager ? ' Prepared by ' + esc(d.manager) + '.' : '') + '</div></div></header><div class="wrap">' +
    '<div class="card"><div class="row" style="justify-content:space-between;align-items:center"><h2 style="margin:0">Your request</h2>' +
    '<button type="button" class="btn act2 small" id="clearBtn">Clear</button></div>' +
    '<div class="field" style="margin-top:12px"><label>An order or a quote?</label><div class="seg" id="orderType" role="group" aria-label="Order or quote">' +
    '<button type="button" data-v="quote">Quote</button><button type="button" data-v="order">Order</button></div></div>' +
    '<div class="row"><div class="field"><label for="orderProject">Project name or your reference</label><input type="text" id="orderProject"></div>' +
    '<div class="field"><label for="orderNumber">PO number</label><input type="text" id="orderNumber" disabled></div>' +
    '<div class="field"><label for="orderDate">Date needed</label><input type="date" id="orderDate"></div></div></div>' +
    '<p style="font-size:13px;color:var(--ink-3);margin:0 2px 12px">Tap one to open it, pick its options, then Add to order. The same one can go in more than once.</p>' +
    '<div id="specCards"></div>' +
    '<div class="card"><h2>In this request</h2><div id="itemList"></div><div class="empty" id="emptyMsg">Nothing added yet.</div><div class="msg" id="addMsg"></div></div>' +
    '<div class="footer-bar"><span class="count" id="itemCount">0 items</span><button type="button" class="btn go" id="copyBtn">Copy order for email</button></div>' +
    '<div id="previewWrap" class="card"><h2>What was copied</h2><div class="msg" id="copyMsg"></div><div id="previewHolder"></div>' +
    '<div style="margin-top:10px"><button type="button" class="btn act2 small" id="selectAllBtn">Select all</button></div></div>' +
    '</div><script>(' + ofFormRuntime.toString() + ')(' + data + ');<\/script></body></html>';
}
