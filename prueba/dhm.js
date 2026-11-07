/* Lector de bases de DHM (Microsoft Access, DHM.mdb), solo para el modo veterinario.
   Usa mdb-reader (mdb-reader.js, se baja junto con este archivo la primera vez) y arma la libreta
   con el mismo formato que el respaldo de SysCaw. Cada establecimiento de DHM es una unidad. */
(function (root) {
  'use strict';
  var GEST = 283;
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  function P(s) { var a = s.split('-').map(Number); return Date.UTC(a[0], a[1] - 1, a[2]); }
  function diffDays(a, b) { return Math.round((P(a) - P(b)) / 864e5); }
  function addDays(s, n) { var d = new Date(P(s) + n * 864e5); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  // mdb-reader devuelve las fechas de Access como Date en UTC
  function fch(x) {
    if (x == null) return null;
    var s = x instanceof Date ? (isNaN(x) ? '' : x.getUTCFullYear() + '-' + pad(x.getUTCMonth() + 1) + '-' + pad(x.getUTCDate())) : String(x).slice(0, 10);
    return s > '1900-01-01' && s < '2100' ? s : null;
  }
  function tx(s) { return s == null ? '' : String(s).replace(/[\s ]+/g, ' ').trim(); }
  // "EL TESON (MFajardo) T1" → "El Teson (MFajardo) T1": solo se pasan a minúscula las palabras que están todas en mayúscula
  function nom(s) { return tx(s).replace(/[A-Za-zÁÉÍÓÚÑÜáéíóúñü]+/g, function (w) { return w.length > 1 && w === w.toUpperCase() ? w.charAt(0) + w.slice(1).toLowerCase() : w; }); }
  function frase(s) { s = tx(s).toLowerCase(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
  var cmp = function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; };
  // 3: vacía deducida. DHM guarda solo las preñeces: en un tacto, la servida que no figura preñada quedó vacía
  var CODES = { 1: ['Preñada', 'Preñada', '2'], 2: ['Vacía', 'Vacía', '1'], 3: ['Vacía (deducida del tacto)', 'Vacía', '1'] };
  // diagnósticos de examen genital que indican vacía (vacía, vacía cicla, anestro, quiste, endometritis, vacía ciclando)
  var DIAG_VACIA = { 2: 1, 3: 1, 4: 1, 6: 1, 7: 1, 8: 1, 9: 1 };

  // ¿es una base de Access (Jet 3/4 o ACE)?
  function es(buf) {
    if (!buf || buf.byteLength < 32) return false;
    var u = new Uint8Array(buf, 4, 15), s = '';
    for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return s === 'Standard Jet DB' || s === 'Standard ACE DB';
  }

  function abrir(buf) {
    var M = root.MDBReader, B = root.Buffer;
    if (!M || !B) throw new Error('No se pudo cargar el lector de DHM.');
    var R = new M(B.from(buf instanceof ArrayBuffer ? buf : buf.buffer ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) : buf));
    var nombres = {}; R.getTableNames().forEach(function (n) { nombres[n] = 1; });
    if (!nombres.DHM_Animales || !nombres.DHM_Establecimientos) throw new Error('La base no tiene las tablas de DHM (DHM_Animales, DHM_Establecimientos).');
    return {
      table: function (n, cols) {
        if (!nombres[n]) return [];
        var t = R.getTable(n), hay = {}; t.getColumnNames().forEach(function (c) { hay[c] = 1; });
        return t.getData({ columns: cols.filter(function (c) { return hay[c]; }) });
      }
    };
  }

  // unidades (establecimientos) con hembras activas
  function unidades(D) {
    var nomE = {}; D.table('DHM_Establecimientos', ['Est_IdEstablecimiento', 'Est_Nombre']).forEach(function (e) { nomE[e.Est_IdEstablecimiento] = nom(e.Est_Nombre); });
    var U = {};
    D.table('DHM_Animales', ['Est_IdEstablecimiento', 'Ani_Sexo', 'Ean_IdEstadoAnimal', 'Tia_IdTipoAnimal', 'Ani_EstadoProductivo']).forEach(function (a) {
      if (a.Ean_IdEstadoAnimal !== 1 || a.Ani_Sexo !== 2) return;
      var id = a.Est_IdEstablecimiento, u = U[id] || (U[id] = { id: id, nombre: nomE[id] || 'Establecimiento ' + id, total: 0, vaca: 0, seca: 0, vaquillona: 0, ternera: 0 });
      u.total++; u[catDe(a, null)]++;
    });
    return Object.keys(U).map(function (k) { return U[k]; }).sort(function (a, b) { return a.id - b.id; });
  }
  function catDe(a, lp) {
    var t = a.Tia_IdTipoAnimal;
    if (t === 1) return a.Ani_EstadoProductivo === 2 ? 'seca' : 'vaca';
    if (t === 2 || t === 3) return 'vaquillona';
    if (t === 4) return 'ternera';
    return lp ? 'vaca' : 'vaquillona';
  }

  // lactancia a partir de los controles (igual que con SIGEA y FOSAPP)
  function lactancia(cs, parto, fin) {
    var pts = cs.map(function (c) { return [diffDays(c[0], parto), c[1]]; }).filter(function (p) { return p[0] > 0 && p[1] > 0; });
    if (!pts.length || pts[0][0] > 75) return null;
    var hasta = function (lim) {
      var s = pts[0][1] * Math.min(pts[0][0], lim), i;
      for (i = 1; i < pts.length && pts[i - 1][0] < lim; i++) {
        var d0 = pts[i - 1][0], d1 = Math.min(pts[i][0], lim), v1 = pts[i][1];
        var vl = pts[i][0] > lim ? pts[i - 1][1] + (v1 - pts[i - 1][1]) * (lim - d0) / (pts[i][0] - d0) : v1;
        s += (pts[i - 1][1] + vl) / 2 * (d1 - d0);
      }
      var u = pts[pts.length - 1];
      if (u[0] < lim && fin != null) s += u[1] * Math.max(0, Math.min(lim, fin) - u[0]) / 2;
      return s;
    };
    var ultD = pts[pts.length - 1][0], total = hasta(fin != null ? Math.max(fin, ultD) : ultD);
    var l305 = ultD >= 290 || (fin != null && fin >= 305) ? hasta(305) : null;
    return { total: Math.round(total), l305: l305 != null ? Math.round(l305) : null, n: pts.length };
  }

  // sel: ids de los establecimientos a cargar (null: todos los que tienen hembras activas)
  function build(D, opts) {
    opts = opts || {};
    var us = opts.unidades || unidades(D), sel = {};
    (opts.sel && opts.sel.length ? opts.sel : us.map(function (u) { return u.id; })).forEach(function (id) { sel[id] = 1; });
    var T = function (n, cols) { return D.table(n, cols); };
    var by = function (rows, k) { var o = {}; rows.forEach(function (r) { o[r[k]] = r; }); return o; };

    var anim = T('DHM_Animales', ['Ani_IdAnimal', 'Est_IdEstablecimiento', 'Ani_RP', 'Ani_Nombre', 'Ani_Apodo', 'Ani_RC', 'Ani_IdElectronico', 'Ani_CaravanaSENASA', 'Ani_Sexo', 'Ani_FechaNacimiento', 'Ani_IdMadre', 'Ani_IdPadre', 'Ani_ApodoPadreX', 'Ani_RPMadreX', 'Ean_IdEstadoAnimal', 'Ani_EstadoProductivo', 'Tia_IdTipoAnimal', 'Lot_IdLote', 'Ani_FechaDescarte', 'Ani_ProduccionVitalicia']);
    var A = {}; anim.forEach(function (a) { A[a.Ani_IdAnimal] = a; });
    // hembras de las unidades elegidas (activas o dadas de baja allí)
    var mio = {}; anim.forEach(function (a) { if (a.Ani_Sexo === 2 && sel[a.Est_IdEstablecimiento]) mio[a.Ani_IdAnimal] = 1; });
    // RP "*" o "0": sin caravana
    var rpDe = function (id) { var a = A[id], r = a ? tx(a.Ani_RP) : ''; return r && !/^[*0.\-]+$/.test(r) ? r : null; };
    var lotes = {}; T('DHM_Lotes', ['Lot_IdLote', 'Lot_Descripcion']).forEach(function (l) { var d = tx(l.Lot_Descripcion); lotes[l.Lot_IdLote] = /^\d+$/.test(d) ? 'Lote ' + d : d; });

    // toros: el mismo toro aparece escrito de varias formas ("Cirrus P", "Cirrus-P"); se unifica por letras y números
    var torN = {}, torF = {};
    var claveToro = function (s) { return tx(s).toUpperCase().replace(/[^A-Z0-9ÑÁÉÍÓÚÜ]/g, ''); };
    var servs = T('DHM_Servicios', ['Ser_IdServicio', 'Ani_IdAnimal', 'Ser_Fecha', 'Ser_IdToro', 'Ser_HBAToro', 'Ser_ApodoToro', 'Ser_IdInseminador', 'Tse_IdTipoServicio', 'Est_IdEstablecimiento']);
    var nomToro = function (s) {
      var t = tx(s.Ser_ApodoToro), b = A[s.Ser_IdToro];
      if (!t || t === '0') t = b ? tx(b.Ani_Apodo) || tx(b.Ani_Nombre) || tx(b.Ani_RP) : '';
      if (!t || t === '0') t = tx(s.Ser_HBAToro) !== '0' ? tx(s.Ser_HBAToro) : '';
      if (!t && s.Tse_IdTipoServicio === 2) t = 'Toro (campo)';
      return t;
    };
    servs.forEach(function (s) { var t = nomToro(s), k = claveToro(t); if (!k) return; s._k = k; var c = torF[k] || (torF[k] = {}); c[t] = (c[t] || 0) + 1; });
    Object.keys(torF).forEach(function (k) { var c = torF[k], best = null; Object.keys(c).forEach(function (t) { if (!best || c[t] > c[best] || (c[t] === c[best] && t.length > best.length)) best = t; }); torN[k] = best; });
    var toroDe = function (s) { return s && s._k ? torN[s._k] : ''; };
    var sById = {}; servs.forEach(function (s) { sById[s.Ser_IdServicio] = s; });
    var pid = function (id) { return A[id] ? (A[id].Ani_Apodo || A[id].Ani_Nombre || A[id].Ani_RP) : null; };

    // historial por hembra
    var G = {}, maxF = '0000';
    var g = function (id) { return G[id] || (G[id] = { pa: [], ev: [], ta: [], la: [], ct: [], ab: [] }); };
    var ver = function (f) { if (f && f > maxF) maxF = f; };
    servs.forEach(function (s) { if (!mio[s.Ani_IdAnimal]) return; var f = fch(s.Ser_Fecha); if (!f) return; ver(f); g(s.Ani_IdAnimal).ev.push([f, 'S', toroDe(s), null, s.Ser_IdServicio, s.Est_IdEstablecimiento]); });
    T('DHM_Celos', ['Ani_IdAnimal', 'Cel_Fecha']).forEach(function (c) { if (!mio[c.Ani_IdAnimal]) return; var f = fch(c.Cel_Fecha); if (!f) return; ver(f); g(c.Ani_IdAnimal).ev.push([f, 'C', '', null]); });

    // partos y lactancias (una lactancia puede empezar con un aborto avanzado)
    var partoLac = {}; T('DHM_Partos', ['Ani_IdAnimal', 'Par_Fecha', 'Par_NroParto', 'Par_SexoCria1', 'Par_SexoCria2', 'Par_SexoCria3', 'Ser_IdServicio', 'Lac_IdLactancia']).forEach(function (p) { if (mio[p.Ani_IdAnimal] && p.Lac_IdLactancia > 0) partoLac[p.Lac_IdLactancia] = p; });
    var secLac = {}; T('DHM_Secados', ['Ani_IdAnimal', 'Sec_Fecha', 'Lac_IdLactancia']).forEach(function (s) { var f = fch(s.Sec_Fecha); if (mio[s.Ani_IdAnimal] && f && s.Lac_IdLactancia > 0) { ver(f); if (!secLac[s.Lac_IdLactancia] || f > secLac[s.Lac_IdLactancia]) secLac[s.Lac_IdLactancia] = f; } });
    var lacs = T('DHM_Lactancias', ['Lac_IdLactancia', 'Lac_TipoLactancia', 'Ani_IdAnimal', 'Lac_FechaInicio', 'Lac_FechaFin', 'Lac_NroSecuencia', 'Lac_CLitros', 'Lac_CLitros305', 'Lac_CKilosGrasa', 'Lac_CProteina', 'Lac_CCLecheros', 'Cil_IdCodILactancia', 'Cfl_IdCodFLactancia', 'Lac_IdUltimaPreniez']);
    var lacAni = {}, lacInfo = {};
    lacs.forEach(function (l) {
      if (!mio[l.Ani_IdAnimal]) return; var f = fch(l.Lac_FechaInicio); if (!f) return;
      var p = partoLac[l.Lac_IdLactancia], sx = [];
      // DHM abre una "lactancia 0" del nacimiento al primer parto: no es una lactancia
      if (!p && (l.Lac_TipoLactancia === 0 || !(l.Lac_NroSecuencia > 0))) return;
      ver(f);
      if (p) [p.Par_SexoCria1, p.Par_SexoCria2, p.Par_SexoCria3].forEach(function (x) { if (x === 2) sx.push('H'); else if (x === 1) sx.push('M'); });
      var res = p ? sx.slice(0, 2).join('/') : l.Cil_IdCodILactancia === 15 ? 'A' : '';
      var sp = p && p.Ser_IdServicio > 0 ? sById[p.Ser_IdServicio] : null;
      var fin = secLac[l.Lac_IdLactancia] || (l.Cfl_IdCodFLactancia === 12 ? fch(l.Lac_FechaFin) : null);
      var nro = (p && p.Par_NroParto > 0 ? p.Par_NroParto : l.Lac_NroSecuencia) || 0;
      // [fecha, lactancia, crías, toro, fecha de concepción, secado, id de lactancia]
      g(l.Ani_IdAnimal).pa.push([f, nro, res, sp ? toroDe(sp) : '', sp ? fch(sp.Ser_Fecha) : null, fin, l.Lac_IdLactancia]);
      if (res === 'A') g(l.Ani_IdAnimal).ab.push(f);
      lacAni[l.Lac_IdLactancia] = l.Ani_IdAnimal; lacInfo[l.Lac_IdLactancia] = l;
    });
    T('DHM_Abortos', ['Ani_IdAnimal', 'Abo_Fecha']).forEach(function (a) { var f = fch(a.Abo_Fecha); if (!mio[a.Ani_IdAnimal] || !f) return; ver(f); var x = g(a.Ani_IdAnimal); if (x.ab.indexOf(f) < 0) x.ab.push(f); });

    // tactos: preñeces registradas y vacías de los exámenes genitales
    var pren = T('DHM_Prenieces', ['Ani_IdAnimal', 'Pre_Fecha', 'Ser_IdServicio', 'Est_IdEstablecimiento']);
    var prenServ = {}, ses = {};
    pren.forEach(function (p) {
      var f = fch(p.Pre_Fecha); if (!f) return;
      if (p.Ser_IdServicio > 0) prenServ[p.Ser_IdServicio] = 1;
      // cada tacto (día y unidad): cuántas preñeces y a cuántos días del servicio se diagnosticaron
      var k = p.Est_IdEstablecimiento + '|' + f, sp = sById[p.Ser_IdServicio], ds = sp && fch(sp.Ser_Fecha) ? diffDays(f, fch(sp.Ser_Fecha)) : null;
      var o = ses[k] || (ses[k] = { n: 0, d: [] }); o.n++; if (ds != null && ds > 0) o.d.push(ds);
      if (!mio[p.Ani_IdAnimal]) return; ver(f); g(p.Ani_IdAnimal).ta.push([f, 1]);
    });
    T('DHM_ExamenesGenitales', ['Ani_IdAnimal', 'Ege_Fecha', 'Dia_IdDiagnosticoOvario', 'Dia_IdDiagnosticoUtero']).forEach(function (e) {
      var f = fch(e.Ege_Fecha); if (!mio[e.Ani_IdAnimal] || !f) return;
      if (DIAG_VACIA[e.Dia_IdDiagnosticoOvario] || DIAG_VACIA[e.Dia_IdDiagnosticoUtero]) { ver(f); g(e.Ani_IdAnimal).ta.push([f, 2]); }
    });
    // bajas
    var desc = {}; T('DHM_Descartes', ['Ani_IdAnimal', 'Des_Fecha', 'Tde_IdTipoDescarte', 'Mde_IdMotivoDescarte', 'Des_Observaciones', 'Est_IdEstablecimiento']).forEach(function (d) { var f = fch(d.Des_Fecha), x = desc[d.Ani_IdAnimal]; if (!x || (f || '') >= (x.f || '')) desc[d.Ani_IdAnimal] = { f: f, t: d.Tde_IdTipoDescarte, m: d.Mde_IdMotivoDescarte, o: d.Des_Observaciones, u: d.Est_IdEstablecimiento }; });
    var motivo = {}; T('DHM_MotivosDescarte', ['Mde_IdMotivoDescarte', 'Mde_Descripcion']).forEach(function (m) { motivo[m.Mde_IdMotivoDescarte] = frase(m.Mde_Descripcion); });

    // vacías deducidas: en un tacto (10 preñeces o más en el día y la unidad), la vaca servida en esa unidad con tiempo para
    // diagnosticarla (al menos los días de la preñez más temprana que se vio ese día, y no menos de 28) y hasta 150 días antes,
    // sin preñez de ese servicio (ni ese día ni después), sin parto ni baja entre el servicio y el tacto, quedó vacía
    var sesL = Object.keys(ses).filter(function (k) { return ses[k].n >= 10; }).map(function (k) {
      var p = k.split('|'), d = ses[k].d.sort(function (a, b) { return a - b; }), min = d.length ? d[Math.floor(d.length * 0.05)] : 35;
      return { u: +p[0], f: p[1], min: Math.max(28, min) };
    });
    var nDed = 0;
    Object.keys(G).forEach(function (id) {
      var x = G[id], sv = x.ev.filter(function (e) { return e[1] === 'S'; }).sort(cmp), b = desc[id];
      sesL.forEach(function (S) {
        var ult = null; sv.forEach(function (e) { if (e[0] < S.f) ult = e; });
        if (!ult || ult[5] !== S.u) return;
        var dd = diffDays(S.f, ult[0]); if (dd < S.min || dd > 150) return;
        if (prenServ[ult[4]]) return;
        if (x.ta.some(function (t) { return t[0] > ult[0] && t[0] <= S.f; })) return;
        if (x.pa.some(function (p) { return p[0] > ult[0] && p[0] <= S.f; }) || x.ab.some(function (f) { return f > ult[0] && f <= S.f; })) return;
        if (A[id].Ean_IdEstadoAnimal !== 1 && b && b.f && b.f <= S.f) return;
        x.ta.push([S.f, 3]); nDed++;
      });
    });

    // controles lecheros
    var porF = {};
    T('DHM_ControlLechero', ['Ani_IdAnimal', 'Cle_Fecha', 'Cle_KilosOrdenie1', 'Cle_KilosOrdenie2', 'Cle_KilosOrdenie3', 'Cle_PorcentajeGrasa', 'Cle_Proteina', 'Lac_IdLactancia', 'Est_IdEstablecimiento']).forEach(function (c) {
      var u = c.Est_IdEstablecimiento; if (!sel[u]) return;
      var f = fch(c.Cle_Fecha), lt = (c.Cle_KilosOrdenie1 > 0 ? c.Cle_KilosOrdenie1 : 0) + (c.Cle_KilosOrdenie2 > 0 ? c.Cle_KilosOrdenie2 : 0) + (c.Cle_KilosOrdenie3 > 0 ? c.Cle_KilosOrdenie3 : 0);
      if (!f || !(lt > 0)) return; ver(f);
      var k = f + '|' + u, y = porF[k] || (porF[k] = { f: f, u: u, v: 0, l: 0, d: 0, nd: 0 }); y.v++; y.l += lt;
      var li = lacInfo[c.Lac_IdLactancia]; if (li) { var fi = fch(li.Lac_FechaInicio); if (fi && fi < f) { y.d += diffDays(f, fi); y.nd++; } }
      if (mio[c.Ani_IdAnimal]) g(c.Ani_IdAnimal).ct.push([f, Math.round(lt * 10) / 10, c.Cle_PorcentajeGrasa > 0 ? c.Cle_PorcentajeGrasa : null, c.Cle_Proteina > 0 ? c.Cle_Proteina : null, null]);
    });
    var ctrls = Object.keys(porF).map(function (k) { return porF[k]; }).filter(function (y) { return y.v >= 5; }).sort(function (a, b) { return a.f < b.f ? -1 : a.f > b.f ? 1 : a.u - b.u; })
      .map(function (y) { return [y.f, y.u, y.v, Math.round(y.l), y.nd ? Math.round(y.d / y.nd) : null, null]; });

    // pases entre unidades (últimos 3 años)
    var mvBy = {}; T('DHM_MovimientosAnimales', ['Ani_IdAnimal', 'Man_Fecha', 'Man_EstablecimientoOrigen', 'Man_EstablecimientoDestino']).forEach(function (m) { var f = fch(m.Man_Fecha); if (!mio[m.Ani_IdAnimal] || !f || f < '2023-01-01' || !(m.Man_EstablecimientoDestino > 0)) return; (mvBy[m.Ani_IdAnimal] = mvBy[m.Ani_IdAnimal] || []).push([f, m.Man_EstablecimientoDestino, m.Man_EstablecimientoOrigen > 0 ? m.Man_EstablecimientoOrigen : null]); });
    Object.keys(mvBy).forEach(function (k) { mvBy[k].sort(cmp); });

    var ref = maxF, desdeHist = addDays(ref, -730);
    // hembras que siguen activas en DHM pero no tienen ningún registro en 2 años (nunca se les dio la baja): no van a la libreta
    var ultAct = {}, act = function (id, f) { f = fch(f); if (f && (!ultAct[id] || f > ultAct[id])) ultAct[id] = f; };
    // (las vacías deducidas no cuentan: no son un registro de DHM)
    Object.keys(G).forEach(function (id) { var x = G[id]; [x.pa, x.ev, x.ta, x.ct].forEach(function (L) { L.forEach(function (e) { if (L === x.ta && e[1] === 3) return; if (!ultAct[id] || e[0] > ultAct[id]) ultAct[id] = e[0]; }); }); });
    T('DHM_CambioLote', ['Ani_IdAnimal', 'Cal_Fecha']).forEach(function (c) { if (mio[c.Ani_IdAnimal]) act(c.Ani_IdAnimal, c.Cal_Fecha); });
    T('DHM_MovimientosAnimales', ['Ani_IdAnimal', 'Man_Fecha']).forEach(function (c) { if (mio[c.Ani_IdAnimal]) act(c.Ani_IdAnimal, c.Man_Fecha); });
    T('DHM_EvSanitarios', ['Ani_IdAnimal', 'Evs_Fecha']).forEach(function (c) { if (mio[c.Ani_IdAnimal]) act(c.Ani_IdAnimal, c.Evs_Fecha); });
    var hace3 = addDays(ref, -1096), fantasmas = [];
    anim.forEach(function (a) {
      var id = a.Ani_IdAnimal; if (!mio[id] || a.Ean_IdEstadoAnimal !== 1) return;
      var fn = fch(a.Ani_FechaNacimiento);
      if ((!fn || fn < hace3) && (ultAct[id] || '0000') < desdeHist) { delete mio[id]; fantasmas.push({ rp: tx(a.Ani_RP), u: a.Est_IdEstablecimiento, fn: fn, ult: ultAct[id] || null }); }
    });
    Object.keys(G).forEach(function (id) {
      var x = G[id]; x.pa.sort(cmp); x.ev.sort(cmp); x.ta.sort(cmp); x.ct.sort(cmp); x.ab.sort();
      x.pa.forEach(function (p, i) { if (!p[1]) p[1] = i ? x.pa[i - 1][1] + 1 : 1; });
      x.pa.forEach(function (p, i) {
        var np = x.pa[i + 1], hastaF = np ? np[0] : '9999';
        // concepción de este parto: el servicio que DHM le asigna o, si falta, el servicio más cercano a 283 días antes
        if (!p[4]) { var pp = x.pa[i - 1], est = addDays(p[0], -GEST), best = null; x.ev.forEach(function (e) { if (e[1] !== 'S' || e[0] >= p[0] || (pp && e[0] <= pp[0])) return; var d = Math.abs(diffDays(e[0], est)); if (d <= 20 && (!best || d < best[1])) best = [e[0], d]; }); p[4] = best ? best[0] : null; }
        var li = lacInfo[p[6]], fin = p[5] ? diffDays(p[5], p[0]) : np ? diffDays(np[0], p[0]) - 60 : null;
        var cs = x.ct.filter(function (c) { return c[0] > p[0] && c[0] < hastaF; });
        var L = lactancia(cs, p[0], fin != null && fin > 0 ? fin : null);
        // lactancia cerrada en DHM: los totales que calculó el programa
        var cerr = li && (p[5] || np) && li.Lac_CLitros > 0;
        var tot = cerr ? Math.round(li.Lac_CLitros) : L ? L.total : null;
        var l3 = cerr && li.Lac_CLitros305 > 0 ? Math.round(li.Lac_CLitros305) : L ? L.l305 : null;
        if (tot) x.la.push([p[1], tot, l3, cerr && li.Lac_CKilosGrasa > 0 ? Math.round(li.Lac_CKilosGrasa / li.Lac_CLitros * 1e4) / 100 : null, cerr && li.Lac_CProteina > 0 ? Math.round(li.Lac_CProteina / li.Lac_CLitros * 1e4) / 100 : null, cerr && li.Lac_CCLecheros > 0 ? li.Lac_CCLecheros : L ? L.n : cs.length]);
      });
      x.pa.forEach(function (p) { p.length = 6; });
      x.ev.forEach(function (e) { e.length = 4; });
      var n = x.pa.length, desde = n > 1 ? x.pa[n - 2][0] : n ? x.pa[0][0] : null;
      x.ct = desde ? x.ct.filter(function (c) { return c[0] >= desde; }) : [];
    });

    var animales = [], hist = {}, bajas = [], vacio = { pa: [], ev: [], ta: [], la: [], ct: [], ab: [] }, usados = {};
    // caravana única: si hembras de distintas unidades comparten el RP, se agrega la unidad
    var uDeRp = {}; anim.forEach(function (a) { if (mio[a.Ani_IdAnimal] && a.Ean_IdEstadoAnimal === 1) { var r = rpDe(a.Ani_IdAnimal); if (r) (uDeRp[r] = uDeRp[r] || {})[a.Est_IdEstablecimiento] = 1; } });
    var corto = {}; us.forEach(function (u) { var m = /\b(T\d+)\s*$/i.exec(u.nombre); corto[u.id] = m ? m[1].toUpperCase() : 'U' + u.id; });
    anim.forEach(function (a) {
      var id = a.Ani_IdAnimal; if (!mio[id]) return;
      var x = G[id] || vacio, fn = fch(a.Ani_FechaNacimiento);
      var rp = rpDe(id) || tx(a.Ani_CaravanaSENASA) || tx(a.Ani_RC) || tx(a.Ani_IdElectronico) || ('ID ' + id);
      var lp = x.pa.length ? x.pa[x.pa.length - 1] : null, lpf = lp ? lp[0] : '0000';
      var ma = a.Ani_IdMadre > 0 ? rpDe(a.Ani_IdMadre) : tx(a.Ani_RPMadreX) || null, pd = a.Ani_IdPadre > 0 ? (tx(pid(a.Ani_IdPadre)) || null) : tx(a.Ani_ApodoPadreX) || null;
      if (a.Ean_IdEstadoAnimal !== 1) {
        // bajas: solo las de los últimos 2 años
        var b = desc[id] || {}, bF = b.f || fch(a.Ani_FechaDescarte); if (!bF || bF < desdeHist) return;
        var tipo = b.t === 1 ? 'venta' : b.t === 2 ? 'muerte' : b.t === 3 ? 'transferencia' : 'baja';
        var causa = motivo[b.m] || null;
        var key = 'd' + id, cat = x.pa.length ? 'vaca' : 'vaquillona';
        bajas.push({ key: key, rp: rp, nombre: tx(a.Ani_Nombre) || null, cat: cat, u: a.Est_IdEstablecimiento, dFecha: null, bFecha: bF, bTipo: tipo, bCausa: causa && !/sin dato|desconoc|otro/i.test(causa) ? causa : null });
        if (bF >= desdeHist) {
          var paB = x.pa.filter(function (p) { return p[0] >= desdeHist; }); if (!paB.length && x.pa.length) paB = [x.pa[x.pa.length - 1]];
          var dB = paB.length ? paB[0][0] : '0000', dE = function (e) { return e[0] >= dB; }, nros = paB.map(function (p) { return p[1]; });
          hist[key] = { mv: mvBy[id] || null, pa: paB, ev: x.ev.filter(dE), ta: x.ta.filter(dE), la: x.la.filter(function (l) { return nros.indexOf(l[0]) >= 0; }), ct: x.ct.filter(dE), ab: x.ab.filter(function (f) { return f >= dB; }), ult: true, fn: fn, ma: ma, pd: pd, vit: a.Ani_ProduccionVitalicia > 0 ? Math.round(a.Ani_ProduccionVitalicia) : null };
        } else hist[key] = { pa: [], ev: [], ta: [], la: [], ct: [], fn: fn, ma: ma, pd: pd, vit: null, corto: true };
        return;
      }
      // caravana repetida: se agrega la unidad (si están en unidades distintas) y, si hace falta, la fecha de nacimiento
      if (uDeRp[rp] && Object.keys(uDeRp[rp]).length > 1) rp = rp + ' ' + corto[a.Est_IdEstablecimiento];
      if (usados[rp] && fn) rp = rp + ' (nac. ' + fn.slice(8, 10) + '/' + fn.slice(5, 7) + '/' + fn.slice(2, 4) + ')';
      var rp0 = rp, k2 = 2; while (usados[rp]) rp = rp0 + ' #' + k2++; usados[rp] = 1;
      var cat = catDe(a, lp);
      if (!lp && (cat === 'vaca' || cat === 'seca')) cat = 'vaquillona';
      var evs = x.ev.filter(function (e) { return e[0] > lpf; }), sv = evs.filter(function (e) { return e[1] === 'S'; });
      var le = evs.length ? evs[evs.length - 1] : null;
      var tas = x.ta.filter(function (t) { return t[0] >= lpf; }), lt = tas.length ? tas[tas.length - 1] : null;
      var cd = lt ? CODES[lt[1]] : null, res = cd ? cd[1] : null, preg = !!(cd && cd[2] === '2'), conc = null;
      if (preg) { var s2 = sv.filter(function (e) { return e[0] <= lt[0]; }); conc = s2.length ? s2[s2.length - 1][0] : null; }
      var estado = preg ? 'prenada' : res ? 'vacia' : 'sin';
      if (estado !== 'prenada' && le && le[1] === 'S' && (!lt || le[0] > lt[0])) estado = 'servida';
      var curLac = null; x.la.forEach(function (l) { if (lp && l[0] === lp[1]) curLac = l; });
      var mejs = x.la.map(function (l) { return l[2] || l[1]; }).filter(Boolean);
      var pr = lp ? x.ct.filter(function (cc) { return cc[0] >= lpf; }).map(function (cc) { return cc[1]; }).reverse().slice(0, 10) : [];
      animales.push({
        rp: rp, nombre: tx(a.Ani_Nombre) || null, cat: cat, edad: fn ? Math.round(diffDays(ref, fn) / 365.25 * 10) / 10 : null,
        rod: lotes[a.Lot_IdLote] || null, idElec: tx(a.Ani_IdElectronico) || tx(a.Ani_CaravanaSENASA) || null,
        pFecha: lp ? lp[0] : null, pN: lp ? lp[1] : null, r1: lp ? (lp[2].split('/')[0] || null) : null, r2: lp ? (lp[2].split('/')[1] || null) : null,
        sFecha: le ? le[0] : null, sN: le ? sv.length : null, toro: le ? (le[1] === 'C' ? 'Celo' : (le[2] || null)) : null,
        tFecha: lt ? lt[0] : null, result: res, partoProb: conc ? addDays(conc, GEST) : null, estado: estado,
        u: a.Est_IdEstablecimiento, dFecha: null, rech: null, rechDet: null, pr: pr, celo: estado === 'prenada' && !!le && le[1] === 'C',
        dLac: lp && (cat === 'vaca' || cat === 'seca') ? diffDays(ref, lp[0]) : null,
        prodLts: curLac ? curLac[1] : null, mej: mejs.length ? Math.max.apply(null, mejs) : null
      });
      hist[rp] = { mv: mvBy[id] || null, ec: null, pa: x.pa, ev: x.ev, ta: x.ta, la: x.la, ct: x.ct, ab: x.ab, fn: fn, ma: ma, pd: pd, vit: a.Ani_ProduccionVitalicia > 0 ? Math.round(a.Ani_ProduccionVitalicia) : null };
    });
    animales.sort(function (p, q) { return p.rp.localeCompare(q.rp, 'es', { numeric: true }); });
    bajas.sort(function (p, q) { return (q.bFecha || '') < (p.bFecha || '') ? -1 : 1; });
    var cc = {}; animales.forEach(function (x) { cc[x.cat] = (cc[x.cat] || 0) + 1; });
    var elegidas = us.filter(function (u) { return sel[u.id]; });
    // nombre del tambo: el de la unidad, o la parte común de los nombres ("El Teson (MFajardo) T1" y "… T2" → "El Teson (MFajardo)")
    var tambo = elegidas.length === 1 ? elegidas[0].nombre : (function () { var ns = elegidas.map(function (u) { return u.nombre; }), p = ns[0] || ''; ns.forEach(function (n) { while (p && n.indexOf(p) !== 0) p = p.slice(0, -1); }); return p.replace(/[\s\-·,]+(T|U)?$/i, '').trim() || null; })();
    return { idProd: [], ctrls: ctrls, config: {}, animales: animales, bajas: bajas, hist: hist, codes: CODES, fecha: ref, desdeHist: desdeHist, tambo: tambo, conteoCat: cc, origen: 'dhm', unidades: elegidas, deducidas: nDed, fantasmas: fantasmas };
  }

  // opts.elegir(unidades) -> Promise<[ids]>: se llama si la base trae más de un establecimiento con hembras activas.
  // Los conteos de cada unidad son los de la libreta ya limpia (sin las hembras que quedaron activas en DHM sin registros).
  function fromFile(buf, nombre, opts) {
    opts = opts || {};
    return Promise.resolve().then(function () {
      if (!es(buf)) throw new Error('El archivo no parece una base de DHM.');
      var D = abrir(buf), us = unidades(D);
      if (!us.length) throw new Error('La base de DHM no tiene hembras activas.');
      var todo = build(D, { unidades: us, nombreArchivo: nombre });
      us.forEach(function (u) { ['total', 'vaca', 'seca', 'vaquillona', 'ternera'].forEach(function (k) { u[k] = 0; }); });
      var porId = {}; us.forEach(function (u) { porId[u.id] = u; });
      todo.animales.forEach(function (x) { var u = porId[x.u]; if (u) { u.total++; u[x.cat] = (u[x.cat] || 0) + 1; } });
      us = us.filter(function (u) { return u.total > 0; });
      return (us.length > 1 && opts.elegir ? Promise.resolve(opts.elegir(us)) : Promise.resolve(null)).then(function (ids) {
        if (us.length > 1 && opts.elegir && (!ids || !ids.length)) { var e = new Error('Carga cancelada.'); e.cancelado = true; throw e; }
        var d = !ids || ids.length === us.length ? todo : build(D, { unidades: us, sel: ids, nombreArchivo: nombre });
        // solo se guardan las unidades elegidas; si son varias, la app deja pasar de una a otra
        d.sel = null; d.unidadesSel = d.unidades.map(function (u) { return u.nombre; });
        return d;
      });
    });
  }
  // DHM.rar: se extrae el .mdb con el mismo lector de .rar de los respaldos de SysCaw
  function mdbDeRar(buf, opts) {
    return opts.unrar.createExtractorFromData({ data: buf, wasmBinary: opts.wasmBinary }).then(function (ex) {
      var l = ex.extract({ files: function (h) { return /\.(mdb|accdb)$/i.test(h.name); } });
      for (var f of l.files) if (f.extraction) return f.extraction.buffer.slice(f.extraction.byteOffset, f.extraction.byteOffset + f.extraction.byteLength);
      throw new Error('El .rar no trae una base de DHM (.mdb).');
    });
  }

  var api = { fromFile: fromFile, build: build, es: es, abrir: abrir, unidades: unidades, mdbDeRar: mdbDeRar, CODES: CODES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Dhm = api;
})(typeof window !== 'undefined' ? window : this);
