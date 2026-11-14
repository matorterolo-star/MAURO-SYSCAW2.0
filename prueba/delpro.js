/* Lector de DelPro (DeLaval), solo para el modo veterinario.
   Lee el .zip con las tablas de DelPro exportadas a CSV (una por archivo, con _info.txt) y arma la libreta con el mismo
   formato que el respaldo de SysCaw. Del .zip se descomprimen solo las tablas que hacen falta (el resto puede pesar cientos de MB).
   La leche sale de la producción diaria de cada vaca (medidores de DelPro): se resume por semana. */
(function (root) {
  'use strict';
  var GEST = 283;
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  function P(s) { var a = s.split('-').map(Number); return Date.UTC(a[0], a[1] - 1, a[2]); }
  function diffDays(a, b) { return Math.round((P(a) - P(b)) / 864e5); }
  function addDays(s, n) { var d = new Date(P(s) + n * 864e5); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function fch(s) { s = s == null ? '' : String(s).slice(0, 10); return /^\d{4}-\d\d-\d\d$/.test(s) && s > '1900-01-01' && s < '2100' ? s : null; }
  function tx(s) { return s == null ? '' : String(s).replace(/[\s ]+/g, ' ').trim(); }
  var cmp = function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; };
  var CODES = { 1: ['Preñada', 'Preñada', '2'], 2: ['Vacía', 'Vacía', '1'] };
  // motivos de baja y de descarte de DelPro (vienen en inglés)
  // (se compara sin mayúsculas: según la versión de DelPro viene 'Bad Udder' o 'Bad udder'; los motivos propios del tambo, en castellano, pasan tal cual)
  var MOTIVO = { 'Death': 'Muerte', 'Mastitis': 'Mastitis', 'Milk Fever': 'Hipocalcemia', 'Other Disease': 'Otra enfermedad', 'General Injury': 'Lesión', 'Hoof/Limb Problems': 'Patas y pezuñas', 'Fertility Problems': 'Problemas reproductivos', 'Livestock - Breeding': 'Venta para cría', 'Old Age': 'Edad', 'Livestock - Fattening': 'Venta para engorde', 'Livestock - Slaughter': 'Faena', 'Low Yield Performance': 'Baja producción', 'Milking Problems': 'Problemas de ordeñe', 'Mentality': 'Temperamento', 'Teat Injury': 'Lesión de pezón', 'Aborted': 'Aborto', 'Bad Udder': 'Ubre mala', 'Other': null, '(Other)': null, '(-)': null, 'None': null, 'Andet (other)': null, 'Milk fever': 'Hipocalcemia', 'Clinical mastitis': 'Mastitis', 'Fracture': 'Fractura', 'Downer cow': 'Vaca caída', 'Injury/Trauma': 'Lesión', 'Wounds and injuries': 'Lesión', 'Lameness from other causes': 'Patas y pezuñas', 'Hoof damage': 'Patas y pezuñas', 'Feet and legs': 'Patas y pezuñas', 'Leukemia': 'Leucosis', 'Metabolic disease': 'Enfermedad metabólica', 'Infectious disease': 'Enfermedad infecciosa', 'Retained placenta': 'Retención de placenta', 'Dystocia': 'Distocia', 'Uterus prolapse': 'Prolapso de útero', 'Various tumors': 'Tumores', 'Excdente de Recría': 'Excedente de recría', 'Excedente de Recría': 'Excedente de recría' };
  var MOT = {}; Object.keys(MOTIVO).forEach(function (k) { MOT[k.toLowerCase()] = MOTIVO[k]; });
  function motivo(m) { m = tx(m); if (!m) return null; var k = m.toLowerCase(); if (k in MOT) return MOT[k]; return /^[a-z]/.test(m) && /\b(problems?|disease|injury|udder)\b/i.test(m) ? null : m; }
  // salida tipo 8 (ni venta ni muerte en DelPro): con motivo de muerte, golpe o patas, o comentario de sacrificio, es muerte en el campo;
  // con otro motivo (consumo, leucosis, reproductivos, ubre...) es descarte; sin evento de salida, transferencia (p. ej. recría sacada de DelPro)
  var MUERTE8 = /^(death|meteorismo|general injury|hoof\/limb problems|injury\/trauma|fracture|downer cow|wounds and injuries)$/i;
  var SACRIF = /sacrific|muri[oó]|muert|desbolill|ca[ií]da|quebrad/i;
  var VENDE = /frigor|vendid|venta|descarte|remate|feria/i, CONSUMO = /consumo/i;
  var TABLAS = ['_info.txt', 'BasicAnimal', 'AbstractAnimalEvent', 'XPObjectType', 'EventCalving', 'EventInsemination', 'EventPregCheck', 'EventExit', 'EventCullDecision', 'EventAbortion', 'Semen', 'User', 'PermissionPolicyUser', 'TextLookupItem', 'AbstractGroup', 'AnimalLactationSummary', 'HistoryAnimalDailyData', 'AnimalFarm', 'PedigreeInfo'];

  /* ---------- zip: se leen solo los archivos pedidos ---------- */
  function u16(u, i) { return u[i] | (u[i + 1] << 8); }
  function u32(u, i) { return (u[i] | (u[i + 1] << 8) | (u[i + 2] << 16) | (u[i + 3] << 24)) >>> 0; }
  function esZip(buf) { var u = new Uint8Array(buf, 0, 4); return u[0] === 0x50 && u[1] === 0x4b && u[2] === 0x03 && u[3] === 0x04; }
  function listaZip(buf) {
    var u = new Uint8Array(buf), e = -1;
    for (var i = u.length - 22; i >= Math.max(0, u.length - 65557); i--) if (u32(u, i) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('El .zip está dañado.');
    var n = u16(u, e + 10), p = u32(u, e + 16), L = {};
    for (var k = 0; k < n; k++) {
      if (u32(u, p) !== 0x02014b50) break;
      var met = u16(u, p + 10), cs = u32(u, p + 20), ln = u16(u, p + 28), lx = u16(u, p + 30), lc = u16(u, p + 32), off = u32(u, p + 42);
      var nm = new TextDecoder().decode(u.subarray(p + 46, p + 46 + ln)).replace(/^.*\//, '');
      L[nm] = { met: met, cs: cs, off: off };
      p += 46 + ln + lx + lc;
    }
    return L;
  }
  function leerZip(buf, x) {
    var u = new Uint8Array(buf), o = x.off, ini = o + 30 + u16(u, o + 26) + u16(u, o + 28), datos = u.subarray(ini, ini + x.cs);
    if (x.met === 0) return Promise.resolve(new TextDecoder().decode(datos));
    if (x.met !== 8) return Promise.reject(new Error('Compresión del .zip no soportada.'));
    if (!root.DecompressionStream) return Promise.reject(new Error('Este navegador no puede abrir el .zip. Usá Chrome.'));
    return new Response(new Blob([datos]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer().then(function (b) { return new TextDecoder().decode(b); });
  }
  /* ---------- CSV (con comillas) ---------- */
  function csv(t) {
    if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
    var R = [], f = [], c = '', q = false, i = 0, n = t.length, ch;
    for (; i < n; i++) {
      ch = t[i];
      if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; continue; }
      if (ch === '"') q = true;
      else if (ch === ',') { f.push(c); c = ''; }
      else if (ch === '\n') { f.push(c.replace(/\r$/, '')); R.push(f); f = []; c = ''; }
      else c += ch;
    }
    if (c || f.length) { f.push(c); R.push(f); }
    var h = R.shift() || [], o = {}; h.forEach(function (k, j) { o[k] = j; });
    return { h: o, r: R, c: function (row, k) { var j = o[k]; return j == null ? '' : row[j] == null ? '' : row[j]; } };
  }

  function es(buf, nombre) {
    if (!buf || buf.byteLength < 30 || !esZip(buf)) return false;
    try { var L = listaZip(buf); return !!(L['BasicAnimal.csv'] && L['AbstractAnimalEvent.csv'] && L['_info.txt']); } catch (e) { return false; }
  }

  function leer(buf) {
    var L = listaZip(buf), T = {}, nombres = TABLAS.map(function (t) { return /\./.test(t) ? t : t + '.csv'; });
    if (!L['BasicAnimal.csv'] || !L['AbstractAnimalEvent.csv']) throw new Error('El .zip no trae las tablas de DelPro (BasicAnimal, AbstractAnimalEvent).');
    // de a una, para no tener todo descomprimido a la vez
    var p = Promise.resolve();
    nombres.forEach(function (nm) {
      p = p.then(function () { if (!L[nm]) return; return leerZip(buf, L[nm]).then(function (t) { T[nm.replace(/\.csv$/, '')] = nm === '_info.txt' ? t : csv(t); }); });
    });
    return p.then(function () { return T; });
  }

  function build(T) {
    var V = function (tab, fn) { var t = T[tab]; if (!t) return; t.r.forEach(function (row) { fn(function (k) { return t.c(row, k); }); }); };
    var info = {}; String(T['_info.txt'] || '').split(/\r?\n/).forEach(function (l) { var i = l.indexOf('='); if (i > 0) info[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });
    var tipo = {}; V('XPObjectType', function (g) { tipo[g('OID')] = g('TypeName').split('.').pop(); });
    var look = {}; V('TextLookupItem', function (g) { look[g('OID')] = g('ItemValue'); });
    var grupo = {}; V('AbstractGroup', function (g) { grupo[g('OID')] = tx(g('Name')); });
    var usu = {}; V('PermissionPolicyUser', function (g) { usu[g('Oid')] = tx(g('UserName')); });
    var ins = {}; V('User', function (g) { var n = tx(g('UserFullName')) || usu[g('PermissionPolicyUser')] || ''; if (/^(unknownbreeder|admin|delaval|user\d*|tambo|farmowner)$/i.test(n)) n = ''; ins[g('Oid')] = n; });
    var semen = {}; V('Semen', function (g) { var n = tx(g('SemenName')) || tx(g('BullID')); if (/^(unknownsemen|estimado)$/i.test(n)) n = ''; semen[g('OID')] = n; });
    var A = {}; V('BasicAnimal', function (g) { A[g('OID')] = { id: g('OID'), num: tx(g('Number')), reg: tx(g('OfficialRegNo')), nom: tx(g('Name')), bull: tx(g('BullID')), type: +g('Type'), sex: +g('Sex'), fn: fch(g('BirthDate')), exit: fch(g('ExitDate')), exitT: +g('ExitType'), grp: g('Group'), tag: tx(g('TransponderID')), cull: g('ToBeCulled') === '1', ped: g('PedigreeInfo'), obj: tipo[g('ObjectType')] }; });
    var ped = {}; V('PedigreeInfo', function (g) { ped[g('OID')] = { ma: g('MotherId'), pa: g('FatherId') }; });
    // eventos: tabla general (fecha, animal, lactancia) + tabla de detalle de cada tipo, unidas por OID
    var E = {}, maxF = '0000';
    V('AbstractAnimalEvent', function (g) { var f = fch(g('DateAndTime')); if (!f) return; E[g('OID')] = { f: f, a: g('BasicAnimal'), t: tipo[g('ObjectType')] || '', ln: +g('LactationNumber') || 0, c: g('Comment') || '' }; });
    var hembra = function (id) { var a = A[id]; return a && a.sex === 2 && a.obj !== 'Bull'; };
    var G = {}, g = function (id) { return G[id] || (G[id] = { pa: [], ev: [], ta: [], la: [], ct: [], ab: [], sec: [], dia: [] }); };
    var visto = {}, unico = function (k) { if (visto[k]) return false; visto[k] = 1; return true; };
    var ver = function (f) { if (f > maxF) maxF = f; };
    var insem = {};
    V('EventInsemination', function (r) {
      var e = E[r('OID')]; if (!e || !hembra(e.a)) return; ver(e.f);
      var s = { f: e.f, toro: semen[r('Semen')] || '', ins: ins[r('Breeder')] || null }; insem[r('OID')] = s;
      if (unico('S' + e.a + e.f)) g(e.a).ev.push([e.f, 'S', s.toro, s.ins]);
    });
    Object.keys(E).forEach(function (o) { var e = E[o]; if (!hembra(e.a)) return;
      if (e.t === 'EventHeat') { ver(e.f); (g(e.a).celos = g(e.a).celos || []).push(e.f); }
      else if (e.t === 'EventDryOff') { ver(e.f); g(e.a).sec.push(e.f); }
    });
    // DelPro anota un celo con cada inseminación: solo cuentan los celos sin servicio ese día
    Object.keys(G).forEach(function (id) { var x = G[id], sv = {}; x.ev.forEach(function (e) { sv[e[0]] = 1; }); (x.celos || []).forEach(function (f) { if (!sv[f] && unico('C' + id + f)) x.ev.push([f, 'C', '', null]); }); delete x.celos; });
    V('EventPregCheck', function (r) { var e = E[r('OID')]; if (!e || !hembra(e.a) || !unico('T' + e.a + e.f)) return; ver(e.f); g(e.a).ta.push([e.f, r('Result') === '1' ? 1 : 2]); });
    V('EventAbortion', function (r) { var e = E[r('OID')]; if (!e || !hembra(e.a)) return; ver(e.f); g(e.a).ab.push(e.f); });
    V('EventCalving', function (r) {
      var e = E[r('OID')]; if (!e || !hembra(e.a) || !unico('P' + e.a + e.f)) return; ver(e.f);
      var sx = []; ['Calf1', 'Calf2', 'Calf3'].forEach(function (k) { var c = A[r(k)]; if (c) sx.push(c.sex === 2 ? 'H' : 'M'); });
      var s = insem[r('EventInsemination')];
      // [fecha, lactación, crías, toro, fecha de concepción, secado]
      g(e.a).pa.push([e.f, e.ln || 0, sx.slice(0, 2).join('/'), s ? s.toro : '', s ? s.f : null, null]);
    });
    // lactancia en curso sin parto registrado (ganado importado a DelPro): se toma el inicio de lactancia
    V('AnimalLactationSummary', function (r) {
      var id = r('Animal'), f = fch(r('StartDate')), n = +r('LactationNumber') || 0; if (!f || !n || !hembra(id)) return;
      var x = g(id); if (x.pa.some(function (p) { return p[1] === n || Math.abs(diffDays(p[0], f)) <= 45; })) return;
      x.pa.push([f, n, '', '', null, null]);
    });
    var cull = {}; V('EventCullDecision', function (r) { var e = E[r('OID')]; if (!e) return; cull[e.a] = { f: e.f, m: motivo(look[r('CullReason1')]) || motivo(look[r('CullReason2')]) }; });
    var salida = {}; V('EventExit', function (r) { var e = E[r('OID')]; if (!e) return; var r1 = tx(look[r('ExitReason')]), t = +r('ExitType');
      // el comentario manda cuando contradice al tipo (p. ej. descartes a frigorífico cargados como muerte)
      if (VENDE.test(e.c) || CONSUMO.test(e.c) || /^consumo$/i.test(r1)) t = 6;
      else if (t === 8) t = MUERTE8.test(r1) || SACRIF.test(e.c) ? 7 : 6;
      var m = CONSUMO.test(e.c) || /^consumo$/i.test(r1) ? 'Consumo' : motivo(r1); if (m === 'Muerte' || !m) m = motivo(look[r('ExitReason2')]) || (m === 'Muerte' ? null : m);
      if (t === 7 && /^Venta |^Faena$/.test(m || '')) m = null; // motivo de venta en una muerte: no informa la causa
      salida[e.a] = { f: e.f, t: t, m: m }; });

    // producción diaria (medidores): por vaca y por semana (semanas que terminan en la fecha del respaldo)
    var dia = {}, maxD = '0000';
    V('HistoryAnimalDailyData', function (r) { var y = +r('DailyYield'); var f = fch(r('DayDate')); if (!f || !(y > 0) || !hembra(r('BasicAnimal'))) return; if (f > maxD) maxD = f; (dia[r('BasicAnimal')] = dia[r('BasicAnimal')] || []).push([f, y, +r('DIM') || 0]); });
    if (maxD > maxF) maxF = maxD;
    var ref = maxF, desdeHist = addDays(ref, -730), semana = function (f) { return addDays(ref, -7 * Math.floor(diffDays(ref, f) / 7)); };
    var porS = {};
    Object.keys(dia).forEach(function (id) {
      var W = {}; dia[id].forEach(function (d) { var s = semana(d[0]), w = W[s] || (W[s] = [0, 0]); w[0] += d[1]; w[1]++;
        var h = porS[d[0]] || (porS[d[0]] = { v: 0, l: 0, d: 0 }); h.v++; h.l += d[1]; h.d += d[2]; });
      var x = g(id); Object.keys(W).forEach(function (s) { x.ct.push([s, Math.round(W[s][0] / W[s][1] * 10) / 10, null, null, null]); });
      x.dia = dia[id];
    });
    // resumen del tambo por semana: vacas ordeñadas y litros por día (promedio de la semana)
    var sem = {}; Object.keys(porS).forEach(function (f) { var s = semana(f), w = sem[s] || (sem[s] = { n: 0, v: 0, l: 0, d: 0 }), h = porS[f]; w.n++; w.v += h.v; w.l += h.l; w.d += h.d; });
    var ctrls = Object.keys(sem).sort().map(function (s) { var w = sem[s]; return [s, 1, Math.round(w.v / w.n), Math.round(w.l / w.n), w.v ? Math.round(w.d / w.v) : null, null]; }).filter(function (c) { return c[2] >= 5; });
    // la semana en curso solo si tiene al menos 4 días
    if (ctrls.length) { var ult = ctrls[ctrls.length - 1]; if (sem[ult[0]].n < 4) ctrls.pop(); }

    Object.keys(G).forEach(function (id) {
      var x = G[id]; x.pa.sort(cmp); x.ev.sort(cmp); x.ta.sort(cmp); x.ct.sort(cmp); x.ab.sort(); x.sec.sort();
      x.pa.forEach(function (p, i) { if (!p[1]) p[1] = i ? x.pa[i - 1][1] + 1 : 1; });
      x.pa.forEach(function (p, i) {
        var np = x.pa[i + 1], hasta = np ? np[0] : '9999';
        var s = x.sec.filter(function (f) { return f > p[0] && f < hasta; }); p[5] = s.length ? s[s.length - 1] : null;
        if (!p[4]) { var pp = x.pa[i - 1], est = addDays(p[0], -GEST), best = null; x.ev.forEach(function (e) { if (e[1] !== 'S' || e[0] >= p[0] || (pp && e[0] <= pp[0])) return; var d = Math.abs(diffDays(e[0], est)); if (d <= 20 && (!best || d < best[1])) best = [e[0], d]; }); p[4] = best ? best[0] : null; }
        // litros de la lactancia: suma de la producción diaria; a 305 días si la lactancia llegó a 305
        var ds = x.dia.filter(function (d) { return d[0] >= p[0] && d[0] < hasta; });
        if (ds.length >= 7) {
          var tot = 0, t305 = 0, ultD = 0; ds.forEach(function (d) { var k = diffDays(d[0], p[0]); tot += d[1]; if (k < 305) t305 += d[1]; if (k > ultD) ultD = k; });
          var largo = p[5] ? diffDays(p[5], p[0]) : np ? diffDays(np[0], p[0]) : ultD;
          var nct = x.ct.filter(function (c) { return c[0] >= p[0] && c[0] < hasta; }).length;
          x.la.push([p[1], Math.round(tot), largo >= 305 && ultD >= 290 ? Math.round(t305) : null, null, null, nct]);
        }
      });
      var n = x.pa.length, desde = n > 1 ? x.pa[n - 2][0] : n ? x.pa[0][0] : null;
      x.ct = desde ? x.ct.filter(function (c) { return c[0] >= desde; }) : [];
      delete x.dia;
    });

    var fantasmas = [], animales = [], hist = {}, bajas = [], vacio = { pa: [], ev: [], ta: [], la: [], ct: [], ab: [], sec: [] }, usados = {};
    var pa2 = function (P) { return P.filter(function (p) { return !/^A/.test(p[2] || ''); }).map(function (p) { return [p[0], p[5] || null]; }); }, VL = [];
    var rpDe = function (id) { var a = A[id]; return a ? a.num || a.reg || null : null; };
    Object.keys(A).forEach(function (id) {
      var a = A[id]; if (!hembra(id) || a.type === 200) return;
      var x = G[id] || vacio, pi = ped[a.ped], ma = null, pd = null;
      if (pi) { ma = rpDe(pi.ma) || null; var b = A[pi.pa]; pd = b ? b.nom || b.bull || b.num || null : null; if (pd && /^unknown/i.test(pd)) pd = null; }
      var rp = a.num || a.reg || a.tag || ('ID ' + id);
      if (a.exit) {
        var s = salida[id] || {}, bF = s.f || a.exit; if (x.pa.length) VL.push({ u: 0, pa: pa2(x.pa), baja: bF, activa: false, seca: false }); if (!bF || bF < desdeHist) return;
        // tipo 8: salida del sistema sin venta ni muerte (p.ej. la recría que se sacó de DelPro el 21/10/2025): transferencia
        var t = s.t || a.exitT, tipoB = t === 6 ? 'venta' : t === 7 ? 'muerte' : t === 8 ? 'transferencia' : 'baja';
        var key = 'd' + id, catB = x.pa.length ? 'vaca' : 'vaquillona';
        bajas.push({ key: key, rp: rp, nombre: a.nom || null, cat: catB, u: null, dFecha: null, bFecha: bF, bTipo: tipoB, bCausa: s.m || null });
        var paB = x.pa.filter(function (p) { return p[0] >= desdeHist; }); if (!paB.length && x.pa.length) paB = [x.pa[x.pa.length - 1]];
        var dB = paB.length ? paB[0][0] : '0000', dE = function (e) { return e[0] >= dB; }, nros = paB.map(function (p) { return p[1]; });
        hist[key] = { mv: null, pa: paB, ev: x.ev.filter(dE), ta: x.ta.filter(dE), la: x.la.filter(function (l) { return nros.indexOf(l[0]) >= 0; }), ct: x.ct.filter(dE), ab: x.ab.filter(function (f) { return f >= dB; }), ult: true, fn: a.fn, ma: ma, pd: pd, vit: null };
        return;
      }
      // activa en DelPro pero con más de 3 años y ningún registro en 2 años (nunca se le dio la baja): no va a la libreta
      var ultA = '0000'; [x.pa, x.ev, x.ta, x.ct].forEach(function (L) { L.forEach(function (e) { if (e[0] > ultA) ultA = e[0]; }); });
      if ((!a.fn || a.fn < addDays(ref, -1096)) && ultA < desdeHist) { fantasmas.push(rp); return; }
      if (x.pa.length) VL.push({ u: 0, pa: pa2(x.pa), baja: null, activa: true, seca: false });
      var rp0 = rp, k2 = 2; while (usados[rp]) rp = rp0 + ' #' + k2++; usados[rp] = 1;
      var lp = x.pa.length ? x.pa[x.pa.length - 1] : null, lpf = lp ? lp[0] : '0000';
      // DelPro llama "Heifer" a toda la recría: menos de 6 meses es ternera
      var dias = a.fn ? diffDays(ref, a.fn) : null;
      var cat = a.type === 201 || (a.type === 202 && dias != null && dias < 183) ? 'ternera' : a.type === 202 ? 'vaquillona' : lp ? (lp[5] ? 'seca' : 'vaca') : 'vaquillona';
      var evs = x.ev.filter(function (e) { return e[0] > lpf; }), sv = evs.filter(function (e) { return e[1] === 'S'; }), le = evs.length ? evs[evs.length - 1] : null;
      var tas = x.ta.filter(function (t) { return t[0] >= lpf; }), lt = tas.length ? tas[tas.length - 1] : null;
      var cd = lt ? CODES[lt[1]] : null, res = cd ? cd[1] : null, preg = !!(cd && cd[2] === '2'), conc = null;
      if (preg) { var s2 = sv.filter(function (e) { return e[0] <= lt[0]; }); conc = s2.length ? s2[s2.length - 1][0] : null; }
      // aborto después del último tacto (o del último servicio): la vaca queda vacía, con resultado "Aborto" en la fecha del aborto
      var abL = x.ab.filter(function (f) { return f > lpf; }).pop();
      if (abL && (!lt || abL >= lt[0])) { preg = false; conc = null; res = 'Aborto'; lt = [abL, null]; }
      var estado = preg ? 'prenada' : res ? 'vacia' : 'sin';
      if (estado !== 'prenada' && le && le[1] === 'S' && (!lt || le[0] > lt[0])) estado = 'servida';
      var curLac = null; x.la.forEach(function (l) { if (lp && l[0] === lp[1]) curLac = l; });
      var mejs = x.la.map(function (l) { return l[2] || l[1]; }).filter(Boolean);
      var pr = lp && cat === 'vaca' ? x.ct.filter(function (c) { return c[0] >= lpf; }).map(function (c) { return c[1]; }).reverse().slice(0, 10) : [];
      var cu = a.cull ? cull[id] || {} : null;
      animales.push({
        rp: rp, nombre: a.nom || null, cat: cat, edad: a.fn ? Math.round(diffDays(ref, a.fn) / 365.25 * 10) / 10 : null,
        rod: grupo[a.grp] || null, idElec: a.tag || (a.reg && a.reg !== a.num ? a.reg : null),
        pFecha: lp ? lp[0] : null, pN: lp ? lp[1] : null, r1: lp ? (lp[2].split('/')[0] || null) : null, r2: lp ? (lp[2].split('/')[1] || null) : null,
        sFecha: le ? le[0] : null, sN: le ? sv.length : null, toro: le ? (le[1] === 'C' ? 'Celo' : (le[2] || null)) : null,
        tFecha: lt ? lt[0] : null, result: res, partoProb: conc ? addDays(conc, GEST) : null, estado: estado,
        u: null, dFecha: null, rech: cu ? 'Descarte' : null, rechDet: cu ? cu.m || null : null, pr: pr, celo: estado === 'prenada' && !!le && le[1] === 'C',
        dLac: lp && (cat === 'vaca' || cat === 'seca') ? diffDays(ref, lp[0]) : null,
        prodLts: curLac ? curLac[1] : null, mej: mejs.length ? Math.max.apply(null, mejs) : null
      });
      hist[rp] = { mv: null, ec: null, pa: x.pa, ev: x.ev, ta: x.ta, la: x.la, ct: x.ct, ab: x.ab, fn: a.fn, ma: ma, pd: pd, vit: null };
    });
    animales.sort(function (p, q) { return p.rp.localeCompare(q.rp, 'es', { numeric: true }); });
    bajas.sort(function (p, q) { return (q.bFecha || '') < (p.bFecha || '') ? -1 : 1; });
    var cc = {}; animales.forEach(function (x) { cc[x.cat] = (cc[x.cat] || 0) + 1; });
    var tambo = null; if (T.AnimalFarm && T.AnimalFarm.r[0]) tambo = tx(T.AnimalFarm.c(T.AnimalFarm.r[0], 'Name')) || null;
    if (!tambo && info.backup) { var m = /^([^_]+)_/.exec(info.backup); if (m) tambo = m[1].replace(/([a-z])([A-Z])/g, '$1 $2'); }
    // número para identificar (y bloquear) los links de este tambo: DP + el nombre del tambo en DelPro
    var nro = String(tambo || '').normalize('NFD').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12);
    return { vovsH: root.SysCaw && root.SysCaw.vovsHist ? root.SysCaw.vovsHist(VL, ref) : null, idProd: nro.length >= 3 ? ['DP' + nro] : [], ctrls: ctrls, config: {}, animales: animales, bajas: bajas, hist: hist, codes: CODES, fecha: ref, desdeHist: desdeHist, tambo: tambo, conteoCat: cc, origen: 'delpro', unidades: [], fechaBackup: fch(info.fecha_backup), fantasmas: fantasmas };
  }

  function fromFile(buf, nombre) {
    return Promise.resolve().then(function () {
      if (!es(buf, nombre)) throw new Error('El archivo no parece una exportación de DelPro (un .zip con las tablas en CSV).');
      return leer(buf).then(build);
    });
  }

  var api = { fromFile: fromFile, es: es, build: build, leer: leer, CODES: CODES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Delpro = api;
})(typeof window !== 'undefined' ? window : this);
