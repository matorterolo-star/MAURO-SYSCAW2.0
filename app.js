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
          if (ds <= ventana) secar.push({ a: a, dias: ds, fecha: d.secado });
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
    var state = { tab: 'buscar', q: '', filtro: 'todas', n: 60, rp: null, ventana: 183, abiertas: {}, error: '', persisted: true, draft: null };
    var $ = function (s) { return document.querySelector(s); };
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var today = function () { return A.ymd(new Date()); };
    var nf = function (n, d) { return n == null ? '' : Number(n).toLocaleString('es-UY', { maximumFractionDigits: d || 0 }); };
    var pct = function (n, t) { return t ? nf(n / t * 100, 1) + '%' : ''; };

    var LABEL = { prenada: 'Preñada', servida: 'Servida', vacia: 'Vacía', ciclando: 'Ciclando', apta: 'Apta', sin: 'Sin tacto', otro: 'Otros' };
    var ORDEN = ['prenada', 'servida', 'vacia', 'ciclando', 'apta', 'sin', 'otro'];

    /* ----- almacenamiento ----- */
    function loadAll() {
      try { var r = localStorage.getItem(KEY); if (r) { var o = JSON.parse(r); if (o && Array.isArray(o.animales)) DB = o; } } catch (e) { state.persisted = false; }
      try { var p = localStorage.getItem(KEYP); if (p) { var q = JSON.parse(p); if (q) PERFIL = { nombre: q.nombre || '', logo: q.logo || '' }; } } catch (e) {}
    }
    function saveDB() { try { localStorage.setItem(KEY, JSON.stringify(DB)); state.persisted = true; } catch (e) { state.persisted = false; } }
    function savePerfil() { try { localStorage.setItem(KEYP, JSON.stringify(PERFIL)); } catch (e) {} }
    function byRp(rp) { for (var i = 0; i < DB.animales.length; i++) if (DB.animales[i].rp === rp) return DB.animales[i]; return null; }
    function toast(msg) {
      var t = $('#toast'); t.textContent = msg; t.classList.add('on');
      clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('on'); }, 3200);
    }

    /* ----- caravana (silueta con el número) ----- */
    function tagSVG(rp, w) {
      var s = String(rp), n = s.length, fs = n <= 3 ? 40 : n === 4 ? 34 : n === 5 ? 28 : 23;
      return '<svg class="eartag" width="' + w + '" height="' + Math.round(w * 1.3) + '" viewBox="0 0 100 130" role="img" aria-label="Caravana ' + esc(s) + '">' +
        '<path class="tg" d="M38 14 L62 14 L62 33 C62 46 96 42 96 60 L96 119 Q96 127 88 127 L12 127 Q4 127 4 119 L4 60 C4 42 38 46 38 33 Z"/>' +
        '<circle class="tbtn" cx="50" cy="13" r="11"/><circle class="tbtn2" cx="50" cy="13" r="6"/><circle class="tbtn3" cx="50" cy="13" r="2.4"/>' +
        '<text class="tgnum" x="50" y="' + (96 + fs * 0.18).toFixed(1) + '" text-anchor="middle" font-size="' + fs + '">' + esc(s) + '</text></svg>';
    }

    /* ----- archivo ----- */
    function nombreDesdeArchivo(f) {
      var n = f.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\b(copia de|libreta|syscaw|sys caw)\b/gi, '').replace(/[-]+/g, ' ').replace(/\s+/g, ' ').trim();
      return n;
    }
    function handleFile(f) {
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var res = A.parseLibreta(root.XLSX, fr.result);
          DB = { animales: res.animales, cargada: today(), archivo: f.name };
          saveDB(); state.q = ''; state.rp = null; state.error = ''; state.filtro = 'todas'; state.tab = 'buscar';
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
      var m = /^#ficha-(\d+)$/.exec(location.hash);
      state.rp = m && byRp(m[1]) ? m[1] : null; render();
    });

    /* ----- piezas comunes ----- */
    function labelOf(a) { return a.celo ? 'Preñada + celo' : a.estado === 'otro' ? (a.result || 'Otro') : LABEL[a.estado]; }
    function chip(a) { return '<span class="chip ' + a.estado + '">' + esc(labelOf(a)) + '</span>'; }
    function subDefault(a) {
      var d = A.derive(a, today()), sub = '';
      if (a.estado === 'prenada' && d.partoProb) sub = (d.partoEstimado ? 'Parto estimado ' : 'Parto probable ') + A.fmt(d.partoProb);
      else if (a.tFecha) sub = 'Tacto ' + A.fmt(a.tFecha);
      else if (a.sFecha) sub = (/^celo/i.test(a.toro || '') ? 'Celo ' : 'Servicio ') + A.fmt(a.sFecha);
      return esc(sub) + (a.rech ? ' <span class="dsc">Descarte</span>' : '');
    }
    function rowHTML(a, o) {
      o = o || {};
      return '<button class="row" data-rp="' + esc(a.rp) + '">' + tagSVG(a.rp, 54) +
        '<span class="who">' + esc(a.nombre || 'Sin nombre') + '</span>' +
        '<span class="rt">' + (o.right != null ? o.right : chip(a)) + '</span>' +
        '<span class="sub">' + (o.sub != null ? o.sub : subDefault(a)) + '</span></button>';
    }
    function emptyHTML() {
      return '<section class="empty"><div class="emptytag">' + tagSVG('0000', 64) + '</div><h2>Cargá tu libreta</h2>' +
        '<p>Elegí el archivo Excel (.xls o .xlsx) exportado de SysCaw. Se lee en este teléfono y no se sube a ningún servidor.</p>' +
        (state.error ? '<p class="error" role="alert">' + esc(state.error) + '</p>' : '') +
        '<button class="btn primary big" data-a="load">Elegir archivo</button></section>';
    }
    function matchFiltro(a, f) { return f === 'todas' || (f === 'descarte' ? !!a.rech : f === 'pcelo' ? !!a.celo : a.estado === f); }
    function numRp(a, b) { return a.rp.localeCompare(b.rp, 'es', { numeric: true }); }
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
      var c = A.conteo(DB.animales), nDesc = DB.animales.filter(function (a) { return a.rech; }).length;
      var fl = [['todas', 'Todas', DB.animales.length]];
      ORDEN.forEach(function (k) { if (c[k]) fl.push([k, k === 'prenada' ? 'Preñadas' : k === 'servida' ? 'Servidas' : k === 'vacia' ? 'Vacías' : LABEL[k], c[k]]); });
      var nCelo = DB.animales.filter(function (a) { return a.celo; }).length;
      if (nCelo) fl.push(['pcelo', 'Preñada + celo', nCelo]);
      if (nDesc) fl.push(['descarte', 'Descarte', nDesc]);
      return '<div class="searchbox"><label class="sr" for="q">Caravana o nombre</label>' +
        '<svg class="mag" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M15.5 15.5L21 21" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>' +
        '<input id="q" type="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Caravana o nombre" value="' + esc(state.q) + '"></div>' +
        '<div class="filters" role="group" aria-label="Filtrar por estado">' + fl.map(function (f) {
          return '<button class="fchip ' + f[0] + '" data-f="' + f[0] + '" aria-pressed="' + (state.filtro === f[0]) + '">' + f[1] + ' <b>' + f[2] + '</b></button>';
        }).join('') + '</div><div id="results"></div>';
    }
    function updateResults() {
      var box = $('#results'); if (!box) return;
      var q = state.q.trim(), f = state.filtro, html = '', list;
      if (q) {
        list = A.search(DB.animales, q).filter(function (a) { return matchFiltro(a, f); });
        html = list.length
          ? '<h2 class="h">' + list.length + (list.length === 1 ? ' resultado' : ' resultados') + '</h2>' + list.slice(0, 40).map(function (a) { return rowHTML(a); }).join('')
          : '<p class="hint">No hay animales con "' + esc(q) + '"' + (f !== 'todas' ? ' en este filtro' : '') + '. Probá con otra caravana o con parte del nombre.</p>';
        if (list.length > 40) html += '<p class="hint">Mostrando 40. Escribí más para acotar.</p>';
      } else if (f !== 'todas') {
        list = ordenar(DB.animales.filter(function (a) { return matchFiltro(a, f); }), f);
        var tit = f === 'prenada' ? 'por fecha de parto' : f === 'servida' ? 'servicio más antiguo primero' : f === 'descarte' ? 'descarte programado' : f === 'pcelo' ? 'preñadas con celo registrado' : '';
        html = '<h2 class="h">' + list.length + ' vacas' + (tit ? ', ' + tit : '') + '</h2>' + list.slice(0, state.n).map(function (a) { return rowHTML(a); }).join('');
        if (list.length > state.n) html += '<button class="btn more" data-a="mas">Mostrar más (' + (list.length - state.n) + ' restantes)</button>';
      } else {
        html = '<p class="hint">Escribí la caravana de la vaca, o tocá un estado para ver la lista.</p>';
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
      var t = A.tareas(DB.animales, today(), state.ventana), vtxt = (VENT.filter(function (v) { return v[0] === state.ventana; })[0] || [0, ''])[1];
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
    function rodeoHTML() {
      var r = A.resumen(DB.animales, today()), c = r.conteo;
      var seg = ORDEN.filter(function (k) { return c[k]; }).map(function (k) {
        return '<span class="seg ' + k + '" style="flex:' + c[k] + '" title="' + LABEL[k] + '"></span>';
      }).join('');
      var leg = ORDEN.filter(function (k) { return c[k]; }).map(function (k) {
        return '<button class="lg" data-go="' + k + '"><i class="dot ' + k + '"></i><span class="ln">' + (k === 'prenada' ? 'Preñadas' : k === 'servida' ? 'Servidas' : k === 'vacia' ? 'Vacías' : k === 'otro' ? 'Otros' : LABEL[k]) + '</span><b>' + c[k] + '</b><span class="pc">' + pct(c[k], r.total) + '</span></button>';
      }).join('');
      var nPc = DB.animales.filter(function (a) { return a.celo; }).length;
      if (nPc) leg += '<button class="lg" data-go="pcelo"><i class="dot prenada"></i><span class="ln">Preñada + celo</span><b>' + nPc + '</b><span class="pc">' + pct(nPc, r.total) + '</span></button>';
      if (r.descarte) leg += '<button class="lg" data-go="descarte"><i class="dot descarte"></i><span class="ln">Descarte programado</span><b>' + r.descarte + '</b><span class="pc">' + pct(r.descarte, r.total) + '</span></button>';
      var rod = r.rodeos.length > 1 ? '<section class="card"><h2>Por rodeo</h2><table class="tbl"><thead><tr><th>Rodeo</th><th>Vacas</th><th>Preñadas</th></tr></thead><tbody>' + r.rodeos.map(function (x) {
        return '<tr><td>' + esc(x.rod) + '</td><td>' + x.n + '</td><td>' + x.pren + ' <small>' + pct(x.pren, x.n) + '</small></td></tr>';
      }).join('') + '</tbody></table></section>' : '';
      var aviso = r.antes ? '<p class="secnote warnnote">' + r.antes + ' preñadas tienen el parto probable vencido.</p>' : '';
      return '<h1 class="ptitle">Rodeo</h1>' +
        '<section class="card"><h2>' + nf(r.total) + ' animales</h2><div class="comp" role="img" aria-label="Composición del rodeo por estado">' + seg + '</div><div class="legend">' + leg + '</div></section>' +
        '<section class="card"><h2>Partos probables por mes</h2>' + mesesChart(r.meses) + aviso + (r.despues ? '<p class="cap">Además, ' + r.despues + ' después de ese período.</p>' : '') + '</section>' +
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
    function fichaHTML(a) {
      var t = today(), d = A.derive(a, t);
      var toro = a.toro ? (a.toro === '???..' ? 'Sin dato' : esc(a.toro)) : null;
      var tacto = null;
      if (a.tFecha || a.result) tacto = (a.tFecha ? A.fmt(a.tFecha) : '') + (a.result ? (a.tFecha ? ' <small>' : '') + esc(a.result) + (a.tFecha ? '</small>' : '') : '');
      else if (a.partoProb) tacto = 'Preñada <small>parto probable ' + A.fmt(a.partoProb) + '</small>';
      var datos = kv([
        ['Fecha de último parto', a.pFecha ? A.fmt(a.pFecha) : null],
        ['Días en lactancia', a.dLac != null ? nf(a.dLac) : null],
        ['Fecha del último servicio', a.sFecha ? A.fmt(a.sFecha) : null],
        ['Días del último servicio', a.sFecha ? String(A.diffDays(t, a.sFecha)) : null],
        ['Número de servicio', a.sN != null ? String(a.sN) : null],
        ['Toro', toro],
        ['Último tacto y resultado', tacto]
      ]);
      return '<button class="backbtn" data-a="back"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>Volver</button>' +
        '<header class="fh"><div class="fhtag">' + tagSVG(a.rp, 118) + '</div><div class="fhinfo"><div class="nm">' + esc(a.nombre || 'Sin nombre') + '</div>' +
        '<div class="fhchips">' + chip(a) + (a.rech ? '<span class="chip descarte">Descarte programado</span>' : '') + '</div></div></header>' +
        '<section class="card datos">' + datos + '</section>' +
        (bars(a.pr) ? '<section class="card"><h2>Control lechero</h2>' + bars(a.pr) + '</section>' : '') +
        '<section class="card"><h2>Identificación</h2>' + kv([['RP', esc(a.rp)], ['Origen', esc(a.nombre)], ['Id electrónica', esc(a.idElec)]], 'kvs') + '</section>';
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
        $('#meta').textContent = 'Sin libreta cargada'; nav.hidden = true;
        main.innerHTML = emptyHTML(); return;
      }
      nav.hidden = false;
      $('#meta').textContent = DB.animales.length + ' animales · libreta del ' + A.fmt(DB.cargada) + (state.persisted ? '' : ' (no se guarda en este navegador)');
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
    });
    document.addEventListener('input', function (e) {
      if (e.target.id === 'q') { state.q = e.target.value; updateResults(); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.target.id === 'q' && e.key === 'Enter') {
        var res = A.search(DB.animales, state.q).filter(function (a) { return matchFiltro(a, state.filtro); });
        if (res.length) { e.target.blur(); openFicha(res[0].rp); }
      }
      if (e.target.id === 'inNombre' && e.key === 'Enter') guardarSheet();
      if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet();
    });
    $('#file').addEventListener('change', function (e) { handleFile(e.target.files[0]); e.target.value = ''; });
    $('#logoFile').addEventListener('change', function (e) { procesarLogo(e.target.files[0]); e.target.value = ''; });
    $('#sheet').addEventListener('click', function (e) { if (e.target.id === 'sheet') closeSheet(); });

    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(function () {});
    loadAll();
    (function () { var m = /^#ficha-(\d+)$/.exec(location.hash); if (m && byRp(m[1])) state.rp = m[1]; })();
    render();
  }
})(typeof window !== 'undefined' ? window : this);
