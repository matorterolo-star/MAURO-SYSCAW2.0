/* Arma la libreta + historial a partir de las tablas de un respaldo SysCaw */
(function (root) {
  'use strict';
  var GEST = 283;
  var TABLES = {
    ident: 'Identificación.DB', serv: 'Celos y Servicios.DB', partos: 'Partos.DB', tactos: 'TACTOS.DB',
    ctrl: 'CargaCtrlLech.DB', lact: 'TotProdParto.DB', toros: 'Toros General.DB', codigos: 'Codigos Reproductivos.DB',
    bajas: 'Detalle Baja.DB', rodeos: 'NomenclRodeos.DB', elect: 'IdsEnUso.DB'
  };
  var OPCIONALES = { tambos: 'Tambos.DB', llaves: 'Llaves.DB', agenda: 'Agenda.DB', maestro: 'MaestroCoLech.DB', estcorp: 'ESTCORP.DB', pases: 'SegTambos.DB' };
  var FIELDS = {
    ident: ['ID', 'RP', 'NombreOrigen', 'FNac', 'IDMadre', 'IDPadre', 'IdTipoRodeo', 'UltimoRodeo', 'DescarteCausa', 'FechaBaja', 'ProdVitLitros', 'Tambo', 'BajaCausa', 'BajaDetalle', 'DescarteFecha'],
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

  // suma una vaca a las curvas. pa = [{ f: fecha parto, n: nº lactancia, cierre: fecha de secado o null, L: litros totales, L305, sol: kg grasa + proteína }]
  // ordenado por fecha; ct = [[fecha, litros, -, % grasa, % proteína], ...]; ref = fecha del respaldo. Sólidos: litros a 305 d × % de
  // grasa + proteína de sus controles (no se usa el total de sólidos de SysCaw: en las lactancias recientes viene vacío o incompleto)
  // tramos de 25 días en leche (12 tramos = 300 días); pico = control más alto hasta 120 días, en vacas con control antes de los 60 y
  // después de los 90 (ya pasó el pico). Total: litros a 305 días, solo de las que llegaron; las que cerraron antes van aparte (cs, cn). Las lactancias en curso van a pend para proyectarlas
  var CB = 12, CW = 25;
  function curvaLact(out, pa, ct, unidad, ref, pend) {
    pa.forEach(function (p, i) {
      var hasta = pa[i + 1] ? pa[i + 1].f : '9999', B = {}, pk = null, pkd = null, temprano = false, tarde = false, hay = false, nAn = 0, sL = 0, sS = 0;
      ct.forEach(function (c) {
        if (c[0] <= p.f || c[0] >= hasta || !(c[1] > 0)) return;
        // % de grasa + proteína de la lactancia, ponderado por los litros de cada control con análisis
        if (c[3] >= 2 && c[3] <= 7 && c[4] >= 2 && c[4] <= 5.5) { nAn++; sL += c[1]; sS += c[1] * (c[3] + c[4]) / 100; }
        var d = diffDays(c[0], p.f); if (d < 1 || d > CB * CW) return;
        var b = Math.floor((d - 1) / CW); (B[b] = B[b] || []).push(c[1]); hay = true;
        if (d <= 60) temprano = true; if (d >= 90) tarde = true;
        if (d <= 120 && (pk == null || c[1] > pk)) { pk = c[1]; pkd = d; }
      });
      if (!hay) return;
      var g = p.n === 1 ? 1 : 2, k = p.f.slice(0, 7) + '|' + g + '|' + unidad(p.f);
      var C = out[k] || (out[k] = { n: 0, pk: 0, pn: 0, pd: 0, s: [], c: [], t: 0, tn: 0, gs: 0, gn: 0, e: 0, en: 0, es: 0, esn: 0, cs: 0, cn: 0 });
      C.n++;
      if (temprano && tarde && pk != null) { C.pk = Math.round((C.pk + pk) * 10) / 10; C.pn++; C.pd += pkd; }
      var med = {};
      Object.keys(B).forEach(function (b) { var v = B[b], m = v.reduce(function (x, y) { return x + y; }, 0) / v.length; med[b] = m; C.s[b] = Math.round(((C.s[b] || 0) + m) * 10) / 10; C.c[b] = (C.c[b] || 0) + 1; });
      // a 305 días: solo las que llegaron (las que cerraron antes, por secado o baja, se cuentan aparte: mezclarlas bajaría el promedio)
      // como el control lechero (ICAR / DHIA): los primeros 305 días, o el total real si se secó antes. Las que terminaron por venta o
      // muerte antes de los 305 días quedan aparte (reflejan el descarte, no la producción)
      var cerrada = !!pa[i + 1] || !!(p.cierre && p.cierre <= ref);
      var porBaja = !pa[i + 1] && !!p.baja && (!p.cierre || Math.abs(diffDays(p.baja, p.cierre)) <= 7);
      var tot = p.L305 > 0 ? p.L305 : cerrada && !porBaja && p.L > 0 ? p.L : null;
      if (tot) {
        C.t += Math.round(tot); C.tn++;
        if (nAn >= 4 && sL > 0) { C.gs = Math.round((C.gs + tot * sS / sL) * 10) / 10; C.gn++; }
      } else if (cerrada || porBaja) { if (p.L > 0) { C.cs = (C.cs || 0) + Math.round(p.L); C.cn = (C.cn || 0) + 1; } }
      else if (!cerrada && pend && ref && diffDays(ref, p.f) >= 30 && Object.keys(med).length >= 2) {
        // se proyecta hasta el secado probable (preñada: parto probable menos los días de secado), sin pasar de 305 días
        var fin = 305; if (p.pp) fin = Math.min(305, diffDays(addDays(p.pp, -(p.sec || 60)), p.f));
        fin = Math.max(fin, Math.min(305, diffDays(ref, p.f)));
        pend.push({ k: k, g: g, m: med, pct: nAn >= 2 && sL > 0 ? sS / sL : null, fin: fin });
      }
    });
  }
  // lactancias en curso: se proyectan a 305 días con la curva del tambo (su nivel respecto del promedio en los tramos que ya tiene)
  function curvaProy(out, pend) {
    var H = { 1: { s: [], c: [] }, 2: { s: [], c: [] } };
    Object.keys(out).forEach(function (k) { var g = +k.split('|')[1], C = out[k]; if (!H[g]) return; for (var b = 0; b < CB; b++) if (C.c[b]) { H[g].s[b] = (H[g].s[b] || 0) + C.s[b]; H[g].c[b] = (H[g].c[b] || 0) + C.c[b]; } });
    pend.forEach(function (x) {
      var h = H[x.g], own = 0, her = 0, ok = true, tot = 0;
      Object.keys(x.m).forEach(function (b) { if (h.c[b]) { own += x.m[b]; her += h.s[b] / h.c[b]; } });
      if (!her) return;
      var r = own / her;
      var fin = x.fin || 305, ult = null;
      for (var b = 0; b < CB && b * CW < fin; b++) { var v = x.m[b] != null ? x.m[b] : h.c[b] ? h.s[b] / h.c[b] * r : null; if (v == null) { ok = false; break; } tot += v * Math.min(CW, fin - b * CW); ult = v; }
      if (!ok) return;
      if (fin > CB * CW && ult != null) tot += ult * (fin - CB * CW);
      var C = out[x.k], est = tot; C.e += Math.round(est); C.en++;
      if (x.pct) { C.es = Math.round(((C.es || 0) + est * x.pct) * 10) / 10; C.esn = (C.esn || 0) + 1; }
    });
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
    // inseminador de cada servicio: campo Responsable, con el nombre de la Agenda de SysCaw
    var insServ = {};
    try {
      var insNom = {};
      if (files[OPCIONALES.agenda]) PX.readTable(files[OPCIONALES.agenda], { fields: ['Id', 'Nombre', 'Abrev'], array: true }).rows.forEach(function (r) { var n = (r[1] || r[2] || '').trim(); if (n) insNom[r[0]] = n; });
      PX.readTable(files[TABLES.serv], { fields: ['Vaca', 'Fecha', 'Evento', 'Responsable'], array: true }).rows.forEach(function (r) {
        if (r[2] === 1 || r[3] == null) return;
        var n = insNom[r[3]]; if (n) insServ[r[0] + '|' + r[1]] = n;
      });
    } catch (e) { insServ = {}; }
    T.elect.forEach(function (r) { if (r[2] === 1) { var v = String(r[3] || r[0] || '').replace(/^0+/, ''); if (v) el[r[1]] = v; } });

    var sel = null;
    if (opts.unidades && opts.unidades.length) { sel = {}; opts.unidades.forEach(function (u) { sel[u] = true; }); }
    var byId = {}, act = {};
    T.ident.forEach(function (r) { byId[r[0]] = r; if (!r[9] && CAT[r[6]] && (!sel || sel[r[11]])) act[r[0]] = r; });
    // dados de baja (vendidos / muertos): no cuentan en la libreta, pero se pueden buscar por caravana
    var bj = {}, refB = (infoFromName(opts.nombreArchivo).fecha || '9999');
    // historial de bajas de 3 años: el Panel compara las vacas preñadas con la foto de hace 2 años, que necesita un año de historia antes
    var desdeHist = refB === '9999' ? '0000' : addDays(refB, -1100);
    T.ident.forEach(function (r) { if ((r[9] || r[13]) && (!sel || sel[r[11]])) bj[r[0]] = r; });
    var G = {}; Object.keys(act).forEach(function (id) { G[id] = { pa: [], ev: [], ta: [], la: [], ct: [], ab: [] }; });
    // historial completo solo para las bajas de los últimos 2 años (para no agrandar la libreta)
    Object.keys(bj).forEach(function (id) { var f = okDate(bj[id][9]); if (!f || f >= desdeHist) G[id] = { pa: [], ev: [], ta: [], la: [], ct: [] }; });
    var maxF = '0000';
    T.partos.forEach(function (r) {
      var g = G[r[0]], f = okDate(r[1]); if (!g || !f) return;
      if (!(r[4] > 0)) { if (RES[r[2]] === 'A' && g.ab) g.ab.push(f); return; } // abortos que no abren lactancia
      var res = (RES[r[2]] || '') + (r[3] && r[3] !== '0' ? '/' + (RES[r[3]] || '') : '');
      g.pa.push([f, r[4], res, toro[r[5]] || '', okDate(r[6]), okDate(r[7])]); if (f > maxF) maxF = f;
    });
    T.serv.forEach(function (r) {
      var g = G[r[0]], f = okDate(r[1]); if (!g || !f) return;
      var t = r[2] === 1 ? 'C' : 'S'; g.ev.push([f, t, t === 'S' ? (toro[r[3]] || '') : '', t === 'S' ? (insServ[r[0] + '|' + r[1]] || null) : null]); if (f > maxF) maxF = f;
    });
    // pases entre unidades (últimos 3 años): para saber en qué unidad estaba cada animal en cada fecha
    var mvBy = {};
    try { if (files[OPCIONALES.pases]) PX.readTable(files[OPCIONALES.pases], { fields: ['ID', 'Fecha', 'Tambo', 'Origen'], array: true }).rows.forEach(function (r) { var f = okDate(r[1]); if (f && f >= '2023-01-01' && r[2] != null) (mvBy[r[0]] = mvBy[r[0]] || []).push([f, r[2], r[3]]); }); } catch (e) { mvBy = {}; }
    Object.keys(mvBy).forEach(function (k) { mvBy[k].sort(function (a, b) { return a[0] < b[0] ? -1 : 1; }); });
    // condición corporal: la última de cada animal y su historial de los últimos 3 años (como el resto del historial)
    var ecBy = {}, ecH = {};
    try { if (files[OPCIONALES.estcorp]) PX.readTable(files[OPCIONALES.estcorp], { fields: ['ID', 'Fecha', 'ECorp'], array: true }).rows.forEach(function (r) {
      var f = okDate(r[1]); if (!f || !(r[2] > 0)) return;
      if (!ecBy[r[0]] || f > ecBy[r[0]][0]) ecBy[r[0]] = [f, r[2]];
      if (f >= desdeHist) (ecH[r[0]] = ecH[r[0]] || []).push([f, Math.round(r[2] * 100) / 100]);
    }); } catch (e) { ecBy = {}; ecH = {}; }
    Object.keys(ecH).forEach(function (k) { ecH[k].sort(function (a, b) { return a[0] < b[0] ? -1 : 1; }); });
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
    // curvas de lactancia: con TODOS los controles y partos del respaldo (también vacas dadas de baja hace años), pero se guardan
    // solo promedios por mes de parto, lactancia (1 = primípara, 2 = multípara) y unidad: no agranda la libreta
    var curvas = {};
    try {
      var PA = {}, CT = {}, LA = {}, pend = [], refC = infoFromName(opts.nombreArchivo).fecha || maxF;
      T.lact.forEach(function (r) { if (r[1] > 0) LA[r[0] + '|' + r[1]] = r; });
      // parto probable de las vacas preñadas (último tacto positivo después del último parto): para proyectar hasta el secado
      var PP = {};
      Object.keys(G).forEach(function (id) {
        var g = G[id], lpf = g.pa.length ? g.pa[g.pa.length - 1][0] : '0000', ta = g.ta.filter(function (t) { return t[0] > lpf; }), lt = ta[ta.length - 1];
        if (!lt || !cod[lt[1]] || cod[lt[1]].gest !== '2') return;
        var sv = g.ev.filter(function (e) { return e[1] === 'S' && e[0] > lpf && e[0] <= lt[0]; });
        if (sv.length) PP[id] = addDays(sv[sv.length - 1][0], GEST);
      });
      T.partos.forEach(function (r) {
        var f = okDate(r[1]), a = byId[r[0]]; if (!f || !a || !(r[4] > 0) || (sel && !sel[a[11]])) return;
        var l = LA[r[0] + '|' + r[4]], L = l && l[3] > 0 ? l[3] : null, gr = l && L ? l[5] / L * 100 : null, pr = l && L ? l[6] / L * 100 : null;
        var sol = gr >= 2 && gr <= 7 && pr >= 2 && pr <= 5.5 ? l[5] + l[6] : null;
        (PA[r[0]] = PA[r[0]] || []).push({ f: f, n: r[4], cierre: okDate(r[7]), baja: okDate(a[9]), pp: PP[r[0]] && PP[r[0]] > f ? PP[r[0]] : null, L: L, L305: l && l[4] > 0 ? l[4] : null, sol: sol });
      });
      T.ctrl.forEach(function (r) { var f = okDate(r[1]); if (!f || !PA[r[0]]) return; var lt = (r[2] || 0) + (r[3] || 0) + (r[4] || 0); if (lt > 0 && lt < 90) (CT[r[0]] = CT[r[0]] || []).push([f, lt, 0, r[5] || null, r[6] || null]); });
      Object.keys(CT).forEach(function (id) {
        var u = byId[id][11] == null ? 0 : byId[id][11];
        curvaLact(curvas, PA[id].sort(function (x, y) { return x.f < y.f ? -1 : x.f > y.f ? 1 : 0; }), CT[id], function () { return u; }, refC, pend);
      });
      curvaProy(curvas, pend);
      curvas['v|4'] = 1; // versión de los promedios (4: en curso proyectadas hasta el secado probable; 3: 305 d o el total si se secó antes; sólidos con los controles)
    } catch (e) { curvas = {}; }

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
      // mejor lactancia como en SysCaw (Mej. 305): solo las lactancias con litros a 305 días
      var mejs = g.la.map(function (l) { return l[2]; }).filter(Boolean);
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
        u: a[11] == null ? 0 : a[11], dFecha: a[8] ? okDate(a[14]) : null, rech: a[8] ? (baja[a[8]] || String(a[8])) : null, rechDet: a[8] && bajaDet[a[8]] ? (bajaDet[a[8]].d || null) : null, pr: pr, celo: estado === 'prenada' && !!le && le[1] === 'C',
        dLac: lp && (cat === 'vaca' || cat === 'seca') ? diffDays(ref, lp[0]) : null,
        prodLts: curLac ? curLac[1] : null, mej: mejs.length ? Math.max.apply(null, mejs) : null
      });
      var m = byId[a[4]];
      hist[rp] = { mv: mvBy[id] || null, ec: ecBy[id] || null, ech: ecH[id] || null, pa: g.pa, ev: g.ev, ta: g.ta, la: g.la, ct: g.ct, ab: g.ab, fn: fn, ma: m ? String(m[1]) : null, pd: a[5] ? (toro[a[5]] || null) : null, vit: a[10] ? Math.round(a[10]) : null };
    });
    animales.sort(function (x, y) { return x.rp.localeCompare(y.rp, 'es', { numeric: true }); });
    var bajas = [];
    Object.keys(bj).forEach(function (id) {
      var r = bj[id], key = 'b' + id, det = bajaDet[r[13]] || null;
      var tipo = r[12] === '1' ? 'muerte' : r[12] === '0' ? 'venta' : (det && det.muerte ? 'muerte' : 'baja');
      var o = { key: key, rp: String(r[1]), nombre: r[2] || null, cat: CAT[r[6]] || null, u: r[11] == null ? 0 : r[11], dFecha: r[8] ? okDate(r[14]) : null, bFecha: okDate(r[9]), bTipo: tipo, bCausa: det && det.d && !/sin datos/i.test(det.d) ? det.d : null };
      bajas.push(o);
      var g = G[id];
      if (g) {
        var m = byId[r[4]];
        // de las bajas se guardan los partos de los últimos 2 años (al menos el último) y lo ocurrido desde el primero de ellos
        var paB = g.pa.filter(function (p) { return p[0] >= desdeHist; }); if (!paB.length && g.pa.length) paB = [g.pa[g.pa.length - 1]];
        var lpB = paB.length ? paB[paB.length - 1] : null, desdeB = paB.length ? paB[0][0] : '0000';
        var desdeEv = function (e) { return e[0] >= desdeB; };
        var nros = paB.map(function (p) { return p[1]; });
        hist[key] = { mv: mvBy[id] || null, ech: ecH[id] || null, pa: paB, ev: g.ev.filter(desdeEv), ta: g.ta.filter(desdeEv), la: g.la.filter(function (l) { return nros.indexOf(l[0]) >= 0; }), ct: g.ct.filter(desdeEv), ult: true, fn: okDate(r[3]), ma: m ? String(m[1]) : null, pd: r[5] ? (toro[r[5]] || null) : null, vit: r[10] ? Math.round(r[10]) : null };
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
    // resumen de cada control lechero del tambo (historial completo): fecha, unidad, vacas ordeñadas, litros totales, días en leche promedio
    var ctrls = [];
    try {
      if (files[OPCIONALES.maestro]) PX.readTable(files[OPCIONALES.maestro], { fields: ['Fecha', 'Tambo', 'VacasOrdenadas', 'TotLitros', 'DiasLactProm', 'VacasSecas'], array: true }).rows.forEach(function (r) {
        var f = okDate(r[0]); if (f && r[2] > 0 && r[3] > 0) ctrls.push([f, r[1] == null ? 0 : r[1], r[2], Math.round(r[3]), r[4] || null, r[5] == null ? null : r[5]]);
      });
      ctrls.sort(function (a, b) { return a[0] < b[0] ? -1 : 1; });
    } catch (e) { ctrls = []; }
    // número de productor de SysCaw: identifica al tambo para la activación
    var idProd = [];
    try { if (files[OPCIONALES.tambos]) PX.readTable(files[OPCIONALES.tambos], { fields: ['IdProd'], array: true }).rows.forEach(function (r) { if (r[0] != null && idProd.indexOf(r[0]) < 0) idProd.push(r[0]); }); } catch (e) { idProd = []; }
    return { idProd: idProd, ctrls: ctrls, curvas: curvas, config: config, animales: animales, bajas: bajas, hist: hist, codes: codes, fecha: ref, desdeHist: desdeHist, tambo: info.tambo, conteoCat: c };
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

  var api = { build: build, curvaLact: curvaLact, curvaProy: curvaProy, fromRar: fromRar, unidades: unidades, TABLES: TABLES, infoFromName: infoFromName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SysCaw = api;
})(typeof window !== 'undefined' ? window : this);
