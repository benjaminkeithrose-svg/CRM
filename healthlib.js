/* healthlib.js - conveyor fault library for Field CRM.
   Built in the image of manuals.js: one IIFE, one global, its own database,
   no build step, no framework, no new dependencies.

   Owns IndexedDB `fieldcrmfaults` only. Never touches `fieldcrm` or
   `fieldcrmmanuals`, so adding this file can never trigger a schema upgrade
   of the calls database and can never lose a call.

   Two axes, deliberately separate:
     severity - how bad the condition is       (Urgent | Plan | Monitor)
     priority - what order maintenance works it (Critical | High | Medium | Low)
   They usually agree. Where they don't, plant context decides the priority
   and only the person standing there knows it.

   Two kinds of editing, deliberately separate:
     library edit  - changes the wording permanently, bumps version
     this-use edit - changes the finding in front of you, library untouched

   Element ids are all `fl`-prefixed. Checked against index.html: no collisions.
*/
(function () {
  'use strict';

  /* ---------- constants ---------- */

  var DB_NAME = 'fieldcrmfaults';
  var DB_VER = 1;
  var SEED_URL = 'health-seed.json';
  var LS = 'fcrm.faults.';              // all localStorage keys are prefixed

  var SEVS = ['Urgent', 'Plan', 'Monitor'];
  var PRIS = ['Critical', 'High', 'Medium', 'Low'];

  // What each priority means, from the technical library. Shown on the picker
  // so the tier is chosen on its definition rather than on its name.
  var PRI_MEANS = {
    Critical: 'Stop and isolate. Contain affected product.',
    High: 'Plan immediate corrective maintenance.',
    Medium: 'Correct at the next planned maintenance opportunity.',
    Low: 'Record and monitor. Routine maintenance planning.'
  };

  var STATE_LABEL = {
    stopped_isolated: 'Stopped and isolated',
    running: 'Running, where safe',
    either: 'Either state'
  };

  /* ---------- tiny helpers ----------
     app.js defines $, esc, toast, showMsg, go, shrink, photoSrc globally and
     they exist by the time anything here runs. These are only reached in
     standalone development, where app.js is absent. */

  function $(id) {
    return (window.$ ? window.$(id) : document.getElementById(id));
  }
  function esc(s) {
    if (window.esc) return window.esc(s);
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function toast(m) { if (window.toast) window.toast(m); }
  function msg(el, cls, html) {
    if (window.showMsg) return window.showMsg(el, cls, html);
    if (el) { el.className = 'msg ' + (cls || ''); el.innerHTML = html || ''; }
  }
  function shrink(file, max, q) {
    if (window.shrink) return window.shrink(file, max || 1400, q || 0.72);
    return Promise.resolve(file);
  }
  function photoSrc(b) {
    if (window.photoSrc) return window.photoSrc(b);
    return URL.createObjectURL(b);
  }

  /* ---------- database ----------
     faults : the library, keyed by id
     images : reference photos, keyed by id, { id, faultId, blob, caption, customerSafe }
     meta   : one row, { k:'state', seeded, schema, catalogue }
     Images live in their own store so a library read never drags blobs into
     memory. */

  var _db = null;

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise(function (res, rej) {
      var rq = indexedDB.open(DB_NAME, DB_VER);
      rq.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('faults')) {
          var f = db.createObjectStore('faults', { keyPath: 'id' });
          f.createIndex('category', 'category', { unique: false });
        }
        if (!db.objectStoreNames.contains('images')) {
          var i = db.createObjectStore('images', { keyPath: 'id' });
          i.createIndex('faultId', 'faultId', { unique: false });
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'k' });
        }
      };
      rq.onsuccess = function () { _db = rq.result; res(_db); };
      rq.onerror = function () { rej(rq.error); };
    });
  }

  function tx(store, mode) {
    return open().then(function (db) {
      return db.transaction(store, mode || 'readonly').objectStore(store);
    });
  }
  function req(r) {
    return new Promise(function (res, rej) {
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function all(store, idx, key) {
    return tx(store).then(function (s) {
      return req(idx ? s.index(idx).getAll(key) : s.getAll());
    });
  }
  function put(store, val) {
    return tx(store, 'readwrite').then(function (s) { return req(s.put(val)); });
  }
  function del(store, key) {
    return tx(store, 'readwrite').then(function (s) { return req(s.delete(key)); });
  }
  function get(store, key) {
    return tx(store).then(function (s) { return req(s.get(key)); });
  }

  /* ---------- seeding ----------
     The seed is generic reference data with no customer content, so it ships
     in the repo and is fetched same-origin once. After that it lives in
     IndexedDB and the service worker has it cached, so the app stays offline
     capable. Seeding never overwrites an existing library. */

  var _cats = [];
  var _lib = [];          // in-memory mirror, kept sorted by code
  var _ready = null;

  function loadAll() {
    return Promise.all([all('faults'), get('meta', 'cats')]).then(function (r) {
      _lib = (r[0] || []).sort(function (a, b) {
        return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
      });
      _cats = (r[1] && r[1].v) || [];
      return get('meta', 'riskVocab').then(function (rv) {
        RISKV = {};
        ((rv && rv.v) || []).forEach(function (v) { RISKV[v.id] = v; });
        return _lib;
      });
    });
  }

  function seedIfEmpty() {
    return all('faults').then(function (rows) {
      if (rows && rows.length) return false;
      return fetch(SEED_URL, { cache: 'no-cache' }).then(function (r) {
        if (!r.ok) throw new Error('seed ' + r.status);
        return r.json();
      }).then(function (seed) {
        return open().then(function (db) {
          return new Promise(function (res, rej) {
            var t = db.transaction(['faults', 'meta'], 'readwrite');
            var fs = t.objectStore('faults');
            seed.faults.forEach(function (f) { fs.put(f); });
            t.objectStore('meta').put({ k: 'cats', v: seed.categories });
            t.objectStore('meta').put({ k: 'riskVocab', v: seed.riskVocab || [] });
            t.objectStore('meta').put({
              k: 'state', seeded: Date.now(),
              schema: seed.schema, catalogue: seed.catalogue
            });
            t.oncomplete = function () { res(true); };
            t.onerror = function () { rej(t.error); };
          });
        });
      });
    });
  }

  function ready() {
    if (!_ready) {
      _ready = seedIfEmpty()
        .catch(function (e) {
          // A failed seed must not break the health form. The picker will
          // simply report an empty library and the free-text path still works.
          console.warn('[healthlib] seed failed', e);
          return false;
        })
        .then(loadAll);
    }
    return _ready;
  }

  /* ---------- belt technology ----------
     Catenary sag inverts between the two technologies: a modular belt wants
     sag capped to build back tension, ThermoDrive runs tensionless and wants
     it deep. Same words, opposite advice. So checks are filtered rather than
     all shown.

     Derived from the belt entry's `series` when one is linked, which is the
     common case at a conveyor. Falls back to a toggle only when the app
     genuinely cannot tell. */

  function techFromSeries(series) {
    if (!series) return null;
    var s = String(series).toLowerCase();
    if (s.indexOf('thermodrive') >= 0 || /\btd\b/.test(s) || /^s?7\d{2}/.test(s)) {
      return 'thermodrive';
    }
    if (/s?\d{3,4}/.test(s)) return 'modular_plastic_belt';
    return null;
  }

  function fitsTech(f, tech) {
    if (!tech) return true;
    return f.tech === 'all' || f.tech === tech;
  }

  /* ---------- picker state ---------- */

  var P = {
    open: false,
    cat: null,          // selected category id
    fault: null,        // selected library record
    conds: [],          // ticked conditions
    tech: null,         // resolved belt technology
    techLocked: false,  // true when derived from a linked belt entry
    ctx: null,          // { asset, series, beltRef }
    cb: null,
    edit: false         // library edit mode vs this-use
  };

  function reset() {
    P.cat = null; P.fault = null; P.conds = []; P.edit = false;
  }

  /* ---------- picker UI ---------- */

  function openPicker(ctx, cb) {
    P.ctx = ctx || {};
    P.cb = cb;
    P.open = true;
    reset();
    var t = techFromSeries(P.ctx.series);
    P.tech = t;
    P.techLocked = !!t;
    var ov = $('flOverlay');
    if (ov) ov.hidden = false;
    document.body.style.overflow = 'hidden';
    ready().then(drawPicker);
  }

  function closePicker() {
    P.open = false;
    var ov = $('flOverlay');
    if (ov) ov.hidden = true;
    document.body.style.overflow = '';
  }

  function drawPicker() {
    var host = $('flBody');
    if (!host) return;
    if (!_lib.length) {
      host.innerHTML = '<p class="empty">No fault library loaded. ' +
        'You can still type the fault by hand.</p>';
      setTitle('Fault library');
      return;
    }
    if (P.fault) return drawDetail();
    if (P.cat) return drawChecks();
    drawCats();
  }

  function setTitle(t, sub) {
    var el = $('flTitle');
    if (el) el.innerHTML = esc(t) + (sub ? ' <span class="hint">' + esc(sub) + '</span>' : '');
    var back = $('flBack');
    if (back) back.hidden = !(P.cat || P.fault);
  }

  function techBar() {
    if (P.techLocked) {
      return '<p class="hint fl-tech">Filtered to ' +
        (P.tech === 'thermodrive' ? 'ThermoDrive' : 'modular belt') +
        ' from the linked belt entry.</p>';
    }
    return '<div class="fld fl-tech"><label>Belt technology</label>' +
      '<div class="seg" id="flTech">' +
      seg('flTechAny', '', 'All') +
      seg('flTechMod', 'modular_plastic_belt', 'Modular') +
      seg('flTechTd', 'thermodrive', 'ThermoDrive') +
      '</div></div>';
  }
  function seg(id, val, label) {
    var on = (P.tech || '') === val;
    return '<button type="button" id="' + id + '" data-tech="' + val + '"' +
      (on ? ' class="on" aria-pressed="true"' : ' aria-pressed="false"') +
      '>' + esc(label) + '</button>';
  }

  function drawCats() {
    setTitle('Fault library', _lib.length + ' checks');
    var counts = {};
    _lib.forEach(function (f) {
      if (!fitsTech(f, P.tech)) return;
      counts[f.category] = (counts[f.category] || 0) + 1;
    });
    var h = techBar();
    h += '<div class="fld"><label for="flQ">Search</label>' +
      '<input id="flQ" type="search" placeholder="fault, symptom or code" ' +
      'autocomplete="off" inputmode="search"></div>';
    h += '<div id="flResults"></div>';
    h += '<div class="fl-cats" id="flCats">';
    _cats.forEach(function (c) {
      var n = counts[c.id] || 0;
      if (!n) return;
      h += '<button type="button" class="card fl-cat" data-cat="' + c.id + '">' +
        '<span class="fl-cat-n">' + c.n + '</span>' +
        '<span class="fl-cat-name">' + esc(c.name) + '</span>' +
        '<span class="hint">' + n + '</span></button>';
    });
    h += '</div>';
    $('flBody').innerHTML = h;
  }

  function drawChecks() {
    var cat = _cats.filter(function (c) { return c.id === P.cat; })[0];
    var rows = _lib.filter(function (f) {
      return f.category === P.cat && fitsTech(f, P.tech);
    });
    setTitle(cat ? cat.name : 'Checks', rows.length + ' checks');
    $('flBody').innerHTML = rows.map(checkRow).join('') ||
      '<p class="empty">Nothing in this category for the selected belt technology.</p>';
  }

  function checkRow(f) {
    return '<button type="button" class="card fl-check" data-fault="' + esc(f.id) + '">' +
      '<span class="fl-code">' + esc(f.code) + '</span>' +
      '<span class="fl-name">' + esc(f.name) + '</span>' +
      '<span class="fl-tags">' +
      pill(f.priority, 'fl-p-' + f.priority.toLowerCase()) +
      (f.state && f.state !== 'either'
        ? '<span class="fl-pill fl-state">' + esc(STATE_LABEL[f.state]) + '</span>' : '') +
      '</span></button>';
  }
  function pill(text, cls) {
    return '<span class="fl-pill ' + (cls || '') + '">' + esc(text) + '</span>';
  }

  function drawDetail() {
    var f = P.fault;
    setTitle(f.code + ' ' + f.name);
    var h = '';

    h += '<div class="fl-meta">' +
      pill(f.priority, 'fl-p-' + f.priority.toLowerCase()) +
      pill(f.severity, 'fl-s') +
      (f.state ? '<span class="fl-pill fl-state">' + esc(STATE_LABEL[f.state]) + '</span>' : '') +
      '</div>';
    h += '<p class="hint">' + esc(PRI_MEANS[f.priority] || '') + '</p>';

    h += '<div class="fld"><label>What you are seeing</label>' +
      '<div class="chips" id="flConds">' +
      (f.conditions || []).map(function (c, i) {
        var on = P.conds.indexOf(c) >= 0;
        return '<button type="button" class="chip' + (on ? ' on' : '') +
          '" data-cond="' + i + '">' + esc(c) + '</button>';
      }).join('') + '</div>' +
      '<p class="hint">Tick what applies. These become the observation wording.</p></div>';

    if (f.thresholds && f.thresholds.length) {
      h += '<div class="card fl-thresh"><strong>Specification</strong><ul>' +
        f.thresholds.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') +
        '</ul>' + (f.source ? '<p class="hint">' + esc(f.source) + '</p>' : '') + '</div>';
    }

    h += '<div class="fld"><label for="flWhat">Description</label>' +
      '<textarea id="flWhat" rows="3">' + esc(f.what || '') + '</textarea></div>';
    h += '<div class="fld"><label for="flLeads">Leads to</label>' +
      '<textarea id="flLeads" rows="2">' + esc(f.leads || '') + '</textarea></div>';
    h += '<div class="fld"><label for="flAction">Recommended action</label>' +
      '<textarea id="flAction" rows="2">' + esc(f.action || '') + '</textarea></div>';

    h += '<div class="fld"><label>Severity <span class="hint">condition found</span></label>' +
      '<div class="seg" id="flSev">' + SEVS.map(function (s) {
        return '<button type="button" data-sev="' + s + '"' +
          (s === f.severity ? ' class="on" aria-pressed="true"' : ' aria-pressed="false"') +
          '>' + s + '</button>';
      }).join('') + '</div></div>';

    h += '<div class="fld"><label>Priority <span class="hint">maintenance work order</span></label>' +
      '<div class="seg fl-pri" id="flPri">' + PRIS.map(function (p) {
        return '<button type="button" data-pri="' + p + '"' +
          (p === f.priority ? ' class="on" aria-pressed="true"' : ' aria-pressed="false"') +
          '>' + p + '</button>';
      }).join('') + '</div>' +
      '<p class="hint" id="flPriHint">' + esc(PRI_MEANS[f.priority] || '') + '</p></div>';

    h += '<div class="fld fl-two">' +
      '<div><label for="flOwner">Owner</label><input id="flOwner" type="text" ' +
      'autocomplete="off" placeholder="optional"></div>' +
      '<div><label for="flDue">Target date</label><input id="flDue" type="date"></div>' +
      '</div>';

    if (f.causes && f.causes.length) {
      var known = f.causes.map(byId).filter(Boolean);
      if (known.length) {
        h += '<div class="card fl-causes"><strong>Commonly caused by</strong>' +
          '<p class="hint">Replacing the part without fixing the cause gives you the ' +
          'same finding next visit. Tap one to log it as well.</p>' +
          '<div class="chips">' + known.map(function (c) {
            return '<button type="button" class="chip" data-cause="' + esc(c.id) + '">' +
              esc(c.code) + ' ' + esc(c.name) + '</button>';
          }).join('') + '</div></div>';
      }
    }

    h += '<div class="fl-actions">' +
      '<button type="button" class="big" id="flUse">Use this fault</button>' +
      '<button type="button" class="ghost" id="flSaveLib">Save wording to library</button>' +
      '</div>' +
      '<p class="hint">Edits above apply to this finding only. ' +
      '"Save wording to library" changes it for every future report.</p>' +
      '<div class="msg" id="flMsg"></div>';

    $('flBody').innerHTML = h;
  }

  function byId(id) {
    var k = String(id).toLowerCase();
    return _lib.filter(function (f) { return f.id === k; })[0] || null;
  }

  /* ---------- search ---------- */

  function search(q) {
    q = String(q || '').trim().toLowerCase();
    if (q.length < 2) return [];
    var terms = q.split(/\s+/);
    return _lib.filter(function (f) {
      if (!fitsTech(f, P.tech)) return false;
      var hay = (f.code + ' ' + f.name + ' ' + f.categoryName + ' ' +
        (f.conditions || []).join(' ') + ' ' + (f.what || '')).toLowerCase();
      return terms.every(function (t) { return hay.indexOf(t) >= 0; });
    }).slice(0, 25);
  }

  function drawResults(q) {
    var box = $('flResults'), cats = $('flCats');
    if (!box) return;
    var rows = search(q);
    if (!q || q.length < 2) {
      box.innerHTML = '';
      if (cats) cats.hidden = false;
      return;
    }
    if (cats) cats.hidden = true;
    box.innerHTML = rows.length
      ? rows.map(checkRow).join('')
      : '<p class="empty">No match. Categories are below, or type the fault by hand.</p>';
    if (!rows.length && cats) cats.hidden = false;
  }

  /* ---------- producing the entry ----------
     The shape app.js already reads is preserved exactly: asset, fault, htype,
     severity, action, photos. Everything else is additive and is carried
     through untouched by the compile step. */

  function currentEntry() {
    var f = P.fault;
    var sev = onValue('flSev', 'sev') || f.severity;
    var pri = onValue('flPri', 'pri') || f.priority;
    var what = val('flWhat');
    var conds = P.conds.slice();
    var fault = conds.length ? conds.join('; ') : f.name;

    var e = {
      // existing shape - do not rename or remove
      asset: (P.ctx && P.ctx.asset) || '',
      fault: fault,
      htype: f.name,
      severity: sev,
      action: val('flAction') || f.action || '',

      // added by this module
      faultId: f.id,
      faultCode: f.code,
      libVersion: f.version || 1,
      category: f.category,
      conditions: conds,
      what: what,
      leads: val('flLeads'),
      priority: pri,
      risks: (f.risks || []).slice(),
      benefit: f.benefit || '',
      thresholds: (f.thresholds || []).slice(),
      source: f.source || '',
      owner: val('flOwner'),
      due: val('flDue'),
      refImages: (f.images || []).map(function (i) { return i.id; })
    };
    if (P.ctx && P.ctx.beltRef != null) e.beltRef = P.ctx.beltRef;
    if (P.ctx && P.ctx.series) e.beltSeries = P.ctx.series;
    return e;
  }

  function val(id) { var el = $(id); return el ? el.value.trim() : ''; }
  function onValue(wrapId, attr) {
    var w = $(wrapId);
    if (!w) return '';
    var b = w.querySelector('button.on');
    return b ? b.getAttribute('data-' + attr) : '';
  }

  function saveToLibrary() {
    var f = P.fault;
    f.what = val('flWhat');
    f.leads = val('flLeads');
    f.action = val('flAction');
    f.severity = onValue('flSev', 'sev') || f.severity;
    f.priority = onValue('flPri', 'pri') || f.priority;
    f.version = (f.version || 1) + 1;
    f.updated = Date.now();
    return put('faults', f).then(function () {
      msg($('flMsg'), 'ok', 'Library updated. Version ' + f.version + '.');
      toast('Saved to library');
    });
  }

  /* ---------- events ----------
     One delegated listener on the overlay. Nothing is bound per render, so
     redrawing never leaks handlers. */

  function wire() {
    var ov = $('flOverlay');
    if (!ov || ov.dataset.flWired) return;
    ov.dataset.flWired = '1';

    ov.addEventListener('click', function (ev) {
      var t = ev.target.closest('button');
      if (!t) return;

      if (t.id === 'flClose') return closePicker();
      if (t.id === 'flBack') {
        if (P.fault) { P.fault = null; P.conds = []; }
        else if (P.cat) P.cat = null;
        return drawPicker();
      }
      if (t.hasAttribute('data-tech')) {
        P.tech = t.getAttribute('data-tech') || null;
        return drawPicker();
      }
      if (t.hasAttribute('data-cat')) {
        P.cat = t.getAttribute('data-cat');
        return drawPicker();
      }
      if (t.hasAttribute('data-fault')) {
        P.fault = byId(t.getAttribute('data-fault'));
        P.conds = [];
        return drawPicker();
      }
      if (t.hasAttribute('data-cond')) {
        var i = +t.getAttribute('data-cond');
        var c = P.fault.conditions[i];
        var at = P.conds.indexOf(c);
        if (at >= 0) P.conds.splice(at, 1); else P.conds.push(c);
        t.classList.toggle('on');
        return;
      }
      if (t.hasAttribute('data-sev')) return pick(t, 'flSev');
      if (t.hasAttribute('data-pri')) {
        pick(t, 'flPri');
        var h = $('flPriHint');
        if (h) h.textContent = PRI_MEANS[t.getAttribute('data-pri')] || '';
        return;
      }
      if (t.hasAttribute('data-cause')) {
        // Log the cause as a second finding, carrying the same asset.
        var cause = byId(t.getAttribute('data-cause'));
        if (!cause) return;
        if (P.cb) P.cb(currentEntry());
        P.fault = cause; P.conds = [];
        toast('Now logging the cause');
        return drawPicker();
      }
      if (t.id === 'flUse') {
        var entry = currentEntry();
        closePicker();
        if (P.cb) P.cb(entry);
        return;
      }
      if (t.id === 'flSaveLib') return saveToLibrary();
    });

    ov.addEventListener('input', function (ev) {
      if (ev.target.id === 'flQ') drawResults(ev.target.value);
    });
  }

  function pick(btn, wrapId) {
    var w = $(wrapId);
    if (!w) return;
    Array.prototype.forEach.call(w.querySelectorAll('button'), function (b) {
      b.classList.remove('on');
      b.setAttribute('aria-pressed', 'false');
    });
    btn.classList.add('on');
    btn.setAttribute('aria-pressed', 'true');
  }

  /* ---------- library management screen ---------- */

  function render() {
    wire();
    var host = $('flList');
    if (!host) return;
    ready().then(function () {
      var st = $('flStat');
      if (st) st.innerHTML = statusHTML();
      host.innerHTML = _cats.map(function (c) {
        var rows = _lib.filter(function (f) { return f.category === c.id; });
        if (!rows.length) return '';
        return '<h3 class="fl-h">' + esc(c.name) +
          ' <span class="hint">' + rows.length + '</span></h3>' +
          rows.map(function (f) {
            return '<div class="card fl-row"><span class="fl-code">' + esc(f.code) +
              '</span> ' + esc(f.name) +
              (f.version > 1 ? ' <span class="hint">edited v' + f.version + '</span>' : '') +
              '</div>';
          }).join('');
      }).join('');
    });
  }

  function statusHTML() {
    if (!_lib.length) return '<span class="hint">Library not loaded</span>';
    var edited = _lib.filter(function (f) { return (f.version || 1) > 1; }).length;
    return _lib.length + ' checks' +
      (edited ? ' &middot; ' + edited + ' edited' : '');
  }

  /* ---------- export / import ----------
     Text-only by default. Reference images are large and are exchanged as a
     separate pack rather than inflating a JSON by a third with base64. */

  function exportLibrary(withImages) {
    return ready().then(function () {
      var payload = {
        schema: 1, exported: Date.now(),
        categories: _cats, riskVocab: Object.keys(RISKV).map(function (k) { return RISKV[k]; }), faults: _lib.map(function (f) {
          var c = JSON.parse(JSON.stringify(f));
          if (!withImages) c.images = [];
          return c;
        })
      };
      var blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'fault-library.json';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      toast('Library exported');
    });
  }

  function importLibrary(file) {
    return file.text().then(function (txt) {
      var data = JSON.parse(txt);
      if (!data || !Array.isArray(data.faults)) throw new Error('Not a fault library file');
      return open().then(function (db) {
        return new Promise(function (res, rej) {
          var t = db.transaction(['faults', 'meta'], 'readwrite');
          var fs = t.objectStore('faults');
          data.faults.forEach(function (f) { fs.put(f); });
          if (data.categories) t.objectStore('meta').put({ k: 'cats', v: data.categories });
          if (data.riskVocab) t.objectStore('meta').put({ k: 'riskVocab', v: data.riskVocab });
          t.oncomplete = res; t.onerror = function () { rej(t.error); };
        });
      });
    }).then(loadAll).then(function () {
      toast('Library imported');
      render();
      return _lib.length;
    });
  }

  /* ---------- reference images ---------- */

  function addImage(faultId, file, caption, customerSafe) {
    return shrink(file, 1400, 0.72).then(function (blob) {
      var rec = {
        id: faultId + '-' + Date.now().toString(36),
        faultId: faultId, blob: blob,
        caption: caption || '', customerSafe: customerSafe !== false
      };
      return put('images', rec).then(function () {
        var f = byId(faultId);
        if (f) {
          f.images = (f.images || []).concat([{
            id: rec.id, caption: rec.caption, customerSafe: rec.customerSafe
          }]);
          return put('faults', f).then(function () { return rec; });
        }
        return rec;
      });
    });
  }

  function imagesFor(faultId) { return all('images', 'faultId', faultId); }

  /* ---------- entry point from the belt form ----------
     Called by app.js after a belt entry is saved:
       if (window.HealthLib) HealthLib.openFor(entry, idx, cb)
     The asset and series come straight off the belt entry, so the picker
     arrives pre-filtered with nothing to re-type. */

  function openFor(beltEntry, idx, cb) {
    openPicker({
      asset: (beltEntry && beltEntry.asset) || '',
      series: (beltEntry && beltEntry.series) || '',
      beltRef: (idx == null ? null : idx)
    }, cb);
  }

  /* ---------- customer card ----------
     One block per finding in the four-row shape the site visit reports have
     always used: Observations, Risks, Recommendations, Replacement Belt
     Specification - plus the risk of doing nothing and the gain from acting,
     which is the pair that makes a plant manager move.

     Called from buildNotesHTML() through a single guarded hook. Rendering
     lives here rather than in app.js so the layout can change without
     touching the app. */

  var RISKV = {};   // id -> { risk, benefit }, loaded from the seed

  function riskLines(entry) {
    var ids = entry.risks || (byId(entry.faultId) || {}).risks || [];
    return ids.map(function (i) { return RISKV[i] && RISKV[i].risk; }).filter(Boolean);
  }

  function beltSpecRows(belt) {
    if (!belt) return null;
    var rows = [
      ['Belt', [belt.series, belt.style, belt.beltmat, belt.colour].filter(Boolean).join(' ')],
      ['Width', belt.width ? belt.width + ' mm' : ''],
      ['Length', belt.beltlen ? belt.beltlen + ' m' : ''],
      ['Rods', belt.rodmat || ''],
      ['Flights', belt.flights || ''],
      ['Sprockets', belt.sprocket || '']
    ].filter(function (r) { return r[1]; });
    return rows.length ? rows : null;
  }

  function cardHTML(entry, belt) {
    if (!entry) return '';
    var lib = byId(entry.faultId) || {};
    var obs = (entry.conditions && entry.conditions.length)
      ? entry.conditions : (entry.fault ? [entry.fault] : []);
    var risks = riskLines(entry);
    var benefit = entry.benefit || lib.benefit || '';
    var thresholds = entry.thresholds || lib.thresholds || [];
    var spec = beltSpecRows(belt);
    var pri = entry.priority || '';

    var h = '<section class="hc-card">';

    h += '<header class="hc-top">' +
      '<div class="hc-asset">' + esc(entry.asset || 'Unspecified asset') + '</div>' +
      '<div class="hc-tags">' +
      (pri ? '<span class="fl-pill fl-p-' + pri.toLowerCase() + '">' + esc(pri) + '</span>' : '') +
      (entry.severity ? '<span class="fl-pill fl-s">' + esc(entry.severity) + '</span>' : '') +
      '</div></header>';

    h += '<h3 class="hc-fault">' + esc(entry.htype || entry.fault || '') +
      (entry.faultCode ? ' <span class="hc-code">' + esc(entry.faultCode) + '</span>' : '') +
      '</h3>';

    h += row('Observations', '<ul>' + obs.map(function (o) {
      return '<li>' + esc(o) + '</li>';
    }).join('') + '</ul>');

    if (risks.length) {
      h += row('Risk of no action', '<ul class="hc-risk">' + risks.map(function (r) {
        return '<li>' + esc(r) + '</li>';
      }).join('') + '</ul>');
    }

    var rec = '<p>' + esc(entry.action || lib.action || '') + '</p>';
    if (thresholds.length) {
      rec += '<ul class="hc-spec">' + thresholds.map(function (t) {
        return '<li>' + esc(t) + '</li>';
      }).join('') + '</ul>';
      if (entry.source || lib.source) {
        rec += '<p class="hc-src">' + esc(entry.source || lib.source) + '</p>';
      }
    }
    h += row('Recommendation', rec);

    if (benefit) h += row('Once corrected', '<p class="hc-gain">' + esc(benefit) + '</p>');

    if (spec) {
      h += row('Replacement belt specification', '<table class="hc-tbl">' +
        spec.map(function (r) {
          return '<tr><th>' + esc(r[0]) + '</th><td>' + esc(r[1]) + '</td></tr>';
        }).join('') + '</table>');
    }

    if (entry.owner || entry.due) {
      h += row('Action', '<p>' +
        (entry.owner ? esc(entry.owner) : 'Owner not assigned') +
        (entry.due ? ' &middot; by ' + esc(entry.due) : '') + '</p>');
    }

    h += '</section>';
    return h;
  }

  function row(label, body) {
    return '<div class="hc-row"><div class="hc-lbl">' + esc(label) + '</div>' +
      '<div class="hc-val">' + body + '</div></div>';
  }

  /* ---------- public surface ---------- */

  window.HealthLib = {
    ready: ready,
    render: render,
    statusHTML: statusHTML,
    openPicker: openPicker,
    openFor: openFor,
    closePicker: closePicker,
    search: search,
    get: byId,
    list: function () { return _lib.slice(); },
    categories: function () { return _cats.slice(); },
    exportLibrary: exportLibrary,
    importLibrary: importLibrary,
    addImage: addImage,
    imagesFor: imagesFor,
    techFromSeries: techFromSeries,
    cardHTML: cardHTML,
    riskVocab: function () { return Object.keys(RISKV).map(function (k) { return RISKV[k]; }); },
    PRIS: PRIS,
    PRI_MEANS: PRI_MEANS
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
