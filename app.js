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
  function proyeccion(animales, hoy, nMeses) {
    var y = +hoy.slice(0, 4), m = +hoy.slice(5, 7) - 1, out = [];
    var info = animales.map(function (a) {
      var d = derive(a, hoy), P = a.estado === 'prenada' && d.partoProb && d.partoProb >= hoy ? d.partoProb : null;
      return { a: a, P: P, S: P ? addDays(P, -SECADO) : null, R: P ? addDays(P, -PREPARTO) : null };
    });
    for (var i = 0; i < (nMeses || 12); i++) {
      var yy = y + Math.floor((m + i) / 12), mm = (m + i) % 12, D = i === 0 ? hoy : yy + '-' + pad(mm + 1) + '-15';
      var r = { label: MESES[mm], anio: yy, ord: 0, sec: 0, pre: 0, preQ: 0 };
      info.forEach(function (x) {
        var c = x.a.cat || 'vaca';
        if (c === 'ternera') return;
        if (c === 'vaquillona') {
          if (!x.P || D < x.R) return;
          if (D < x.P) { r.pre++; r.preQ++; } else r.ord++;
          return;
        }
        if (!x.P) { if (c === 'seca') r.sec++; else r.ord++; return; }
        if (D >= x.P) r.ord++;
        else if (D >= x.R) r.pre++;
        else if (D >= x.S || c === 'seca') r.sec++;
        else r.ord++;
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
    C.ultTacto = ultTacto;
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
          if (L.conc) { if (e[0] === L.conc) cy.sOk++; else if (e[0] < L.conc) cy.sMal++; return; }
          var luego = L.sv[i + 1] || L.neg.some(function (d) { return d > e[0] && diffDays(d, e[0]) >= 25; });
          if (luego) cy.sMal++; else cy.sPend++;
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
  var IDX_W = { da: 35, spc: 20, pc: 15, le: 30 };
  function idxMedia(v) { var s = 0; v.forEach(function (x) { s += x; }); return v.length ? s / v.length : null; }
  function idxDesv(v, m) { if (v.length < 2) return null; var s = 0; v.forEach(function (x) { s += (x - m) * (x - m); }); return Math.sqrt(s / (v.length - 1)); }
  function idxZ(x, m, sd) { if (x == null || !sd) return null; var z = (x - m) / sd; return Math.max(-3, Math.min(3, z)); }
  // animales: vacas y secas activas; hist por caravana; esPren(código de tacto) -> bool; ref: fecha del respaldo
  function indice(animales, hist, esPren, ref) {
    var minEv = '9999';
    animales.forEach(function (a) { var h = hist[a.rp]; if (h && h.ev.length && h.ev[0][0] < minEv) minEv = h.ev[0][0]; });
    var vacas = [], lacs = [], nPc = 0, nCelo = 0;
    animales.forEach(function (a) {
      var h = hist[a.rp]; if (!h || !h.pa.length) return;
      var V = { a: a, da: [], spc: [], pc: [], le: [], nLac: 0, detalle: [] };
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
        if (l && l[2] && (np || (l[5] || 0) >= 3)) {
          // análisis de sólidos: los controles del respaldo cubren la lactancia actual y la anterior
          var nAn = null;
          if (h.ct && h.ct.length && i >= h.pa.length - 2) nAn = h.ct.filter(function (c) { return c[0] >= p[0] && c[0] < hasta && c[2] > 0 && c[3] > 0; }).length;
          var r = { v: V, nro: p[1], lit: l[2], nAn: nAn, sol: l[3] != null && l[4] != null ? l[2] * (l[3] + l[4]) / 100 : null };
          lacs.push(r); V.le.push(r);
        }
      });
      if (V.da.length) vacas.push(V);
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
    var w = { da: IDX_W.da, spc: IDX_W.spc, pc: IDX_W.pc * Math.min(1, cobCelo / 0.5), le: IDX_W.le };
    var resto = IDX_W.pc - w.pc; w.da += resto * IDX_W.da / (IDX_W.da + IDX_W.spc); w.spc += resto * IDX_W.spc / (IDX_W.da + IDX_W.spc);
    vacas.forEach(function (V) {
      V.m = { da: idxMedia(V.da), spc: idxMedia(V.spc), pc: idxMedia(V.pc) };
      var zs = V.le.map(function (r) { return r.z; }).filter(function (z) { return z != null; });
      V.zle = zs.length ? idxMedia(zs) : null;
      V.mle = V.le.length ? idxMedia(V.le.map(function (r) { return r.val; }).filter(function (x) { return x != null; })) : null;
      V.mlit = V.le.length ? idxMedia(V.le.map(function (r) { return r.lit; })) : null;
      V.msol = V.le.length ? idxMedia(V.le.map(function (r) { return r.sol; }).filter(function (x) { return x != null; })) : null;
      V.nAn = null; V.solEst = false; V.le.forEach(function (r) { if (r.nAn != null) V.nAn = r.nAn; if (r.est) V.solEst = true; });
    });
    var ref0 = {};
    ['da', 'spc', 'pc'].forEach(function (k) {
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
      V.z = { da: idxZ(V.m.da, ref0.da.m, ref0.da.sd), spc: idxZ(V.m.spc, ref0.spc.m, ref0.spc.sd), pc: idxZ(V.m.pc, ref0.pc.m, ref0.pc.sd), le: idxZ(V.zle, ref0.le.m, ref0.le.sd) };
      ['da', 'spc', 'pc'].forEach(function (k) { if (V.z[k] != null) V.z[k] = -V.z[k]; }); // menos días / servicios es mejor
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
    var prom = { da: ref0.da.m, spc: ref0.spc.m, pc: ref0.pc.m, le: ref0.leProm, lit: ref0.litProm, sol: ref0.solProm };
    return { vacas: vacas, por: por, n: n, k10: k10, usaSol: usaSol, minAn: MIN_AN, hayAn: ultAn.length > 0, pesos: w, prom: prom, celoBajo: cobCelo < 0.5 };
  }
  var api = { indice: indice, ciclos21: ciclos21, setSecado: setSecado, proyeccion: proyeccion, PREPARTO: PREPARTO, parseLibreta: parseLibreta, derive: derive, search: search, conteo: conteo, tareas: tareas, resumen: resumen, fmt: fmt, rel: rel, diffDays: diffDays, addDays: addDays, ymd: ymd, GEST: GEST, SECADO: SECADO, DX_MIN: DX_MIN };
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
      TAMBOS.activo = id; saveTambos();
      var t = tamboAct() || { nombre: '', logo: '' };
      PERFIL = { nombre: t.nombre || '', logo: t.logo || '' };
      DB = { animales: [], cargada: null, archivo: '' };
      state.q = ''; state.rp = null; state.error = ''; state.filtro = 'todas'; state.n = 60; state.tab = 'buscar';
      state.ini21 = null; state.fsec = null; state.pev = null; state.abiertas = {};
      state.cat = getP('cat') || 'vaca';
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
        try { var c = localStorage.getItem('libreta:cat'); if (c) state.cat = c; } catch (e) {}
        DB = o; aplicarUnidad();
        return saveDB().then(function () { idbDel('db'); try { localStorage.removeItem(KEY); } catch (e) {} return true; });
      });
    }
    function saveDB() {
      if (!tamboAct()) { TAMBOS.activo = nuevoTambo(PERFIL.nombre).id; }
      var t = tamboAct();
      DB.guardada = Date.now();
      t.n = DB.animales.length; t.fuente = DB.fuente; t.fecha = DB.fuente === 'syscaw' ? DB.fecha : DB.cargada;
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
    function prepararDestino(nombre) {
      var act = tamboAct(), igual = tamboPorNombre(nombre), cambio = '';
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
      if (id === TAMBOS.activo) return;
      busy(true, 'Abriendo tambo…');
      abrirTambo(id).then(function () { busy(false); render(); window.scrollTo(0, 0); toast((PERFIL.nombre || 'Tambo') + ': ' + DB.animales.length + ' animales'); });
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
      clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('on'); }, 3200);
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
    function cargarRespaldo(buf, f) {
      busy(true, 'Leyendo respaldo de SysCaw…<small>Puede tardar unos segundos</small>');
      setTimeout(function () {
        root.SysCaw.fromRar(buf, f.name, { unrar: root.Unrar, wasmBinary: b64(root.UNRAR_WASM_B64), Paradox: root.Paradox, elegir: function (us) { return elegirUnidad(us, null, true); }, todas: true }).then(function (d) {
          var sel = d.unidadesSel || [], parcial = !!d.sel;
          var nom = d.tambo || nombreDesdeArchivo(f.name) || '', cambio = prepararDestino(nom);
          DB = { animales: [], todos: d.animales, bajasT: d.bajas || [], config: d.config || {}, unidades: d.unidades.length > 1 ? d.unidades : null, sel: d.sel, hist: d.hist, codes: d.codes, fecha: d.fecha, cargada: today(), archivo: f.name, fuente: 'syscaw' };
          aplicarUnidad();
          busy(false);
          saveDB(); state.q = ''; state.rp = null; state.error = ''; state.filtro = 'todas'; state.tab = 'buscar'; state.cat = 'vaca';
          try { location.hash = ''; } catch (e) {}
          render();
          // el nombre queda fijo: el que trae el respaldo
          PERFIL.nombre = nom || PERFIL.nombre; savePerfil(); render();
          toast((cambio === 'nuevo' ? 'Tambo nuevo: ' : cambio === 'actualizado' ? 'Actualizado: ' : '') + (PERFIL.nombre ? PERFIL.nombre + ' · ' : '') + DB.animales.length + ' animales');
        }).catch(function (e) {
          busy(false);
          state.destino = null;
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
          var mismo = state.destino !== 'nuevo' && tamboAct();
          var prev = mismo ? DB : {};
          if (!mismo) prepararDestino(nombreDesdeArchivo(f.name));
          state.destino = null;
          DB = { animales: res.animales, cargada: today(), archivo: f.name, fuente: 'excel', hist: prev.hist, codes: prev.codes, fecha: prev.fecha };
          saveDB(); state.q = ''; state.rp = null; state.error = ''; state.filtro = 'todas'; state.tab = 'buscar'; state.cat = 'vaca';
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
      var fijo = DB.fuente === 'syscaw';
      $('label[for="inNombre"]').hidden = fijo;
      paintLogoPreview();
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
    function guardarSheet() {
      if (!state.draft) return;
      PERFIL = { nombre: DB.fuente === 'syscaw' ? PERFIL.nombre : $('#inNombre').value.trim(), logo: state.draft.logo || '' };
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
      return (a.cat && a.cat !== 'vaca' ? '<span class="catlbl">' + CATL[a.cat] + '</span>' + (sub ? ' · ' : '') : '') + (paraVenta(a) ? esc(nf(a.pr[0], 1) + ' lts · ' + nf(delDe(a)) + ' días en leche') + ' <span class="vta">VENTA</span>' : esc(sub) + (a.rech ? ' <span class="dsc">Descarte</span>' : ''));
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
    // Para venta: descarte programado + más de 300 días en leche + menos de 15 litros en el último control
    var VTA_DEL = 300, VTA_LTS = 15;
    function delDe(a) { return a.pFecha && (a.cat === 'vaca' || !a.cat) ? (DB.fuente === 'syscaw' ? A.diffDays(today(), a.pFecha) : a.dLac) : null; }
    function paraVenta(a) {
      if (!a.rech || (a.cat && a.cat !== 'vaca')) return false;
      var d = delDe(a), l = a.pr && a.pr[0];
      return d != null && d > VTA_DEL && typeof l === 'number' && l < VTA_LTS;
    }
    function matchFiltro(a, f) { if (f === 'itop' || f === 'ipeor') { var V = idxDe(a); return !!V && V.tier === (f === 'itop' ? 'top' : 'peor'); } return f === 'todas' || (f === 'descarte' ? !!a.rech : f === 'venta' ? paraVenta(a) : f === 'pcelo' ? !!a.celo : a.estado === f); }
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
      var nVta = L.filter(paraVenta).length;
      if (nVta) fl.push(['venta', 'Para venta', nVta]);
      if (IDX()) {
        var nTop = L.filter(function (a) { var V = idxDe(a); return V && V.tier === 'top'; }).length, nPeor = L.filter(function (a) { var V = idxDe(a); return V && V.tier === 'peor'; }).length;
        if (nTop) fl.push(['itop', 'Top 10%', nTop]);
        if (nPeor) fl.push(['ipeor', 'Peores 10%', nPeor]);
      }
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
      var h = '<section class="sec"><div class="sechead"><h2>' + titulo + '</h2><span class="count">' + items.length + '</span></div>' + (nota ? (nota.charAt(0) === '<' ? nota : '<p class="secnote">' + nota + '</p>') : '');
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
      return '<h1 class="ptitle">Tareas</h1>' + chips +
        secTareas('tactar', 'Para tactar', 'Servidas hace ' + A.DX_MIN + ' días o más, sin tacto posterior.', t.tactar, function (x) {
          return rowHTML(x.a, { right: '<span class="when late">hace ' + x.dias + ' días</span>', sub: 'Servicio ' + A.fmt(x.fecha) + (x.a.toro && !/^celo/i.test(x.a.toro) ? ' · ' + esc(x.a.toro) : '') });
        }, 'No hay vacas pendientes de tacto.') +
        secTareas('secar', 'Para secar', '<label class="secfecha">Fecha de secado <input type="date" id="fsec" value="' + fs + '" min="' + today() + '"></label>' + secChips + '<p class="secnote">Vacas preñadas que el ' + A.fmt(fs) + ' están a ' + A.SECADO + ' días o menos del parto. Ordenadas por caravana.</p>' + ('<button class="btn share" data-a="compsecar"' + (sec.length ? '' : ' disabled') + '><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 4v11M7.5 8.5L12 4l4.5 4.5M5 14v5h14v-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>Enviar lista por WhatsApp</button>' + (sec.length ? '' : '<p class="hint">Elegí la fecha del próximo secado para armar la lista.</p>')), sec, function (x) {
          return rowHTML(x.a, { right: '<span class="when">' + x.dp + ' días al parto</span>', sub: 'Parto probable ' + A.fmt(x.P) });
        }, 'Ninguna vaca para secar el ' + A.fmt(fs) + '.') +
        secTareas('partos', 'Próximos partos', 'Partos probables en los próximos ' + vtxt + '.', t.partos, function (x) {
          return rowHTML(x.a, { right: '<span class="when">' + A.rel(x.dias) + '</span>', sub: 'Parto probable ' + A.fmt(x.fecha) });
        }, 'Ningún parto probable en los próximos ' + vtxt + '.') +
        secTareas('venta', 'Para venta', 'Descarte programado, más de ' + VTA_DEL + ' días en leche y menos de ' + VTA_LTS + ' litros en el último control.', DB.animales.filter(paraVenta).sort(function (x, y) { return x.pr[0] - y.pr[0]; }), function (a) {
          return rowHTML(a, { right: '<span class="vta">VENTA</span>', sub: nf(a.pr[0], 1) + ' lts · ' + nf(delDe(a)) + ' días en leche' + (a.rech ? ' · ' + esc(a.rech) : '') });
        }, 'Ninguna vaca de descarte cumple las condiciones de venta.');
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
    function proyHTML() {
      var P = A.proyeccion(DB.animales, today(), 6), N = P.length;
      var max = Math.max.apply(null, P.map(function (r) { return r.ord + r.sec + r.pre; })); if (!max) return '';
      var W = 320, H = 150, padx = 6, gap = 12, bw = (W - padx * 2 - gap * (N - 1)) / N, s = '', k = (H - 48) / max;
      P.forEach(function (r, i) {
        var x = padx + i * (bw + gap), y = H - 26, tot = r.ord + r.sec + r.pre;
        [['pord', r.ord], ['psec', r.sec], ['ppre', r.pre - r.preQ], ['pprq', r.preQ]].forEach(function (p) { var h = p[1] * k; if (h) { y -= h; s += '<rect class="' + p[0] + '" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '"/>'; } });
        s += '<text class="mval" x="' + (x + bw / 2).toFixed(1) + '" y="' + (y - 4).toFixed(1) + '" text-anchor="middle">' + tot + '</text>';
        s += '<text class="mlbl" x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 12) + '" text-anchor="middle">' + r.label + '</text>';
        if (r.label === 'ene' || i === 0) s += '<text class="myear" x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 1) + '" text-anchor="middle">' + String(r.anio).slice(2) + '</text>';
      });
      var filas = P.map(function (r, i) { return '<tr><td>' + (i === 0 ? 'Hoy' : r.label + ' ' + String(r.anio).slice(2)) + '</td><td>' + r.ord + '</td><td>' + r.sec + '</td><td>' + (r.pre - r.preQ) + '</td><td>' + r.preQ + '</td></tr>'; }).join('');
      return '<section class="card"><h2>Proyección del rodeo · 6 meses</h2>' +
        '<div class="mleg"><span><i class="pord"></i>En ordeñe</span><span><i class="psec"></i>Secas</span><span><i class="ppre"></i>Preparto vacas</span><span><i class="pprq"></i>Preparto vaquillonas</span></div>' +
        '<svg class="mchart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Proyección de vacas en ordeñe, secas y preparto por mes">' + s + '</svg>' +
        '<table class="tbl ptbl"><thead><tr><th>Mes</th><th>Ordeñe</th><th>Secas</th><th>Prep. vacas</th><th>Prep. vaq.</th></tr></thead><tbody>' + filas + '</tbody></table>' +
        '<p class="cap">A mitad de cada mes. Secado ' + A.SECADO + ' días antes del parto; preparto los últimos ' + A.PREPARTO + ' días (las vaquillonas entran al preparto ' + A.PREPARTO + ' días antes y después pasan a ordeñe). No descuenta descartes ni muertes, y las vacas no preñadas siguen en ordeñe.</p></section>';
    }
    /* ----- reproducción cada 21 días ----- */
    var PEVS = [40, 45, 50, 60];
    function pevActual() { return state.pev || (DB.config && DB.config.pev) || 45; }
    function inicio21() {
      var f = state.ini21;
      if (!f) f = getP('ini21');
      if (!f) { var h = today(), y = +h.slice(0, 4); if (h.slice(5) < '05-22') y--; f = y + '-05-22'; }
      return (state.ini21 = f);
    }
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
      var filas = C.map(function (c) {
        return '<tr' + (c.cerrado ? '' : ' class="abierto"') + '><td><b>' + c.n + '</b> <small>' + A.fmt(c.ini).slice(0, 5) + '</small></td><td>' + c.aptas + '</td>' +
          '<td>' + p(c.serv, c.aptas) + '<small>' + c.serv + '</small></td>' +
          (c.cerrado ? '<td>' + p(c.sOk, c.sOk + c.sMal) + '<small>' + c.sOk + '/' + (c.sOk + c.sMal) + '</small></td><td><b>' + p(c.pren, c.aptas) + '</b><small>' + c.pren + '</small></td>'
            : '<td colspan="2" class="enc">en curso</td>') + '</tr>';
      }).join('');
      var pevTxt = DB.config && DB.config.pev ? 'SysCaw: ' + DB.config.pev : 'sin dato en SysCaw';
      return '<section class="card rep"><h2>Reproducción cada 21 días</h2>' +
        '<label class="secfecha">Inicio de servicios <input type="date" id="ini21" value="' + ini + '" max="' + ref + '"></label>' +
        '<div class="secsel"><span>Espera voluntaria</span>' + PEVS.map(function (n) { return '<button class="fchip plain" data-pev="' + n + '" aria-pressed="' + (pev === n) + '">' + n + '</button>'; }).join('') + '<span>días <small>(' + pevTxt + ')</small></span></div>' +
        (C.length ? '<div class="kpis"><div><b>' + p(T.serv, T.aptas) + '</b><span>Tasa de servicio</span></div><div><b>' + p(T.sOk, T.sOk + T.sMal) + '</b><span>Tasa de concepción</span></div><div class="tp"><b>' + p(T.pren, T.aptas) + '</b><span>Tasa de preñez</span></div></div>' +
          '<p class="cap">Promedio de los ' + nCerr + ' ciclos cerrados.</p>' +
          '<table class="tbl rtbl"><thead><tr><th>Ciclo</th><th>Aptas</th><th>Servicio</th><th>Concep.</th><th>Preñez</th></tr></thead><tbody>' + filas + '</tbody></table>' +
          '<p class="cap">Vacas con al menos una lactancia (sin vaquillonas). <b>Aptas:</b> vacas vacías que cumplen ' + pev + ' días posparto dentro del ciclo, no marcadas como descarte programado y en el rodeo. Una vaca servida en un ciclo anterior no es apta hasta que se la vuelva a servir o el tacto dé vacía (ahí cuenta para atrás). <b>Servicio:</b> aptas servidas / aptas. <b>Concepción:</b> servicios que preñaron / servicios con resultado conocido. <b>Preñez:</b> aptas que quedaron preñadas en el ciclo / aptas. Un ciclo queda <b>en curso</b> hasta que hay tacto 28 días después de que termina' + (C.ultTacto && C.ultTacto > '0000' ? ' (último tacto: ' + A.fmt(C.ultTacto) + ')' : '') + '.</p>'
          : '<p class="hint">Elegí una fecha de inicio anterior al ' + A.fmt(ref) + '.</p>') + '</section>';
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
        (despues ? '<p class="cap">Además, ' + despues + ' después de ese período.</p>' : '') + '</section>' +
        proyHTML() + repHTML() +
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
      var aviso = '';
      return '<h1 class="ptitle">Rodeo</h1>' + catsHTML() +
        '<section class="card"><h2>' + nf(r.total) + ' ' + nombreGrupo(r.total) + '</h2><div class="comp" role="img" aria-label="Composición del rodeo por estado">' + seg + '</div><div class="legend">' + leg + '</div></section>' +
        (state.cat === 'ternera' ? '' : '<section class="card"><h2>Partos probables por mes</h2>' + mesesChart(r.meses) + aviso + (r.despues ? '<p class="cap">Además, ' + r.despues + ' después de ese período.</p>' : '') + '</section>') +
        (r.leche != null ? '<section class="card"><h2>Producción</h2>' + kv([['Litros por vaca, último control', nf(r.leche, 1) + ' lts'], ['Vacas con control lechero', nf(r.nLeche)], ['Días en lactancia, promedio', r.dLac != null ? nf(r.dLac) : null]]) + '</section>' : '') + rod +
        (state.cat === 'vaca' || state.cat === 'seca' ? idxCardHTML() : '');
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
      try { r = A.indice(ad, DB.hist, esPren, DB.fecha || today()); if (r.n < 10) r = null; } catch (e) { r = null; }
      IDXC = { k: k, r: r };
      return r;
    }
    function idxDe(a) { var r = IDX(); return r ? r.por[a.rp] || null : null; }
    function nf1(n) { return n == null ? '–' : nf(n, n < 10 ? 1 : 0); }
    function idxMini(V, r) {
      return [V.m.da != null ? nf(V.m.da) + ' d abiertos' : null, V.m.spc != null ? nf(V.m.spc, 1) + ' serv' : null, V.m.pc != null ? nf(V.m.pc) + ' d a celo' : null, lecheTxt(V, r)].filter(Boolean).join(' · ');
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
      var r = IDX(); if (!r || !(a.cat === 'vaca' || a.cat === 'seca' || !a.cat)) return '';
      var V = r.por[a.rp];
      if (!V) return '<section class="card"><h2>Índice del tambo</h2><p class="cap" style="margin:0">Sin índice: le falta al menos una lactancia con datos de reproducción completos.</p></section>';
      var comp = [
        ['da', 'Días abiertos', nf1(V.m.da) + ' d', nf(r.prom.da)],
        ['spc', 'Servicios por concepción', nf(V.m.spc, 1), nf(r.prom.spc, 1)],
        ['pc', 'Parto a primer celo', nf1(V.m.pc) + ' d', nf(r.prom.pc)],
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
        '<div class="fhchips">' + (a.cat && a.cat !== 'vaca' ? '<span class="chip cat">' + CATL[a.cat] + '</span>' : '') + chip(a) + (a.rech ? '<span class="chip descarte">Descarte programado</span>' : '') + (paraVenta(a) ? '<span class="chip venta2">Para venta</span>' : '') + '</div></div>' + idxBadge(a) + '</header>' +
        (datos ? '<section class="card datos">' + datos + '</section>' : '') +
        (h && h.ct.length ? '<section class="card"><h2>Control lechero</h2>' + prodHistHTML(a, h) + '</section>' : (bars(a.pr || []) ? '<section class="card"><h2>Control lechero</h2>' + bars(a.pr) + '</section>' : '')) +
        (h ? lactHTML(h) + (h.pa.length || h.ev.length || h.ta.length ? histHTML(a, h) : '') : '') +
        idxFichaHTML(a) +
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
      $('#tbtn').hidden = TAMBOS.lista.length < 2;
      if (TAMBOS.lista.length > 1) $('#tbtnTxt').textContent = TAMBOS.lista.length + ' tambos · cambiar';
      $('#nTambos').textContent = TAMBOS.lista.length > 1 ? 'Tambos (' + TAMBOS.lista.length + ')' : 'Agregar otro tambo';
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
      var tb = e.target.closest('[data-tambo]');
      if (tb) { elegirTambo(tb.dataset.tambo); return; }
      if ((tb = e.target.closest('[data-tdel]'))) { quitarTambo(tb.dataset.tdel); return; }
      var row = e.target.closest('[data-rp]');
      if (row) { openFicha(row.getAttribute('data-rp')); return; }
      var el;
      if ((el = e.target.closest('[data-t]'))) { setTab(el.dataset.t); return; }
      if ((el = e.target.closest('[data-cat]'))) { state.cat = el.dataset.cat; state.filtro = 'todas'; state.n = 60; setP('cat', state.cat); render(); return; }
      if ((el = e.target.closest('[data-f]'))) { state.filtro = el.dataset.f; state.n = 60; render(); return; }
      if ((el = e.target.closest('[data-pev]'))) { state.pev = +el.dataset.pev; render(); return; }
      if ((el = e.target.closest('[data-sec]'))) { A.setSecado(+el.dataset.sec); try { localStorage.setItem('libreta:secado', el.dataset.sec); } catch (x) {} render(); return; }
      if ((el = e.target.closest('[data-iv]'))) { state.idxVer = el.dataset.iv; state.idxN = 40; render(); return; }
      if ((el = e.target.closest('[data-v]'))) { state.ventana = +el.dataset.v; render(); return; }
      if ((el = e.target.closest('[data-go]'))) { state.filtro = el.dataset.go; state.q = ''; state.n = 60; setTab('buscar'); return; }
      if ((el = e.target.closest('[data-k]'))) { state.abiertas[el.dataset.k] = !state.abiertas[el.dataset.k]; render(); return; }
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
      else if (a === 'tnuevo') { closeSheetT(); state.destino = 'nuevo'; $('#file').click(); }
      else if (a === 'tcerrar') closeSheetT();
      else if (a === 'unidad') cambiarUnidad();
      else if (a === 'compsecar') compartirSecar();
      else if (a === 'uok') cerrarUnidad(idsMarcados());
      else if (a === 'ucancel') cerrarUnidad(null);
    });
    document.addEventListener('change', function (e) {
      if (e.target.id === 'ini21' && e.target.value) { state.ini21 = e.target.value; setP('ini21', state.ini21); render(); }
      if (e.target.id === 'fsec' && e.target.value) { state.fsec = e.target.value; setP('fsec', state.fsec); render(); }
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
      if (e.key === 'Escape' && !$('#sheetT').hidden) closeSheetT();
      if (e.key === 'Escape' && !$('#sheetU').hidden) cerrarUnidad(null);
    });
    $('#file').addEventListener('change', function (e) { handleFile(e.target.files[0]); e.target.value = ''; });
    $('#logoFile').addEventListener('change', function (e) { procesarLogo(e.target.files[0]); e.target.value = ''; });
    $('#sheet').addEventListener('click', function (e) { if (e.target.id === 'sheet') closeSheet(); });
    $('#sheetT').addEventListener('click', function (e) { if (e.target.id === 'sheetT') closeSheetT(); });

    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(function () {});
    var listo = loadAll();
    var desdeHash = function () { var m = /^#ficha-(b?\d+)$/.exec(location.hash); if (m && byRp(m[1])) state.rp = m[1]; };
    desdeHash(); render();
    listo.then(function (cambio) { if (cambio) { desdeHash(); render(); } });
  }
})(typeof window !== 'undefined' ? window : this);
