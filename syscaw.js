/* Arma la libreta + historial a partir de las tablas de un respaldo SysCaw */
(function (root) {
  'use strict';
  var GEST = 283;
  var TABLES = {
    ident: 'Identificación.DB', serv: 'Celos y Servicios.DB', partos: 'Partos.DB', tactos: 'TACTOS.DB',
    ctrl: 'CargaCtrlLech.DB', lact: 'TotProdParto.DB', toros: 'Toros General.DB', codigos: 'Codigos Reproductivos.DB',
    bajas: 'Detalle Baja.DB', rodeos: 'NomenclRodeos.DB', elect: 'IdsEnUso.DB'
  };
  var OPCIONALES = { tambos: 'Tambos.DB', llaves: 'Llaves.DB' };
  var FIELDS = {
    ident: ['ID', 'RP', 'NombreOrigen', 'FNac', 'IDMadre', 'IDPadre', 'IdTipoRodeo', 'UltimoRodeo', 'DescarteCausa', 'FechaBaja', 'ProdVitLitros', 'Tambo', 'BajaCausa', 'BajaDetalle'],
    serv: ['Vaca', 'Fecha', 'Evento', 'Toro'],
    partos: ['Vaca', 'Fecha', 'Resultado1', 'Resultado2', 'NroParto', 'Toro', 'FServicio', 'FechaCierreLact'],
    tactos: ['Vaca', 'Fecha', 'Resultado'],
    ctrl: ['ID', 'Fecha', 'Litros1', 'Litros2', 'Litros3', 'Grasa1', 'Prot1', 'CelSom1'],
    lact: ['Vaca', 'Parto', 'Controles', 'LitrosProd', 'LitrosProd305', 'GrasaProd', 'ProtProd'],
    toros: ['ID', 'Alias', 'Nombre'],
    codigos: ['ID', 'Alias', 'Nombre', 'ImplicanciaGest'],
    bajas: ['ID', 'Detalle', 'Abrev', 'Tipo'],
    rodeos: ['IDTipo', 'IDPropio', 'Abrev3', 'NombreRodeo'],
    elect: ['IDElectr', 'IdVaca', 'Tipo', 'Obs'],
    tambos: ['ID', 'Nombre']
  };
  var CAT = { 1: 'vaca', 2: 'seca', 3: 'vaquillona', 4: 'ternera' };
  var RES = { '1': 'M', '2': 'H', '4': 'A', '3': '?', '0': '' };
  var MESES = { jan: 1, ene: 1, feb: 2, mar: 3, apr: 4, abr: 4, may: 5, jun: 6, jul: 7, aug: 8, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dec: 12, dic: 12 };
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  function P(s) { var a = s.split('-').map(Number); return Date.UTC(a[0], a[1] - 1, a[2]); }
  function diffDays(a, b) { return Math.round((P(a) - P(b)) / 864e5); }
  function addDays(s, n) { var d = new Date(P(s) + n * 864e5); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function okDate(d) { return d && d > '1900' && d < '2100' ? d : null; }

  function infoFromName(name) {
    var base = String(name || '').replace(/\.rar$/i, '').replace(/^[0-9a-f]{8}-/i, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    var m = base.match(/(\d{1,2})-([A-Za-z]{3})-(\d{2,4})/), fecha = null;
    if (m && MESES[m[2].toLowerCase()]) { var y = +m[3]; if (y < 100) y += 2000; fecha = y + '-' + pad(MESES[m[2].toLowerCase()]) + '-' + pad(+m[1]); }
    var tambo = base.replace(/\s*\d{1,2}-[A-Za-z]{3}-\d{2,4}.*$/, '').replace(/^EC\s*-\s*/i, '').trim();
    return { tambo: tambo || null, fecha: fecha };
  }

  // files: { 'Identificación.DB': Uint8Array, ... }
  function build(files, opts) {
    opts = opts || {};
    var PX = opts.Paradox || root.Paradox;
    var T = {};
    Object.keys(TABLES).forEach(function (k) {
      var f = files[TABLES[k]];
      if (!f) throw new Error('Falta la tabla ' + TABLES[k] + ' en el respaldo.');
      T[k] = PX.readTable(f, { fields: FIELDS[k], array: true }).rows;
    });
    var toro = {}, cod = {}, codes = {}, baja = {}, rod = {}, el = {};
    T.toros.forEach(function (r) { toro[r[0]] = (r[1] || r[2] || '').trim(); });
    T.codigos.forEach(function (r) { cod[r[0]] = { alias: r[1], nombre: r[2], gest: r[3] }; codes[r[0]] = [r[1], r[2], r[3]]; });
    var bajaDet = {};
    T.bajas.forEach(function (r) { baja[r[0]] = r[2] || r[1]; bajaDet[r[0]] = { d: r[1], muerte: r[3] === true }; });
    T.rodeos.forEach(function (r) { rod[r[0] + ':' + r[1]] = r[2] || r[3]; });
    T.elect.forEach(function (r) { if (r[2] === 1) { var v = String(r[3] || r[0] || '').replace(/^0+/, ''); if (v) el[r[1]] = v; } });

    var sel = null;
    if (opts.unidades && opts.unidades.length) { sel = {}; opts.unidades.forEach(function (u) { sel[u] = true; }); }
    var byId = {}, act = {};
    T.ident.forEach(function (r) { byId[r[0]] = r; if (!r[9] && CAT[r[6]] && (!sel || sel[r[11]])) act[r[0]] = r; });
    // dados de baja (vendidos / muertos): no cuentan en la libreta, pero se pueden buscar por caravana
    var bj = {}, refB = (infoFromName(opts.nombreArchivo).fecha || '9999');
    var desdeHist = refB === '9999' ? '0000' : addDays(refB, -730);
    T.ident.forEach(function (r) { if ((r[9] || r[13]) && (!sel || sel[r[11]])) bj[r[0]] = r; });
    var G = {}; Object.keys(act).forEach(function (id) { G[id] = { pa: [], ev: [], ta: [], la: [], ct: [] }; });
    // historial completo solo para las bajas de los últimos 2 años (para no agrandar la libreta)
    Object.keys(bj).forEach(function (id) { var f = okDate(bj[id][9]); if (!f || f >= desdeHist) G[id] = { pa: [], ev: [], ta: [], la: [], ct: [] }; });
    var maxF = '0000';
    T.partos.forEach(function (r) {
      var g = G[r[0]], f = okDate(r[1]); if (!g || !f || !(r[4] > 0)) return;
      var res = (RES[r[2]] || '') + (r[3] && r[3] !== '0' ? '/' + (RES[r[3]] || '') : '');
      g.pa.push([f, r[4], res, toro[r[5]] || '', okDate(r[6]), okDate(r[7])]); if (f > maxF) maxF = f;
    });
    T.serv.forEach(function (r) {
      var g = G[r[0]], f = okDate(r[1]); if (!g || !f) return;
      var t = r[2] === 1 ? 'C' : 'S'; g.ev.push([f, t, t === 'S' ? (toro[r[3]] || '') : '']); if (f > maxF) maxF = f;
    });
    T.tactos.forEach(function (r) { var g = G[r[0]], f = okDate(r[1]); if (g && f) { g.ta.push([f, r[2]]); if (f > maxF) maxF = f; } });
    T.lact.forEach(function (r) {
      var g = G[r[0]]; if (!g || !(r[1] > 0)) return;
      var L = r[3] || 0, L3 = r[4] || null;
      g.la.push([r[1], Math.round(L), L3 ? Math.round(L3) : null, L ? (r[5] ? Math.round(r[5] / L * 1e4) / 100 : null) : null, L ? (r[6] ? Math.round(r[6] / L * 1e4) / 100 : null) : null, r[2]]);
    });
    var cmp = function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; };
    Object.keys(G).forEach(function (id) { var g = G[id]; g.pa.sort(cmp); g.ev.sort(cmp); g.ta.sort(cmp); g.la.sort(function (a, b) { return a[0] - b[0]; }); });
    // controles: lactancia actual y anterior
    var desde = {};
    Object.keys(G).forEach(function (id) { var pa = G[id].pa; desde[id] = pa.length > 1 ? pa[pa.length - 2][0] : (pa.length ? pa[0][0] : null); });
    T.ctrl.forEach(function (r) {
      var g = G[r[0]], f = okDate(r[1]); if (!g || !f || !desde[r[0]] || f < desde[r[0]]) return;
      var lt = (r[2] || 0) + (r[3] || 0) + (r[4] || 0);
      g.ct.push([f, Math.round(lt * 10) / 10, r[5] || null, r[6] || null, r[7] || null]); if (f > maxF) maxF = f;
    });
    Object.keys(G).forEach(function (id) { G[id].ct.sort(cmp); });

    var info = infoFromName(opts.nombreArchivo);
    var ref = info.fecha || maxF;
    var animales = [], hist = {};
    Object.keys(act).forEach(function (id) {
      var a = act[id], g = G[id], rp = String(a[1]);
      var lp = g.pa.length ? g.pa[g.pa.length - 1] : null, lpf = lp ? lp[0] : '0000';
      var evs = g.ev.filter(function (e) { return e[0] > lpf; });
      var servs = evs.filter(function (e) { return e[1] === 'S'; });
      var le = evs.length ? evs[evs.length - 1] : null;
      var tas = g.ta.filter(function (t) { return t[0] >= lpf; });
      var lt = tas.length ? tas[tas.length - 1] : null;
      var res = lt && cod[lt[1]] ? cod[lt[1]].alias : null;
      var preg = !!(lt && cod[lt[1]] && cod[lt[1]].gest === '2'), conc = null;
      if (preg) { var sv = servs.filter(function (e) { return e[0] <= lt[0]; }); conc = sv.length ? sv[sv.length - 1][0] : null; }
      var estado = 'sin';
      if (preg) estado = 'prenada';
      else if (res && /^vac/i.test(res)) estado = 'vacia';
      else if (res && /^cic/i.test(res)) estado = 'ciclando';
      else if (res && /^apta/i.test(res)) estado = 'apta';
      else if (res) estado = 'otro';
      if (estado !== 'prenada' && le && le[1] === 'S' && (!lt || le[0] > lt[0])) estado = 'servida';
      var curLac = null; g.la.forEach(function (l) { if (lp && l[0] === lp[1]) curLac = l; });
      var mejs = g.la.map(function (l) { return l[2] || l[1]; }).filter(Boolean);
      var pr = lp ? g.ct.filter(function (c) { return c[0] >= lpf; }).map(function (c) { return c[1]; }).reverse().slice(0, 10) : [];
      var fn = okDate(a[3]);
      var r12 = lp ? String(lp[2] || '').split('/') : [];
      var cat = CAT[a[6]];
      animales.push({
        rp: rp, nombre: a[2] || null, cat: cat,
        edad: fn ? Math.round(diffDays(ref, fn) / 365.25 * 10) / 10 : null,
        rod: rod[a[6] + ':' + a[7]] || null, idElec: el[id] || null,
        pFecha: lp ? lp[0] : null, pN: lp ? lp[1] : null, r1: r12[0] || null, r2: r12[1] || null,
        sFecha: le ? le[0] : null, sN: le ? servs.length : null, toro: le ? (le[1] === 'C' ? 'Celo' : (le[2] || null)) : null,
        tFecha: lt ? lt[0] : null, result: res, partoProb: conc ? addDays(conc, GEST) : null, estado: estado,
        u: a[11] == null ? 0 : a[11], rech: a[8] ? (baja[a[8]] || String(a[8])) : null, pr: pr, celo: estado === 'prenada' && !!le && le[1] === 'C',
        dLac: lp && (cat === 'vaca' || cat === 'seca') ? diffDays(ref, lp[0]) : null,
        prodLts: curLac ? curLac[1] : null, mej: mejs.length ? Math.max.apply(null, mejs) : null
      });
      var m = byId[a[4]];
      hist[rp] = { pa: g.pa, ev: g.ev, ta: g.ta, la: g.la, ct: g.ct, fn: fn, ma: m ? String(m[1]) : null, pd: a[5] ? (toro[a[5]] || null) : null, vit: a[10] ? Math.round(a[10]) : null };
    });
    animales.sort(function (x, y) { return x.rp.localeCompare(y.rp, 'es', { numeric: true }); });
    var bajas = [];
    Object.keys(bj).forEach(function (id) {
      var r = bj[id], key = 'b' + id, det = bajaDet[r[13]] || null;
      var tipo = r[12] === '1' ? 'muerte' : r[12] === '0' ? 'venta' : (det && det.muerte ? 'muerte' : 'baja');
      var o = { key: key, rp: String(r[1]), nombre: r[2] || null, cat: CAT[r[6]] || null, u: r[11] == null ? 0 : r[11], bFecha: okDate(r[9]), bTipo: tipo, bCausa: det && det.d && !/sin datos/i.test(det.d) ? det.d : null };
      bajas.push(o);
      var g = G[id];
      if (g) {
        var m = byId[r[4]];
        // de las bajas se guarda solo la última lactancia (desde el último parto)
        var lpB = g.pa.length ? g.pa[g.pa.length - 1] : null, desdeB = lpB ? lpB[0] : '0000';
        var desdeEv = function (e) { return e[0] >= desdeB; };
        hist[key] = { pa: lpB ? [lpB] : [], ev: g.ev.filter(desdeEv), ta: g.ta.filter(desdeEv), la: lpB ? g.la.filter(function (l) { return l[0] === lpB[1]; }) : [], ct: g.ct.filter(desdeEv), ult: true, fn: okDate(r[3]), ma: m ? String(m[1]) : null, pd: r[5] ? (toro[r[5]] || null) : null, vit: r[10] ? Math.round(r[10]) : null };
      } else hist[key] = { pa: [], ev: [], ta: [], la: [], ct: [], fn: okDate(r[3]), ma: byId[r[4]] ? String(byId[r[4]][1]) : null, pd: r[5] ? (toro[r[5]] || null) : null, vit: r[10] ? Math.round(r[10]) : null, corto: true };
    });
    bajas.sort(function (x, y) { return (y.bFecha || '') < (x.bFecha || '') ? -1 : 1; });
    var c = {}; animales.forEach(function (x) { c[x.cat] = (c[x.cat] || 0) + 1; });
    // configuración del tambo en SysCaw: período de espera voluntario (días al 1er servicio) y días de secado
    var config = {};
    if (files[OPCIONALES.llaves]) {
      try {
        var ll = PX.readTable(files[OPCIONALES.llaves], { fields: ['Delta1erServVacas', 'Delta1erServVaq', 'DiasPreSecado'], array: true }).rows[0];
        if (ll) { if (ll[0] > 0) config.pev = ll[0]; if (ll[1] > 0) config.pevVaq = ll[1]; if (ll[2] > 0) config.secado = ll[2]; }
      } catch (e) {}
    }
    return { config: config, animales: animales, bajas: bajas, hist: hist, codes: codes, fecha: ref, tambo: info.tambo, conteoCat: c };
  }

  // Unidades (tambos / campos) que trae el respaldo, con los animales activos de cada una
  function unidades(files, opts) {
    opts = opts || {};
    var PX = opts.Paradox || root.Paradox, nom = {};
    if (files[OPCIONALES.tambos]) PX.readTable(files[OPCIONALES.tambos], { fields: FIELDS.tambos, array: true }).rows.forEach(function (r) { nom[r[0]] = (r[1] || '').trim(); });
    var U = {};
    PX.readTable(files[TABLES.ident], { fields: ['Tambo', 'IdTipoRodeo', 'FechaBaja'], array: true }).rows.forEach(function (r) {
      if (r[2] || !CAT[r[1]]) return;
      var id = r[0] == null ? 0 : r[0];
      var u = U[id] || (U[id] = { id: id, nombre: nom[id] || (id ? 'Unidad ' + id : 'Sin unidad'), total: 0, vaca: 0, seca: 0, vaquillona: 0, ternera: 0 });
      u.total++; u[CAT[r[1]]]++;
    });
    return Object.keys(U).map(function (k) { return U[k]; }).sort(function (a, b) { return a.id - b.id; });
  }

  // opts.elegir(unidades) -> Promise<[ids]> : se llama solo si el respaldo trae más de una unidad con animales
  async function fromRar(arrayBuffer, nombre, opts) {
    var U = opts.unrar, want = {};
    Object.keys(TABLES).forEach(function (k) { want[TABLES[k].toLowerCase()] = TABLES[k]; });
    Object.keys(OPCIONALES).forEach(function (k) { want[OPCIONALES[k].toLowerCase()] = OPCIONALES[k]; });
    var ex = await U.createExtractorFromData({ data: arrayBuffer, wasmBinary: opts.wasmBinary });
    var list = ex.extract({ files: function (h) { var b = h.name.split(/[\\/]/).pop().toLowerCase(); return !!want[b]; } });
    var files = {};
    for (var f of list.files) { var b = f.fileHeader.name.split(/[\\/]/).pop().toLowerCase(); if (f.extraction) files[want[b]] = f.extraction; }
    if (!files[TABLES.ident]) throw new Error('El archivo no parece un respaldo de SysCaw (no encontré la tabla Identificación).');
    var us = unidades(files, { Paradox: opts.Paradox }), ids = null;
    if (us.length > 1 && opts.elegir) {
      ids = await opts.elegir(us);
      if (!ids || !ids.length) { var e = new Error('Carga cancelada.'); e.cancelado = true; throw e; }
    }
    // se arma la libreta con todas las unidades; la app filtra por la selección (y deja cambiarla sin recargar)
    var d = build(files, { nombreArchivo: nombre, Paradox: opts.Paradox, unidades: opts.todas ? null : ids });
    d.unidades = us;
    d.sel = ids && ids.length < us.length ? ids : null;
    d.unidadesSel = (d.sel ? us.filter(function (u) { return d.sel.indexOf(u.id) >= 0; }) : us).map(function (u) { return u.nombre; });
    return d;
  }

  var api = { build: build, fromRar: fromRar, unidades: unidades, TABLES: TABLES, infoFromName: infoFromName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SysCaw = api;
})(typeof window !== 'undefined' ? window : this);
