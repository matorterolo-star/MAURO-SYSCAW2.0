/* Arma la libreta + historial a partir de la base de FOSAPP (fosapp.sqlite, suelto o dentro del .zip que exporta la app).
   Devuelve lo mismo que SysCaw.build, así el resto de la libreta (índice, línea de vida, Rodeo, Leche, Población) funciona igual. */
(function (root) {
  'use strict';
  var GEST = 283;
  var T = { MASTITIS: 1, PARTO: 4, SERVICIO: 5, SECADO: 6, ABORTO: 7, CELO: 8, TACTO: 9, CONTROL: 10, BAJA: 11, DESCARTE: 12 };
  // ESTADOVACA del control reproductivo: 1 preñada, 3 vacía (comprobado con los partos siguientes); el resto se muestra con su número
  var ESTADOS = { 1: ['Preñada', 'Preñada', '2'], 2: ['Dudosa', 'Dudosa', ''], 3: ['Vacía', 'Vacía', '1'] };
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  function P(s) { var a = s.split('-').map(Number); return Date.UTC(a[0], a[1] - 1, a[2]); }
  function diffDays(a, b) { return Math.round((P(a) - P(b)) / 864e5); }
  function addDays(s, n) { var d = new Date(P(s) + n * 864e5); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function fch(s) { s = s == null ? '' : String(s).slice(0, 10); return s > '1900-01-01' && s < '2100' ? s : null; }
  function tx(s) { return s == null ? '' : String(s).replace(/[\s ]+/g, ' ').trim(); }
  function nom(s) { s = tx(s); if (!s) return ''; return s.toLowerCase().replace(/(^|[\s.(\/-])([a-záéíóúñü])/g, function (m, a, b) { return a + b.toUpperCase(); }); }
  function frase(s) { s = tx(s).toLowerCase(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
  var cmp = function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; };

  function esZip(u) { return u[0] === 0x50 && u[1] === 0x4b && u[2] === 0x03 && u[3] === 0x04; }
  function esSqlite(u) { return String.fromCharCode.apply(null, u.subarray(0, 15)) === 'SQLite format 3'; }
  // ¿es una base de FOSAPP? (zip con fosapp.sqlite adentro, o el .sqlite suelto)
  function es(buf, nombre) {
    var u = new Uint8Array(buf, 0, Math.min(16, buf.byteLength));
    if (esSqlite(u)) return true;
    return esZip(u) && /fosapp|^db\d|\.zip$/i.test(String(nombre || '')) && !/\.xlsx$/i.test(String(nombre || ''));
  }
  function sacarSqlite(buf, XLSX) {
    var u = new Uint8Array(buf);
    if (esSqlite(u)) return u;
    if (!esZip(u) || !XLSX || !XLSX.CFB) throw new Error('El archivo no parece una base de FOSAPP.');
    var z = XLSX.CFB.read(u, { type: 'buffer' }), f = null;
    z.FileIndex.forEach(function (x) { if (!f && /\.sqlite$/i.test(x.name || '') && x.content && x.content.length) f = x; });
    if (!f) throw new Error('El .zip no trae la base de FOSAPP (fosapp.sqlite).');
    return f.content instanceof Uint8Array ? f.content : new Uint8Array(f.content);
  }
  function filas(db, sql) {
    var r = db.exec(sql); if (!r.length) return [];
    return r[0].values;
  }

  // lactancia a partir de los controles: área bajo la curva (del parto al primer control se toma el primer control)
  function lactancia(cs, parto, fin) {
    var pts = cs.map(function (c) { return [diffDays(c[0], parto), c[1]]; }).filter(function (p) { return p[0] > 0 && p[1] > 0; });
    if (!pts.length || pts[0][0] > 75) return null; // empieza sin controles: no se puede calcular
    var hasta = function (lim) {
      var s = pts[0][1] * Math.min(pts[0][0], lim), i;
      for (i = 1; i < pts.length && pts[i - 1][0] < lim; i++) {
        var d0 = pts[i - 1][0], d1 = Math.min(pts[i][0], lim), v1 = pts[i][1];
        var vl = pts[i][0] > lim ? pts[i - 1][1] + (v1 - pts[i - 1][1]) * (lim - d0) / (pts[i][0] - d0) : v1;
        s += (pts[i - 1][1] + vl) / 2 * (d1 - d0);
      }
      var u = pts[pts.length - 1];
      if (u[0] < lim && fin != null) s += u[1] * Math.max(0, Math.min(lim, fin) - u[0]) / 2; // hasta el secado, bajando
      return s;
    };
    var ultD = pts[pts.length - 1][0], total = hasta(fin != null ? Math.max(fin, ultD) : ultD);
    var l305 = ultD >= 290 || (fin != null && fin >= 305) ? hasta(305) : null;
    return { total: Math.round(total), l305: l305 != null ? Math.round(l305) : null, n: pts.length };
  }

  function build(db, opts) {
    opts = opts || {};
    // datos de cada evento
    var dato = {};
    filas(db, "select EventoGUID, trim(EventoDatoAtrStrId), trim(EventoDatoAtrValorItem), trim(EventoDatoTexto), EventoDatoNro from EventoDato").forEach(function (r) {
      (dato[r[0]] || (dato[r[0]] = {}))[String(r[1]).toUpperCase()] = { i: r[2] || '', t: r[3] || '', n: r[4] || 0 };
    });
    var D = function (g, k, c) { var o = dato[g] && dato[g][k]; return o ? o[c] : (c === 'n' ? 0 : ''); };
    var prod = filas(db, 'select ProductorId, ProductorNombre from Productor')[0] || [null, ''];
    var causa = {}, causaTipo = {};
    filas(db, 'select CausaBajaId, TipoBajaId, CausaBajaDesc from CausaBaja').forEach(function (r) { causa[r[0]] = frase(r[2]); causaTipo[r[0]] = r[1]; });
    var ins = {}; filas(db, 'select InseminadorId, InseminadorNombre from Inseminador').forEach(function (r) { ins[r[0]] = nom(r[1]); });
    var par = {}; filas(db, 'select trim(ParamProdId), trim(ParamProdValor) from ParamProd').forEach(function (r) { par[r[0]] = r[1]; });
    // animales: machos = toros (nombre por alias); hembras = la libreta
    var toro = {}, H = [];
    filas(db, 'select AnimalGUID, AnimalId, AnimalFchNac, AnimalSexo, AnimalEstadoId, AnimalTAlias, AnimalVUbicacion, AnimalVLactancia, AnimalTRP from Animal').forEach(function (r) {
      if (r[3] === 'M') toro[r[0]] = tx(r[5]) || tx(r[8]) || (r[1] ? String(r[1]) : '');
      else H.push({ g: r[0], rp: r[1] != null && String(r[1]).trim() !== '' ? String(r[1]).trim() : tx(r[8]), fn: fch(r[2]), est: r[4], ub: tx(r[6]).toUpperCase(), vl: r[7] || 0 });
    });
    var G = {}; H.forEach(function (a) { G[a.g] = { pa: [], ev: [], ta: [], la: [], ct: [], ab: [], sec: [], baja: null, desc: null, ec: null, ctAll: [] }; });
    var maxF = '0000';
    filas(db, 'select EventoGUID, AnimalGUID, EventoFch, TipoEventoId from Evento where EventoEstadoId <> 2').forEach(function (r) {
      var g = G[r[1]], f = fch(r[2]), id = r[0], t = r[3]; if (!g || !f) return;
      if (f > maxF && t !== T.BAJA) maxF = f;
      var cc = parseFloat(D(id, 'CONDICIONCORPORAL', 't')); if (cc > 0 && (!g.ec || f > g.ec[0])) g.ec = [f, cc];
      if (t === T.PARTO) {
        var tp = D(id, 'TIPOPARTO', 'i').toUpperCase(), s1 = D(id, 'TERNEROSX1', 't').toUpperCase(), s2 = D(id, 'TERNEROSX2', 't').toUpperCase();
        var res = /ABORTO/.test(tp) ? 'A' : (s1 === 'H' || s1 === 'M' ? s1 : '') + (s2 === 'H' || s2 === 'M' ? '/' + s2 : '');
        g.pa.push([f, D(id, 'LACTANCIA', 'n') || 0, res, toro[D(id, 'PADREANIMALGUID', 't')] || '', null, null]);
      } else if (t === T.SERVICIO) g.ev.push([f, 'S', toro[D(id, 'TOROGUID', 't')] || '', ins[D(id, 'INSEMINADORID', 'n')] || null]);
      else if (t === T.CELO) g.ev.push([f, 'C', '', null]);
      else if (t === T.TACTO) { var e = D(id, 'ESTADOVACA', 'n'); if (e) g.ta.push([f, e]); }
      else if (t === T.CONTROL) { var l = (D(id, 'LITROSAM', 'n') || 0) + (D(id, 'LITROSPM', 'n') || 0); if (l > 0) g.ctAll.push([f, Math.round(l * 10) / 10, null, null, null]); }
      else if (t === T.SECADO) g.sec.push(f);
      else if (t === T.ABORTO) g.ab.push(f);
      else if (t === T.BAJA) { if (!g.baja || f > g.baja[0]) g.baja = [f, D(id, 'CAUSABAJAID', 'n')]; }
      else if (t === T.DESCARTE) { if (!g.desc || f > g.desc[0]) g.desc = [f, D(id, 'MOTIVODESCARTE', 'n')]; }
    });
    var info = infoFromName(opts.nombreArchivo);
    var ref = info.fecha && info.fecha >= maxF ? info.fecha : maxF;
    var desdeHist = addDays(ref, -730);
    // resumen de cada control lechero del tambo (todas las vacas, también las que después se fueron)
    var porF = {};
    H.forEach(function (a) {
      var g = G[a.g]; g.ctAll.sort(cmp); g.pa.sort(cmp); g.ev.sort(cmp); g.ta.sort(cmp); g.sec.sort(); g.ab.sort();
      // número de lactancia: en el parto FOSAPP anota la lactancia que termina (0 = vaquillona), así que el parto abre esa + 1.
      // Se cuenta hacia atrás desde la lactancia actual del animal, que es la más confiable (a veces el dato del parto viene en 0)
      var n = g.pa.length, L = 0;
      // (algunas bases traen en el dato de lactancia números sin sentido, como 4841, en partos viejos: se ignoran los mayores de 20)
      g.pa.forEach(function (p) { if (p[1] <= 20 && p[1] + 1 > L) L = p[1] + 1; });
      if (a.vl > 0 && a.vl <= 20) L = Math.max(L, a.vl);
      var ok = L - n + 1 >= 1;
      g.pa.forEach(function (p, i) { p[1] = ok ? L - (n - 1 - i) : i + 1; });
      g.pa.forEach(function (p, i) {
        var np = g.pa[i + 1], hasta = np ? np[0] : '9999';
        // servicio de la preñez: el más cercano a 283 días antes del parto (±20)
        var est = addDays(p[0], -GEST), best = null;
        g.ev.forEach(function (e) { if (e[1] !== 'S' || e[0] >= p[0]) return; var d = Math.abs(diffDays(e[0], est)); if (d <= 20 && (!best || d < best[1])) best = [e[0], d]; });
        p[4] = best ? best[0] : null;
        var s = g.sec.filter(function (x) { return x > p[0] && x < hasta; }); p[5] = s.length ? s[0] : null;
        var fin = p[5] ? diffDays(p[5], p[0]) : np ? diffDays(np[0], p[0]) - 60 : null;
        var L = lactancia(g.ctAll.filter(function (c) { return c[0] > p[0] && c[0] < hasta; }), p[0], fin != null && fin > 0 ? fin : null);
        if (L) g.la.push([p[1], L.total, L.l305, null, null, L.n]);
      });
      g.ctAll.forEach(function (c) {
        var lp = null; g.pa.forEach(function (p) { if (p[0] < c[0]) lp = p; });
        var x = porF[c[0]] || (porF[c[0]] = { v: 0, l: 0, d: 0, nd: 0 }); x.v++; x.l += c[1];
        if (lp) { x.d += diffDays(c[0], lp[0]); x.nd++; }
      });
      // controles guardados en la ficha: lactancia actual y anterior (como con SysCaw)
      var desde = n > 1 ? g.pa[n - 2][0] : n ? g.pa[0][0] : null;
      g.ct = desde ? g.ctAll.filter(function (c) { return c[0] >= desde; }) : [];
    });
    var ctrls = Object.keys(porF).sort().filter(function (f) { return porF[f].v >= 5; }).map(function (f) { var x = porF[f]; return [f, 0, x.v, Math.round(x.l), x.nd ? Math.round(x.d / x.nd) : null, null]; });

    var codes = {}; Object.keys(ESTADOS).forEach(function (k) { codes[k] = ESTADOS[k]; });
    H.forEach(function (a) { G[a.g].ta.forEach(function (t) { if (!codes[t[1]]) codes[t[1]] = ['Estado ' + t[1], 'Estado ' + t[1] + ' (FOSAPP)', '']; }); });

    var animales = [], hist = {}, bajas = [];
    H.forEach(function (a) {
      var g = G[a.g], rp = a.rp; if (!rp) return;
      var activo = a.est !== 3 && a.est !== 5 && !(g.baja && a.est !== 1);
      if (!activo) {
        var cz = g.baja ? g.baja[1] : null, tipo = cz && causaTipo[cz] === 2 ? 'muerte' : cz && causaTipo[cz] === 1 ? 'venta' : a.est === 5 ? 'muerte' : a.est === 3 ? 'venta' : 'baja';
        var key = 'f' + a.g.slice(0, 8), bF = g.baja ? g.baja[0] : null;
        var cat = g.pa.length ? (a.ub === 'SECA' ? 'seca' : 'vaca') : 'vaquillona';
        bajas.push({ key: key, rp: rp, nombre: null, cat: cat, u: 0, dFecha: g.desc ? g.desc[0] : null, bFecha: bF, bTipo: tipo, bCausa: cz && causa[cz] && !/sin diag/i.test(causa[cz]) ? causa[cz] : null });
        if (!bF || bF >= desdeHist) {
          var paB = g.pa.filter(function (p) { return p[0] >= desdeHist; }); if (!paB.length && g.pa.length) paB = [g.pa[g.pa.length - 1]];
          var dB = paB.length ? paB[0][0] : '0000', dE = function (e) { return e[0] >= dB; }, nros = paB.map(function (p) { return p[1]; });
          hist[key] = { mv: null, pa: paB, ev: g.ev.filter(dE), ta: g.ta.filter(dE), la: g.la.filter(function (l) { return nros.indexOf(l[0]) >= 0; }), ct: g.ct.filter(dE), ult: true, fn: a.fn, ma: null, pd: null, vit: null };
        } else hist[key] = { pa: [], ev: [], ta: [], la: [], ct: [], fn: a.fn, ma: null, pd: null, vit: null, corto: true };
        return;
      }
      var lp = g.pa.length ? g.pa[g.pa.length - 1] : null, lpf = lp ? lp[0] : '0000';
      var cat;
      if (lp) cat = a.ub === 'SECA' || (lp[5] && lp[5] > lpf) ? 'seca' : 'vaca';
      else cat = g.ev.some(function (e) { return e[1] === 'S'; }) || (a.fn && diffDays(ref, a.fn) >= 365) ? 'vaquillona' : 'ternera';
      var evs = g.ev.filter(function (e) { return e[0] > lpf; }), servs = evs.filter(function (e) { return e[1] === 'S'; });
      var le = evs.length ? evs[evs.length - 1] : null;
      var tas = g.ta.filter(function (t) { return t[0] >= lpf; }), lt = tas.length ? tas[tas.length - 1] : null;
      var cd = lt ? codes[lt[1]] : null, res = cd ? cd[0] : null, preg = !!(cd && cd[2] === '2'), conc = null;
      if (preg) { var sv = servs.filter(function (e) { return e[0] <= lt[0]; }); conc = sv.length ? sv[sv.length - 1][0] : null; }
      var estado = preg ? 'prenada' : res && /^vac/i.test(res) ? 'vacia' : res ? 'otro' : 'sin';
      if (estado !== 'prenada' && le && le[1] === 'S' && (!lt || le[0] > lt[0])) estado = 'servida';
      var curLac = null; g.la.forEach(function (l) { if (lp && l[0] === lp[1]) curLac = l; });
      var mejs = g.la.map(function (l) { return l[2] || l[1]; }).filter(Boolean);
      var pr = lp ? g.ct.filter(function (c) { return c[0] >= lpf; }).map(function (c) { return c[1]; }).reverse().slice(0, 10) : [];
      var desc = g.desc && (!lp || g.desc[0] >= lpf) ? g.desc : null;
      animales.push({
        rp: rp, nombre: null, cat: cat, edad: a.fn ? Math.round(diffDays(ref, a.fn) / 365.25 * 10) / 10 : null,
        rod: a.ub ? nom(a.ub.replace('ORDENE', 'ORDEÑE')) : null, idElec: null,
        pFecha: lp ? lp[0] : null, pN: lp ? lp[1] : null, r1: lp ? (lp[2].split('/')[0] || null) : null, r2: lp ? (lp[2].split('/')[1] || null) : null,
        sFecha: le ? le[0] : null, sN: le ? servs.length : null, toro: le ? (le[1] === 'C' ? 'Celo' : (le[2] || null)) : null,
        tFecha: lt ? lt[0] : null, result: res, partoProb: conc ? addDays(conc, GEST) : null, estado: estado,
        u: 0, dFecha: desc ? desc[0] : null, rech: desc ? (causa[desc[1]] || 'Descarte') : null, rechDet: desc ? (causa[desc[1]] || null) : null, pr: pr, celo: estado === 'prenada' && !!le && le[1] === 'C',
        dLac: lp && (cat === 'vaca' || cat === 'seca') ? diffDays(ref, lp[0]) : null,
        prodLts: curLac ? curLac[1] : null, mej: mejs.length ? Math.max.apply(null, mejs) : null
      });
      hist[rp] = { mv: null, ec: g.ec, pa: g.pa, ev: g.ev, ta: g.ta, la: g.la, ct: g.ct, ab: g.ab, fn: a.fn, ma: null, pd: null, vit: null };
    });
    animales.sort(function (x, y) { return x.rp.localeCompare(y.rp, 'es', { numeric: true }); });
    bajas.sort(function (x, y) { return (y.bFecha || '') < (x.bFecha || '') ? -1 : 1; });
    var c = {}; animales.forEach(function (x) { c[x.cat] = (c[x.cat] || 0) + 1; });
    var config = {}; if (+par.PEV > 0) config.pev = +par.PEV;
    if (+par.MESSERV1INI >= 1 && +par.MESSERV1INI <= 12) config.iniMes = +par.MESSERV1INI;
    return { idProd: prod[0] != null ? ['F' + prod[0]] : [], ctrls: ctrls, config: config, animales: animales, bajas: bajas, hist: hist, codes: codes, fecha: ref, desdeHist: desdeHist, tambo: nom(prod[1]) || info.tambo, conteoCat: c, origen: 'fosapp' };
  }

  // nombre del archivo de FOSAPP: DB3112026.zip = 3/11/2026
  function infoFromName(name) {
    var m = /DB(\d{1,2})(\d{2})(\d{4})/i.exec(String(name || '')), fecha = null;
    if (m && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) fecha = m[3] + '-' + m[2] + '-' + pad(+m[1]);
    return { tambo: null, fecha: fecha };
  }

  // opts: { initSqlJs, wasmUrl, XLSX }
  async function fromFile(buf, nombre, opts) {
    var u = sacarSqlite(buf, opts.XLSX);
    var SQL = await opts.initSqlJs({ locateFile: function () { return opts.wasmUrl; } });
    var db = new SQL.Database(u);
    try {
      var ok = filas(db, "select count(*) from sqlite_master where name in ('Animal','Evento','EventoDato')")[0][0];
      if (ok < 3) throw new Error('La base no tiene las tablas de FOSAPP (Animal, Evento).');
      var d = build(db, { nombreArchivo: nombre });
      d.unidades = []; d.sel = null; d.unidadesSel = [];
      return d;
    } finally { db.close(); }
  }

  var api = { fromFile: fromFile, build: build, es: es, infoFromName: infoFromName, lactancia: lactancia };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Fosapp = api;
})(typeof window !== 'undefined' ? window : this);
