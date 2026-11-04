/* © Dr. Mauro Torterolo — Libreta de vacas. Todos los derechos reservados. Uso exclusivo de sus clientes. */
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
    // ID electrónico: se busca por sus últimos 8 números (desde 5 dígitos escritos)
    var qd = q.replace(/\s+/g, ''); if (!/^\d{5,8}$/.test(qd)) qd = null;
    animales.forEach(function (a) {
      var n = a._n || (a._n = norm(a.nombre)), score = 0;
      if (a.rp === q) score = 100;
      else if (a.rp.indexOf(q) === 0) score = 80;
      else if (qd && a.idElec && a.idElec.slice(-8) === qd) score = 95;
      else if (qd && a.idElec && a.idElec.slice(-8).indexOf(qd) === 0) score = 70;
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
          if (ds <= ventana && a.cat !== 'vaquillona' && a.cat !== 'seca') secar.push({ a: a, dias: ds, fecha: d.secado });
          if (dp <= ventana) partos.push({ a: a, dias: dp, fecha: d.partoProb });
        }
      }
    });
    tactar.sort(function (x, y) { return y.dias - x.dias; });
    secar.sort(function (x, y) { return x.dias - y.dias; });
    partos.sort(function (x, y) { return x.dias - y.dias; });
    return { tactar: tactar, secar: secar, partos: partos };
  }
  // Proyección del rodeo adulto a mitad de cada mes: en ordeñe, secas (secado hasta 30 días antes del parto) y preparto (30 días antes del parto).
  // Vaquillonas preñadas entran al preparto 30 días antes del parto y después pasan a ordeñe. No descuenta descartes ni muertes.
  var PREPARTO = 30;
  // lim: última fecha de parto que ya está confirmada por tacto (fecha de los datos + gestación - días hasta el diagnóstico)
  function proyeccion(animales, hoy, nMeses, lim) {
    var y = +hoy.slice(0, 4), m = +hoy.slice(5, 7) - 1, out = [];
    var info = animales.map(function (a) {
      var d = derive(a, hoy), P = a.estado === 'prenada' && d.partoProb && d.partoProb >= hoy ? d.partoProb : null;
      return { a: a, P: P, S: P ? addDays(P, -SECADO) : null, R: P ? addDays(P, -PREPARTO) : null };
    });
    for (var i = 0; i < (nMeses || 12); i++) {
      var yy = y + Math.floor((m + i) / 12), mm = (m + i) % 12, D = i === 0 ? hoy : yy + '-' + pad(mm + 1) + '-15';
      var r = { label: MESES[mm], anio: yy, ord: 0, sec: 0, pre: 0, preQ: 0, delS: 0, delN: 0, okPre: !lim || addDays(D, PREPARTO) <= lim, okSec: !lim || addDays(D, SECADO) <= lim };
      // días en leche promedio de las vacas en ordeñe ese día (desde el último parto, o el parto probable si ya parió)
      var dl = function (f) { if (f && f <= D) { r.delS += diffDays(D, f); r.delN++; } };
      info.forEach(function (x) {
        var c = x.a.cat || 'vaca';
        if (c === 'ternera') return;
        if (c === 'vaquillona') {
          if (!x.P || D < x.R) return;
          if (D < x.P) { r.pre++; r.preQ++; } else { r.ord++; dl(x.P); }
          return;
        }
        if (!x.P) { if (c === 'seca') r.sec++; else { r.ord++; dl(x.a.pFecha); } return; }
        if (D >= x.P) { r.ord++; dl(x.P); }
        else if (D >= x.R) r.pre++;
        else if (D >= x.S || c === 'seca') r.sec++;
        else { r.ord++; dl(x.a.pFecha); }
      });
      out.push(r);
    }
    return out;
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

  /* ---------- reproducción cada 21 días ----------
     animales: [{ h: historial, salida: fecha de baja o null }]; esPren(codigoTacto) -> bool
     Apta en un ciclo: vaca con al menos un parto (no vaquillonas), que cumple el período de espera voluntario
     antes de terminar el ciclo, sin preñez al inicio del ciclo, no marcada como descarte programado antes
     del inicio del ciclo y en el rodeo a mitad del ciclo.
     Tasa de servicio = aptas servidas / aptas; tasa de preñez = aptas que se preñan en el ciclo / aptas;
     tasa de concepción = servicios que preñaron / servicios con resultado conocido (de todas las vacas). */
  function ciclos21(animales, esPren, inicio, pev, ref) {
    var C = [], ultTacto = '0000';
    animales.forEach(function (x) { if (x.h && x.h.ta) x.h.ta.forEach(function (t) { if (t[0] > ultTacto && t[0] <= ref) ultTacto = t[0]; }); });
    // un ciclo está cerrado cuando el último tacto del rodeo es al menos 28 días posterior al fin del ciclo
    for (var c = inicio, k = 1; c <= ref; c = addDays(c, 21), k++) C.push({ n: k, ini: c, fin: addDays(c, 20), mid: addDays(c, 10), aptas: 0, serv: 0, pren: 0, sOk: 0, sMal: 0, sPend: 0, cerrado: addDays(c, 20 + 28) <= ultTacto });
    C.ultTacto = ultTacto; C.svs = [];
    animales.forEach(function (x) {
      var h = x.h; if (!h || !h.pa || !h.pa.length) return;
      var pa = h.pa, servs = h.ev.filter(function (e) { return e[1] === 'S'; });
      // fecha de concepción de cada lactancia
      var lac = pa.map(function (p, i) {
        var np = pa[i + 1] || null, conc = null, hasta = np ? np[0] : '9999';
        var sv = servs.filter(function (e) { return e[0] > p[0] && e[0] < hasta; });
        if (np) {
          conc = np[4] || null;
          if (!conc) { var est = addDays(np[0], -GEST), best = null; sv.forEach(function (e) { var d = Math.abs(diffDays(e[0], est)); if (d <= 15 && (!best || d < best[1])) best = [e[0], d]; }); conc = best ? best[0] : est; }
        } else {
          var pos = h.ta.filter(function (t) { return t[0] > p[0] && esPren(t[1]); });
          if (pos.length) { var T = pos[pos.length - 1][0], antes = sv.filter(function (e) { return e[0] <= T; }); conc = antes.length ? antes[antes.length - 1][0] : null; }
        }
        var neg = h.ta.filter(function (t) { return t[0] > p[0] && t[0] < hasta && !esPren(t[1]); }).map(function (t) { return t[0]; });
        return { p: p[0], np: np ? np[0] : null, conc: conc, sv: sv, neg: neg };
      });
      C.forEach(function (cy) {
        // lactancia en curso al inicio del ciclo
        var L = null; lac.forEach(function (l) { if (l.p <= cy.ini) L = l; });
        if (!L) return;
        // servicios del ciclo y su resultado
        L.sv.forEach(function (e, i) {
          if (e[0] < cy.ini || e[0] > cy.fin) return;
          if (L.conc) { if (e[0] === L.conc) { cy.sOk++; C.svs.push({ f: e[0], toro: e[2] || '', ins: e[3] || '', r: 'ok' }); } else if (e[0] < L.conc) { cy.sMal++; C.svs.push({ f: e[0], toro: e[2] || '', ins: e[3] || '', r: 'mal' }); } return; }
          var luego = L.sv[i + 1] || L.neg.some(function (d) { return d > e[0] && diffDays(d, e[0]) >= 25; });
          // no retorno: solo cuenta si pasaron al menos 24 días desde el servicio (si no, todavía no pudo repetir)
          if (diffDays(ref, e[0]) < 24) return;
          if (luego) cy.sMal++; else cy.sPend++;
          C.svs.push({ f: e[0], toro: e[2] || '', ins: e[3] || '', r: luego ? 'mal' : 'pend' });
        });
        // servida en un ciclo anterior y todavía sin resultado (sin tacto vacía ni nuevo servicio): no es apta
        // hasta que se la vuelva a servir; si después el tacto da vacía, cuenta para atrás
        var prev = null; L.sv.forEach(function (e) { if (e[0] < cy.ini) prev = e[0]; });
        var pendiente = prev && !L.conc && !L.sv.some(function (e) { return e[0] > prev; }) && !L.neg.some(function (d) { return d > prev && diffDays(d, prev) >= 25; });
        var apta = !pendiente && diffDays(cy.fin, L.p) >= pev && (!L.conc || L.conc >= cy.ini) && (!x.salida || x.salida > cy.mid) && !(x.desc && x.desc <= cy.ini);
        if (!apta) return;
        cy.aptas++;
        if (L.sv.some(function (e) { return e[0] >= cy.ini && e[0] <= cy.fin; })) cy.serv++;
        if (L.conc && L.conc >= cy.ini && L.conc <= cy.fin) cy.pren++;
      });
    });
    return C;
  }
  function setSecado(n) { SECADO = n; api.SECADO = n; }
  /* ===== índice del tambo: reproducción (70%) + leche (30%), comparado contra el propio tambo ===== */
  var IDX_W = { da: 30, spc: 15, pc: 10, pe: 15, le: 30 };
  function idxMedia(v) { var s = 0; v.forEach(function (x) { s += x; }); return v.length ? s / v.length : null; }
  function idxDesv(v, m) { if (v.length < 2) return null; var s = 0; v.forEach(function (x) { s += (x - m) * (x - m); }); return Math.sqrt(s / (v.length - 1)); }
  function idxZ(x, m, sd) { if (x == null || !sd) return null; var z = (x - m) / sd; return Math.max(-3, Math.min(3, z)); }
  // animales: vacas y secas activas; hist por caravana; esPren(código de tacto) -> bool; ref: fecha del respaldo
  // pérdidas de gestación: preñez confirmada por tacto y después tacto vacía, nuevo servicio (más de 20 días después) o aborto, antes del parto
  function perdidas(h, esPren, esVac) {
    var out = { n: 0, gest: 0, fechas: [] };
    var cortes = ['0000'].concat(h.pa.map(function (p) { return p[0]; })).concat(['9999']);
    var abs = (h.ab || []).concat(h.pa.filter(function (p) { return /^A/.test(p[2] || ''); }).map(function (p) { return p[0]; }));
    for (var i = 0; i < cortes.length - 1; i++) {
      var a0 = cortes[i], a1 = cortes[i + 1];
      var ta = h.ta.filter(function (t) { return t[0] > a0 && t[0] < a1; }), sv = h.ev.filter(function (e) { return e[1] === 'S' && e[0] > a0 && e[0] < a1; });
      var abT = abs.filter(function (f) { return f > a0 && f <= a1; }), usados = {};
      var desde = a0;
      while (true) {
        var pos = ta.filter(function (t) { return t[0] > desde && esPren(t[1]); })[0];
        if (!pos) break;
        out.gest++;
        var T = pos[0];
        var neg = ta.filter(function (t) { return t[0] > T && esVac(t[1]); })[0];
        var rs = sv.filter(function (e) { return diffDays(e[0], T) > 20; })[0];
        var ab = abT.filter(function (f) { return f > T; })[0];
        var fin = [neg && neg[0], rs && rs[0], ab].filter(Boolean).sort()[0];
        if (!fin) break;
        out.n++; out.fechas.push(fin); if (ab) usados[ab] = 1;
        desde = fin;
      }
      // abortos cargados sin tacto previo
      abT.forEach(function (f) { if (!usados[f] && out.fechas.indexOf(f) < 0 && !out.fechas.some(function (x) { return Math.abs(diffDays(x, f)) < 60; })) { out.n++; out.gest++; out.fechas.push(f); } });
    }
    return out;
  }
  // Línea de vida del tambo: promedios de las etapas de la vaca, con lo que pasó en los últimos 2 años
  // L: [{ h: historia, baja: fecha de baja o null }]
  function lineaVida(L, esPren, ref) {
    var minEv = '9999', d24 = addDays(ref, -730), d12 = addDays(ref, -365);
    L.forEach(function (x) { var h = x.h; if (h && h.ev && h.ev.length && h.ev[0][0] < minEv) minEv = h.ev[0][0]; });
    var desdeOk = addDays(minEv, 60); // eventos con registros de servicios completos
    var mes = function (d) { return d / 30.44; };
    var Z = { e1s: [], spcV: [], ePren: [], e1p: [], l1: { pc: [], da: [], spc: [], n: 0, pren: 0 }, la: { pc: [], da: [], spc: [], n: 0, pren: 0 }, iep: [], salEdad: [], salLac: [], seca: [], gP: [], gM: [] };
    // fecha de concepción de un tramo: el servicio que cuadra con el parto siguiente (±15 días) o el último antes del tacto positivo
    var concDe = function (sv, h, desde, np) {
      if (np) {
        var est = addDays(np[0], -GEST), best = null;
        sv.forEach(function (e) { var d = Math.abs(diffDays(e[0], est)); if (d <= 15 && (!best || d < best[1])) best = [e[0], d]; });
        return best ? best[0] : null;
      }
      var pos = (h.ta || []).filter(function (t) { return t[0] > desde && esPren(t[1]); });
      if (!pos.length) return null;
      var T = pos[pos.length - 1][0], an = sv.filter(function (e) { return e[0] <= T; });
      return an.length ? an[an.length - 1][0] : null;
    };
    L.forEach(function (x) {
      var h = x.h; if (!h) return;
      var pa = (h.pa || []).filter(function (p) { return p[0]; }), ev = h.ev || [], S = ev.filter(function (e) { return e[1] === 'S'; });
      var fn = h.fn && h.fn > '1980' ? h.fn : null;
      // recría: hasta el primer parto
      var p1 = pa.length && pa[0][1] === 1 ? pa[0] : null, tieneP = pa.length > 0;
      if (!tieneP || p1) {
        var svq = S.filter(function (e) { return !p1 || e[0] < p1[0]; });
        if (fn && svq.length && svq[0][0] >= desdeOk && svq[0][0] >= d24) { var e1 = mes(diffDays(svq[0][0], fn)); if (e1 > 8 && e1 < 40) Z.e1s.push(e1); }
        var cq = svq.length && svq[0][0] >= desdeOk ? concDe(svq, h, svq[0][0], p1) : null;
        if (cq && cq >= d24 && !(x.baja && !p1 && x.baja < cq)) {
          Z.spcV.push(Math.min(svq.filter(function (e) { return e[0] <= cq; }).length, 6));
          if (fn) { var ep = mes(diffDays(cq, fn)); if (ep > 8 && ep < 40) Z.ePren.push(ep); }
        }
        if (p1 && fn && p1[0] >= d24) { var ea = mes(diffDays(p1[0], fn)); if (ea > 17 && ea < 50) Z.e1p.push(ea); }
      }
      // lactancias: parto a servicio, parto a preñez, servicios por preñez
      pa.forEach(function (p, i) {
        var np = pa[i + 1];
        if (np && np[0] >= d24 && p[0] >= desdeOk) { var iv = diffDays(np[0], p[0]); if (iv > 300 && iv < 800) Z.iep.push(iv); }
        // días seca: del cierre de la lactancia (SysCaw) al parto siguiente
        if (np && np[0] >= d24 && p[5] && p[5] < np[0]) { var ds = diffDays(np[0], p[5]); if (ds >= 10 && ds <= 200) Z.seca.push(ds); }
        // largo de gestación: fecha de servicio que SysCaw asigna al parto; primíparas y multíparas
        if (p[0] >= d24 && p[4] && p[4] < p[0] && !/^A/.test(p[2] || '')) { var gl = diffDays(p[0], p[4]); if (gl >= 260 && gl <= 300) ((p[1] || i + 1) === 1 ? Z.gP : Z.gM).push(gl); }
        if (p[0] < d24 || p[0] < desdeOk) return;
        var G = (p[1] || i + 1) === 1 ? Z.l1 : Z.la, hasta = np ? np[0] : '9999';
        // mismas reglas que el índice: primer celo o servicio, concepción estimada con el parto siguiente, vacías de 150 días o más penalizan
        var evs = ev.filter(function (e) { return e[0] > p[0] && e[0] < hasta; }), sv = evs.filter(function (e) { return e[1] === 'S'; });
        var abierta = diffDays(x.baja && x.baja < ref ? x.baja : ref, p[0]);
        if (evs.length) { var pc = diffDays(evs[0][0], p[0]); if (pc > 0) G.pc.push(Math.min(pc, 150)); }
        var c = concDe(sv, h, p[0], np), estim = false;
        if (!c && np) { c = addDays(np[0], -GEST); estim = true; }
        var da = null, spc = null;
        if (c) { da = diffDays(c, p[0]); spc = estim ? null : sv.filter(function (e) { return e[0] <= c; }).length || null; }
        else if (abierta >= 150) { da = abierta; spc = sv.length + 1; }
        if (c || abierta >= 150) { G.n++; if (c) G.pren++; }
        if (da != null && da > 0) G.da.push(Math.min(da, 300));
        if (spc) G.spc.push(Math.min(spc, 6));
      });
      // salida del rodeo: vacas adultas dadas de baja en los últimos 12 meses
      if (x.baja && x.baja >= d12 && x.baja <= ref && pa.length && pa[0][0] <= x.baja) {
        if (fn) { var ey = diffDays(x.baja, fn) / 365.25; if (ey > 1.5 && ey < 20) Z.salEdad.push(ey); }
        var nl = Math.max.apply(null, pa.map(function (p) { return p[1] || 0; })); if (nl > 0) Z.salLac.push(nl);
      }
    });
    var m = function (v) { return v.length ? idxMedia(v) : null; };
    var et = function (G) { return { pc: m(G.pc), nPc: G.pc.length, da: m(G.da), spc: m(G.spc), n: G.n, pren150: G.n ? G.pren / G.n : null }; };
    return {
      e1s: m(Z.e1s), nE1s: Z.e1s.length, spcV: m(Z.spcV), nSpcV: Z.spcV.length, ePren: m(Z.ePren), e1p: m(Z.e1p), nE1p: Z.e1p.length,
      l1: et(Z.l1), la: et(Z.la), iep: m(Z.iep), nIep: Z.iep.length, salEdad: m(Z.salEdad), salLac: m(Z.salLac), nSal: Math.max(Z.salEdad.length, Z.salLac.length), seca: m(Z.seca), nSeca: Z.seca.length, gP: m(Z.gP), nGP: Z.gP.length, gM: m(Z.gM), nGM: Z.gM.length,
      desde: d24
    };
  }
  function indice(animales, hist, esPren, ref, esVac) {
    esVac = esVac || function () { return false; };
    var minEv = '9999';
    animales.forEach(function (a) { var h = hist[a.rp]; if (h && h.ev.length && h.ev[0][0] < minEv) minEv = h.ev[0][0]; });
    var vacas = [], lacs = [], nPc = 0, nCelo = 0;
    animales.forEach(function (a) {
      var h = hist[a.rp]; if (!h || !h.pa.length) return;
      var V = { a: a, da: [], spc: [], pc: [], le: [], nLac: 0, detalle: [] };
      var PG = perdidas(h, esPren, esVac); V.perd = PG.n; V.gestConf = PG.gest; V.perdFechas = PG.fechas;
      // vaquillona (lactancia 0): servicios hasta la preñez que terminó en el primer parto
      var p1 = h.pa[0];
      if (p1 && p1[1] === 1 && p1[0] >= minEv) {
        var svq = h.ev.filter(function (e) { return e[1] === 'S' && e[0] < p1[0]; });
        var estq = addDays(p1[0], -GEST), bq = null;
        svq.forEach(function (e) { var d = Math.abs(diffDays(e[0], estq)); if (d <= 15 && (!bq || d < bq[1])) bq = [e[0], d]; });
        if (bq) { V.spcVaq = svq.filter(function (e) { return e[0] <= bq[0]; }).length; V.spc.push(Math.min(V.spcVaq, 6)); }
      }
      h.pa.forEach(function (p, i) {
        if (p[0] < minEv) return; // lactancias anteriores a los registros de servicios
        var np = h.pa[i + 1], hasta = np ? np[0] : '9999';
        var evs = h.ev.filter(function (e) { return e[0] > p[0] && e[0] < hasta; });
        var sv = evs.filter(function (e) { return e[1] === 'S'; });
        var conc = null, estimada = false;
        if (np) {
          var est = addDays(np[0], -GEST), best = null;
          sv.forEach(function (e) { var d = Math.abs(diffDays(e[0], est)); if (d <= 15 && (!best || d < best[1])) best = [e[0], d]; });
          if (best) conc = best[0]; else { conc = est; estimada = true; }
        } else {
          var pos = h.ta.filter(function (t) { return t[0] > p[0] && esPren(t[1]); });
          if (pos.length) { var T = pos[pos.length - 1][0], antes = sv.filter(function (e) { return e[0] <= T; }); if (antes.length) conc = antes[antes.length - 1][0]; }
        }
        var abierta = diffDays(ref, p[0]);
        var da = null, spc = null;
        if (conc) { da = diffDays(conc, p[0]); spc = estimada ? null : sv.filter(function (e) { return e[0] <= conc; }).length || null; }
        else if (!np && abierta >= 150) { da = abierta; spc = sv.length + 1; } // sigue vacía: se cuenta lo que lleva (penaliza)
        var pc = evs.length ? diffDays(evs[0][0], p[0]) : null;
        if (pc != null) { nPc++; if (evs[0][1] === 'C') nCelo++; }
        // topes para que una vaca muy extrema no desarme la escala del resto
        if (da != null && da > 0) { V.da.push(Math.min(da, 300)); V.nLac++; }
        if (spc) V.spc.push(Math.min(spc, 6));
        if (pc != null && pc > 0) V.pc.push(Math.min(pc, 150));
        var l = null; h.la.forEach(function (x) { if (x[0] === p[1]) l = x; });
        // leche: a 305 días; si la lactancia cerró antes de 305 días SysCaw no lo calcula y se usa su total. La lactancia en curso cuenta solo con 305 días cumplidos
        var lit305 = l ? (l[2] || (np ? l[1] : null)) : null;
        if (lit305) {
          // análisis de sólidos: los controles del respaldo cubren la lactancia actual y la anterior
          var nAn = null;
          if (h.ct && h.ct.length && i >= h.pa.length - 2) nAn = h.ct.filter(function (c) { return c[0] >= p[0] && c[0] < hasta && c[2] > 0 && c[3] > 0; }).length;
          var pctOk = l[3] >= 2 && l[3] <= 7 && l[4] >= 2 && l[4] <= 5.5;
          var r = { v: V, nro: p[1], lit: lit305, nAn: nAn, sol: pctOk ? lit305 * (l[3] + l[4]) / 100 : null };
          lacs.push(r); V.le.push(r);
        }
      });
      if (V.da.length && V.le.length) vacas.push(V); // hace falta al menos una lactancia con leche cerrada
    });
    // leche: kg de sólidos si casi todas las lactancias tienen grasa y proteína; si no, litros. Comparada dentro de 1ª, 2ª y 3ª o más lactancia
    // sólidos solo si el tambo hace análisis regular: la mayoría de las vacas con 4 o más controles con grasa y proteína
    var MIN_AN = 4;
    var conSol = lacs.filter(function (r) { return r.sol != null; }).length;
    var ultAn = vacas.map(function (V) { var k = null; V.le.forEach(function (r) { if (r.nAn != null) k = r.nAn; }); return k; }).filter(function (k) { return k != null; });
    var regulares = ultAn.filter(function (k) { return k >= MIN_AN; }).length;
    var usaSol = lacs.length > 0 && conSol / lacs.length >= 0.7 && ultAn.length > 0 && regulares / ultAn.length >= 0.5;
    // lactancias con pocos análisis: los sólidos se estiman con los litros y el % promedio del tambo
    var buenas = lacs.filter(function (r) { return r.sol != null && (r.nAn == null || r.nAn >= MIN_AN); });
    var pctT = buenas.length ? idxMedia(buenas.map(function (r) { return r.sol / r.lit * 100; })) : null;
    lacs.forEach(function (r) { if (pctT && (r.sol == null || (r.nAn != null && r.nAn < MIN_AN))) { r.sol = r.lit * pctT / 100; r.est = true; } });
    var grupos = { 1: [], 2: [], 3: [] };
    lacs.forEach(function (r) { r.val = usaSol ? r.sol : r.lit; if (r.val != null) grupos[Math.min(3, r.nro || 1)].push(r); });
    Object.keys(grupos).forEach(function (g) {
      var vs = grupos[g].map(function (r) { return r.val; }), m = idxMedia(vs), sd = idxDesv(vs, m);
      grupos[g].forEach(function (r) { r.z = idxZ(r.val, m, sd); });
    });
    // celos poco anotados: el dato parto–primer celo pesa menos
    var cobCelo = nPc ? nCelo / nPc : 0;
    var w = { da: IDX_W.da, spc: IDX_W.spc, pc: IDX_W.pc * Math.min(1, cobCelo / 0.5), pe: IDX_W.pe, le: IDX_W.le };
    var resto = IDX_W.pc - w.pc; w.da += resto * IDX_W.da / (IDX_W.da + IDX_W.spc); w.spc += resto * IDX_W.spc / (IDX_W.da + IDX_W.spc);
    vacas.forEach(function (V) {
      V.m = { da: idxMedia(V.da), spc: idxMedia(V.spc), pc: idxMedia(V.pc), pe: V.gestConf ? V.perd / V.gestConf : null };
      var zs = V.le.map(function (r) { return r.z; }).filter(function (z) { return z != null; });
      V.zle = zs.length ? idxMedia(zs) : null;
      V.mle = V.le.length ? idxMedia(V.le.map(function (r) { return r.val; }).filter(function (x) { return x != null; })) : null;
      V.mlit = V.le.length ? idxMedia(V.le.map(function (r) { return r.lit; })) : null;
      V.msol = V.le.length ? idxMedia(V.le.map(function (r) { return r.sol; }).filter(function (x) { return x != null; })) : null;
      V.nAn = null; V.solEst = false; V.le.forEach(function (r) { if (r.nAn != null) V.nAn = r.nAn; if (r.est) V.solEst = true; });
    });
    var ref0 = {};
    ['da', 'spc', 'pc', 'pe'].forEach(function (k) {
      var vs = vacas.map(function (V) { return V.m[k]; }).filter(function (x) { return x != null; }), m = idxMedia(vs);
      ref0[k] = { m: m, sd: idxDesv(vs, m) };
    });
    var zl = vacas.map(function (V) { return V.zle; }).filter(function (x) { return x != null; }), mzl = idxMedia(zl);
    ref0.le = { m: mzl, sd: idxDesv(zl, mzl) };
    var lit = vacas.map(function (V) { return V.mle; }).filter(function (x) { return x != null; });
    ref0.leProm = idxMedia(lit);
    ref0.litProm = idxMedia(vacas.map(function (V) { return V.mlit; }).filter(function (x) { return x != null; }));
    ref0.solProm = idxMedia(vacas.map(function (V) { return V.msol; }).filter(function (x) { return x != null; }));
    vacas.forEach(function (V) {
      V.z = { da: idxZ(V.m.da, ref0.da.m, ref0.da.sd), spc: idxZ(V.m.spc, ref0.spc.m, ref0.spc.sd), pc: idxZ(V.m.pc, ref0.pc.m, ref0.pc.sd), pe: idxZ(V.m.pe, ref0.pe.m, ref0.pe.sd), le: idxZ(V.zle, ref0.le.m, ref0.le.sd) };
      ['da', 'spc', 'pc', 'pe'].forEach(function (k) { if (V.z[k] != null) V.z[k] = -V.z[k]; }); // menos días / servicios es mejor
      var s = 0, sw = 0;
      Object.keys(w).forEach(function (k) { if (V.z[k] != null && w[k] > 0) { s += w[k] * V.z[k]; sw += w[k]; } });
      V.raw = sw ? s / sw : null;
    });
    vacas = vacas.filter(function (V) { return V.raw != null; });
    // vaca probada: con 1 lactancia evaluada el índice cuenta 60%, con 2 el 80% y desde 3 entero (el resto se acerca al promedio)
    var m0 = idxMedia(vacas.map(function (V) { return V.raw; }));
    vacas.forEach(function (V) { V.conf = V.nLac >= 3 ? 1 : V.nLac === 2 ? 0.8 : 0.6; V.raw = m0 + V.conf * (V.raw - m0); Object.keys(V.z).forEach(function (k) { if (V.z[k] != null) V.z[k] *= V.conf; }); });
    var rs = vacas.map(function (V) { return V.raw; }), mr = idxMedia(rs), sr = idxDesv(rs, mr) || 1;
    vacas.forEach(function (V) {
      V.idx = Math.round(100 + 10 * (V.raw - mr) / sr);
      // puntos que aporta cada dato al índice
      V.pts = {}; var sw = 0; Object.keys(w).forEach(function (k) { if (V.z[k] != null && w[k] > 0) sw += w[k]; });
      Object.keys(w).forEach(function (k) { V.pts[k] = V.z[k] != null && w[k] > 0 ? 10 * w[k] * V.z[k] / sw / sr : null; });
    });
    vacas.sort(function (x, y) { return y.raw - x.raw; });
    var n = vacas.length, k10 = Math.max(1, Math.round(n * 0.1)), por = {};
    vacas.forEach(function (V, i) {
      V.puesto = i + 1;
      V.mejorQue = n > 1 ? Math.round(vacas.filter(function (o) { return o.raw < V.raw; }).length / (n - 1) * 100) : null;
      V.tier = n >= 10 && i < k10 ? 'top' : n >= 10 && i >= n - k10 ? 'peor' : null;
      por[V.a.rp] = V;
    });
    var prom = { pe: ref0.pe.m, da: ref0.da.m, spc: ref0.spc.m, pc: ref0.pc.m, le: ref0.leProm, lit: ref0.litProm, sol: ref0.solProm };
    return { vacas: vacas, por: por, n: n, k10: k10, usaSol: usaSol, minAn: MIN_AN, hayAn: ultAn.length > 0, pesos: w, prom: prom, celoBajo: cobCelo < 0.5 };
  }
  var api = { MESES: MESES, indice: indice, lineaVida: lineaVida, ciclos21: ciclos21, setSecado: setSecado, proyeccion: proyeccion, PREPARTO: PREPARTO, parseLibreta: parseLibreta, derive: derive, search: search, conteo: conteo, tareas: tareas, resumen: resumen, fmt: fmt, rel: rel, diffDays: diffDays, addDays: addDays, ymd: ymd, GEST: GEST, SECADO: SECADO, DX_MIN: DX_MIN };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document !== 'undefined') initUI(api);

  /* ================= interfaz ================= */
  function initUI(A) {
    var KEY = 'libreta:v1', KEYP = 'libreta:perfil';
    var DB = { animales: [], cargada: null, archivo: '' };
    var PERFIL = { nombre: '', logo: '' };
    // varios tambos guardados en el teléfono: la lista va en localStorage y cada libreta en IndexedDB ('db:<id>')
    var KEYT = 'libreta:tambos';
    var TAMBOS = { activo: null, lista: [] };
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
    function idbDel(k) { return idb().then(function (db) { return new Promise(function (res) { var tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').delete(k); tx.oncomplete = function () { res(); }; tx.onerror = function () { res(); }; }); }, function () {}); }
    function dbKey(id) { return 'db:' + id; }
    function saveTambos() { try { localStorage.setItem(KEYT, JSON.stringify(TAMBOS)); } catch (e) {} }
    function tamboAct() { for (var i = 0; i < TAMBOS.lista.length; i++) if (TAMBOS.lista[i].id === TAMBOS.activo) return TAMBOS.lista[i]; return null; }
    function nuevoTambo(nombre) {
      var t = { id: 't' + Date.now().toString(36) + Math.floor(Math.random() * 1e3), nombre: nombre || '', logo: '' };
      TAMBOS.lista.push(t); return t;
    }
    function normNom(n) { return String(n || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
    function tamboPorNombre(n) { var k = normNom(n); if (!k) return null; for (var i = 0; i < TAMBOS.lista.length; i++) if (normNom(TAMBOS.lista[i].nombre) === k) return TAMBOS.lista[i]; return null; }
    // ajustes que dependen del tambo (inicio de ciclos, fecha de secado, categoría abierta)
    function getP(k) { var v = null; try { v = localStorage.getItem('libreta:' + k + ':' + TAMBOS.activo); if (v == null && TAMBOS.lista.length < 2) v = localStorage.getItem('libreta:' + k); } catch (e) {} return v; }
    function setP(k, v) { try { localStorage.setItem('libreta:' + k + ':' + TAMBOS.activo, v); } catch (e) {} }
    function leerDB(id) {
      return idbGet(dbKey(id)).then(function (o) { return o; }, function () { return null; }).then(function (o) {
        if (!o) { try { var r = localStorage.getItem(KEY + ':' + id); if (r) o = JSON.parse(r); } catch (e) {} }
        if (o && o.todos && !o.animales) o.animales = [];
        return o && Array.isArray(o.animales) ? o : null;
      });
    }
    // deja activo un tambo: carga su libreta y sus ajustes
    function abrirTambo(id) {
      TAMBOS.activo = id;
      var t = tamboAct() || { nombre: '', logo: '' };
      if (t.id) t.uso = Date.now();
      saveTambos();
      PERFIL = { nombre: t.nombre || '', logo: t.logo || '' };
      DB = { animales: [], cargada: null, archivo: '' };
      state.q = ''; state.rp = null; state.error = ''; state.filtro = 'todas'; state.n = 60; state.tab = 'buscar';
      state.ini21 = null; state.fsec = null; state.pev = null; state.abiertas = {};
      state.cat = 'todas';
      try { if (location.hash) location.hash = ''; } catch (e) {}
      return leerDB(id).then(function (o) { if (o && TAMBOS.activo === id) { DB = o; aplicarUnidad(); } return true; });
    }
    function loadAll() {
      try { var p = localStorage.getItem(KEYP); if (p) { var q = JSON.parse(p); if (q) PERFIL = { nombre: q.nombre || '', logo: q.logo || '' }; } } catch (e) {}
      try { var sc = +localStorage.getItem('libreta:secado'); if (SECS.indexOf(sc) >= 0) A.setSecado(sc); } catch (e) {}
      try { var t = JSON.parse(localStorage.getItem(KEYT)); if (t && Array.isArray(t.lista)) TAMBOS = t; } catch (e) {}
      if (TAMBOS.lista.length) {
        if (!tamboAct()) TAMBOS.activo = TAMBOS.lista[0].id;
        return abrirTambo(TAMBOS.activo);
      }
      // versión anterior (un solo tambo): se pasa a la lista de tambos sin perder nada
      var viejo = null;
      try { var r = localStorage.getItem(KEY); if (r) { viejo = JSON.parse(r); } } catch (e) { state.persisted = false; }
      return idbGet('db').then(function (o) { return o || viejo; }, function () { return viejo; }).then(function (o) {
        if (o && o.todos && !o.animales) o.animales = [];
        if (!o || !Array.isArray(o.animales) || !(o.animales.length || (o.todos && o.todos.length))) return false;
        var t = nuevoTambo(PERFIL.nombre); t.logo = PERFIL.logo;
        TAMBOS.activo = t.id;
        state.cat = 'todas';
        DB = o; aplicarUnidad();
        return saveDB().then(function () { idbDel('db'); try { localStorage.removeItem(KEY); } catch (e) {} return true; });
      });
    }
    function saveDB() {
      if (!tamboAct()) { TAMBOS.activo = nuevoTambo(PERFIL.nombre).id; }
      var t = tamboAct();
      DB.guardada = Date.now();
      t.n = DB.animales.length; t.fuente = DB.fuente; t.fecha = DB.fuente === 'syscaw' ? DB.fecha : DB.cargada; if (DB.idProd && DB.idProd.length) t.idp = DB.idProd;
      saveTambos();
      var g = DB, k = dbKey(t.id);
      if (DB.todos) { g = {}; Object.keys(DB).forEach(function (k) { if (k !== 'animales' && k !== 'bajas') g[k] = DB[k]; }); }
      return idbSet(k, g).then(function () {
        state.persisted = true; try { localStorage.removeItem(KEY + ':' + t.id); } catch (e) {}
      }, function () {
        try { localStorage.setItem(KEY + ':' + t.id, JSON.stringify(g)); state.persisted = true; } catch (e) { state.persisted = false; }
      }).then(function () { render(); });
    }
    function savePerfil() {
      var t = tamboAct(); if (t) { t.nombre = PERFIL.nombre; t.logo = PERFIL.logo; saveTambos(); }
      try { localStorage.setItem(KEYP, JSON.stringify(PERFIL)); } catch (e) {}
    }
    // a qué tambo va un archivo nuevo. 'nuevo' = agregar tambo; si no, el tambo abierto.
    // Si el respaldo es de otro tambo que ya está guardado, va a ese; si es de uno que no está, se agrega (nunca pisa otro tambo).
    function prepararDestino(nombre, idp) {
      var act = tamboAct(), igual = tamboPorNombre(nombre), cambio = '';
      // si el nombre no coincide, se busca por número de productor de SysCaw (solo si hay un único tambo con ese número)
      if (!igual && idp && idp.length) { var mm = TAMBOS.lista.filter(function (t) { return (t.idp || []).some(function (x) { return idp.indexOf(x) >= 0; }); }); if (mm.length === 1) igual = mm[0]; }
      if (igual) { if (!act || igual.id !== act.id) cambio = 'actualizado'; TAMBOS.activo = igual.id; }
      else if (state.destino === 'nuevo' || !act || (nombre && act.n && normNom(act.nombre) && normNom(act.nombre) !== normNom(nombre))) {
        var t = nuevoTambo(nombre); TAMBOS.activo = t.id; cambio = act && act.n ? 'nuevo' : '';
      }
      state.destino = null;
      var t2 = tamboAct();
      PERFIL = { nombre: t2.nombre || nombre || '', logo: t2.logo || '' };
      state.ini21 = null; state.fsec = null; state.pev = null;
      return cambio;
    }
    function quitarTambo(id) {
      var t = null; TAMBOS.lista.forEach(function (x) { if (x.id === id) t = x; });
      if (!t || !confirm('¿Quitar ' + (t.nombre || 'este tambo') + ' de este teléfono? Se borra su libreta; la podés volver a cargar con el respaldo.')) return;
      TAMBOS.lista = TAMBOS.lista.filter(function (x) { return x.id !== id; });
      idbDel(dbKey(id)); try { localStorage.removeItem(KEY + ':' + id); } catch (e) {}
      ['cat', 'ini21', 'fsec'].forEach(function (k) { try { localStorage.removeItem('libreta:' + k + ':' + id); } catch (e) {} });
      if (TAMBOS.activo === id) {
        if (TAMBOS.lista.length) abrirTambo(TAMBOS.lista[0].id).then(function () { render(); tambosSheet(); });
        else { TAMBOS.activo = null; saveTambos(); PERFIL = { nombre: '', logo: '' }; DB = { animales: [], cargada: null, archivo: '' }; savePerfil(); closeSheetT(); render(); }
      } else { saveTambos(); tambosSheet(); }
      toast((t.nombre || 'Tambo') + ' quitado');
    }
    /* ----- elegir tambo ----- */
    function tambosSheet() {
      var L = TAMBOS.lista.slice().sort(function (a, b) { return (a.nombre || '').localeCompare(b.nombre || '', 'es'); });
      $('#tlist').innerHTML = L.length ? L.map(function (t) {
        var act = t.id === TAMBOS.activo;
        return '<div class="topt' + (act ? ' act' : '') + '"><button class="tsel" data-tambo="' + t.id + '"' + (act ? ' aria-current="true"' : '') + '><b>' + esc(t.nombre || 'Sin nombre') + '</b><span>' +
          (t.n ? nf(t.n) + (t.n === 1 ? ' animal' : ' animales') : 'Sin libreta') + (t.fecha ? ' · ' + (t.fuente === 'syscaw' ? 'respaldo del ' : 'libreta del ') + A.fmt(t.fecha) : '') + (act ? ' · abierto' : '') + '</span></button>' +
          '<button class="tdel" data-tdel="' + t.id + '" aria-label="Quitar ' + esc(t.nombre || 'tambo') + '"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>';
      }).join('') : '<p class="hint">Todavía no hay tambos cargados.</p>';
      closeSheet();
      $('#sheetT').hidden = false;
    }
    function closeSheetT() { $('#sheetT').hidden = true; }
    function elegirTambo(id) {
      closeSheetT();
      var deInicio = state.inicio; state.inicio = false;
      if (id === TAMBOS.activo) { if (deInicio) { render(); window.scrollTo(0, 0); } return; }
      busy(true, 'Abriendo tambo…');
      abrirTambo(id).then(function () { busy(false); render(); window.scrollTo(0, 0); toast((PERFIL.nombre || 'Tambo') + ': ' + DB.animales.length + ' animales'); });
    }
    /* ----- inicio del modo veterinario: aparece al abrir la app; desde ahí se elige el tambo ----- */
    function irInicio() { closeSheet(); closeSheetT(); state.inicio = true; state.pobl = false; state.informe = false; state.rp = null; try { if (location.hash) location.hash = ''; } catch (e) {} render(); window.scrollTo(0, 0); }
    function inicioHTML() {
      var fecha = new Date().toLocaleDateString('es-UY', { weekday: 'long', day: 'numeric', month: 'long' });
      var L = TAMBOS.lista.slice().sort(function (a, b) { return (b.uso || 0) - (a.uso || 0) || (a.nombre || '').localeCompare(b.nombre || '', 'es'); });
      var ult = L.length && L[0].uso ? L[0].id : null, hoy = today();
      var tot = 0; L.forEach(function (t) { tot += t.n || 0; });
      var filas = L.map(function (t) {
        var d = t.fecha ? A.diffDays(hoy, t.fecha) : null;
        var cls = d == null ? '' : d > 45 ? ' late' : d <= 14 ? ' ok' : '';
        var hace = d == null ? '–' : d <= 0 ? 'hoy' : d === 1 ? 'ayer' : d + ' días';
        var ini = (t.nombre || '?').trim().charAt(0).toUpperCase() || '?';
        return '<button class="itambo" data-tambo="' + t.id + '" data-nom="' + esc(normNom(t.nombre)) + '">' +
          '<span class="ilogo' + (t.logo ? ' has' : '') + '">' + (t.logo ? '<img alt="" src="' + t.logo + '">' : esc(ini)) + '</span>' +
          '<span class="itx"><b>' + esc(t.nombre || 'Sin nombre') + '</b>' +
          '<span>' + (t.n ? nf(t.n) + (t.n === 1 ? ' animal' : ' animales') : 'Sin libreta') + (t.fecha ? ' · ' + A.fmt(t.fecha) : '') + '</span></span>' +
          '<span class="irt"><span class="when' + cls + '">' + hace + '</span>' + (t.id === ult ? '<small>último</small>' : '') + '</span></button>';
      }).join('');
      return '<section class="ihola"><p class="ifecha">' + esc(fecha.charAt(0).toUpperCase() + fecha.slice(1)) + '</p>' +
        '<p class="hint">' + (L.length ? L.length + (L.length === 1 ? ' tambo' : ' tambos') + ' en este teléfono · ' + nf(tot) + ' animales' : 'Todavía no hay tambos cargados.') + '</p></section>' +
        (L.length > 6 ? '<div class="searchbox"><input id="qTambo" type="search" placeholder="Buscar tambo" autocomplete="off" aria-label="Buscar tambo"></div>' : '') +
        '<div class="ilist" id="ilist">' + filas + '</div>' +
        '<p class="hint ihint">La fecha es la del último respaldo cargado (en rojo, más de 45 días).</p>' +
        '<div class="iacc"><button class="btn primary big" data-a="tnuevo">Agregar tambo</button>' +
        (L.length > 1 ? '<button class="btn" data-a="poblacion">Población de tambos</button>' : '') +
        '<button class="btn" data-a="ajustes">Ajustes</button></div>';
    }
    function byRp(rp) {
      for (var i = 0; i < DB.animales.length; i++) if (DB.animales[i].rp === rp) return DB.animales[i];
      var B = DB.bajas || []; for (i = 0; i < B.length; i++) if (B[i].key === rp) return B[i];
      return null;
    }
    var BAJA = { muerte: 'Muerta', venta: 'Vendida', baja: 'Dada de baja' };
    function bajaTxt(a) { return BAJA[a.bTipo] + (a.bFecha ? ' el ' + A.fmt(a.bFecha) : ''); }
    function toast(msg) {
      var t = $('#toast'); t.textContent = msg; t.classList.add('on');
      clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("on"); }, Math.max(3200, String(msg).length * 70));
    }

    /* ----- caravana (silueta con el número) ----- */
    function tagSVG(rp, w, tachada) {
      var s = String(rp), n = s.length, fs = n <= 3 ? 40 : n === 4 ? 34 : n === 5 ? 28 : 23;
      return '<svg class="eartag' + (tachada ? ' baja' : '') + '" width="' + w + '" height="' + Math.round(w * 1.3) + '" viewBox="0 0 100 130" role="img" aria-label="Caravana ' + esc(s) + '">' +
        '<path class="tg" d="M38 14 L62 14 L62 33 C62 46 96 42 96 60 L96 119 Q96 127 88 127 L12 127 Q4 127 4 119 L4 60 C4 42 38 46 38 33 Z"/>' +
        '<circle class="tbtn" cx="50" cy="13" r="11"/><circle class="tbtn2" cx="50" cy="13" r="6"/><circle class="tbtn3" cx="50" cy="13" r="2.4"/>' +
        '<text class="tgnum" x="50" y="' + (96 + fs * 0.18).toFixed(1) + '" text-anchor="middle" font-size="' + fs + '">' + esc(s) + '</text>' +
        '</svg>';
    }

    /* ----- archivo ----- */
    function nombreDesdeArchivo(f) {
      var n = f.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\b(copia de|libreta|syscaw|sys caw)\b/gi, '').replace(/[-]+/g, ' ').replace(/\s+/g, ' ').trim();
      return n;
    }
    function busy(on, msg) { $('#busy').hidden = !on; if (msg) $('#busyMsg').innerHTML = msg; }
    function b64(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
    function esRar(buf) { var u = new Uint8Array(buf, 0, Math.min(4, buf.byteLength)); return u[0] === 0x52 && u[1] === 0x61 && u[2] === 0x72 && u[3] === 0x21; }
    // sql.js (lector de la base de FOSAPP): se descarga recién la primera vez que se usa
    function cargarSqlJs() {
      if (root.initSqlJs) return Promise.resolve(root.initSqlJs);
      return new Promise(function (ok, mal) {
        var s = document.createElement('script'); s.src = 'sql-wasm.js?v=1';
        s.onload = function () { root.initSqlJs ? ok(root.initSqlJs) : mal(new Error('no se pudo cargar el lector de FOSAPP')); };
        s.onerror = function () { mal(new Error('no se pudo descargar el lector de FOSAPP (hace falta internet la primera vez)')); };
        document.head.appendChild(s);
      });
    }
    function cargarRespaldo(buf, f, fosapp) {
      busy(true, (fosapp ? 'Leyendo base de FOSAPP…' : 'Leyendo respaldo de SysCaw…') + '<small>Puede tardar unos segundos</small>');
      setTimeout(function () {
        (fosapp ? cargarSqlJs().then(function (ini) { return root.Fosapp.fromFile(buf, f.name, { initSqlJs: ini, wasmUrl: 'sql-wasm.wasm?v=1', XLSX: root.XLSX }); })
          : root.SysCaw.fromRar(buf, f.name, { unrar: root.Unrar, wasmBinary: b64(root.UNRAR_WASM_B64), Paradox: root.Paradox, elegir: function (us) { return elegirUnidad(us, null, true); }, todas: true })).then(function (d) {
          if (!habilitado(d.idProd)) { busy(false); state.destino = null; bloqueado(d.tambo || nombreDesdeArchivo(f.name)); return; }
          var sel = d.unidadesSel || [], parcial = !!d.sel;
          var nom = d.tambo || nombreDesdeArchivo(f.name) || '';
          // tambos guardados antes de esta versión: se averigua su número de productor
          return Promise.all(TAMBOS.lista.map(function (t) { return t.idp || t.fuente !== 'syscaw' ? null : leerDB(t.id).then(function (o) { if (o && o.idProd) t.idp = o.idProd; }, function () {}); })).then(function () { return { d: d, nom: nom }; });
        }).then(function (q) {
          if (!q) return;
          var d = q.d, nom = q.nom, cambio = prepararDestino(nom, d.idProd || []);
          if ((!d.tambo || d.origen === 'fosapp') && tamboAct() && tamboAct().nombre) nom = tamboAct().nombre; // sin nombre en el respaldo: se mantiene el que ya tenía
          var nuevo = { animales: [], todos: d.animales, idProd: d.idProd || [], ctrls: d.ctrls || [], bajasT: d.bajas || [], config: d.config || {}, unidades: d.unidades.length > 1 ? d.unidades : null, sel: d.sel, hist: d.hist, codes: d.codes, fecha: d.fecha, desdeHist: d.desdeHist, cargada: today(), archivo: f.name, fuente: 'syscaw', origen: d.origen || 'syscaw' };
          return leerDB(TAMBOS.activo).then(function (viejo) { return { cambio: cambio, nom: nom, n: unirRespaldo(nuevo, viejo) }; }, function () { return { cambio: cambio, nom: nom, n: { db: nuevo, bajas: 0 } }; });
        }).then(function (r) {
          if (!r) return;
          var cambio = r.cambio, nom = r.nom;
          DB = r.n.db;
          aplicarUnidad();
          busy(false);
          saveDB(); state.q = ''; state.rp = null; state.error = ''; state.filtro = 'todas'; state.tab = 'buscar'; state.cat = 'todas';
          try { location.hash = ''; } catch (e) {}
          render();
          // el nombre queda fijo: el que trae el respaldo
          PERFIL.nombre = nom || PERFIL.nombre; savePerfil(); render();
          toast((cambio === 'nuevo' ? 'Tambo nuevo: ' : cambio === 'actualizado' ? 'Actualizado: ' : '') + (PERFIL.nombre ? PERFIL.nombre + ' · ' : '') + DB.animales.length + ' animales' + (r.n.bajas ? ' · se ' + (r.n.bajas === 1 ? 'conserva 1 baja' : 'conservan ' + r.n.bajas + ' bajas') + ' de respaldos anteriores' : ''));
        }).catch(function (e) {
          busy(false);
          state.destino = null;
          if (e && e.cancelado) { toast('Carga cancelada. La libreta anterior sigue igual.'); return; }
          state.error = 'No pude leer el respaldo: ' + (e && e.message || e); render();
        });
      }, 30);
    }
    // al actualizar un tambo con un respaldo nuevo no se pierde nada de lo que ya estaba: se suma lo que el respaldo nuevo no trae
    // (bajas viejas que quedaron fuera de los 2 años, su historia y controles lecheros anteriores). Lo del respaldo nuevo manda.
    function unirRespaldo(N, V) {
      var out = { db: N, bajas: 0 };
      if (!V || V.fuente !== 'syscaw' || !V.hist) return out;
      var ids = N.idProd || [], vids = V.idProd || [];
      if (ids.length && vids.length && !ids.some(function (x) { return vids.indexOf(x) >= 0; })) return out; // otro productor: no se mezcla
      var unir = function (a, b) {
        var vis = {}, r = [];
        (a || []).concat(b || []).forEach(function (x) { var k = JSON.stringify(x); if (!vis[k]) { vis[k] = 1; r.push(x); } });
        return r.sort(function (x, y) { return String(x[0]) < String(y[0]) ? -1 : String(x[0]) > String(y[0]) ? 1 : 0; });
      };
      var vivo = {}; (N.todos || []).forEach(function (x) { vivo[x.rp] = 1; });
      var enN = {}; (N.bajasT || []).forEach(function (b) { enN[b.key] = 1; });
      (V.bajasT || V.bajas || []).forEach(function (b) {
        var hv = V.hist[b.key]; if (!hv) return;
        if (enN[b.key]) {
          // la baja está en los dos: se completa su historia (el respaldo nuevo recorta partos viejos)
          var hn = N.hist[b.key]; if (!hn) { N.hist[b.key] = hv; return; }
          ['pa', 'ev', 'ta', 'la', 'ct', 'ab', 'ec', 'mv'].forEach(function (k) { if (hv[k] || hn[k]) hn[k] = unir(hn[k], hv[k]); });
          return;
        }
        if (vivo[b.key]) return;
        N.bajasT.push(b); N.hist[b.key] = hv; out.bajas++;
      });
      var cv = {}; (N.ctrls || []).forEach(function (c) { cv[c[0] + '|' + c[1]] = 1; });
      (V.ctrls || []).forEach(function (c) { if (!cv[c[0] + '|' + c[1]]) N.ctrls.push(c); });
      N.ctrls.sort(function (x, y) { return x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0; });
      var dv = V.desdeHist != null ? V.desdeHist : (V.fecha ? A.addDays(V.fecha, -730) : null);
      if (dv && (N.desdeHist == null || dv < N.desdeHist)) N.desdeHist = dv;
      return out;
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
        if (root.Fosapp && root.Fosapp.es(fr.result, f.name)) {
          // base de FOSAPP: solo en el modo veterinario
          // fuera del modo veterinario no se reconoce: se responde como cualquier archivo que la app no lee
          if (!esVet()) { state.destino = null; state.error = 'No pude leer el archivo. Elegí el respaldo de SysCaw (.rar) o la libreta en Excel (.xls o .xlsx).'; render(); return; }
          cargarRespaldo(fr.result, f, true); return;
        }
        if (esRar(fr.result) || /\.rar$/i.test(f.name)) { cargarRespaldo(fr.result, f); return; }
        if (!esVet() && !ACT.length) { bloqueado(nombreDesdeArchivo(f.name)); return; }
        try {
          var res = A.parseLibreta(root.XLSX, fr.result);
          res.animales.forEach(function (a) { a.cat = 'vaca'; });
          var mismo = state.destino !== 'nuevo' && tamboAct();
          var prev = mismo ? DB : {};
          if (!mismo) prepararDestino(nombreDesdeArchivo(f.name));
          state.destino = null;
          DB = { animales: res.animales, cargada: today(), archivo: f.name, fuente: 'excel', hist: prev.hist, codes: prev.codes, fecha: prev.fecha };
          saveDB(); state.q = ''; state.rp = null; state.error = ''; state.filtro = 'todas'; state.tab = 'buscar'; state.cat = 'todas';
          try { location.hash = ''; } catch (e) {}
          render();
          toast(res.animales.length + ' animales cargados');
          openSheet('Nombre del tambo', nombreDesdeArchivo(f.name) || PERFIL.nombre);
          return;
        } catch (e) { state.error = e.message || 'No pude leer el archivo.'; }
        render();
      };
      fr.onerror = function () { state.destino = null; state.error = 'No pude abrir el archivo.'; render(); };
      fr.readAsArrayBuffer(f);
    }

    /* ----- ajustes: nombre y logo ----- */
    function openSheet(titulo, nombrePropuesto) {
      state.draft = { nombre: nombrePropuesto != null ? nombrePropuesto : PERFIL.nombre, logo: PERFIL.logo };
      $('#sheetTitle').textContent = titulo || 'Ajustes';
      $('#inNombre').value = state.draft.nombre;
      // con respaldo de SysCaw el nombre es el del respaldo y no se edita
      var fijo = DB.fuente === 'syscaw' && DB.origen !== 'fosapp'; // con FOSAPP el nombre lo pone el veterinario
      $('label[for="inNombre"]').hidden = fijo;
      paintLogoPreview();
      $('#btnAct').hidden = !(esVet() && DB.idProd && DB.idProd.length && DB.origen !== 'fosapp');
      $('#btnInf').hidden = !(esVet() && DB.hist && DB.animales.length);
      ['#btnPob', '#btnBase', '#btnBaseIn', '#btnVetClave'].forEach(function (s) { $(s).hidden = !esVet(); });
      $('#sheet .sheet-card').classList.toggle('vet', esVet());
      $('#sheet .sheet-card').classList.toggle('fos', esVet() && DB.origen === 'fosapp'); // FOSAPP: el veterinario le pone el nombre al tambo
      Array.prototype.forEach.call(document.querySelectorAll('#sheet .sg'), function (g, i) { g.classList.toggle('abierto', i === 0); });
      $('#btnCod').hidden = esVet();
      $('#btnCerrar').textContent = esVet() ? 'Cerrar' : 'Cancelar';
      $('#nTambos').hidden = esOperario();
      $('#btnVet').textContent = esVet() ? 'Modo veterinario activo · salir' : 'Modo veterinario';
      $('#actInfo').textContent = esVet() ? '' : ACT.length ? 'Activada para: ' + ACT.map(function (x) { return (x.n || ('productor ' + x.p.join(', '))) + (x.r === 'op' ? ' (operario)' : ''); }).join(' · ') : 'Sin activar';
      $('#sheet').hidden = false;
      if (!fijo) setTimeout(function () { $('#inNombre').focus(); }, 60);
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
    // si en el nombre se pegó un link (por ejemplo el de activación), se usa el link y no queda en el nombre
    function limpiarNombre(t) { return String(t || '').replace(/https?:\/\/\S*/gi, '').replace(/#act=\S*/g, '').replace(/\s+/g, ' ').trim(); }
    function guardarSheet() {
      if (!state.draft) return;
      var crudo = $('#inNombre').value;
      if (/#act=/.test(crudo)) leerActivacion(crudo);
      PERFIL = { nombre: DB.fuente === 'syscaw' && DB.origen !== 'fosapp' ? PERFIL.nombre : (limpiarNombre(crudo) || PERFIL.nombre), logo: state.draft.logo || '' };
      savePerfil(); closeSheet(); render(); toast('Guardado');
    }

    /* ----- navegación ----- */
    function setTab(t) {
      state.tab = t; state.rp = null; state.informe = false; state.pobl = false;
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
      return (a.cat && a.cat !== 'vaca' ? '<span class="catlbl">' + CATL[a.cat] + '</span>' + (sub ? ' · ' : '') : '') + (paraVenta(a) ? esc(nf(a.pr[0], 1) + ' lts · ' + nf(delDe(a)) + ' días en leche') + ' <span class="vta">VENTA</span>' : esc(sub) + (a.rech ? ' <span class="dsc">Descarte' + ': ' + esc(a.rechDet || a.rech) + '</span>' : ''));
    }
    function rowBajaHTML(a) {
      return '<button class="row baja" data-rp="' + esc(a.key) + '">' + tagSVG(a.rp, 54, true) +
        '<span class="rt"><span class="chip ' + a.bTipo + '">' + BAJA[a.bTipo] + '</span></span>' +
        '<span class="sub">' + (a.cat ? '<span class="catlbl">' + CATL[a.cat] + '</span> · ' : '') + esc(bajaTxt(a)) + (a.bCausa ? ' · ' + esc(a.bCausa) : '') + '</span></button>';
    }
    function rowHTML(a, o) {
      if (a.bTipo) return rowBajaHTML(a);
      o = o || {};
      var qd = String(state.q || '').replace(/\s+/g, '');
      if (o.sub == null && /^\d{5,8}$/.test(qd) && a.idElec && a.idElec.slice(-8).indexOf(qd) === 0) o.sub = '<b>ID …' + esc(a.idElec.slice(-8)) + '</b>';
      return '<button class="row" data-rp="' + esc(a.rp) + '">' + tagSVG(a.rp, 54) +
        '<span class="rt">' + (o.right != null ? o.right : chip(a)) + '</span>' +
        '<span class="sub">' + (o.sub != null ? (a.cat && a.cat !== 'vaca' ? '<span class="catlbl">' + CATL[a.cat] + '</span> · ' : '') + o.sub : subDefault(a)) + '</span></button>';
    }
    function emptyHTML() {
      return '<section class="empty"><div class="emptytag">' + tagSVG('0000', 64) + '</div><h2>Cargá el respaldo</h2>' +
        '<p>Elegí el respaldo de SysCaw (.rar)' + (esVet() ? ', la base de FOSAPP (.zip)' : '') + ' o la libreta en Excel (.xls o .xlsx). Se lee en este teléfono y no se sube a ningún servidor.</p>' +
        (state.error ? '<p class="error" role="alert">' + esc(state.error) + '</p>' : '') +
        '<button class="btn primary big" data-a="load">Elegir archivo</button>' + (!esVet() && !ACT.length ? '<p style="margin:18px 0 8px"><b>¿Todavía no activaste?</b> Escribí tu código:</p>' + codigoHTML() : '') + '</section>';
    }
    // Para venta: descarte programado + más de 300 días en leche + menos de 15 litros en el último control
    var VTA_DEL = 300, VTA_LTS = 15;
    function delDe(a) { return a.pFecha && (a.cat === 'vaca' || !a.cat) ? (DB.fuente === 'syscaw' ? A.diffDays(today(), a.pFecha) : a.dLac) : null; }
    // criterio de venta: lo define cada productor (se guarda por tambo); lo que quede vacío no se toma
    function vtaCfg() { var c = null; try { c = JSON.parse(getP('vta')); } catch (e) {} return c || { desc: true, vacia: false, del: VTA_DEL, lts: VTA_LTS }; }
    function vtaTxt(c) {
      c = c || vtaCfg();
      var t = [c.desc ? 'descarte programado' : null, c.vacia ? 'vacías' : null, c.del ? 'más de ' + c.del + ' días en leche' : null, c.lts ? 'menos de ' + c.lts + ' litros' : null].filter(Boolean);
      return t.length ? t.join(' · ') : 'sin criterio';
    }
    function paraVenta(a) {
      if (a.cat && a.cat !== 'vaca') return false;
      var c = vtaCfg(); if (!c.desc && !c.vacia && !c.del && !c.lts) return false;
      if (c.desc && !a.rech) return false;
      if (c.vacia && a.estado === 'prenada') return false;
      var d = delDe(a), l = a.pr && a.pr[0];
      if (c.del && !(d != null && d > c.del)) return false;
      if (c.lts && !(typeof l === 'number' && l < c.lts)) return false;
      return true;
    }
    function vtaSheet() {
      state.vtaDraft = vtaCfg();
      var c = state.vtaDraft, chk = function (k, t) { return '<button class="fchip" data-vk="' + k + '" aria-pressed="' + !!c[k] + '">' + t + '</button>'; };
      var num = function (k, a1, b1) { return '<label class="xnum">' + a1 + ' <input type="number" inputmode="numeric" min="1" max="999" data-vn="' + k + '" value="' + (c[k] || '') + '" placeholder="–"> ' + b1 + '</label>'; };
      $('#sheetXTitle').textContent = 'Criterio para venta';
      $('#xopts').innerHTML = '<p class="cap" style="margin:0 0 6px">Vacas en ordeñe que cumplen todo lo marcado. Lo que quede vacío no se toma.</p>' +
        num('del', 'Más de', 'días en leche') + num('lts', 'Menos de', 'litros en el último control') +
        '<div class="filters" style="margin-top:8px">' + chk('desc', 'Solo descarte programado') + chk('vacia', 'Solo vacías (no preñadas)') + '</div>' +
        '<p class="xcount" id="vtaN"></p>';
      $('#xbtns').innerHTML = '<button class="btn primary big" data-a="vtaok">Guardar criterio</button><button class="btn" data-a="xcancel">Cancelar</button>';
      vtaCuenta(); $('#sheetX').hidden = false;
    }
    function vtaCuenta() {
      var g = getP('vta'); setP('vta', JSON.stringify(state.vtaDraft));
      var n = DB.animales.filter(paraVenta).length;
      if (g == null) { try { localStorage.removeItem('libreta:vta:' + TAMBOS.activo); } catch (e) {} } else setP('vta', g);
      $('#vtaN').innerHTML = '<b>' + n + '</b> ' + (n === 1 ? 'vaca' : 'vacas') + ' para venta con este criterio';
    }
    function matchFiltro(a, f) { if (f === 'itop' || f === 'ipeor') { var V = idxDe(a); return !!V && V.tier === (f === 'itop' ? 'top' : 'peor'); } return f === 'todas' || (f === 'descarte' ? !!a.rech : f === 'venta' ? paraVenta(a) : f === 'pcelo' ? !!a.celo : a.estado === f); }
    function numRp(a, b) { return a.rp.localeCompare(b.rp, 'es', { numeric: true }); }
    /* ----- categorías (vacas, vaquillonas, terneras) ----- */
    var CATL = { vaca: 'Vaca', seca: 'Vaca seca', vaquillona: 'Vaquillona', ternera: 'Ternera' };
    var GL = { todas: 'Todas', vaca: 'En ordeñe', seca: 'Secas', vaquillona: 'Vaquillonas', ternera: 'Terneras' };
    function grupo(a) { return a.cat || 'vaca'; }
    function grupos() { var g = {}; DB.animales.forEach(function (a) { g[grupo(a)] = (g[grupo(a)] || 0) + 1; }); return g; }
    function lista() {
      var g = grupos(), orden = ['vaca', 'seca', 'vaquillona', 'ternera'].filter(function (k) { return g[k]; });
      if (state.cat === 'todas') return DB.animales;
      if (orden.indexOf(state.cat) < 0) state.cat = orden[0] || 'vaca';
      return DB.animales.filter(function (a) { return grupo(a) === state.cat; });
    }
    function catsHTML() {
      var g = grupos(), orden = ['vaca', 'seca', 'vaquillona', 'ternera'].filter(function (k) { return g[k]; });
      if (orden.length < 2) return '';
      // en Rodeo se agrega "Todas" (partos proyectados de vacas y vaquillonas juntos)
      var conTodas = true;
      return '<div class="cats' + (orden.length === 4 || conTodas ? ' n4' : '') + '" role="group" aria-label="Categoría">' +
        (conTodas ? '<button class="todas" data-cat="todas" aria-pressed="' + (state.cat === 'todas') + '">Todas <b>' + DB.animales.length + '</b></button>' : '') +
        orden.map(function (k) {
          return '<button data-cat="' + k + '" aria-pressed="' + (state.cat === k) + '">' + GL[k] + ' <b>' + g[k] + '</b></button>';
        }).join('') + '</div>';
    }
    function nombreGrupo(n) { if (state.cat === 'todas') return n === 1 ? 'animal' : 'animales'; return state.cat === 'vaquillona' ? (n === 1 ? 'vaquillona' : 'vaquillonas') : state.cat === 'ternera' ? (n === 1 ? 'ternera' : 'terneras') : state.cat === 'seca' ? (n === 1 ? 'vaca seca' : 'vacas secas') : (n === 1 ? 'vaca en ordeñe' : 'vacas en ordeñe'); }
    function ordenar(list, f) {
      var h = today();
      var key = function (a) {
        if (f === 'prenada') { var d = A.derive(a, h); return d.partoProb || '9999'; }
        if (f === 'servida') return a.sFecha || '9999';
        if (f === 'venta') return ('00000' + Math.round((a.pr[0] || 0) * 10)).slice(-5);
        if (f === 'itop' || f === 'ipeor') { var V = idxDe(a); return ('00000' + (f === 'itop' ? V.puesto : 99999 - V.puesto)).slice(-5); }
        if (f === 'descarte') return paraVenta(a) ? '0' + ('00000' + Math.round((a.pr[0] || 0) * 10)).slice(-5) : '1';
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
      var nVta = esOperario() ? 0 : L.filter(paraVenta).length;
      if (nVta) fl.push(['venta', 'Para venta', nVta]);
      if (IDX() && !esOperario()) {
        var nTop = L.filter(function (a) { var V = idxDe(a); return V && V.tier === 'top'; }).length, nPeor = L.filter(function (a) { var V = idxDe(a); return V && V.tier === 'peor'; }).length;
        if (nTop) fl.push(['itop', 'Top 10%', nTop]);
        if (nPeor) fl.push(['ipeor', 'Peores 10%', nPeor]);
      }
      return '<div class="searchbox"><label class="sr" for="q">Caravana, nombre o ID electrónico (últimos 8 números)</label>' +
        '<svg class="mag" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M15.5 15.5L21 21" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>' +
        '<input id="q" type="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Caravana, nombre o ID" value="' + esc(state.q) + '"></div>' + catsHTML() +
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
          html = '<h2 class="h">' + list.length + (list.length === 1 ? ' resultado' : ' resultados') + (state.cat === 'todas' ? '' : ' en ' + GL[state.cat].toLowerCase()) + '</h2>' + list.slice(0, 40).map(function (a) { return rowHTML(a); }).join('');
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
        var tit = f === 'prenada' ? 'por fecha de parto' : f === 'servida' ? 'servicio más antiguo primero' : f === 'descarte' ? 'descarte programado' : f === 'venta' ? 'para venta, menos litros primero' : f === 'pcelo' ? 'preñadas con celo registrado' : '';
        html = '<h2 class="h">' + list.length + ' ' + nombreGrupo(list.length) + (tit ? ', ' + tit : '') + '</h2>' + list.slice(0, state.n).map(function (a) { return rowHTML(a); }).join('');
        if (list.length > state.n) html += '<button class="btn more" data-a="mas">Mostrar más (' + (list.length - state.n) + ' restantes)</button>';
      }
      box.innerHTML = html;
    }

    /* ----- pestaña Tareas ----- */
    var SECS = [45, 50, 60, 65];
    var VENT = [[7, '7 días'], [30, '30 días'], [90, '90 días'], [183, '6 meses'], [365, '12 meses']];
    function secTareas(key, titulo, nota, items, mapRow, vacio) {
      var abierta = !!state.abiertas[key], lim = abierta ? items.length : 12;
      // cada lista arranca plegada: título y cantidad; se despliega tocando el título
      var desp = !!(state.desp && state.desp[key]);
      var h = '<section class="sec' + (desp ? ' open' : '') + '"><button class="sechead" data-desp="' + key + '" aria-expanded="' + desp + '"><h2>' + titulo + '</h2><span class="count">' + items.length + '</span>' +
        '<svg class="chev" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
      if (!desp) return h + '</section>';
      h += (nota ? (nota.charAt(0) === '<' ? nota : '<p class="secnote">' + nota + '</p>') : '');
      if (!items.length) h += '<p class="hint">' + vacio + '</p>';
      else {
        h += items.slice(0, lim).map(mapRow).join('');
        if (items.length > 12) h += '<button class="btn more" data-a="ver" data-k="' + key + '">' + (abierta ? 'Ver menos' : 'Ver las ' + items.length) + '</button>';
      }
      return h + '</section>';
    }
    function tareasHTML() {
      var t = A.tareas(DB.animales.filter(function (a) { return a.cat !== 'ternera'; }), today(), state.ventana), vtxt = (VENT.filter(function (v) { return v[0] === state.ventana; })[0] || [0, ''])[1];
      var fs = fechaSecado(), sec = listaSecado(fs);
      state.secarLista = sec;
      var secChips = '<div class="secsel"><span>Secar a</span>' + SECS.map(function (n) { return '<button class="fchip plain" data-sec="' + n + '" aria-pressed="' + (A.SECADO === n) + '">' + n + '</button>'; }).join('') + '<span>días del parto</span></div>';
      var chips = '<div class="filters" role="group" aria-label="Ventana de tiempo">' + VENT.map(function (v) {
        return '<button class="fchip plain" data-v="' + v[0] + '" aria-pressed="' + (state.ventana === v[0]) + '">' + v[1] + '</button>';
      }).join('') + '</div>';
      return '<h1 class="ptitle">Tareas</h1>' + chips + '<button class="btn share xtop" data-a="exptactar"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>Lista a Excel (tacto, secado, venta)</button>' +
        (function () {
          var rowT = function (x) { return rowHTML(x.a, { right: '<span class="when late">hace ' + x.dias + ' días</span>', sub: 'Servicio ' + A.fmt(x.fecha) + (x.a.toro && !/^celo/i.test(x.a.toro) ? ' · ' + esc(x.a.toro) : '') }); };
          var nota = 'Servidas hace ' + A.DX_MIN + ' días o más, sin tacto posterior.';
          var vq = t.tactar.filter(function (x) { return x.a.cat === 'vaquillona'; }), vc = t.tactar.filter(function (x) { return x.a.cat !== 'vaquillona'; });
          return secTareas('tactar', 'Para tactar · vacas', nota, vc, rowT, 'No hay vacas pendientes de tacto.') +
            secTareas('tactarvq', 'Para tactar · vaquillonas', nota, vq, rowT, 'No hay vaquillonas pendientes de tacto.');
        })() +
        secTareas('secar', 'Para secar', '<label class="secfecha">Fecha de secado <input type="date" id="fsec" value="' + fs + '" min="' + today() + '"></label>' + secChips + '<p class="secnote">Vacas preñadas que el ' + A.fmt(fs) + ' están a ' + A.SECADO + ' días o menos del parto. Ordenadas por caravana.</p>' + ('<button class="btn share" data-a="compsecar"' + (sec.length ? '' : ' disabled') + '><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 4v11M7.5 8.5L12 4l4.5 4.5M5 14v5h14v-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>Enviar lista por WhatsApp</button>' + (sec.length ? '' : '<p class="hint">Elegí la fecha del próximo secado para armar la lista.</p>')), sec, function (x) {
          return rowHTML(x.a, { right: '<span class="when">' + x.dp + ' días al parto</span>', sub: 'Parto probable ' + A.fmt(x.P) });
        }, 'Ninguna vaca para secar el ' + A.fmt(fs) + '.') +
        secTareas('partos', 'Próximos partos', 'Partos probables en los próximos ' + vtxt + '.', t.partos, function (x) {
          return rowHTML(x.a, { right: '<span class="when">' + A.rel(x.dias) + '</span>', sub: 'Parto probable ' + A.fmt(x.fecha) });
        }, 'Ningún parto probable en los próximos ' + vtxt + '.') +
        secTareas('venta', 'Para venta', '<p class="secnote">Criterio: ' + esc(vtaTxt()) + '. <button class="lnk" data-a="vtacfg">Cambiar criterio</button></p>', DB.animales.filter(paraVenta).sort(function (x, y) { return x.pr[0] - y.pr[0]; }), function (a) {
          return rowHTML(a, { right: '<span class="vta">VENTA</span>', sub: nf(a.pr[0], 1) + ' lts · ' + nf(delDe(a)) + ' días en leche' + (a.rech ? ' · ' + esc(a.rechDet || a.rech) : '') });
        }, 'Ninguna vaca cumple el criterio de venta.');
    }

    /* ----- pestaña Rodeo ----- */
    function mesesChart(meses) {
      var max = Math.max.apply(null, meses.map(function (m) { return mesReal(m) ? m.n : 0; })); if (!max) return '<p class="hint">No hay partos probables en los próximos 12 meses.</p>';
      var W = 320, H = 150, padx = 6, gap = 5, bw = (W - padx * 2 - gap * 11) / 12, s = '';
      meses.forEach(function (m, i) {
        var x = padx + i * (bw + gap), h = m.n ? Math.max(3, m.n / max * (H - 48)) : 0, y = H - 26 - h;
        if (!mesReal(m)) { s += '<text class="mlbl" x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 12) + '" text-anchor="middle">' + m.label + '</text>'; return; }
        if (m.n) s += '<rect class="mbar" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="3"/><text class="mval" x="' + (x + bw / 2).toFixed(1) + '" y="' + (y - 4).toFixed(1) + '" text-anchor="middle">' + m.n + '</text>';
        else s += '<rect class="mzero" x="' + x.toFixed(1) + '" y="' + (H - 28) + '" width="' + bw.toFixed(1) + '" height="2" rx="1"/>';
        s += '<text class="mlbl" x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 12) + '" text-anchor="middle">' + m.label + '</text>';
        if (m.label === 'ene' || i === 0) s += '<text class="myear" x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 1) + '" text-anchor="middle">' + String(m.anio).slice(2) + '</text>';
      });
      return '<svg class="mchart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Partos probables por mes">' + s + '</svg>';
    }
    // números de vacas y vaquillonas adentro de cada tramo de la barra, solo si el tramo da la altura para leerlos
    function numsDentro(x, bw, base, hv, hq, nv, nq) {
      var t = '', cx = (x + bw / 2).toFixed(1);
      if (nq && nv && hv >= 11) t += '<text class="minv" x="' + cx + '" y="' + (base - hv / 2 + 3.5).toFixed(1) + '" text-anchor="middle">' + nv + '</text>';
      if (nq && nv && hq >= 11) t += '<text class="minq" x="' + cx + '" y="' + (base - hv - hq / 2 + 3.5).toFixed(1) + '" text-anchor="middle">' + nq + '</text>';
      return t;
    }
    function mesesStack(mv, mq) {
      var tot = mv.map(function (m, i) { return m.n + mq[i].n; });
      var max = Math.max.apply(null, tot); if (!max) return '<p class="hint">No hay partos probables en los próximos 12 meses.</p>';
      var W = 320, H = 150, padx = 6, gap = 5, bw = (W - padx * 2 - gap * 11) / 12, s = '', k = (H - 48) / max;
      mv.forEach(function (m, i) {
        var x = padx + i * (bw + gap), base = H - 26, hv = m.n * k, hq = mq[i].n * k;
        if (!mesReal(m)) { s += '<text class="mlbl" x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 12) + '" text-anchor="middle">' + m.label + '</text>'; return; }
        if (tot[i]) {
          if (hv) s += '<rect class="mbv" x="' + x.toFixed(1) + '" y="' + (base - hv).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hv.toFixed(1) + '"><title>' + m.label + ': ' + m.n + ' vacas</title></rect>';
          if (hq) s += '<rect class="mbq" x="' + x.toFixed(1) + '" y="' + (base - hv - hq).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hq.toFixed(1) + '"><title>' + m.label + ': ' + mq[i].n + ' vaquillonas</title></rect>';
          s += numsDentro(x, bw, base, hv, hq, m.n, mq[i].n);
          s += '<text class="mval" x="' + (x + bw / 2).toFixed(1) + '" y="' + (base - hv - hq - 4).toFixed(1) + '" text-anchor="middle">' + tot[i] + '</text>';
        } else s += '<rect class="mzero" x="' + x.toFixed(1) + '" y="' + (H - 28) + '" width="' + bw.toFixed(1) + '" height="2" rx="1"/>';
        s += '<text class="mlbl" x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 12) + '" text-anchor="middle">' + m.label + '</text>';
        if (m.label === 'ene' || i === 0) s += '<text class="myear" x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 1) + '" text-anchor="middle">' + String(m.anio).slice(2) + '</text>';
      });
      return '<svg class="mchart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Partos probables por mes, vacas y vaquillonas">' + s + '</svg>';
    }
    // Para secar en una fecha: vacas preñadas (no secas) que ese día están a SECADO días o menos del parto
    function fechaSecado() {
      var f = state.fsec;
      if (!f) f = getP('fsec');
      if (!f || f < today()) f = today();
      return (state.fsec = f);
    }
    function listaSecado(f) {
      var out = [];
      DB.animales.forEach(function (a) {
        if (a.estado !== 'prenada' || (a.cat && a.cat !== 'vaca')) return;
        var d = A.derive(a, today()); if (!d.partoProb) return;
        var dp = A.diffDays(d.partoProb, f);
        if (dp >= 0 && dp <= A.SECADO) out.push({ a: a, dp: dp, P: d.partoProb });
      });
      return out.sort(function (x, y) { return numRp(x.a, y.a); });
    }
    function compartirSecar() {
      var L = state.secarLista || [];
      var txt = '*Vacas para secar' + (PERFIL.nombre ? ' — ' + PERFIL.nombre : '') + '*\n' +
        'Secado del ' + A.fmt(state.fsec) + ' · hasta ' + A.SECADO + ' días antes del parto\n\n' +
        L.map(function (x) { return '*' + x.a.rp + '* · parto ' + A.fmt(x.P).slice(0, 5) + ' (' + x.dp + ' días)'; }).join('\n') +
        '\n\nTotal: ' + L.length + (L.length === 1 ? ' vaca' : ' vacas') + '\nDr. Mauro Torterolo';
      if (navigator.share) navigator.share({ text: txt }).catch(function () {});
      else window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank');
    }
    // hasta dónde los datos son reales: preñeces confirmadas por tacto a la fecha de los datos
    function limReal() { var ref = DB.fuente === 'syscaw' ? (DB.fecha || today()) : (DB.cargada || today()); return A.addDays(ref, A.GEST - A.DX_MIN); }
    function mesReal(m) { return !m.key || m.key < limReal().slice(0, 7); }
    function proyHTML() {
      var lim = limReal();
      var P = A.proyeccion(DB.animales, today(), 10, lim).filter(function (r) { return r.okPre; }), N = P.length;
      if (!N) return '';
      var max = Math.max.apply(null, P.map(function (r) { return r.okSec ? r.ord + r.sec + r.pre : 0; })); if (!max) return '';
      var W = 320, H = 150, padx = 6, gap = 12, bw = (W - padx * 2 - gap * (N - 1)) / N, s = '', k = (H - 48) / max;
      P.forEach(function (r, i) {
        var x = padx + i * (bw + gap), y = H - 26, tot = r.ord + r.sec + r.pre;
        if (r.okSec) [['pord', r.ord], ['psec', r.sec], ['ppre', r.pre - r.preQ], ['pprq', r.preQ]].forEach(function (p) { var h = p[1] * k; if (h) { y -= h; s += '<rect class="' + p[0] + '" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '"/>'; } });
        if (r.okSec) s += '<text class="mval" x="' + (x + bw / 2).toFixed(1) + '" y="' + (y - 4).toFixed(1) + '" text-anchor="middle">' + tot + '</text>';
        s += '<text class="mlbl" x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 12) + '" text-anchor="middle">' + r.label + '</text>';
        if (r.label === 'ene' || i === 0) s += '<text class="myear" x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 1) + '" text-anchor="middle">' + String(r.anio).slice(2) + '</text>';
      });
      var filas = P.map(function (r, i) { return '<tr><td>' + (i === 0 ? 'Hoy' : r.label + ' ' + String(r.anio).slice(2)) + '</td><td>' + (r.okSec ? r.ord : '') + '</td><td>' + (r.okSec && r.delN ? Math.round(r.delS / r.delN) : '') + '</td><td>' + (r.okSec ? r.sec : '') + '</td><td>' + (r.pre - r.preQ) + '</td><td>' + r.preQ + '</td></tr>'; }).join('');
      return '<section class="card"><h2>Proyección del rodeo</h2>' +
        '<div class="mleg"><span><i class="pord"></i>En ordeñe</span><span><i class="psec"></i>Secas</span><span><i class="ppre"></i>Preparto vacas</span><span><i class="pprq"></i>Preparto vaquillonas</span></div>' +
        '<svg class="mchart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Proyección de vacas en ordeñe, secas y preparto por mes">' + s + '</svg>' +
        '<table class="tbl ptbl ptbl6"><thead><tr><th>Mes</th><th>Ordeñe</th><th>DEL</th><th>Secas</th><th>Prep. vacas</th><th>Prep. vaq.</th></tr></thead><tbody>' + filas + '</tbody></table>' +
        '<p class="cap">A mitad de cada mes. DEL: días en leche promedio de las vacas en ordeñe. Secado ' + A.SECADO + ' días antes del parto; preparto los últimos ' + A.PREPARTO + ' días (las vaquillonas entran al preparto ' + A.PREPARTO + ' días antes y después pasan a ordeñe). No descuenta descartes ni muertes, y las vacas no preñadas siguen en ordeñe. Solo con preñeces confirmadas por tacto: lo que todavía depende de vacas sin diagnóstico queda en blanco.</p></section>';
    }
    /* ----- reproducción cada 21 días ----- */
    var PEVS = [40, 45, 50, 60];
    function pevActual() { return state.pev || (DB.config && DB.config.pev) || 45; }
    // por defecto: el primer servicio a una vaca (con al menos un parto) desde el 1 de mayo de la zafra; el productor lo puede cambiar
    function iniZafra() {
      if (state.ini21def !== undefined && state.ini21def.db === DB) return state.ini21def.f;
      var ref = DB.fecha || today(), y = +ref.slice(0, 4); if (ref.slice(5) < '05-01') y--;
      var prim = function (d0) {
        var best = null; if (!DB.hist) return null;
        DB.animales.map(function (a) { return DB.hist[a.rp]; }).concat((DB.bajas || []).map(function (b) { return DB.hist[b.key]; })).forEach(function (h) {
          if (!h || !h.pa || !h.pa.length || !h.ev) return; var p0 = h.pa[0][0];
          h.ev.forEach(function (e) { if (e[1] === 'S' && e[0] >= d0 && e[0] <= ref && e[0] > p0 && (!best || e[0] < best)) best = e[0]; });
        });
        return best;
      };
      // si todavía no hay servicios en esta zafra, la anterior
      var f = prim(y + '-05-01') || prim((y - 1) + '-05-01');
      state.ini21def = { db: DB, f: f };
      return f;
    }
    function inicio21() {
      var f = state.ini21;
      if (!f) f = getP('ini21');
      if (!f) f = iniZafra();
      if (!f) { var h = today(), y = +h.slice(0, 4); if (h.slice(5) < '05-22') y--; f = y + '-05-22'; }
      return (state.ini21 = f);
    }
    function ini21Default() {
      try { localStorage.removeItem('libreta:ini21:' + TAMBOS.activo); if (TAMBOS.lista.length < 2) localStorage.removeItem('libreta:ini21'); } catch (e) {}
      state.ini21 = null; render();
    }
    function SRC() { return DB.origen === 'fosapp' ? 'FOSAPP' : 'SysCaw'; }
    function esVacia(c) { var x = DB.codes && DB.codes[c]; return !!x && x[2] === '1' && !/^(evnor|evol)/i.test(x[0] || ''); }
    function esPren(c) { var x = DB.codes && DB.codes[c]; return !!x && (x[2] != null ? x[2] === '2' : /^pr(e|ñ)/i.test(x[0] || '')); }
    function repHTML() {
      if (DB.fuente !== 'syscaw' || !DB.hist) return '';
      var ini = inicio21(), pev = pevActual(), ref = DB.fecha || today();
      var an = DB.animales.map(function (a) { return { h: DB.hist[a.rp], salida: null, desc: a.dFecha || (a.rech ? '0000' : null) }; })
        .concat((DB.bajas || []).map(function (b) { return { h: DB.hist[b.key], salida: b.bFecha, desc: b.dFecha || null }; }));
      var C = ini <= ref ? A.ciclos21(an, esPren, ini, pev, ref) : [];
      var p = function (n, d) { return d ? Math.round(n / d * 100) + '%' : '–'; };
      var T = { aptas: 0, serv: 0, pren: 0, sOk: 0, sMal: 0 }, nCerr = 0;
      C.forEach(function (c) { if (!c.cerrado) return; nCerr++; ['aptas', 'serv', 'pren', 'sOk', 'sMal'].forEach(function (k) { T[k] += c[k]; }); });
      // referencia: concepción promedio de la temporada anterior (mismo inicio, un año antes); si no hay, los ciclos cerrados de esta
      var iniAnt = (+ini.slice(0, 4) - 1) + ini.slice(4), hab = null, habTxt = '';
      if (iniAnt >= (DB.desdeHist != null ? DB.desdeHist : A.addDays(ref, -730))) {
        var CA = A.ciclos21(an, esPren, iniAnt, pev, A.addDays(ini, -1)), ok = 0, mal = 0, na = 0;
        CA.svs.forEach(function (s) { if (s.r === 'ok') ok++; else if (s.r === 'mal') mal++; });
        if (ok + mal >= 30) { hab = ok / (ok + mal) * 100; habTxt = 'temporada ' + A.fmt(iniAnt).slice(-4); }
      }
      if (hab == null && T.sOk + T.sMal) { hab = T.sOk / (T.sOk + T.sMal) * 100; habTxt = 'los ciclos cerrados de esta temporada'; }
      var hayRojo = false;
      // el aviso de cada ciclo en rojo aparece solo al tocarlo, debajo de su fila
      var filas = C.map(function (c) {
        // ciclo cerrado: la alerta va en la concepción real; ciclo en curso: en la concepción máxima
        var dn = c.sOk + c.sMal + c.sPend, mx = dn ? (c.sOk + c.sPend) / dn * 100 : null, dr = c.sOk + c.sMal, cr = dr ? c.sOk / dr * 100 : null;
        // tactado: ciclo cerrado y como mucho un 10% de sus servicios sin resultado de tacto todavía
        var tact = c.cerrado && c.sPend <= dn * 0.1;
        var val = tact ? cr : mx, mal = hab != null && val != null && val < hab - 10;
        if (mal) hayRojo = true;
        var ab = mal && state.cicloAl === c.n;
        var marca = function (cls) { return '<td class="' + cls + (mal ? ' alerta' : '') + '"' + (mal ? ' data-cal="' + c.n + '" role="button" tabindex="0" aria-expanded="' + ab + '"' : '') + '>'; };
        var cmax = (tact ? '<td class="cmax">' : marca('cmax')) + (dn ? (mal && !tact ? '⚠ ' : '') + p(c.sOk + c.sPend, dn) + '<small>' + (c.sOk + c.sPend) + '/' + dn + '</small>' : '–') + '</td>';
        var creal = (tact ? marca('creal') : '<td class="creal">') + (mal && tact ? '⚠ ' : '') + p(c.sOk, dr) + '<small>' + c.sOk + '/' + dr + '</small></td>';
        var aviso = ab ? '<tr class="ralrow"><td colspan="6"><p class="ralerta">⚠ Ciclo ' + c.n + ': ' + (tact ? 'la concepción fue ' + Math.round(cr) + '% (' + c.sOk + ' de ' + dr + ' servicios con tacto)' : 'mucha repetición antes del tacto. La concepción máxima es ' + Math.round(mx) + '% y la concepción no va a pasar de ese número' + (c.cerrado ? ' (faltan tactar ' + c.sPend + ' servicios)' : '')) + '; lo habitual del tambo es ' + Math.round(hab) + '% (' + habTxt + ').</p></td></tr>' : '';
        return '<tr' + (c.cerrado ? '' : ' class="abierto"') + '><td><b>' + c.n + '</b> <small>' + A.fmt(c.ini).slice(0, 5) + '</small></td><td>' + c.aptas + '</td>' +
          '<td>' + p(c.serv, c.aptas) + '<small>' + c.serv + '</small></td>' +
          (c.cerrado ? creal + cmax + '<td><b>' + p(c.pren, c.aptas) + '</b><small>' + c.pren + '</small></td>'
            : '<td class="enc">en curso</td>' + cmax + '<td class="enc">–</td>') + '</tr>' + aviso;
      }).join('');
      var pevTxt = DB.config && DB.config.pev ? SRC() + ': ' + DB.config.pev : 'sin dato en ' + SRC();
      return '<section class="card rep"><h2>Reproducción cada 21 días</h2>' +
        '<label class="secfecha">Inicio de servicios <input type="date" id="ini21" value="' + ini + '" max="' + ref + '"></label>' +
        (function () { var d = iniZafra(); if (!d) return ''; return d === ini ? '<p class="cap inidef">Primer servicio a una vaca de la zafra (desde el 1 de mayo).</p>' : '<p class="cap inidef">Primer servicio de la zafra: ' + A.fmt(d) + ' · <button class="lnk" data-a="ini21def">usar esa fecha</button></p>'; })() +
        '<div class="secsel"><span>Espera voluntaria</span>' + PEVS.map(function (n) { return '<button class="fchip plain" data-pev="' + n + '" aria-pressed="' + (pev === n) + '">' + n + '</button>'; }).join('') + '<span>días <small>(' + pevTxt + ')</small></span></div>' +
        (C.length ? '<div class="kpis"><div><b>' + p(T.serv, T.aptas) + '</b><span>Tasa de servicio</span></div><div><b>' + p(T.sOk, T.sOk + T.sMal) + '</b><span>Tasa de concepción</span></div><div class="tp"><b>' + p(T.pren, T.aptas) + '</b><span>Tasa de preñez</span></div></div>' +
          '<p class="cap">Promedio de los ' + nCerr + ' ciclos cerrados.</p>' +
          torosHTML(C.svs) +
          (hayRojo ? '<p class="cap ralhint">Tocá un ⚠ en rojo para ver el aviso de ese ciclo.</p>' : '') +
          '<table class="tbl rtbl"><thead><tr><th>Ciclo</th><th>Aptas</th><th>Servicio</th><th>Concep.</th><th>Conc. máx.</th><th>Preñez</th></tr></thead><tbody>' + filas + '</tbody></table>' +
          '<p class="cap">Vacas con al menos una lactancia (sin vaquillonas). <b>Aptas:</b> vacas vacías que cumplen ' + pev + ' días posparto dentro del ciclo, no marcadas como descarte programado y en el rodeo. Una vaca servida en un ciclo anterior no es apta hasta que se la vuelva a servir o el tacto dé vacía (ahí cuenta para atrás). <b>Servicio:</b> aptas servidas / aptas. <b>Concepción:</b> servicios que preñaron / servicios con resultado conocido. <b>Conc. máx.:</b> lo mejor que puede dar el ciclo, contando como preñadas todas las servidas que no volvieron a servirse ni dieron vacía al tacto (no retorno). Solo cuenta servicios con al menos 24 días, para darles tiempo a repetir. <b style="color:var(--bad,#c0392b)">En rojo:</b> en los ciclos ya tactados (cerrados y con no más del 10% de sus servicios sin tacto) se marca la concepción; en los ciclos en curso o tactados en parte, la concepción máxima, cuando queda más de 10 puntos por debajo de la concepción habitual del tambo' + (habTxt ? ' (' + habTxt + ': ' + Math.round(hab) + '%)' : '') + '. <b>Alerta de toro o inseminador:</b> aparece cuando uno con 20 servicios o más en la temporada queda más de 10 puntos por debajo del resto en concepción máxima. <b>Preñez:</b> aptas que quedaron preñadas en el ciclo / aptas. Un ciclo queda <b>en curso</b> hasta que hay tacto 28 días después de que termina' + (C.ultTacto && C.ultTacto > '0000' ? ' (último tacto: ' + A.fmt(C.ultTacto) + ')' : '') + '.</p>'
          : '<p class="hint">Elegí una fecha de inicio anterior al ' + A.fmt(ref) + '.</p>') + '</section>';
    }
    /* ----- reproducción de vaquillonas por zafra (1/5 al 30/4): servicios antes del primer parto ----- */
    function vaqZafra(y, ref) {
      var d0 = y + '-05-01', d1 = (y + 1) + '-04-30';
      var R = { serv: 0, ok: 0, mal: 0, pend: 0, s1ok: 0, s1mal: 0, nVaq: 0, pren: 0, vac: 0, espera: 0, baja: 0, edad: [], meses: {}, toros: {}, ins: {}, det: {} };
      var an = DB.animales.map(function (a) { return { rp: a.rp, h: DB.hist[a.rp], salida: null }; }).concat((DB.bajas || []).map(function (b) { return { rp: b.key, h: DB.hist[b.key], salida: b.bFecha || null }; }));
      var f5 = function (d) { return A.fmt(d).slice(0, 5); };
      an.forEach(function (x) {
        var h = x.h; if (!h || !h.ev) return;
        var p1 = h.pa && h.pa.length ? h.pa[0][0] : '9999';
        var sv = h.ev.filter(function (e) { return e[1] === 'S' && e[0] < p1; });
        var svz = sv.filter(function (e) { return e[0] >= d0 && e[0] <= d1 && e[0] <= ref; });
        if (!svz.length) return;
        // concepción: por el parto (fecha de concepción o servicio compatible con la gestación) o por el último tacto positivo
        var conc = null, src = '';
        if (p1 !== '9999') {
          src = 'parto ' + A.fmt(p1);
          conc = h.pa[0][4] || null;
          if (!conc) { var est = A.addDays(p1, -A.GEST), best = null; sv.forEach(function (e) { var d = Math.abs(A.diffDays(e[0], est)); if (d <= 20 && (!best || d < best[1])) best = [e[0], d]; }); conc = best ? best[0] : null; }
        } else {
          // un tacto positivo solo confirma servicios de al menos 28 días antes (antes no se puede diagnosticar)
          var pos = (h.ta || []).filter(function (t) { return t[0] > sv[0][0] && esPren(t[1]); });
          if (pos.length) { var T = pos[pos.length - 1][0], antes = sv.filter(function (e) { return A.diffDays(T, e[0]) >= 28; }); conc = antes.length ? antes[antes.length - 1][0] : null; var tc = pos[pos.length - 1][1], tn = DB.codes && DB.codes[tc] ? DB.codes[tc][0] || tc : tc; src = 'tacto «' + esc(tn) + '» ' + f5(T); }
        }
        var neg = (h.ta || []).filter(function (t) { return t[0] > sv[0][0] && t[0] < p1 && !esPren(t[1]); }).map(function (t) { return t[0]; });
        R.nVaq++;
        if (h.fn && h.fn > '1980') R.edad.push(A.diffDays(svz[0][0], h.fn) / 30.44);
        svz.forEach(function (e, i) {
          var r = null, k = e[0].slice(0, 7), por = '';
          var j = sv.indexOf(e), sig = sv[j + 1] && sv[j + 1][0] <= ref ? sv[j + 1][0] : null, ng = neg.filter(function (d) { return d > e[0] && A.diffDays(d, e[0]) >= 25; })[0];
          if (conc && e[0] <= conc) { r = e[0] === conc ? 'ok' : 'mal'; por = r === 'ok' ? src : sig ? 'repitió ' + f5(sig) : src; }
          else if (!conc) {
            r = sig || ng ? 'mal' : A.diffDays(ref, e[0]) < 24 ? null : 'pend';
            por = sig ? 'repitió ' + f5(sig) : ng ? 'tacto vacía ' + f5(ng) : 'sin diagnóstico';
          }
          if (!r) return;
          (R.det[k] = R.det[k] || []).push({ rp: x.rp, f: e[0], toro: e[2] || '', r: r, por: por });
          R.serv++; R[r]++;
          var M = R.meses[k] = R.meses[k] || { ok: 0, mal: 0, pend: 0 }; M[r]++;
          var tk = String(e[2] || '').trim() || 'Sin dato de toro', B = R.toros[tk] = R.toros[tk] || { ok: 0, mal: 0, pend: 0, s1ok: 0, s1mal: 0 }; B[r]++;
          if (i === 0 && r !== 'pend') B[r === 'ok' ? 's1ok' : 's1mal']++;
          var ik = String(e[3] || '').trim() || 'Sin dato de inseminador', I = R.ins[ik] = R.ins[ik] || { ok: 0, mal: 0, pend: 0, s1ok: 0, s1mal: 0 }; I[r]++;
          if (i === 0 && r !== 'pend') I[r === 'ok' ? 's1ok' : 's1mal']++;
          if (i === 0 && r !== 'pend') R[r === 'ok' ? 's1ok' : 's1mal']++;
        });
        var cz = conc && conc >= d0 && conc <= d1;
        if (cz) R.pren++;
        else if (x.salida) R.baja++;
        else if (conc) R.espera++; // preñada antes de la zafra (no debería pasar)
        else { var ult = svz[svz.length - 1][0], fallo = neg.some(function (d) { return d > ult && A.diffDays(d, ult) >= 25; }); if (fallo) R.vac++; else R.espera++; }
      });
      R.edad.sort(function (a, b) { return a - b; });
      R.edadMed = R.edad.length ? R.edad[Math.floor(R.edad.length / 2)] : null;
      return R;
    }
    // por semen (toro): los de 5 servicios o más, el resto junto en "Otros"
    function torosVaqHTML(Z, zt, campo, titulo, col) {
      campo = campo || 'toros'; titulo = titulo || 'Por semen'; col = col || 'Toro';
      var p = function (n, d) { return d ? Math.round(n / d * 100) + '%' : '–'; };
      var G = Z[campo], L = Object.keys(G).map(function (k) { var b = G[k]; return { k: k, b: b, n: b.ok + b.mal + b.pend }; }).sort(function (a, b) { return b.n - a.n; });
      if (!L.length) return '';
      var big = L.filter(function (t) { return t.n >= 5; }), chic = L.filter(function (t) { return t.n < 5; });
      if (chic.length) { var o = { ok: 0, mal: 0, pend: 0, s1ok: 0, s1mal: 0 }; chic.forEach(function (t) { Object.keys(o).forEach(function (q) { o[q] += t.b[q]; }); }); big.push({ k: 'Otros (' + chic.length + ')', b: o, n: o.ok + o.mal + o.pend, otros: true }); }
      return '<h3 class="vh3">' + titulo + ' · zafra ' + zt + '</h3><table class="tbl rtbl vtbl"><thead><tr><th>' + col + '</th><th>Serv.</th><th>1er serv.</th><th>Concep.</th><th>Conc. máx.</th></tr></thead><tbody>' +
        big.map(function (t) { var b = t.b; return '<tr><td>' + (t.otros ? '<i>' + esc(t.k) + '</i>' : '<b>' + esc(t.k) + '</b>') + '</td><td>' + t.n + '</td><td>' + p(b.s1ok, b.s1ok + b.s1mal) + '<small>' + b.s1ok + '/' + (b.s1ok + b.s1mal) + '</small></td><td>' + p(b.ok, b.ok + b.mal) + '<small>' + b.ok + '/' + (b.ok + b.mal) + '</small></td><td>' + p(b.ok + b.pend, t.n) + '</td></tr>'; }).join('') +
        '</tbody></table>' + (campo === 'ins' ? '<p class="cap">Con pocos servicios (menos de 20) la diferencia entre toros o inseminadores puede ser casualidad.</p>' : '');
    }
    function vaqHTML() {
      if (DB.fuente !== 'syscaw' || !DB.hist) return '';
      var ref = DB.fecha || today(), y = +ref.slice(0, 4); if (ref.slice(5) < '05-01') y--;
      var Z = vaqZafra(y, ref), Za = vaqZafra(y - 1, ref);
      if (!Z.nVaq && !Za.nVaq) return '';
      var p = function (n, d) { return d ? Math.round(n / d * 100) + '%' : '–'; };
      var zt = function (a) { return a + '-' + String(a + 1).slice(2); };
      var f5x = function (d) { return A.fmt(d).slice(0, 5); };
      // vaquillonas en el rodeo de 15 meses o más que todavía no tienen servicio
      var sinS = DB.animales.filter(function (a) { if (a.cat !== 'vaquillona') return false; var h = DB.hist[a.rp]; if (!h || !h.fn || A.diffDays(ref, h.fn) < 15 * 30.44) return false; return !h.ev.some(function (e) { return e[1] === 'S'; }); }).length;
      var fila = function (t, f, b) { return '<tr><td>' + t + '</td><td><b>' + f(Z) + '</b></td><td>' + (Za.nVaq ? f(Za) : '–') + '</td></tr>'; };
      var RL = { ok: 'Preñó', mal: 'No preñó', pend: 'Sin resultado' };
      var meses = Object.keys(Z.meses).sort().map(function (k) {
        var m = Z.meses[k], dn = m.ok + m.mal + m.pend, ab = state.vaqMes === k;
        var det = ab ? '<tr class="ralrow"><td colspan="4"><div class="vdet">' + (Z.det[k] || []).sort(function (a, b) { return a.f < b.f ? -1 : 1; }).map(function (d) {
          return '<button class="vdrow" data-rp="' + esc(d.rp) + '"><b>' + esc(d.rp) + '</b><span>' + f5x(d.f) + (d.toro ? ' · ' + esc(d.toro) : '') + '</span><span class="vr ' + d.r + '">' + RL[d.r] + '<small>' + d.por + '</small></span></button>';
        }).join('') + '</div></td></tr>' : '';
        return '<tr class="vmes" data-vmes="' + k + '" aria-expanded="' + ab + '"><td>' + A.MESES[+k.slice(5, 7) - 1] + ' <small>' + k.slice(2, 4) + '</small></td><td>' + dn + '</td><td>' + p(m.ok, m.ok + m.mal) + '<small>' + m.ok + '/' + (m.ok + m.mal) + '</small></td><td>' + p(m.ok + m.pend, dn) + '</td></tr>' + det;
      }).join('');
      return '<section class="card rep"><h2>Reproducción de vaquillonas</h2>' +
        '<p class="cap">Servicios antes del primer parto, por zafra (del 1 de mayo al 30 de abril).</p>' +
        (Z.nVaq ? '<div class="kpis"><div><b>' + p(Z.s1ok, Z.s1ok + Z.s1mal) + '</b><span>Concepción 1er servicio</span></div><div><b>' + p(Z.ok, Z.ok + Z.mal) + '</b><span>Concepción</span></div><div class="tp"><b>' + p(Z.pren, Z.nVaq - Z.baja) + '</b><span>Preñadas</span></div></div>' : '<p class="hint">Todavía no hay vaquillonas servidas en la zafra ' + zt(y) + '.</p>') +
        '<table class="tbl rtbl vtbl"><thead><tr><th></th><th>Zafra ' + zt(y) + '</th><th>Zafra ' + zt(y - 1) + '</th></tr></thead><tbody>' +
        fila('Vaquillonas servidas', function (R) { return nf(R.nVaq); }) +
        fila('Preñadas', function (R) { return nf(R.pren) + ' <small>' + p(R.pren, R.nVaq - R.baja) + '</small>'; }) +
        fila('Vacías al tacto', function (R) { return nf(R.vac); }) +
        fila('Servidas sin resultado', function (R) { return nf(R.espera); }) +
        fila('Concepción 1er servicio', function (R) { return p(R.s1ok, R.s1ok + R.s1mal) + ' <small>' + R.s1ok + '/' + (R.s1ok + R.s1mal) + '</small>'; }) +
        fila('Concepción (todos)', function (R) { return p(R.ok, R.ok + R.mal) + ' <small>' + R.ok + '/' + (R.ok + R.mal) + '</small>'; }) +
        fila('Servicios por preñez', function (R) { return R.ok ? nf((R.ok + R.mal) / R.ok, 1) : '–'; }) +
        fila('Edad al 1er servicio', function (R) { return R.edadMed != null ? nf(R.edadMed, 1) + ' <small>meses</small>' : '–'; }) +
        '</tbody></table>' +
        (sinS ? '<p class="cap"><b>' + sinS + (sinS === 1 ? ' vaquillona' : ' vaquillonas') + '</b> de 15 meses o más en el rodeo todavía sin servicio.</p>' : '') +
        torosVaqHTML(Z, zt(y)) + torosVaqHTML(Z, zt(y), 'ins', 'Por inseminador', 'Inseminador') +
        (meses ? '<h3 class="vh3">Por mes · zafra ' + zt(y) + '</h3><p class="cap">Tocá un mes para ver cada vaquillona y de dónde sale su resultado.</p><table class="tbl rtbl"><thead><tr><th>Mes</th><th>Servicios</th><th>Concep.</th><th>Conc. máx.</th></tr></thead><tbody>' + meses + '</tbody></table>' : '') +
        '<p class="cap"><b>Concepción:</b> servicios que preñaron / servicios con resultado conocido (por tacto, parto o nuevo servicio). <b>Conc. máx.:</b> contando como preñadas las servidas que no repitieron ni dieron vacía al tacto (solo servicios con 24 días o más). <b>Preñadas:</b> vaquillonas que quedaron preñadas en la zafra / servidas que siguen en el rodeo o se preñaron antes de salir. <b>Edad al 1er servicio:</b> mediana. Las vaquillonas vendidas o muertas sin preñez no cuentan para el % de preñadas.</p>' +
        '</section>';
    }
    // alertas por toro e inseminador en la temporada: aviso solo cuando uno repite claramente más que el resto (sin tabla)
    function torosHTML(svs) {
      var grupo = function (campo, quien) {
        var G = {}, tot = { ok: 0, pend: 0, mal: 0 }, out = [];
        svs.forEach(function (s) { var k = String(s[campo] || '').trim(); if (!k) return; G[k] = G[k] || { ok: 0, pend: 0, mal: 0 }; G[k][s.r]++; tot[s.r]++; });
        Object.keys(G).forEach(function (k) {
          var g = G[k], n = g.ok + g.pend + g.mal, rn = tot.ok + tot.pend + tot.mal - n;
          if (n < 20 || rn < 20) return;
          var mx = (g.ok + g.pend) / n * 100, rmx = (tot.ok - g.ok + tot.pend - g.pend) / rn * 100;
          if (mx < rmx - 10) out.push('<p class="ralerta">⚠ ' + quien + ' <b>' + esc(k) + '</b> repite más que el resto: ' + Math.round(mx) + '% de concepción máxima contra ' + Math.round(rmx) + '% del resto (' + n + ' servicios en la temporada).</p>');
        });
        return out;
      };
      // una sola línea; los avisos se ven al tocarla
      var T = grupo('toro', 'El toro'), I = grupo('ins', 'El inseminador'), n = T.length + I.length;
      if (!n) return '';
      var qu = T.length && I.length ? 'toro o inseminador' : T.length ? (T.length === 1 ? 'toro' : 'toros') : (I.length === 1 ? 'inseminador' : 'inseminadores');
      var txt = n === 1 ? '1 ' + qu + ' repite más que el resto' : n + ' ' + qu + (T.length && I.length ? '' : '') + ' repiten más que el resto';
      if (T.length && I.length) txt = n + ' avisos de toro o inseminador';
      return '<button class="ralbtn" data-a="toroal" aria-expanded="' + !!state.toroAb + '"><span>⚠ ' + txt + '</span><span class="chev">' + (state.toroAb ? 'ocultar' : 'ver') + '</span></button>' +
        (state.toroAb ? T.concat(I).join('') : '');
    }
    // Rodeo: vacas en ordeñe y secas, promedio diario de los 12 meses que terminan en el mes elegido
    var VOVSC = { k: null, r: null };
    // los 12 meses que terminan en el mes elegido ("Hasta el mes"), compartidos por Vacas en ordeñe y secas y Partos ocurridos
    function rangoVO() {
      var ref = DB.fecha || today(), maxMes = ref.slice(0, 7);
      // las bajas solo se guardan de los últimos 2 años: no dejar elegir meses donde el rodeo quedaría incompleto
      var dh = DB.desdeHist != null ? DB.desdeHist : A.addDays(ref, -730), minMes = '';
      if (dh && dh > '0000') { var y0 = +dh.slice(0, 4), m0 = +dh.slice(5, 7) + (dh.slice(8, 10) === '01' ? 0 : 1) + 11; while (m0 > 12) { m0 -= 12; y0++; } minMes = y0 + '-' + pad2(m0); if (minMes > maxMes) minMes = maxMes; }
      var fin = state.vomes && state.vomes <= maxMes && (!minMes || state.vomes >= minMes) ? state.vomes : maxMes;
      var y = +fin.slice(0, 4), m = +fin.slice(5, 7), M = [];
      for (var i = 11; i >= 0; i--) { var mm = m - i, yy = y; while (mm < 1) { mm += 12; yy--; } M.push({ key: yy + '-' + pad2(mm), label: A.MESES[mm - 1], anio: yy }); }
      var k = (DB.guardada || 0) + '|' + (DB.sel ? DB.sel.join(',') : '') + '|' + fin;
      if (VOVSC.k !== k) VOVSC = { k: k, r: vovsMeses(M) };
      return { M: M, fin: fin, minMes: minMes, maxMes: maxMes, y: y, m: m, R: VOVSC.r };
    }
    function selMesHTML(G, id) { return '<label class="secfecha">Hasta el mes <input type="month" id="' + id + '" value="' + G.fin + '"' + (G.minMes ? ' min="' + G.minMes + '"' : '') + ' max="' + G.maxMes + '"></label>'; }
    // Partos ocurridos en los 12 meses: vacas y vaquillonas (sin abortos), en % de la vaca masa promedio
    function partosOcHTML() {
      if (DB.fuente !== 'syscaw' || !DB.hist) return '';
      var G = rangoVO(), M = G.M, keys = M.map(function (x) { return x.key; }), pv = M.map(function () { return 0; }), pq = pv.slice(), ab = 0;
      infLista().forEach(function (x) { x.h.pa.forEach(function (p) {
        var k = keys.indexOf(p[0].slice(0, 7)); if (k < 0 || !enSel(unidadEn(x, p[0]))) return;
        if (/^A/.test(p[2] || '')) { ab++; return; }
        if (p[1] === 1) pq[k]++; else pv[k]++;
      }); });
      var tv = pv.reduce(function (a, b) { return a + b; }, 0), tq = pq.reduce(function (a, b) { return a + b; }, 0);
      var vms = G.R.vm.filter(function (v) { return v != null; }), vm = vms.length ? vms.reduce(function (a, b) { return a + b; }, 0) / vms.length : null;
      var pc = function (n) { return vm ? nf(n / vm * 100, 1) + '%' : '–'; };
      var max = Math.max.apply(null, pv.map(function (v, i) { return v + pq[i]; })) || 1, W = 340, H = 160, padx = 6, gap = 5, bw = (W - padx * 2 - gap * 11) / 12, s = '', kk = (H - 48) / max;
      M.forEach(function (mo, i) {
        var x = padx + i * (bw + gap), base = H - 26, hv = pv[i] * kk, hq = pq[i] * kk, t = pv[i] + pq[i];
        if (t) {
          if (hv) s += '<rect class="mbv" x="' + x.toFixed(1) + '" y="' + (base - hv).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hv.toFixed(1) + '"><title>' + mo.label + ': ' + pv[i] + ' vacas</title></rect>';
          if (hq) s += '<rect class="mbq" x="' + x.toFixed(1) + '" y="' + (base - hv - hq).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hq.toFixed(1) + '"><title>' + mo.label + ': ' + pq[i] + ' vaquillonas</title></rect>';
          s += numsDentro(x, bw, base, hv, hq, pv[i], pq[i]);
          s += '<text class="mval" x="' + (x + bw / 2).toFixed(1) + '" y="' + (base - hv - hq - 4).toFixed(1) + '" text-anchor="middle">' + t + '</text>';
        } else s += '<rect class="mzero" x="' + x.toFixed(1) + '" y="' + (H - 28) + '" width="' + bw.toFixed(1) + '" height="2" rx="1"/>';
        s += '<text class="mlbl" x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 12) + '" text-anchor="middle">' + mo.label + '</text>';
        if (mo.label === 'ene' || i === 0) s += '<text class="myear" x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 1) + '" text-anchor="middle">' + String(mo.anio).slice(2) + '</text>';
      });
      return '<section class="card"><h2>Partos ocurridos</h2>' + selMesHTML(G, 'pomes') +
        '<div class="kpis kpis2"><div><b>' + nf(tv) + '</b><span>Partos de vacas · ' + pc(tv) + '</span></div><div><b>' + nf(tq) + '</b><span>Partos de vaquillonas · ' + pc(tq) + '</span></div></div>' +
        '<div class="mleg"><span><i class="v"></i>Vacas</span><span><i class="q"></i>Vaquillonas</span></div>' +
        '<svg class="mchart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Partos ocurridos por mes, vacas y vaquillonas">' + s + '</svg>' +
        '<p class="cap">Partos de los 12 meses que terminan en ' + A.MESES[G.m - 1] + ' ' + G.y + ', sin abortos' + (ab ? ' (hubo ' + ab + ')' : '') + '. Los % son sobre la vaca masa promedio de esos meses (ordeñe + secas: ' + (vm != null ? nf(vm) : '–') + '). El mes del respaldo puede estar incompleto.</p></section>';
    }
    function vovsHTML() {
      if (DB.fuente !== 'syscaw' || !DB.hist) return '';
      var G = rangoVO(), M = G.M, fin = G.fin, minMes = G.minMes, maxMes = G.maxMes, y = G.y, m = G.m;
      var R = G.R, r0 = function (v) { return v == null ? null : Math.round(v); };
      var W = 340, H = 170, padx = 6, gap = 5, bw = (W - padx * 2 - gap * 11) / 12, s = '';
      var max = Math.max.apply(null, R.vm.map(function (v) { return v || 0; })) || 1, kk = (H - 48) / max;
      M.forEach(function (mo, i) {
        var x = padx + i * (bw + gap), base = H - 26, o = r0(R.vo[i]), se = r0(R.vs[i]);
        if (o != null) {
          s += '<rect class="pord" x="' + x.toFixed(1) + '" y="' + (base - o * kk).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (o * kk).toFixed(1) + '"/>';
          if (se) s += '<rect class="psec" x="' + x.toFixed(1) + '" y="' + (base - (o + se) * kk).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (se * kk).toFixed(1) + '"/>';
          s += '<text class="mval" x="' + (x + bw / 2).toFixed(1) + '" y="' + (base - (o + (se || 0)) * kk - 4).toFixed(1) + '" text-anchor="middle">' + (o + (se || 0)) + '</text>';
        }
        s += '<text class="mlbl" x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 12) + '" text-anchor="middle">' + mo.label + '</text>';
        if (mo.label === 'ene' || i === 0) s += '<text class="myear" x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 1) + '" text-anchor="middle">' + String(mo.anio).slice(2) + '</text>';
      });
      var av = function (l) { var v = l.filter(function (x) { return x != null; }); return v.length ? v.reduce(function (a1, b1) { return a1 + b1; }, 0) / v.length : null; };
      var filas = M.map(function (mo, i) { var o = r0(R.vo[i]), se = r0(R.vs[i]); return '<tr><td>' + mo.label + ' ' + String(mo.anio).slice(2) + '</td><td>' + (o != null ? o : '–') + '</td><td>' + (se != null ? se : '–') + '</td><td>' + (o != null ? o + (se || 0) : '–') + '</td><td>' + (o != null && o + se ? pct(o, o + se) : '–') + '</td></tr>'; }).reverse().join('');
      var ao = av(R.vo), as = av(R.vs);
      // vacas adultas (con al menos un parto) vendidas y muertas en los mismos 12 meses, sobre la vaca masa promedio
      var d0 = M[0].key + '-01', d1 = A.addDays((m === 12 ? (y + 1) + '-01' : y + '-' + pad2(m + 1)) + '-01', -1), BJ = { venta: 0, muerte: 0, baja: 0 }, MV = {};
      (DB.bajas || []).forEach(function (b) {
        if (!b.bFecha || b.bFecha < d0 || b.bFecha > d1) return;
        var h = DB.hist[b.key], adulta = h && h.pa ? h.pa.some(function (pp) { return pp[0] <= b.bFecha; }) : (b.cat === 'vaca' || b.cat === 'seca');
        if (!adulta) return;
        BJ[b.bTipo in BJ ? b.bTipo : 'baja']++;
        if (b.bTipo === 'venta') { var cz = (b.bCausa || '').trim() || 'Sin motivo'; MV[cz] = (MV[cz] || 0) + 1; }
      });
      var vmp = ao != null ? ao + (as || 0) : null, pv = function (n) { return vmp ? nf(n / vmp * 100, 1) + '%' : '–'; }, nb = BJ.venta + BJ.muerte + BJ.baja;
      var bajasH = '<h3 class="h">Vacas adultas vendidas y muertas</h3>' +
        '<div class="kpis"><div><b>' + BJ.venta + '</b><span>Vendidas · ' + pv(BJ.venta) + '</span></div><div><b>' + BJ.muerte + '</b><span>Muertas · ' + pv(BJ.muerte) + '</span></div><div class="tp"><b>' + pv(nb) + '</b><span>Total ' + nb + (BJ.baja ? ' (' + BJ.baja + ' sin tipo)' : '') + '</span></div></div>' +
        motivosHTML(MV, BJ.venta) +
        '<p class="cap">Vacas con al menos un parto dadas de baja en ' + SRC() + ' entre el ' + A.fmt(d0) + ' y el ' + A.fmt(d1) + '. El % es sobre la vaca masa promedio de esos 12 meses (ordeñe + secas: ' + (vmp != null ? nf(vmp) : '–') + ').</p>';
      return '<section class="card"><h2>Vacas en ordeñe y secas</h2>' +
        selMesHTML(G, 'vomes') +
        '<div class="kpis"><div><b>' + (ao != null ? nf(ao) : '–') + '</b><span>En ordeñe, promedio</span></div><div><b>' + (as != null ? nf(as) : '–') + '</b><span>Secas, promedio</span></div><div class="tp"><b>' + (ao != null && ao + as ? pct(ao, ao + as) : '–') + '</b><span>En ordeñe / total</span></div></div>' +
        '<div class="mleg"><span><i class="pord"></i>En ordeñe</span><span><i class="psec"></i>Secas</span></div>' +
        '<svg class="mchart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Vacas en ordeñe y secas por mes">' + s + '</svg>' +
        '<table class="tbl ptbl"><thead><tr><th>Mes</th><th>Ordeñe</th><th>Secas</th><th>Total</th><th>% ordeñe</th></tr></thead><tbody>' + filas + '</tbody></table>' +
        '<p class="cap">Promedio de todos los días de cada mes, calculado con los partos, secados y bajas de ' + SRC() + '.</p>' + bajasH + '</section>';
    }
    // línea de proporción de motivos de venta: los 5 más frecuentes y el resto en "Otros"
    var MCOL = ['#2E6FBA', '#D08A1E', '#3C9A6B', '#B5486B', '#7A5CC4', '#8A8F98'];
    function motivosHTML(MV, tot) {
      if (!tot) return '';
      var L = Object.keys(MV).map(function (k) { return [k, MV[k]]; }).sort(function (a, b) { return b[1] - a[1] || (a[0] < b[0] ? -1 : 1); });
      if (L.length > 6) { var resto = L.slice(5).reduce(function (t, x) { return t + x[1]; }, 0); L = L.slice(0, 5).concat([['Otros', resto]]); }
      var bar = L.map(function (x, i) { return '<i style="flex:' + x[1] + ';background:' + MCOL[i] + '" title="' + esc(x[0]) + ': ' + x[1] + '"></i>'; }).join('');
      var leg = L.map(function (x, i) { return '<li><i style="background:' + MCOL[i] + '"></i><span>' + esc(x[0]) + '</span><b>' + Math.round(x[1] / tot * 100) + '%</b><small>' + x[1] + '</small></li>'; }).join('');
      return '<h3 class="h">Motivos de venta</h3><div class="pbar" role="img" aria-label="Proporción de motivos de venta">' + bar + '</div><ul class="pleg">' + leg + '</ul>';
    }
    // Línea de vida del tambo (reemplaza el cuadro de animales por categoría)
    var LVC = { k: null, r: null };
    function vidaFoto(r) { var o = {}, rd = function (x) { return x == null ? null : Math.round(x * 10) / 10; };
      ['e1s', 'ePren', 'spcV', 'e1p', 'iep', 'salEdad', 'salLac', 'seca', 'gP', 'gM'].forEach(function (k) { o[k] = rd(r[k]); });
      o.l1da = rd(r.l1.da); o.lada = rd(r.la.da); o.l1pc = rd(r.l1.pc); o.lapc = rd(r.la.pc); o.l1spc = rd(r.l1.spc); o.laspc = rd(r.la.spc); return o; }
    function vidaHTML() {
      if (DB.fuente !== 'syscaw' || !DB.hist) return '';
      var k = (DB.guardada || 0) + '|' + (DB.sel ? DB.sel.join(',') : '') + '|' + DB.animales.length;
      if (LVC.k !== k) {
        var L = DB.animales.map(function (a) { return { h: DB.hist[a.rp], baja: null }; })
          .concat((DB.bajas || []).map(function (b) { return { h: DB.hist[b.key], baja: b.bFecha || null }; }));
        var ref = DB.fecha || today(), r = null; try { r = A.lineaVida(L, esPren, ref); } catch (e) { r = null; }
        // foto fija al 1 de julio: se calcula una sola vez (con el primer respaldo posterior) y queda guardada para comparar
        var t = tamboAct(), y = +ref.slice(0, 4) - (ref.slice(5) < '07-01' ? 1 : 0), fj = y + '-07-01', sk = DB.sel ? DB.sel.join(',') : '', ant = null;
        if (r && t) {
          t.vida = t.vida || {}; var V = t.vida[sk] || (t.vida[sk] = {});
          if (!V[fj] && fj > (DB.desdeHist || '0000')) { try { var f = A.lineaVida(L, esPren, fj); if (f.nE1p || f.l1.n || f.la.n) { V[fj] = vidaFoto(f); saveTambos(); } } catch (e) {} }
          // se compara con la última foto que tenga al menos 6 meses de diferencia con este respaldo
          Object.keys(V).sort().forEach(function (d) { if (A.diffDays(ref, d) >= 180) ant = { f: d, v: V[d] }; });
        }
        LVC = { k: k, r: r, ant: ant };
      }
      var r = LVC.r, ant = LVC.ant; if (!r) return '';
      var vs = function (key, d, u) { var x = ant && ant.v[key]; return x == null ? '' : '<span class="lvant">jul ' + ant.f.slice(2, 4) + ': ' + n1(x, d) + (u || '') + '</span>'; };
      var n1 = function (x, d) { return x == null ? '–' : nf(x, d == null ? 1 : d); };
      var nom = (PERFIL.nombre || '').split(' - ')[0].trim();
      // regla de edad: nacimiento → salida
      var e2p = r.e1p != null && r.iep != null ? r.e1p + r.iep / 30.44 : null, eSal = r.salEdad != null ? r.salEdad * 12 : null;
      var fin = eSal != null && eSal > (r.e1p || 0) ? eSal : null, maxM = Math.max(fin || e2p || r.e1p || 36, 36) * 1.02, W = 340, x0 = 8, x1 = W - 8, X = function (v) { return x0 + (x1 - x0) * v / maxM; };
      var svg = '<rect class="lvbar" x="' + x0 + '" y="30" width="' + (x1 - x0) + '" height="14" rx="7"/>', lb = function (x, y, t, c, an) { return '<text class="' + c + '" x="' + x.toFixed(1) + '" y="' + y + '" text-anchor="' + (an || 'middle') + '">' + t + '</text>'; };
      if (r.e1p != null) {
        var xp = X(r.e1p), xf = fin != null ? X(fin) : x1;
        svg += '<rect class="lvrec" x="' + x0 + '" y="30" width="' + (xp - x0).toFixed(1) + '" height="14" rx="7"/><rect class="lvpro" x="' + xp.toFixed(1) + '" y="30" width="' + (xf - xp).toFixed(1) + '" height="14" rx="7"/>';
        svg += lb((x0 + xp) / 2, 22, 'Recría', 'lvlb') + lb((xp + xf) / 2, 22, 'En producción' + (r.salLac != null ? ' · ' + n1(r.salLac) + ' lactancias' : ''), 'lvlb');
        [r.e1s, r.ePren].forEach(function (v) { if (v != null) svg += '<circle class="lvdot" cx="' + X(v).toFixed(1) + '" cy="37" r="3.5"/>'; });
        if (e2p != null) svg += '<circle class="lvdot" cx="' + X(e2p).toFixed(1) + '" cy="37" r="3.5"/>';
        svg += lb(x0, 62, 'Nace', 'lvval', 'start') + lb(xp, 62, '1er parto ' + n1(r.e1p) + ' m', 'lvval', xp > W * 0.6 ? 'end' : 'middle') + (fin != null ? lb(xf, 62, 'Sale ' + n1(fin / 12) + ' años', 'lvval', 'end') : '');
      }
      var paso = function (cls, ico, tit, big, det) { return '<li class="lv-' + cls + '"><span class="lvi">' + ico + '</span><div><h4>' + tit + '</h4><b>' + big + '</b>' + (det ? '<small>' + det + '</small>' : '') + '</div></li>'; };
      var lac = function (G, cls, tit, kk) {
        if (!G.nPc && !G.n) return '';
        return paso(cls, cls === 'l1' ? '1ª' : '2ª+', tit, (G.da != null ? n1(G.da, 0) + ' días' : '–') + '<em> abiertos</em>' + vs(kk + 'da', 0, ' d'),
          [G.pc != null ? '<b>' + n1(G.pc, 0) + '</b> días al 1er celo o servicio' : null, G.spc != null ? '<b>' + n1(G.spc) + '</b> servicios por preñez' : null, G.pren150 != null ? Math.round(G.pren150 * 100) + '% preñadas (de ' + G.n + ')' : null].filter(Boolean).join(' · '));
      };
      var lista = '<ol class="lvlist">' +
        paso('n', '●', 'Nace', 'Empieza la recría', '') +
        (r.e1s != null ? paso('s', '1', 'Primer servicio', n1(r.e1s) + ' meses<em> de edad</em>' + vs('e1s', 1, ' m'), 'De ' + r.nE1s + ' vaquillonas') : '') +
        (r.spcV != null || r.ePren != null ? paso('p', '✓', 'Se preña', (r.ePren != null ? n1(r.ePren) + ' meses' : '–') + '<em> de edad</em>' + vs('ePren', 1, ' m'), r.spcV != null ? '<b>' + n1(r.spcV) + '</b> servicios por preñez (de ' + r.nSpcV + ')' : '') : '') +
        (r.e1p != null ? paso('r', '★', 'Primer parto', n1(r.e1p) + ' meses<em> de edad</em>' + vs('e1p', 1, ' m'), 'De ' + r.nE1p + ' partos de vaquillona') : '') +
        lac(r.l1, 'l1', 'Primera lactancia', 'l1') +
        (r.iep != null ? paso('r', '↻', 'Intervalo entre partos', n1(r.iep, 0) + ' días' + vs('iep', 0, ' d'), n1(r.iep / 30.44) + ' meses (de ' + r.nIep + ')') : '') +
        lac(r.la, 'la', 'Vacas adultas (2ª lactancia o más)', 'la') +
        (r.nSal ? paso('x', '→', 'Sale del tambo', (r.salEdad != null ? n1(r.salEdad) + ' años' : '–') + '<em> de edad</em>' + vs('salEdad', 1, ' años'), (r.salLac != null ? 'Con <b>' + n1(r.salLac) + '</b> lactancias en promedio' : '') + ' · ' + r.nSal + ' vacas vendidas o muertas en 12 meses') : '') +
        '</ol>';
      var chip = function (v, t, n, key) { var x = ant && ant.v[key]; return v == null ? '' : '<div><b>' + n1(v, 0) + '<em> días</em></b><span>' + t + '</span><small>' + (x != null ? 'jul ' + ant.f.slice(2, 4) + ': ' + n1(x, 0) + ' d' : 'de ' + n) + '</small></div>'; };
      var extra = chip(r.seca, 'Seca', r.nSeca, 'seca') + chip(r.gP, 'Gestación primíparas', r.nGP, 'gP') + chip(r.gM, 'Gestación multíparas', r.nGM, 'gM');
      if (extra) lista += '<div class="lvx">' + extra + '</div>';
      return '<section class="card lvcard"><h2>La vaca ' + esc(nom || 'del tambo') + '</h2><p class="cap" style="margin:0 0 6px">La vida promedio de una vaca en este tambo.</p>' +
        '<svg class="lvsvg" viewBox="0 0 ' + W + ' 70" role="img" aria-label="Línea de vida: edad promedio en cada etapa">' + svg + '</svg>' + lista +
        '<p class="cap">Promedios con lo que pasó desde el ' + A.fmt(r.desde) + ' (salida: últimos 12 meses), según ' + SRC() + '. Mismas reglas que el índice: parto al primer celo o servicio; días abiertos hasta el servicio que coincide con el parto siguiente o el último antes del tacto positivo, y las vacas que siguen vacías con 150 días o más cuentan con los días que llevan (tope 300); servicios por preñez con tope 6. % preñadas: de las vacas con 150 días o más de paridas. Seca: del cierre de la lactancia al parto siguiente. Gestación: del servicio de la preñez hasta el parto.' + (ant ? ' En gris, la foto fija del 1/7/' + ant.f.slice(0, 4) + ' (los mismos 24 meses hasta esa fecha), para ver la evolución.' : ' Cada 1 de julio se guarda una foto fija de estos números para comparar con los años siguientes.') + '</p></section>';
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
      var probables = '<section class="card"><h2>Proyección de partos</h2>' +
        '<div class="mleg"><span><i class="v"></i>Vacas <b>' + nf(sv) + '</b></span><span><i class="q"></i>Vaquillonas <b>' + nf(sq) + '</b></span></div>' +
        mesesStack(rv.meses, rq.meses) +
        (despues ? '<p class="cap">Además, ' + despues + ' después de ese período.</p>' : '') + '</section>';
      // orden: lo que pasó (partos, ordeñe y secas), lo que viene (partos, rodeo), y después índice, reproducción y línea de vida
      return '<h1 class="ptitle">Rodeo</h1>' + catsHTML() +
        partosOcHTML() + vovsHTML() + probables + proyHTML() + idxCardHTML() + repHTML() + vidaHTML();
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
      var aviso = '';
      return '<h1 class="ptitle">Rodeo</h1>' + catsHTML() +
        '<section class="card fijo"><h2>' + nf(r.total) + ' ' + nombreGrupo(r.total) + '</h2><div class="comp" role="img" aria-label="Composición del rodeo por estado">' + seg + '</div><div class="legend">' + leg + '</div></section>' +
        (state.cat === 'ternera' ? '' : '<section class="card"><h2>Proyección de partos</h2>' + mesesChart(r.meses) + '<p class="cap">Los meses en blanco todavía dependen de vacas sin tacto; se completan con los próximos respaldos.</p>' + aviso + (r.despues ? '<p class="cap">Además, ' + r.despues + ' después de ese período.</p>' : '') + '</section>') +
        (r.leche != null ? '<section class="card"><h2>Producción</h2>' + kv([['Litros por vaca, último control', nf(r.leche, 1) + ' lts'], ['Vacas con control lechero', nf(r.nLeche)], ['Días en lactancia, promedio', r.dLac != null ? nf(r.dLac) : null]]) + '</section>' : '') + rod +
        (state.cat === 'vaca' || state.cat === 'seca' ? vovsHTML() + idxCardHTML() : '') +
        (state.cat === 'vaquillona' ? vaqHTML() : '');
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
    /* ----- índice del tambo ----- */
    var IDXC = { k: null, r: null };
    function IDX() {
      if (!DB.hist || !DB.codes) return null;
      var k = (DB.guardada || 0) + '|' + (DB.sel ? DB.sel.join(',') : '') + '|' + DB.animales.length;
      if (IDXC.k === k) return IDXC.r;
      var ad = DB.animales.filter(function (a) { return !a.cat || a.cat === 'vaca' || a.cat === 'seca'; });
      var r = null;
      try { r = A.indice(ad, DB.hist, esPren, DB.fecha || today(), esVacia); if (r.n < 10) r = null; } catch (e) { r = null; }
      IDXC = { k: k, r: r };
      return r;
    }
    function idxDe(a) { var r = IDX(); return r ? r.por[a.rp] || null : null; }
    function nf1(n) { return n == null ? '–' : nf(n, n < 10 ? 1 : 0); }
    function idxMini(V, r) {
      return [V.a.rech ? '<b class="perd">Descarte' + ': ' + esc(V.a.rechDet || V.a.rech) + '</b>' : null, V.perd ? '<b class="perd">' + V.perd + (V.perd === 1 ? ' pérdida' : ' pérdidas') + '</b>' : null, V.m.da != null ? nf(V.m.da) + ' d abiertos' : null, V.m.spc != null ? nf(V.m.spc, 1) + ' serv' : null, V.m.pc != null ? nf(V.m.pc) + ' d a celo' : null, lecheTxt(V, r)].filter(Boolean).join(' · ');
    }
    function lecheTxt(V, r) {
      if (V.mlit == null) return null;
      return nf(V.mlit) + ' L' + (V.msol != null && r.hayAn ? ' · ' + nf(V.msol) + ' kg sól.' : '');
    }
    function idxNum(V) { return '<b class="ixn' + (V.tier ? ' ix-' + V.tier : '') + '">' + V.idx + '</b>'; }
    var MEDALLA = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M8 2h8l-2 6h-4z" fill="currentColor" opacity=".55"/><circle cx="12" cy="15" r="6" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 12l.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3z" fill="currentColor"/></svg>';
    function idxCardHTML() {
      var r = IDX(); if (!r) return '';
      var ver = state.idxVer || 'top';
      var L = ver === 'top' ? r.vacas.slice(0, r.k10) : ver === 'peor' ? r.vacas.slice(-r.k10).reverse() : r.vacas;
      var lim = ver === 'todas' ? (state.idxN || 40) : L.length;
      var chips = '<div class="filters" role="group" aria-label="Ranking">' + [['top', 'Mejores 10%'], ['peor', 'Peores 10%'], ['todas', 'Todas (' + r.n + ')']].map(function (v) {
        return '<button class="fchip" data-iv="' + v[0] + '" aria-pressed="' + (ver === v[0]) + '">' + v[1] + '</button>';
      }).join('') + '</div>';
      return '<section class="card"><h2>Índice del tambo</h2>' +
        '<p class="cap" style="margin:0 0 10px">100 = promedio de las ' + r.n + ' vacas de este tambo. Toda la vida de cada vaca: días abiertos, servicios por concepción, parto a primer celo y leche a 305 días (' + (r.usaSol ? 'comparada en kg de sólidos' : r.hayAn ? 'comparada en litros: los análisis de sólidos no son regulares' : 'en litros, sin análisis de sólidos') + ').</p>' + chips +
        L.slice(0, lim).map(function (V) { return rowHTML(V.a, { right: idxNum(V), sub: (ver === 'todas' ? V.puesto + 'º · ' : '') + idxMini(V, r) }); }).join('') +
        (L.length > lim ? '<button class="btn more" data-a="idxmas">Mostrar más (' + (L.length - lim) + ' restantes)</button>' : '') +
        (r.celoBajo ? '<p class="cap">En este tambo se anotan pocos celos, así que el dato parto a primer celo pesa menos (' + Math.round(r.pesos.pc) + '%).</p>' : '') + '</section>';
    }
    function idxFichaHTML(a) {
      if (esOperario()) return '';
      var r = IDX(); if (!r || !(a.cat === 'vaca' || a.cat === 'seca' || !a.cat)) return '';
      var V = r.por[a.rp];
      if (!V) return '<section class="card"><h2>Índice del tambo</h2><p class="cap" style="margin:0">Sin índice todavía: le falta cerrar al menos una lactancia con datos de reproducción y de leche.</p></section>';
      var comp = [
        ['da', 'Días abiertos', nf1(V.m.da) + ' d', nf(r.prom.da)],
        ['spc', 'Servicios por concepción' + (V.spcVaq ? ' <small>(de vaquillona: ' + V.spcVaq + ')</small>' : ''), nf(V.m.spc, 1), nf(r.prom.spc, 1)],
        ['pc', 'Parto a primer celo', nf1(V.m.pc) + ' d', nf(r.prom.pc)],
        ['pe', 'Pérdidas de gestación', V.perd ? V.perd + ' de ' + V.gestConf + ' preñeces' : '0 de ' + V.gestConf, nf(r.prom.pe * 100, 1) + '%'],
        ['le', 'Leche 305 días', lecheTxt(V, r) || '–', nf(r.prom.lit) + ' L' + (r.prom.sol != null && r.hayAn ? ' · ' + nf(r.prom.sol) + ' kg' : '')]
      ].filter(function (c) { return V.pts[c[0]] != null; });
      var bar = comp.map(function (c) {
        var p = V.pts[c[0]], w = Math.min(50, Math.abs(p) * 5);
        return '<div class="ixc"><div class="ixl"><span>' + c[1] + ': <b>' + c[2] + '</b> <small>(tambo ' + c[3] + ')</small></span><b class="' + (p >= 0 ? 'up' : 'dn') + '">' + (p >= 0 ? '+' : '−') + nf(Math.abs(p), 1) + '</b></div>' +
          '<div class="ixt"><i class="' + (p >= 0 ? 'up' : 'dn') + '" style="' + (p >= 0 ? 'left:50%' : 'right:50%') + ';width:' + w.toFixed(1) + '%"></i></div></div>';
      }).join('');
      return '<section class="card"><div class="ixhead"><h2>Índice del tambo</h2>' + idxNum(V) + '</div>' +
        '<p class="cap" style="margin:-4px 0 8px">Puesto ' + V.puesto + ' de ' + r.n + (V.mejorQue != null ? ' · mejor que el ' + Math.min(99, V.mejorQue) + '% de las vacas del tambo' : '') + ' · ' + V.nLac + (V.nLac === 1 ? ' lactancia evaluada' : ' lactancias evaluadas') + (V.conf < 1 ? ' (cuenta ' + Math.round(V.conf * 100) + '% hasta tener 3)' : '') + '</p>' + bar +
        '<p class="cap">' + (r.usaSol ? 'La leche se compara en kg de sólidos.' : 'La leche se compara en litros' + (r.hayAn ? ' (en este tambo los análisis de sólidos no son regulares).' : '.')) +
        (V.nAn != null && r.hayAn ? ' Última lactancia: ' + V.nAn + (V.nAn === 1 ? ' control' : ' controles') + ' con sólidos' + (V.solEst ? '; con menos de ' + r.minAn + ' los sólidos se estiman con el % promedio del tambo' : '') + '.' : '') +
        ' Puntos que suma o resta cada dato; la línea del medio es el promedio del tambo.</p></section>';
    }
    function idxBadge(a) {
      if (esOperario()) return '';
      var V = idxDe(a); if (!V) return '';
      var cls = V.tier === 'top' ? '' : V.tier === 'peor' ? ' peor' : ' neutro';
      return '<span class="medalla' + cls + '" title="Índice del tambo: ' + V.idx + '">' + (V.tier === 'top' ? MEDALLA : '') + '<span class="ixb">' + V.idx + '</span>' +
        (V.tier === 'top' ? '<b>Top 10%</b>' : V.tier === 'peor' ? '<b>10% inferior</b>' : '<b class="lbl">Índice</b>') + '</span>';
    }
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
        (function (x) { return x ? '<section class="card datos">' + x + '</section>' : ''; })(kv([
          ['Último parto', lp ? A.fmt(lp[0]) + ' <small>parto ' + lp[1] + '</small>' : null],
          ['Último celo o servicio', ls ? A.fmt(ls[0]) + ' <small>' + (ls[1] === 'C' ? 'celo' : esc(ls[2] || 'servicio')) + '</small>' : null],
          ['Último tacto', lt ? A.fmt(lt[0]) + (codes[lt[1]] ? ' <small>' + esc(codes[lt[1]][0]) + '</small>' : '') : null]
        ])) +
        (h && h.ct.length ? '<section class="card"><h2>Control lechero</h2>' + bars(h.ct.slice(-10).reverse().map(function (c) { return c[1]; })) + '</section>' : '') +
        (h ? lactHTML(h) + (h.pa.length || h.ev.length || h.ta.length ? histHTML(a, h) : '') : '') +
        (h && h.corto ? '<p class="hint">Baja de hace más de 2 años: la app guarda solo los datos básicos. El historial completo está en ' + SRC() + '.</p>' : h && h.ult && h.pa.length ? '<p class="hint">De las bajas se guardan los últimos 2 años. El historial completo está en SysCaw.</p>' : '') +
        '<section class="card"><h2>Identificación</h2>' + kv([['RP', esc(a.rp)], ['Origen', esc(a.nombre)], ['Nacimiento', h && h.fn ? A.fmt(h.fn) : null], ['Edad al primer parto', h && h.fn && h.pa.length && h.pa[0][1] === 1 ? nf(A.diffDays(h.pa[0][0], h.fn) / 30.44, 1) + ' meses' : null], ['Madre (RP)', madre], ['Padre', h && h.pd ? esc(h.pd) : null]], 'kvs') + '</section>' +
        '<p class="src">' + (DB.origen === 'fosapp' ? 'Base FOSAPP' : 'Respaldo SysCaw') + (DB.fecha ? ' del ' + A.fmt(DB.fecha) : '') + '</p>';
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
        var ult = sl.length ? sl[sl.length - 1] : null;
        if (toro && ult && ult[3] && a.sFecha === ult[0]) toro += ' <small class="insem">' + esc(ult[3]) + '</small>';
        // servicios anteriores al último (el último ya está en Toro), numerados desde el 1
        if (sl.length > 1) torosLac = '<span class="torl">' + sl.slice(0, -1).map(function (e, i) { return '<span><small class="nro">' + (i + 1) + 'º</small> ' + esc(e[2] || '?') + (e[3] ? ' <small>' + esc(e[3]) + '</small>' : '') + '</span>'; }).join('') + '</span>';
      }
      var datos = kv([
        ['Fecha de último parto', a.pFecha ? A.fmt(a.pFecha) : null],
        ['Días en lactancia', dLac != null ? nf(dLac) : null],
        ['Fecha del último servicio', a.sFecha ? A.fmt(a.sFecha) : null],
        ['Días del último servicio', a.sFecha ? String(A.diffDays(t, a.sFecha)) : null],
        ['Número de servicio', a.sN != null ? String(a.sN) : null],
        ['Toro / Insem.', toro],
        ['Todos los servicios', torosLac],
        ['Último tacto y resultado', tacto],
        ['Parto probable', a.estado === 'prenada' && d.partoProb ? A.fmt(d.partoProb) + (d.partoEstimado ? ' <small>estimado</small>' : '') : null],
        ['Secado', a.estado === 'prenada' && d.secado && (a.cat === 'vaca' || a.cat === 'seca' || !a.cat) ? A.fmt(d.secado) : null]
      ]);
      var madre = h && h.ma ? (byRp(h.ma) ? '<button class="lnk" data-rp="' + esc(h.ma) + '">' + esc(h.ma) + '</button>' : esc(h.ma)) : null;
      return '<button class="backbtn" data-a="back"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>Volver</button>' +
        '<header class="fh"><div class="fhtag">' + tagSVG(a.rp, 118) + '</div><div class="fhinfo"><div class="nm">' + esc(a.nombre || 'Sin nombre') + '</div>' +
        '<div class="fhchips">' + (a.cat && a.cat !== 'vaca' ? '<span class="chip cat">' + CATL[a.cat] + '</span>' : '') + chip(a) + (a.rech ? '<span class="chip descarte">Descarte' + (a.rechDet || a.rech ? ': ' + esc(a.rechDet || a.rech) : ' programado') + '</span>' : '') + (!esOperario() && paraVenta(a) ? '<span class="chip venta2">Para venta</span>' : '') + '</div></div>' + idxBadge(a) + '</header>' +
        (datos ? '<section class="card datos">' + datos + '</section>' : '') +
        (h && h.ct.length ? '<section class="card"><h2>Control lechero</h2>' + prodHistHTML(a, h) + '</section>' : (bars(a.pr || []) ? '<section class="card"><h2>Control lechero</h2>' + bars(a.pr) + '</section>' : '')) +
        (h ? lactHTML(h) + (h.pa.length || h.ev.length || h.ta.length ? histHTML(a, h) : '') : '') +
        idxFichaHTML(a) +
        '<section class="card"><h2>Identificación</h2>' + kv([['RP', esc(a.rp)], ['Origen', esc(a.nombre)], ['Id electrónica', esc(a.idElec)], ['Nacimiento', h && h.fn ? A.fmt(h.fn) : null], ['Edad al primer parto', h && h.fn && h.pa.length && h.pa[0][1] === 1 ? nf(A.diffDays(h.pa[0][0], h.fn) / 30.44, 1) + ' meses' : null], ['Madre (RP)', madre], ['Padre', h && h.pd ? esc(h.pd) : null], ['Rodeo', esc(a.rod)]], 'kvs') + '</section>' +
        (h ? '<p class="src">Historial ' + (DB.origen === 'fosapp' ? 'de la base FOSAPP' : 'del respaldo SysCaw') + (DB.fecha ? ' del ' + A.fmt(DB.fecha) : '') + '</p>' : '');
    }

    // tarjetas de la ficha: se ven solo con el título y se despliegan al tocarlo (se recuerda cuáles quedan abiertas)
    var FICHA_AB = {};
    function plegarFicha(main) {
      Array.prototype.forEach.call(main.querySelectorAll('section.card'), function (sec) {
        if (sec.classList.contains('datos') || sec.classList.contains('fijo')) return;
        var h2 = sec.querySelector('h2'); if (!h2) return;
        var head = h2.parentNode === sec ? h2 : h2.closest('.ixhead') || h2;
        if (head.parentNode !== sec) return;
        var key = h2.textContent.split(' · ')[0].trim();
        sec.classList.add('plg'); if (FICHA_AB[key]) sec.classList.add('open');
        head.classList.add('plgh'); head.setAttribute('role', 'button'); head.setAttribute('tabindex', '0'); head.setAttribute('aria-expanded', !!FICHA_AB[key]); head.dataset.plg = key;
        head.insertAdjacentHTML('beforeend', '<svg class="chev" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>');
      });
    }

    var LOGO_LIBRETA = '<svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true"><rect x="11" y="6" width="28" height="36" rx="3" fill="#F4D823"/><rect x="11" y="6" width="6" height="36" rx="2" fill="#C9A227"/><path d="M8 12h6M8 19h6M8 26h6M8 33h6" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round"/><rect x="21" y="14" width="13" height="3" rx="1.5" fill="#12274A"/><rect x="21" y="21" width="10" height="3" rx="1.5" fill="#12274A" opacity=".6"/><rect x="21" y="28" width="12" height="3" rx="1.5" fill="#12274A" opacity=".6"/></svg>';
    /* ----- pestaña Leche: último control lechero ----- */
    function solidos(c) { return c[2] >= 2 && c[2] <= 7 && c[3] >= 2 && c[3] <= 5.5 ? c[1] * (c[2] + c[3]) / 100 : null; }
    function controlLechero() {
      var H = DB.hist || {}, L = null;
      DB.animales.forEach(function (a) { var h = H[a.rp]; if (h && h.ct.length) { var f = h.ct[h.ct.length - 1][0]; if (!L || f > L) L = f; } });
      var V = [];
      if (L) {
        var P = null;
        DB.animales.forEach(function (a) { var h = H[a.rp]; if (h) h.ct.forEach(function (c) { if (A.diffDays(L, c[0]) > 10 && (!P || c[0] > P)) P = c[0]; }); });
        DB.animales.forEach(function (a) {
          var h = H[a.rp]; if (!h) return;
          var c = null, cp = null;
          h.ct.forEach(function (x) { if (Math.abs(A.diffDays(x[0], L)) <= 3) c = x; if (P && Math.abs(A.diffDays(x[0], P)) <= 3) cp = x; });
          if (!c || !(c[1] > 0)) return;
          var parto = null; h.pa.forEach(function (p) { if (p[0] <= c[0]) parto = p; });
          if (!parto) return;
          if (cp && cp[0] < parto[0]) cp = null; // el control anterior era de otra lactancia
          V.push({ a: a, del: A.diffDays(c[0], parto[0]), n: parto[1], lt: c[1], g: c[2], p: c[3], cs: c[4], sol: solidos(c), prev: cp });
        });
        return { fecha: L, ant: P, V: V };
      }
      // libreta en Excel: último control de cada vaca, sin fechas
      DB.animales.forEach(function (a) { if ((a.cat === 'vaca' || !a.cat) && a.dLac != null && typeof (a.pr || [])[0] === 'number' && a.pr[0] > 0) V.push({ a: a, del: a.dLac, n: a.pN || 2, lt: a.pr[0], g: null, p: null, cs: null, sol: null, prev: null }); });
      return { fecha: null, ant: null, V: V };
    }
    function prom(l, f) { var s = 0, n = 0; l.forEach(function (x) { var v = f(x); if (v != null && !isNaN(v)) { s += v; n++; } }); return n ? s / n : null; }
    // evolución mensual del control lechero: últimos 12 meses vs año anterior vs promedio histórico del mismo mes
    function evolucion(med) {
      var C = (DB.ctrls || []).filter(function (c) { return !DB.sel || !DB.sel.length || DB.sel.indexOf(c[1]) >= 0; });
      if (C.length < 3) return null;
      var porFecha = {};
      C.forEach(function (c) { var x = porFecha[c[0]] || (porFecha[c[0]] = { v: 0, l: 0, d: 0, nd: 0 }); x.v += c[2]; x.l += c[3]; if (c[4]) { x.d += c[4] * c[2]; x.nd += c[2]; } });
      var mes = {};
      Object.keys(porFecha).forEach(function (f) {
        var x = porFecha[f], k = f.slice(0, 7), m = mes[k] || (mes[k] = { s: 0, n: 0 });
        m.s += med === 'lv' ? x.l / x.v : med === 'lt' ? x.l : x.v; m.n++;
      });
      var val = function (k) { return mes[k] ? mes[k].s / mes[k].n : null; };
      var ult = Object.keys(mes).sort().pop(), y = +ult.slice(0, 4), m0 = +ult.slice(5, 7);
      var out = [], primer = null;
      for (var i = 11; i >= 0; i--) {
        var mm = m0 - i, yy = y; while (mm < 1) { mm += 12; yy--; }
        var k = yy + '-' + pad2(mm), ka = (yy - 1) + '-' + pad2(mm);
        var hs = []; Object.keys(mes).forEach(function (kk) { if (kk.slice(5) === pad2(mm) && kk < ka) { hs.push(val(kk)); if (!primer || kk < primer) primer = kk; } });
        out.push({ label: A.MESES[mm - 1], anio: yy, cur: val(k), prev: val(ka), hist: hs.length ? hs.reduce(function (s, x) { return s + x; }, 0) / hs.length : null });
      }
      return { meses: out, desde: primer ? primer.slice(0, 4) : null };
    }
    function pad2(n) { return (n < 10 ? '0' : '') + n; }
    function evolChart(E, med) {
      var M = E.meses, W = 340, H = 210, ml = 36, mr = 8, mt = 12, mb = 30;
      var all = []; M.forEach(function (m) { [m.cur, m.prev, m.hist].forEach(function (v) { if (v != null) all.push(v); }); });
      var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all), pad = (hi - lo) * 0.15 || hi * 0.1 || 1; lo = Math.max(0, lo - pad); hi += pad;
      var X = function (i) { return ml + i * (W - ml - mr) / 11; }, Y = function (v) { return H - mb - (v - lo) / (hi - lo) * (H - mt - mb); };
      var fmtY = function (v) { return med === 'lv' ? nf(v, 0) : med === 'lt' ? (v >= 1000 ? nf(v / 1000, 0) + ' mil' : nf(v)) : nf(v); };
      var s = '';
      for (var t = 0; t <= 4; t++) { var v = lo + (hi - lo) * t / 4; s += '<line class="lgrid" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '"/><text class="mlbl" x="' + (ml - 5) + '" y="' + (Y(v) + 4).toFixed(1) + '" text-anchor="end">' + fmtY(v) + '</text>'; }
      M.forEach(function (m, i) { s += '<text class="mlbl" x="' + X(i).toFixed(1) + '" y="' + (H - mb + 15) + '" text-anchor="middle">' + m.label + '</text>'; if (m.label === 'ene' || i === 0) s += '<text class="myear" x="' + X(i).toFixed(1) + '" y="' + (H - 2) + '" text-anchor="middle">' + String(m.anio).slice(2) + '</text>'; });
      ['hist', 'prev', 'cur'].forEach(function (k) {
        var seg = [], segs = [];
        M.forEach(function (m, i) { if (m[k] != null) seg.push(X(i).toFixed(1) + ',' + Y(m[k]).toFixed(1)); else if (seg.length) { segs.push(seg); seg = []; } });
        if (seg.length) segs.push(seg);
        segs.forEach(function (sg) { s += sg.length > 1 ? '<polyline class="ev ' + k + '" points="' + sg.join(' ') + '"/>' : ''; if (k !== 'hist') sg.forEach(function (pt) { var c = pt.split(','); s += '<circle class="evp ' + k + '" cx="' + c[0] + '" cy="' + c[1] + '" r="' + (k === 'cur' ? 3.5 : 2.5) + '"/>'; }); });
      });
      var u = M[M.length - 1]; if (u.cur != null) s += '<text class="evv" x="' + (X(11) - 4) + '" y="' + (Y(u.cur) - 8).toFixed(1) + '" text-anchor="end">' + fmtY(u.cur) + '</text>';
      return '<svg class="mchart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Control lechero, últimos 12 meses comparados con el año anterior y el promedio histórico">' + s + '</svg>';
    }
    function evolHTML() {
      var med = state.evMed || 'lv', E = evolucion(med);
      if (!E) return DB.fuente === 'syscaw' ? '<section class="card"><h2>Últimos 12 meses</h2><p class="cap" style="margin:0">Para ver la evolución, volvé a cargar ' + (DB.origen === 'fosapp' ? 'la base de FOSAPP' : 'el respaldo de SysCaw') + ' (Ajustes → Actualizar este tambo).</p></section>' : '';
      var nombre = { lv: 'Litros por vaca', lt: 'Litros totales del tambo', vo: 'Vacas en ordeñe' };
      var chips = '<div class="filters" role="group" aria-label="Medida">' + [['lv', 'L/vaca'], ['lt', 'Litros totales'], ['vo', 'Vacas']].map(function (c) { return '<button class="fchip" data-ev="' + c[0] + '" aria-pressed="' + (med === c[0]) + '">' + c[1] + '</button>'; }).join('') + '</div>';
      var d = function (v) { return v == null ? '–' : med === 'lv' ? nf(v, 1) : nf(v); };
      var dif = function (a, b) { if (a == null || b == null || !b) return ''; var p = (a - b) / b * 100; return ' <small class="' + (p >= 0 ? 'up' : 'dn') + '">' + (p >= 0 ? '+' : '−') + nf(Math.abs(p), 0) + '%</small>'; };
      var filas = E.meses.slice().reverse().map(function (m) { return '<tr><td>' + m.label + ' ' + String(m.anio).slice(2) + '</td><td>' + d(m.cur) + dif(m.cur, m.prev) + '</td><td>' + d(m.prev) + '</td><td>' + d(m.hist) + '</td></tr>'; }).join('');
      return '<section class="card fijo"><h2>Últimos 12 meses</h2>' + chips +
        '<div class="mleg"><span><i class="ecur"></i>Últimos 12 meses</span><span><i class="eprev"></i>Año anterior</span><span><i class="ehist"></i>Promedio histórico' + (E.desde ? ' (desde ' + E.desde + ')' : '') + '</span></div>' +
        evolChart(E, med) +
        '<table class="tbl ptbl"><thead><tr><th>Mes</th><th>Este año</th><th>Año ant.</th><th>Histórico</th></tr></thead><tbody>' + filas + '</tbody></table>' +
        '<p class="cap">' + nombre[med] + ' según el control lechero de ' + SRC() + '; si hay más de un control en el mes, se promedian. El % compara con el mismo mes del año anterior.</p></section>';
    }
    function lecheHTML() {
      var C = controlLechero(), V = C.V;
      if (!V.length) return '<h1 class="ptitle">Leche</h1>' + (evolHTML() || '<section class="card"><p class="hint" style="margin:0">Este respaldo no trae controles lecheros.</p></section>');
      var lt = prom(V, function (v) { return v.lt; }), sol = prom(V, function (v) { return v.sol; });
      var conPrev = V.filter(function (v) { return v.prev && v.prev[1] > 0; });
      var dif = conPrev.length ? prom(conPrev, function (v) { return v.lt - v.prev[1]; }) : null;
      var res = '<section class="card fijo"><h2>' + (C.fecha ? 'Control del ' + A.fmt(C.fecha) : 'Último control') + '</h2>' + kv([
        ['Vacas controladas', nf(V.length)],
        ['Litros por vaca', nf(lt, 1) + ' L' + (dif != null ? ' <small class="' + (dif >= 0 ? 'up' : 'dn') + '">' + (dif >= 0 ? '+' : '−') + nf(Math.abs(dif), 1) + ' L vs ' + A.fmt(C.ant) + '</small>' : '')],
        ['Sólidos por vaca', sol != null ? nf(sol, 2) + ' kg <small>' + nf(prom(V, function (v) { return v.sol != null ? v.g : null; }), 2) + '% G · ' + nf(prom(V, function (v) { return v.sol != null ? v.p : null; }), 2) + '% P</small>' : null],
        ['Días en leche, promedio', nf(prom(V, function (v) { return v.del; }))]
      ]) + '</section>';
      var grupo = function (l) { return '<td>' + nf(l.length) + '</td><td>' + nf(prom(l, function (v) { return v.lt; }), 1) + '</td><td>' + (sol != null ? nf(prom(l, function (v) { return v.sol; }), 2) : '–') + '</td>'; };
      var filas = [['1ª lactancia', function (v) { return v.n === 1; }], ['2ª lactancia', function (v) { return v.n === 2; }], ['3ª o más', function (v) { return v.n >= 3; }], ['0 a 100 días', function (v) { return v.del <= 100; }], ['101 a 200 días', function (v) { return v.del > 100 && v.del <= 200; }], ['Más de 200 días', function (v) { return v.del > 200; }]].map(function (f, i) {
        var l = V.filter(f[1]); return l.length ? '<tr' + (i === 3 ? ' class="sep"' : '') + '><td>' + f[0] + '</td>' + grupo(l) + '</tr>' : '';
      }).join('');
      var tabla = '<section class="card"><h2>Por lactancia y por tercio</h2><table class="tbl"><thead><tr><th></th><th>Vacas</th><th>L/vaca</th><th>Kg sól.</th></tr></thead><tbody>' + filas + '</tbody></table></section>';
      var caen = conPrev.filter(function (v) { var d = v.prev[1] - v.lt; return d >= 4 && d / v.prev[1] >= 0.2; }).sort(function (x, y) { return (y.prev[1] - y.lt) / y.prev[1] - (x.prev[1] - x.lt) / x.prev[1]; });
      var caida = C.ant ? '<section class="card"><h2>Cayeron más · ' + caen.length + ' vacas</h2><p class="cap" style="margin:0 0 8px">Bajaron 20% o más (y al menos 4 L) respecto del control del ' + A.fmt(C.ant) + '.</p>' +
        (caen.length ? caen.slice(0, 40).map(function (v) { var pc = Math.round((v.prev[1] - v.lt) / v.prev[1] * 100); return rowHTML(v.a, { right: '<span class="when late">−' + pc + '%</span>', sub: nf(v.prev[1], 1) + ' → ' + nf(v.lt, 1) + ' L · ' + v.del + ' días en leche' }); }).join('') : '<p class="hint">Ninguna vaca cayó tanto.</p>') + '</section>' : '';
      var top = V.slice().sort(function (x, y) { return y.lt - x.lt; }).slice(0, 5);
      var top5 = '<section class="card"><h2>Top 5 del control</h2><p class="cap" style="margin:0 0 8px">Las 5 vacas con más litros' + (C.fecha ? ' el ' + A.fmt(C.fecha) : '') + ', comparadas con el control anterior.</p>' +
        top.map(function (v, i) {
          var pv = v.prev && v.prev[1] > 0 ? v.prev[1] : null, d = pv != null ? v.lt - pv : null;
          return rowHTML(v.a, { right: '<span class="when ' + (d != null && d < 0 ? 'late' : 'ok') + '">' + nf(v.lt, 1) + ' L</span>',
            sub: (i + 1) + 'º · ' + (pv != null ? 'antes ' + nf(pv, 1) + ' L (' + (d >= 0 ? '+' : '−') + nf(Math.abs(d), 1) + ')' : 'sin control anterior') + ' · ' + v.del + ' días en leche · ' + (v.n === 1 ? '1ª lactancia' : v.n + 'ª lactancia') });
        }).join('') + '</section>';
      return '<h1 class="ptitle">Leche</h1>' + res + evolHTML() + top5 + tabla + caida;
    }

    /* ----- activación por tambo: links firmados por el Dr. Mauro Torterolo ----- */
    var PUBKEY = {"kty":"EC","crv":"P-256","x":"-zikzRKxDR2Iml5AuWh6PgDIipwqr1fpHjwct7moAoQ","y":"eWwwwoCwgfWupZrAebMISU7Yx3aUlhEYOoAJ79GFda0"};
    var ACT = []; try { ACT = JSON.parse(localStorage.getItem('libreta:act')) || []; } catch (e) { ACT = []; }
    function esVet() { try { return !!localStorage.getItem('libreta:vet'); } catch (e) { return false; } }
    function habilitado(ids) {
      if (esVet()) return true;
      ids = ids || [];
      if (!ids.length) return ACT.length > 0;
      return ACT.some(function (x) { return (x.p || []).some(function (q) { return ids.indexOf(q) >= 0; }); });
    }
    function bloqueado(nombre) {
      state.error = 'Este tambo' + (nombre ? ' (' + nombre + ')' : '') + ' no está activado en este teléfono. Pedile el link de activación al Dr. Mauro Torterolo.';
      render(); toast('Tambo sin activar');
    }
    function b64u(bytes) { var s = ''; bytes.forEach(function (b) { s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
    function unb64u(t) { t = t.replace(/-/g, '+').replace(/_/g, '/'); while (t.length % 4) t += '='; var s = atob(t), u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
    function verificar(token) {
      try {
        var parts = token.split('.'), datos = unb64u(parts[0]), firma = unb64u(parts[1]);
        return crypto.subtle.importKey('jwk', PUBKEY, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']).then(function (k) {
          return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, k, firma, datos);
        }).then(function (ok) { return ok ? JSON.parse(new TextDecoder().decode(datos)) : null; }).catch(function () { return null; });
      } catch (e) { return Promise.resolve(null); }
    }
    function firmar(payload) {
      var jwk = JSON.parse(new TextDecoder().decode(unb64u(localStorage.getItem('libreta:vet').replace(/^MTV1\./, ''))));
      var datos = new TextEncoder().encode(JSON.stringify(payload));
      return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']).then(function (k) {
        return crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, k, datos);
      }).then(function (sig) { return b64u(datos) + '.' + b64u(new Uint8Array(sig)); });
    }
    // código corto de activación: número de productor de SysCaw + 6 dígitos de control (distintos para productor y operario)
    var ACT_K = 'gBCSBOVpmL8OCCBwM2XqdlG8';
    function digitos6(msg) {
      return crypto.subtle.importKey('raw', new TextEncoder().encode(ACT_K), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
        .then(function (key) { return crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg)); })
        .then(function (s) { var d = new DataView(s); return ('000000' + (d.getUint32(0) % 1000000)).slice(-6); });
    }
    function codigoPara(p, rol) { return digitos6((rol === 'op' ? 'op' : 'prod') + '|' + p).then(function (c) { return p + ' ' + c; }); }
    function activarCodigo(texto) {
      var s = String(texto || ''), m = s.match(/\*([\d\s]+)\*/); s = m ? m[1] : s.split(/c[oó]digo:?/i).pop(); var d = s.replace(/\D/g, '');
      if (d.length < 7) { toast('Revisá el código: tiene que tener al menos 7 números.'); return Promise.resolve(false); }
      var p = +d.slice(0, -6), c = d.slice(-6);
      return Promise.all([digitos6('prod|' + p), digitos6('op|' + p)]).then(function (r) {
        var rol = r[0] === c ? 'prod' : r[1] === c ? 'op' : null;
        if (!rol) { toast('Ese código no es válido. Revisalo o pedíselo de nuevo al Dr. Torterolo.'); return false; }
        var pl = { p: [p], n: PERFIL.nombre || '', f: today() }; if (rol === 'op') pl.r = 'op';
        ACT = ACT.filter(function (x) { return JSON.stringify(x.p) !== JSON.stringify(pl.p); }).concat([pl]);
        try { localStorage.setItem('libreta:act', JSON.stringify(ACT)); } catch (e) {}
        state.error = ''; render(); toast('¡Listo! Libreta activada' + (rol === 'op' ? ' (operario)' : ''));
        return true;
      });
    }
    function pedirCodigo() { var t = prompt('Escribí el código de activación que te mandó el Dr. Mauro Torterolo'); if (t) activarCodigo(t); }
    function leerActivacion(texto) {
      var m = texto != null ? (/#act=([A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+)/.exec(texto) || /([A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{40,})/.exec(texto)) : /^#act=([A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+)$/.exec(location.hash || '');
      if (!m) { if (texto != null) toast('No encontré un link de activación en lo que pegaste.'); return Promise.resolve(false); }
      if (texto == null) { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { location.hash = ''; } }
      return verificar(m[1]).then(function (pl) {
        if (!pl || !pl.p) { toast('El link de activación no es válido.'); return false; }
        ACT = ACT.filter(function (x) { return JSON.stringify(x.p) !== JSON.stringify(pl.p); }).concat([pl]);
        try { localStorage.setItem('libreta:act', JSON.stringify(ACT)); } catch (e) {}
        toast('Libreta activada para ' + (pl.n || 'este tambo')); state.error = ''; render();
        return true;
      });
    }
    // pegar el link dentro de la app (sirve cuando el link se abrió en otro navegador, o en el ícono del escritorio del iPhone)
    function codigoHTML() {
      return '<input id="actCod" class="actcod" type="text" inputmode="numeric" autocomplete="off" placeholder="Código" aria-label="Código de activación">' +
        '<button class="btn primary big" data-a="actcod">Activar</button>' +
        '<button class="lnk" data-a="pegaract" style="display:block;margin:14px auto 0">¿Te mandaron un link? Pegalo acá</button>';
    }
    function pegarActivacion() {
      var pedir = function (pre) { var t = prompt('Pegá acá el link de activación que te mandó el Dr. Mauro Torterolo', pre || ''); if (t) leerActivacion(t); };
      if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then(function (t) { if (/#act=/.test(t || '')) leerActivacion(t); else pedir(''); }, function () { pedir(''); });
      else pedir('');
    }
    /* copia de la clave de veterinario: para pasar el modo veterinario a otro teléfono (las activaciones de los productores dependen de esta clave) */
    function copiarClaveVet() {
      var k = ''; try { k = localStorage.getItem('libreta:vet') || ''; } catch (e) {}
      if (!esVet() || !k) { toast('El modo veterinario no está activo en este teléfono.'); return; }
      if (!confirm('Tu clave de veterinario da acceso a todo y firma las activaciones de los productores. Guardala en un lugar seguro y no se la pases a nadie. ¿Copiarla?')) return;
      closeSheet();
      var manual = function () { prompt('Copiá tu clave (mantené apretado el texto para seleccionarlo):', k); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(k).then(function () { toast('Clave copiada. Pegala en un lugar seguro.'); }, manual);
      else manual();
    }
    function modoVet() {
      if (esVet()) { if (confirm('¿Salir del modo veterinario en este teléfono? Vas a necesitar tu clave para volver.')) { try { localStorage.removeItem('libreta:vet'); } catch (e) {} closeSheet(); toast('Modo veterinario desactivado'); } return; }
      var k = (prompt('Pegá tu clave de veterinario') || '').trim(); if (!k) return;
      try { localStorage.setItem('libreta:vet', k); } catch (e) {}
      firmar({ t: 1 }).then(function (tok) { return verificar(tok); }).then(function (ok) {
        if (ok) { toast('Modo veterinario activo'); openSheet('Ajustes'); }
        else { try { localStorage.removeItem('libreta:vet'); } catch (e) {} toast('Esa clave no es válida.'); }
      }, function () { try { localStorage.removeItem('libreta:vet'); } catch (e) {} toast('Esa clave no es válida.'); });
    }
    // operario: solo Buscar y la ficha. El tipo de acceso va dentro de la firma.
    function esOperario() { return !esVet() && ACT.length > 0 && !ACT.some(function (x) { return x.r !== 'op'; }); }
    function enviarActivacion() {
      if (DB.origen === 'fosapp') { toast('Los tambos de FOSAPP son solo para el modo veterinario: no se activan para productores.'); return; }
      if (!DB.idProd || !DB.idProd.length) { toast('Cargá el respaldo de SysCaw de este tambo para generar la activación.'); return; }
      closeSheet();
      $('#sheetXTitle').textContent = '¿Para quién es la activación?';
      $('#xopts').innerHTML = '<p class="cap" style="margin:0 0 10px">' + esc(PERFIL.nombre || 'Este tambo') + '</p>';
      $('#xbtns').innerHTML = '<button class="btn primary big" data-a="actprod">Productor · app completa</button><button class="btn big" data-a="actop">Operario · solo buscar y ficha</button><button class="btn" data-a="xcancel">Cancelar</button>';
      $('#sheetX').hidden = false;
    }
    function enviarActivacionRol(rol) {
      if (DB.origen === 'fosapp') { toast('Los tambos de FOSAPP son solo para el modo veterinario: no se activan para productores.'); return; }
      $('#sheetX').hidden = true;
      var base = location.href.split('#')[0].split('?')[0].replace(/prueba\/(index\.html)?$/, '').replace(/index\.html$/, '');
      codigoPara(DB.idProd[0], rol).then(function (cod) {
        var txt = 'Hola. Para usar la *Libreta de vacas* de ' + (PERFIL.nombre || 'tu tambo') + (rol === 'op' ? ' (operario)' : '') + ':\n\n' +
          '1. Entrá acá: ' + base + '\n' +
          '2. Escribí este código: *' + cod + '*\n\nDr. Mauro Torterolo';
        if (navigator.share) navigator.share({ text: txt }).catch(function () {}); else window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank');
        toast('Código: ' + cod);
      }, function () { toast('No pude generar el código.'); });
    }


    /* ----- informe anual (solo modo veterinario), con el formato de los informes del Dr. Torterolo; se guarda como PDF desde Imprimir ----- */
    function infMeses(modo) {
      var ref = DB.fecha || today(), y = +ref.slice(0, 4), m = +ref.slice(5, 7);
      if (modo === 'ej') { if (m < 7) y--; m = 6; } // ejercicio julio–junio cerrado
      var out = [];
      for (var i = 11; i >= 0; i--) { var mm = m - i, yy = y; while (mm < 1) { mm += 12; yy--; } out.push({ key: yy + '-' + pad2(mm), label: A.MESES[mm - 1], anio: yy, mid: yy + '-' + pad2(mm) + '-15' }); }
      return out;
    }
    // todos los animales de todas las unidades; cada cálculo usa la unidad en la que estaba el animal en esa fecha
    function infLista() {
      var H = DB.hist || {};
      return (DB.todos || DB.animales).map(function (a) { return { a: a, h: H[a.rp] }; }).concat((DB.bajasT || DB.bajas || []).map(function (b) { return { a: b, h: H[b.key] }; })).filter(function (x) { return x.h; });
    }
    function unidadEn(x, D) {
      var mv = x.h.mv; if (!mv || !mv.length) return x.a.u;
      var u = null; mv.forEach(function (m) { if (m[0] <= D) u = m[1]; });
      return u != null && u >= 0 ? u : (u == null ? mv[0][2] : -1);
    }
    function enSel(u) { return !DB.sel || !DB.sel.length || DB.sel.indexOf(u) >= 0; }
    // fecha de concepción de la lactancia que empieza en el parto i
    function concLac(h, i) {
      var p = h.pa[i], np = h.pa[i + 1], hasta = np ? np[0] : '9999';
      var sv = h.ev.filter(function (e) { return e[1] === 'S' && e[0] > p[0] && e[0] < hasta; });
      if (np) { var est = A.addDays(np[0], -A.GEST), best = null; sv.forEach(function (e) { var d = Math.abs(A.diffDays(e[0], est)); if (d <= 20 && (!best || d < best[1])) best = [e[0], d]; }); return { sv: sv, conc: best ? best[0] : null }; }
      var pos = h.ta.filter(function (t) { return t[0] > p[0] && esPren(t[1]); });
      if (pos.length) { var T = pos[pos.length - 1][0], antes = sv.filter(function (e) { return e[0] <= T; }); return { sv: sv, conc: antes.length ? antes[antes.length - 1][0] : null }; }
      return { sv: sv, conc: null };
    }
    // VO y VS: promedio de todos los días de cada mes, reconstruido con partos, secados (cierre de lactancia) y bajas de SysCaw.
    // VM = VO + VS (+ las vacas dadas de baja de las que no hay fecha de secado guardada)
    function vovsMeses(M, L) {
      L = L || infLista();
      var estado = function (x, D) {
        if (x.a.bTipo && x.a.bFecha && x.a.bFecha <= D) return null;
        var pa = x.h.pa, k = -1; for (var q = 0; q < pa.length; q++) if (pa[q][0] <= D) k = q;
        if (k < 0) return pa.some(function (p) { return p[1] >= 2 && A.diffDays(p[0], D) <= 400 * (p[1] - 1); }) ? 'M' : null;
        var p = pa[k], np = pa[k + 1], seco = p[5] || (np ? A.addDays(np[0], -A.SECADO) : null);
        return seco && seco <= D ? 'S' : 'O';
      };
      var vo = [], vs = [], vm = [], ref = DB.fecha || today();
      M.forEach(function (m) {
        var y = +m.key.slice(0, 4), mm = +m.key.slice(5, 7), dias = new Date(y, mm, 0).getDate(), o = 0, s = 0, x0 = 0, n = 0;
        for (var dd = 1; dd <= dias; dd++) {
          var D = m.key + '-' + pad2(dd); if (D > ref) break; n++;
          L.forEach(function (x) { if (!x.h.pa.length || !enSel(unidadEn(x, D))) return; var e = estado(x, D); if (e === 'O') o++; else if (e === 'S') s++; else if (e === 'M') x0++; });
        }
        vo.push(n ? o / n : null); vs.push(n ? s / n : null); vm.push(n ? (o + s + x0) / n : null);
      });
      return { vo: vo, vs: vs, vm: vm };
    }
    function infDatos(modo) {
      var M = infMeses(modo), desde = M[0].key + '-01', hasta = M[11].key + '-31', L = infLista();
      var R = vovsMeses(M, L), vo = R.vo, vs = R.vs, vm = R.vm;
      var av = function (l) { var v = l.filter(function (x) { return x != null; }); return v.length ? v.reduce(function (s, x) { return s + x; }, 0) / v.length : null; };
      // partos ocurridos (sin abortos)
      var pv = M.map(function () { return 0; }), pq = pv.slice(), ab = 0;
      L.forEach(function (x) { x.h.pa.forEach(function (p) {
        if (p[0] < desde || p[0] > hasta) return;
        if (!enSel(unidadEn(x, p[0]))) return;
        if (/^A/.test(p[2] || '')) { ab++; return; }
        var k = M.map(function (m) { return m.key; }).indexOf(p[0].slice(0, 7)); if (k < 0) return;
        if (p[1] === 1) pq[k]++; else pv[k]++;
      }); });
      // concentración: los 6 meses seguidos con más partos
      var best = null; for (var i = 0; i <= 6; i++) { var s = 0; for (var j = i; j < i + 6; j++) s += pv[j] + pq[j]; if (!best || s > best.s) best = { i: i, s: s }; }
      // indicadores de la temporada de servicios (vacas): desde el inicio elegido hasta el último servicio
      var ini = inicio21(), ref = DB.fecha || today(), fin = null;
      L.forEach(function (x) { x.h.ev.forEach(function (e) { if (e[1] === 'S' && e[0] >= ini && e[0] <= ref && (!fin || e[0] > fin) && enSel(unidadEn(x, e[0]))) fin = e[0]; }); });
      var ips = [], ipp = [], nServ = 0, nPren = 0, apt = 0, pre = 0;
      if (fin) L.forEach(function (x) {
        var h = x.h;
        h.pa.forEach(function (p, i) {
          if (!enSel(unidadEn(x, p[0]))) return;
          var c = concLac(h, i);
          var s1 = c.sv[0];
          if (s1 && s1[0] >= ini && s1[0] <= fin) ips.push(A.diffDays(s1[0], p[0]));
          c.sv.forEach(function (e) { if (e[0] >= ini && e[0] <= fin) nServ++; });
          if (c.conc && c.conc >= ini && c.conc <= fin) { nPren++; ipp.push(A.diffDays(c.conc, p[0])); }
          // % preñez general: vacas paridas antes del inicio, vacías al inicio, que cumplieron la espera voluntaria en la temporada
          var np = h.pa[i + 1];
          if (p[0] < ini && (!np || np[0] > ini) && !(c.conc && c.conc < ini) && A.diffDays(fin, p[0]) >= pevActual() && !(x.a.bTipo && x.a.bFecha && x.a.bFecha < ini)) { apt++; if (c.conc && c.conc >= ini && c.conc <= fin) pre++; }
        });
      });
      var an = DB.animales.map(function (a) { return { h: DB.hist[a.rp], salida: null, desc: a.dFecha || (a.rech ? '0000' : null) }; })
        .concat((DB.bajas || []).map(function (b) { return { h: DB.hist[b.key], salida: b.bFecha, desc: b.dFecha || null }; }));
      var CY = fin ? A.ciclos21(an, esPren, ini, pevActual(), ref) : [], Tc = { aptas: 0, serv: 0, pren: 0, sOk: 0, sMal: 0 };
      CY.forEach(function (c) { if (c.cerrado) ['aptas', 'serv', 'pren', 'sOk', 'sMal'].forEach(function (k) { Tc[k] += c[k]; }); });
      return { M: M, vo: vo, vs: vs, vm: vm, avo: av(vo), avs: av(vs), avm: av(vm), pv: pv, pq: pq, ab: ab, best: best, ini: ini, fin: fin,
        ips: av(ips), spp: nPren ? nServ / nPren : null, ipp: av(ipp), pg: apt ? pre / apt * 100 : null, apt: apt, pre: pre,
        det: Tc.aptas ? Tc.serv / Tc.aptas * 100 : null, con: Tc.sOk + Tc.sMal ? Tc.sOk / (Tc.sOk + Tc.sMal) * 100 : null, tp: Tc.aptas ? Tc.pren / Tc.aptas * 100 : null };
    }
    function infBarras(M, series, H, opt) {
      // barras agrupadas (series lado a lado) con el valor escrito en cada barra
      opt = opt || {}; var W = 520, ml = 34, mr = 6, mt = 14, mb = 22, ns = series.length;
      var max = 0; series.forEach(function (s) { s.v.forEach(function (v) { if (v > max) max = v; }); }); max = max ? max * 1.1 : 1;
      var paso = Math.pow(10, Math.floor(Math.log10(max / 4))); [1, 2, 2.5, 5, 10].some(function (k) { if (k * paso * 4 >= max) { paso *= k; return true; } }); max = paso * 4;
      var gw = (W - ml - mr) / M.length, bw = Math.min(16, (gw - 8) / ns), Y = function (v) { return H - mb - v / max * (H - mt - mb); };
      var s = '';
      for (var t = 0; t <= 4; t++) { var v = max * t / 4; s += '<line class="lgrid" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '"/><text class="ilbl" x="' + (ml - 4) + '" y="' + (Y(v) + 3).toFixed(1) + '" text-anchor="end">' + nf(v) + '</text>'; }
      if (opt.marco) s += '<rect class="imarco" x="' + (ml + opt.marco.i * gw + 1) + '" y="' + (mt - 10) + '" width="' + (6 * gw - 2) + '" height="' + (H - mb - mt + 10) + '"/><text class="ival" x="' + (ml + opt.marco.i * gw + 6) + '" y="' + (mt + 2) + '">' + opt.marco.t + '</text>';
      M.forEach(function (m, i) {
        var x0 = ml + i * gw + (gw - bw * ns) / 2;
        series.forEach(function (sr, k) {
          var v = sr.v[i]; if (v == null) return;
          var x = x0 + k * bw, y = Y(v);
          s += '<rect class="ib ' + sr.c + '" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + (bw - 1.5).toFixed(1) + '" height="' + (H - mb - y).toFixed(1) + '"/>';
          if (opt.valores !== false && v) s += '<text class="ival" x="' + (x + bw / 2 - 0.7).toFixed(1) + '" y="' + (y - 3).toFixed(1) + '" text-anchor="middle">' + nf(v) + '</text>';
        });
        s += '<text class="ilbl" x="' + (ml + i * gw + gw / 2).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + (m.lbl || (m.label.charAt(0).toUpperCase() + m.label.slice(1) + String(m.anio).slice(2))) + '</text>';
      });
      return '<svg class="ichart" viewBox="0 0 ' + W + ' ' + H + '">' + s + '</svg>';
    }
    function infDisp(V, porRod) {
      var W = 520, H = 210, ml = 30, mr = 70, mt = 8, mb = 26;
      var xmax = Math.max(400, Math.ceil(Math.max.apply(null, V.map(function (v) { return v.del; })) / 100) * 100), ymax = Math.max(40, Math.ceil(Math.max.apply(null, V.map(function (v) { return v.lt; })) / 10) * 10);
      var X = function (d) { return ml + d / xmax * (W - ml - mr); }, Y = function (l) { return H - mb - l / ymax * (H - mt - mb); }, s = '';
      for (var t = 0; t <= ymax; t += 10) s += '<line class="lgrid" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + Y(t) + '" y2="' + Y(t) + '"/><text class="ilbl" x="' + (ml - 4) + '" y="' + (Y(t) + 3) + '" text-anchor="end">' + t + '</text>';
      for (t = 0; t <= xmax; t += 100) s += '<text class="ilbl" x="' + X(t) + '" y="' + (H - 12) + '" text-anchor="middle">' + t + '</text>';
      s += '<text class="ilbl" x="' + ((ml + W - mr) / 2) + '" y="' + (H - 1) + '" text-anchor="middle">DEL</text><text class="ilbl" transform="translate(9 ' + (H / 2) + ') rotate(-90)" text-anchor="middle">Leche</text>';
      var forma = ['dot1', 'sq2', 'dot3', 'sq4'];
      V.forEach(function (v) {
        var k = porRod.indexOf(v.a.rod || '—'), c = forma[k % 4], x = X(Math.min(v.del, xmax)).toFixed(1), y = Y(v.lt).toFixed(1);
        s += c.indexOf('sq') === 0 ? '<rect class="ip ' + c + '" x="' + (x - 3) + '" y="' + (y - 3) + '" width="6" height="6"/>' : '<circle class="ip ' + c + '" cx="' + x + '" cy="' + y + '" r="3.2"/>';
      });
      porRod.forEach(function (r, k) { var c = forma[k % 4], y = mt + 20 + k * 16, x = W - mr + 12; s += (c.indexOf('sq') === 0 ? '<rect class="ip ' + c + '" x="' + (x - 3) + '" y="' + (y - 3) + '" width="6" height="6"/>' : '<circle class="ip ' + c + '" cx="' + x + '" cy="' + y + '" r="3.2"/>') + '<text class="ilbl" x="' + (x + 8) + '" y="' + (y + 3) + '">' + esc(r) + '</text>'; });
      return '<svg class="ichart" viewBox="0 0 ' + W + ' ' + H + '">' + s + '</svg>';
    }
    function informeHTML() {
      var modo = state.infModo || '12', D = infDatos(modo), f1 = function (v, d) { return v == null ? '–' : nf(v, d || 0); };
      var tv = D.pv.reduce(function (s, x) { return s + x; }, 0), tq = D.pq.reduce(function (s, x) { return s + x; }, 0), tt = tv + tq;
      var titulo = DB.unidad || PERFIL.nombre || 'Tambo', mmaa = function (f) { return f ? f.slice(5, 7) + '/' + f.slice(2, 4) : ''; };
      var sec = function (t, x) { return '<h3 class="ish">' + t + '</h3>' + x; };
      var lado = function (h) { return '<div class="iside">' + h + '</div>'; };
      // página 1
      var p1 = '<div class="ipag"><p class="iprod">' + esc(PERFIL.nombre || '') + '</p><h2 class="ititle">' + esc(titulo) + '</h2>' +
        sec('Relación VO/VM', '<div class="irow"><div class="ibox">' + infBarras(D.M, [{ v: D.vo.map(function (v) { return v == null ? null : Math.round(v); }), c: 'b1' }, { v: D.vm.map(function (v) { return v == null ? null : Math.round(v); }), c: 'b2' }], 190) +
          '<div class="ileg"><span><i class="b1"></i>VO</span><span><i class="b2"></i>VM</span></div></div>' +
          lado('<small>REL VO/VM</small><b>' + (D.avo != null && D.avm ? nf(D.avo / D.avm, 2) : '–') + '</b><span>' + f1(D.avo) + ' VO<br>' + f1(D.avs) + ' VS<br>' + f1(D.avm) + ' VM</span>') + '</div>' +
          '<p class="inote">Promedio diario de cada mes, calculado con los partos, secados y bajas de ' + SRC() + '. VM = vacas en ordeñe + secas.</p>') +
        sec('Partos ocurridos', '<div class="irow">' + lado('<small>PARTOS VACA</small><b>' + tv + '</b><span>' + (D.avm ? nf(tv / D.avm * 100, 0) + '% VM' : '') + '</span>') +
          '<div class="ibox">' + infBarras(D.M, [{ v: D.pv, c: 'b1' }, { v: D.pq, c: 'b3' }], 170, { valores: false, marco: tt && D.best.s ? { i: D.best.i, t: nf(D.best.s / tt * 100, 0) + ' %' } : null }) +
          '<table class="itbl"><tr><th></th>' + D.M.map(function (m) { return '<th>' + m.label.charAt(0).toUpperCase() + m.label.slice(1) + String(m.anio).slice(2) + '</th>'; }).join('') + '</tr>' +
          '<tr><td><i class="b3"></i>Vaq</td>' + D.pq.map(function (v) { return '<td>' + v + '</td>'; }).join('') + '</tr><tr><td><i class="b1"></i>Vacas</td>' + D.pv.map(function (v) { return '<td>' + v + '</td>'; }).join('') + '</tr></table></div>' +
          lado('<small>PARTOS VAQ</small><b>' + tq + '</b><span>' + (D.avm ? nf(tq / D.avm * 100, 0) + '% VM' : '') + '</span>') + '</div>' +
          (D.ab ? '<p class="inote">Además, ' + D.ab + (D.ab === 1 ? ' aborto' : ' abortos') + ' en el período. El recuadro marca los 6 meses seguidos con más partos.</p>' : '<p class="inote">El recuadro marca los 6 meses seguidos con más partos.</p>')) +
        sec('Indicadores reproductivos' + (D.fin ? ' <small>(' + mmaa(D.ini) + ' – ' + mmaa(D.fin) + ')</small>' : ''), D.fin ? '<table class="iind">' +
          '<tr><td>Intervalo parto servicio</td><td>' + f1(D.ips) + '</td></tr><tr><td>Servicios por preñez</td><td>' + f1(D.spp, 1) + '</td></tr><tr><td>Intervalo parto preñez</td><td>' + f1(D.ipp) + '</td></tr><tr><td>% Preñez general</td><td>' + f1(D.pg) + '</td></tr>' +
          '<tr class="isep"><td></td><td></td></tr><tr><td>Detección de celo (%)</td><td>' + f1(D.det, 1) + '</td></tr><tr><td>% Concepción</td><td>' + f1(D.con) + '</td></tr><tr><td>Tasa de preñez (%)</td><td>' + f1(D.tp) + '</td></tr></table>' : '<p class="inote">Sin servicios desde el inicio de la temporada elegido en Rodeo.</p>') +
        '</div>';
      // página 2
      var C = controlLechero(), V = C.V, rods = [];
      DB.animales.forEach(function (a) { if ((a.cat === 'vaca' || !a.cat) && rods.indexOf(a.rod || '—') < 0) rods.push(a.rod || '—'); });
      rods.sort();
      var vByRp = {}; V.forEach(function (v) { vByRp[v.a.rp] = v; });
      var st = function (l) { return l.length ? [l.reduce(function (s, x) { return s + x; }, 0) / l.length, Math.max.apply(null, l), Math.min.apply(null, l)] : [null, null, null]; };
      var fila = function (nom, A_) {
        var lt = [], del = [], ec = [], sdL = 0, sdE = 0, g = { pr: 0, nr: 0, va: 0, sd: 0 }, la = [0, 0, 0], ref = DB.fecha || today();
        A_.forEach(function (a) {
          var v = vByRp[a.rp]; if (v) lt.push(v.lt); else sdL++;
          if (a.pFecha) del.push(A.diffDays(ref, a.pFecha));
          var h = DB.hist[a.rp]; if (h && h.ec) ec.push(h.ec[1]); else sdE++;
          if (a.estado === 'prenada') g.pr++; else if (a.estado === 'servida') g.nr++; else if (a.estado === 'sin' && !a.sFecha && !a.tFecha) g.sd++; else g.va++;
          la[Math.min(2, Math.max(0, (a.pN || 1) - 1))]++;
        });
        var a1 = st(lt), a2 = st(del), a3 = st(ec);
        return '<tr><td><b>' + esc(nom) + '</b></td><td>' + A_.length + '</td><td>' + f1(a1[0], 1) + '</td><td>' + f1(a1[1], 1) + '</td><td>' + f1(a1[2], 1) + '</td><td>' + (sdL || '') + '</td>' +
          '<td>' + f1(a2[0]) + '</td><td>' + f1(a2[1]) + '</td><td>' + f1(a2[2]) + '</td>' +
          '<td>' + f1(a3[0], 1) + '</td><td>' + f1(a3[1], 1) + '</td><td>' + f1(a3[2], 1) + '</td><td>' + (sdE || '') + '</td>' +
          '<td>' + g.pr + '</td><td>' + g.nr + '</td><td>' + g.va + '</td><td>' + (g.sd || '') + '</td><td>' + la[0] + '</td><td>' + la[1] + '</td><td>' + la[2] + '</td></tr>';
      };
      var enProd = DB.animales.filter(function (a) { return a.cat === 'vaca' || !a.cat; });
      var tabla = '<table class="iest"><thead><tr><th></th><th></th><th colspan="4">Producción (L)</th><th colspan="3">Días lactancia</th><th colspan="4">Estado corporal</th><th colspan="4">Est. gestacional</th><th colspan="3">Anim. x lact.</th></tr>' +
        '<tr><th></th><th>Anim</th><th>Prom</th><th>Max</th><th>Min</th><th>S/D</th><th>Prom</th><th>Max</th><th>Min</th><th>Prom</th><th>Max</th><th>Min</th><th>S/D</th><th>Preñ</th><th>N.R.</th><th>Vac</th><th>S/D</th><th>1</th><th>2</th><th>3+</th></tr></thead><tbody>' +
        rods.map(function (r) { return fila(r, enProd.filter(function (a) { return (a.rod || '—') === r; })); }).join('') + (rods.length > 1 ? fila('Total', enProd).replace('<tr>', '<tr class="itot">') : '') + '</tbody></table>';
      var lim = limReal(), P = A.proyeccion(DB.animales, today(), 8, lim).filter(function (r) { return r.okSec; }).slice(0, 6);
      var pm = P.map(function (r) { return { label: r.label, anio: r.anio, lbl: r.label.charAt(0).toUpperCase() + r.label.slice(1) + ' ' + String(r.anio).slice(2) }; });
      // proyección de partos: por unidad (vacas) y vaquillonas, solo meses con preñeces confirmadas
      var ms = {}; DB.animales.forEach(function (a) { if (a.estado === 'prenada') { var d = A.derive(a, today()); if (d.partoProb && d.partoProb >= today() && d.partoProb <= lim) ms[d.partoProb.slice(0, 7)] = 1; } });
      var meses = Object.keys(ms).sort(), us = DB.unidades ? DB.unidades.filter(function (u) { return !DB.sel || DB.sel.indexOf(u.id) >= 0; }) : [{ id: null, nombre: '' }];
      var cuenta = function (fl) { return meses.map(function (k) { return DB.animales.filter(function (a) { if (a.estado !== 'prenada' || !fl(a)) return false; var d = A.derive(a, today()); return d.partoProb && d.partoProb.slice(0, 7) === k; }).length; }); };
      var filasP = us.map(function (u) { return { n: 'Vacas' + (u.nombre && us.length > 1 ? ' ' + u.nombre : ''), v: cuenta(function (a) { return a.cat !== 'vaquillona' && (u.id == null || a.u === u.id); }) }; })
        .concat([{ n: 'Vaq', v: cuenta(function (a) { return a.cat === 'vaquillona'; }) }]);
      var tot = meses.map(function (k, i) { return filasP.reduce(function (s, f) { return s + f.v[i]; }, 0); });
      var mlbl = function (k) { return A.MESES[+k.slice(5, 7) - 1].charAt(0).toUpperCase() + A.MESES[+k.slice(5, 7) - 1].slice(1) + '-' + k.slice(2, 4); };
      var p2 = '<div class="ipag"><p class="iprod">' + esc(PERFIL.nombre || '') + '</p>' +
        sec('Estado productivo y reproductivo actual', (V.length ? '<p class="inote" style="margin-top:0"><i>Control lechero ' + (C.fecha ? C.fecha.slice(5, 7) + '/' + C.fecha.slice(0, 4) : '') + '</i></p><div class="ibox">' + infDisp(V, rods) + '</div>' : '') +
          '<p class="isub">Estado productivo al ' + A.fmt(DB.fecha || today()) + ' · En producción</p>' + tabla +
          '<p class="inote">N.R.: servidas sin diagnóstico (no retorno). S/D: sin dato.</p>') +
        sec('Proyección del rodeo', P.length ? '<div class="ibox inarrow"><p class="icap">Promedio VO</p>' + infBarras(pm, [{ v: P.map(function (r) { return r.ord; }), c: 'b1' }], 200) + '</div>' : '<p class="inote">Sin preñeces confirmadas para proyectar.</p>') +
        sec('Proyección de partos totales', meses.length ? '<table class="iproy"><tr><th></th>' + meses.map(function (k) { return '<th>' + mlbl(k) + '</th>'; }).join('') + '<th></th></tr>' +
          filasP.map(function (f) { return '<tr><td><b>' + esc(f.n) + '</b></td>' + f.v.map(function (v) { return '<td>' + (v || '') + '</td>'; }).join('') + '<td></td></tr>'; }).join('') +
          '<tr class="itot"><td><b>Total</b></td>' + tot.map(function (v) { return '<td><b>' + v + '</b></td>'; }).join('') + '<td><b>' + tot.reduce(function (s, x) { return s + x; }, 0) + '</b></td></tr></table><p class="inote">Solo preñeces confirmadas por tacto.</p>' : '<p class="inote">Sin partos confirmados.</p>') +
        '<p class="ifirma">Dr. Mauro Torterolo</p></div>';
      var bar = '<div class="infbar"><button class="btn" data-a="infcerrar">Volver</button><div class="filters">' + [['12', 'Últimos 12 meses'], ['ej', 'Ejercicio jul–jun']].map(function (c) { return '<button class="fchip" data-im="' + c[0] + '" aria-pressed="' + (modo === c[0]) + '">' + c[1] + '</button>'; }).join('') + '</div><button class="btn primary" data-a="infpdf">Guardar PDF</button></div>';
      return '<div class="inf">' + bar + p1 + p2 + '</div>';
    }
    function abrirInforme() {
      if (!esVet() || !DB.hist) { toast('El informe anual necesita el respaldo de SysCaw y el modo veterinario.'); return; }
      closeSheet(); state.informe = true; render(); window.scrollTo(0, 0);
    }
    function pdfInforme() {
      var t = document.title; document.title = 'Informe ' + (DB.unidad || PERFIL.nombre || '') + ' ' + (DB.fecha || today());
      setTimeout(function () { window.print(); setTimeout(function () { document.title = t; }, 500); }, 50);
    }

    /* ----- Población (solo veterinario): todos los tambos guardados en este equipo ----- */
    var POB = null;
    // resumen de un tambo: usa las mismas cuentas que la app, poniendo ese tambo como activo un momento
    function pobResumen(t, o) {
      var g = { DB: DB, act: TAMBOS.activo, ini21: state.ini21, pev: state.pev }, r = { id: t.id, nombre: t.nombre || 'Sin nombre', origen: o && o.origen === 'fosapp' ? 'fosapp' : 'syscaw' };
      if (!o || o.fuente !== 'syscaw' || !o.hist) { r.sin = true; return r; }
      try {
        TAMBOS.activo = t.id; DB = o; DB.sel = null; aplicarUnidad(); state.ini21 = null; state.pev = null;
        var ini = inicio21(), pev = pevActual(), ref = DB.fecha || today();
        var an = DB.animales.map(function (a) { return { h: DB.hist[a.rp], salida: null, desc: a.dFecha || (a.rech ? '0000' : null) }; })
          .concat((DB.bajas || []).map(function (b) { return { h: DB.hist[b.key], salida: b.bFecha, desc: b.dFecha || null }; }));
        var suma = function (C) { var T = { aptas: 0, serv: 0, pren: 0, sOk: 0, sMal: 0, n: 0 }; C.forEach(function (c) { if (!c.cerrado) return; T.n++; ['aptas', 'serv', 'pren', 'sOk', 'sMal'].forEach(function (k) { T[k] += c[k]; }); }); return T; };
        // temporada de servicios: 9 meses desde el inicio (ej. 1/5 a 31/1); lo de afuera no cuenta
        var finTemp = function (d) { var y = +d.slice(0, 4), m = +d.slice(5, 7) + 9; if (m > 12) { y++; m -= 12; } return A.addDays(y + '-' + (m < 10 ? '0' : '') + m + '-01', +d.slice(8, 10) - 2); };
        var finAct = finTemp(ini), C = ini <= ref ? A.ciclos21(an, esPren, ini, pev, finAct < ref ? finAct : ref) : [];
        r.ini = ini; r.ref = ref; r.T = suma(C);
        var iniAnt = (+ini.slice(0, 4) - 1) + ini.slice(4), finAnt = finTemp(iniAnt);
        if (finAnt >= ini) finAnt = A.addDays(ini, -1);
        r.iniAnt = iniAnt; r.finAnt = finAnt;
        if (iniAnt >= (DB.desdeHist != null ? DB.desdeHist : A.addDays(ref, -730))) r.TA = suma(A.ciclos21(an, esPren, iniAnt, pev, finAnt));
        r.vacas = DB.animales.filter(function (a) { return !a.cat || a.cat === 'vaca' || a.cat === 'seca'; }).length;
        var D = infDatos('12'); r.ips = D.ips; r.ipp = D.ipp; r.spp = D.spp; r.pg = D.pg; r.vo = D.avo; r.vs = D.avs;
        r.mk = D.M.map(function (m) { return m.key; }); r.pv = D.pv; r.pq = D.pq; r.best = D.best;
        // leche: último control y promedio de los últimos 12 meses (litros por vaca en ordeñe)
        var porF = {}; (DB.ctrls || []).forEach(function (c) { var x = porF[c[0]] || (porF[c[0]] = { v: 0, l: 0, d: 0 }); x.v += c[2] || 0; x.l += c[3] || 0; x.d += (c[4] || 0) * (c[2] || 0); });
        var fs = Object.keys(porF).filter(function (f) { return porF[f].v > 0; }).sort();
        if (fs.length) {
          var u = porF[fs[fs.length - 1]]; r.lFecha = fs[fs.length - 1]; r.lv = u.l / u.v; r.del = u.d ? u.d / u.v : null;
          var d12 = A.addDays(r.lFecha, -365), l12 = fs.filter(function (f) { return f > d12; }).map(function (f) { return porF[f].l / porF[f].v; });
          r.lv12 = l12.reduce(function (s, x) { return s + x; }, 0) / l12.length;
        }
      } catch (e) { r.error = String(e && e.message || e); }
      finally { DB = g.DB; TAMBOS.activo = g.act; state.ini21 = g.ini21; state.pev = g.pev; }
      return r;
    }
    function pobCalc() {
      POB = { cargando: true }; render();
      var L = TAMBOS.lista.slice(), F = [], i = 0;
      var paso = function () {
        if (i >= L.length) {
          POB = { filas: F, hecho: Date.now() }; render(); return;
        }
        var t = L[i++]; POB.prog = i + ' de ' + L.length + ': ' + (t.nombre || ''); render();
        leerDB(t.id).then(function (o) { F.push(pobResumen(t, o)); setTimeout(paso, 30); }, function () { setTimeout(paso, 30); });
      };
      setTimeout(paso, 30);
    }
    function abrirPoblacion() {
      if (!esVet()) return;
      closeSheet(); state.pobIni = !!state.inicio; state.inicio = false; state.pobl = true; state.informe = false; pobCalc(); window.scrollTo(0, 0);
    }
    function pobHTML() {
      var bar = '<div class="infbar"><button class="btn" data-a="pobcerrar">Volver</button><button class="btn" data-a="pobcalc">Recalcular</button></div>';
      if (!POB || POB.cargando) return bar + '<section class="card"><h2>Población de tambos</h2><p class="hint">Calculando… ' + esc(POB && POB.prog || '') + '</p></section>';
      var F = POB.filas.filter(function (f) { return !f.sin && !f.error; }), sin = POB.filas.filter(function (f) { return f.sin || f.error; });
      var p = function (n, d) { return d ? Math.round(n / d * 100) + '%' : '–'; }, v = function (x, d) { return x == null || isNaN(x) ? '–' : nf(x, d || 0); };
      var hoy = today(), viejo = function (f) { return A.diffDays(hoy, f.ref) > 60; };
      var Tt = { aptas: 0, serv: 0, pren: 0, sOk: 0, sMal: 0 }, TAt = { aptas: 0, pren: 0 }, vac = 0;
      F.forEach(function (f) { ['aptas', 'serv', 'pren', 'sOk', 'sMal'].forEach(function (k) { Tt[k] += f.T[k]; }); if (f.TA) { TAt.aptas += f.TA.aptas; TAt.pren += f.TA.pren; } vac += f.vacas || 0; });
      var tp = function (f) { return f.T.aptas ? f.T.pren / f.T.aptas : -1; };
      var srt = state.pobSort || 'tp', key = { tp: tp, ts: function (f) { return f.T.aptas ? f.T.serv / f.T.aptas : -1; }, tc: function (f) { return f.T.sOk + f.T.sMal ? f.T.sOk / (f.T.sOk + f.T.sMal) : -1; }, vacas: function (f) { return f.vacas || 0; } }[srt] || tp;
      var R = F.slice().sort(function (a, b) { return key(b) - key(a); });
      var th = function (k, t) { return '<th><button class="psort" data-ps="' + k + '" aria-pressed="' + (srt === k) + '">' + t + (srt === k ? ' ▾' : '') + '</button></th>'; };
      var bajo = function (x, prom) { return x != null && prom != null && x < prom - 5 ? ' class="pbajo"' : ''; };
      var pTS = Tt.aptas ? Tt.serv / Tt.aptas * 100 : null, pTC = Tt.sOk + Tt.sMal ? Tt.sOk / (Tt.sOk + Tt.sMal) * 100 : null, pTP = Tt.aptas ? Tt.pren / Tt.aptas * 100 : null;
      var nom = function (f) { return '<td class="pnom">' + esc(f.nombre) + '<small' + (viejo(f) ? ' class="pbajo"' : '') + '>respaldo ' + A.fmt(f.ref) + '</small></td>'; };
      var rep = '<section class="card"><h2>Reproducción: temporada actual</h2>' +
        '<div class="kpis"><div><b>' + v(pTS) + '%</b><span>Tasa de servicio</span></div><div><b>' + v(pTC) + '%</b><span>Concepción</span></div><div class="tp"><b>' + v(pTP) + '%</b><span>Tasa de preñez</span></div></div>' +
        '<p class="cap">Promedio de la población: ' + F.length + ' tambos, ' + nf(vac) + ' vacas, ciclos de 21 días cerrados. Tocá un título para ordenar.</p>' +
        '<div class="pscroll"><table class="tbl ptbl"><thead><tr><th>Tambo</th>' + th('vacas', 'Vacas') + th('ts', 'Servicio') + th('tc', 'Concep.') + th('tp', 'Preñez') + '<th>Preñez temp. anterior</th></tr></thead><tbody>' +
        R.map(function (f) {
          var ts = f.T.aptas ? f.T.serv / f.T.aptas * 100 : null, tc = f.T.sOk + f.T.sMal ? f.T.sOk / (f.T.sOk + f.T.sMal) * 100 : null, tpp = f.T.aptas ? f.T.pren / f.T.aptas * 100 : null;
          return '<tr>' + nom(f) + '<td>' + v(f.vacas) + '</td><td' + bajo(ts, pTS) + '><b>' + p(f.T.serv, f.T.aptas) + '</b><small>' + f.T.n + ' ciclos</small></td><td' + bajo(tc, pTC) + '>' + p(f.T.sOk, f.T.sOk + f.T.sMal) + '</td><td' + bajo(tpp, pTP) + '><b>' + p(f.T.pren, f.T.aptas) + '</b></td><td>' + (f.TA ? p(f.TA.pren, f.TA.aptas) : '–') + '</td></tr>';
        }).join('') +
        '<tr class="ptot"><td>Población</td><td>' + nf(vac) + '</td><td><b>' + p(Tt.serv, Tt.aptas) + '</b></td><td>' + p(Tt.sOk, Tt.sOk + Tt.sMal) + '</td><td><b>' + p(Tt.pren, Tt.aptas) + '</b></td><td>' + p(TAt.pren, TAt.aptas) + '</td></tr></tbody></table></div>' +
        '<p class="cap">En <b class="pbajo">rojo</b>, más de 5 puntos por debajo del promedio de la población. Cada tambo usa su propio inicio de servicios y espera voluntaria (los de la pestaña Rodeo). Las temporadas cuentan 9 meses desde ese inicio (por ejemplo, de mayo a enero); <b>Preñez temp. anterior</b> es la misma cuenta (preñadas / aptas, sumando los ciclos cerrados) en la temporada del año pasado. Respaldo en rojo: tiene más de 60 días.</p></section>';
      var av = function (k) { var l = F.map(function (f) { return f[k]; }).filter(function (x) { return x != null && !isNaN(x); }); return l.length ? l.reduce(function (s, x) { return s + x; }, 0) / l.length : null; };
      var R2 = F.slice().sort(function (a, b) { return (a.ips || 999) - (b.ips || 999); });
      var inter = '<section class="card"><h2>Intervalos (últimos 12 meses)</h2><div class="pscroll"><table class="tbl ptbl"><thead><tr><th>Tambo</th><th>Parto a 1er servicio</th><th>Parto a preñez</th><th>Servicios por preñez</th><th>% preñez general</th></tr></thead><tbody>' +
        R2.map(function (f) { return '<tr>' + nom(f) + '<td>' + v(f.ips) + '</td><td>' + v(f.ipp) + '</td><td>' + v(f.spp, 1) + '</td><td>' + (f.pg == null ? '–' : v(f.pg) + '%') + '</td></tr>'; }).join('') +
        '<tr class="ptot"><td>Promedio</td><td>' + v(av('ips')) + '</td><td>' + v(av('ipp')) + '</td><td>' + v(av('spp'), 1) + '</td><td>' + (av('pg') == null ? '–' : v(av('pg')) + '%') + '</td></tr></tbody></table></div><p class="cap">Días promedio. Mismas cuentas que el informe anual.</p></section>';
      var R3 = F.slice().sort(function (a, b) { return (b.lv || 0) - (a.lv || 0); });
      var po = function (f) { return f.vo != null && f.vo + f.vs ? f.vo / (f.vo + f.vs) * 100 : null; };
      var lec = '<section class="card"><h2>Leche y rodeo</h2><div class="pscroll"><table class="tbl ptbl"><thead><tr><th>Tambo</th><th>Litros/vaca último control</th><th>Litros/vaca 12 meses</th><th>Días en leche</th><th>Vacas en ordeñe</th><th>% en ordeñe</th></tr></thead><tbody>' +
        R3.map(function (f) { return '<tr>' + nom(f) + '<td><b>' + v(f.lv, 1) + '</b><small>' + (f.lFecha ? A.fmt(f.lFecha) : '') + '</small></td><td>' + v(f.lv12, 1) + '</td><td>' + v(f.del) + '</td><td>' + v(f.vo) + '</td><td>' + (po(f) == null ? '–' : v(po(f)) + '%') + '</td></tr>'; }).join('') +
        '<tr class="ptot"><td>Promedio</td><td>' + v(av('lv'), 1) + '</td><td>' + v(av('lv12'), 1) + '</td><td>' + v(av('del')) + '</td><td>' + v(av('vo')) + '</td><td>–</td></tr></tbody></table></div><p class="cap">Vacas en ordeñe y % en ordeñe: promedio diario de los últimos 12 meses.</p></section>';
      // partos de los últimos 12 meses, en % de las vacas promedio (en ordeñe + secas) de cada tambo
      var fin = F.reduce(function (s, f) { return f.mk && f.mk[11] > s ? f.mk[11] : s; }, '');
      var par = '';
      if (fin) {
        var MK = []; for (var i = 11; i >= 0; i--) { var yy = +fin.slice(0, 4), mm = +fin.slice(5, 7) - i; while (mm < 1) { mm += 12; yy--; } MK.push({ key: yy + '-' + pad2(mm), label: A.MESES[mm - 1], anio: yy }); }
        var den = 0, sv = MK.map(function () { return 0; }), sq = sv.slice();
        var vmf = function (f) { return (f.vo || 0) + (f.vs || 0); };
        F.forEach(function (f) { if (!f.mk || !vmf(f)) return; den += vmf(f); f.mk.forEach(function (k, j) { var ix = -1; MK.forEach(function (m, q) { if (m.key === k) ix = q; }); if (ix >= 0) { sv[ix] += f.pv[j]; sq[ix] += f.pq[j]; } }); });
        var pv = sv.map(function (x) { return den ? x / den * 100 : null; }), pq = sq.map(function (x) { return den ? x / den * 100 : null; });
        var tv = sv.reduce(function (s, x) { return s + x; }, 0), tq = sq.reduce(function (s, x) { return s + x; }, 0);
        var sum = function (l) { return l.reduce(function (s, x) { return s + x; }, 0); };
        var R4 = F.filter(function (f) { return f.mk && vmf(f); }).sort(function (x, y) { return (sum(y.pv) + sum(y.pq)) / vmf(y) - (sum(x.pv) + sum(x.pq)) / vmf(x); });
        par = '<section class="card"><h2>Partos de los últimos 12 meses</h2>' +
          '<div class="kpis"><div><b>' + v(den ? tv / den * 100 : null) + '%</b><span>Vacas</span></div><div><b>' + v(den ? tq / den * 100 : null) + '%</b><span>Vaquillonas</span></div><div class="tp"><b>' + v(den ? (tv + tq) / den * 100 : null) + '%</b><span>Total</span></div></div>' +
          '<div class="mleg"><span><i class="pv1"></i>Vacas</span><span><i class="pv3"></i>Vaquillonas</span></div>' +
          '<div class="pchart">' + infBarras(MK, [{ v: pv.map(function (x) { return x == null ? null : Math.round(x * 10) / 10; }), c: 'b1' }, { v: pq.map(function (x) { return x == null ? null : Math.round(x * 10) / 10; }), c: 'b3' }], 190, { valores: false }) + '</div>' +
          '<p class="cap">Partos de cada mes en % de las vacas promedio (en ordeñe + secas) de la población. Sin abortos. El último mes puede estar incompleto según la fecha del respaldo.</p>' +
          '<div class="pscroll"><table class="tbl ptbl"><thead><tr><th>Tambo</th><th>Vacas</th><th>Vaquillonas</th><th>Total</th><th>Mes con más partos</th><th>Mejores 6 meses seguidos</th></tr></thead><tbody>' +
          R4.map(function (f) {
            var d = vmf(f), a1 = sum(f.pv), a2 = sum(f.pq), tt = a1 + a2, pk = 0;
            f.mk.forEach(function (k, j) { if (f.pv[j] + f.pq[j] > f.pv[pk] + f.pq[pk]) pk = j; });
            var b6 = f.best && tt ? f.best.s / tt * 100 : null, m6 = f.best ? A.MESES[+f.mk[f.best.i].slice(5, 7) - 1] + '–' + A.MESES[+f.mk[f.best.i + 5].slice(5, 7) - 1] : '';
            return '<tr>' + nom(f) + '<td>' + v(a1 / d * 100) + '%</td><td>' + v(a2 / d * 100) + '%</td><td><b>' + v(tt / d * 100) + '%</b></td><td>' + (tt ? A.MESES[+f.mk[pk].slice(5, 7) - 1] + ' ' + f.mk[pk].slice(2, 4) + '<small>' + v((f.pv[pk] + f.pq[pk]) / d * 100, 1) + '% de las vacas</small>' : '–') + '</td><td>' + (b6 == null ? '–' : v(b6) + '%<small>' + m6 + '</small>') + '</td></tr>';
          }).join('') +
          '<tr class="ptot"><td>Población</td><td>' + v(den ? tv / den * 100 : null) + '%</td><td>' + v(den ? tq / den * 100 : null) + '%</td><td>' + v(den ? (tv + tq) / den * 100 : null) + '%</td><td></td><td></td></tr></tbody></table></div>' +
          '<p class="cap">Mejores 6 meses seguidos: qué parte de los partos del año cayó en los 6 meses seguidos con más partos (más alto = partos más concentrados).</p></section>';
      }
      return '<div class="pob">' + bar +
        '<section class="card"><h2>Población de tambos</h2><p>' + F.length + ' tambos en este equipo: ' + (function () { var nf2 = F.filter(function (f) { return f.origen === 'fosapp'; }).length, ns = F.length - nf2; return [ns ? ns + ' con respaldo de SysCaw' : '', nf2 ? nf2 + ' con base de FOSAPP' : ''].filter(Boolean).join(' y '); })() + (sin.length ? ' · sin respaldo: ' + sin.map(function (f) { return esc(f.nombre); }).join(', ') : '') + '.</p>' +
        '<p class="cap">Para sumar un tambo, cargá su respaldo (Ajustes → Agregar otro tambo). Para usar la población en la computadora: Ajustes → Guardar copia de la base, y en la computadora, Cargar copia de la base.</p></section>' +
        '<div class="pobgrid">' + rep + par + inter + lec + '</div></div>';
    }
    /* copia de la base: todos los tambos de este equipo en un solo archivo (para pasar a la computadora o guardar) */
    function exportarBase() {
      closeSheet(); toast('Preparando la copia…');
      Promise.all(TAMBOS.lista.map(function (t) { return leerDB(t.id); })).then(function (dbs) {
        var obj = { tipo: 'libreta-base', v: 1, fecha: today(), tambos: TAMBOS.lista, dbs: {}, ps: {} };
        TAMBOS.lista.forEach(function (t, i) { if (dbs[i]) obj.dbs[t.id] = dbs[i]; });
        try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (/^libreta:[a-z0-9]+:t[a-z0-9]+$/i.test(k)) obj.ps[k] = localStorage.getItem(k); } } catch (e) {}
        var blob = new Blob([JSON.stringify(obj)], { type: 'application/json' }), nombre = 'base-tambos-' + today();
        var fin = function (b, ext) {
          var file = null; try { file = new File([b], nombre + ext, { type: ext === '.gz' ? 'application/gzip' : 'application/json' }); } catch (e) {}
          var bajar = function () { var u = URL.createObjectURL(b), a = document.createElement('a'); a.href = u; a.download = nombre + ext; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 4000); toast('Guardada en Descargas: ' + nombre + ext); };
          if (file && navigator.canShare && navigator.canShare({ files: [file] })) navigator.share({ files: [file], title: nombre }).catch(function (e) { if (!e || e.name !== 'AbortError') bajar(); });
          else bajar();
        };
        if (root.CompressionStream) new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob().then(function (b) { fin(b, '.gz'); }, function () { fin(blob, '.json'); });
        else fin(blob, '.json');
      }, function () { toast('No pude preparar la copia.'); });
    }
    function importarBase(file) {
      if (!file) return;
      file.arrayBuffer().then(function (buf) {
        var b = new Uint8Array(buf);
        if (b[0] === 0x1f && b[1] === 0x8b) {
          if (!root.DecompressionStream) throw new Error('Este navegador no puede abrir el archivo. Usá Chrome.');
          return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
        }
        return new TextDecoder().decode(b);
      }).then(function (txt) {
        var o = JSON.parse(txt);
        if (!o || o.tipo !== 'libreta-base' || !Array.isArray(o.tambos)) throw new Error('Ese archivo no es una copia de la base de tambos.');
        var nuevos = 0, act = 0, igual = 0, tareas = [];
        o.tambos.forEach(function (t) {
          var db = o.dbs && o.dbs[t.id]; if (!db) return;
          var ex = null; TAMBOS.lista.forEach(function (x) { if (x.id === t.id) ex = x; }); if (!ex) ex = tamboPorNombre(t.nombre);
          if (ex && ex.fecha && t.fecha && ex.fecha >= t.fecha) { igual++; return; }
          if (!ex) { ex = { id: t.id, nombre: t.nombre, logo: t.logo || '' }; TAMBOS.lista.push(ex); nuevos++; } else act++;
          ex.n = t.n; ex.fuente = t.fuente; ex.fecha = t.fecha; if (!ex.logo && t.logo) ex.logo = t.logo;
          tareas.push(idbSet(dbKey(ex.id), db));
          Object.keys(o.ps || {}).forEach(function (k) { if (k.slice(-(t.id.length + 1)) === ':' + t.id) { var nk = k.slice(0, -t.id.length) + ex.id; try { if (localStorage.getItem(nk) == null) localStorage.setItem(nk, o.ps[k]); } catch (e) {} } });
        });
        return Promise.all(tareas).then(function () {
          saveTambos();
          var ir = tamboAct() && DB.animales.length ? Promise.resolve() : abrirTambo((tamboAct() || TAMBOS.lista[0]).id);
          return ir.then(function () { closeSheet(); render(); toast('Copia cargada: ' + nuevos + ' tambos nuevos, ' + act + ' actualizados' + (igual ? ', ' + igual + ' ya estaban al día' : '') + '.'); if (state.pobl) pobCalc(); });
        });
      }).catch(function (e) { toast(e && e.message ? e.message : 'No pude leer el archivo.'); });
    }

    /* ----- exportar a Excel: lista de tacto con filtro previo ----- */
    // criterios: se toma cada uno que esté completo; un animal entra si cumple cualquiera de ellos
    function xMotivos(a, f, hoy, secar) {
      var m = [], cat = a.cat || 'vaca';
      if (!((cat === 'vaca' && f.ord) || (cat === 'seca' && f.sec) || (cat === 'vaquillona' && f.vaq))) return m;
      // para venta: se toma aunque esté marcado "Excluir descartes" (la venta es justamente de descartes)
      if (f.venta && paraVenta(a)) m.push('Para venta' + (a.rech ? ': ' + (a.rechDet || a.rech) : '') + (typeof (a.pr || [])[0] === 'number' ? ', ' + nf(a.pr[0], 1) + ' L' : '') + (delDe(a) != null ? ', ' + nf(delDe(a)) + ' días en leche' : ''));
      if (f.sinDesc && a.rech) return m;
      var serv = a.sFecha && !/^celo/i.test(a.toro || '');
      if (f.sdx > 0 && a.estado !== 'prenada' && serv && (!a.tFecha || a.tFecha < a.sFecha)) { var d = A.diffDays(hoy, a.sFecha); if (d >= f.sdx) m.push('Servida hace ' + d + ' días sin diagnóstico'); }
      if (f.psv > 0 && a.pFecha && a.estado !== 'prenada' && (!a.sFecha || a.sFecha <= a.pFecha)) { var p = A.diffDays(hoy, a.pFecha); if (p >= f.psv) m.push('Parida hace ' + p + ' días sin servicio'); }
      if (f.celo && a.celo) m.push('Preñada con celo posterior');
      if (f.secar && secar[a.rp]) m.push('Para secar: ' + secar[a.rp].dp + ' días al parto');
      return m;
    }
    function xFiltradas() {
      var f = state.xf, hoy = today(), secar = {};
      if (f.secar) listaSecado(fechaSecado()).forEach(function (x) { secar[x.a.rp] = x; });
      var out = [];
      DB.animales.forEach(function (a) { var m = xMotivos(a, f, hoy, secar); if (m.length) out.push({ a: a, m: m }); });
      return out;
    }
    function xOpts() {
      var f = state.xf, n = xFiltradas().length;
      var chk = function (k, t) { return '<button class="fchip" data-xk="' + k + '" aria-pressed="' + !!f[k] + '">' + t + '</button>'; };
      var num = function (k, a, b) { return '<label class="xnum">' + a + ' <input type="number" inputmode="numeric" min="1" max="999" data-xn="' + k + '" value="' + (f[k] || '') + '" placeholder="–"> ' + b + '</label>'; };
      $('#xopts').innerHTML = '<p class="xlbl">Categoría</p><div class="filters">' + chk('ord', 'Vacas en ordeñe') + chk('sec', 'Secas') + chk('vaq', 'Vaquillonas') + '</div>' +
        '<div class="filters" style="margin-top:8px">' + chk('sinDesc', 'Excluir descartes') + '</div>' +
        '<p class="xlbl">Incluir (lo que quede vacío no se toma)</p>' +
        num('sdx', 'Servidas con más de', 'días sin diagnóstico') +
        num('psv', 'Paridas con más de', 'días sin servicio') +
        '<div class="filters" style="margin-top:8px">' + chk('celo', 'Preñadas con celo') + chk('secar', 'Para secar por preñez') + chk('venta', 'Para venta') + '</div>' +
        (f.venta ? '<p class="cap">Para venta: ' + esc(vtaTxt()) + ' (se cambia en Tareas → Para venta).</p>' : '') +
        (f.secar ? '<p class="cap">Para secar: preñadas a ' + A.SECADO + ' días o menos del parto el ' + A.fmt(fechaSecado()) + ' (fecha de Tareas → Para secar).</p>' : '') +
        '<p class="xcount"><b>' + n + '</b> ' + (n === 1 ? 'animal' : 'animales') + '</p>';
      $('#btnXok').disabled = !n;
    }
    function xActualizarCuenta() { var n = xFiltradas().length; var c = $('#xopts .xcount'); if (c) c.innerHTML = '<b>' + n + '</b> ' + (n === 1 ? 'animal' : 'animales'); $('#btnXok').disabled = !n; }
    function abrirExport() {
      var g = null; try { g = JSON.parse(localStorage.getItem('libreta:xf')); } catch (e) {}
      state.xf = g || { ord: true, sec: false, vaq: true, sinDesc: true, sdx: A.DX_MIN, psv: null, celo: false, secar: false };
      $('#sheetXTitle').textContent = 'Armar lista';
      $('#xbtns').innerHTML = '<button class="btn primary big" id="btnXok" data-a="xok">Ver lista y exportar</button><button class="btn" data-a="xcancel">Cancelar</button>';
      xOpts(); $('#sheetX').hidden = false;
    }
    function exportarTactar() {
      try { localStorage.setItem('libreta:xf', JSON.stringify(state.xf)); } catch (e) {}
      var L = xFiltradas().sort(function (x, y) { return numRp(x.a, y.a); }), ref = today();
      var fila = function (x) {
        var a = x.a, h = DB.hist ? DB.hist[a.rp] : null, ins = null, serv = a.sFecha && !/^celo/i.test(a.toro || '');
        if (h) h.ev.forEach(function (e) { if (e[1] === 'S' && e[0] === a.sFecha) ins = e[3] || null; });
        return [a.rp, a.nombre || '', a.cat === 'vaquillona' ? 'Vaquillona' : a.cat === 'seca' ? 'Seca' : 'En ordeñe', a.rod || '', x.m.join(' · '), a.pN || '', a.pFecha ? A.fmt(a.pFecha) : '',
          a.pFecha ? A.diffDays(ref, a.pFecha) : '', a.sFecha ? A.fmt(a.sFecha) : '', a.sFecha ? A.diffDays(ref, a.sFecha) : '', a.sN || '', serv ? (a.toro || '') : (a.sFecha ? 'Celo' : ''), ins || '',
          a.tFecha ? A.fmt(a.tFecha) : '', a.result || '', a.rech ? (a.rechDet || a.rech) : '', typeof (a.pr || [])[0] === 'number' ? a.pr[0] : ''];
      };
      var head = ['Caravana', 'Nombre', 'Categoría', 'Rodeo', 'Motivo', 'Lactancia', 'Último parto', 'Días en leche', 'Último servicio', 'Días desde servicio', 'Nº servicio', 'Toro', 'Inseminador', 'Último tacto', 'Resultado', 'Descarte', 'Litros último control'];
      var tit = 'Lista · ' + (PERFIL.nombre || 'Tambo') + ' · ' + A.fmt(ref);
      var ws = root.XLSX.utils.aoa_to_sheet([[tit], [], head].concat(L.map(fila)));
      ws['!cols'] = head.map(function (h, i) { return { wch: i === 4 ? 34 : i === 1 ? 18 : Math.max(9, h.length + 2) }; });
      var wb = root.XLSX.utils.book_new(); root.XLSX.utils.book_append_sheet(wb, ws, 'Lista');
      var nombre = ('Lista ' + (PERFIL.nombre || '') + ' ' + ref).replace(/[\\/:*?"<>|]+/g, '').trim() + '.xlsx';
      var buf = root.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      var file = null; try { file = new File([buf], nombre, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }); } catch (e) {}
      // CSV separado por comas (como lo lee Excel en el celular) para los teléfonos que no dejan compartir .xlsx
      var csv = '\ufeff' + [head].concat(L.map(fila)).map(function (r) { return r.map(function (v) { v = v == null ? '' : String(v); return /[,;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); }).join('\r\n');
      var fcsv = null; try { fcsv = new File([csv], nombre.replace(/\.xlsx$/, '.csv'), { type: 'text/csv' }); } catch (e) {}
      state.xout = { wb: wb, file: file, csv: fcsv, nombre: nombre };
      // la lista queda a la vista y después se elige compartir o guardar
      var puedeComp = !!(navigator.share && (file || fcsv));
      $('#sheetXTitle').textContent = 'Lista · ' + L.length + (L.length === 1 ? ' animal' : ' animales');
      $('#xopts').innerHTML = '<div class="xprev">' + L.map(function (x) { return '<div><b>' + esc(x.a.rp) + '</b><span>' + esc(x.m.join(' · ')) + '</span></div>'; }).join('') + '</div>' +
        '<p class="cap">Archivo: ' + esc(nombre) + '</p>';
      $('#xbtns').innerHTML = (puedeComp ? '<button class="btn primary big" data-a="xshare">Compartir Excel (WhatsApp, mail…)</button><button class="btn" data-a="xsharecsv">Compartir como CSV (se abre con Excel)</button>' : '') +
        '<button class="btn' + (puedeComp ? '' : ' primary big') + '" data-a="xsave">Guardar Excel en el teléfono</button><button class="btn" data-a="xcancel">Cerrar</button>';
    }
    function xCompartir() {
      var o = state.xout; if (!o) return;
      var falla = function () { root.XLSX.writeFile(o.wb, o.nombre); toast('Este teléfono no deja compartir Excel: quedó guardado en Descargas. Podés mandarlo desde ahí o usar "Compartir como CSV".'); };
      if (!o.file || !(navigator.canShare && navigator.canShare({ files: [o.file] }))) { falla(); return; }
      navigator.share({ files: [o.file], title: o.nombre }).catch(function (e) { if (!e || e.name !== 'AbortError') falla(); });
    }
    function xCompartirCSV() {
      var o = state.xout; if (!o || !o.csv) return;
      if (navigator.canShare && navigator.canShare({ files: [o.csv] })) navigator.share({ files: [o.csv], title: o.csv.name }).catch(function (e) { if (!e || e.name !== 'AbortError') toast('No se pudo compartir. Usá "Guardar Excel en el teléfono".'); });
      else toast('Este teléfono no deja compartir archivos. Usá "Guardar Excel en el teléfono".');
    }
    function xGuardar() { var o = state.xout; if (!o) return; root.XLSX.writeFile(o.wb, o.nombre); toast('Guardado en Descargas: ' + o.nombre); }

    /* ----- render ----- */
    var NAVS = [
      ['buscar', 'Buscar', '<circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M15.5 15.5L21 21" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'],
      ['tareas', 'Tareas', '<path d="M5 6.5l2 2 3.5-4M5 14.5l2 2 3.5-4M14 7h6M14 15h6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'],
      ['leche', 'Leche', '<path d="M12 3.5s-6 6.6-6 10.8a6 6 0 0 0 12 0c0-4.2-6-10.8-6-10.8z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>'],
      ['rodeo', 'Rodeo', '<path d="M5 20V11M12 20V4M19 20v-6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>']
    ];
    function render() {
      var main = $('#main'), nav = $('#nav'), nombre = PERFIL.nombre || 'Libreta';
      $('#nombre').textContent = nombre;
      document.title = PERFIL.nombre ? 'Libreta ' + PERFIL.nombre : 'Libreta de vacas';
      $('#logo').innerHTML = PERFIL.logo ? '<img alt="" src="' + PERFIL.logo + '">' : LOGO_LIBRETA;
      $('#logo').className = 'logo' + (PERFIL.logo ? ' has' : '');
      $('#tbtn').hidden = TAMBOS.lista.length < 2;
      if (TAMBOS.lista.length > 1) $('#tbtnTxt').textContent = TAMBOS.lista.length + ' tambos · cambiar';
      $('#nTambos').textContent = TAMBOS.lista.length > 1 ? (esVet() ? 'Cambiar o agregar tambo (' : 'Tambos (') + TAMBOS.lista.length + ')' : 'Agregar otro tambo';
      // modo veterinario: el botón del encabezado vuelve al inicio
      var vet = esVet();
      $('#tbtn').dataset.a = vet ? 'inicio' : 'tambos';
      if (vet && TAMBOS.lista.length) { $('#tbtn').hidden = false; $('#tbtnTxt').textContent = 'Inicio · ' + TAMBOS.lista.length + (TAMBOS.lista.length === 1 ? ' tambo' : ' tambos'); }
      if (state.inicio && vet && TAMBOS.lista.length) {
        $('#nombre').textContent = 'Inicio'; document.title = 'Libreta · inicio';
        $('#logo').innerHTML = LOGO_LIBRETA; $('#logo').className = 'logo';
        $('#meta').textContent = 'Modo veterinario'; nav.hidden = true; $('#ubtn').hidden = true; $('#tbtn').hidden = true;
        document.body.classList.remove('ancho');
        main.innerHTML = inicioHTML(); return;
      }
      state.inicio = false;
      if (!DB.animales.length) {
        $('#meta').textContent = 'Sin libreta cargada'; nav.hidden = true; $('#ubtn').hidden = true;
        main.innerHTML = emptyHTML(); return;
      }
      // sin activación no se muestra ninguna libreta, aunque ya esté cargada en el teléfono
      if (!habilitado(DB.idProd)) {
        $('#meta').textContent = 'Libreta sin activar'; nav.hidden = true; $('#ubtn').hidden = true;
        main.innerHTML = '<section class="empty"><div class="emptytag">' + LOGO_LIBRETA.replace('width="34" height="34"', 'width="72" height="72"') + '</div><h2>Activá tu libreta</h2>' +
          '<p>Escribí el código de activación que te mandó el Dr. Mauro Torterolo.</p>' +
          codigoHTML() + '</section>';
        return;
      }
      var op = esOperario();
      if (op) { state.tab = 'buscar'; state.informe = false; }
      nav.hidden = op;
      $('#ubtn').hidden = !DB.unidades;
      if (DB.unidades) $('#ubtnTxt').textContent = nombreSel(DB.sel) + ' · cambiar';
      $('#meta').textContent = DB.animales.length + ' animales · ' + (DB.fuente === 'syscaw' ? (DB.origen === 'fosapp' ? 'base FOSAPP del ' : 'respaldo SysCaw del ') + A.fmt(DB.fecha) : 'libreta del ' + A.fmt(DB.cargada)) + (state.persisted ? '' : ' (no se guarda en este navegador)') + (esOperario() ? ' · operario' : '');
      nav.innerHTML = '<div class="navin">' + NAVS.map(function (n) {
        return '<button class="nb" data-t="' + n[0] + '" aria-current="' + (!state.rp && state.tab === n[0] ? 'page' : 'false') + '"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">' + n[2] + '</svg><span>' + n[1] + '</span></button>';
      }).join('') + '</div>';
      document.body.classList.toggle('ancho', !!(state.pobl && esVet()));
      if (state.pobl && esVet()) { main.innerHTML = pobHTML(); return; }
      if (state.informe && esVet()) { main.innerHTML = informeHTML(); return; }
      if (state.rp) {
        var a = byRp(state.rp);
        if (a) { main.innerHTML = fichaHTML(a); plegarFicha(main); return; }
        state.rp = null;
      }
      var err = state.error ? '<p class="error" role="alert">' + esc(state.error) + '</p>' : '';
      if (state.tab === 'tareas') main.innerHTML = err + tareasHTML();
      else if (state.tab === 'rodeo') { main.innerHTML = err + rodeoHTML(); plegarFicha(main); }
      else if (state.tab === 'leche') { main.innerHTML = err + lecheHTML(); plegarFicha(main); }
      else { main.innerHTML = err + buscarHTML(); updateResults(); }
    }

    /* ----- eventos ----- */
    document.addEventListener('click', function (e) {
      var tb = e.target.closest('[data-tambo]');
      if (tb) { elegirTambo(tb.dataset.tambo); return; }
      if ((tb = e.target.closest('[data-tdel]'))) { quitarTambo(tb.dataset.tdel); return; }
      var row = e.target.closest('[data-rp]');
      if (row) { openFicha(row.getAttribute('data-rp')); return; }
      var el;
      if ((el = e.target.closest('[data-vmes]'))) { state.vaqMes = state.vaqMes === el.dataset.vmes ? null : el.dataset.vmes; render(); return; }
      if ((el = e.target.closest('[data-cal]'))) { var nc = +el.dataset.cal; state.cicloAl = state.cicloAl === nc ? null : nc; render(); return; }
      if ((el = e.target.closest('[data-sg]'))) { el.parentNode.classList.toggle('abierto'); return; }
      if ((el = e.target.closest('[data-ps]'))) { state.pobSort = el.dataset.ps; render(); return; }
      if ((el = e.target.closest('[data-t]'))) { setTab(el.dataset.t); return; }
      if ((el = e.target.closest('[data-cat]'))) { state.cat = el.dataset.cat; state.filtro = 'todas'; state.n = 60; render(); return; }
      if ((el = e.target.closest('[data-f]'))) { state.filtro = el.dataset.f; state.n = 60; render(); return; }
      if ((el = e.target.closest('[data-pev]'))) { state.pev = +el.dataset.pev; render(); return; }
      if ((el = e.target.closest('[data-sec]'))) { A.setSecado(+el.dataset.sec); try { localStorage.setItem('libreta:secado', el.dataset.sec); } catch (x) {} render(); return; }
      if ((el = e.target.closest('[data-plg]'))) { var sec = el.parentNode, ab = !sec.classList.contains('open'); sec.classList.toggle('open', ab); el.setAttribute('aria-expanded', ab); if (ab) FICHA_AB[el.dataset.plg] = 1; else delete FICHA_AB[el.dataset.plg]; return; }
      if ((el = e.target.closest('[data-desp]'))) { state.desp = state.desp || {}; state.desp[el.dataset.desp] = !state.desp[el.dataset.desp]; render(); return; }
      if ((el = e.target.closest('[data-im]'))) { state.infModo = el.dataset.im; render(); return; }
      if ((el = e.target.closest('[data-ev]'))) { state.evMed = el.dataset.ev; render(); return; }
      if ((el = e.target.closest('[data-iv]'))) { state.idxVer = el.dataset.iv; state.idxN = 40; render(); return; }
      if ((el = e.target.closest('[data-v]'))) { state.ventana = +el.dataset.v; render(); return; }
      if ((el = e.target.closest('[data-go]'))) { state.filtro = el.dataset.go; state.q = ''; state.n = 60; setTab('buscar'); return; }
      if ((el = e.target.closest('[data-k]'))) { state.abiertas[el.dataset.k] = !state.abiertas[el.dataset.k]; render(); return; }
      if ((el = e.target.closest('[data-vk]'))) { state.vtaDraft[el.dataset.vk] = !state.vtaDraft[el.dataset.vk]; el.setAttribute('aria-pressed', !!state.vtaDraft[el.dataset.vk]); vtaCuenta(); return; }
      if ((el = e.target.closest('[data-xk]'))) { state.xf[el.dataset.xk] = !state.xf[el.dataset.xk]; xOpts(); return; }
      var b = e.target.closest('[data-a]'); if (!b) return;
      var a = b.dataset.a;
      if (a === 'load') { state.destino = tamboAct() ? null : 'nuevo'; $('#file').click(); }
      else if (a === 'back') back();
      else if (a === 'mas') { state.n += 60; updateResults(); }
      else if (a === 'idxmas') { state.idxN = (state.idxN || 40) + 60; render(); }
      else if (a === 'ajustes') openSheet('Ajustes');
      else if (a === 'cerrar') closeSheet();
      else if (a === 'guardar') guardarSheet();
      else if (a === 'logo') $('#logoFile').click();
      else if (a === 'quitarlogo') { state.draft.logo = ''; paintLogoPreview(); }
      else if (a === 'cambiar') { closeSheet(); state.destino = null; $('#file').click(); }
      else if (a === 'tambos') tambosSheet();
      else if (a === 'inicio') irInicio();
      else if (a === 'toroal') { state.toroAb = !state.toroAb; render(); }
      else if (a === 'ini21def') ini21Default();
      else if (a === 'enviaract') enviarActivacion();
      else if (a === 'actprod') enviarActivacionRol('prod');
      else if (a === 'actop') enviarActivacionRol('op');
      else if (a === 'vet') modoVet();
      else if (a === 'pegaract') { closeSheet(); pegarActivacion(); }
      else if (a === 'actcod') { var ic = $('#actCod'); activarCodigo(ic ? ic.value : ''); }
      else if (a === 'pedircod') { closeSheet(); pedirCodigo(); }
      else if (a === 'exptactar') abrirExport();
      else if (a === 'xok') exportarTactar();
      else if (a === 'xshare') xCompartir();
      else if (a === 'vtacfg') vtaSheet();
      else if (a === 'vtaok') { setP('vta', JSON.stringify(state.vtaDraft)); $('#sheetX').hidden = true; render(); toast('Criterio de venta guardado'); }
      else if (a === 'xsharecsv') xCompartirCSV();
      else if (a === 'xsave') xGuardar();
      else if (a === 'xcancel') $('#sheetX').hidden = true;
      else if (a === 'informe') abrirInforme();
      else if (a === 'poblacion') abrirPoblacion();
      else if (a === 'pobcerrar') { state.pobl = false; if (state.pobIni) { state.pobIni = false; state.inicio = true; } render(); window.scrollTo(0, 0); }
      else if (a === 'pobcalc') pobCalc();
      else if (a === 'base') exportarBase();
      else if (a === 'vetclave') copiarClaveVet();
      else if (a === 'basein') { closeSheet(); $('#baseFile').click(); }
      else if (a === 'infcerrar') { state.informe = false; render(); window.scrollTo(0, 0); }
      else if (a === 'infpdf') pdfInforme();
      else if (a === 'tnuevo') { closeSheetT(); state.destino = 'nuevo'; $('#file').click(); }
      else if (a === 'tcerrar') closeSheetT();
      else if (a === 'unidad') cambiarUnidad();
      else if (a === 'compsecar') compartirSecar();
      else if (a === 'uok') cerrarUnidad(idsMarcados());
      else if (a === 'ucancel') cerrarUnidad(null);
    });
    document.addEventListener('change', function (e) {
      if ((e.target.id === 'vomes' || e.target.id === 'pomes') && e.target.value) { state.vomes = e.target.value; render(); return; }
      if (e.target.id === 'ini21' && e.target.value) { state.ini21 = e.target.value; setP('ini21', state.ini21); render(); }
      if (e.target.id === 'fsec' && e.target.value) { state.fsec = e.target.value; setP('fsec', state.fsec); render(); }
    });
    document.addEventListener('input', function (e) {
      if (e.target.dataset && e.target.dataset.vn) { var w = parseInt(e.target.value, 10); state.vtaDraft[e.target.dataset.vn] = w > 0 ? w : null; vtaCuenta(); return; }
      if (e.target.dataset && e.target.dataset.xn) { var v = parseInt(e.target.value, 10); state.xf[e.target.dataset.xn] = v > 0 ? v : null; xActualizarCuenta(); return; }
      if (e.target.id === 'q') { state.q = e.target.value; updateResults(); }
      if (e.target.id === 'qTambo') { var k = normNom(e.target.value); document.querySelectorAll('#ilist .itambo').forEach(function (b) { b.hidden = !!k && b.dataset.nom.indexOf(k) < 0; }); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.target.id === 'q' && e.key === 'Enter') {
        var res = A.search(lista(), state.q).filter(function (a) { return matchFiltro(a, state.filtro); });
        if (!res.length) res = A.search(DB.animales, state.q);
        if (!res.length) res = A.search(DB.bajas || [], state.q);
        if (res.length) { e.target.blur(); openFicha(res[0].rp); }
      }
      if (e.target.id === 'inNombre' && e.key === 'Enter') guardarSheet();
      if (e.target.id === 'actCod' && e.key === 'Enter') activarCodigo(e.target.value);
      if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet();
      if (e.key === 'Escape' && !$('#sheetT').hidden) closeSheetT();
      if (e.key === 'Escape' && !$('#sheetU').hidden) cerrarUnidad(null);
    });
    $('#file').addEventListener('change', function (e) { if (e.target.files[0]) state.inicio = false; handleFile(e.target.files[0]); e.target.value = ''; });
    $('#logoFile').addEventListener('change', function (e) { procesarLogo(e.target.files[0]); e.target.value = ''; });
    $('#baseFile').addEventListener('change', function (e) { importarBase(e.target.files[0]); e.target.value = ''; });
    $('#sheet').addEventListener('click', function (e) { if (e.target.id === 'sheet') closeSheet(); });
    $('#sheetT').addEventListener('click', function (e) { if (e.target.id === 'sheetT') closeSheetT(); });

    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(function () {});
    var listo = loadAll();
    state.inicio = esVet() && TAMBOS.lista.length > 0 && !/^#ficha-/.test(location.hash);
    // arreglo: nombres de tambo que quedaron con un link pegado
    listo.then(function () {
      var cambio = false;
      TAMBOS.lista.forEach(function (t) { var n = limpiarNombre(t.nombre); if (n !== (t.nombre || '')) { t.nombre = n; cambio = true; } });
      var n2 = limpiarNombre(PERFIL.nombre); if (n2 !== (PERFIL.nombre || '')) { PERFIL.nombre = n2; cambio = true; }
      if (cambio) { saveTambos(); savePerfil(); render(); }
    });
    leerActivacion();
    var desdeHash = function () { var m = /^#ficha-(b?\d+)$/.exec(location.hash); if (m && byRp(m[1])) state.rp = m[1]; };
    desdeHash(); render();
    listo.then(function (cambio) { if (cambio) { desdeHash(); render(); } });
  }
})(typeof window !== 'undefined' ? window : this);
