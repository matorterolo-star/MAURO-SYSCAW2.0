(function (root) {
  'use strict';

  var GEST = 283, SECADO = 60, DX_MIN = 35;
  var pad = function (n) { return String(n).padStart(2, '0'); };

  /* ---------- fechas ---------- */
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function dateToISO(d) { return ymd(new Date(d.getTime() + 6 * 3600 * 1000)); }
  function parseDMY(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return isNaN(v) ? null : dateToISO(v);
    var m = String(v).trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
    if (!m) return null;
    var y = +m[3]; if (y < 100) y += 2000;
    return y + '-' + pad(+m[2]) + '-' + pad(+m[1]);
  }
  function P(s) { var a = s.split('-').map(Number); return new Date(a[0], a[1] - 1, a[2], 12); }
  function diffDays(a, b) { return Math.round((P(a) - P(b)) / 864e5); }
  function addDays(s, n) { var d = P(s); d.setDate(d.getDate() + n); return ymd(d); }
  function fmt(s) { return s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : ''; }
  function rel(n) {
    if (n === 0) return 'hoy';
    if (n === 1) return 'mañana';
    if (n === -1) return 'ayer';
    return n > 0 ? 'en ' + n + ' días' : 'hace ' + (-n) + ' días';
  }

  /* ---------- lectura del Excel ---------- */
  function txt(v) { if (v == null) return null; var s = String(v).trim(); return s === '' ? null : s; }
  function num(v) {
    if (v == null || v === '') return null;
    var n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    return isFinite(n) ? n : null;
  }
  function numOrTxt(v) { var n = num(v); return n != null ? n : txt(v); }

  function parseLibreta(XLSX, buf) {
    var wb = XLSX.read(buf, { type: 'array', cellDates: true });
    for (var si = 0; si < wb.SheetNames.length; si++) {
      var ws = wb.Sheets[wb.SheetNames[si]];
      var rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
      var h = -1;
      for (var r = 0; r < Math.min(rows.length, 40); r++) {
        var cells = rows[r].map(function (c) { return c == null ? '' : String(c).trim(); });
        if (cells.indexOf('RP') >= 0 && cells.some(function (c) { return /^nomb/i.test(c); })) { h = r; break; }
      }
      if (h < 0) continue;
      var head = rows[h].map(function (c) { return c == null ? '' : String(c).trim(); });
      var idx = function (name, nth) {
        var c = 0; nth = nth || 0;
        for (var i = 0; i < head.length; i++) { if (head[i] === name) { if (c === nth) return i; c++; } }
        return -1;
      };
      var idxRe = function (re) { for (var i = 0; i < head.length; i++) { if (re.test(head[i])) return i; } return -1; };
      var col = {
        nombre: idxRe(/^nomb/i), edad: idx('Edad'), pFecha: idx('Fecha', 0), pN: idxRe(/^N[°º]$/),
        r1: idx('R1'), r2: idx('R2'), sFecha: idx('Fecha', 1), sN: idx('N Serv'), toro: idxRe(/^toro/i),
        eg: idx('E.G'), ipp: idx('Ipp'), tFecha: idx('Fecha', 2), result: idx('Result'), rech: idx('Rech'),
        rp: idx('RP'), idElec: idx('Id Elect'), rod: idx('Rod'), dLac: idx('D Lac'),
        prodLts: idx('Prod Lts'), mej: idxRe(/^mej/i)
      };
      var prCols = [];
      for (var k = 1; k <= 10; k++) { var pc = idx('Pr' + k); if (pc >= 0) prCols.push(pc); }
      var get = function (row, i) { return i >= 0 ? row[i] : null; };
      var animales = [];
      for (var j = h + 1; j < rows.length; j++) {
        var row = rows[j];
        var rpRaw = get(row, col.rp);
        if (rpRaw == null || String(rpRaw).trim() === '') continue;
        var rp = typeof rpRaw === 'number' ? String(Math.round(rpRaw)) : String(rpRaw).trim();
        var tfRaw = get(row, col.tFecha), resRaw = get(row, col.result);
        var tFecha = null, partoProb = null, result = txt(resRaw);
        if (typeof tfRaw === 'string' && /^pare/i.test(tfRaw.trim())) { partoProb = parseDMY(resRaw); result = null; }
        else tFecha = parseDMY(tfRaw);
        var estado = 'sin';
        if (partoProb) estado = 'prenada';
        else if (result && /^pre/i.test(result)) estado = 'prenada';
        else if (result && /^vac/i.test(result)) estado = 'vacia';
        else if (result && /^cic/i.test(result)) estado = 'ciclando';
        else if (result && /^apta/i.test(result)) estado = 'apta';
        else if (result) estado = 'otro';
        var pr = prCols.map(function (c) { return numOrTxt(row[c]); });
        while (pr.length && pr[pr.length - 1] == null) pr.pop();
        var idE = get(row, col.idElec);
        animales.push({
          rp: rp,
          nombre: txt(get(row, col.nombre)),
          edad: num(get(row, col.edad)),
          rod: txt(get(row, col.rod)),
          idElec: idE == null ? null : ((typeof idE === 'number' ? String(Math.round(idE)) : String(idE).trim()).replace(/^0+/, '') || null),
          pFecha: parseDMY(get(row, col.pFecha)),
          pN: num(get(row, col.pN)),
          r1: txt(get(row, col.r1)),
          r2: txt(get(row, col.r2)),
          sFecha: parseDMY(get(row, col.sFecha)),
          sN: num(get(row, col.sN)),
          toro: txt(get(row, col.toro)),
          eg: numOrTxt(get(row, col.eg)),
          ipp: numOrTxt(get(row, col.ipp)),
          tFecha: tFecha,
          result: result,
          partoProb: partoProb,
          estado: estado,
          rech: txt(get(row, col.rech)),
          pr: pr,
          dLac: num(get(row, col.dLac)),
          prodLts: num(get(row, col.prodLts)),
          mej: num(get(row, col.mej))
        });
      }
      animales.forEach(function (a) {
        if (a.estado !== 'prenada' && a.sFecha && a.pFecha && !/^celo/i.test(a.toro || '') && a.sFecha > a.pFecha && (!a.tFecha || a.sFecha > a.tFecha)) a.estado = 'servida';
      });
      animales.forEach(function (a) { a.celo = a.estado === 'prenada' && /^celo/i.test(a.toro || ''); });
      if (!animales.length) continue;
      return { animales: animales, hoja: wb.SheetNames[si] };
    }
    throw new Error('No encontré la tabla de la libreta. Debe tener las columnas "Nomb./Orig." y "RP".');
  }

  /* ---------- cálculos ---------- */
  function esServicio(a) { return !!a.sFecha && !/^celo/i.test(a.toro || ''); }
  function derive(a, today) {
    var o = {
      partoProb: a.partoProb, partoEstimado: false, secado: null,
      diasParto: a.pFecha ? diffDays(today, a.pFecha) : null,
      diasServ: a.sFecha ? diffDays(today, a.sFecha) : null,
      pendienteTacto: false, servDespuesTacto: false
    };
    if (a.estado === 'prenada') {
      if (!o.partoProb && esServicio(a)) { o.partoProb = addDays(a.sFecha, GEST); o.partoEstimado = true; }
      if (o.partoProb) o.secado = addDays(o.partoProb, -SECADO);
    } else if (esServicio(a)) {
      o.servDespuesTacto = !!(a.tFecha && a.sFecha > a.tFecha);
      if ((!a.tFecha || a.tFecha < a.sFecha) && o.diasServ >= DX_MIN) o.pendienteTacto = true;
    }
    return o;
  }

  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim(); }
  function search(animales, q) {
    q = norm(q);
    if (!q) return [];
    var tokens = q.split(/\s+/), out = [];
    animales.forEach(function (a) {
      var n = a._n || (a._n = norm(a.nombre)), score = 0;
      if (a.rp === q) score = 100;
      else if (a.rp.indexOf(q) === 0) score = 80;
      else if (q.length >= 5 && a.idElec && a.idElec.slice(-q.length) === q) score = 70;
      else if (n.indexOf(q) >= 0) score = 60;
      else if (tokens.every(function (t) { return n.indexOf(t) >= 0 || a.rp.indexOf(t) === 0; })) score = 50;
      else if (q.length >= 3 && a.rp.indexOf(q) >= 0) score = 40;
      if (score) out.push([score, a]);
    });
    out.sort(function (x, y) {
      return (y[0] - x[0]) || (x[1].rp.length - y[1].rp.length) || x[1].rp.localeCompare(y[1].rp, 'es', { numeric: true });
    });
    return out.map(function (x) { return x[1]; });
  }
  function conteo(animales) {
    var c = { prenada: 0, servida: 0, vacia: 0, ciclando: 0, apta: 0, sin: 0, otro: 0 };
    animales.forEach(function (a) { c[a.estado] = (c[a.estado] || 0) + 1; });
    return c;
  }

  /* ---------- listas y resumen ---------- */
  function tareas(animales, hoy, ventana) {
    var tactar = [], secar = [], partos = [];
    animales.forEach(function (a) {
      var d = derive(a, hoy);
      if (d.pendienteTacto) tactar.push({ a: a, dias: d.diasServ, fecha: a.sFecha });
      if (a.estado === 'prenada' && d.partoProb) {
        var ds = diffDays(d.secado, hoy), dp = diffDays(d.partoProb, hoy);
        if (dp >= 0) {
          if (ds <= ventana && a.cat !== 'vaquillona') secar.push({ a: a, dias: ds, fecha: d.secado });
          if (dp <= ventana) partos.push({ a: a, dias: dp, fecha: d.partoProb });
        }
      }
    });
    tactar.sort(function (x, y) { return y.dias - x.dias; });
    secar.sort(function (x, y) { return x.dias - y.dias; });
    partos.sort(function (x, y) { return x.dias - y.dias; });
    return { tactar: tactar, secar: secar, partos: partos };
  }
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function resumen(animales, hoy) {
    var r = { total: animales.length, conteo: conteo(animales), descarte: 0, meses: [], antes: 0, despues: 0, leche: null, nLeche: 0, dLac: null, rodeos: [] };
    var y = +hoy.slice(0, 4), m = +hoy.slice(5, 7) - 1, idx = {};
    for (var i = 0; i < 12; i++) {
      var yy = y + Math.floor((m + i) / 12), mm = (m + i) % 12;
      var key = yy + '-' + pad(mm + 1);
      idx[key] = r.meses.length;
      r.meses.push({ key: key, label: MESES[mm], n: 0, anio: yy });
    }
    var sumL = 0, sumD = 0, nD = 0, rod = {};
    animales.forEach(function (a) {
      if (a.rech) r.descarte++;
      var d = derive(a, hoy);
      if (a.estado === 'prenada' && d.partoProb) {
        if (diffDays(d.partoProb, hoy) < 0) r.antes++;
        else { var k = d.partoProb.slice(0, 7); if (idx[k] != null) r.meses[idx[k]].n++; else r.despues++; }
      }
      if (typeof a.pr[0] === 'number') { sumL += a.pr[0]; r.nLeche++; if (a.dLac != null) { sumD += a.dLac; nD++; } }
      var rk = a.rod || 'Sin rodeo';
      rod[rk] = rod[rk] || { rod: rk, n: 0, pren: 0 };
      rod[rk].n++; if (a.estado === 'prenada') rod[rk].pren++;
    });
    if (r.nLeche) r.leche = sumL / r.nLeche;
    if (nD) r.dLac = sumD / nD;
    r.rodeos = Object.keys(rod).map(function (k) { return rod[k]; }).sort(function (a, b) { return b.n - a.n; });
    return r;
  }

  var api = { parseLibreta: parseLibreta, derive: derive, search: search, conteo: conteo, tareas: tareas, resumen: resumen, fmt: fmt, rel: rel, diffDays: diffDays, addDays: addDays, ymd: ymd, GEST: GEST, SECADO: SECADO, DX_MIN: DX_MIN };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document !== 'undefined') initUI(api);

  /* ================= interfaz ================= */
  function initUI(A) {
    var KEY = 'libreta:v1', KEYP = 'libreta:perfil';
    var DB = { animales: [], cargada: null, archivo: '' };
    var PERFIL = { nombre: '', logo: '' };
    var state = { tab: 'buscar', q: '', filtro: 'todas', n: 60, rp: null, ventana: 183, abiertas: {}, error: '', persisted: true, draft: null, cat: 'vaca' };
    var $ = function (s) { return document.querySelector(s); };
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var today = function () { return A.ymd(new Date()); };
    var nf = function (n, d) { return n == null ? '' : Number(n).toLocaleString('es-UY', { maximumFractionDigits: d || 0 }); };
    var pct = function (n, t) { return t ? nf(n / t * 100, 1) + '%' : ''; };

    var LABEL = { prenada: 'Preñada', servida: 'Servida', vacia: 'Vacía', ciclando: 'Ciclando', apta: 'Apta', sin: 'Sin tacto', otro: 'Otros' };
    var ORDEN = ['prenada', 'servida', 'vacia', 'ciclando', 'apta', 'sin', 'otro'];

    /* ----- almacenamiento ----- */
    function idb() {
      return new Promise(function (res, rej) {
        try {
          var r = indexedDB.open('libreta', 1);
          r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
          r.onsuccess = function () { res(r.result); };
          r.onerror = function () { rej(r.error); };
        } catch (e) { rej(e); }
      });
    }
    function idbGet(k) { return idb().then(function (db) { return new Promise(function (res, rej) { var q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = function () { res(q.result); }; q.onerror = function () { rej(q.error); }; }); }); }
    function idbSet(k, v) { return idb().then(function (db) { return new Promise(function (res, rej) { var tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = function () { res(); }; tx.onerror = function () { rej(tx.error); }; }); }); }
    function loadAll() {
      try { var r = localStorage.getItem(KEY); if (r) { var o = JSON.parse(r); if (o && o.todos) { o.animales = []; } if (o && Array.isArray(o.animales)) { DB = o; aplicarUnidad(); } } } catch (e) { state.persisted = false; }
      try { var p = localStorage.getItem(KEYP); if (p) { var q = JSON.parse(p); if (q) PERFIL = { nombre: q.nombre || '', logo: q.logo || '' }; } } catch (e) {}
      try { var c = localStorage.getItem('libreta:cat'); if (c) state.cat = c; } catch (e) {}
      // la libreta grande (respaldo SysCaw) se guarda en IndexedDB
      return idbGet('db').then(function (o) {
        if (o && o.todos && !o.animales) o.animales = [];
        if (o && Array.isArray(o.animales) && (o.animales.length || (o.todos && o.todos.length)) && (o.guardada || 0) >= (DB.guardada || 0)) { DB = o; aplicarUnidad(); return true; }
        return false;
      }, function () { return false; });
    }
    function saveDB() {
      DB.guardada = Date.now();
      var g = DB;
      if (DB.todos) { g = {}; Object.keys(DB).forEach(function (k) { if (k !== 'animales' && k !== 'bajas') g[k] = DB[k]; }); }
      return idbSet('db', g).then(function () {
        state.persisted = true; try { localStorage.removeItem(KEY); } catch (e) {}
      }, function () {
        try { localStorage.setItem(KEY, JSON.stringify(g)); state.persisted = true; } catch (e) { state.persisted = false; }
      }).then(function () { render(); });
    }
    function savePerfil() { try { localStorage.setItem(KEYP, JSON.stringify(PERFIL)); } catch (e) {} }
    function byRp(rp) {
      for (var i = 0; i < DB.animales.length; i++) if (DB.animales[i].rp === rp) return DB.animales[i];
      var B = DB.bajas || []; for (i = 0; i < B.length; i++) if (B[i].key === rp) return B[i];
      return null;
    }
    var BAJA = { muerte: 'Muerta', venta: 'Vendida', baja: 'Dada de baja' };
    function bajaTxt(a) { return BAJA[a.bTipo] + (a.bFecha ? ' el ' + A.fmt(a.bFecha) : ''); }
    function toast(msg) {
      var t = $('#toast'); t.textContent = msg; t.classList.add('on');
      clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('on'); }, 3200);
    }

    /* ----- caravana (silueta con el número) ----- */
    function tagSVG(rp, w, tachada) {
      var s = String(rp), n = s.length, fs = n <= 3 ? 40 : n === 4 ? 34 : n === 5 ? 28 : 23;
      return '<svg class="eartag' + (tachada ? ' baja' : '') + '" width="' + w + '" height="' + Math.round(w * 1.3) + '" viewBox="0 0 100 130" role="img" aria-label="Caravana ' + esc(s) + '">' +
        '<path class="tg" d="M38 14 L62 14 L62 33 C62 46 96 42 96 60 L96 119 Q96 127 88 127 L12 127 Q4 127 4 119 L4 60 C4 42 38 46 38 33 Z"/>' +
        '<circle class="tbtn" cx="50" cy="13" r="11"/><circle class="tbtn2" cx="50" cy="13" r="6"/><circle class="tbtn3" cx="50" cy="13" r="2.4"/>' +
        '<text class="tgnum" x="50" y="' + (96 + fs * 0.18).toFixed(1) + '" text-anchor="middle" font-size="' + fs + '">' + esc(s) + '</text>' +
        (tachada ? '<path class="tx" d="M40 50 L60 70M60 50 L40 70"/>' : '') + '</svg>';
    }

    /* ----- archivo ----- */
    function nombreDesdeArchivo(f) {
      var n = f.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\b(copia de|libreta|syscaw|sys caw)\b/gi, '').replace(/[-]+/g, ' ').replace(/\s+/g, ' ').trim();
      return n;
    }
    function busy(on, msg) { $('#busy').hidden = !on; if (msg) $('#busyMsg').innerHTML = msg; }
    function b64(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
    function esRar(buf) { var u = new Uint8Array(buf, 0, Math.min(4, buf.byteLength)); return u[0] === 0x52 && u[1] === 0x61 && u[2] === 0x72 && u[3] === 0x21; }
    function cargarRespaldo(buf, f) {
      busy(true, 'Leyendo respaldo de SysCaw…<small>Puede tardar unos segundos</small>');
      setTimeout(function () {
        root.SysCaw.fromRar(buf, f.name, { unrar: root.Unrar, wasmBinary: b64(root.UNRAR_WASM_B64), Paradox: root.Paradox, elegir: function (us) { return elegirUnidad(us, null, true); }, todas: true }).then(function (d) {
          var sel = d.unidadesSel || [], parcial = !!d.sel;
          DB = { animales: [], todos: d.animales, bajasT: d.bajas || [], unidades: d.unidades.length > 1 ? d.unidades : null, sel: d.sel, hist: d.hist, codes: d.codes, fecha: d.fecha, cargada: today(), archivo: f.name, fuente: 'syscaw' };
          aplicarUnidad();
          busy(false);
          saveDB(); state.q = ''; state.rp = null; state.error = ''; state.filtro = 'todas'; state.tab = 'buscar'; state.cat = 'vaca';
          try { location.hash = ''; } catch (e) {}
          render();
          toast(DB.animales.length + ' animales cargados del respaldo');
          openSheet('Nombre del tambo', (parcial && sel.length === 1 ? sel[0] : d.tambo) || PERFIL.nombre);
        }).catch(function (e) {
          busy(false);
          if (e && e.cancelado) { toast('Carga cancelada. La libreta anterior sigue igual.'); return; }
          state.error = 'No pude leer el respaldo: ' + (e && e.message || e); render();
        });
      }, 30);
    }
    /* ----- elegir unidad del respaldo ----- */
    var uResolve = null;
    var uCargando = false;
    function elegirUnidad(us, pre, cargando) {
      return new Promise(function (res) {
        busy(false); uResolve = res; uCargando = !!cargando;
        $('#sheetUTitle').textContent = cargando ? '¿Qué unidad cargás?' : 'Cambiar de unidad';
        $('#sheetU .unote').textContent = cargando ? 'Este respaldo trae más de una unidad. Marcá la que corresponde a esta libreta (podés marcar más de una). Después podés cambiar de unidad sin volver a cargar el archivo.' : 'Elegí qué unidad ver. Podés marcar más de una.';
        $('#btnU').textContent = cargando ? 'Cargar' : 'Ver';
        var cats = [['vaca', 'vacas', 'vaca'], ['seca', 'secas', 'seca'], ['vaquillona', 'vaquillonas', 'vaquillona'], ['ternera', 'terneras', 'ternera']];
        var det = function (u) { return cats.filter(function (c) { return u[c[0]]; }).map(function (c) { return nf(u[c[0]]) + ' ' + (u[c[0]] === 1 ? c[2] : c[1]); }).join(' · '); };
        var tot = us.reduce(function (s, u) { return s + u.total; }, 0);
        $('#ulist').innerHTML = us.map(function (u) {
          return '<label class="uopt"><input type="checkbox" name="u" value="' + u.id + '"><b>' + esc(u.nombre) + '</b><span>' + nf(u.total) + ' animales · ' + det(u) + '</span></label>';
        }).join('') + '<label class="uopt todas"><input type="checkbox" id="uTodas"><b>Todas las unidades</b><span>' + nf(tot) + ' animales en total</span></label>';
        var marc = pre === null && !cargando ? us.map(function (u) { return u.id; }) : (pre || []);
        Array.prototype.forEach.call(document.querySelectorAll('#ulist input[name=u]'), function (i) { i.checked = marc.indexOf(+i.value) >= 0; });
        $('#uTodas').checked = marc.length === us.length;
        $('#btnU').disabled = !marc.length;
        $('#sheetU').hidden = false;
      });
    }
    function cerrarUnidad(ids) {
      $('#sheetU').hidden = true;
      var r = uResolve; uResolve = null;
      if (ids && ids.length && uCargando) busy(true, 'Armando la libreta…');
      if (r) setTimeout(function () { r(ids); }, 30);
    }
    function nombreSel(sel) {
      if (!DB.unidades) return '';
      var ids = sel || DB.unidades.map(function (u) { return u.id; });
      if (!sel || ids.length === DB.unidades.length) return 'Todas las unidades';
      return DB.unidades.filter(function (u) { return ids.indexOf(u.id) >= 0; }).map(function (u) { return u.nombre; }).join(' + ');
    }
    // arma la vista (DB.animales) según las unidades elegidas
    function aplicarUnidad() {
      if (!DB.todos) return;
      var s = DB.sel && DB.sel.length ? DB.sel : null;
      DB.animales = s ? DB.todos.filter(function (a) { return s.indexOf(a.u) >= 0; }) : DB.todos;
      DB.bajas = s ? (DB.bajasT || []).filter(function (a) { return s.indexOf(a.u) >= 0; }) : (DB.bajasT || []);
      DB.unidad = DB.unidades && s ? nombreSel(s) : '';
    }
    function cambiarUnidad() {
      if (!DB.unidades) return;
      var antes = nombreSel(DB.sel);
      elegirUnidad(DB.unidades, DB.sel, false).then(function (ids) {
        if (!ids || !ids.length) return;
        DB.sel = ids.length === DB.unidades.length ? null : ids;
        aplicarUnidad();
        var ahora = nombreSel(DB.sel);
        // si el nombre del tambo era el de la unidad anterior, lo cambia por el de la nueva
        if (!PERFIL.nombre || PERFIL.nombre === antes) { PERFIL.nombre = ahora === 'Todas las unidades' ? (root.SysCaw.infoFromName(DB.archivo).tambo || ahora) : ahora; savePerfil(); }
        state.q = ''; state.rp = null; state.error = ''; state.filtro = 'todas'; state.n = 60;
        try { location.hash = ''; } catch (e) {}
        saveDB();
        toast(ahora + ': ' + DB.animales.length + ' animales');
      });
    }
    function idsMarcados() { return Array.prototype.map.call(document.querySelectorAll('#ulist input[name=u]:checked'), function (i) { return +i.value; }); }
    $('#ulist').addEventListener('change', function (e) {
      var all = document.querySelectorAll('#ulist input[name=u]');
      if (e.target.id === 'uTodas') Array.prototype.forEach.call(all, function (i) { i.checked = e.target.checked; });
      else $('#uTodas').checked = idsMarcados().length === all.length;
      $('#btnU').disabled = !idsMarcados().length;
    });
    $('#sheetU').addEventListener('click', function (e) { if (e.target.id === 'sheetU') cerrarUnidad(null); });

    function handleFile(f) {
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        if (esRar(fr.result) || /\.rar$/i.test(f.name)) { cargarRespaldo(fr.result, f); return; }
        try {
          var res = A.parseLibreta(root.XLSX, fr.result);
          res.animales.forEach(function (a) { a.cat = 'vaca'; });
          DB = { animales: res.animales, cargada: today(), archivo: f.name, fuente: 'excel', hist: DB.hist, codes: DB.codes, fecha: DB.fecha };
          saveDB(); state.q = ''; state.rp = null; state.error = ''; state.filtro = 'todas'; state.tab = 'buscar'; state.cat = 'vaca';
          try { location.hash = ''; } catch (e) {}
          render();
          toast(res.animales.length + ' animales cargados');
          openSheet('Nombre del tambo', nombreDesdeArchivo(f.name) || PERFIL.nombre);
          return;
        } catch (e) { state.error = e.message || 'No pude leer el archivo.'; }
        render();
      };
      fr.onerror = function () { state.error = 'No pude abrir el archivo.'; render(); };
      fr.readAsArrayBuffer(f);
    }

    /* ----- ajustes: nombre y logo ----- */
    function openSheet(titulo, nombrePropuesto) {
      state.draft = { nombre: nombrePropuesto != null ? nombrePropuesto : PERFIL.nombre, logo: PERFIL.logo };
      $('#sheetTitle').textContent = titulo || 'Ajustes';
      $('#inNombre').value = state.draft.nombre;
      paintLogoPreview();
      $('#sheet').hidden = false;
      setTimeout(function () { $('#inNombre').focus(); }, 60);
    }
    function closeSheet() { $('#sheet').hidden = true; state.draft = null; }
    function paintLogoPreview() {
      var d = state.draft || PERFIL;
      $('#logoPrev').innerHTML = d.logo ? '<img alt="" src="' + d.logo + '">' : '<span>Sin logo</span>';
      $('#btnQuitarLogo').hidden = !d.logo;
    }
    function procesarLogo(file) {
      if (!file) return;
      var fr = new FileReader();
      fr.onload = function () {
        var img = new Image();
        img.onload = function () {
          var max = 192, k = Math.min(1, max / Math.max(img.width, img.height));
          var c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          var png = /png|gif|webp|svg/i.test(file.type);
          try { state.draft.logo = c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.88); } catch (e) { return; }
          paintLogoPreview();
        };
        img.onerror = function () { toast('No pude leer esa imagen. Probá con otra.'); };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    }
    function guardarSheet() {
      if (!state.draft) return;
      PERFIL = { nombre: $('#inNombre').value.trim(), logo: state.draft.logo || '' };
      savePerfil(); closeSheet(); render(); toast('Guardado');
    }

    /* ----- navegación ----- */
    function setTab(t) {
      state.tab = t; state.rp = null;
      try { if (location.hash) location.hash = ''; } catch (e) {}
      render(); window.scrollTo(0, 0);
    }
    function openFicha(rp) {
      state.rp = rp;
      try { location.hash = 'ficha-' + rp; } catch (e) {}
      render(); window.scrollTo(0, 0);
    }
    function back() {
      state.rp = null;
      try { location.hash = ''; } catch (e) {}
      render();
    }
    window.addEventListener('hashchange', function () {
      var m = /^#ficha-(b?\d+)$/.exec(location.hash);
      state.rp = m && byRp(m[1]) ? m[1] : null; render();
    });

    /* ----- piezas comunes ----- */
    function labelOf(a) {
      if (a.cat === 'ternera' && a.estado === 'sin') return 'Ternera';
      if (a.cat === 'vaquillona' && a.estado === 'sin') return 'Sin servicio';
      return a.celo ? 'Preñada + celo' : a.estado === 'otro' ? (a.result || 'Otro') : LABEL[a.estado];
    }
    function chip(a) { return '<span class="chip ' + a.estado + '">' + esc(labelOf(a)) + '</span>'; }
    function subDefault(a) {
      var d = A.derive(a, today()), sub = '';
      if (a.estado === 'prenada' && d.partoProb) sub = (d.partoEstimado ? 'Parto estimado ' : 'Parto probable ') + A.fmt(d.partoProb);
      else if (a.estado === 'servida' && a.sFecha) sub = 'Servicio ' + A.fmt(a.sFecha) + (a.toro && !/^celo/i.test(a.toro) ? ' · ' + a.toro : '');
      else if (a.tFecha) sub = 'Tacto ' + A.fmt(a.tFecha);
      else if (a.sFecha) sub = (/^celo/i.test(a.toro || '') ? 'Celo ' : 'Servicio ') + A.fmt(a.sFecha);
      return (a.cat && a.cat !== 'vaca' ? '<span class="catlbl">' + CATL[a.cat] + '</span>' + (sub ? ' · ' : '') : '') + esc(sub) + (a.rech ? ' <span class="dsc">Descarte</span>' : '');
    }
    function rowBajaHTML(a) {
      return '<button class="row baja" data-rp="' + esc(a.key) + '">' + tagSVG(a.rp, 54, true) +
        '<span class="who">' + esc(a.nombre || 'Sin nombre') + '</span>' +
        '<span class="rt"><span class="chip ' + a.bTipo + '">' + BAJA[a.bTipo] + '</span></span>' +
        '<span class="sub">' + (a.cat ? '<span class="catlbl">' + CATL[a.cat] + '</span> · ' : '') + esc(bajaTxt(a)) + (a.bCausa ? ' · ' + esc(a.bCausa) : '') + '</span></button>';
    }
    function rowHTML(a, o) {
      if (a.bTipo) return rowBajaHTML(a);
      o = o || {};
      return '<button class="row" data-rp="' + esc(a.rp) + '">' + tagSVG(a.rp, 54) +
        '<span class="who">' + esc(a.nombre || 'Sin nombre') + '</span>' +
        '<span class="rt">' + (o.right != null ? o.right : chip(a)) + '</span>' +
        '<span class="sub">' + (o.sub != null ? (a.cat && a.cat !== 'vaca' ? '<span class="catlbl">' + CATL[a.cat] + '</span> · ' : '') + o.sub : subDefault(a)) + '</span></button>';
    }
    function emptyHTML() {
      return '<section class="empty"><div class="emptytag">' + tagSVG('0000', 64) + '</div><h2>Cargá el respaldo</h2>' +
        '<p>Elegí el respaldo de SysCaw (.rar) o la libreta en Excel (.xls o .xlsx). Se lee en este teléfono y no se sube a ningún servidor.</p>' +
        (state.error ? '<p class="error" role="alert">' + esc(state.error) + '</p>' : '') +
        '<button class="btn primary big" data-a="load">Elegir archivo</button></section>';
    }
    function matchFiltro(a, f) { return f === 'todas' || (f === 'descarte' ? !!a.rech : f === 'pcelo' ? !!a.celo : a.estado === f); }
    function numRp(a, b) { return a.rp.localeCompare(b.rp, 'es', { numeric: true }); }
    /* ----- categorías (vacas, vaquillonas, terneras) ----- */
    var CATL = { vaca: 'Vaca', seca: 'Vaca seca', vaquillona: 'Vaquillona', ternera: 'Ternera' };
    var GL = { vaca: 'En ordeñe', seca: 'Secas', vaquillona: 'Vaquillonas', ternera: 'Terneras' };
    function grupo(a) { return a.cat || 'vaca'; }
    function grupos() { var g = {}; DB.animales.forEach(function (a) { g[grupo(a)] = (g[grupo(a)] || 0) + 1; }); return g; }
    function lista() {
      var g = grupos(), orden = ['vaca', 'seca', 'vaquillona', 'ternera'].filter(function (k) { return g[k]; });
      if (state.cat === 'todas' && state.tab === 'rodeo' && !state.rp) return DB.animales;
      if (orden.indexOf(state.cat) < 0) state.cat = orden[0] || 'vaca';
      return DB.animales.filter(function (a) { return grupo(a) === state.cat; });
    }
    function catsHTML() {
      var g = grupos(), orden = ['vaca', 'seca', 'vaquillona', 'ternera'].filter(function (k) { return g[k]; });
      if (orden.length < 2) return '';
      // en Rodeo se agrega "Todas" (partos proyectados de vacas y vaquillonas juntos)
      var conTodas = state.tab === 'rodeo';
      return '<div class="cats' + (orden.length === 4 || conTodas ? ' n4' : '') + '" role="group" aria-label="Categoría">' +
        (conTodas ? '<button class="todas" data-cat="todas" aria-pressed="' + (state.cat === 'todas') + '">Todas <b>' + DB.animales.length + '</b></button>' : '') +
        orden.map(function (k) {
          return '<button data-cat="' + k + '" aria-pressed="' + (state.cat === k) + '">' + GL[k] + ' <b>' + g[k] + '</b></button>';
        }).join('') + '</div>';
    }
    function nombreGrupo(n) { return state.cat === 'vaquillona' ? (n === 1 ? 'vaquillona' : 'vaquillonas') : state.cat === 'ternera' ? (n === 1 ? 'ternera' : 'terneras') : state.cat === 'seca' ? (n === 1 ? 'vaca seca' : 'vacas secas') : (n === 1 ? 'vaca en ordeñe' : 'vacas en ordeñe'); }
    function ordenar(list, f) {
      var h = today();
      var key = function (a) {
        if (f === 'prenada') { var d = A.derive(a, h); return d.partoProb || '9999'; }
        if (f === 'servida') return a.sFecha || '9999';
        if (f === 'vacia' || f === 'ciclando' || f === 'apta' || f === 'otro') return a.tFecha || '9999';
        return '';
      };
      return list.slice().sort(function (x, y) { var kx = key(x), ky = key(y); return kx < ky ? -1 : kx > ky ? 1 : numRp(x, y); });
    }

    /* ----- pestaña Buscar ----- */
    function buscarHTML() {
      var L = lista(), c = A.conteo(L), nDesc = L.filter(function (a) { return a.rech; }).length;
      var fl = [['todas', 'Todas', L.length]];
      ORDEN.forEach(function (k) { if (c[k]) fl.push([k, k === 'prenada' ? 'Preñadas' : k === 'servida' ? 'Servidas' : k === 'vacia' ? 'Vacías' : (k === 'sin' && state.cat === 'vaquillona') ? 'Sin servicio' : (k === 'sin' && state.cat === 'ternera') ? 'Sin servicio' : LABEL[k], c[k]]); });
      var nCelo = L.filter(function (a) { return a.celo; }).length;
      if (nCelo) fl.push(['pcelo', 'Preñada + celo', nCelo]);
      if (nDesc) fl.push(['descarte', 'Descarte', nDesc]);
      return '<div class="searchbox"><label class="sr" for="q">Caravana o nombre</label>' +
        '<svg class="mag" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M15.5 15.5L21 21" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>' +
        '<input id="q" type="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Caravana o nombre" value="' + esc(state.q) + '"></div>' + catsHTML() +
        '<div class="filters" role="group" aria-label="Filtrar por estado">' + fl.map(function (f) {
          return '<button class="fchip ' + f[0] + '" data-f="' + f[0] + '" aria-pressed="' + (state.filtro === f[0]) + '">' + f[1] + ' <b>' + f[2] + '</b></button>';
        }).join('') + '</div><div id="results"></div>';
    }
    function updateResults() {
      var box = $('#results'); if (!box) return;
      var q = state.q.trim(), f = state.filtro, html = '', list;
      if (q) {
        // busca dentro de la categoría elegida; si no está, avisa en qué otra categoría aparece
        list = A.search(lista(), q).filter(function (a) { return f === 'todas' || matchFiltro(a, f); });
        if (list.length) {
          html = '<h2 class="h">' + list.length + (list.length === 1 ? ' resultado' : ' resultados') + ' en ' + GL[state.cat].toLowerCase() + '</h2>' + list.slice(0, 40).map(function (a) { return rowHTML(a); }).join('');
          if (list.length > 40) html += '<p class="hint">Mostrando 40. Escribí más para acotar.</p>';
        } else {
          var otros = A.search(DB.animales, q).filter(function (a) { return grupo(a) !== state.cat; });
          html = '<p class="hint">No hay ' + nombreGrupo(2) + ' con "' + esc(q) + '"' + (f !== 'todas' ? ' en este filtro' : '') + '.' + (otros.length ? '' : ' Probá con otra caravana o con parte del nombre.') + '</p>';
          if (otros.length) html += '<h2 class="h">En otras categorías</h2>' + otros.slice(0, 20).map(function (a) { return rowHTML(a); }).join('');
        }
        // muertas y vendidas: solo aparecen si se busca la caravana
        var bj = A.search(DB.bajas || [], q).filter(function (a) { return a.rp === q || a.rp.indexOf(q) === 0 || q.length >= 3; });
        if (bj.length) html += '<h2 class="h">Dadas de baja (muertas o vendidas)</h2>' + bj.slice(0, 15).map(rowBajaHTML).join('');
        if (bj.length > 15) html += '<p class="hint">Hay ' + (bj.length - 15) + ' bajas más con ese número. Escribí la caravana completa.</p>';
      } else {
        list = f === 'todas' ? lista().slice().sort(numRp) : ordenar(lista().filter(function (a) { return matchFiltro(a, f); }), f);
        var tit = f === 'prenada' ? 'por fecha de parto' : f === 'servida' ? 'servicio más antiguo primero' : f === 'descarte' ? 'descarte programado' : f === 'pcelo' ? 'preñadas con celo registrado' : '';
        html = '<h2 class="h">' + list.length + ' ' + nombreGrupo(list.length) + (tit ? ', ' + tit : '') + '</h2>' + list.slice(0, state.n).map(function (a) { return rowHTML(a); }).join('');
        if (list.length > state.n) html += '<button class="btn more" data-a="mas">Mostrar más (' + (list.length - state.n) + ' restantes)</button>';
      }
      box.innerHTML = html;
    }

    /* ----- pestaña Tareas ----- */
    var VENT = [[30, '30 días'], [90, '90 días'], [183, '6 meses'], [365, '12 meses']];
    function secTareas(key, titulo, nota, items, mapRow, vacio) {
      var abierta = !!state.abiertas[key], lim = abierta ? items.length : 12;
      var h = '<section class="sec"><div class="sechead"><h2>' + titulo + '</h2><span class="count">' + items.length + '</span></div>' + (nota ? '<p class="secnote">' + nota + '</p>' : '');
      if (!items.length) h += '<p class="hint">' + vacio + '</p>';
      else {
        h += items.slice(0, lim).map(mapRow).join('');
        if (items.length > 12) h += '<button class="btn more" data-a="ver" data-k="' + key + '">' + (abierta ? 'Ver menos' : 'Ver las ' + items.length) + '</button>';
      }
      return h + '</section>';
    }
    function tareasHTML() {
      var t = A.tareas(DB.animales.filter(function (a) { return a.cat !== 'ternera'; }), today(), state.ventana), vtxt = (VENT.filter(function (v) { return v[0] === state.ventana; })[0] || [0, ''])[1];
      var chips = '<div class="filters" role="group" aria-label="Ventana de tiempo">' + VENT.map(function (v) {
        return '<button class="fchip plain" data-v="' + v[0] + '" aria-pressed="' + (state.ventana === v[0]) + '">' + v[1] + '</button>';
      }).join('') + '</div>';
      return '<h1 class="ptitle">Tareas</h1>' + chips +
        secTareas('tactar', 'Para tactar', 'Servidas hace ' + A.DX_MIN + ' días o más, sin tacto posterior.', t.tactar, function (x) {
          return rowHTML(x.a, { right: '<span class="when late">hace ' + x.dias + ' días</span>', sub: 'Servicio ' + A.fmt(x.fecha) + (x.a.toro && !/^celo/i.test(x.a.toro) ? ' · ' + esc(x.a.toro) : '') });
        }, 'No hay vacas pendientes de tacto.') +
        secTareas('secar', 'Para secar', 'Preñadas cuyo secado cae en los próximos ' + vtxt + ' (' + A.SECADO + ' días antes del parto).', t.secar, function (x) {
          return rowHTML(x.a, { right: '<span class="when">' + A.rel(x.dias) + '</span>', sub: 'Secar el ' + A.fmt(x.fecha) });
        }, 'Ninguna vaca para secar en los próximos ' + vtxt + '.') +
        secTareas('partos', 'Próximos partos', 'Partos probables en los próximos ' + vtxt + '.', t.partos, function (x) {
          return rowHTML(x.a, { right: '<span class="when">' + A.rel(x.dias) + '</span>', sub: 'Parto probable ' + A.fmt(x.fecha) });
        }, 'Ningún parto probable en los próximos ' + vtxt + '.');
    }

    /* ----- pestaña Rodeo ----- */
    function mesesChart(meses) {
      var max = Math.max.apply(null, meses.map(function (m) { return m.n; })); if (!max) return '<p class="hint">No hay partos probables en los próximos 12 meses.</p>';
      var W = 320, H = 150, padx = 6, gap = 5, bw = (W - padx * 2 - gap * 11) / 12, s = '';
      meses.forEach(function (m, i) {
        var x = padx + i * (bw + gap), h = m.n ? Math.max(3, m.n / max * (H - 48)) : 0, y = H - 26 - h;
        if (m.n) s += '<rect class="mbar" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="3"/><text class="mval" x="' + (x + bw / 2).toFixed(1) + '" y="' + (y - 4).toFixed(1) + '" text-anchor="middle">' + m.n + '</text>';
        else s += '<rect class="mzero" x="' + x.toFixed(1) + '" y="' + (H - 28) + '" width="' + bw.toFixed(1) + '" height="2" rx="1"/>';
        s += '<text class="mlbl" x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 12) + '" text-anchor="middle">' + m.label + '</text>';
        if (m.label === 'ene' || i === 0) s += '<text class="myear" x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 1) + '" text-anchor="middle">' + String(m.anio).slice(2) + '</text>';
      });
      return '<svg class="mchart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Partos probables por mes">' + s + '</svg>';
    }
    function mesesStack(mv, mq) {
      var tot = mv.map(function (m, i) { return m.n + mq[i].n; });
      var max = Math.max.apply(null, tot); if (!max) return '<p class="hint">No hay partos probables en los próximos 12 meses.</p>';
      var W = 320, H = 150, padx = 6, gap = 5, bw = (W - padx * 2 - gap * 11) / 12, s = '', k = (H - 48) / max;
      mv.forEach(function (m, i) {
        var x = padx + i * (bw + gap), base = H - 26, hv = m.n * k, hq = mq[i].n * k;
        if (tot[i]) {
          if (hv) s += '<rect class="mbv" x="' + x.toFixed(1) + '" y="' + (base - hv).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hv.toFixed(1) + '"><title>' + m.label + ': ' + m.n + ' vacas</title></rect>';
          if (hq) s += '<rect class="mbq" x="' + x.toFixed(1) + '" y="' + (base - hv - hq).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hq.toFixed(1) + '"><title>' + m.label + ': ' + mq[i].n + ' vaquillonas</title></rect>';
          s += '<text class="mval" x="' + (x + bw / 2).toFixed(1) + '" y="' + (base - hv - hq - 4).toFixed(1) + '" text-anchor="middle">' + tot[i] + '</text>';
        } else s += '<rect class="mzero" x="' + x.toFixed(1) + '" y="' + (H - 28) + '" width="' + bw.toFixed(1) + '" height="2" rx="1"/>';
        s += '<text class="mlbl" x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 12) + '" text-anchor="middle">' + m.label + '</text>';
        if (m.label === 'ene' || i === 0) s += '<text class="myear" x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 1) + '" text-anchor="middle">' + String(m.anio).slice(2) + '</text>';
      });
      return '<svg class="mchart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Partos probables por mes, vacas y vaquillonas">' + s + '</svg>';
    }
    function rodeoTodasHTML() {
      var h = today(), V = DB.animales.filter(function (a) { return a.cat === 'vaca' || a.cat === 'seca' || !a.cat; }), Q = DB.animales.filter(function (a) { return a.cat === 'vaquillona'; });
      var rv = A.resumen(V, h), rq = A.resumen(Q, h);
      var sv = rv.meses.reduce(function (s, m) { return s + m.n; }, 0), sq = rq.meses.reduce(function (s, m) { return s + m.n; }, 0);
      var antes = rv.antes + rq.antes, despues = rv.despues + rq.despues;
      var g = grupos(), filas = ['vaca', 'seca', 'vaquillona', 'ternera'].filter(function (k) { return g[k]; }).map(function (k) {
        var L = DB.animales.filter(function (a) { return grupo(a) === k; }), p = L.filter(function (a) { return a.estado === 'prenada'; }).length;
        return '<tr><td>' + GL[k] + '</td><td>' + nf(L.length) + '</td><td>' + (k === 'ternera' ? '' : nf(p) + ' <small>' + pct(p, L.length) + '</small>') + '</td></tr>';
      }).join('');
      return '<h1 class="ptitle">Rodeo</h1>' + catsHTML() +
        '<section class="card"><h2>Partos probables por mes</h2>' +
        '<div class="mleg"><span><i class="v"></i>Vacas <b>' + nf(sv) + '</b></span><span><i class="q"></i>Vaquillonas <b>' + nf(sq) + '</b></span></div>' +
        mesesStack(rv.meses, rq.meses) +
        (antes ? '<p class="secnote warnnote">' + antes + ' preñadas tienen el parto probable vencido.</p>' : '') +
        (despues ? '<p class="cap">Además, ' + despues + ' después de ese período.</p>' : '') + '</section>' +
        '<section class="card"><h2>' + nf(DB.animales.length) + ' animales</h2><table class="tbl"><thead><tr><th>Categoría</th><th>Animales</th><th>Preñadas</th></tr></thead><tbody>' + filas + '</tbody></table></section>';
    }
    function rodeoHTML() {
      if (state.cat === 'todas') return rodeoTodasHTML();
      var L = lista(), r = A.resumen(L, today()), c = r.conteo;
      var seg = ORDEN.filter(function (k) { return c[k]; }).map(function (k) {
        return '<span class="seg ' + k + '" style="flex:' + c[k] + '" title="' + LABEL[k] + '"></span>';
      }).join('');
      var leg = ORDEN.filter(function (k) { return c[k]; }).map(function (k) {
        return '<button class="lg" data-go="' + k + '"><i class="dot ' + k + '"></i><span class="ln">' + (k === 'prenada' ? 'Preñadas' : k === 'servida' ? 'Servidas' : k === 'vacia' ? 'Vacías' : k === 'otro' ? 'Otros' : (k === 'sin' && (state.cat === 'vaquillona' || state.cat === 'ternera')) ? 'Sin servicio' : LABEL[k]) + '</span><b>' + c[k] + '</b><span class="pc">' + pct(c[k], r.total) + '</span></button>';
      }).join('');
      var nPc = L.filter(function (a) { return a.celo; }).length;
      if (nPc) leg += '<button class="lg" data-go="pcelo"><i class="dot prenada"></i><span class="ln">Preñada + celo</span><b>' + nPc + '</b><span class="pc">' + pct(nPc, r.total) + '</span></button>';
      if (r.descarte) leg += '<button class="lg" data-go="descarte"><i class="dot descarte"></i><span class="ln">Descarte programado</span><b>' + r.descarte + '</b><span class="pc">' + pct(r.descarte, r.total) + '</span></button>';
      var rod = r.rodeos.length > 1 ? '<section class="card"><h2>Por rodeo</h2><table class="tbl"><thead><tr><th>Rodeo</th><th>' + GL[state.cat] + '</th><th>Preñadas</th></tr></thead><tbody>' + r.rodeos.map(function (x) {
        return '<tr><td>' + esc(x.rod) + '</td><td>' + x.n + '</td><td>' + x.pren + ' <small>' + pct(x.pren, x.n) + '</small></td></tr>';
      }).join('') + '</tbody></table></section>' : '';
      var aviso = r.antes ? '<p class="secnote warnnote">' + r.antes + ' preñadas tienen el parto probable vencido.</p>' : '';
      return '<h1 class="ptitle">Rodeo</h1>' + catsHTML() +
        '<section class="card"><h2>' + nf(r.total) + ' ' + nombreGrupo(r.total) + '</h2><div class="comp" role="img" aria-label="Composición del rodeo por estado">' + seg + '</div><div class="legend">' + leg + '</div></section>' +
        (state.cat === 'ternera' ? '' : '<section class="card"><h2>Partos probables por mes</h2>' + mesesChart(r.meses) + aviso + (r.despues ? '<p class="cap">Además, ' + r.despues + ' después de ese período.</p>' : '') + '</section>') +
        (r.leche != null ? '<section class="card"><h2>Producción</h2>' + kv([['Litros por vaca, último control', nf(r.leche, 1) + ' lts'], ['Vacas con control lechero', nf(r.nLeche)], ['Días en lactancia, promedio', r.dLac != null ? nf(r.dLac) : null]]) + '</section>' : '') + rod;
    }

    /* ----- ficha ----- */
    function kv(rows, cls) {
      var items = rows.filter(function (r) { return r[1] != null && r[1] !== ''; });
      if (!items.length) return '';
      return '<dl class="kv' + (cls ? ' ' + cls : '') + '">' + items.map(function (r) { return '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>'; }).join('') + '</dl>';
    }
    function bars(pr) {
      var vals = pr.slice().reverse(), n = vals.length;
      var nums = vals.filter(function (v) { return typeof v === 'number'; });
      if (!nums.length) return '';
      var max = Math.max.apply(null, nums), W = 300, H = 118, padx = 6, gap = 6;
      var bw = (W - padx * 2 - gap * (n - 1)) / n, s = '';
      vals.forEach(function (v, i) {
        var x = padx + i * (bw + gap), label = 'Pr' + (n - i);
        if (typeof v === 'number') {
          var h = Math.max(3, (v / max) * (H - 40)), y = H - 18 - h;
          s += '<rect class="bar' + (i === n - 1 ? ' last' : '') + '" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="3"/>' +
            '<text class="val" x="' + (x + bw / 2).toFixed(1) + '" y="' + (y - 4).toFixed(1) + '" text-anchor="middle">' + v + '</text>';
        } else if (v) {
          s += '<text class="val" x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 24) + '" text-anchor="middle">' + esc(v) + '</text>';
        }
        s += '<text class="lbl" x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 4) + '" text-anchor="middle">' + label + '</text>';
      });
      return '<svg class="bars" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Litros por control lechero">' + s + '</svg>' +
        '<p class="cap">Litros por control, del más viejo al más reciente (Pr1).</p>';
    }

    /* ----- historial SysCaw ----- */
    var EVL = { C: 'Celo', S: 'Servicio' };
    function hist(rp) { return DB.hist ? DB.hist[rp] || null : null; }
    function codeName(c) { var k = DB.codes && DB.codes[String(c)]; return k ? k[1] : 'Código ' + c; }
    function tacClass(c) { return c === 1 ? 'prenada' : (c === 7 || c === 105 || c === 72) ? 'vacia' : ''; }
    function criaTxt(r) {
      var m = { M: 'Macho', H: 'Hembra', A: 'Aborto', '?': 'Sin dato' };
      return String(r || '').split('/').filter(Boolean).map(function (x) { return m[x] || x; }).join(' y ');
    }
    function lactaciones(h) {
      // segmentos: [desde, hasta) por parto; índice 0 = antes del 1er parto
      var pa = h.pa, segs = [];
      var bounds = ['0000-00-00'].concat(pa.map(function (p) { return p[0]; })).concat(['9999-99-99']);
      for (var i = 0; i < bounds.length - 1; i++) {
        var from = bounds[i], to = bounds[i + 1], parto = i > 0 ? pa[i - 1] : null, next = pa[i] || null;
        var items = [];
        h.ev.forEach(function (e) { if (e[0] >= from && e[0] < to && !(parto && e[0] === from && e[1] === 'C')) items.push({ f: e[0], t: e[1], toro: e[2] }); });
        h.ta.forEach(function (t) { if (t[0] >= from && t[0] < to) items.push({ f: t[0], t: 'T', c: t[1] }); });
        items.sort(function (a, b) { return a.f < b.f ? -1 : a.f > b.f ? 1 : (b.t === 'T') - (a.t === 'T'); });
        var conc = next ? next[4] : null, nServ = 0, nServTot = 0;
        items.forEach(function (it) { if (it.t === 'S') { nServTot++; if (!conc || it.f <= conc) nServ++; if (conc && it.f === conc) it.ok = true; } });
        segs.push({ parto: parto, next: next, items: items, conc: conc, nServ: conc ? nServ : null, nServTot: nServTot, from: from });
      }
      if (!segs[0].items.length) segs.shift();
      return segs;
    }
    function resumenHist(h) {
      var segs = lactaciones(h), spc = [], iep = [], pcon = [];
      segs.forEach(function (s) {
        if (s.parto && s.next && s.conc) {
          if (s.nServ) spc.push(s.nServ);
          iep.push(A.diffDays(s.next[0], s.parto[0]));
          pcon.push(A.diffDays(s.conc, s.parto[0]));
        }
      });
      var avg = function (l) { return l.length ? l.reduce(function (a, b) { return a + b; }, 0) / l.length : null; };
      return { segs: segs, spc: avg(spc), iep: avg(iep), pcon: avg(pcon), n: iep.length };
    }
    function histHTML(a, h) {
      var t = today(), R = resumenHist(h), segs = R.segs.slice().reverse();
      var dec = function (x, d) { return x == null ? '–' : x.toLocaleString('es-UY', { maximumFractionDigits: d, minimumFractionDigits: d }); };
      var sum = R.n ? '<div class="histsum">' +
        '<div><b>' + dec(R.spc, 1) + '</b><span>Servicios por preñez</span></div>' +
        '<div><b>' + dec(R.pcon, 0) + '</b><span>Días parto a concepción</span></div>' +
        '<div><b>' + dec(R.iep, 0) + '</b><span>Intervalo entre partos</span></div></div>' +
        '<p class="cap" style="margin:-4px 0 8px">Promedio de ' + R.n + (R.n === 1 ? ' lactancia cerrada.' : ' lactancias cerradas.') + '</p>' : '';
      var body = segs.map(function (s, i) {
        var title, sub = [];
        if (s.parto) {
          title = 'Lactancia ' + s.parto[1];
          sub.push('Parto ' + A.fmt(s.parto[0]));
        } else { title = 'Vaquillona'; }
        if (s.conc) sub.push(s.nServ + ' serv. a preñez');
        else if (s.nServTot) sub.push(s.nServTot + ' serv.');
        var li = [];
        if (s.parto) {
          var pt = s.parto, cria = criaTxt(pt[2]);
          li.push('<li class="parto"><span class="f">' + A.fmt(pt[0]) + '</span><span><b>Parto ' + pt[1] + '</b>' + (cria ? ' · ' + esc(cria) : '') + (pt[3] ? ' · ' + esc(pt[3]) : '') + '</span><span class="d"></span></li>');
        }
        s.items.forEach(function (it) {
          var dpp = s.parto ? A.diffDays(it.f, s.parto[0]) : null, cls, txt;
          if (it.t === 'T') { cls = 'tac ' + tacClass(it.c); txt = 'Tacto: <b>' + esc(codeName(it.c)) + '</b>'; }
          else if (it.t === 'S') { cls = 'serv' + (it.ok ? ' ok' : ''); txt = '<b>Servicio</b>' + (it.toro ? ' · ' + esc(it.toro) : '') + (it.ok ? '<span class="x">preñó</span>' : ''); }
          else { cls = 'celo'; txt = 'Celo'; }
          li.push('<li class="' + cls + '"><span class="f">' + A.fmt(it.f) + '</span><span>' + txt + '</span><span class="d">' + (dpp != null ? dpp + ' dpp' : '') + '</span></li>');
        });
        if (s.parto && s.parto[5]) li.push('<li><span class="f">' + A.fmt(s.parto[5]) + '</span><span>' + (a.bTipo && a.bFecha && s.parto[5] >= a.bFecha ? 'Fin de lactancia (' + (a.bTipo === 'muerte' ? 'muerte' : a.bTipo === 'venta' ? 'venta' : 'baja') + ')' : 'Secado') + '</span><span class="d">' + A.diffDays(s.parto[5], s.parto[0]) + ' días</span></li>');
        if (!s.items.length && !s.parto) return '';
        return '<details class="lac"' + (i === 0 ? ' open' : '') + '><summary><span class="l"><b>' + title + '</b></span><small>' + sub.join(' · ') + '</small></summary><ul class="tl">' + li.join('') + '</ul></details>';
      }).join('');
      return '<section class="card"><h2>Historial reproductivo</h2>' + sum + body + '</section>';
    }
    function ctrlChart(ct) {
      var pts = ct.filter(function (c) { return c[1] != null; });
      if (pts.length < 2) return '';
      var W = 300, H = 130, L = 26, Rr = 40, T = 10, B = 22, n = pts.length;
      var maxL = Math.max.apply(null, pts.map(function (c) { return c[1]; })) * 1.1;
      var csv = pts.map(function (c) { return c[4]; }).filter(function (v) { return v != null; });
      var maxC = Math.max(400, csv.length ? Math.max.apply(null, csv) * 1.1 : 0);
      var bw0 = Math.max(4, Math.min(18, (W - L - Rr) / n * 0.6));
      var X = function (i) { return L + bw0 / 2 + 4 + (n === 1 ? 0 : i * (W - L - Rr - bw0 - 8) / (n - 1)); };
      var Y = function (v) { return T + (1 - v / maxL) * (H - T - B); };
      var YC = function (v) { return T + (1 - v / maxC) * (H - T - B); };
      var bw = bw0, s = '';
      s += '<line x1="' + L + '" x2="' + (W - Rr) + '" y1="' + YC(200).toFixed(1) + '" y2="' + YC(200).toFixed(1) + '" stroke="var(--vacia)" stroke-dasharray="3 3" stroke-width="1" opacity=".6"/>';
      s += '<text class="lbl" x="' + (W - Rr + 3) + '" y="' + (YC(200) + 3).toFixed(1) + '">200</text>';
      pts.forEach(function (c, i) {
        var x = X(i), y = Y(c[1]);
        s += '<rect class="bar' + (i === n - 1 ? ' last' : '') + '" x="' + (x - bw / 2).toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (H - B - y).toFixed(1) + '" rx="2"><title>' + A.fmt(c[0]) + ': ' + c[1] + ' lts</title></rect>';
        if (i === 0 || i === n - 1 || n <= 8) s += '<text class="lbl" x="' + x.toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + c[0].slice(8, 10) + '/' + c[0].slice(5, 7) + '</text>';
      });
      s += '<text class="lbl" x="' + (L - 4) + '" y="' + (Y(maxL / 1.1) + 3).toFixed(1) + '" text-anchor="end">' + Math.round(maxL / 1.1) + '</text>';
      var cp = pts.map(function (c, i) { return c[4] != null ? [X(i), YC(Math.min(c[4], maxC))] : null; }).filter(Boolean);
      if (cp.length > 1) s += '<polyline class="cs" points="' + cp.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/>';
      cp.forEach(function (p) { s += '<circle class="csd" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="2.6"/>'; });
      return '<svg class="bars" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Litros y células somáticas por control">' + s + '</svg>' +
        '<div class="clegend"><span><i style="background:var(--bar)"></i>Litros/día</span><span><i style="background:var(--vacia)"></i>CS (miles) · punteada = 200</span></div>';
    }
    function prodHistHTML(a, h) {
      var lastP = h.pa.length ? h.pa[h.pa.length - 1][0] : '0000';
      var cur = h.ct.filter(function (c) { return c[0] >= lastP; });
      var prev = h.ct.filter(function (c) { return c[0] < lastP; });
      var d1 = function (v) { return v == null ? '–' : Number(v).toLocaleString('es-UY', { minimumFractionDigits: 1, maximumFractionDigits: 2 }); };
      var rows = function (l) {
        return l.slice().reverse().map(function (c) {
          return '<tr><td>' + A.fmt(c[0]) + '</td><td>' + d1(c[1]) + '</td><td>' + d1(c[2]) + '</td><td>' + d1(c[3]) + '</td><td' + (c[4] != null && c[4] >= 200 ? ' class="hi"' : '') + '>' + (c[4] == null ? '–' : nf(c[4])) + '</td></tr>';
        }).join('');
      };
      var head = '<thead><tr><th>Control</th><th>Lts</th><th>% G</th><th>% P</th><th>CS (miles)</th></tr></thead>';
      var out = '';
      if (cur.length) out += ctrlChart(cur) + '<div class="scroll"><table class="htbl">' + head + '<tbody>' + rows(cur) + '</tbody></table></div>';
      if (prev.length) out += '<details class="lac"><summary><span class="l"><b>Lactancia anterior</b></span><small>' + prev.length + ' controles</small></summary><div class="scroll"><table class="htbl">' + head + '<tbody>' + rows(prev) + '</tbody></table></div></details>';
      return out;
    }
    function lactHTML(h) {
      if (!h.la.length) return '';
      var d2 = function (v) { return v == null ? '–' : Number(v).toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
      var maxN = h.la[h.la.length - 1][0];
      var rows = h.la.slice().reverse().map(function (l) {
        return '<tr' + (l[0] === maxN ? ' class="cur"' : '') + '><td>' + l[0] + (l[0] === maxN ? ' (actual)' : '') + '</td><td>' + nf(l[1]) + '</td><td>' + (l[2] ? nf(l[2]) : '–') + '</td><td>' + d2(l[3]) + '</td><td>' + d2(l[4]) + '</td></tr>';
      }).join('');
      return '<section class="card"><h2>Lactancias</h2><div class="scroll"><table class="htbl"><thead><tr><th>N°</th><th>Litros</th><th>305 días</th><th>% G</th><th>% P</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        (h.vit ? '<p class="cap">Producción vitalicia: <b>' + nf(h.vit) + ' lts</b></p>' : '') + '</section>';
    }

    function fichaBajaHTML(a) {
      var h = hist(a.key);
      var madre = h && h.ma ? (byRp(h.ma) ? '<button class="lnk" data-rp="' + esc(h.ma) + '">' + esc(h.ma) + '</button>' : esc(h.ma)) : null;
      var lp = h && h.pa.length ? h.pa[h.pa.length - 1] : null;
      var ls = h && h.ev.length ? h.ev[h.ev.length - 1] : null, lt = h && h.ta.length ? h.ta[h.ta.length - 1] : null;
      var codes = DB.codes || {};
      return '<button class="backbtn" data-a="back"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>Volver</button>' +
        '<header class="fh baja"><div class="fhtag">' + tagSVG(a.rp, 118, true) + '</div><div class="fhinfo"><div class="nm">' + esc(a.nombre || 'Sin nombre') + '</div>' +
        '<div class="fhchips">' + (a.cat ? '<span class="chip cat">' + CATL[a.cat] + '</span>' : '') + '<span class="chip ' + a.bTipo + '">' + BAJA[a.bTipo] + '</span></div></div></header>' +
        '<div class="bajabox"><b>' + esc(bajaTxt(a).toUpperCase()) + '</b>' + (a.bCausa ? '<span>Causa: ' + esc(a.bCausa) + '</span>' : '') + '</div>' +
        '<section class="card datos">' + kv([
          ['Último parto', lp ? A.fmt(lp[0]) + ' <small>parto ' + lp[1] + '</small>' : null],
          ['Último celo o servicio', ls ? A.fmt(ls[0]) + ' <small>' + (ls[1] === 'C' ? 'celo' : esc(ls[2] || 'servicio')) + '</small>' : null],
          ['Último tacto', lt ? A.fmt(lt[0]) + (codes[lt[1]] ? ' <small>' + esc(codes[lt[1]][0]) + '</small>' : '') : null]
        ]) + '</section>' +
        (h && h.ct.length ? '<section class="card"><h2>Control lechero</h2>' + bars(h.ct.slice(-10).reverse().map(function (c) { return c[1]; })) + '</section>' : '') +
        (h ? lactHTML(h) + (h.pa.length || h.ev.length || h.ta.length ? histHTML(a, h) : '') : '') +
        (h && h.corto ? '<p class="hint">Baja de hace más de 2 años: la app guarda solo los datos básicos. El historial completo está en SysCaw.</p>' : h && h.ult ? '<p class="hint">De las bajas se guarda solo la última lactancia. El historial completo está en SysCaw.</p>' : '') +
        '<section class="card"><h2>Identificación</h2>' + kv([['RP', esc(a.rp)], ['Origen', esc(a.nombre)], ['Nacimiento', h && h.fn ? A.fmt(h.fn) : null], ['Madre (RP)', madre], ['Padre', h && h.pd ? esc(h.pd) : null]], 'kvs') + '</section>' +
        '<p class="src">Respaldo SysCaw' + (DB.fecha ? ' del ' + A.fmt(DB.fecha) : '') + '</p>';
    }
    function fichaHTML(a) {
      if (a.bTipo) return fichaBajaHTML(a);
      var t = today(), d = A.derive(a, t);
      var toro = a.toro ? (a.toro === '???..' ? 'Sin dato' : esc(a.toro)) : null;
      var tacto = null;
      if (a.tFecha || a.result) tacto = (a.tFecha ? A.fmt(a.tFecha) : '') + (a.result ? (a.tFecha ? ' <small>' : '') + esc(a.result) + (a.tFecha ? '</small>' : '') : '');
      else if (a.partoProb) tacto = 'Preñada <small>parto probable ' + A.fmt(a.partoProb) + '</small>';
      var h = hist(a.rp);
      var dLac = a.dLac != null && DB.fuente === 'syscaw' && a.pFecha ? A.diffDays(t, a.pFecha) : a.dLac;
      var torosLac = null;
      if (h) {
        var lp = h.pa.length ? h.pa[h.pa.length - 1][0] : '0000';
        var sl = h.ev.filter(function (e) { return e[1] === 'S' && e[0] > lp; });
        if (sl.length > 1) torosLac = sl.map(function (e) { return esc(e[2] || '?'); }).join(', ');
      }
      var datos = kv([
        ['Fecha de último parto', a.pFecha ? A.fmt(a.pFecha) : null],
        ['Días en lactancia', dLac != null ? nf(dLac) : null],
        ['Fecha del último servicio', a.sFecha ? A.fmt(a.sFecha) : null],
        ['Días del último servicio', a.sFecha ? String(A.diffDays(t, a.sFecha)) : null],
        ['Número de servicio', a.sN != null ? String(a.sN) : null],
        ['Toro', toro],
        [h && h.pa.length ? 'Toros en esta lactancia' : 'Toros usados', torosLac],
        ['Último tacto y resultado', tacto],
        ['Parto probable', a.estado === 'prenada' && d.partoProb ? A.fmt(d.partoProb) + (d.partoEstimado ? ' <small>estimado</small>' : '') : null],
        ['Secado', a.estado === 'prenada' && d.secado && (a.cat === 'vaca' || a.cat === 'seca' || !a.cat) ? A.fmt(d.secado) : null]
      ]);
      var madre = h && h.ma ? (byRp(h.ma) ? '<button class="lnk" data-rp="' + esc(h.ma) + '">' + esc(h.ma) + '</button>' : esc(h.ma)) : null;
      return '<button class="backbtn" data-a="back"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>Volver</button>' +
        '<header class="fh"><div class="fhtag">' + tagSVG(a.rp, 118) + '</div><div class="fhinfo"><div class="nm">' + esc(a.nombre || 'Sin nombre') + '</div>' +
        '<div class="fhchips">' + (a.cat && a.cat !== 'vaca' ? '<span class="chip cat">' + CATL[a.cat] + '</span>' : '') + chip(a) + (a.rech ? '<span class="chip descarte">Descarte programado</span>' : '') + '</div></div></header>' +
        (datos ? '<section class="card datos">' + datos + '</section>' : '') +
        (h && h.ct.length ? '<section class="card"><h2>Control lechero</h2>' + prodHistHTML(a, h) + '</section>' : (bars(a.pr || []) ? '<section class="card"><h2>Control lechero</h2>' + bars(a.pr) + '</section>' : '')) +
        (h ? lactHTML(h) + (h.pa.length || h.ev.length || h.ta.length ? histHTML(a, h) : '') : '') +
        '<section class="card"><h2>Identificación</h2>' + kv([['RP', esc(a.rp)], ['Origen', esc(a.nombre)], ['Id electrónica', esc(a.idElec)], ['Nacimiento', h && h.fn ? A.fmt(h.fn) : null], ['Madre (RP)', madre], ['Padre', h && h.pd ? esc(h.pd) : null], ['Rodeo', esc(a.rod)]], 'kvs') + '</section>' +
        (h ? '<p class="src">Historial del respaldo SysCaw' + (DB.fecha ? ' del ' + A.fmt(DB.fecha) : '') + '</p>' : '');
    }

    /* ----- render ----- */
    var NAVS = [
      ['buscar', 'Buscar', '<circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M15.5 15.5L21 21" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'],
      ['tareas', 'Tareas', '<path d="M5 6.5l2 2 3.5-4M5 14.5l2 2 3.5-4M14 7h6M14 15h6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'],
      ['rodeo', 'Rodeo', '<path d="M5 20V11M12 20V4M19 20v-6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>']
    ];
    function render() {
      var main = $('#main'), nav = $('#nav'), nombre = PERFIL.nombre || 'Libreta';
      $('#nombre').textContent = nombre;
      document.title = PERFIL.nombre ? 'Libreta ' + PERFIL.nombre : 'Libreta de vacas';
      $('#logo').innerHTML = PERFIL.logo ? '<img alt="" src="' + PERFIL.logo + '">' : tagSVG('', 30).replace(/<text.*?<\/text>/, '');
      $('#logo').className = 'logo' + (PERFIL.logo ? ' has' : '');
      if (!DB.animales.length) {
        $('#meta').textContent = 'Sin libreta cargada'; nav.hidden = true; $('#ubtn').hidden = true;
        main.innerHTML = emptyHTML(); return;
      }
      nav.hidden = false;
      $('#ubtn').hidden = !DB.unidades;
      if (DB.unidades) $('#ubtnTxt').textContent = nombreSel(DB.sel) + ' · cambiar';
      $('#meta').textContent = DB.animales.length + ' animales · ' + (DB.fuente === 'syscaw' ? 'respaldo SysCaw del ' + A.fmt(DB.fecha) : 'libreta del ' + A.fmt(DB.cargada)) + (state.persisted ? '' : ' (no se guarda en este navegador)');
      nav.innerHTML = '<div class="navin">' + NAVS.map(function (n) {
        return '<button class="nb" data-t="' + n[0] + '" aria-current="' + (!state.rp && state.tab === n[0] ? 'page' : 'false') + '"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">' + n[2] + '</svg><span>' + n[1] + '</span></button>';
      }).join('') + '</div>';
      if (state.rp) {
        var a = byRp(state.rp);
        if (a) { main.innerHTML = fichaHTML(a); return; }
        state.rp = null;
      }
      var err = state.error ? '<p class="error" role="alert">' + esc(state.error) + '</p>' : '';
      if (state.tab === 'tareas') main.innerHTML = err + tareasHTML();
      else if (state.tab === 'rodeo') main.innerHTML = err + rodeoHTML();
      else { main.innerHTML = err + buscarHTML(); updateResults(); }
    }

    /* ----- eventos ----- */
    document.addEventListener('click', function (e) {
      var row = e.target.closest('[data-rp]');
      if (row) { openFicha(row.getAttribute('data-rp')); return; }
      var el;
      if ((el = e.target.closest('[data-t]'))) { setTab(el.dataset.t); return; }
      if ((el = e.target.closest('[data-cat]'))) { state.cat = el.dataset.cat; state.filtro = 'todas'; state.n = 60; try { localStorage.setItem('libreta:cat', state.cat); } catch (x) {} render(); return; }
      if ((el = e.target.closest('[data-f]'))) { state.filtro = el.dataset.f; state.n = 60; render(); return; }
      if ((el = e.target.closest('[data-v]'))) { state.ventana = +el.dataset.v; render(); return; }
      if ((el = e.target.closest('[data-go]'))) { state.filtro = el.dataset.go; state.q = ''; state.n = 60; setTab('buscar'); return; }
      if ((el = e.target.closest('[data-k]'))) { state.abiertas[el.dataset.k] = !state.abiertas[el.dataset.k]; render(); return; }
      var b = e.target.closest('[data-a]'); if (!b) return;
      var a = b.dataset.a;
      if (a === 'load') $('#file').click();
      else if (a === 'back') back();
      else if (a === 'mas') { state.n += 60; updateResults(); }
      else if (a === 'ajustes') openSheet('Ajustes');
      else if (a === 'cerrar') closeSheet();
      else if (a === 'guardar') guardarSheet();
      else if (a === 'logo') $('#logoFile').click();
      else if (a === 'quitarlogo') { state.draft.logo = ''; paintLogoPreview(); }
      else if (a === 'cambiar') { closeSheet(); $('#file').click(); }
      else if (a === 'unidad') cambiarUnidad();
      else if (a === 'uok') cerrarUnidad(idsMarcados());
      else if (a === 'ucancel') cerrarUnidad(null);
    });
    document.addEventListener('input', function (e) {
      if (e.target.id === 'q') { state.q = e.target.value; updateResults(); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.target.id === 'q' && e.key === 'Enter') {
        var res = A.search(lista(), state.q).filter(function (a) { return matchFiltro(a, state.filtro); });
        if (!res.length) res = A.search(DB.animales, state.q);
        if (!res.length) res = A.search(DB.bajas || [], state.q);
        if (res.length) { e.target.blur(); openFicha(res[0].rp); }
      }
      if (e.target.id === 'inNombre' && e.key === 'Enter') guardarSheet();
      if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet();
      if (e.key === 'Escape' && !$('#sheetU').hidden) cerrarUnidad(null);
    });
    $('#file').addEventListener('change', function (e) { handleFile(e.target.files[0]); e.target.value = ''; });
    $('#logoFile').addEventListener('change', function (e) { procesarLogo(e.target.files[0]); e.target.value = ''; });
    $('#sheet').addEventListener('click', function (e) { if (e.target.id === 'sheet') closeSheet(); });

    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(function () {});
    var listo = loadAll();
    var desdeHash = function () { var m = /^#ficha-(b?\d+)$/.exec(location.hash); if (m && byRp(m[1])) state.rp = m[1]; };
    desdeHash(); render();
    listo.then(function (cambio) { if (cambio) { desdeHash(); render(); } });
  }
})(typeof window !== 'undefined' ? window : this);
