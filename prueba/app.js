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
      var n = a._n || (a._n = norm(a.nombre)), r = norm(a.rp), score = 0; // caravana sin distinguir mayúsculas: TZ0079 se encuentra escribiendo tz0079
      if (r === q) score = 100;
      else if (r.indexOf(q) === 0) score = 80;
      else if (qd && a.idElec && a.idElec.slice(-8) === qd) score = 95;
      else if (qd && a.idElec && a.idElec.slice(-8).indexOf(qd) === 0) score = 70;
      else if (n.indexOf(q) >= 0) score = 60;
      else if (tokens.every(function (t) { return n.indexOf(t) >= 0 || r.indexOf(t) === 0; })) score = 50;
      else if (q.length >= 3 && r.indexOf(q) >= 0) score = 40;
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
  // sal (opcional): { rp: fecha de salida estimada } para simular descartes; desde esa fecha la vaca deja de contar
  function proyeccion(animales, hoy, nMeses, lim, sal) {
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
        if (sal && sal[x.a.rp] && D >= sal[x.a.rp]) { r.des = (r.des || 0) + 1; return; }
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
          if (L.conc) { if (e[0] === L.conc) { cy.sOk++; C.svs.push({ c: cy.n, f: e[0], toro: e[2] || '', ins: e[3] || '', r: 'ok' }); } else if (e[0] < L.conc) { cy.sMal++; C.svs.push({ c: cy.n, f: e[0], toro: e[2] || '', ins: e[3] || '', r: 'mal' }); } return; }
          var luego = L.sv[i + 1] || L.neg.some(function (d) { return d > e[0] && diffDays(d, e[0]) >= 25; });
          // no retorno: solo cuenta si pasaron al menos 24 días desde el servicio (si no, todavía no pudo repetir)
          if (diffDays(ref, e[0]) < 24) return;
          if (luego) cy.sMal++; else cy.sPend++;
          C.svs.push({ c: cy.n, f: e[0], toro: e[2] || '', ins: e[3] || '', r: luego ? 'mal' : 'pend' });
        });
        // servida en un ciclo anterior y todavía sin resultado (sin tacto vacía ni nuevo servicio): no es apta
        // hasta que se la vuelva a servir; si después el tacto da vacía, cuenta para atrás
        var prev = null; L.sv.forEach(function (e) { if (e[0] < cy.ini) prev = e[0]; });
        var pendiente = prev && !L.conc && !L.sv.some(function (e) { return e[0] > prev; }) && !L.neg.some(function (d) { return d > prev && diffDays(d, prev) >= 25; });
        var apta = !pendiente && diffDays(cy.fin, L.p) >= pev && (!L.conc || L.conc >= cy.ini) && (!x.salida || x.salida > cy.mid) && !(x.desc && x.desc <= cy.ini);
        // como SysCaw: una vaca servida en el ciclo cuenta como apta aunque no haya cumplido la espera voluntaria
        var servCiclo = L.sv.some(function (e) { return e[0] >= cy.ini && e[0] <= cy.fin; });
        if (!apta && servCiclo && (!L.conc || L.conc >= cy.ini)) apta = true;
        if (!apta) return;
        cy.aptas++;
        if (L.sv.some(function (e) { return e[0] >= cy.ini && e[0] <= cy.fin; })) cy.serv++;
        if (L.conc && L.conc >= cy.ini && L.conc <= cy.fin) cy.pren++;
      });
    });
    return C;
  }
  /* ---------- preñez de la zafra y preñez a 150 días en leche ----------
     Por lactancia: concepción (del parto siguiente, o el último servicio antes del último tacto positivo si no se perdió;
     sin servicio anotado, como con toro, se estima 45 días antes del tacto) y si la preñez confirmada se perdió. */
  function lactConc(h, esPren, esVac) {
    var pa = h.pa, S = h.ev.filter(function (e) { return e[1] === 'S'; }), ab = h.ab || [];
    return pa.map(function (p, i) {
      var np = pa[i + 1] || null, hasta = np ? np[0] : '9999';
      var sv = S.filter(function (e) { return e[0] > p[0] && e[0] < hasta; });
      var ta = h.ta.filter(function (t) { return t[0] > p[0] && t[0] < hasta; });
      var abN = !!np && /^A/i.test(np[2] || '');
      // pérdida después de un tacto positivo T: tacto vacía, nuevo servicio más de 20 días después o aborto, antes del parto siguiente
      var perdida = function (T) {
        return abN || ta.some(function (t) { return t[0] > T && esVac(t[1]); }) || sv.some(function (e) { return diffDays(e[0], T) > 20; }) || ab.some(function (f) { return f > T && f < hasta; });
      };
      var conc = null, est = false;
      if (np && !abN) {
        conc = np[4] || null;
        if (!conc) { var e0 = addDays(np[0], -GEST), best = null; sv.forEach(function (e) { var d = Math.abs(diffDays(e[0], e0)); if (d <= 15 && (!best || d < best[1])) best = [e[0], d]; }); conc = best ? best[0] : e0; est = !best; }
      } else if (!np) {
        var pos = ta.filter(function (t) { return esPren(t[1]); });
        if (pos.length) {
          var T = pos[pos.length - 1][0];
          if (!perdida(T)) {
            var an = sv.filter(function (e) { return e[0] <= T; });
            if (an.length) conc = an[an.length - 1][0];
            else { conc = addDays(T, -45); est = true; if (conc <= p[0]) conc = addDays(p[0], 1); }
          }
        }
      }
      return { p: p[0], np: np ? np[0] : null, sv: sv, ta: ta, conc: conc, est: est, pos: ta.filter(function (t) { return esPren(t[1]); }).map(function (t) { return t[0]; }), perdida: perdida };
    });
  }
  // servida sin resultado: después del último servicio no hay otro servicio ni tacto vacía (25 días o más después)
  function sinResultado(L, ult, esPren) {
    return !L.sv.some(function (e) { return e[0] > ult; }) && !L.ta.some(function (t) { return t[0] > ult && diffDays(t[0], ult) >= 25 && !esPren(t[1]); });
  }
  /* Zafra: del inicio de servicios (ini) al último servicio que cuenta (fin). Entra cada vaca (al menos un parto) con la
     lactancia que corre en la zafra: en el rodeo al inicio o parida después, no preñada al inicio, y parida al menos
     pev días antes del fin. Excluidas: descarte programado antes del fin sin preñarse ('desc') y las que se fueron
     antes de cumplir la espera voluntaria ('antes'). Las que se fueron vacías después cuentan como no preñadas.
     animales: [{ rp, h, salida, desc }]; desc '0000' = descarte sin fecha (se toma la del respaldo). */
  function zafraPren(animales, esPren, esVac, ini, fin, pev, ref) {
    var R = [], lim = addDays(fin, -pev);
    animales.forEach(function (x) {
      var h = x.h; if (!h || !h.pa || !h.pa.length || !h.ev || !h.ta) return;
      var Ls = lactConc(h, esPren, esVac), L = null;
      for (var i = 0; i < Ls.length; i++) {
        var l = Ls[i];
        if (l.p > lim) break;
        if (l.np && l.np <= ini) continue;
        if (l.conc && l.conc < ini) continue;
        if (x.salida && x.salida <= (l.p > ini ? l.p : ini)) break;
        L = l; break;
      }
      if (!L) return;
      var conc = L.conc && L.conc <= fin ? L.conc : null;
      // con varias unidades: entra a la zafra cuando está en la unidad elegida (al inicio, al parir o al llegar por un pase);
      // si se va a otra unidad sin preñarse, queda fuera ('pase'): sigue en la otra unidad, no es una falla de esta
      var ent = L.p > ini ? L.p : ini, pase = null;
      if (x.uEn) {
        if (!x.uEn(ent)) {
          var lleg = (x.cambios || []).filter(function (m) { return m > ent && m <= fin && x.uEn(m); })[0];
          if (!lleg || (conc && conc <= lleg)) return;
          ent = lleg;
        }
        pase = (x.cambios || []).filter(function (m) { return m > ent && !x.uEn(m); })[0] || null;
      }
      var svz = L.sv.filter(function (e) { return e[0] <= fin; });
      var s1 = svz.length ? svz[0][0] : null, ult = svz.length ? svz[svz.length - 1][0] : null;
      var pend = !conc && !L.np && !!ult && !x.salida && sinResultado(L, ult, esPren);
      var d = x.desc === '0000' ? ref : x.desc, excl = null;
      if (d && d <= fin && (!conc || conc > d) && (!x.salida || d <= x.salida)) excl = 'desc';
      else if (!conc && x.salida && diffDays(x.salida, L.p) < pev) excl = 'antes';
      else if (pase && (!conc || conc > pase)) excl = 'pase';
      // pérdida: el primer tacto positivo de una preñez de la zafra
      var T1 = L.pos.filter(function (t) { return diffDays(t, ini) >= 25; })[0] || null, sT1 = null;
      if (T1) { var sa = L.sv.filter(function (e) { return e[0] <= T1; }); if (sa.length && sa[sa.length - 1][0] > fin) T1 = null; else if (sa.length) sT1 = sa[sa.length - 1][0]; }
      // concepción de la zafra, por servicio: preña el servicio de la concepción (o el del tacto positivo, aunque después se pierda);
      // falla si después hubo otro servicio, un tacto vacía (25 días o más) o una concepción posterior; si no, queda sin resultado
      var sOk = 0, sRes = 0;
      L.sv.forEach(function (e) {
        var f = e[0]; if (f < ini || f > fin) return;
        if (f === L.conc || f === sT1) { sOk++; sRes++; return; }
        var falla = L.sv.some(function (o) { return o[0] > f; }) || (L.conc && L.conc > f) || !!L.np ||
          L.ta.some(function (t) { return t[0] > f && diffDays(t[0], f) >= 25 && !esPren(t[1]); });
        if (falla) sRes++;
      });
      R.push({ ent: ent, sOk: sOk, sRes: sRes, sTot: L.sv.filter(function (e) { return e[0] >= ini && e[0] <= fin; }).length, rp: x.rp, p: L.p, conc: conc, est: conc ? L.est : false, s1: s1, ult: ult, pend: pend, salida: x.salida || null, excl: excl, conf: !!T1, perd: T1 ? L.perdida(T1) : false });
    });
    return R;
  }
  // resultado de cada servicio entre desde y hasta: true preñó (aunque después se perdiera), false falló, null sin resultado todavía
  function servRes(h, esPren, esVac, desde, hasta) {
    var out = [];
    if (!h || !h.pa || !h.pa.length || !h.ev || !h.ta) return out;
    lactConc(h, esPren, esVac).forEach(function (L) {
      var T1 = L.pos[0] || null, sT1 = null;
      if (T1) { var sa = L.sv.filter(function (e) { return e[0] <= T1; }); if (sa.length) sT1 = sa[sa.length - 1][0]; }
      L.sv.forEach(function (e) {
        var f = e[0]; if (f < desde || f > hasta) return;
        if (f === L.conc || f === sT1) { out.push([f, true]); return; }
        var falla = L.sv.some(function (o) { return o[0] > f; }) || (L.conc && L.conc > f) || !!L.np ||
          L.ta.some(function (t) { return t[0] > f && diffDays(t[0], f) >= 25 && !esPren(t[1]); });
        out.push([f, falla ? false : null]);
      });
    });
    return out;
  }
  // lactancias que cumplen 150 días en leche entre desde y hasta: ¿se preñaron antes de los 150 días?
  function pren150(animales, esPren, esVac, desde, hasta, pev, ref) {
    var R = [];
    animales.forEach(function (x) {
      var h = x.h; if (!h || !h.pa || !h.pa.length || !h.ev || !h.ta) return;
      lactConc(h, esPren, esVac).forEach(function (l) {
        var d150 = addDays(l.p, 150); if (d150 < desde || d150 > hasta) return;
        if (x.salida && x.salida <= l.p) return;
        if (x.uEn && !x.uEn(d150)) return; // con varias unidades: cuenta donde estaba a los 150 días
        var ok = !!l.conc && l.conc <= d150;
        var d = x.desc === '0000' ? ref : x.desc, excl = null;
        if (d && d <= d150 && (!ok || l.conc > d) && (!x.salida || d <= x.salida)) excl = 'desc';
        else if (!ok && x.salida && diffDays(x.salida, l.p) < pev) excl = 'antes';
        var sv = l.sv.filter(function (e) { return e[0] <= d150; }), ult = sv.length ? sv[sv.length - 1][0] : null;
        var pend = !ok && !l.np && !!ult && !x.salida && sinResultado(l, ult, esPren);
        R.push({ rp: x.rp, p: l.p, d150: d150, ok: ok, pend: pend, excl: excl });
      });
    });
    return R;
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
      // recría: un solo grupo, las vaquillonas que parieron en los últimos 2 años. Para cada una: edad al primer servicio,
      // a la preñez (el servicio que cuadra con el parto), servicios por preñez y edad al parto. Al ser las mismas vaquillonas
      // en todos los pasos, la cadena siempre cierra: primer servicio ≤ preñez < parto.
      if (p1 && fn && p1[0] >= d24) {
        var svq = S.filter(function (e) { return e[0] < p1[0]; });
        var cq = svq.length && svq[0][0] >= desdeOk ? concDe(svq, h, svq[0][0], p1) : null;
        if (cq) {
          var e1 = mes(diffDays(svq[0][0], fn)), ep = mes(diffDays(cq, fn)), ea = mes(diffDays(p1[0], fn));
          if (e1 > 8 && e1 < 40 && ep >= e1 && ea > 17 && ea < 50) {
            Z.e1s.push(e1); Z.ePren.push(ep); Z.e1p.push(ea);
            Z.spcV.push(Math.min(svq.filter(function (e) { return e[0] <= cq; }).length, 6));
          }
        }
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
        var c = concDe(sv, h, p[0], np), estim = false;
        if (!c && np) { c = addDays(np[0], -GEST); estim = true; }
        var da = null, spc = null;
        if (c) { da = diffDays(c, p[0]); spc = estim ? null : sv.filter(function (e) { return e[0] <= c; }).length || null; }
        else if (abierta >= 150) { da = abierta; spc = sv.length + 1; }
        if (c || abierta >= 150) {
          G.n++; if (c) G.pren++;
          // parto al primer celo o servicio, en las mismas vacas que los días abiertos (así nunca da más que los días abiertos)
          var pc = evs.length ? diffDays(evs[0][0], p[0]) : 150; if (pc > 0) G.pc.push(Math.min(pc, 150));
        }
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
          // % de grasa + proteína: con los controles de la lactancia (ponderado por litros) si tiene 4 análisis o más; si no, el total
          // de SysCaw (en las lactancias recientes ese total suele venir vacío o incompleto)
          var nAn = null, pctC = null;
          if (h.ct && h.ct.length && i >= h.pa.length - 2) {
            var cc = h.ct.filter(function (c) { return c[0] >= p[0] && c[0] < hasta && c[1] > 0 && c[2] >= 2 && c[2] <= 7 && c[3] >= 2 && c[3] <= 5.5; });
            nAn = cc.length;
            if (nAn) { var sl = 0, ss = 0; cc.forEach(function (c) { sl += c[1]; ss += c[1] * (c[2] + c[3]); }); pctC = ss / sl; }
          }
          var pctOk = l[3] >= 2 && l[3] <= 7 && l[4] >= 2 && l[4] <= 5.5, pctL = nAn >= 4 ? pctC : pctOk ? l[3] + l[4] : null;
          var r = { v: V, nro: p[1], lit: lit305, nAn: nAn, sol: pctL ? lit305 * pctL / 100 : null };
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
  var api = { MESES: MESES, indice: indice, lineaVida: lineaVida, ciclos21: ciclos21, zafraPren: zafraPren, pren150: pren150, servRes: servRes, setSecado: setSecado, proyeccion: proyeccion, PREPARTO: PREPARTO, derive: derive, search: search, conteo: conteo, tareas: tareas, resumen: resumen, fmt: fmt, rel: rel, diffDays: diffDays, addDays: addDays, ymd: ymd, GEST: GEST, SECADO: SECADO, DX_MIN: DX_MIN };
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
    var state = { tab: 'panel', q: '', filtro: 'todas', n: 60, rp: null, ventana: 183, abiertas: {}, error: '', persisted: true, draft: null, cat: 'vaca' };
    var $ = function (s) { return document.querySelector(s); };
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var today = function () { return A.ymd(new Date()); };
    var nf = function (n, d, dmin) { return n == null ? '' : Number(n).toLocaleString('es-UY', { maximumFractionDigits: d || 0, minimumFractionDigits: dmin || 0 }); };
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
      state.q = ''; state.rp = null; state.error = ''; state.filtro = 'todas'; state.n = 60; state.tab = 'panel';
      state.ini21 = null; state.fsec = null; state.pev = null; state.insD0 = state.insD1 = state.insR = null; state.insSel = ''; state.abiertas = {};
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
      state.ini21 = null; state.fsec = null; state.pev = null; state.insD0 = state.insD1 = state.insR = null; state.insSel = '';
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
          '<span class="irt"><span class="iwhen' + cls + '">' + hace + '</span>' + (t.id === ult ? '<small>último</small>' : '') + '</span></button>';
      }).join('');
      return '<section class="ihola"><p class="ifecha">' + esc(fecha.charAt(0).toUpperCase() + fecha.slice(1)) + '</p>' +
        '<p class="hint">' + (L.length ? L.length + (L.length === 1 ? ' tambo' : ' tambos') + ' en este teléfono · ' + nf(tot) + ' animales' : 'Todavía no hay tambos cargados.') + '</p></section>' +
        (L.length > 6 ? '<div class="isearch"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M15.5 15.5L21 21" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg><input id="qTambo" type="search" enterkeyhint="search" placeholder="Buscar tambo" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Buscar tambo"></div>' : '') +
        '<div class="ilist" id="ilist">' + filas + '</div><p class="hint inada" id="inada" hidden>Ningún tambo con ese nombre.</p>' +
        '<p class="hint ihint">La fecha es la del último respaldo cargado (en rojo, más de 45 días).</p>' +
        '<div class="iacc"><button class="btn primary big" data-a="tnuevo">Agregar tambo</button>' +
        (L.length > 1 ? '<button class="btn" data-a="poblacion">Población de tambos</button>' : '') +
        '<button class="btn" data-a="ajustes">Ajustes</button></div>' +
        '<button class="lnk" data-a="pegaract" style="display:block;margin:14px auto 0">¿Tenés un link de tambo? Pegalo acá</button>';
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
    // la librería de Excel no se carga al abrir: solo al exportar una lista o al leer una base de FOSAPP (la usa para abrir el .zip)
    var XLSXP = null;
    function cargarXlsx() {
      if (root.XLSX) return Promise.resolve(root.XLSX);
      if (XLSXP) return XLSXP;
      XLSXP = new Promise(function (ok, mal) {
        var s = document.createElement('script'); s.src = 'xlsx.full.min.js';
        s.onload = function () { root.XLSX ? ok(root.XLSX) : mal(new Error('no se pudo cargar Excel')); };
        s.onerror = function () { XLSXP = null; mal(new Error('no se pudo descargar Excel (hace falta internet la primera vez)')); };
        document.head.appendChild(s);
      });
      return XLSXP;
    }
    function cargarSqlJs() {
      if (root.initSqlJs) return Promise.resolve(root.initSqlJs);
      return new Promise(function (ok, mal) {
        var s = document.createElement('script'); s.src = 'sql-wasm.js?v=1';
        s.onload = function () { root.initSqlJs ? ok(root.initSqlJs) : mal(new Error('no se pudo cargar el lector de FOSAPP')); };
        s.onerror = function () { mal(new Error('no se pudo descargar el lector de FOSAPP (hace falta internet la primera vez)')); };
        document.head.appendChild(s);
      });
    }
    // lector de SIGEA (Macoel): se baja recién la primera vez que el veterinario abre una base .GDB
    function cargarSigea() {
      if (root.Sigea) return Promise.resolve(root.Sigea);
      return new Promise(function (ok, mal) {
        var s = document.createElement('script'); s.src = 'sigea.js?v=1';
        s.onload = function () { root.Sigea ? ok(root.Sigea) : mal(new Error('no se pudo cargar el lector de SIGEA')); };
        s.onerror = function () { mal(new Error('no se pudo descargar el lector de SIGEA (hace falta internet la primera vez)')); };
        document.head.appendChild(s);
      });
    }
    // lector de DHM (base de Access .mdb): se baja recién la primera vez que el veterinario abre una base de DHM
    function cargarDhm() {
      if (root.Dhm && root.MDBReader) return Promise.resolve(root.Dhm);
      var uno = function (src) { return new Promise(function (ok, mal) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { mal(new Error('no se pudo descargar el lector de DHM (hace falta internet la primera vez)')); }; document.head.appendChild(s); }); };
      return (root.MDBReader ? Promise.resolve() : uno('mdb-reader.js?v=1')).then(function () { return root.Dhm ? null : uno('dhm.js?v=4'); }).then(function () { if (!root.Dhm || !root.MDBReader) throw new Error('no se pudo cargar el lector de DHM'); return root.Dhm; });
    }
    // exportación de DelPro (DeLaval): .zip con las tablas en CSV; el lector se baja recién la primera vez
    function cargarDelpro() {
      if (root.Delpro) return Promise.resolve(root.Delpro);
      return new Promise(function (ok, mal) { var s = document.createElement('script'); s.src = 'delpro.js?v=4'; s.onload = function () { root.Delpro ? ok(root.Delpro) : mal(new Error('no se pudo cargar el lector de DelPro')); }; s.onerror = function () { mal(new Error('no se pudo descargar el lector de DelPro (hace falta internet la primera vez)')); }; document.head.appendChild(s); });
    }
    // ¿es un .zip con las tablas de DelPro? (se busca el nombre de sus tablas en el índice del .zip, al final del archivo)
    function esDelpro(buf) {
      if (!buf || buf.byteLength < 30) return false; var u = new Uint8Array(buf); if (u[0] !== 0x50 || u[1] !== 0x4b) return false;
      var t = new TextDecoder('latin1').decode(u.subarray(Math.max(0, u.length - 262144)));
      return t.indexOf('AbstractAnimalEvent.csv') >= 0 && t.indexOf('BasicAnimal.csv') >= 0;
    }
    // base de Access (DHM): "Standard Jet DB" o "Standard ACE DB" en el encabezado
    function esAccess(buf) { if (!buf || buf.byteLength < 32) return false; var u = new Uint8Array(buf, 4, 15), t = ''; for (var i = 0; i < u.length; i++) t += String.fromCharCode(u[i]); return t === 'Standard Jet DB' || t === 'Standard ACE DB'; }
    // ¿el .rar trae una base de Access (DHM.rar) en vez de un respaldo de SysCaw?
    function rarConMdb(buf) {
      return root.Unrar.createExtractorFromData({ data: buf.slice(0), wasmBinary: b64(root.UNRAR_WASM_B64) }).then(function (ex) {
        var hay = false; for (var h of ex.getFileList().fileHeaders) if (/\.(mdb|accdb)$/i.test(h.name)) hay = true; return hay;
      }).catch(function () { return false; });
    }
    // base de Firebird (SIGEA de Macoel): página de encabezado con la firma 12345 y ODS 10 u 11
    function esFirebird(buf) { if (!buf || buf.byteLength < 64) return false; var u = new Uint8Array(buf, 0, 64), ods = (u[18] | u[19] << 8) & 0x7fff; return u[0] === 1 && u[2] === 0x39 && u[3] === 0x30 && (ods === 10 || ods === 11); }
    // tambos que vienen de otro programa (FOSAPP, SIGEA): solo para el modo veterinario
    function externo(o) { return o === 'fosapp' || o === 'sigea' || o === 'dhm' || o === 'delpro'; }
    // tambos de otros programas que se mandan al productor solo por link (no tienen activación ni respaldo de SysCaw)
    function soloLink(o) { return o === 'fosapp' || o === 'dhm' || o === 'delpro'; }
    function cargarRespaldo(buf, f, tipo) {
      var fosapp = tipo === true || tipo === 'fosapp', sigea = tipo === 'sigea', dhm = tipo === 'dhm' || tipo === 'dhmrar', delpro = tipo === 'delpro';
      busy(true, (tipo === 'pre' ? 'Cargando el tambo…' : delpro ? 'Leyendo base de DelPro…' : dhm ? 'Leyendo base de DHM…' : sigea ? 'Leyendo base de SIGEA…' : fosapp ? 'Leyendo base de FOSAPP…' : 'Leyendo respaldo de SysCaw…') + '<small>Puede tardar unos segundos</small>');
      setTimeout(function () {
        (tipo === 'pre' ? buf : delpro ? cargarDelpro().then(function (D) { return D.fromFile(buf, f.name); }).then(function (d) { busy(true, 'Guardando el tambo…'); return d; }) : dhm ? cargarDhm().then(function (H) {
          return (tipo === 'dhmrar' ? H.mdbDeRar(buf, { unrar: root.Unrar, wasmBinary: b64(root.UNRAR_WASM_B64) }) : Promise.resolve(buf)).then(function (mdb) {
            return H.fromFile(mdb, f.name, { elegir: function (us) { return elegirUnidad(us, null, true); } });
          }).then(function (d) { busy(true, 'Guardando el tambo…'); return d; });
        }) : sigea ? cargarSigea().then(function (S) { return S.fromFile(buf, f.name); }) : fosapp ? Promise.all([cargarSqlJs(), cargarXlsx()]).then(function (r) { return root.Fosapp.fromFile(buf, f.name, { initSqlJs: r[0], wasmUrl: 'sql-wasm.wasm?v=1', XLSX: r[1] }); })
          : root.SysCaw.fromRar(buf, f.name, { unrar: root.Unrar, wasmBinary: b64(root.UNRAR_WASM_B64), Paradox: root.Paradox, elegir: function (us) { return elegirUnidad(us, null, true); }, todas: true })).then(function (d) {
          if (!habilitado(d.idProd)) { busy(false); state.destino = null; bloqueado(d.tambo || nombreDesdeArchivo(f.name)); return; }
          var sel = d.unidadesSel || [], parcial = !!d.sel;
          var nom = d.tambo || nombreDesdeArchivo(f.name) || '';
          // tambos guardados antes de esta versión: se averigua su número de productor
          return Promise.all(TAMBOS.lista.map(function (t) { return t.idp || t.fuente !== 'syscaw' ? null : leerDB(t.id).then(function (o) { if (o && o.idProd) t.idp = o.idProd; }, function () {}); })).then(function () { return { d: d, nom: nom }; });
        }).then(function (q) {
          if (!q) return;
          var d = q.d, nom = q.nom, cambio = prepararDestino(nom, d.idProd || []);
          if ((!d.tambo || externo(d.origen)) && tamboAct() && tamboAct().nombre) nom = tamboAct().nombre; // sin nombre en el respaldo: se mantiene el que ya tenía
          var nuevo = { animales: [], todos: d.animales, idProd: d.idProd || [], ctrls: d.ctrls || [], curvas: d.curvas || null, bajasT: d.bajas || [], config: d.config || {}, unidades: d.unidades.length > 1 ? d.unidades : null, sel: d.sel, hist: d.hist, codes: d.codes, fecha: d.fecha, desdeHist: d.desdeHist, cargada: today(), archivo: f.name, fuente: 'syscaw', origen: d.origen || 'syscaw' };
          return leerDB(TAMBOS.activo).then(function (viejo) { return { cambio: cambio, nom: nom, n: unirRespaldo(nuevo, viejo) }; }, function () { return { cambio: cambio, nom: nom, n: { db: nuevo, bajas: 0 } }; });
        }).then(function (r) {
          if (!r) return;
          var cambio = r.cambio, nom = r.nom;
          DB = r.n.db;
          aplicarUnidad();
          busy(false);
          if (state.lnkPend) { var tl = tamboAct(); if (tl) { tl.lnkIn = state.lnkPend; saveTambos(); } state.lnkPend = null; }
          saveDB(); state.q = ''; state.rp = null; state.error = ''; state.filtro = 'todas'; state.tab = 'panel'; state.cat = 'todas';
          try { location.hash = ''; } catch (e) {}
          render();
          // el nombre queda fijo: el que trae el respaldo
          PERFIL.nombre = nom || PERFIL.nombre; savePerfil(); render();
          toast((cambio === 'nuevo' ? 'Tambo nuevo: ' : cambio === 'actualizado' ? 'Actualizado: ' : '') + (PERFIL.nombre ? PERFIL.nombre + ' · ' : '') + DB.animales.length + ' animales' + (r.n.bajas ? ' · se ' + (r.n.bajas === 1 ? 'conserva 1 baja' : 'conservan ' + r.n.bajas + ' bajas') + ' de respaldos anteriores' : ''));
        }).catch(function (e) {
          busy(false);
          state.destino = null; state.lnkPend = null;
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
        if (esFirebird(fr.result)) {
          // base de SIGEA (Macoel): solo en el modo veterinario; fuera de él se responde como cualquier archivo que la app no lee
          if (!esVet()) { state.destino = null; state.error = 'No pude leer el archivo. Elegí el respaldo de SysCaw (.rar).'; render(); return; }
          cargarRespaldo(fr.result, f, 'sigea'); return;
        }
        if (esDelpro(fr.result)) {
          // exportación de DelPro: solo en el modo veterinario
          if (!esVet()) { state.destino = null; state.error = 'No pude leer el archivo. Elegí el respaldo de SysCaw (.rar).'; render(); return; }
          cargarRespaldo(fr.result, f, 'delpro'); return;
        }
        if (root.Fosapp && root.Fosapp.es(fr.result, f.name)) {
          // base de FOSAPP: modo veterinario, o productor activado para un tambo de FOSAPP (cargarRespaldo comprueba que la base sea de su tambo)
          // a cualquier otro se le responde como a un archivo que la app no lee
          if (!esVet() && !ACT.some(function (x) { return (x.p || []).some(function (q) { return /^F\d/.test(q); }); })) { state.destino = null; state.error = 'No pude leer el archivo. Elegí el respaldo de SysCaw (.rar).'; render(); return; }
          cargarRespaldo(fr.result, f, true); return;
        }
        if (esAccess(fr.result)) {
          // base de DHM (Access): solo en el modo veterinario
          if (!esVet()) { state.destino = null; state.error = 'No pude leer el archivo. Elegí el respaldo de SysCaw (.rar).'; render(); return; }
          cargarRespaldo(fr.result, f, 'dhm'); return;
        }
        if (esRar(fr.result) || /\.rar$/i.test(f.name)) {
          // en el modo veterinario, un .rar puede traer la base de DHM (DHM.rar)
          if (esVet()) { rarConMdb(fr.result).then(function (m) { cargarRespaldo(fr.result, f, m ? 'dhmrar' : undefined); }); return; }
          cargarRespaldo(fr.result, f); return;
        }
        // las libretas en Excel ya no se leen: todo entra por respaldo
        if (!esVet() && !ACT.length) { bloqueado(nombreDesdeArchivo(f.name)); return; }
        state.destino = null; state.error = 'No pude leer el archivo. Elegí el respaldo de SysCaw (.rar).';
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
      var fijo = DB.fuente === 'syscaw' && !externo(DB.origen); // con FOSAPP el nombre lo pone el veterinario
      $('label[for="inNombre"]').hidden = fijo;
      paintLogoPreview();
      $('#btnAct').hidden = !(esVet() && DB.idProd && DB.idProd.length && !externo(DB.origen));
      $('#btnLnk').hidden = !(esVet() && (soloLink(DB.origen) || (DB.idProd && DB.idProd.length && !externo(DB.origen)))); // FOSAPP, DHM y DelPro: solo por link
      $('#btnGh').hidden = !esVet(); $('#btnGh').textContent = ghToken() ? 'Permiso de GitHub para links: cargado (cambiar)' : 'Cargar permiso de GitHub para links';
      $('#btnInf').hidden = !(esVet() && DB.hist && DB.animales.length);
      // productor con un tambo de FOSAPP que le llegó por link: no carga archivos ni códigos; los datos le llegan por el link
      var porLink = !esVet() && tamboAct() && tamboAct().lnkIn;
      $('#btnLnkBuscar').hidden = !porLink;
      $('#btnCambiar').hidden = !esVet() && (DB.origen === 'dhm' || DB.origen === 'delpro'); // DHM y DelPro: solo los carga el veterinario
      $('#btnCambiar').textContent = DB.origen === 'fosapp' && !esVet() ? 'Actualizar este tambo (cargar la base de FOSAPP)' : 'Actualizar este tambo (cargar respaldo o libreta)';
      ['#btnPob', '#btnBase', '#btnBaseIn', '#btnVetClave'].forEach(function (s) { $(s).hidden = !esVet(); });
      $('#sheet .sheet-card').classList.toggle('vet', esVet());
      $('#sheet .sheet-card').classList.toggle('fos', esVet() && externo(DB.origen)); // FOSAPP: el veterinario le pone el nombre al tambo
      Array.prototype.forEach.call(document.querySelectorAll('#sheet .sg'), function (g, i) { g.classList.remove('abierto'); });
      $('#btnCod').hidden = esVet() || (!!porLink && soloLink(DB.origen));
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
      PERFIL = { nombre: DB.fuente === 'syscaw' && !externo(DB.origen) ? PERFIL.nombre : (limpiarNombre(crudo) || PERFIL.nombre), logo: state.draft.logo || '' };
      savePerfil(); closeSheet(); render(); toast('Guardado');
    }

    /* ----- navegación ----- */
    function setTab(t) {
      state.tab = t; state.rp = null; state.informe = false; state.pobl = false; state.voy = false; state.voyLista = null;
      try { if (location.hash) location.hash = ''; } catch (e) {}
      render(); window.scrollTo(0, 0);
    }
    // caravanas con letras o espacios (p. ej. TZ… de DHM): van codificadas en el #ficha-
    function rpDeHash() { var m = /^#ficha-(.+)$/.exec(location.hash || ''); if (!m) return null; try { var r = decodeURIComponent(m[1]); return byRp(r) ? r : null; } catch (e) { return null; } }
    // al volver de la ficha, la lista queda donde estaba
    function volverALista() { var y = state.volverY || 0; render(); window.scrollTo(0, y); requestAnimationFrame(function () { window.scrollTo(0, y); }); }
    function openFicha(rp) {
      if (!state.rp) state.volverY = window.scrollY || 0;
      state.rp = rp;
      try { location.hash = 'ficha-' + encodeURIComponent(rp); } catch (e) {}
      render(); window.scrollTo(0, 0);
    }
    function back() {
      state.rp = null;
      try { location.hash = ''; } catch (e) {}
      volverALista();
    }
    window.addEventListener('hashchange', function () {
      var tenia = !!state.rp, r = rpDeHash();
      if (r === state.rp) return;
      state.rp = r;
      if (tenia && !r) volverALista(); else render();
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
    // repetidora: vaca con 4 servicios o más en la lactancia actual que todavía no está preñada
    function repetidora(a) { return !!a && (a.cat === 'vaca' || a.cat === 'seca') && a.estado !== 'prenada' && (a.sN || 0) >= 4; }
    var SELLO_REP = '<span class="sellorep" title="4 servicios o más sin preñar">Repetidora</span>';
    function rowHTML(a, o) {
      if (a.bTipo) return rowBajaHTML(a);
      o = o || {};
      var qd = String(state.q || '').replace(/\s+/g, '');
      if (o.sub == null && /^\d{5,8}$/.test(qd) && a.idElec && a.idElec.slice(-8).indexOf(qd) === 0) o.sub = '<b>ID …' + esc(a.idElec.slice(-8)) + '</b>';
      return '<button class="row" data-rp="' + esc(a.rp) + '">' + tagSVG(a.rp, 54) +
        '<span class="rt' + (repetidora(a) ? ' conrep' : '') + '">' + (repetidora(a) ? SELLO_REP : '') + (o.right != null ? o.right : chip(a)) + '</span>' +
        '<span class="sub">' + (o.sub != null ? (a.cat && a.cat !== 'vaca' ? '<span class="catlbl">' + CATL[a.cat] + '</span> · ' : '') + o.sub : subDefault(a)) + '</span></button>';
    }
    function emptyHTML() {
      return '<section class="empty"><div class="emptytag">' + tagSVG('0000', 64) + '</div><h2>Cargá el respaldo</h2>' +
        '<p>Elegí el respaldo de SysCaw (.rar)' + (esVet() ? ', la base de FOSAPP (.zip)' : '') + '. Se lee en este teléfono y no se sube a ningún servidor.</p>' +
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
    function matchFiltro(a, f) { if (f === 'ptvac') { var PD = panelOK() ? panelDatos() : null; return !!(PD && PD.pr && PD.pr.vac[a.rp]); } if (f === 'itop' || f === 'ipeor') { var V = idxDe(a); return !!V && V.tier === (f === 'itop' ? 'top' : 'peor'); } return f === 'todas' || (f === 'descarte' ? !!a.rech : f === 'venta' ? paraVenta(a) : f === 'pcelo' ? !!a.celo : a.estado === f); }
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
        if (f === 'ptvac') return a.pFecha || '9999'; // parto más antiguo = más días de parida
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
      if (panelOK() && (state.cat === 'todas' || state.cat === 'vaca' || state.cat === 'seca')) { var PDv = panelDatos(); if (PDv.pr && PDv.pr.PP) fl.push(['ptvac', 'Por preñar', L.filter(function (a) { return PDv.pr.vac[a.rp]; }).length]); }
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
        var tit = f === 'ptvac' ? 'por preñar (más días de paridas primero)' : f === 'prenada' ? 'por fecha de parto' : f === 'servida' ? 'servicio más antiguo primero' : f === 'descarte' ? 'descarte programado' : f === 'venta' ? 'para venta, menos litros primero' : f === 'pcelo' ? 'preñadas con celo registrado' : '';
        // por preñar: el orden es por días de parida, así que se muestran en cada fila
        var refP = DB.fecha || today(), subP = function (a) { return a.pFecha ? '<b>' + A.diffDays(refP, a.pFecha) + ' días de parida</b> · ' + subDefault(a) : subDefault(a); };
        html = '<h2 class="h">' + list.length + ' ' + (f === 'ptvac' ? (list.length === 1 ? 'vaca' : 'vacas') : nombreGrupo(list.length)) + (tit ? ', ' + tit : '') + '</h2>' + list.slice(0, state.n).map(function (a) { return f === 'ptvac' ? rowHTML(a, { sub: subP(a) }) : rowHTML(a); }).join('');
        if (list.length > state.n) html += '<button class="btn more" data-a="mas">Mostrar más (' + (list.length - state.n) + ' restantes)</button>';
      }
      box.innerHTML = html;
      // el filtro elegido siempre a la vista (p. ej. "Por preñar" al venir del panel queda al final de la fila de filtros)
      var fs = document.querySelector('.filters'), ch = fs && fs.querySelector('[aria-pressed="true"]');
      if (ch) { var rf = fs.getBoundingClientRect(), rc = ch.getBoundingClientRect(); if (rc.left < rf.left || rc.right > rf.right) fs.scrollLeft += rc.left - rf.left - (rf.width - rc.width) / 2; }
    }

    /* ----- pestaña Tareas ----- */
    var SECS = [45, 50, 60, 65];
    var VENT = [[7, '7 días'], [30, '30 días'], [90, '90 días'], [183, '6 meses'], [365, '12 meses']];
    // seca o vaquillona preñada en los últimos 30 días antes del parto probable (como en Rodeo por mes)
    function enPreparto(a) {
      if (a.estado !== 'prenada' || (a.cat !== 'seca' && a.cat !== 'vaquillona')) return false;
      var hoy = today(), pp = A.derive(a, hoy).partoProb || a.partoProb; if (!pp) return false;
      var d = A.diffDays(pp, hoy); return d >= 0 && d <= A.PREPARTO;
    }
    // preñada con el parto probable vencido hace más de 30 días (solo modo veterinario): dato a revisar con el productor
    var ATRASO_DIAS = 30;
    function partoAtrasado(a) {
      if (a.estado !== 'prenada' || (a.cat !== 'vaca' && a.cat !== 'seca')) return null;
      var hoy = today(), pp = A.derive(a, hoy).partoProb || a.partoProb; if (!pp) return null;
      var d = A.diffDays(hoy, pp); return d > ATRASO_DIAS ? { pp: pp, d: d } : null;
    }
    function secTareas(key, titulo, nota, items, mapRow, vacio) {
      var abierta = !!state.abiertas[key], lim = abierta ? items.length : 12;
      // cada lista arranca plegada: título y cantidad; se despliega tocando el título
      var desp = !!(state.desp && state.desp[key]);
      var ds = descDe(key);
      var h = '<section class="sec' + (desp ? ' open' : '') + '"><button class="sechead" data-desp="' + key + '" aria-expanded="' + desp + '"><span class="pttl"><h2>' + titulo + '</h2>' + (ds ? '<small class="pdesc">' + esc(ds) + '</small>' : '') + '</span><span class="count">' + items.length + '</span>' +
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
    /* ----- Inseminadores: liquidación por número de servicio de las preñeces confirmadas en los tactos del período ----- */
    var INS_B = [['1', '1er servicio'], ['2', '2º servicio'], ['3', '3er servicio'], ['4', '4º o más'], ['T', 'Toro']];
    function insPrecios() { var p = null; try { p = JSON.parse(getP('insprec')); } catch (e) {} return p || { '1': null, '2': null, '3': null, '4': null, 'T': 0 }; }
    function insTactosSesiones() {
      var c = {}; Object.keys(DB.hist || {}).forEach(function (k) { (DB.hist[k].ta || []).forEach(function (t) { c[t[0]] = (c[t[0]] || 0) + 1; }); });
      return Object.keys(c).filter(function (d) { return c[d] >= 3; }).sort();
    }
    function insFechas() {
      if (!state.insD1) state.insD1 = getP('insd1');
      if (!state.insD0) state.insD0 = getP('insd0');
      if (!state.insD1 || !state.insD0) {
        var S = insTactosSesiones(), last = S.length ? S[S.length - 1] : (DB.fecha || today());
        state.insD1 = state.insD1 || last; state.insD0 = state.insD0 || A.addDays(state.insD1, -30);
      }
      return [state.insD0, state.insD1];
    }
    // cada preñez se paga una sola vez: en el primer tacto positivo posterior al servicio que la originó
    function insCalc(d0, d1) {
      var R = { items: [], tactos: {} }, L = [];
      DB.animales.forEach(function (a) { if (DB.hist[a.rp]) L.push({ rp: a.rp, a: a, h: DB.hist[a.rp] }); });
      (DB.bajas || []).forEach(function (b) { if (DB.hist[b.key]) L.push({ rp: b.rp, a: b, h: DB.hist[b.key], baja: true }); });
      L.forEach(function (x) {
        var h = x.h, ta = h.ta || [], ev = h.ev || [], pa = h.pa || [];
        ta.forEach(function (t) {
          if (t[0] < d0 || t[0] > d1 || !esPren(t[1])) return;
          var lpf = '0000'; pa.forEach(function (p) { if (p[0] < t[0]) lpf = p[0]; });
          var sv = ev.filter(function (e) { return e[1] === 'S' && e[0] > lpf && e[0] < t[0]; });
          var ok = sv.filter(function (e) { return A.diffDays(t[0], e[0]) >= 25; }), conc = ok.length ? ok[ok.length - 1] : null;
          var desde = conc ? conc[0] : lpf;
          if (ta.some(function (u) { return u[0] > desde && u[0] < t[0] && esPren(u[1]); })) return; // reconfirmación: ya se pagó
          var toro = !conc || /^(toro|monta|natural)\b/i.test(String(conc[2] || '').trim());
          var n = conc ? sv.indexOf(conc) + 1 : null;
          R.items.push({ rp: x.rp, a: x.a, baja: !!x.baja, t: t[0], s: conc ? conc[0] : null, n: n, toro: conc ? conc[2] || '' : '', ins: toro ? null : (String(conc[3] || '').trim() || 'Sin dato de inseminador'), b: toro ? 'T' : n >= 4 ? '4' : String(n) });
          R.tactos[t[0]] = (R.tactos[t[0]] || 0) + 1;
        });
      });
      R.items.sort(function (p, q) { return p.t < q.t ? -1 : p.t > q.t ? 1 : p.rp.localeCompare(q.rp, 'es', { numeric: true }); });
      return R;
    }
    function insResumen(items, P) {
      var r = { c: {}, m: {}, n: 0, tot: 0 };
      INS_B.forEach(function (b) { r.c[b[0]] = 0; r.m[b[0]] = 0; });
      items.forEach(function (it) { r.c[it.b]++; r.n++; });
      INS_B.forEach(function (b) { r.m[b[0]] = r.c[b[0]] * (+P[b[0]] || 0); r.tot += r.m[b[0]]; });
      return r;
    }
    function insLista() { return Object.keys((state.insR || { items: [] }).items.reduce(function (o, it) { if (it.ins) o[it.ins] = 1; return o; }, {})).sort(); }
    function insSel() { var s = state.insSel || ''; return s && insLista().indexOf(s) < 0 ? '' : s; }
    function insItemsSel() { var s = insSel(), R = state.insR || { items: [] }; return s ? R.items.filter(function (it) { return it.ins === s; }) : R.items; }
    function pesos(n) { return '$ ' + Math.round(n || 0).toLocaleString('es-UY'); }
    function insCSS() { if (document.getElementById('insCss')) return; var st = document.createElement('style'); st.id = 'insCss'; st.textContent = '.inscard{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:12px 14px;margin:0 0 12px}.inscard h4{margin:0 0 8px;font-size:12.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:700}.insper{display:grid;grid-template-columns:1fr 1fr;gap:10px}.insper label{display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600;color:var(--muted);min-width:0}.insper input{width:100%;box-sizing:border-box;min-height:46px;font:inherit;font-size:16px;font-weight:700;color:var(--ink);padding:6px 10px;border:1.5px solid var(--line);border-radius:10px;background:var(--bg);-webkit-appearance:none;appearance:none}.inspr{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 0;border-top:1px solid var(--line)}.inspr:first-of-type{border-top:0}.inspr span{font-size:15.5px;font-weight:600;color:var(--ink)}.inspr .pin{display:flex;align-items:center;gap:6px;color:var(--muted);font-weight:700}.inspr input{width:110px;box-sizing:border-box;min-height:44px;font:inherit;font-size:17px;font-weight:700;text-align:right;color:var(--ink);padding:6px 10px;border:1.5px solid var(--line);border-radius:10px;background:var(--bg);-webkit-appearance:none;appearance:none}.insper input:focus,.inspr input:focus{border-color:var(--gold);outline:none}.inscalc{width:100%;margin:0 0 14px}.instot{display:flex;align-items:baseline;justify-content:space-between;gap:10px;background:var(--navy);color:#fff;border-radius:14px;padding:14px 16px;margin:10px 0 4px}.instot small{display:block;font-size:12.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--gold);font-weight:700}.instot b{font-size:28px;font-variant-numeric:tabular-nums}.instot span{font-size:15px;opacity:.9;text-align:right}.instbl{margin:6px 0 12px}.instbl tr.tot td{font-size:16px}.insdet tr[data-rp]{cursor:pointer}.insbtns{display:grid;grid-template-columns:1fr;gap:8px;margin:4px 0 12px}.insses{margin:6px 0 10px;font-size:13.5px;color:var(--muted)}.inscor{margin:12px 0 10px;font-size:15px;font-weight:700;color:var(--ink);line-height:1.4}.inscor small{font-weight:600;color:var(--muted)}.insfb{display:flex;flex-direction:column;align-items:flex-start;gap:2px;min-height:56px;padding:8px 12px;border:1.5px solid var(--line);border-radius:10px;background:var(--bg);color:var(--ink);font:inherit;cursor:pointer;text-align:left}.insfb small{font-size:12.5px;font-weight:600;color:var(--muted)}.insfb b{font-size:17px;font-variant-numeric:tabular-nums}.insfb.on{border-color:var(--gold);box-shadow:0 0 0 2px var(--gold) inset}.inscal{margin-top:12px}.ichead{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}.ichead b{font-size:16px;text-transform:capitalize}.ichead button{width:44px;height:40px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--ink);font-size:22px;cursor:pointer}.icgrid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}.icw{text-align:center;font-size:12px;font-weight:700;color:var(--muted);padding:2px 0}.icd{position:relative;height:44px;border:0;border-radius:10px;background:transparent;color:var(--ink);font:inherit;font-size:15px;font-weight:600;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.05;font-variant-numeric:tabular-nums}.icd small{font-size:10px;font-weight:700;opacity:.85}.icd.icin{background:color-mix(in srgb,var(--gold) 14%,transparent)}.icd.ict{background:var(--gold);color:#14233F;font-weight:800}.icd.icend{box-shadow:0 0 0 2.5px var(--navy) inset}.icd.icsel{background:var(--navy);color:#fff}.icd.ict.icsel{box-shadow:0 0 0 3px var(--gold) inset}.icley{display:flex;align-items:center;gap:6px;margin:8px 0 0;font-size:12.5px;color:var(--muted)}.icdot{width:12px;height:12px;border-radius:4px;background:var(--gold);display:inline-block}@media (prefers-color-scheme:dark){.insper input,.inspr input{color-scheme:dark}.instot{border:1px solid var(--gold)}.icd.icend{box-shadow:0 0 0 2.5px var(--ink) inset}.icd.icsel{background:var(--ink);color:var(--bg)}}'; document.head.appendChild(st); }
    // calendario propio: marca los días con tacto (con cuántos animales se tactaron) para elegir el período
    function insTactosDias() { var c = {}; Object.keys(DB.hist || {}).forEach(function (k) { (DB.hist[k].ta || []).forEach(function (t) { c[t[0]] = (c[t[0]] || 0) + 1; }); }); return c; }
    function insCalHTML(F) {
      var k = state.insCal; if (!k) return '';
      var sel = k === 'd0' ? F[0] : F[1], m = state.insCalM || sel.slice(0, 7), y = +m.slice(0, 4), mo = +m.slice(5, 7);
      var C = insTactosDias(), MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
      var first = new Date(y, mo - 1, 1, 12), off = (first.getDay() + 6) % 7, dim = new Date(y, mo, 0).getDate();
      var h = '<div class="inscal"><div class="ichead"><button data-icm="-1" aria-label="Mes anterior">‹</button><b>' + MES[mo - 1] + ' ' + y + '</b><button data-icm="1" aria-label="Mes siguiente">›</button></div>' +
        '<div class="icgrid">' + ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(function (d) { return '<span class="icw">' + d + '</span>'; }).join('');
      for (var i = 0; i < off; i++) h += '<span></span>';
      for (var d = 1; d <= dim; d++) {
        var f = y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0'), n = C[f] || 0;
        var cls = (n ? ' ict' : '') + (f === sel ? ' icsel' : '') + (f > F[0] && f < F[1] ? ' icin' : '') + (f === F[0] || f === F[1] ? ' icend' : '');
        h += '<button class="icd' + cls + '" data-icd="' + f + '"' + (n ? ' aria-label="' + d + ', tacto de ' + n + ' animales"' : '') + '>' + d + (n ? '<small>' + n + '</small>' : '') + '</button>';
      }
      var meses = {}; Object.keys(C).forEach(function (f) { if (f.slice(0, 7) === m) meses[f] = C[f]; });
      return h + '</div><p class="icley"><span class="icdot"></span> Día con tacto (número: animales tactados)</p></div>';
    }
    function insHTML() {
      insCSS();
      var key = 'insem', desp = !!(state.desp && state.desp[key]);
      var h = '<section class="sec' + (desp ? ' open' : '') + '"><button class="sechead" data-desp="' + key + '" aria-expanded="' + desp + '"><span class="pttl"><h2>Inseminadores</h2><small class="pdesc">' + descDe(key) + '</small></span>' +
        '<svg class="chev" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
      if (!desp) return h + '</section>';
      if (!DB.hist) return h + '<p class="hint">Para liquidar a los inseminadores hace falta cargar el respaldo con el historial de servicios y tactos.</p></section>';
      var F = insFechas(), P = insPrecios();
      h += '<p class="secnote">Se paga cada preñez confirmada en los tactos del período, según el número de servicio en que quedó preñada. Cada preñez se paga una sola vez.</p>' +
        '<div class="inscard"><h4>Período de tactos</h4><div class="insper">' + [['d0', 'Desde', F[0]], ['d1', 'Hasta', F[1]]].map(function (q) { return '<button class="insfb' + (state.insCal === q[0] ? ' on' : '') + '" data-icf="' + q[0] + '" aria-expanded="' + (state.insCal === q[0]) + '"><small>' + q[1] + '</small><b>' + A.fmt(q[2]) + '</b></button>'; }).join('') + '</div>' + insCalHTML(F) + '</div>' +
        '<div class="inscard"><h4>Precio por preñez</h4>' + INS_B.map(function (b) {
          return '<label class="inspr"><span>' + b[1] + '</span><span class="pin">$<input type="number" inputmode="decimal" min="0" data-ip="' + b[0] + '" value="' + (P[b[0]] != null ? P[b[0]] : '') + '" placeholder="0"></span></label>';
        }).join('') + '</div>' +
        '<button class="btn primary big inscalc" data-a="inscalc">Calcular</button>';
      var R = state.insR;
      if (R && R.d0 === F[0] && R.d1 === F[1]) {
        var I = insLista(), s = insSel();
        if (I.length > 1) h += '<div class="filters" role="group" aria-label="Inseminador"><button class="fchip plain" data-insel="" aria-pressed="' + !s + '">Todos</button>' + I.map(function (k) { return '<button class="fchip plain" data-insel="' + esc(k) + '" aria-pressed="' + (s === k) + '">' + esc(k) + '</button>'; }).join('') + '</div>';
        var its = insItemsSel(), r = insResumen(its, P);
        if (its.length) { var ct = its.reduce(function (o, it) { o[it.t] = (o[it.t] || 0) + 1; return o; }, {}), tf = Object.keys(ct).sort();
          h += '<p class="inscor">' + (tf.length === 1 ? 'Corresponde al tacto del ' : 'Corresponde a los tactos del ') + tf.map(function (d) { return A.fmt(d) + ' <small>(' + ct[d] + ' preñ.)</small>'; }).join(tf.length === 2 ? ' y ' : ', ') + '</p>'; }
        else h += '<p class="inscor">No hay preñeces confirmadas por tacto en este período.</p>';
        h += '<div class="instot"><div><small>Total' + (s ? ' · ' + esc(s) : '') + '</small><b>' + pesos(r.tot) + '</b></div><span>' + r.n + (r.n === 1 ? ' preñez' : ' preñeces') + '</span></div>';
        h += '<table class="tbl instbl"><thead><tr><th>Servicio</th><th>Preñadas</th><th>$ c/u</th><th>$</th></tr></thead><tbody>' +
          INS_B.filter(function (b) { return b[0] !== 'T' || !s; }).map(function (b) { return '<tr><td>' + b[1] + '</td><td>' + r.c[b[0]] + '</td><td>' + (P[b[0]] != null && P[b[0]] !== '' ? nf(+P[b[0]]) : '–') + '</td><td>' + nf(r.m[b[0]]) + '</td></tr>'; }).join('') +
          '<tr class="sep tot"><td><b>Total' + (s ? ' ' + esc(s) : '') + '</b></td><td><b>' + r.n + '</b></td><td></td><td><b>' + pesos(r.tot) + '</b></td></tr></tbody></table>';
        if (!s && I.length > 1) {
          h += '<h3 class="vh3">Por inseminador</h3><table class="tbl instbl"><thead><tr><th>Inseminador</th><th>Preñadas</th><th>$</th></tr></thead><tbody>' +
            I.map(function (k) { var q = insResumen(R.items.filter(function (it) { return it.ins === k; }), P); return '<tr><td><b>' + esc(k) + '</b></td><td>' + q.n + '</td><td>' + nf(q.tot) + '</td></tr>'; }).join('') + '</tbody></table>';
        }
        if (INS_B.some(function (b) { return b[0] !== 'T' && (P[b[0]] == null || P[b[0]] === ''); })) h += '<p class="hint">Faltan precios: cargalos arriba y tocá Calcular.</p>';
        h += '<div class="insbtns"><button class="btn share" data-a="inswa"' + (r.n ? '' : ' disabled') + '>Enviar comprobante por WhatsApp</button><button class="btn share" data-a="instk"' + (r.n ? '' : ' disabled') + '>Ticket (imagen)</button></div>';
        var ab = !!state.insVer;
        h += '<button class="despbtn" data-a="insver" aria-expanded="' + ab + '"><span>Ver las ' + its.length + ' vacas</span><span class="chev">' + (ab ? 'ocultar' : 'ver') + '</span></button>';
        if (ab) h += '<table class="tbl instbl insdet"><thead><tr><th>Caravana</th><th>Serv.</th><th>Fecha serv.</th><th>Tacto</th></tr></thead><tbody>' + its.map(function (it) {
          return '<tr' + (it.baja ? '' : ' data-rp="' + esc(it.rp) + '"') + '><td><b>' + esc(it.rp) + '</b>' + (it.baja ? ' <small>baja</small>' : '') + (!s && it.ins ? '<br><small>' + esc(it.ins) + '</small>' : '') + '</td><td>' + (it.b === 'T' ? 'Toro' : it.n) + '</td><td>' + (it.s ? A.fmt(it.s).slice(0, 5) : '–') + (it.toro && it.b !== 'T' ? '<br><small>' + esc(it.toro) + '</small>' : '') + '</td><td>' + A.fmt(it.t).slice(0, 5) + '</td></tr>';
        }).join('') + '</tbody></table>';
      }
      return h + '</section>';
    }
    // fechas de los tactos que originan la liquidación (de lo seleccionado: todos o un inseminador)
    function insTactosDe(its) { return Object.keys(its.reduce(function (o, it) { o[it.t] = 1; return o; }, {})).sort(); }
    function insCorresp(its) { var f = insTactosDe(its).map(A.fmt); if (!f.length) return ''; return (f.length === 1 ? 'Corresponde al tacto del ' : 'Corresponde a los tactos del ') + (f.length === 1 ? f[0] : f.slice(0, -1).join(', ') + ' y ' + f[f.length - 1]); }
    function insTitulo() { var s = insSel(); return 'Liquidación inseminación' + (s ? ' — ' + s : ''); }
    function insComprobanteWA() {
      var R = state.insR; if (!R) return;
      var P = insPrecios(), s = insSel(), its = insItemsSel(), r = insResumen(its, P);
      var txt = '*' + insTitulo() + '*\n' + (PERFIL.nombre ? PERFIL.nombre + '\n' : '') + insCorresp(its) + '\n\n' +
        INS_B.filter(function (b) { return (b[0] !== 'T' || !s) && r.c[b[0]]; }).map(function (b) { return b[1] + ': ' + r.c[b[0]] + ' × ' + pesos(+P[b[0]] || 0) + ' = ' + pesos(r.m[b[0]]); }).join('\n') +
        '\n\n*Total: ' + r.n + (r.n === 1 ? ' preñez' : ' preñeces') + ' · ' + pesos(r.tot) + '*';
      if (!s) { var I = insLista(); if (I.length > 1) txt += '\n\n' + I.map(function (k) { var q = insResumen(R.items.filter(function (it) { return it.ins === k; }), P); return k + ': ' + q.n + ' · ' + pesos(q.tot); }).join('\n'); }
      txt += '\n\nEmitido ' + A.fmt(today()) + ' · Libreta de vacas';
      if (navigator.share) navigator.share({ text: txt }).catch(function () {});
      else window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank');
    }
    // ticket: imagen tipo recibo (PNG) para compartir o guardar
    function insTicket() {
      var R = state.insR; if (!R) return;
      var P = insPrecios(), s = insSel(), its = insItemsSel(), r = insResumen(its, P), I = s ? [] : insLista();
      var filas = INS_B.filter(function (b) { return (b[0] !== 'T' || !s); });
      var W = 720, pad = 48, lh = 46, H = 2400;
      var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      var g = cv.getContext('2d'), navy = '#1B2A4A', gold = '#B8963E', mut = '#5f6b7a';
      g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
      g.fillStyle = navy; g.fillRect(0, 0, W, 10);
      var y = 70, txt = function (t, x, al, font, col) { g.font = font; g.fillStyle = col || navy; g.textAlign = al; g.fillText(t, x, y); };
      var linea = function (dash) { g.strokeStyle = '#c9ced6'; g.lineWidth = 2; g.setLineDash(dash ? [8, 8] : []); g.beginPath(); g.moveTo(pad, y); g.lineTo(W - pad, y); g.stroke(); g.setLineDash([]); };
      txt('LIQUIDACIÓN INSEMINACIÓN', W / 2, 'center', 'bold 32px system-ui,sans-serif'); y += 42;
      if (PERFIL.nombre) { txt(PERFIL.nombre, W / 2, 'center', '600 26px system-ui,sans-serif', gold); y += 38; }
      if (s) { txt('Inseminador: ' + s, W / 2, 'center', 'bold 26px system-ui,sans-serif'); y += 38; }
      (function () {
        var f = insTactosDe(its).map(A.fmt), pre = f.length === 1 ? 'Corresponde al tacto del' : 'Corresponde a los tactos del';
        txt(pre, W / 2, 'center', '24px system-ui,sans-serif', mut); y += 34;
        var ls = [], cur = '', font = 'bold 26px system-ui,sans-serif'; g.font = font;
        f.forEach(function (d, i) { var pz = d + (i < f.length - 2 ? ',' : i === f.length - 2 ? ' y' : ''), t = cur ? cur + ' ' + pz : pz; if (g.measureText(t).width > W - 2 * pad && cur) { ls.push(cur); cur = pz; } else cur = t; });
        if (cur) ls.push(cur);
        ls.forEach(function (l, i) { txt(l, W / 2, 'center', font); y += i < ls.length - 1 ? 34 : 30; });
      })();
      linea(true); y += 44;
      txt('Servicio', pad, 'left', 'bold 22px system-ui,sans-serif', mut); txt('Cant.', 360, 'right', 'bold 22px system-ui,sans-serif', mut); txt('$ c/u', 500, 'right', 'bold 22px system-ui,sans-serif', mut); txt('$', W - pad, 'right', 'bold 22px system-ui,sans-serif', mut); y += lh;
      filas.forEach(function (b) {
        txt(b[1], pad, 'left', '26px system-ui,sans-serif'); txt(String(r.c[b[0]]), 360, 'right', '26px system-ui,sans-serif'); txt(nf(+P[b[0]] || 0), 500, 'right', '26px system-ui,sans-serif', mut); txt(nf(r.m[b[0]]), W - pad, 'right', '26px system-ui,sans-serif'); y += lh;
      });
      y -= 18; linea(false); y += 50;
      txt('TOTAL', pad, 'left', 'bold 32px system-ui,sans-serif'); txt(String(r.n), 360, 'right', 'bold 30px system-ui,sans-serif'); txt(pesos(r.tot), W - pad, 'right', 'bold 34px system-ui,sans-serif'); y += 30;
      if (I.length > 1) {
        linea(true); y += 44; txt('Por inseminador', pad, 'left', 'bold 22px system-ui,sans-serif', mut); y += lh;
        I.forEach(function (k) { var q = insResumen(R.items.filter(function (it) { return it.ins === k; }), P); txt(k, pad, 'left', '26px system-ui,sans-serif'); txt(String(q.n), 360, 'right', '26px system-ui,sans-serif'); txt(pesos(q.tot), W - pad, 'right', '26px system-ui,sans-serif'); y += lh; });
        y -= 16;
      }
      y += 30; linea(true); y += 40;
      txt('Emitido ' + A.fmt(today()), W / 2, 'center', '20px system-ui,sans-serif', mut); y += 30;
      txt('Libreta de vacas · Dr. Mauro Torterolo', W / 2, 'center', '20px system-ui,sans-serif', mut);
      // se recorta a lo dibujado (el alto depende de cuántas líneas lleva el encabezado y de cuántos inseminadores hay)
      var Hf = Math.ceil(y + 36), cf = document.createElement('canvas'); cf.width = W; cf.height = Hf;
      var gf = cf.getContext('2d'); gf.drawImage(cv, 0, 0); gf.fillStyle = gold; gf.fillRect(0, Hf - 10, W, 10); cv = cf;
      var nombre = ('Ticket inseminacion ' + (s ? s + ' ' : '') + (PERFIL.nombre || '') + ' ' + R.d1).replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim() + '.png';
      cv.toBlob(function (bl) {
        if (!bl) { toast('No se pudo armar el ticket.'); return; }
        var file = null; try { file = new File([bl], nombre, { type: 'image/png' }); } catch (e) {}
        var guardar = function () { var u = URL.createObjectURL(bl), el = document.createElement('a'); el.href = u; el.download = nombre; document.body.appendChild(el); el.click(); el.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 4000); toast('Ticket guardado en Descargas'); };
        if (file && navigator.canShare && navigator.canShare({ files: [file] })) navigator.share({ files: [file], title: nombre }).catch(function (e) { if (!e || e.name !== 'AbortError') guardar(); });
        else guardar();
      }, 'image/png');
    }
    function tareasHTML() {
      var t = A.tareas(DB.animales.filter(function (a) { return a.cat !== 'ternera'; }), today(), state.ventana), vtxt = (VENT.filter(function (v) { return v[0] === state.ventana; })[0] || [0, ''])[1];
      var fs = fechaSecado(), sec = listaSecado(fs);
      state.secarLista = sec;
      var secChips = '<div class="secsel"><span>Secar a</span>' + SECS.map(function (n) { return '<button class="fchip plain" data-sec="' + n + '" aria-pressed="' + (A.SECADO === n) + '">' + n + '</button>'; }).join('') + '<span>días del parto</span></div>';
      var chips = '<div class="filters" role="group" aria-label="Ventana de tiempo">' + VENT.map(function (v) {
        return '<button class="fchip plain" data-v="' + v[0] + '" aria-pressed="' + (state.ventana === v[0]) + '">' + v[1] + '</button>';
      }).join('') + '</div>';
      var grp = function (t, html) { return '<p class="grp">' + t + '</p><div class="glist">' + html + '</div>'; };
      var lrow = function (a, t, d) { return '<button class="lrow" data-a="' + a + '"><span class="lico"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="pttl"><h2>' + t + '</h2><small class="pdesc">' + d + '</small></span><svg class="chev rt" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>'; };
      return '<h1 class="ptitle">Tareas</h1>' + (esVet() ? '<button class="voyent" data-a="voy"><span><b>Voy mañana</b><small>Lo que hay que ver en la visita de mañana</small></span><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' : '') + grp('Para hacer',
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
        secTareas('partos', 'Próximos partos', chips + '<p class="secnote">Partos probables en los próximos ' + vtxt + '.</p>', t.partos, function (x) {
          return rowHTML(x.a, { right: '<span class="when">' + A.rel(x.dias) + '</span>', sub: 'Parto probable ' + A.fmt(x.fecha) });
        }, 'Ningún parto probable en los próximos ' + vtxt + '.') +
        (esVet() ? (function () {
          var L = DB.animales.map(function (a) { var pa = partoAtrasado(a); return pa ? { a: a, pp: pa.pp, d: pa.d } : null; }).filter(Boolean).sort(function (x, y) { return y.d - x.d; });
          return secTareas('atrasados', 'Partos atrasados', '<p class="secnote">Preñadas con el parto probable vencido hace más de ' + ATRASO_DIAS + ' días. Puede faltar cargar un parto, un aborto o la baja: revisarlo con el productor.</p>', L, function (x) {
            return rowHTML(x.a, { right: '<span class="when late">' + x.d + ' días</span>', sub: 'Parto probable ' + A.fmt(x.pp) + (x.a.tFecha ? ' · tacto ' + A.fmt(x.a.tFecha) : '') });
          }, 'No hay partos atrasados.');
        })() : '')) +
        grp('Listas para llevar', lrow('exptactar', 'Lista para revisación', 'Tacto, secado y venta, con todos los datos') + lrow('expparches', 'Listado de parches', 'Servidas entre X e Y días, paridas y vacías') + (esVet() ? lrow('expplanilla', 'Planilla de tacto', 'Vacas en ordeñe por caravana, para anotar en el corral') : '')) +
        grp('Gestión', secTareas('venta', 'Para venta', '<p class="secnote">Criterio: ' + esc(vtaTxt()) + '. <button class="lnk" data-a="vtacfg">Cambiar criterio</button></p>', DB.animales.filter(paraVenta).sort(function (x, y) { return x.pr[0] - y.pr[0]; }), function (a) {
          return rowHTML(a, { right: '<span class="vta">VENTA</span>', sub: nf(a.pr[0], 1) + ' lts · ' + nf(delDe(a)) + ' días en leche' + (a.rech ? ' · ' + esc(a.rechDet || a.rech) : '') });
        }, 'Ninguna vaca cumple el criterio de venta.') + insHTML());
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
    /* ----- simulación de descartes -----
       Aprende del tambo con qué litros salieron las vacas vendidas en los últimos 24 meses (último control dentro de los 60 días
       antes de la salida; mediana). Cada vaca en ordeñe con descarte programado o vacía sigue su curva (pendiente de sus últimos
       controles de la lactancia actual con más de 100 días, o la del rodeo) y sale cuando llega a ese nivel. Tope: los días en leche
       del 90 % de las vacas vendidas. Las preñadas con descarte programado salen como tarde al secado. Las secas vacías salen ya. */
    function medianaDe(v) { if (!v.length) return null; v = v.slice().sort(function (a, b) { return a - b; }); var m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; }
    function pctlDe(v, q) { if (!v.length) return null; v = v.slice().sort(function (a, b) { return a - b; }); return v[Math.min(v.length - 1, Math.floor(q * v.length))]; }
    function ctLac(a) { var h = DB.hist && DB.hist[a.rp]; if (!h || !h.ct || !a.pFecha) return []; return h.ct.filter(function (c) { return c[0] >= a.pFecha && c[1] > 0; }); }
    function pendiente(a) {
      var c = ctLac(a).filter(function (x) { return A.diffDays(x[0], a.pFecha) > 100; }).slice(-5);
      if (c.length < 3) return null;
      var n = c.length, mx = 0, my = 0, sxx = 0, sxy = 0, t0 = c[0][0];
      c.forEach(function (x) { mx += A.diffDays(x[0], t0) / n; my += x[1] / n; });
      c.forEach(function (x) { var dx = A.diffDays(x[0], t0) - mx; sxx += dx * dx; sxy += dx * (x[1] - my); });
      return sxx ? sxy / sxx : null;
    }
    function modeloDescarte() {
      if (state.mdesc && state.mdesc.db === DB) return state.mdesc.m;
      var hoy = today(), desde = A.addDays(DB.fecha || hoy, -730), L = [], DL = [], nV = 0;
      var tipos = { venta: 1 };
      var bj = (DB.bajas || []).filter(function (b) { return b.bFecha && b.bFecha >= desde && (b.cat === 'vaca' || b.cat === 'seca' || !b.cat); });
      if (bj.filter(function (b) { return b.bTipo === 'venta'; }).length < 5) tipos.baja = 1;
      bj.forEach(function (b) {
        if (!tipos[b.bTipo]) return; nV++;
        var h = DB.hist && DB.hist[b.key]; if (!h || !h.ct) return;
        var u = null; h.ct.forEach(function (c) { if (c[0] <= b.bFecha && A.diffDays(b.bFecha, c[0]) <= 60 && c[1] > 0) u = c; });
        if (!u) return;
        var p = null; (h.pa || []).forEach(function (x) { if (x[0] <= u[0]) p = x[0]; });
        if (p && A.diffDays(u[0], p) < 30) return; // salió recién parida: no es por producción
        L.push(u[1]); if (p) DL.push(A.diffDays(b.bFecha, p));
      });
      var sl = []; DB.animales.forEach(function (a) { if ((a.cat || 'vaca') === 'vaca') { var k = pendiente(a); if (k != null && k < 0 && k > -0.5) sl.push(k); } });
      var m = L.length >= 5 ? { L: medianaDe(L), n: L.length, nV: nV, del: DL.length ? medianaDe(DL) : 305, p90: DL.length >= 5 ? pctlDe(DL, 0.9) : 500, pend: sl.length >= 5 ? medianaDe(sl) : -0.05, tipos: tipos } : { n: L.length, nV: nV };
      state.mdesc = { db: DB, m: m };
      return m;
    }
    function salidasDescarte(m) {
      var hoy = today(), min = A.addDays(hoy, 1), out = [];
      DB.animales.forEach(function (a) {
        var c = a.cat || 'vaca', d = A.derive(a, hoy), pren = a.estado === 'prenada';
        if (c !== 'vaca' && c !== 'seca') return;
        if (!a.rech && a.estado !== 'vacia') return;
        if (pren && !a.rech) return;
        var f, mot = a.rech ? 'Descarte programado' : 'Vacía', como;
        if (c === 'seca') { if (pren) return; f = min; como = 'seca, sale ya'; }
        else {
          var ct = ctLac(a), u = ct[ct.length - 1], k = pendiente(a), kk = k != null && k < 0 ? k : m.pend;
          if (u) {
            if (u[1] <= m.L) { f = min; como = u[1].toFixed(1).replace('.', ',') + ' L, ya está en el nivel de salida'; }
            else { f = A.addDays(u[0], Math.round((u[1] - m.L) / -kk)); como = u[1].toFixed(1).replace('.', ',') + ' L al ' + A.fmt(u[0]).slice(0, 5) + (k != null && k < 0 ? '' : ' (curva del rodeo)'); }
          } else if (typeof a.pr[0] === 'number' && a.pr[0] <= m.L) { f = min; como = a.pr[0] + ' L'; }
          else { f = a.pFecha ? A.addDays(a.pFecha, Math.round(m.del)) : min; como = 'sin controles: días en leche de salida'; }
          if (a.pFecha) { var tope = A.addDays(a.pFecha, m.p90); if (f > tope && tope > min) { f = tope; como += ' · tope ' + Math.round(m.p90) + ' DEL'; } }
          if (pren && d.partoProb) { var S = A.addDays(d.partoProb, -A.SECADO); if (S < f) { f = S; como += ' · sale al secado'; } }
        }
        if (f < min) f = min;
        out.push({ a: a, f: f, mot: mot + (pren ? ' (preñada)' : ''), como: como });
      });
      return out.sort(function (x, y) { return x.f < y.f ? -1 : x.f > y.f ? 1 : numRp(x.a, y.a); });
    }
    // control: cuántas vacas salieron en los mismos meses de años anteriores (descartes = ventas y bajas; muertes aparte)
    function histDescarte(desde, hasta, nSim) {
      var B = (DB.bajas || []).filter(function (b) { return b.bFecha && (b.cat === 'vaca' || b.cat === 'seca' || !b.cat); });
      if (!B.length) return '';
      var prim = B.reduce(function (m, b) { return b.bFecha < m ? b.bFecha : m; }, '9999'), anios = [], sd = 0, sm = 0;
      var corre = function (f, n) { return (+f.slice(0, 4) - n) + f.slice(4); };
      for (var n = 1; n <= 2; n++) {
        var d = corre(desde, n), h = corre(hasta, n); if (d < prim) continue;
        var nd = 0, nm = 0; B.forEach(function (b) { if (b.bFecha >= d && b.bFecha <= h) { if (b.bTipo === 'muerte') nm++; else nd++; } });
        anios.push({ d: d, nd: nd, nm: nm }); sd += nd; sm += nm;
      }
      if (!anios.length) return '';
      var pd = Math.round(sd / anios.length), pm = Math.round(sm / anios.length), dif = pd - nSim;
      var det = anios.map(function (a) { return a.d.slice(0, 4) + '/' + String(+a.d.slice(0, 4) + 1).slice(2) + ': ' + a.nd + ' descartes, ' + a.nm + ' muertas'; }).join(' · ');
      return '<div class="simcmp' + (dif > Math.max(3, nSim * 0.15) ? ' falta' : '') + '"><b>Comparación con años anteriores</b>' +
        '<p>En los mismos meses salían en promedio <b>' + pd + '</b> vacas por descarte' + (pm ? ' y morían ' + pm : '') + '. La simulación saca <b>' + nSim + '</b>.' +
        (dif > Math.max(3, nSim * 0.15) ? ' Faltan unas ' + dif + ' vacas para llegar al nivel de otros años: puede haber vacas para descarte todavía sin marcar.' : -dif > Math.max(3, pd * 0.15) ? ' Es más que otros años: puede que no todas salgan tan rápido como dice la curva.' : '') + '</p>' +
        '<small>' + det + (anios.length < 2 ? ' (solo hay datos de un año)' : '') + '</small></div>';
    }
    function proyHTML() {
      if (state.simDesc === undefined) state.simDesc = getP('simdesc') === '1';
      var lim = limReal(), sim = !!state.simDesc, M = sim ? modeloDescarte() : null, SL = null, sal = null;
      if (M && M.L != null) { SL = salidasDescarte(M); sal = {}; SL.forEach(function (x) { sal[x.a.rp] = x.f; }); }
      var P0 = A.proyeccion(DB.animales, today(), 10, lim).filter(function (r) { return r.okPre; });
      var P = sal ? A.proyeccion(DB.animales, today(), 10, lim, sal).filter(function (r) { return r.okPre; }) : P0, N = P.length;
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
      var sm = function (v, v0) { return sal && v !== v0 ? v + '<small class="psinv">' + v0 + '</small>' : v; };
      var filas = P.map(function (r, i) { var r0 = P0[i]; return '<tr><td>' + (i === 0 ? 'Hoy' : r.label + ' ' + String(r.anio).slice(2)) + '</td><td>' + (r.okSec ? sm(r.ord, r0.ord) : '') + '</td><td>' + (r.okSec && r.delN ? Math.round(r.delS / r.delN) : '') + '</td><td>' + (r.okSec ? sm(r.sec, r0.sec) : '') + '</td><td>' + sm(r.pre - r.preQ, r0.pre - r0.preQ) + '</td><td>' + r.preQ + '</td></tr>'; }).join('');
      var simTxt = '';
      if (sim && !sal) simTxt = '<p class="simnota">No se puede simular: hacen falta al menos 5 vacas vendidas en los últimos 24 meses con un control en los 60 días antes de salir (hay ' + M.n + (M.nV ? ' de ' + M.nV + ' ventas' : '') + ').</p>';
      else if (sal) {
        var PU = P[N - 1], fin = PU.anio + '-' + ('0' + (A.MESES.indexOf(PU.label) + 1)).slice(-2) + '-15', nIn = SL.filter(function (x) { return x.f <= fin; }).length;
        var lt = SL.map(function (x) { return '<tr><td>' + esc(x.a.rp) + '</td><td>' + A.MESES[+x.f.slice(5, 7) - 1] + ' ' + x.f.slice(2, 4) + '</td><td>' + x.mot + '<small class="psinv">' + esc(x.como) + '</small></td></tr>'; }).join('');
        simTxt = '<p class="simnota">Salen cuando su curva baja a <b>' + M.L.toFixed(1).replace('.', ',') + ' L</b>: los litros con que se fueron las ' + M.n + ' vacas ' + (M.tipos.baja ? 'vendidas o dadas de baja' : 'vendidas') + ' de los últimos 24 meses (mediana del último control antes de salir). Ninguna pasa de ' + Math.round(M.p90) + ' días en leche (9 de cada 10 vendidas salieron antes). ' + nIn + (nIn === 1 ? ' vaca sale' : ' vacas salen') + ' antes de ' + PU.label + ' ' + String(PU.anio).slice(2) + (SL.length > nIn ? ' (' + (SL.length - nIn) + ' más después)' : '') + '. El número chico de la tabla es el rodeo sin descartes.</p>' + histDescarte(today(), fin, nIn) +
          (SL.length ? '<button class="despbtn" data-a="simlista" aria-expanded="' + !!state.simLista + '"><span>Vacas que salen (' + SL.length + ')</span><span class="chev">' + (state.simLista ? 'ocultar' : 'ver') + '</span></button>' +
          (state.simLista ? '<table class="tbl simtbl"><thead><tr><th>RP</th><th>Sale</th><th>Motivo</th></tr></thead><tbody>' + lt + '</tbody></table>' : '') : '');
      }
      return '<section class="card"><h2>Rodeo por mes</h2>' +
        '<label class="simsw"><input type="checkbox" id="simDesc"' + (sim ? ' checked' : '') + '><span>Simular descartes</span></label>' +
        '<div class="mleg"><span><i class="pord"></i>En ordeñe</span><span><i class="psec"></i>Secas</span><span><i class="ppre"></i>Preparto vacas</span><span><i class="pprq"></i>Preparto vaquillonas</span></div>' +
        '<svg class="mchart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Proyección de vacas en ordeñe, secas y preparto por mes">' + s + '</svg>' +
        '<table class="tbl ptbl ptbl6"><thead><tr><th>Mes</th><th>Ordeñe</th><th>DEL</th><th>Secas</th><th>Prep. vacas</th><th>Prep. vaq.</th></tr></thead><tbody>' + filas + '</tbody></table>' + simTxt +
        '<p class="cap">A mitad de cada mes. DEL: días en leche promedio de las vacas en ordeñe. Secado ' + A.SECADO + ' días antes del parto; preparto los últimos ' + A.PREPARTO + ' días (las vaquillonas entran al preparto ' + A.PREPARTO + ' días antes y después pasan a ordeñe). ' + (sal ? 'Con descartes simulados; no descuenta muertes.' : 'No descuenta descartes ni muertes, y las vacas no preñadas siguen en ordeñe.') + ' Solo con preñeces confirmadas por tacto: lo que todavía depende de vacas sin diagnóstico queda en blanco.</p></section>';
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
    function SRC() { return DB.origen === 'fosapp' ? 'FOSAPP' : DB.origen === 'sigea' ? 'SIGEA' : DB.origen === 'dhm' ? 'DHM' : DB.origen === 'delpro' ? 'DelPro' : 'SysCaw'; }
    function SRCbase() { return DB.origen === 'fosapp' ? 'base FOSAPP' : DB.origen === 'sigea' ? 'base SIGEA' : DB.origen === 'dhm' ? 'base DHM' : DB.origen === 'delpro' ? 'base DelPro' : 'respaldo SysCaw'; }
    function esVacia(c) { var x = DB.codes && DB.codes[c]; return !!x && x[2] === '1' && !/^(evnor|evol)/i.test(x[0] || ''); }
    function esPren(c) { var x = DB.codes && DB.codes[c]; return !!x && (x[2] != null ? x[2] === '2' : /^pr(e|ñ)/i.test(x[0] || '')); }
    /* ----- Panel: primera pantalla del productor, 4 indicadores con semáforo ----- */
    function panelOK() { return DB.fuente === 'syscaw' && !!DB.hist && !esOperario(); }
    var PANC = { k: null, r: null };
    function finTemporada(ini) { var y = +ini.slice(0, 4), m = +ini.slice(5, 7) + 9; if (m > 12) { y++; m -= 12; } return A.addDays(y + '-' + pad2(m) + '-01', +ini.slice(8, 10) - 2); }
    // vacas preñadas y por preñar: foto del rodeo adulto (vacas en ordeñe y secas), igual que la libreta.
    // Por preñar: no preñadas, sin descarte programado y con la espera voluntaria cumplida.
    function rodeoPren(pev, ref) {
      var R = { P: 0, PP: 0, E: 0, DS: 0, vac: {} };
      DB.animales.forEach(function (a) {
        if (a.cat !== 'vaca' && a.cat !== 'seca') return;
        if (a.estado === 'prenada') { R.P++; return; }
        if (a.rech) { R.DS++; return; }
        if (a.pFecha && A.diffDays(ref, a.pFecha) < pev) { R.E++; return; }
        R.PP++; R.vac[a.rp] = true;
      });
      R.pct = R.P + R.PP ? R.P / (R.P + R.PP) * 100 : null;
      return R;
    }
    // la misma foto hace un año, con el historial: preñada si el último tacto después del parto dio preñada y no hubo servicio después
    function rodeoPrenHist(L, D, pev) {
      var P = 0, PP = 0;
      L.forEach(function (x) {
        var h = x.h; if (x.a.bFecha && x.a.bFecha <= D) return;
        var pa = (h.pa || []).filter(function (q) { return q[0] <= D; }); if (!pa.length || !enSel(unidadEn(x, D))) return;
        var p = pa[pa.length - 1][0], ta = (h.ta || []).filter(function (t) { return t[0] > p && t[0] <= D; }), lt = ta[ta.length - 1];
        if (lt && esPren(lt[1]) && !h.ev.some(function (e) { return e[1] === 'S' && e[0] > lt[0] && e[0] <= D; })) { P++; return; }
        if (x.a.dFecha && x.a.dFecha <= D) return;
        if (A.diffDays(D, p) < pev) return;
        PP++;
      });
      return P + PP ? P / (P + PP) * 100 : null;
    }
    function panelDatos() {
      var ini = inicio21(), pev = pevActual(), ref = DB.fecha || today();
      var k = (DB.guardada || 0) + '|' + (DB.sel ? DB.sel.join(',') : '') + '|' + DB.animales.length + '|' + ini + '|' + pev + '|' + ref + '|' + today();
      if (PANC.k === k) return PANC.r;
      var R = { ref: ref, ini: ini, fin: finTemporada(ini) };
      // 1) reproducción cada 21 días: último ciclo terminado (servicio) y último ciclo con resultados (concepción)
      if (ini <= ref) {
        var an = DB.animales.map(function (a) { return { h: DB.hist[a.rp], salida: null, desc: a.dFecha || (a.rech ? '0000' : null) }; })
          .concat((DB.bajas || []).map(function (b) { return { h: DB.hist[b.key], salida: b.bFecha, desc: b.dFecha || null }; }));
        var C = []; try { C = A.ciclos21(an, esPren, ini, pev, ref); } catch (e) { C = []; }
        C.forEach(function (c) { if (c.fin < ref && c.aptas >= 10) R.cs = { n: c.n, ini: c.ini, v: c.serv / c.aptas * 100, serv: c.serv, aptas: c.aptas }; });
        C.forEach(function (c) {
          var dn = c.sOk + c.sMal + c.sPend, dr = c.sOk + c.sMal, tact = c.cerrado && c.sPend <= dn * 0.1;
          if (tact ? dr >= 10 : dn >= 10) R.cc = { n: c.n, ini: c.ini, tact: tact, v: (tact ? c.sOk / dr : (c.sOk + c.sPend) / dn) * 100, ok: tact ? c.sOk : c.sOk + c.sPend, de: tact ? dr : dn };
        });
      }
      // 2) vacas preñadas y por preñar hoy, y el % preñadas de hace un año
      var L = infLista();
      R.pr = rodeoPren(pev, ref);
      var refA = (+ref.slice(0, 4) - 1) + ref.slice(4);
      // contra el promedio de los 2 años anteriores (mismo día); si el historial no llega a 2 años, contra hace un año
      // (la foto de hace 2 años necesita historial completo desde un año antes: las bajas viejas traen solo sus últimos partos)
      var refB = (+ref.slice(0, 4) - 2) + ref.slice(4), dH = DB.desdeHist != null ? DB.desdeHist : A.addDays(ref, -730), vA = [];
      [refA, refB].forEach(function (d, i) { if (i === 0 ? d >= dH : (dH === '0000' || d >= A.addDays(dH, 365))) { var v = rodeoPrenHist(L, d, pev); if (v != null) vA.push(v); } });
      if (vA.length) { R.prA = vA.reduce(function (a, b) { return a + b; }, 0) / vA.length; R.prAn = vA.length; R.prAv = vA; }
      // 3) último diagnóstico de gestación (tacto) cargado, y vacas y vaquillonas pendientes de tacto
      // último día de tacto real: al menos 5 vacas en ordeñe tactadas ese día (no cuentan vaquillonas, secas ni diagnósticos sueltos
      // como un aborto cargado en la tabla de tactos)
      var TMIN = 5, porDia = {}, ut = null;
      DB.animales.forEach(function (a) {
        var h = DB.hist[a.rp]; if (!h || !h.ta) return;
        h.ta.forEach(function (t) {
          if (t[0] > ref) return;
          var lp = null; (h.pa || []).forEach(function (p) { if (p[0] < t[0]) lp = p; });
          if (!lp || (lp[5] && lp[5] <= t[0])) return; // sin parto (vaquillona) o ya secada
          porDia[t[0]] = (porDia[t[0]] || 0) + 1;
        });
      });
      Object.keys(porDia).forEach(function (d) { if (porDia[d] >= TMIN && (!ut || d > ut)) ut = d; });
      R.ultTactoN = ut ? porDia[ut] : null;
      R.ultTacto = ut;
      try { R.nTactar = A.tareas(DB.animales.filter(function (a) { return a.cat !== 'ternera'; }), today(), 30).tactar.length; } catch (e) { R.nTactar = null; }
      // 4) leche: litros por vaca del último mes con control, contra el mismo mes del año anterior
      var E = evolucion('lv'), u = E && E.meses[E.meses.length - 1];
      if (u && u.cur != null) R.le = { v: u.cur, prev: u.prev, mes: u.label, anio: u.anio };
      PANC = { k: k, r: R };
      return R;
    }
    var SEM = { v: 'ok', a: 'at', r: 'mal', g: 'nd' };
    // Panel en tablero 2×2: un número grande por indicador, semáforo y una línea de comparación; arriba, el resumen de lo que hay que revisar
    function panelHTML() {
      var R = panelDatos(), n0 = function (x) { return x == null ? '–' : nf(Math.round(x)); }, p0 = function (x) { return x == null ? '–' : Math.round(x) + '%'; };
      var MESL = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
      var avisos = [];
      var tile = function (sem, act, tit, v, l, d, dsem) {
        var c = SEM[sem];
        return '<button class="ptile ' + c + '" data-pan="' + act + '" aria-label="' + tit + '"><span class="pth">' + tit + '</span><i class="pdot" aria-hidden="true"></i>' +
          '<b class="pv">' + v + '</b><span class="pl">' + l + '</span>' + (d ? '<span class="pd ' + SEM[dsem || sem] + '">' + d + '</span>' : '') + '</button>';
      };
      var flecha = function (x) { return x >= 0 ? '▲ +' : '▼ '; };
      // 1) reproducción cada 21 días
      var enT = R.ini <= R.ref && R.ref <= R.fin, t1;
      if (R.ini > R.ref || (!R.cs && !R.cc)) t1 = tile('g', 'rep', 'Reproducción 21 días', '–', 'Sin ciclos con datos todavía', 'Inicio: ' + A.fmt(R.ini).slice(0, 5));
      else {
        var sv = R.cs ? R.cs.v : null, cv = R.cc ? R.cc.v : null;
        var mal = (sv != null && sv < 50) || (cv != null && cv < 40), at = (sv != null && sv < 60) || (cv != null && cv < 45);
        var sem = !enT ? 'g' : mal ? 'r' : at ? 'a' : 'v', cn = R.cc && !R.cc.tact ? 'Concep. máx.' : 'Concepción';
        if (enT && mal) avisos.push(['mal', 'Revisá Ciclos de 21 días: ' + [sv != null && sv < 50 ? 'servicio ' + p0(sv) + ' en el ciclo ' + R.cs.n : '', cv != null && cv < 40 ? cn.toLowerCase() + ' ' + p0(cv) + ' en el ciclo ' + R.cc.n : ''].filter(Boolean).join(' y ')]);
        t1 = tile(sem, 'rep', 'Reproducción 21 días', p0(sv), 'Tasa de servicio' + (R.cs ? ' · ciclo ' + R.cs.n : ''),
          cv != null ? cn + ' ' + p0(cv) + (R.cc.n !== (R.cs && R.cs.n) ? ' · ciclo ' + R.cc.n : '') : (enT ? '' : 'Temporada terminada'));
      }
      // 2) leche por vaca
      var t2;
      // tambo guardado con una versión anterior a la v31 (sin el resumen de controles del tambo) pero con controles por vaca:
      // hay que volver a cargar el respaldo
      var viejo = DB.ctrls === undefined && (DB.todos || DB.animales || []).some(function (a) { return a.pr && a.pr.length; });
      if (!R.le) t2 = tile('g', 'leche', 'Leche por vaca', '–', viejo ? 'Volvé a cargar el respaldo de ' + SRC() + ' para ver la leche' : 'Sin controles lecheros', '');
      else {
        var d4 = R.le.prev ? (R.le.v / R.le.prev - 1) * 100 : null, s4 = d4 == null ? 'g' : d4 <= -10 ? 'r' : d4 <= -5 ? 'a' : 'v';
        if (s4 === 'r') avisos.push(['mal', 'Leche por vaca ' + nf(Math.abs(d4), 0) + '% abajo del año anterior']);
        t2 = tile(s4, 'leche', 'Leche por vaca', nf(R.le.v, 1) + '<small> L</small>', MESL[A.MESES.indexOf(R.le.mes)].replace(/^./, function (c) { return c.toUpperCase(); }) + ' ' + R.le.anio,
          d4 == null ? '' : flecha(d4) + nf(d4, 0) + '% vs ' + R.le.mes + ' ' + (R.le.anio - 1));
      }
      // 3) vacas preñadas
      var t3, P = R.pr;
      if (P.P + P.PP === 0) t3 = tile('g', 'ptvac', 'Vacas preñadas', '–', 'Sin vacas para contar', '');
      else {
        var d2 = R.prA != null && P.pct != null ? P.pct - R.prA : null, s2 = d2 == null ? 'g' : d2 <= -10 ? 'r' : d2 <= -5 ? 'a' : 'v';
        var cA = R.prAn === 2 ? 'el promedio de los 2 años anteriores' : 'hace un año';
        if (s2 === 'r') avisos.push(['mal', 'Vacas preñadas: ' + nf(Math.abs(Math.round(d2))) + ' puntos menos que ' + cA]);
        t3 = tile(s2, 'ptvac', 'Vacas preñadas', p0(P.pct), n0(P.P) + ' preñadas · ' + n0(P.PP) + ' por preñar',
          d2 == null ? '' : flecha(d2) + nf(Math.round(d2)) + (R.prAn === 2 ? ' pts vs prom. 2 años' : ' pts vs hace un año'));
      }
      // 4) último diagnóstico: amarillo desde 21 días, rojo con más de 30
      var t4;
      if (!R.ultTacto) t4 = tile('g', 'tactar', 'Último tacto', '–', 'Sin tactos de vacas en ordeñe', '');
      else {
        var dt = A.diffDays(today(), R.ultTacto), s3 = dt > 30 ? 'r' : dt >= 21 ? 'a' : 'v';
        if (dt >= 21) avisos.push([s3 === 'r' ? 'mal' : 'at', 'Pasaron ' + dt + ' días desde el último tacto: coordiná la visita para el diagnóstico']);
        t4 = tile(s3, 'tactar', 'Último tacto', dt + '<small> ' + (dt === 1 ? 'día' : 'días') + '</small>', 'Desde el ' + A.fmt(R.ultTacto).slice(0, 5) + (R.ultTactoN ? ' · ' + R.ultTactoN + ' vacas' : ''),
          R.nTactar != null ? n0(R.nTactar) + ' para tactar' : '');
      }
      var hayMal = avisos.some(function (x) { return x[0] === 'mal'; });
      var res = avisos.length
        ? '<div class="pres ' + (hayMal ? 'mal' : 'at') + '" role="alert"><span class="pri" aria-hidden="true">⚠</span><div><b>' + (avisos.length === 1 ? '1 indicador para revisar' : avisos.length + ' indicadores para revisar') + '</b>' + avisos.map(function (x) { return '<span>' + x[1] + '</span>'; }).join('') + '</div></div>'
        : '<div class="pres ok"><span class="pri" aria-hidden="true">✓</span><div><b>Todo en orden</b><span>Los indicadores están bien.</span></div></div>';
      return '<h1 class="ptitle">Panel</h1>' + res + '<div class="panel">' + t1 + t2 + t3 + t4 + '</div>' +
        '<p class="cap">Según ' + SRC() + ' del ' + A.fmt(R.ref) + '. Tocá un cuadro para ver el detalle. Reproducción: tasa de servicio del último ciclo terminado y concepción del último ciclo con resultados (la máxima si todavía no está tactado); en rojo con servicio menor a 50% o concepción menor a 40%, en amarillo con menos de 60% o 45%. Leche: litros por vaca en ordeñe del último mes con control, contra el mismo mes del año anterior (amarillo 5% menos, rojo 10% menos). Vacas preñadas: vacas en ordeñe y secas preñadas sobre las preñadas más las por preñar (sin descarte y con la espera voluntaria cumplida' + (P.E || P.DS ? '; aparte quedan ' + [P.E ? P.E + ' en espera' : '', P.DS ? P.DS + ' vacías con descarte' : ''].filter(Boolean).join(' y ') : '') + '), contra el promedio del mismo día de los 2 años anteriores' + (R.prAv && R.prAv.length === 2 ? ' (' + R.prAv.map(function (v) { return p0(v); }).join(' y ') + ')' : R.prAv ? ' (con historial de un solo año: ' + p0(R.prAv[0]) + ')' : '') + ' (amarillo 5 puntos menos, rojo 10). Último tacto: último día en que se tactaron 5 vacas en ordeñe o más (no cuentan vaquillonas, secas ni registros sueltos, como un aborto cargado como tacto); amarillo desde 21 días, rojo con más de 30.</p>';
    }
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
        var ab = !!dn && state.cicloAl === c.n;
        // al tocar la concepción (o la máxima) de un ciclo se abre debajo el detalle por toro e inseminador
        var marca = function (cls, al) { return '<td class="' + cls + (al ? ' alerta' : '') + (dn ? ' tq' : '') + '"' + (dn ? ' data-cal="' + c.n + '" role="button" tabindex="0" aria-expanded="' + ab + '"' : '') + '>'; };
        var cmax = marca('cmax', mal && !tact) + (dn ? '<span>' + (mal && !tact ? '⚠ ' : '') + p(c.sOk + c.sPend, dn) + '</span><small>' + (c.sOk + c.sPend) + '/' + dn + '</small>' : '–') + '</td>';
        var creal = marca('creal', mal && tact) + '<span>' + (mal && tact ? '⚠ ' : '') + p(c.sOk, dr) + '</span><small>' + c.sOk + '/' + dr + '</small></td>';
        var aviso = !ab ? '' : '<tr class="ralrow"><td colspan="6">' + (!mal ? '' : '<p class="ralerta">⚠ Ciclo ' + c.n + ': ' + (tact ? 'la concepción fue ' + Math.round(cr) + '% (' + c.sOk + ' de ' + dr + ' servicios con tacto)' : 'mucha repetición antes del tacto. La concepción máxima es ' + Math.round(mx) + '% y la concepción no va a pasar de ese número' + (c.cerrado ? ' (faltan tactar ' + c.sPend + ' servicios)' : '')) + '; lo habitual del tambo es ' + Math.round(hab) + '% (' + habTxt + ').</p>') +
          tiHTML(C.svs.filter(function (s) { return s.c === c.n; }), 'Ciclo ' + c.n + ' · ' + A.fmt(c.ini).slice(0, 5) + ' al ' + A.fmt(c.fin).slice(0, 5), 0, 'data-cal="' + c.n + '"') + '</td></tr>';
        return '<tr' + (c.cerrado ? '' : ' class="abierto"') + '><td><b>' + c.n + '</b> <small>' + A.fmt(c.ini).slice(0, 5) + '</small></td><td>' + c.aptas + '</td>' +
          '<td>' + p(c.serv, c.aptas) + '<small>' + c.serv + '</small></td>' +
          (c.cerrado ? creal + cmax + '<td><b>' + p(c.pren, c.aptas) + '</b><small>' + c.pren + '</small></td>'
            : '<td class="enc">en curso</td>' + cmax + '<td class="enc">–</td>') + '</tr>' + aviso;
      }).join('');
      var pevTxt = DB.config && DB.config.pev ? SRC() + ': ' + DB.config.pev : 'sin dato en ' + SRC();
      return '<section class="card rep"><h2>Ciclos de 21 días</h2>' +
        '<label class="secfecha">Inicio de servicios <input type="date" id="ini21" value="' + ini + '" max="' + ref + '"></label>' +
        (function () { var d = iniZafra(); if (!d) return ''; return d === ini ? '<p class="cap inidef">Primer servicio a una vaca de la zafra (desde el 1 de mayo).</p>' : '<p class="cap inidef">Primer servicio de la zafra: ' + A.fmt(d) + ' · <button class="lnk" data-a="ini21def">usar esa fecha</button></p>'; })() +
        '<div class="secsel"><span>Espera voluntaria</span>' + PEVS.map(function (n) { return '<button class="fchip plain" data-pev="' + n + '" aria-pressed="' + (pev === n) + '">' + n + '</button>'; }).join('') + '<span>días <small>(' + pevTxt + ')</small></span></div>' +
        (C.length ? '<div class="kpis"><div><b>' + p(T.serv, T.aptas) + '</b><span>Tasa de servicio</span></div><div><b>' + p(T.sOk, T.sOk + T.sMal) + '</b><span>Tasa de concepción</span></div><div class="tp"><b>' + p(T.pren, T.aptas) + '</b><span>Tasa de preñez</span></div></div>' +
          '<p class="cap">Promedio de los ' + nCerr + ' ciclos cerrados.</p>' +
          torosHTML(C.svs) +
          '<p class="cap ralhint">Tocá la concepción de un ciclo para verla por toro e inseminador' + (hayRojo ? ' (en los ⚠ en rojo, también el aviso)' : '') + '.</p>' +
          '<table class="tbl rtbl"><thead><tr><th>Ciclo</th><th>Aptas</th><th>Servicio</th><th>Concep.</th><th>Conc. máx.</th><th>Preñez</th></tr></thead><tbody>' + filas + '</tbody></table>' +
          '<p class="cap">Vacas con al menos una lactancia (sin vaquillonas). <b>Aptas:</b> vacas vacías que cumplen ' + pev + ' días posparto dentro del ciclo, no marcadas como descarte programado y en el rodeo, más toda vaca servida en el ciclo aunque no haya cumplido la espera (como SysCaw). Una vaca servida en un ciclo anterior no es apta hasta que se la vuelva a servir o el tacto dé vacía (ahí cuenta para atrás). <b>Servicio:</b> aptas servidas / aptas. <b>Concepción:</b> servicios que preñaron / servicios con resultado conocido. <b>Conc. máx.:</b> lo mejor que puede dar el ciclo, contando como preñadas todas las servidas que no volvieron a servirse ni dieron vacía al tacto (no retorno). Solo cuenta servicios con al menos 24 días, para darles tiempo a repetir. <b style="color:var(--bad,#c0392b)">En rojo:</b> en los ciclos ya tactados (cerrados y con no más del 10% de sus servicios sin tacto) se marca la concepción; en los ciclos en curso o tactados en parte, la concepción máxima, cuando queda más de 10 puntos por debajo de la concepción habitual del tambo' + (habTxt ? ' (' + habTxt + ': ' + Math.round(hab) + '%)' : '') + '. <b>Alerta de toro o inseminador:</b> aparece cuando uno con 20 servicios o más en la temporada queda más de 10 puntos por debajo del resto en concepción máxima. <b>Preñez:</b> aptas que quedaron preñadas en el ciclo / aptas. Un ciclo queda <b>en curso</b> hasta que hay tacto 28 días después de que termina' + (C.ultTacto && C.ultTacto > '0000' ? ' (último tacto: ' + A.fmt(C.ultTacto) + ')' : '') + '.</p>' +
          '<button class="despbtn" data-a="repti" aria-expanded="' + !!state.repTI + '"><span>Concepción en el período por toro e inseminador</span><span class="chev">' + (state.repTI ? 'ocultar' : 'ver') + '</span></button>' +
          (state.repTI ? tiHTML(C.svs, 'Del ' + A.fmt(ini) + ' al ' + A.fmt(C[C.length - 1].fin < ref ? C[C.length - 1].fin : ref) + ' · ' + C.length + ' ciclos', 5, 'data-a="repti"') : '')
          : '<p class="hint">Elegí una fecha de inicio anterior al ' + A.fmt(ref) + '.</p>') + '</section>';
    }
    /* ----- Condición corporal del rodeo: distribución en tres momentos (secado, parto, 30 días) y evolución en la lactancia ----- */
    // rango óptimo (escala 1 a 5) de multíparas (m) y primíparas (p); 0,25 por debajo o por encima es riesgo, más allá, mucho riesgo
    var CC_OPT = { secado: { m: [3, 3.5], p: [3.25, 3.75] }, parto: { m: [3, 3.5], p: [3.25, 3.75] }, d30: { m: [2.5, 3], p: [2.75, 3.25] } };
    function ccClase(v, r) { return v < r[0] - 0.25 - 1e-9 ? 0 : v < r[0] - 1e-9 ? 1 : v <= r[1] + 1e-9 ? 2 : v <= r[1] + 0.25 + 1e-9 ? 3 : 4; }
    function ccRodeoHTML() {
      var ref = DB.fecha || today(), desde = A.addDays(ref, -365);
      var ev = { secado: [], parto: [], d30: [] }, bins = [];
      var cerca = function (E, f, a, b, ideal) { var c = null; E.forEach(function (x) { var d = A.diffDays(x[0], f); if (d >= a && d <= b && (!c || Math.abs(A.diffDays(x[0], ideal)) < Math.abs(A.diffDays(c[0], ideal)))) c = x; }); return c; };
      var lista = DB.animales.map(function (a) { return DB.hist[a.rp]; }).concat((DB.bajas || []).map(function (b) { return DB.hist[b.key]; }));
      var hay = false;
      lista.forEach(function (h) {
        if (!h || !h.ech || !h.ech.length || !h.pa) return; hay = true; var E = h.ech;
        h.pa.forEach(function (p, i) {
          var np = h.pa[i + 1], sec = p[5];
          // primípara: la lactancia que empieza en este parto es la primera (también al secarla)
          var pri = p[1] === 1;
          if (p[0] >= desde && p[0] <= ref) { var c = cerca(E, p[0], -21, 10, p[0]); if (c) ev.parto.push([c[1], pri]); }
          var f30 = A.addDays(p[0], 30);
          if (f30 >= desde && f30 <= ref) { var c3 = cerca(E, p[0], 20, 45, f30); if (c3) ev.d30.push([c3[1], pri]); }
          if (sec && sec >= desde && sec <= ref) { var cs = cerca(E, sec, -21, 21, sec); if (cs) ev.secado.push([cs[1], pri]); }
          // evolución: cada registro de los últimos 12 meses ubicado en su lactancia (por días en leche), o en el período seco
          E.forEach(function (x) {
            if (x[0] < desde || x[0] < p[0] || (np && x[0] >= np[0])) return;
            var k = sec && x[0] >= sec ? 'seca' : Math.min(10, Math.floor(A.diffDays(x[0], p[0]) / 30));
            (bins[k] = bins[k] || []).push(x[1]);
          });
        });
      });
      if (!hay) return '';
      var cc = function (v) { return Number(v).toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
      var COL = ['var(--vacia)', '#D9A21B', 'var(--prenada)', '#D9A21B', 'var(--vacia)'];
      var barra = function (tit, L, R) {
        if (L.length < 5) return '<div class="ccrow"><div class="cct"><b>' + tit + '</b><small>sin datos suficientes</small></div></div>';
        var n = [0, 0, 0, 0, 0]; L.forEach(function (x) { n[ccClase(x[0], x[1] ? R.p : R.m)]++; });
        var seg = n.map(function (c, k) { var pc = c / L.length * 100; return c ? '<span style="width:' + pc.toFixed(1) + '%;background:' + COL[k] + '">' + (pc >= 9 ? Math.round(pc) + '%' : '') + '</span>' : ''; }).join('');
        var ok = Math.round(n[2] / L.length * 100);
        var np_ = L.filter(function (x) { return x[1]; }).length;
        return '<div class="ccrow"><div class="cct"><b>' + tit + '</b><small>' + L.length + ' vacas (' + np_ + (np_ === 1 ? ' primípara' : ' primíparas') + ')</small><em>' + ok + '% óptima</em></div><div class="ccbar">' + seg + '</div>' +
          '<p class="ccopt">Óptima: multíparas ' + cc(R.m[0]) + ' a ' + cc(R.m[1]) + ' · primíparas ' + cc(R.p[0]) + ' a ' + cc(R.p[1]) + '</p></div>';
      };
      // evolución en la lactancia: promedio y mitad central (25 a 75%) por tramo de 30 días
      var q = function (l, f) { var a = l.slice().sort(function (x, y) { return x - y; }), i = (a.length - 1) * f, lo = Math.floor(i); return a[lo] + (a[Math.ceil(i)] - a[lo]) * (i - lo); };
      var pts = []; for (var k = 0; k <= 10; k++) if (bins[k] && bins[k].length >= 5) pts.push({ x: k, lbl: k === 10 ? '300+' : String(k * 30), v: q(bins[k], 0.5), a: q(bins[k], 0.25), b: q(bins[k], 0.75), n: bins[k].length });
      if (bins.seca && bins.seca.length >= 5) pts.push({ x: 11, lbl: 'seca', v: q(bins.seca, 0.5), a: q(bins.seca, 0.25), b: q(bins.seca, 0.75), n: bins.seca.length });
      var linea = '';
      if (pts.length >= 3) {
        var W = 320, H = 170, ml = 30, mr = 14, mt = 18, mb = 24, lo = 2, hi = 4;
        var X = function (x) { return ml + x / 11 * (W - ml - mr); }, Y = function (v) { return mt + (1 - (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * (H - mt - mb); };
        var g = '';
        for (var v = lo; v <= hi + 1e-9; v += 0.5) g += '<line class="lgrid" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '"/><text class="mlbl" x="' + (ml - 4) + '" y="' + (Y(v) + 3).toFixed(1) + '" text-anchor="end">' + String(v).replace('.', ',') + '</text>';
        g += '<polygon fill="var(--bar)" opacity=".35" points="' + pts.map(function (p) { return X(p.x).toFixed(1) + ',' + Y(p.b).toFixed(1); }).concat(pts.slice().reverse().map(function (p) { return X(p.x).toFixed(1) + ',' + Y(p.a).toFixed(1); })).join(' ') + '"/>';
        g += '<polyline fill="none" stroke="var(--navy)" stroke-width="2.5" stroke-linejoin="round" points="' + pts.map(function (p) { return X(p.x).toFixed(1) + ',' + Y(p.v).toFixed(1); }).join(' ') + '"/>';
        pts.forEach(function (p) { g += '<circle cx="' + X(p.x).toFixed(1) + '" cy="' + Y(p.v).toFixed(1) + '" r="3" fill="var(--navy)"><title>' + p.lbl + ': ' + cc(p.v) + ' (' + p.n + ' registros)</title></circle><text class="val" x="' + X(p.x).toFixed(1) + '" y="' + (Y(p.v) - 7).toFixed(1) + '" text-anchor="middle" style="font-size:9px">' + cc(p.v) + '</text>'; });
        [0, 2, 4, 6, 8, 10].forEach(function (x) { g += '<text class="mlbl" x="' + X(x).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="' + (x ? 'middle' : 'start') + '">' + x * 30 + '</text>'; });
        g += '<text class="mlbl" x="' + X(11).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">seca</text>';
        linea = '<h3 class="cch3">A lo largo de la lactancia</h3><svg class="bars" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Condición corporal según los días en leche">' + g + '</svg>' +
          '<p class="cap">Línea: valor del medio de cada tramo de 30 días en leche; franja: la mitad de las vacas (del 25 al 75%). Registros de los últimos 12 meses.</p>';
      }
      if (!document.getElementById('ccCss')) { var st = document.createElement('style'); st.id = 'ccCss'; st.textContent = '.ccrow{margin:12px 0 14px}.cct{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:6px}.cct b{font-size:15px}.cct small{font-size:12.5px;color:var(--muted);flex:1}.cct em{font-style:normal;font-weight:700;font-size:13px;color:var(--prenada)}.ccbar{display:flex;height:26px;border-radius:8px;overflow:hidden;background:var(--bg)}.ccbar span{display:grid;place-items:center;color:#fff;font-size:12px;font-weight:700;min-width:0}.ccleg{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12.5px;color:var(--muted);margin:4px 0 2px}.ccleg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}.cch3{font-size:15px;margin:18px 0 4px}.ccopt{margin:5px 0 0;font-size:12px;color:var(--muted)}'; document.head.appendChild(st); }
      return '<section class="card"><h2>Condición corporal</h2>' +
        '<div class="ccleg"><span><i style="background:var(--vacia)"></i>Muy flaca / muy gorda</span><span><i style="background:#D9A21B"></i>Flaca / gorda</span><span><i style="background:var(--prenada)"></i>Óptima</span></div>' +
        barra('Al secado', ev.secado, CC_OPT.secado) + barra('Al parto', ev.parto, CC_OPT.parto) + barra('A los 30 días', ev.d30, CC_OPT.d30) +
        '<p class="cap">En cada barra, de izquierda a derecha: de más flaca a más gorda. Cada vaca se compara con el óptimo de su categoría; 0,25 fuera del óptimo es riesgo (amarillo) y más allá, mucho riesgo (rojo). Eventos de los últimos 12 meses con condición registrada cerca (secado ±21 días, parto de 21 días antes a 10 después, entre 20 y 45 días en leche).</p>' + linea + '</section>';
    }
    /* ----- Preñez: preñez acumulada de la zafra, preñadas a 150 días en leche y cierre de zafra ----- */
    // preñez de la zafra y comparar zafras: solo en el modo veterinario
    function prenOK() { return DB.fuente === 'syscaw' && !!DB.hist && !esOperario() && esVet(); }
    // último servicio que cuenta en la zafra: por defecto el 15 de febrero, el productor lo puede cambiar (se guarda día y mes)
    function finMD() { var v = getP('finzaf'); return /^\d{2}-\d{2}$/.test(v || '') ? v : '02-15'; }
    function finZaf(ini) { var y = +ini.slice(0, 4), md = finMD(); return (md > ini.slice(5) ? y : y + 1) + '-' + md; }
    function zafLbl(ini) { return 'Zafra ' + ini.slice(2, 4); }
    function primServ(d0, hasta) {
      var best = null;
      DB.animales.map(function (a) { return DB.hist[a.rp]; }).concat((DB.bajas || []).map(function (b) { return DB.hist[b.key]; })).forEach(function (h) {
        if (!h || !h.pa || !h.pa.length || !h.ev) return; var p0 = h.pa[0][0];
        h.ev.forEach(function (e) { if (e[1] === 'S' && e[0] >= d0 && e[0] <= hasta && e[0] > p0 && (!best || e[0] < best)) best = e[0]; });
      });
      return best;
    }
    function zafResumen(Z, ini, Q) {
      var M = Z.filter(function (r) { return !r.excl; }), P = M.filter(function (r) { return r.conc; });
      var media = function (v) { if (!v.length) return null; var s = 0; v.forEach(function (x) { s += x; }); return s / v.length; };
      var ipps = M.filter(function (r) { return r.s1; }), ippsT = ipps.filter(function (r) { return r.p >= ini; });
      var cf = Z.filter(function (r) { return r.conf; }), Q1 = Q.filter(function (r) { return !r.excl; });
      return {
        n0: Z.length, n: M.length, pren: P.length, vac: M.length - P.length,
        desc: Z.filter(function (r) { return r.excl === 'desc'; }).length, antes: Z.filter(function (r) { return r.excl === 'antes'; }).length, pase: Z.filter(function (r) { return r.excl === 'pase'; }).length,
        salV: M.filter(function (r) { return !r.conc && r.salida; }).length, pend: M.filter(function (r) { return r.pend; }).length, est: P.filter(function (r) { return r.est; }).length,
        ipps: media(ipps.map(function (r) { return A.diffDays(r.s1, r.p); })), ippsT: media(ippsT.map(function (r) { return A.diffDays(r.s1, r.p); })), nIppsT: ippsT.length,
        ipc: media(P.map(function (r) { return A.diffDays(r.conc, r.p); })), conf: cf.length, perd: cf.filter(function (r) { return r.perd; }).length,
        n150: Q1.length, ok150: Q1.filter(function (r) { return r.ok; }).length, pend150: Q1.filter(function (r) { return r.pend; }).length,
        sOk: Z.reduce(function (a, r) { return a + (r.sOk || 0); }, 0), sRes: Z.reduce(function (a, r) { return a + (r.sRes || 0); }, 0), sTot: Z.reduce(function (a, r) { return a + (r.sTot || 0); }, 0)
      };
    }
    // % preñadas (confirmadas) y máximo (sumando las servidas sin resultado) a una fecha, sobre las vacas de la zafra ya paridas a esa fecha
    function zafEn(Z, d) {
      var den = 0, num = 0, mx = 0;
      Z.forEach(function (r) { if (r.excl || (r.ent || r.p) > d) return; den++; if (r.conc && r.conc <= d) { num++; mx++; } else if (r.pend && r.ult <= d) mx++; });
      return { den: den, v: den ? num / den * 100 : null, mx: den ? mx / den * 100 : null, num: num };
    }
    var PZC = { k: null, r: null };
    function prenDatos() {
      var ini = inicio21(), pev = pevActual(), ref = DB.fecha || today(), fin = finZaf(ini);
      var k = (DB.guardada || 0) + '|' + (DB.sel ? DB.sel.join(',') : '') + '|' + DB.animales.length + '|' + ini + '|' + pev + '|' + fin + '|' + ref;
      if (PZC.k === k) return PZC.r;
      // con una o algunas unidades elegidas: todos los animales del respaldo, cada uno contado en la unidad donde estaba en cada fecha (pases)
      var porU = !!(DB.sel && DB.sel.length && DB.todos);
      var conU = function (o, a, h) {
        if (porU && h) { var xx = { a: a, h: h }; o.uEn = function (D) { return enSel(unidadEn(xx, D)); }; o.cambios = (h.mv || []).map(function (m) { return m[0]; }); }
        return o;
      };
      var an = (porU ? DB.todos : DB.animales).map(function (a) { var h = DB.hist[a.rp]; return conU({ rp: a.rp, h: h, salida: null, desc: a.dFecha || (a.rech ? '0000' : null) }, a, h); })
        .concat(((porU ? DB.bajasT : DB.bajas) || []).map(function (b) { var h = DB.hist[b.key]; return conU({ rp: b.rp, h: h, salida: b.bFecha, desc: b.dFecha || null }, b, h); }));
      var desde = DB.desdeHist || '0000', Zs = [];
      // zafra actual y hasta dos anteriores (con historial completo; si no, la foto guardada al cerrarla)
      var guard = {}; try { guard = JSON.parse(getP('zafras') || '{}') || {}; } catch (e) { guard = {}; }
      for (var j = 0; j < 3; j++) {
        var y0 = +ini.slice(0, 4) - j, i0 = j ? (primServ(y0 + '-05-01', (y0 + 1) + '-' + finMD()) || y0 + ini.slice(4)) : ini, f0 = finZaf(i0);
        if (i0 > ref) continue;
        if (j && i0 < desde) { if (guard[i0]) Zs.push({ ini: i0, fin: guard[i0].fin, lbl: zafLbl(i0), R: guard[i0].R, foto: true, estado: 'Cerrada' }); continue; }
        var Z = A.zafraPren(an, esPren, esVacia, i0, f0, pev, ref), corte = f0 < ref ? f0 : ref;
        var Q = A.pren150(an, esPren, esVacia, i0, corte, pev, ref), R = zafResumen(Z, i0, Q);
        var estado = ref <= f0 ? 'En curso' : (R.pend <= R.n * 0.05 && A.diffDays(ref, f0) >= 35 ? 'Cerrada' : 'Provisoria');
        Zs.push({ ini: i0, fin: f0, lbl: zafLbl(i0), Z: Z, an: an, R: R, estado: estado });
        if (estado === 'Cerrada' && R.n) guard[i0] = { fin: f0, R: R, f: ref };
      }
      try { setP('zafras', JSON.stringify(guard)); } catch (e) {}
      PZC = { k: k, r: { ini: ini, fin: fin, pev: pev, ref: ref, Zs: Zs, an: an } };
      return PZC.r;
    }
    function prenChart(cur, prev, sem) {
      var W = 340, H = 200, ml = 30, mr = 10, mt = 10, mb = 30, s = '';
      var X = function (w) { return ml + w * (W - ml - mr) / sem; }, Y = function (v) { return H - mb - v / 100 * (H - mt - mb); };
      for (var v = 0; v <= 100; v += 20) s += '<line class="lgrid" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '"/><text class="mlbl" x="' + (ml - 5) + '" y="' + (Y(v) + 4).toFixed(1) + '" text-anchor="end">' + v + '</text>';
      for (var w = 0; w <= sem; w += 6) s += '<text class="mlbl" x="' + X(w).toFixed(1) + '" y="' + (H - mb + 15) + '" text-anchor="' + (w ? 'middle' : 'start') + '">' + w + '</text>';
      s += '<text class="myear" x="' + (W - mr) + '" y="' + (H - 2) + '" text-anchor="end">semanas desde el inicio de servicios</text>';
      var linea = function (pts, key, cls) {
        var q = pts.filter(function (p) { return p[key] != null; }).map(function (p) { return X(p.w).toFixed(1) + ',' + Y(p[key]).toFixed(1); });
        return q.length > 1 ? '<polyline class="pzl ' + cls + '" points="' + q.join(' ') + '"/>' : '';
      };
      if (prev) s += linea(prev, 'v', 'pz0');
      s += linea(cur, 'mx', 'pzm') + linea(cur, 'v', 'pz1');
      var u = cur[cur.length - 1];
      if (u && u.v != null) s += '<circle cx="' + X(u.w).toFixed(1) + '" cy="' + Y(u.v).toFixed(1) + '" r="3.5" style="fill:var(--pz1)"><title>Semana ' + u.w + ': ' + Math.round(u.v) + '% preñadas</title></circle>';
      return '<svg class="mchart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Preñez acumulada por semana de la zafra, esta y la anterior">' + s + '</svg>';
    }
    function prenHTML() {
      if (!document.getElementById('pzCss')) {
        var st = document.createElement('style'); st.id = 'pzCss';
        st.textContent = ':root{--pz1:#C9A227;--pz0:#12274A}@media (prefers-color-scheme:dark){:root{--pz1:#E3B84A;--pz0:#7FA8EE}}' +
          '.pzl{fill:none;stroke-width:2.5;stroke-linejoin:round;stroke-linecap:round}.pzl.pz1{stroke:var(--pz1);stroke-width:3}.pzl.pz0{stroke:var(--pz0);opacity:.75}.pzl.pzm{stroke:var(--pz1);stroke-dasharray:5 4;stroke-width:2}' +
          '.mleg i.pz1{background:var(--pz1)}.mleg i.pz0{background:var(--pz0);opacity:.75}.mleg i.pzm{background:transparent;border-top:2px dashed var(--pz1);border-radius:0;height:0;margin-top:5px}' +
          '.kpis small{display:block;font-size:11.5px;color:var(--muted);margin-top:3px;font-weight:500;line-height:1.3}.pztbl{font-size:14px;table-layout:fixed;width:100%}.pztbl th:first-child{width:36%}.pztbl th,.pztbl td{text-align:right;padding:7px 2px}.pztbl th:first-child,.pztbl td:first-child{text-align:left;white-space:normal}.pztbl td small{display:block}' +
          '.pztbl tr.pzest td{font-size:12.5px;color:var(--muted);font-weight:600}.pzab tr[data-rp]{cursor:pointer}.pzfec{margin:12px 0 0;font-size:13px}';
        document.head.appendChild(st);
      }
      var D = prenDatos(), ini = D.ini, fin = D.fin, ref = D.ref, pev = D.pev;
      var p = function (n, d) { return d ? Math.round(n / d * 100) + '%' : '–'; }, dias = function (v) { return v == null ? '–' : Math.round(v) + ''; };
      var cab = '<h2>Preñez de la ' + zafLbl(ini).toLowerCase() + '</h2>';
      // las fechas de la zafra van al pie, chicas; el último servicio se cambia solo si se toca "cambiar"
      var fechas = '<p class="cap pzfec">Servicios del ' + A.fmt(ini) + ' al ' + A.fmt(fin) + ' · <button class="lnk" data-a="pzfec">' + (state.pzFec ? 'listo' : 'cambiar') + '</button></p>' +
        (state.pzFec ? '<label class="secfecha">Último servicio que cuenta <input type="date" id="finZaf" value="' + fin + '" min="' + A.addDays(ini, 60) + '"></label>' +
          '<p class="cap inidef">El inicio se cambia en Ciclos de 21 días.' + (finMD() !== '02-15' ? ' Por defecto el último es el 15 de febrero · <button class="lnk" data-a="finzafdef">volver a esa fecha</button>' : '') + '</p>' : '');
      var cur = D.Zs[0];
      if (!cur || ini > ref) return '<section class="card rep">' + cab + fechas + '<p class="hint">Elegí una fecha de inicio anterior al ' + A.fmt(ref) + '.</p></section>';
      var prev = D.Zs[1] && !D.Zs[1].foto ? D.Zs[1] : null, R = cur.R;
      if (!R.n0) return '<section class="card rep">' + cab + '<p class="hint">No hay vacas en esta zafra.</p>' + fechas + '</section>';
      // hoy (o el fin de la zafra si ya terminó) y el mismo momento de la zafra anterior
      var dCur = fin < ref ? fin : ref, off = A.diffDays(dCur, ini), sem = Math.ceil(A.diffDays(fin, ini) / 7);
      var ptsC = [], ptsP = null;
      for (var w = 0; A.addDays(ini, 7 * w) <= dCur; w++) { var e = zafEn(cur.Z, A.addDays(ini, 7 * w)); ptsC.push({ w: w, v: e.v, mx: e.mx }); }
      var hoy = zafEn(cur.Z, dCur), ant = null, ant150 = null;
      if (prev) {
        ptsP = []; var semP = Math.ceil(A.diffDays(prev.fin, prev.ini) / 7); if (semP > sem) sem = semP;
        for (var wp = 0; A.addDays(prev.ini, 7 * wp) <= prev.fin; wp++) { var ep = zafEn(prev.Z, A.addDays(prev.ini, 7 * wp)); ptsP.push({ w: wp, v: ep.v }); }
        var dPrev = A.addDays(prev.ini, off); if (dPrev > prev.fin) dPrev = prev.fin;
        ant = zafEn(prev.Z, dPrev).v;
        var Qp = A.pren150(prev.an, esPren, esVacia, prev.ini, dPrev, pev, ref).filter(function (r) { return !r.excl; });
        ant150 = Qp.length ? Qp.filter(function (r) { return r.ok; }).length / Qp.length * 100 : null;
      }
      var flecha = function (a, b) { if (a == null || b == null) return ''; var d = Math.round(a) - Math.round(b); return d > 0 ? ' ▲' + d : d < 0 ? ' ▼' + (-d) : ' ='; };
      var exN = R.desc + R.antes + (R.pase || 0);
      var kpis = '<div class="kpis"><div class="tp"><b>' + (hoy.v == null ? '–' : Math.round(hoy.v) + '%') + '</b><span>Preñez acumulada</span><small>' +
        (hoy.mx != null && Math.round(hoy.mx) > Math.round(hoy.v) ? 'hasta ' + Math.round(hoy.mx) + '% con las servidas sin tacto' : hoy.num + ' de ' + hoy.den) + (ant != null ? '<br>año ant. ' + Math.round(ant) + '%' + (hoy.mx - hoy.v <= 5 ? flecha(hoy.v, ant) : '') : '') + '</small></div>' +
        '<div><b>' + p(R.ok150, R.n150) + '</b><span>Preñadas a 150 días en leche</span><small>' + R.ok150 + ' de ' + R.n150 + (R.pend150 ? ' · ' + R.pend150 + ' sin tacto' : '') + (ant150 != null ? '<br>año ant. ' + Math.round(ant150) + '%' + flecha(R.n150 ? R.ok150 / R.n150 * 100 : null, ant150) : '') + '</small></div>' +
        '<div><b>' + p(exN, R.n0) + '</b><span>Excluidas</span><small>' + R.desc + ' descarte' + (R.antes ? ' · ' + R.antes + ' se fueron antes de la espera' : '') + (R.pase ? ' · ' + R.pase + ' pasaron vacías a otra unidad' : '') + '</small></div></div>' +
        '<p class="cap">' + (fin < ref ? 'Zafra terminada el ' + A.fmt(fin) : 'Al ' + A.fmt(ref) + ', semana ' + Math.floor(off / 7) + ' de ' + sem) + '. ' + R.n + ' vacas en la zafra' + (R.salV ? '; ' + R.salV + ' se fueron vacías y cuentan como no preñadas' : '') + '.' + (prev ? ' La zafra anterior, al mismo día de servicios.' : '') + '</p>';
      var leg = '<div class="mleg"><span><i class="pz1"></i>' + zafLbl(ini) + '</span><span><i class="pzm"></i>con servidas sin tacto</span>' + (prev ? '<span><i class="pz0"></i>' + zafLbl(prev.ini) + '</span>' : '') + '</div>';
      // vacas con más de 150 días en leche sin preñar, hoy
      var abiertas = DB.animales.filter(function (a) { return (a.cat === 'vaca' || a.cat === 'seca') && a.estado !== 'prenada' && !a.rech && a.pFecha && A.diffDays(ref, a.pFecha) > 150; })
        .sort(function (a, b) { return a.pFecha < b.pFecha ? -1 : 1; });
      var lista = abiertas.length ? '<button class="despbtn" data-a="pzab" aria-expanded="' + !!state.pzAb + '"><span>Vacas con más de 150 días en leche sin preñar (' + abiertas.length + ')</span><span class="chev">' + (state.pzAb ? 'ocultar' : 'ver') + '</span></button>' +
        (state.pzAb ? '<table class="tbl rtbl pzab"><thead><tr><th>RP</th><th>Días en leche</th><th>Servicios</th><th>Estado</th></tr></thead><tbody>' + abiertas.map(function (a) {
          return '<tr data-rp="' + esc(a.rp) + '"><td><b>' + esc(a.rp) + '</b></td><td>' + A.diffDays(ref, a.pFecha) + '</td><td>' + (a.sN || 0) + (a.sFecha ? '<small>últ. ' + A.fmt(a.sFecha).slice(0, 5) + '</small>' : '') + '</td><td>' + esc(LABEL[a.estado] || a.result || '–') + '</td></tr>';
        }).join('') + '</tbody></table><p class="cap">Sin preñez confirmada y sin descarte programado. Tocá una para ver su ficha.</p>' : '') : '';
      var card1 = '<section class="card rep">' + cab + kpis + leg + prenChart(ptsC, ptsP, sem || 1) + lista + fechas + '</section>';
      // cierre de zafra: de la más vieja a la actual
      var Zc = D.Zs.slice().reverse();
      var fila = function (tit, f) { return '<tr><td>' + tit + '</td>' + Zc.map(function (z) { return '<td>' + f(z.R, z) + '</td>'; }).join('') + '</tr>'; };
      var card2 = '<section class="card"><h2>Comparar zafras</h2>' +
        '<table class="tbl rtbl pztbl"><thead><tr><th></th>' + Zc.map(function (z) { return '<th>' + z.lbl + '</th>'; }).join('') + '</tr></thead><tbody>' +
        '<tr class="pzest"><td>Estado</td>' + Zc.map(function (z) { return '<td>' + z.estado + '</td>'; }).join('') + '</tr>' +
        fila('Vacas en la zafra', function (R) { return nf(R.n); }) +
        // en una zafra abierta, las servidas sin tacto no son vacías: van aparte (y la preñez muestra hasta dónde puede llegar)
        fila('<b>Preñez total</b>', function (R) { return '<b>' + p(R.pren, R.n) + '</b><small>' + R.pren + ' de ' + R.n + '</small>' + (R.pend > R.n * 0.05 ? '<small>hasta ' + p(R.pren + R.pend, R.n) + '</small>' : ''); }) +
        fila('No preñadas', function (R) { var v = R.vac - (R.pend || 0); return nf(v) + (R.salV ? '<small>' + R.salV + ' se fueron</small>' : ''); }) +
        (Zc.some(function (z) { return z.R.pend; }) ? fila('Servidas sin tacto', function (R) { return nf(R.pend || 0); }) : '') +
        fila('Excluidas', function (R) { var e = R.desc + R.antes + (R.pase || 0); return p(e, R.n0) + '<small>' + e + '</small>'; }) +
        fila('Concepción de la zafra', function (R) { return R.sRes == null ? '–' : p(R.sOk, R.sRes) + '<small>' + R.sOk + ' de ' + R.sRes + ' serv.</small>'; }) +
        fila('Preñadas a 150 días en leche', function (R) { return p(R.ok150, R.n150); }) +
        fila('Parto – 1er servicio (días)', function (R) { return dias(R.ipps) + '<small>en zafra ' + dias(R.ippsT) + '</small>'; }) +
        fila('Parto – concepción (días)', function (R) { return dias(R.ipc); }) +
        fila('Pérdida de preñez', function (R) { return p(R.perd, R.conf) + '<small>' + R.perd + ' de ' + R.conf + '</small>'; }) +
        '</tbody></table>' +
        '<p class="cap"><b>En curso</b> hasta el último servicio que cuenta; <b>provisoria</b> mientras falten tactar servicios; <b>cerrada</b> cuando no quedan servicios sin tacto (o son menos del 5%) y pasaron 35 días del fin. Al cerrarse, sus números se guardan fijos. La pérdida de preñez sigue sumando hasta el parto. ' +
          '<b>Vacas en la zafra:</b> vacas con al menos un parto, en el rodeo al inicio de servicios o paridas después, no preñadas al inicio y paridas al menos ' + pev + ' días (espera voluntaria) antes del último servicio que cuenta. Las vaquillonas entran cuando paren. ' +
          '<b>Preñez acumulada:</b> preñadas por tacto (o por el parto siguiente), ubicadas en la fecha del servicio que las preñó, sobre las vacas de la zafra ya paridas a esa fecha. La línea punteada suma las servidas que todavía no tienen tacto ni repitieron: es lo máximo que puede dar. ' +
          '<b>Excluidas:</b> marcadas como descarte programado antes del fin de la zafra sin haberse preñado, las que se fueron antes de cumplir la espera voluntaria y, con varias unidades, las que pasaron vacías a otra unidad (cada vaca cuenta en la unidad donde estaba en cada fecha). Las que se fueron (venta o muerte) vacías después de la espera cuentan como no preñadas. ' +
          '<b>Preñadas a 150 días en leche:</b> vacas que cumplieron 150 días en leche en la zafra y se preñaron antes. ' +
          '<b>Parto – 1er servicio:</b> promedio de todas; las paridas antes del inicio esperan a que empiecen los servicios, por eso se muestra aparte el de las paridas dentro de la zafra. ' +
          '<b>Parto – concepción:</b> solo de las preñadas; leelo junto con las vacías. ' +
          '<b>Concepción de la zafra:</b> servicios a vacas en la zafra que preñaron (por tacto positivo, aunque después se haya perdido) sobre los servicios con resultado; los que todavía no tienen tacto ni repitieron no cuentan. ' +
          '<b>Pérdida de preñez:</b> vacas con tacto positivo que después dieron vacía, se volvieron a servir (más de 20 días después) o abortaron, sobre las que tuvieron tacto positivo.' +
          (R.est ? ' Esta zafra tiene ' + R.est + ' preñeces sin servicio anotado (toro): su fecha de concepción es estimada.' : '') + '</p>' +
        '</section>';
      return card1 + card2;
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
    /* concepción por toro y por inseminador de una lista de servicios (un ciclo o todo el período);
       con minimo > 0, los de menos servicios van juntos en "Otros" */
    /* toros o inseminadores que repiten más que el resto: 20 servicios o más, concepción máxima más de 10 puntos por debajo
       del resto (con 20 servicios o más) y una diferencia que no se explica por casualidad (prueba de dos proporciones, 95%).
       "El resto" son los que andan normal: se marca el peor, se lo saca del resto y se vuelve a comparar, así un toro malo no
       tapa a otro; la prueba estadística frena el corte cuando ya no hay diferencias reales. Devuelve { nombre: { mx, rmx, n } }
       Además: nunca es aviso una concepción máxima de 50% o más (es buena aunque otro ande mejor), y los toros que parecen de
       monta (servicio anotado a la preñez: concepción de 85% o más con 10 servicios con resultado) no entran en la comparación. */
    var CONC_OK = 50;
    function probMonta(svs) {
      var G = {}; svs.forEach(function (s) { var k = String(s.toro || '').trim(); if (!k) return; var g = G[k] || (G[k] = { ok: 0, mal: 0 }); if (s.r !== 'pend') g[s.r]++; });
      var M = {}; Object.keys(G).forEach(function (k) { var g = G[k], d = g.ok + g.mal; if (d >= 10 && g.ok / d >= 0.85) M[k] = Math.round(g.ok / d * 100); });
      return M;
    }
    function repitenMas(svs, campo) {
      var mon = campo === 'toro' ? probMonta(svs) : {};
      var G = {}; svs.forEach(function (s) { var k = String(s[campo] || '').trim(); if (!k || mon[k] != null) return; var g = G[k] || (G[k] = { ok: 0, pend: 0, mal: 0 }); g[s.r]++; });
      var malos = {}, sigue = true;
      while (sigue) {
        sigue = false; var peor = null;
        var R = { ok: 0, pend: 0, mal: 0 }; Object.keys(G).forEach(function (k) { if (!malos[k]) { R.ok += G[k].ok; R.pend += G[k].pend; R.mal += G[k].mal; } });
        Object.keys(G).forEach(function (k) {
          if (malos[k]) return; var g = G[k], n = g.ok + g.pend + g.mal, rn = R.ok + R.pend + R.mal - n; if (n < 20 || rn < 20) return;
          var x1 = g.ok + g.pend, x2 = R.ok - g.ok + R.pend - g.pend, mx = x1 / n * 100, rmx = x2 / rn * 100;
          var pp = (x1 + x2) / (n + rn), se = Math.sqrt(pp * (1 - pp) * (1 / n + 1 / rn)), z = se > 0 ? (x2 / rn - x1 / n) / se : 0;
          if (mx < CONC_OK && mx < rmx - 10 && z >= 1.96 && (!peor || mx - rmx < peor.mx - peor.rmx)) peor = { k: k, mx: mx, rmx: rmx, n: n };
        });
        if (peor) { malos[peor.k] = peor; sigue = true; }
      }
      return malos;
    }
    // cerrar: atributo del botón que cierra el recuadro (el mismo toque que lo abrió)
    function tiHTML(svs, sub, minimo, cerrar) {
      var p = function (n, d) { return d ? Math.round(n / d * 100) + '%' : '–'; };
      var cab = '<div class="tihead"><span><small>Concepción por toro e inseminador</small><b>' + esc(sub) + '</b></span>' + (cerrar ? '<button class="ticerrar" ' + cerrar + ' aria-label="Cerrar">Cerrar ✕</button>' : '') + '</div>';
      if (!svs.length) return '<div class="tibox">' + cab + '<p class="cap">Sin servicios en este ' + (minimo ? 'período' : 'ciclo') + '.</p></div>';
      var avisos = [];
      var tabla = function (campo, col, sinDato) {
        var MAL = repitenMas(svs, campo);
        Object.keys(MAL).forEach(function (k) { var m = MAL[k]; avisos.push('<p class="ralerta">⚠ ' + (campo === 'toro' ? 'El toro' : 'El inseminador') + ' <b>' + esc(k) + '</b> repite más que el resto: ' + Math.round(m.mx) + '% de concepción máxima contra ' + Math.round(m.rmx) + '% del resto (' + m.n + ' servicios).</p>'); });
        var G = {};
        svs.forEach(function (s) { var k = String(s[campo] || '').trim() || sinDato; var g = G[k] = G[k] || { ok: 0, mal: 0, pend: 0 }; g[s.r]++; });
        var L = Object.keys(G).map(function (k) { var g = G[k]; return { k: k, g: g, n: g.ok + g.mal + g.pend, sd: k === sinDato }; })
          .sort(function (a, b) { return a.sd !== b.sd ? (a.sd ? 1 : -1) : b.n - a.n || (a.k < b.k ? -1 : 1); });
        if (minimo) {
          var chic = L.filter(function (t) { return t.n < minimo && !t.sd; });
          if (chic.length > 1) {
            var o = { ok: 0, mal: 0, pend: 0 }; chic.forEach(function (t) { o.ok += t.g.ok; o.mal += t.g.mal; o.pend += t.g.pend; });
            L = L.filter(function (t) { return chic.indexOf(t) < 0; }); L.push({ k: 'Otros (' + chic.length + ')', g: o, n: o.ok + o.mal + o.pend, otros: true });
          }
        }
        var fila = function (t, tot) { var g = t.g, mal = !tot && MAL[t.k]; return '<tr' + (tot ? ' class="ttot"' : mal ? ' class="tmal"' : '') + '><td>' + (t.otros || t.sd ? '<i>' + esc(t.k) + '</i>' : '<b>' + (mal ? '⚠ ' : '') + esc(t.k) + '</b>') + '</td><td>' + t.n + '</td><td>' + p(g.ok, g.ok + g.mal) + '<small>' + g.ok + '/' + (g.ok + g.mal) + '</small></td><td>' + p(g.ok + g.pend, t.n) + '<small>' + (g.ok + g.pend) + '/' + t.n + '</small></td></tr>'; };
        var T = { ok: 0, mal: 0, pend: 0 }; svs.forEach(function (s) { T[s.r]++; });
        return '<table class="tbl rtbl vtbl titbl"><thead><tr><th>' + col + '</th><th>Serv.</th><th>Concep.</th><th>Conc. máx.</th></tr></thead><tbody>' +
          L.map(function (t) { return fila(t); }).join('') + (L.length > 1 ? fila({ k: 'Total', g: T, n: svs.length }, true) : '') + '</tbody></table>';
      };
      return '<div class="tibox">' + cab +
        '<h3 class="vh3">Por toro</h3>' + tabla('toro', 'Toro', 'Sin dato de toro') +
        '<h3 class="vh3">Por inseminador</h3>' + tabla('ins', 'Inseminador', 'Sin dato de inseminador') + avisos.join('') +
        (function () { var M = probMonta(svs), k = Object.keys(M); return k.length ? '<p class="cap">' + k.map(function (t) { return '<b>' + esc(t) + '</b> (' + M[t] + '%)'; }).join(', ') + (k.length === 1 ? ' parece un toro de monta' : ' parecen toros de monta') + ' (servicio anotado a la preñez): no se usa' + (k.length === 1 ? '' : 'n') + ' para comparar.</p>' : ''; })() +
        '<p class="cap">Concepción: servicios que preñaron / servicios con resultado. Conc. máx.: contando como preñadas las que no repitieron. Solo se avisa si la concepción máxima es menor a ' + CONC_OK + '% y claramente peor que el resto. Con pocos servicios (menos de 20) la diferencia puede ser casualidad.</p></div>';
    }
    function torosHTML(svs) {
      var grupo = function (campo, quien) {
        var M = repitenMas(svs, campo);
        return Object.keys(M).map(function (k) { var m = M[k]; return '<p class="ralerta">⚠ ' + quien + ' <b>' + esc(k) + '</b> repite más que el resto: ' + Math.round(m.mx) + '% de concepción máxima contra ' + Math.round(m.rmx) + '% del resto (' + m.n + ' servicios en la temporada).</p>'; });
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
    // resumen de las crías de Partos ocurridos: hembras y machos de vacas y de vaquillonas
    function sexoHTML(SX) {
      var T = { m: SX.v.m + SX.q.m, h: SX.v.h + SX.q.h, sd: SX.v.sd + SX.q.sd, mel: SX.v.mel + SX.q.mel };
      if (!T.m && !T.h) return '';
      var pH = function (x) { var n = x.m + x.h; return n ? nf(x.h / n * 100, 0) + '%' : '–'; };
      var fila = function (nom, x, cls) { return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + nom + '</td><td>' + nf(x.h) + '</td><td>' + nf(x.m) + '</td><td><b>' + pH(x) + '</b></td></tr>'; };
      return '<h3 class="vh3">Crías: hembras y machos</h3><table class="tbl"><thead><tr><th></th><th>Hembras</th><th>Machos</th><th>% hembras</th></tr></thead><tbody>' +
        fila('Partos de vacas', SX.v) + fila('Partos de vaquillonas', SX.q) + fila('<b>Total</b>', T, 'sep tot') + '</tbody></table>' +
        '<p class="cap">Cuenta cada cría' + (T.mel ? ' (hubo ' + T.mel + (T.mel === 1 ? ' parto de mellizos' : ' partos de mellizos') + ')' : '') + (T.sd ? '; ' + T.sd + (T.sd === 1 ? ' cría sin sexo anotado' : ' crías sin sexo anotado') : '') + '. El % de hembras es sobre las crías con sexo anotado.</p>';
    }
    function partosOcHTML() {
      if (DB.fuente !== 'syscaw' || !DB.hist) return '';
      var G = rangoVO(), M = G.M, keys = M.map(function (x) { return x.key; }), pv = M.map(function () { return 0; }), pq = pv.slice(), ab = 0;
      var SX = { v: { m: 0, h: 0, sd: 0, mel: 0 }, q: { m: 0, h: 0, sd: 0, mel: 0 } };
      infLista().forEach(function (x) { x.h.pa.forEach(function (p) {
        var k = keys.indexOf(p[0].slice(0, 7)); if (k < 0 || !enSel(unidadEn(x, p[0]))) return;
        if (/^A/.test(p[2] || '')) { ab++; return; }
        if (p[1] === 1) pq[k]++; else pv[k]++;
        // sexo de las crías (mellizos: cuenta cada cría)
        var cs = SX[p[1] === 1 ? 'q' : 'v'], cr = String(p[2] || '').split('/').filter(Boolean);
        if (cr.length > 1) cs.mel++;
        if (!cr.length) cs.sd++; cr.forEach(function (c) { if (c === 'M') cs.m++; else if (c === 'H') cs.h++; else cs.sd++; });
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
      var hT = SX.v.h + SX.q.h, mT = SX.v.m + SX.q.m;
      CLAVE['Partos'] = nf(tv + tq) + ' partos en 12 meses' + (hT + mT ? ' · ' + Math.round(hT / (hT + mT) * 100) + '% hembras' : '');
      return '<section class="card"><h2>Partos</h2>' + selMesHTML(G, 'pomes') +
        '<div class="kpis kpis2"><div><b>' + nf(tv) + '</b><span>Partos de vacas · ' + pc(tv) + '</span></div><div><b>' + nf(tq) + '</b><span>Partos de vaquillonas · ' + pc(tq) + '</span></div></div>' +
        '<div class="mleg"><span><i class="v"></i>Vacas</span><span><i class="q"></i>Vaquillonas</span></div>' +
        '<svg class="mchart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Partos ocurridos por mes, vacas y vaquillonas">' + s + '</svg>' +
        sexoHTML(SX) +
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
      return '<section class="card"><h2>Ordeñe y secas</h2>' +
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
      o.l1da = rd(r.l1.da); o.lada = rd(r.la.da); o.l1pc = rd(r.l1.pc); o.lapc = rd(r.la.pc); o.l1spc = rd(r.l1.spc); o.laspc = rd(r.la.spc); o.v = 2; return o; }
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
          if ((!V[fj] || V[fj].v !== 2) && fj > (DB.desdeHist || '0000')) { try { var f = A.lineaVida(L, esPren, fj); if (f.nE1p || f.l1.n || f.la.n) { V[fj] = vidaFoto(f); saveTambos(); } } catch (e) {} }
          // se compara con la última foto que tenga al menos 6 meses de diferencia con este respaldo
          // fotos guardadas con el cálculo anterior de la recría: se rehacen con el actual
          Object.keys(V).forEach(function (d) { if (V[d].v !== 2 && d > (DB.desdeHist || '0000')) { try { V[d] = vidaFoto(A.lineaVida(L, esPren, d)); saveTambos(); } catch (e) {} } });
          Object.keys(V).sort().forEach(function (d) { if (A.diffDays(ref, d) >= 180 && V[d].v === 2) ant = { f: d, v: V[d] }; });
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
          [G.pc != null ? '<b>' + n1(G.pc, 0) + '</b> días al 1er celo o servicio' : null, G.spc != null ? '<b>' + nf(G.spc, 1, 1) + '</b> servicios por preñez' : null, G.pren150 != null ? Math.round(G.pren150 * 100) + '% preñadas (de ' + G.n + ')' : null].filter(Boolean).join(' · '));
      };
      var lista = '<ol class="lvlist">' +
        paso('n', '●', 'Nace', 'Empieza la recría', '') +
        (r.e1s != null ? paso('s', '1', 'Primer servicio', n1(r.e1s) + ' meses<em> de edad</em>' + vs('e1s', 1, ' m'), 'De ' + r.nE1s + ' vaquillonas que parieron en los últimos 2 años') : '') +
        (r.spcV != null || r.ePren != null ? paso('p', '✓', 'Se preña', (r.ePren != null ? n1(r.ePren) + ' meses' : '–') + '<em> de edad</em>' + vs('ePren', 1, ' m'), r.spcV != null ? '<b>' + nf(r.spcV, 1, 1) + '</b> servicios por preñez' : '') : '') +
        (r.e1p != null ? paso('r', '★', 'Primer parto', n1(r.e1p) + ' meses<em> de edad</em>' + vs('e1p', 1, ' m'), (r.ePren != null ? n1(r.e1p - r.ePren) + ' meses después de preñarse' : '')) : '') +
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
        '<p class="cap">Promedios con lo que pasó desde el ' + A.fmt(r.desde) + ' (salida: últimos 12 meses), según ' + SRC() + '. Recría: las vaquillonas que parieron en los últimos 2 años, con su edad al primer servicio, a la preñez (el servicio que coincide con el parto) y al parto. Lactancias, mismas reglas que el índice: parto al primer celo o servicio; días abiertos hasta el servicio que coincide con el parto siguiente o el último antes del tacto positivo, y las vacas que siguen vacías con 150 días o más cuentan con los días que llevan (tope 300); servicios por preñez con tope 6. % preñadas: de las vacas con 150 días o más de paridas. Seca: del cierre de la lactancia al parto siguiente. Gestación: del servicio de la preñez hasta el parto.' + (ant ? ' En gris, la foto fija del 1/7/' + ant.f.slice(0, 4) + ' (los mismos 24 meses hasta esa fecha), para ver la evolución.' : ' Cada 1 de julio se guarda una foto fija de estos números para comparar con los años siguientes.') + '</p></section>';
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
      var probables = '<section class="card"><h2>Partos por mes</h2>' +
        '<div class="mleg"><span><i class="v"></i>Vacas <b>' + nf(sv) + '</b></span><span><i class="q"></i>Vaquillonas <b>' + nf(sq) + '</b></span></div>' +
        mesesStack(rv.meses, rq.meses) +
        (despues ? '<p class="cap">Además, ' + despues + ' después de ese período.</p>' : '') + '</section>';
      // orden: lo que pasó (partos, ordeñe y secas), lo que viene (partos, rodeo), y después índice, reproducción y línea de vida
      // agrupadas por tema; un grupo sin tarjetas no muestra su título
      var grp = function (t, html) { return html ? '<p class="grp">' + t + '</p><div class="glist">' + html + '</div>' : ''; };
      return '<h1 class="ptitle">Rodeo</h1>' + catsHTML() +
        grp('Lo que pasó', partosOcHTML() + vovsHTML()) +
        grp('Lo que viene', probables + proyHTML()) +
        grp('Reproducción', repHTML() + (prenOK() ? prenHTML() : '')) +
        grp('El rodeo', idxCardHTML() + (prenOK() ? ccRodeoHTML() : '') + vidaHTML());
    }
    function rodeoHTML() {
      if (state.cat === 'pren') state.cat = 'todas';
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
      // cada categoría muestra solo lo suyo; lo que es de todo el rodeo (partos por mes, ordeñe y secas, índice) queda en Todas.
      // mismo formato que Todas: grupos con título y tarjetas plegables en una lista
      var grp = function (t, html) { return html ? '<p class="grp">' + t + '</p><div class="glist">' + html + '</div>' : ''; };
      return '<h1 class="ptitle">Rodeo</h1>' + catsHTML() +
        '<p class="grp">Estado</p><section class="card fijo"><h2>' + nf(r.total) + ' ' + nombreGrupo(r.total) + '</h2><div class="comp" role="img" aria-label="Composición del rodeo por estado">' + seg + '</div><div class="legend">' + leg + '</div></section>' +
        (state.cat === 'vaquillona' ? grp('Reproducción', vaqHTML()) : '') +
        grp('El rodeo', (r.leche != null ? '<section class="card"><h2>Producción</h2>' + kv([['Litros por vaca, último control', nf(r.leche, 1) + ' lts'], ['Vacas con control lechero', nf(r.nLeche)], ['Días en lactancia, promedio', r.dLac != null ? nf(r.dLac) : null]]) + '</section>' : '') + rod);
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
      var W = 300, H = 140, L = 26, Rr = 40, T = 20, B = 22, n = pts.length;
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
        // litros arriba de cada barra (con muchos controles, la letra se achica para que no se pisen)
        s += '<text class="val" x="' + x.toFixed(1) + '" y="' + (y - 4).toFixed(1) + '" text-anchor="middle"' + (n > 8 ? ' style="font-size:' + (n > 10 ? 8.5 : 9.5) + 'px"' : '') + '>' + nf(c[1], c[1] >= 100 ? 0 : 1) + '</text>';
        if (i === 0 || i === n - 1 || n <= 8) s += '<text class="lbl" x="' + x.toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + c[0].slice(8, 10) + '/' + c[0].slice(5, 7) + '</text>';
      });
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
    // condición corporal de la vaca: evolución (con los partos marcados) y los últimos registros
    function ccHTML(h) {
      var L = h.ech && h.ech.length ? h.ech : (h.ec ? [h.ec] : []);
      if (!L.length) return '';
      var cc = function (v) { return Number(v).toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
      var del = function (f) { var p = null; h.pa.forEach(function (q) { if (q[0] <= f) p = q[0]; }); return p ? A.diffDays(f, p) : null; };
      var g = '';
      if (L.length > 1) {
        var W = 300, H = 130, ml = 26, mr = 10, mt = 18, mb = 20, f0 = L[0][0], f1 = L[L.length - 1][0], span = Math.max(1, A.diffDays(f1, f0));
        var lo = Math.min(2, Math.floor(Math.min.apply(null, L.map(function (x) { return x[1]; })) * 2) / 2), hi = Math.max(4, Math.ceil(Math.max.apply(null, L.map(function (x) { return x[1]; })) * 2) / 2);
        var X = function (f) { return ml + A.diffDays(f, f0) / span * (W - ml - mr); }, Y = function (v) { return mt + (1 - (v - lo) / (hi - lo)) * (H - mt - mb); };
        for (var v = lo; v <= hi + 1e-9; v += 0.5) g += '<line class="lgrid" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '"/><text class="mlbl" x="' + (ml - 4) + '" y="' + (Y(v) + 3).toFixed(1) + '" text-anchor="end">' + (v % 1 ? v.toFixed(1).replace('.', ',') : v) + '</text>';
        h.pa.forEach(function (p) { if (p[0] < f0 || p[0] > f1) return; var x = X(p[0]).toFixed(1); g += '<line x1="' + x + '" x2="' + x + '" y1="' + mt + '" y2="' + (H - mb) + '" stroke="var(--gold)" stroke-dasharray="3 3"/><text class="mlbl" x="' + x + '" y="' + (H - 6) + '" text-anchor="middle">parto</text>'; });
        g += '<polyline fill="none" stroke="var(--navy)" stroke-width="2" stroke-linejoin="round" points="' + L.map(function (x) { return X(x[0]).toFixed(1) + ',' + Y(x[1]).toFixed(1); }).join(' ') + '"/>';
        L.forEach(function (x, i) { g += '<circle cx="' + X(x[0]).toFixed(1) + '" cy="' + Y(x[1]).toFixed(1) + '" r="3" fill="var(--navy)"/>' + (L.length <= 10 || i === L.length - 1 ? '<text class="val" x="' + X(x[0]).toFixed(1) + '" y="' + (Y(x[1]) - 6).toFixed(1) + '" text-anchor="middle" style="font-size:9.5px">' + cc(x[1]) + '</text>' : ''); });
        g = '<svg class="bars" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Condición corporal en el tiempo">' + g + '</svg>';
      }
      var filas = L.slice(-8).reverse().map(function (x) { var d = del(x[0]); return '<tr><td>' + A.fmt(x[0]) + '</td><td><b>' + cc(x[1]) + '</b></td><td>' + (d != null ? d : '–') + '</td></tr>'; }).join('');
      return '<section class="card"><h2>Condición corporal</h2>' + g + '<div class="scroll"><table class="htbl"><thead><tr><th>Fecha</th><th>Condición</th><th>Días en leche</th></tr></thead><tbody>' + filas + '</tbody></table></div></section>';
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
        (h ? lactHTML(h) + (h.pa.length || h.ev.length || h.ta.length ? histHTML(a, h) : '') + ccHTML(h) : '') +
        (h && h.corto ? '<p class="hint">Baja de hace más de 2 años: la app guarda solo los datos básicos. El historial completo está en ' + SRC() + '.</p>' : h && h.ult && h.pa.length ? '<p class="hint">De las bajas se guardan los últimos 2 años. El historial completo está en SysCaw.</p>' : '') +
        '<section class="card"><h2>Identificación</h2>' + kv([['RP', esc(a.rp)], ['Origen', esc(a.nombre)], ['Nacimiento', h && h.fn ? A.fmt(h.fn) : null], ['Edad al primer parto', h && h.fn && h.pa.length && h.pa[0][1] === 1 ? nf(A.diffDays(h.pa[0][0], h.fn) / 30.44, 1) + ' meses' : null], ['Madre (RP)', madre], ['Padre', h && h.pd ? esc(h.pd) : null]], 'kvs') + '</section>' +
        '<p class="src">' + SRCbase().replace(/^./, function (c) { return c.toUpperCase(); }) + (DB.fecha ? ' del ' + A.fmt(DB.fecha) : '') + '</p>';
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
        // seca: cuánto duró la lactancia (del parto al secado), no los días desde el parto
        (function () {
          var lpH = h && h.pa && h.pa.length ? h.pa[h.pa.length - 1] : null, real = a.cat === 'seca' && lpH && lpH[5] && a.pFecha && lpH[5] > a.pFecha ? lpH[5] : null;
          return real ? ['Días de lactancia', nf(A.diffDays(real, a.pFecha)) + ' <small>hasta el secado</small>'] : ['Días en lactancia', dLac != null ? nf(dLac) : null];
        })(),
        ['Fecha del último servicio', a.sFecha ? A.fmt(a.sFecha) : null],
        ['Días del último servicio', a.sFecha ? String(A.diffDays(t, a.sFecha)) : null],
        ['Número de servicio', a.sN != null ? String(a.sN) : null],
        ['Toro / Insem.', toro],
        ['Todos los servicios', torosLac],
        ['Último tacto y resultado', tacto],
        ['Parto probable', a.estado === 'prenada' && d.partoProb ? A.fmt(d.partoProb) + (d.partoEstimado ? ' <small>estimado</small>' : '') : null],
        // seca: la fecha real del secado (del programa); en ordeñe y preñada: el secado que se estima según el parto probable
        (function () {
          var lpH = h && h.pa && h.pa.length ? h.pa[h.pa.length - 1] : null, real = lpH && lpH[5] && (!a.pFecha || lpH[5] > a.pFecha) ? lpH[5] : null;
          if (a.cat === 'seca') return ['Secada', real ? A.fmt(real) + ' <small>hace ' + A.diffDays(today(), real) + ' días</small>' : null];
          return ['Secado', a.estado === 'prenada' && d.secado && (a.cat === 'vaca' || !a.cat) ? A.fmt(d.secado) + ' <small>estimado</small>' : null];
        })()
      ]);
      var madre = h && h.ma ? (byRp(h.ma) ? '<button class="lnk" data-rp="' + esc(h.ma) + '">' + esc(h.ma) + '</button>' : esc(h.ma)) : null;
      return '<button class="backbtn" data-a="back"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>Volver</button>' +
        // debajo de la caravana, una sola palabra: ordeñe, seca, vaquillona o ternera
        '<header class="fh"><div class="fhtag">' + tagSVG(a.rp, 118) + '<div class="fhlote" style="text-align:center;margin-top:6px;max-width:118px;font-size:15px;font-weight:700;line-height:1.2">' + (enPreparto(a) ? 'Preparto' : ({ vaca: 'Ordeñe', seca: 'Seca', vaquillona: 'Vaquillona', ternera: 'Ternera' }[a.cat] || '')) + '</div></div><div class="fhinfo"><div class="nm">' + esc(a.nombre || 'Sin nombre') + '</div>' +
        '<div class="fhchips">' + chip(a) + (repetidora(a) ? SELLO_REP : '') + (a.rech ? '<span class="chip descarte">Descarte' + (a.rechDet || a.rech ? ': ' + esc(a.rechDet || a.rech) : ' programado') + '</span>' : '') + (!esOperario() && paraVenta(a) ? '<span class="chip venta2">Para venta</span>' : '') + (function () { var pa = esVet() ? partoAtrasado(a) : null; return pa ? '<span class="chip venta2">Parto atrasado · ' + pa.d + ' días</span>' : ''; })() + '</div></div>' + idxBadge(a) + '</header>' +
        (datos ? '<section class="card datos">' + datos + '</section>' : '') +
        (h && h.ct.length ? '<section class="card"><h2>Control lechero</h2>' + prodHistHTML(a, h) + '</section>' : (bars(a.pr || []) ? '<section class="card"><h2>Control lechero</h2>' + bars(a.pr) + '</section>' : '')) +
        (h ? lactHTML(h) + (h.pa.length || h.ev.length || h.ta.length ? histHTML(a, h) : '') + ccHTML(h) : '') +
        idxFichaHTML(a) +
        '<section class="card"><h2>Identificación</h2>' + kv([['RP', esc(a.rp)], ['Origen', esc(a.nombre)], ['Id electrónica', esc(a.idElec)], ['Nacimiento', h && h.fn ? A.fmt(h.fn) : null], ['Edad al primer parto', h && h.fn && h.pa.length && h.pa[0][1] === 1 ? nf(A.diffDays(h.pa[0][0], h.fn) / 30.44, 1) + ' meses' : null], ['Madre (RP)', madre], ['Padre', h && h.pd ? esc(h.pd) : null], ['Rodeo', esc(a.rod)]], 'kvs') + '</section>' +
        (h ? '<p class="src">Historial ' + (externo(DB.origen) ? 'de la ' : 'del ') + SRCbase() + (DB.fecha ? ' del ' + A.fmt(DB.fecha) : '') + '</p>' : '');
    }

    // tarjetas de la ficha: se ven solo con el título y se despliegan al tocarlo (se recuerda cuáles quedan abiertas)
    var FICHA_AB = {};
    /* ----- modo veterinario: compartir una tarjeta como imagen (para mandar por WhatsApp) ----- */
    /* ----- modo veterinario: compartir como imagen (WhatsApp). Cada tarjeta se puede mandar como Gráfico, Tabla o las dos;
       formato vertical, encabezado con el tambo (o anónimo), línea con lo elegido, "dato clave" y firma ----- */
    var CLAVE = {}; // dato clave de cada tarjeta, por título; lo escriben las tarjetas al dibujarse
    function vetCompartir(main) {
      if (!esVet()) return;
      if (!document.getElementById('shCss')) { var st = document.createElement('style'); st.id = 'shCss'; st.textContent = '.shbtn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:44px;margin-top:12px;border:1.5px dashed var(--line);border-radius:12px;background:transparent;color:var(--link);font:inherit;font-size:15px;font-weight:700;cursor:pointer}.shopt{display:flex;align-items:center;gap:10px;font-weight:600;margin:4px 0 12px}.shopt input{width:22px;height:22px}'; document.head.appendChild(st); }
      var ico = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5M5 14v5h14v-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      Array.prototype.forEach.call(main.querySelectorAll('section.card'), function (sec) {
        if (!sec.querySelector('h2') || sec.querySelector('.shic')) return;
        sec.classList.add('consh');
        sec.insertAdjacentHTML('afterbegin', '<button class="shic" data-a="cardimg" aria-label="Compartir como imagen" title="Compartir">' + ico + '</button>');
      });
      var pan = main.querySelector('.panel');
      if (pan && !main.querySelector('.shbtn')) pan.insertAdjacentHTML('afterend', '<button class="shbtn" data-a="panelimg">' + ico + 'Compartir resumen de visita</button>');
    }
    function cargarH2C() {
      if (root.html2canvas) return Promise.resolve(root.html2canvas);
      return new Promise(function (ok, mal) { var sc = document.createElement('script'); sc.src = 'html2canvas.min.js?v=1'; sc.onload = function () { ok(root.html2canvas); }; sc.onerror = function () { mal(new Error('sin conexión')); }; document.head.appendChild(sc); });
    }
    function shNombre() { var v = null; try { v = localStorage.getItem('libreta:shnom'); } catch (e) {} return v !== '0'; }
    // lo que está elegido en la tarjeta (botones marcados, mes), dicho en una línea
    function shContexto(sec, soloGraf) {
      var t = [], corte = soloGraf ? sec.querySelector('h3, table') : null;
      var antes = function (el) { return !corte || (corte.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING); };
      Array.prototype.forEach.call(sec.querySelectorAll('.fchip[aria-pressed="true"]'), function (b) { if (!antes(b)) return; var x = b.dataset.ctx || b.textContent.trim(); if (/^\d+ meses$/.test(x)) x = 'Últimos ' + x; t.push(x); });
      Array.prototype.forEach.call(sec.querySelectorAll('input[type=month],input[type=date]'), function (x) { var v = x.value || ''; if (/^\d{4}-\d{2}$/.test(v)) t.push('Hasta ' + A.MESES[+v.slice(5, 7) - 1] + ' ' + v.slice(0, 4)); else if (v) t.push(A.fmt(v)); });
      return t.join(' · ');
    }
    function shPartes(sec) { return { g: !!sec.querySelector('svg.mchart'), t: !!sec.querySelector('table') }; }
    function compartirCard(sec) {
      state.shSec = sec;
      var tit = sec.querySelector('h2').textContent.split(' · ')[0].trim(), P = shPartes(sec);
      $('#sheetXTitle').textContent = 'Compartir · ' + tit;
      $('#xopts').innerHTML = '<label class="shopt"><input type="checkbox" id="shNom"' + (shNombre() ? ' checked' : '') + '> Con el nombre del tambo</label>' +
        '<p class="cap" style="margin:0 0 6px">Sin nombre sale como "Tambo" (para mandar a colegas).</p>';
      $('#xbtns').innerHTML = (P.g && P.t ? '<button class="btn primary big" data-a="shdos">Las dos imágenes</button><button class="btn big" data-a="shgraf">Solo el gráfico</button><button class="btn big" data-a="shtab">Solo la tabla</button>'
        : '<button class="btn primary big" data-a="shtodo">Compartir imagen</button>') + '<button class="btn" data-a="xcancel">Cancelar</button>';
      $('#sheetX').hidden = false;
    }
    // arma una "hoja" para la imagen: encabezado, título, contexto, dato clave, contenido y firma
    function shHoja(titulo, ctx, clave, nodo, alto) {
      var conNom = shNombre(), w = document.createElement('div');
      w.style.cssText = 'position:fixed;left:-10000px;top:0;width:400px;' + (alto ? 'min-height:' + alto + 'px;' : '') + 'box-sizing:border-box;padding:14px;background:#EEF2F7;color-scheme:light;font-family:var(--sans);display:flex;flex-direction:column;' +
        '--bg:#EEF2F7;--surface:#FFFFFF;--ink:#0D1A33;--muted:#53627B;--line:#D3DBE7;--navy:#12274A;--on-navy:#FFFFFF;--gold:#C9A227;--link:#1F4FA3;--prenada:#16794A;--servida:#6B3FA0;--vacia:#B3261E;--ciclando:#2457A6;--apta:#8A6510;--sin:#53627B;--descarte:#B3261E;--bar:#9FB0CC;--bar-last:#12274A;--cl1:#C9A227;--cl2:#12274A;--clm:#0E7C86';
      w.innerHTML = '<div style="background:#12274A;color:#fff;border-radius:14px;padding:12px 16px;margin-bottom:12px;border-bottom:4px solid #C9A227"><div style="font-size:12px;letter-spacing:.06em;color:#C9A227;font-weight:700">DR. MAURO TORTEROLO</div><div style="font-size:21px;font-weight:800;line-height:1.2">' + esc(conNom ? (PERFIL.nombre || 'Tambo') : 'Tambo') + '</div><div style="font-size:13px;opacity:.85">Datos al ' + A.fmt(DB.fecha || today()) + '</div></div>' +
        '<div class="shcard" style="background:#fff;border:1px solid #D3DBE7;border-radius:16px;padding:14px 16px;flex:1"><div style="font-size:20px;font-weight:800;color:#0D1A33">' + esc(titulo) + '</div>' +
        (ctx ? '<div style="font-size:14px;color:#53627B;font-weight:600;margin-top:2px">' + esc(ctx) + '</div>' : '') +
        (clave ? '<div style="margin:8px 0 0;font-size:14px;font-weight:400;color:#0D1A33;line-height:1.45">' + clave.split('\n').map(esc).join('<br>') + '</div>' : '') +
        '<div class="shbody" style="margin-top:8px"></div></div>' +
        '<div style="text-align:center;font-size:12px;color:#53627B;margin-top:10px">Libreta de vacas · Dr. Mauro Torterolo · ' + A.fmt(today()) + '</div>';
      w.querySelector('.shbody').appendChild(nodo);
      return w;
    }
    function shLimpio(sec) {
      var c = sec.cloneNode(true);
      c.classList.add('open'); c.style.cssText = 'border:0;padding:0;margin:0;background:transparent;box-shadow:none';
      Array.prototype.forEach.call(c.querySelectorAll('.shbtn,.shic,.pdesc,.chev,details.nota,.despbtn,.insbtns,.filters,.secfecha,button.lnk,p.cap,.ralhint,h2,.clclave'), function (x) { x.remove(); });
      Array.prototype.forEach.call(c.querySelectorAll('.plgh'), function (x) { x.remove(); });
      return c;
    }
    function shImagen(w) {
      document.body.appendChild(w);
      return cargarH2C().then(function (h2c) {
        return h2c(w, { scale: 2.7, backgroundColor: '#EEF2F7', logging: false,
          onclone: function (doc) { Array.prototype.forEach.call(doc.styleSheets, function (sh) { var rs; try { rs = sh.cssRules; } catch (e) { return; } for (var q = rs.length - 1; q >= 0; q--) if (rs[q].media && /dark/.test(rs[q].media.mediaText)) sh.deleteRule(q); }); } });
      }).then(function (cv) { w.remove(); return new Promise(function (ok) { cv.toBlob(ok, 'image/png'); }); }, function (e) { w.remove(); throw e; });
    }
    // que: 'g' gráfico, 't' tabla, 'gt' las dos, 'todo' la tarjeta entera
    function shArmar(sec, que) {
      var tit = sec.querySelector('h2').textContent.split(' · ')[0].trim(), ctx = shContexto(sec), ctxG = shContexto(sec, true), clave = CLAVE[tit] || '', hojas = [];
      if (que.indexOf('g') >= 0 || que === 'todo') {
        var g = shLimpio(sec);
        if (que !== 'todo') Array.prototype.forEach.call(g.querySelectorAll('table,h3'), function (x) { x.remove(); });
        hojas.push(shHoja(tit, que === 'todo' ? ctx : ctxG, clave, g, que === 'todo' ? 0 : 500));
      }
      if (que.indexOf('t') >= 0 && que !== 'todo') {
        var t = shLimpio(sec);
        Array.prototype.forEach.call(t.querySelectorAll('svg.mchart,.mleg,.kpis,.panel,.vlinea'), function (x) { x.remove(); });
        // tablas largas: se parten en hojas de 13 filas (el encabezado se repite y el total va en la última)
        var tbs = t.querySelectorAll('table'), largo = tbs.length === 1 ? tbs[0].querySelectorAll('tbody tr') : [];
        if (largo.length > 14) {
          var filas = Array.prototype.slice.call(largo), pags = [];
          for (var q = 0; q < filas.length; q += 13) pags.push(filas.slice(q, q + 13));
          if (pags.length > 1 && pags[pags.length - 1].length === 1) { pags[pags.length - 2] = pags[pags.length - 2].concat(pags.pop()); }
          pags.forEach(function (pg, ix) {
            var tt = t.cloneNode(true), tb = tt.querySelector('tbody'), idx = filas.indexOf(pg[0]);
            Array.prototype.slice.call(tb.querySelectorAll('tr')).forEach(function (tr, k) { if (k < idx || k >= idx + pg.length) tr.remove(); });
            hojas.push(shHoja(tit + (pags.length > 1 ? ' (' + (ix + 1) + '/' + pags.length + ')' : ''), ctx, ix === 0 && que === 't' ? clave : '', tt, 0));
          });
        } else hojas.push(shHoja(tit, ctx, que === 't' ? clave : '', t, 0));
      }
      return hojas;
    }
    function shMandar(hojas, base) {
      busy(true, hojas.length > 1 ? 'Armando las ' + hojas.length + ' imágenes…' : 'Armando la imagen…');
      var blobs = [];
      return hojas.reduce(function (pr, w) { return pr.then(function () { return shImagen(w).then(function (b) { blobs.push(b); }); }); }, Promise.resolve()).then(function () {
        busy(false);
        var nom = (base + ' ' + (shNombre() ? (PERFIL.nombre || '') : '') + ' ' + (DB.fecha || today())).replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim();
        var files = []; try { files = blobs.map(function (b, i) { return new File([b], nom + (blobs.length > 1 ? ' ' + (i + 1) : '') + '.png', { type: 'image/png' }); }); } catch (e) { files = []; }
        var guardar = function () { blobs.forEach(function (b, i) { var u = URL.createObjectURL(b), el = document.createElement('a'); el.href = u; el.download = nom + (blobs.length > 1 ? ' ' + (i + 1) : '') + '.png'; document.body.appendChild(el); el.click(); el.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 4000); }); toast(blobs.length > 1 ? 'Imágenes guardadas en Descargas' : 'Imagen guardada en Descargas'); };
        if (files.length && navigator.canShare && navigator.canShare({ files: files })) navigator.share({ files: files }).catch(function (e) { if (!e || e.name !== 'AbortError') guardar(); });
        else guardar();
      }).catch(function (e) { busy(false); toast(e && e.message === 'sin conexión' ? 'Para armar la imagen la primera vez hace falta internet.' : 'No se pudo armar la imagen.'); });
    }
    function shDesdeSheet(que) {
      var ck = $('#shNom'); if (ck) try { localStorage.setItem('libreta:shnom', ck.checked ? '1' : '0'); } catch (e) {}
      $('#sheetX').hidden = true;
      var sec = state.shSec; if (!sec || !document.body.contains(sec)) { toast('Volvé a tocar Compartir.'); return; }
      var tit = sec.querySelector('h2').textContent.split(' · ')[0].trim();
      shMandar(shArmar(sec, que), tit);
    }
    // resumen de visita: los cuatro cuadros del Panel con su semáforo y los avisos
    function compartirPanel() {
      var main = $('#main') || document.querySelector('main'), pan = main && main.querySelector('.panel'); if (!pan) return;
      var d = document.createElement('div'), pres = main.querySelector('.pres');
      if (pres) d.appendChild(pres.cloneNode(true));
      var pc = pan.cloneNode(true); pc.style.marginTop = '10px'; d.appendChild(pc);
      shMandar([shHoja('Resumen de visita', 'Visita del ' + A.fmt(today()), '', d, 500)], 'Resumen de visita');
    }
    // qué hay adentro de cada tarjeta o lista: una línea gris debajo del título
    var DESC = {
      'Partos': 'Vacas y vaquillonas, mes a mes', 'Producción': 'Litros por vaca y días en leche del último control', 'Por rodeo': 'Animales y preñadas en cada rodeo', 'Reproducción de vaquillonas': 'Concepción, preñez y servicios por zafra', 'Ordeñe y secas': 'Cómo vinieron los últimos 12 meses',
      'Partos por mes': 'Los partos que se vienen', 'Rodeo por mes': 'Ordeñe, secas y preparto que se vienen',
      'Ciclos de 21 días': 'Servicio y concepción de cada ciclo', 'Comparar zafras': 'Los indicadores de cada zafra, lado a lado',
      'Índice del tambo': 'Las mejores y las peores vacas', 'Condición corporal': 'Al secado, al parto, a los 30 días y en la lactancia',
      'Últimos 12 meses': 'Litros y sólidos por vaca, mes a mes', 'Curva de lactancia': 'Primíparas y multíparas según días en leche',
      'Top 5 del control': 'Las que más litros dieron', 'Cayeron más': 'Las que bajaron 20% o más', 'Por lactancia y por tercio': 'Litros según lactancia y días en leche',
      'tactarvq': 'Servidas sin tacto posterior', 'secar': 'Preñadas cerca del parto', 'partos': 'Partos probables de las próximas semanas', 'atrasados': 'Preñadas con el parto vencido hace más de 30 días',
      'venta': 'Las que cumplen tu criterio de venta', 'insem': 'Liquidación por número de servicio'
    };
    // en la ficha de la vaca las tarjetas tienen su propia descripción
    var DESC_FICHA = {
      'Control lechero': 'Litros de los últimos controles', 'Lactancias': 'Litros y sólidos de cada lactancia',
      'Historial reproductivo': 'Partos, servicios y tactos', 'Índice del tambo': 'Su lugar entre las vacas del tambo',
      'Identificación': 'Caravana, nacimiento y origen', 'Condición corporal': 'Cómo fue cambiando, con los partos marcados'
    };
    function descDe(k, ficha) {
      if (ficha) return DESC_FICHA[k] || '';
      if (k === 'tactar' || k === 'tactarvq') return 'Servidas hace ' + A.DX_MIN + ' días o más, sin tacto';
      if (/^Preñez de la zafra/.test(k)) return 'Preñez acumulada contra la zafra anterior';
      if (/^La vaca /.test(k)) return 'La línea de vida del tambo';
      return DESC[k] || '';
    }
    function plegarFicha(main, ficha) {
      Array.prototype.forEach.call(main.querySelectorAll('section.card'), function (sec) {
        if (sec.classList.contains('datos') || sec.classList.contains('fijo')) return;
        var h2 = sec.querySelector('h2'); if (!h2) return;
        var head = h2.parentNode === sec ? h2 : h2.closest('.ixhead') || h2;
        if (head.parentNode !== sec) return;
        var key = h2.textContent.split(' · ')[0].trim(), ds = descDe(key, ficha);
        // título + descripción en un bloque: el título sigue siendo el h2 de siempre
        if (head === h2) { var w = document.createElement('div'); sec.insertBefore(w, h2); var tb = document.createElement('div'); tb.className = 'pttl'; tb.appendChild(h2); w.appendChild(tb); head = w; }
        // índice: el título y la descripción quedan juntos, a la izquierda del número
        if (head !== h2 && !head.querySelector('.pttl')) { var tb2 = document.createElement('div'); tb2.className = 'pttl'; head.insertBefore(tb2, h2); tb2.appendChild(h2); }
        if (ds) head.querySelector('.pttl').insertAdjacentHTML('beforeend', '<small class="pdesc">' + esc(ds) + '</small>');
        sec.classList.add('plg'); if (FICHA_AB[key]) sec.classList.add('open');
        head.classList.add('plgh'); head.setAttribute('role', 'button'); head.setAttribute('tabindex', '0'); head.setAttribute('aria-expanded', !!FICHA_AB[key]); head.dataset.plg = key;
        head.insertAdjacentHTML('beforeend', '<svg class="chev" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>');
      });
    }

    // las explicaciones largas (cómo se calcula cada cosa) quedan plegadas detrás de un botón
    function agruparPlegadas(main) {
      var cards = Array.prototype.filter.call(main.children, function (c) { return c.matches && c.matches('section.card.plg'); });
      var grupo = null, prev = null;
      cards.forEach(function (c) {
        if (!grupo || c.previousElementSibling !== prev) { grupo = document.createElement('div'); grupo.className = 'glist'; c.parentNode.insertBefore(grupo, c); }
        grupo.appendChild(c); prev = grupo;
      });
    }
    function plegarNotas(main) {
      Array.prototype.forEach.call(main.querySelectorAll('p.cap'), function (p) {
        if (p.closest('details.nota') || p.textContent.length < 160) return;
        var d = document.createElement('details'); d.className = 'nota';
        d.innerHTML = '<summary>Cómo se calcula</summary>';
        p.parentNode.insertBefore(d, p); d.appendChild(p);
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
    /* rondas de control: en un tambo con varias unidades, cada unidad puede controlar en un día distinto (T1 el 15, T2 el 16).
       Los controles de unidades distintas separados por hasta 7 días forman una sola ronda: se suman vacas, litros y días en leche,
       y la ronda lleva la fecha de su último control. Devuelve { fecha: { v, l, d, nd } } como si fuera un control por fecha. */
    function rondasCtrl(C) {
      var L = C.slice().sort(function (x, y) { return x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0; }), R = [], cur = null;
      L.forEach(function (c) {
        if (!(c[2] > 0)) return;
        var u = c[1] == null ? 0 : c[1];
        if (!cur || A.diffDays(c[0], cur.ini) > 7 || cur.us[u]) { cur = { ini: c[0], f: c[0], us: {}, v: 0, l: 0, d: 0, nd: 0 }; R.push(cur); }
        cur.us[u] = 1; cur.f = c[0]; cur.v += c[2]; cur.l += c[3] || 0; if (c[4]) { cur.d += c[4] * c[2]; cur.nd += c[2]; }
      });
      var out = {}; R.forEach(function (r) { var x = out[r.f]; if (x) { x.v += r.v; x.l += r.l; x.d += r.d; x.nd += r.nd; } else out[r.f] = { v: r.v, l: r.l, d: r.d, nd: r.nd }; });
      return out;
    }
    function prom(l, f) { var s = 0, n = 0; l.forEach(function (x) { var v = f(x); if (v != null && !isNaN(v)) { s += v; n++; } }); return n ? s / n : null; }
    // evolución mensual del control lechero: últimos 12 meses vs año anterior vs promedio histórico del mismo mes
    function evolucion(med) {
      var C = (DB.ctrls || []).filter(function (c) { return !DB.sel || !DB.sel.length || DB.sel.indexOf(c[1]) >= 0; });
      if (C.length < 3) return null;
      var porFecha = rondasCtrl(C);
      var mes = {};
      Object.keys(porFecha).forEach(function (f) {
        var x = porFecha[f], k = f.slice(0, 7), m = mes[k] || (mes[k] = { s: 0, n: 0, v: 0, d: 0, nd: 0 });
        m.s += med === 'lv' ? x.l / x.v : med === 'lt' ? x.l : x.v; m.n++; m.v += x.v; m.d += x.d; m.nd += x.nd;
      });
      // el primer mes con registros suele estar incompleto: si tiene muchas menos vacas que el siguiente, no se usa
      var ks = Object.keys(mes).sort();
      if (ks.length > 1 && mes[ks[0]].v / mes[ks[0]].n < 0.7 * mes[ks[1]].v / mes[ks[1]].n) delete mes[ks[0]];
      var val = function (k) { return mes[k] ? mes[k].s / mes[k].n : null; };
      var delm = function (k) { return mes[k] && mes[k].nd ? mes[k].d / mes[k].nd : null; };
      var ult = Object.keys(mes).sort().pop(), y = +ult.slice(0, 4), m0 = +ult.slice(5, 7);
      var out = [], primer = null;
      for (var i = 11; i >= 0; i--) {
        var mm = m0 - i, yy = y; while (mm < 1) { mm += 12; yy--; }
        var k = yy + '-' + pad2(mm), ka = (yy - 1) + '-' + pad2(mm);
        // histórico: promedio del mismo mes en los años anteriores al año pasado, solo si hay 2 años o más (un año suelto no es un histórico)
        var hs = [], hk = []; Object.keys(mes).forEach(function (kk) { if (kk.slice(5) === pad2(mm) && kk < ka) { hs.push(val(kk)); hk.push(kk); } });
        if (hs.length >= 2) hk.forEach(function (kk) { if (!primer || kk < primer) primer = kk; });
        out.push({ label: A.MESES[mm - 1], anio: yy, cur: val(k), prev: val(ka), del: delm(k), hist: hs.length >= 2 ? hs.reduce(function (s, x) { return s + x; }, 0) / hs.length : null });
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
      if (!E) return DB.fuente === 'syscaw' ? '<section class="card"><h2>Últimos 12 meses</h2><p class="cap" style="margin:0">Para ver la evolución, volvé a cargar ' + (DB.origen === 'sigea' ? 'la base de SIGEA' : DB.origen === 'dhm' ? 'la base de DHM' : DB.origen === 'delpro' ? 'la base de DelPro' : DB.origen === 'fosapp' ? 'la base de FOSAPP' : 'el respaldo de SysCaw') + ' (Ajustes → Actualizar este tambo).</p></section>' : '';
      var nombre = { lv: 'Litros por vaca', lt: 'Litros totales del tambo', vo: 'Vacas en ordeñe' };
      var chips = '<div class="filters" role="group" aria-label="Medida">' + [['lv', 'L/vaca'], ['lt', 'Litros totales'], ['vo', 'Vacas']].map(function (c) { return '<button class="fchip" data-ev="' + c[0] + '" data-ctx="' + nombre[c[0]] + '" aria-pressed="' + (med === c[0]) + '">' + c[1] + '</button>'; }).join('') + '</div>';
      var hayH = E.meses.some(function (m) { return m.hist != null; }), hayD = E.meses.some(function (m) { return m.del != null; });
      var d = function (v) { return v == null ? '–' : med === 'lv' ? nf(v, 1) : nf(v); };
      var dif = function (a, b) { if (a == null || b == null || !b) return ''; var p = Math.round((a - b) / b * 100); return ' <small class="' + (p >= 0 ? 'up' : 'dn') + '">' + (p > 0 ? '+' : p < 0 ? '−' : '') + nf(Math.abs(p), 0) + '%</small>'; };
      var filas = E.meses.slice().reverse().map(function (m) { return '<tr><td>' + m.label + ' ' + String(m.anio).slice(2) + '</td><td>' + d(m.cur) + dif(m.cur, m.prev) + '</td>' + (hayD ? '<td>' + (m.del != null ? nf(m.del) : '–') + '</td>' : '') + '<td>' + d(m.prev) + '</td>' + (hayH ? '<td>' + d(m.hist) + '</td>' : '') + '</tr>'; }).join('');
      (function () {
        var uu = null; E.meses.forEach(function (m) { if (m.cur != null) uu = m; });
        if (!uu) { CLAVE['Últimos 12 meses'] = ''; return; }
        var pp = uu.prev != null && uu.prev ? (uu.cur - uu.prev) / uu.prev * 100 : null;
        CLAVE['Últimos 12 meses'] = uu.label.replace(/^./, function (c) { return c.toUpperCase(); }) + ' ' + uu.anio + ': ' + d(uu.cur) + (med === 'lv' ? ' L' : '') + (pp != null ? ' (' + (pp >= 0 ? '+' : '−') + nf(Math.abs(pp), 0) + '% vs año anterior)' : '');
      })();
      return '<section class="card"><h2>Últimos 12 meses</h2>' + chips +
        '<div class="mleg"><span><i class="ecur"></i>Últimos 12 meses</span><span><i class="eprev"></i>Año anterior</span>' + (hayH ? '<span><i class="ehist"></i>Promedio histórico' + (E.desde ? ' (desde ' + E.desde + ')' : '') + '</span>' : '') + '</div>' +
        evolChart(E, med) +
        '<table class="tbl ptbl"><thead><tr><th>Mes</th><th>Este año</th>' + (hayD ? '<th>DEL</th>' : '') + '<th>Año ant.</th>' + (hayH ? '<th>Histórico</th>' : '') + '</tr></thead><tbody>' + filas + '</tbody></table>' +
        '<p class="cap">' + nombre[med] + (DB.origen === 'delpro' ? ' según la producción diaria de cada vaca en DelPro (medidores), resumida por semana; el mes es el promedio de sus semanas.' : ' según el control lechero de ' + SRC() + '; si hay más de un control en el mes, se promedian.') + ' El % compara con el mismo mes del año anterior.' + (hayD ? ' DEL: días en leche promedio de las vacas en ordeñe en el control de este año.' : '') + ' Histórico: promedio del mismo mes en los años anteriores al año pasado; aparece cuando hay 2 años o más para promediar.</p></section>';
    }
    /* ----- curvas de lactancia por mes de parto (primíparas y multíparas) ----- */
    var CLC = { k: null, r: null };
    // SysCaw trae los promedios armados con todo el historial; las otras bases (o respaldos viejos) se arman con los controles de la libreta
    function curvasTambo() {
      var k = (DB.guardada || 0) + '|' + (DB.sel ? DB.sel.join(',') : '');
      if (CLC.k === k) return CLC.r;
      // promedios armados al leer el respaldo; los de una versión anterior (sin 'v|4') no se usan: se vuelve a la libreta
      var C = DB.curvas && DB.curvas['v|4'] ? DB.curvas : null, desdeLib = false, viejos = !!(DB.curvas && !C);
      if (!C || !Object.keys(C).length) {
        C = {}; desdeLib = true;
        if (root.SysCaw && root.SysCaw.curvaLact) {
          var pend = [], ref = DB.fecha || today();
          infLista().forEach(function (x) {
            var la = {}; (x.h.la || []).forEach(function (l) { la[l[0]] = l; });
            var pa = x.h.pa.filter(function (p) { return p[1] > 0; }).map(function (p) {
              var l = la[p[1]], L = l && l[1] > 0 ? l[1] : null, ok = l && l[3] >= 2 && l[3] <= 7 && l[4] >= 2 && l[4] <= 5.5;
              return { f: p[0], n: p[1], cierre: p[5] || null, baja: x.a.bFecha || null, pp: x.a.partoProb && x.a.partoProb > p[0] ? x.a.partoProb : null, sec: (DB.config && DB.config.secado) || A.SECADO, L: L, L305: l && l[2] > 0 ? l[2] : null, sol: ok && L ? L * (l[3] + l[4]) / 100 : null };
            });
            var ct = (x.h.ct || []).map(function (c) { return [c[0], c[1], 0, c[2] || null, c[3] || null]; });
            if (pa.length && ct.length) root.SysCaw.curvaLact(C, pa, ct, function (f) { var u = unidadEn(x, f); return u == null ? 0 : u; }, ref, pend);
          });
          root.SysCaw.curvaProy(C, pend);
        }
      }
      var L = Object.keys(C).filter(function (key) { if (!/^\d{4}-\d{2}\|/.test(key)) return false; var u = key.split('|')[2]; return enSel(+u) || enSel(u); }).map(function (key) { var q = key.split('|'); return { m: q[0], g: +q[1], d: C[key] }; });
      CLC = { k: k, r: { L: L, desdeLib: desdeLib, desde: L.reduce(function (a, x) { return !a || x.m < a ? x.m : a; }, '') } };
      return CLC.r;
    }
    function clSuma(lista) {
      var r = { n: 0, pk: 0, pn: 0, pd: 0, s: [], c: [], t: 0, tn: 0, gs: 0, gn: 0, e: 0, en: 0, es: 0, esn: 0, cs: 0, cn: 0 };
      lista.forEach(function (x) { var d = x.d; r.n += d.n; r.pk += d.pk; r.pn += d.pn; r.pd += d.pd; ['t', 'tn', 'gs', 'gn', 'e', 'en', 'es', 'esn', 'cs', 'cn'].forEach(function (q) { r[q] += d[q] || 0; }); for (var b = 0; b < 12; b++) { if (d.c[b]) { r.s[b] = (r.s[b] || 0) + d.s[b]; r.c[b] = (r.c[b] || 0) + d.c[b]; } } });
      return r;
    }
    function clTramo(r, b0, b1) { var s = 0, c = 0; for (var b = b0; b <= b1; b++) { if (r.c[b]) { s += r.s[b]; c += r.c[b]; } } return c >= 5 ? s / c : null; }
    function clChart(series) {
      var W = 340, H = 200, ml = 30, mr = 8, mt = 10, mb = 28, all = [];
      series.forEach(function (S) { for (var b = 0; b < 12; b++) if (S.r.c[b] >= 5) all.push(S.r.s[b] / S.r.c[b]); });
      if (!all.length) return '';
      var lo = Math.max(0, Math.floor(Math.min.apply(null, all) / 5) * 5), hi = Math.ceil(Math.max.apply(null, all) / 5) * 5; if (hi - lo < 10) lo = Math.max(0, hi - 10);
      var paso = hi - lo > 30 ? 10 : 5;
      var X = function (b) { return ml + b * (W - ml - mr) / 11; }, Y = function (v) { return H - mb - (v - lo) / (hi - lo) * (H - mt - mb); }, s = '';
      for (var v = lo; v <= hi; v += paso) s += '<line class="lgrid" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '"/><text class="mlbl" x="' + (ml - 5) + '" y="' + (Y(v) + 4).toFixed(1) + '" text-anchor="end">' + v + '</text>';
      for (var b = 1; b < 12; b += 2) s += '<text class="mlbl" x="' + (b === 11 ? W - mr : X(b)).toFixed(1) + '" y="' + (H - mb + 15) + '" text-anchor="' + (b === 11 ? 'end' : 'middle') + '">' + ((b + 1) * 25) + '</text>';
      s += '<text class="myear" x="' + (W - mr) + '" y="' + (H - 2) + '" text-anchor="end">días en leche</text>';
      series.forEach(function (S) {
        var seg = [], segs = [];
        for (var b = 0; b < 12; b++) { if (S.r.c[b] >= 5) seg.push([X(b), Y(S.r.s[b] / S.r.c[b]), S.r.s[b] / S.r.c[b], S.r.c[b], b]); else if (seg.length) { segs.push(seg); seg = []; } }
        if (seg.length) segs.push(seg);
        segs.forEach(function (sg) {
          if (sg.length > 1) s += '<polyline class="clp" style="stroke:' + S.col + (S.dash ? ';stroke-dasharray:5 4' : '') + '" points="' + sg.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/>';
          sg.forEach(function (p) { s += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + (S.dash ? 2.5 : 3) + '" style="fill:' + S.col + '"><title>' + S.nom + ', ' + (p[4] * 25 + 1) + ' a ' + ((p[4] + 1) * 25) + ' días: ' + nf(p[2], 1) + ' L (' + p[3] + ' lact.)</title></circle>'; });
        });
      });
      return '<svg class="mchart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Curva de lactancia: litros por día según días en leche">' + s + '</svg>';
    }
    var CL_PER = [['12', 'Este año'], ['24', 'Año anterior'], ['h', 'Histórico']];
    function curvasHTML() {
      if (!document.getElementById('clCss')) { var st = document.createElement('style'); st.id = 'clCss'; st.textContent = ':root{--cl1:#C9A227;--cl2:#12274A;--clm:#0E7C86}@media (prefers-color-scheme:dark){:root{--cl1:#E3B84A;--cl2:#7FA8EE;--clm:#5FD0D8}}.clp{fill:none;stroke-width:2.5;stroke-linejoin:round;stroke-linecap:round}.cltbl{font-size:14px}.cltbl th,.cltbl td{padding-left:4px;padding-right:4px}.cltbl td small{color:var(--muted);font-weight:600}.cltbl tr[data-clmes]{cursor:pointer}.cltbl tr.on td{background:color-mix(in srgb,var(--clm) 16%,transparent)}.clclave{margin:6px 0 0;font-size:14px;color:var(--ink);line-height:1.45}.cltbl td:first-child{white-space:nowrap}.cltbl td:first-child small{font-size:11px}.cltbl tr.clvac td,.cltbl tr.clpoco td{color:var(--muted)}.cltbl tr.clpoco td b{color:var(--muted)}.cltbl th small{font-weight:600}'; document.head.appendChild(st); }
      var T = curvasTambo(); if (!T.L.length) return '';
      var per = state.clPer || '12', g = state.clG || 2, ref = (DB.fecha || today()).slice(0, 7);
      var mesesAtras = function (n) { var y = +ref.slice(0, 4), m = +ref.slice(5, 7) - n; while (m < 1) { m += 12; y--; } return y + '-' + pad2(m); };
      // Este año: partos de los últimos 12 meses (en curso, estimadas); Año anterior: de 13 a 24 meses atrás (terminadas); Histórico: todo
      var desde = per === 'h' ? '0000' : per === '24' ? mesesAtras(23) : mesesAtras(11), hasta = per === '24' ? mesesAtras(12) : ref;
      var L = T.L.filter(function (x) { return x.m >= desde && x.m <= hasta; });
      var P1 = clSuma(L.filter(function (x) { return x.g === 1; })), P2 = clSuma(L.filter(function (x) { return x.g === 2; }));
      var col1 = 'var(--cl1)', col2 = 'var(--cl2)', colM = 'var(--clm)';
      var ser = [{ r: P2, col: col2, nom: 'Multíparas' }, { r: P1, col: col1, nom: 'Primíparas' }], mesSel = state.clMes || null;
      var Lg = L.filter(function (x) { return x.g === g; });
      var porMes = []; for (var m = 1; m <= 12; m++) { var mm = pad2(m); porMes.push({ m: m, r: clSuma(Lg.filter(function (x) { return x.m.slice(5, 7) === mm; })) }); }
      // 12 meses: en orden, del mes más viejo al más nuevo, con el año
      var filasMes = porMes;
      if (per !== 'h') { filasMes = []; for (var q = 11; q >= 0; q--) { var km = mesesAtras(q + (per === '24' ? 12 : 0)); filasMes.push({ m: +km.slice(5, 7), y: km.slice(2, 4), r: porMes[+km.slice(5, 7) - 1].r }); } }
      if (mesSel) { var rs = porMes[mesSel - 1].r; if (rs.n) ser.push({ r: rs, col: colM, nom: 'Partos de ' + A.MESES[mesSel - 1] + ' (' + (g === 1 ? 'prim.' : 'mult.') + ')', dash: true }); }
      var clG = function (nom, r) { return r.pn >= 3 ? nom + ': pico promedio por vaca ' + (r.pk / r.pn).toFixed(1).replace('.', ',') + ' L a los ' + nf(r.pd / r.pn, 0) + ' días' : ''; };
      CLAVE['Curva de lactancia'] = [clG('Multíparas', P2), clG('Primíparas', P1)].filter(Boolean).join('\n');
      var h = '<section class="card"><h2>Curva de lactancia</h2>' +
        '<div class="filters" role="group" aria-label="Período de partos">' + CL_PER.map(function (c) { return '<button class="fchip" data-clper="' + c[0] + '" aria-pressed="' + (per === c[0]) + '">' + c[1] + '</button>'; }).join('') + '</div>' +
        '<div class="mleg"><span><i style="background:' + col2 + '"></i>Multíparas · ' + nf(P2.n) + '</span><span><i style="background:' + col1 + '"></i>Primíparas · ' + nf(P1.n) + '</span>' + (mesSel && porMes[mesSel - 1].r.n ? '<span><i style="background:transparent;border-top:2px dashed ' + colM + ';border-radius:0;height:0;margin-top:5px"></i>Partos de ' + A.MESES[mesSel - 1] + '</span>' : '') + '</div>' +
        clChart(ser) + (CLAVE['Curva de lactancia'] ? '<p class="clclave">' + CLAVE['Curva de lactancia'].split('\n').map(esc).join('<br>') + '</p>' : '');
      var pico = function (r) { return r.pn >= 3 ? (r.pk / r.pn).toFixed(1).replace('.', ',') : '–'; };
      var tot = clSuma(Lg), est = per === '12';
      // sólidos: solo si la mayoría de las lactancias con total tienen análisis regulares (4 controles o más con grasa y proteína)
      var conSol = est ? tot.tn + tot.en >= 5 && (tot.gn + tot.esn) / (tot.tn + tot.en) >= 0.5 : tot.tn >= 5 && tot.gn / tot.tn >= 0.5;
      // Lact. = lactancias con las que se calculan litros y sólidos; con menos de 10 la fila va en gris
      var nL = function (r) { return r.tn + (est ? r.en : 0); };
      var litros = function (r) { var n = nL(r); return n ? nf((r.t + (est ? r.e : 0)) / n) : '–'; };
      var solidos = function (r) { var n = r.gn + (est ? r.esn : 0); return n >= 3 ? nf((r.gs + (est ? r.es : 0)) / n) : '–'; };
      h += '<h3 class="vh3">Por mes de parto</h3><div class="filters" role="group" aria-label="Lactancia">' + [[2, 'Multíparas'], [1, 'Primíparas']].map(function (c) { return '<button class="fchip" data-clg="' + c[0] + '" aria-pressed="' + (g === c[0]) + '">' + c[1] + '</button>'; }).join('') + '</div>' +
        '<table class="tbl cltbl"><thead><tr><th>Parto</th><th>Lact.</th><th>Pico</th><th>Litros 305 d' + (est ? ' <small>(est.)</small>' : '') + '</th>' + (conSol ? '<th>Kg sólidos' + (est ? ' <small>(est.)</small>' : '') + '</th>' : '') + '</tr></thead><tbody>' +
        filasMes.map(function (x) {
          var nomM = A.MESES[x.m - 1] + (x.y ? ' <small>' + x.y + '</small>' : '');
          if (!x.r.n) return '<tr class="clvac"><td>' + nomM + '</td><td>0</td><td colspan="' + (conSol ? 3 : 2) + '"></td></tr>';
          var cls = [mesSel === x.m ? 'on' : '', nL(x.r) < 10 ? 'clpoco' : ''].filter(Boolean).join(' ');
          return '<tr data-clmes="' + x.m + '"' + (cls ? ' class="' + cls + '"' : '') + '><td><b>' + nomM + '</b></td><td>' + nf(nL(x.r)) + '</td><td>' + pico(x.r) + '</td><td>' + litros(x.r) + '</td>' + (conSol ? '<td>' + solidos(x.r) + '</td>' : '') + '</tr>';
        }).join('') +
        '<tr class="sep tot"><td><b>Total</b></td><td><b>' + nf(nL(tot)) + '</b></td><td>' + pico(tot) + '</td><td><b>' + litros(tot) + '</b></td>' + (conSol ? '<td><b>' + solidos(tot) + '</b></td>' : '') + '</tr></tbody></table>';
      h += '<p class="cap">Lactancias de las vacas que parieron ' + (function () { var mn = function (k) { return A.MESES[+k.slice(5, 7) - 1] + ' ' + k.slice(0, 4); }; return per === 'h' ? 'desde ' + mn(T.desde) : per === '24' ? 'entre ' + mn(desde) + ' y ' + mn(hasta) + ' (el año anterior: lactancias que ya terminaron)' : 'en los últimos 12 meses, de ' + mn(desde) + ' a ' + mn(ref) + ' (este año: lactancias en curso)'; })() +
        ', con al menos un control lechero. Lact.: las lactancias con las que se calculan los litros y los sólidos (las que llegaron a 305 días o se secaron antes' + (est ? ', y las que están en curso, estimadas' : '') + '); en gris, los meses con menos de 10. Primíparas: 1ª lactancia; multíparas: 2ª o más. La curva es el promedio de litros por día en los controles, cada 25 días en leche; un punto se muestra con 5 lactancias o más. ' +
        'Pico: el promedio del pico de cada vaca (su control más alto hasta los 120 días; los días al pico están debajo del gráfico), como en el control lechero. Por eso es más alto que el punto más alto de la curva: cada vaca pica en un día distinto y al promediar por tramo la curva se achata. Cuentan las vacas con controles antes de los 60 días y después de los 90 (las recién paridas todavía no llegaron al pico). ' +
        'Litros 305 d: como en el control lechero (ICAR), los primeros 305 días según ' + SRC() + ', o el total real si la vaca se secó antes' + (est ? '; este año casi ninguna terminó, así que las que están en curso se <b>estiman</b> con la curva del propio tambo (su nivel en los controles que ya tiene, con la forma de la curva promedio) hasta su secado probable: las preñadas, hasta el parto probable menos los días de secado; las vacías, hasta los 305 días' : '') + '. ' +
        (tot.cn ? '<b>' + nf(tot.cn) + ' lactancias terminaron antes de los 305 días por venta o muerte</b>, con ' + nf(tot.cs / tot.cn) + ' L de promedio: no entran en la columna, porque reflejan el descarte y no la producción. ' : '') +
        'Kg sólidos: litros a 305 días × el % de grasa + proteína de los controles de cada vaca, en lactancias con 4 análisis o más' + (est ? ' (las en curso, con los que ya tienen)' : '') + (conSol ? '' : ' (en este tambo hay pocos, por eso no se muestra la columna)') + '. Debajo de cada valor, cuántas lactancias entran. Tocá un mes para ver su curva.' +
        (T.desdeLib && DB.fuente === 'syscaw' ? ' <b>Para el histórico completo, volvé a cargar el respaldo de SysCaw</b>: ahora solo están los controles de la lactancia actual y la anterior de cada vaca.' : T.desdeLib ? ' Con esta base solo están los controles de la lactancia actual y la anterior de cada vaca.' : '') + '</p>';
      return h + '</section>';
    }
    function lecheHTML() {
      var C = controlLechero(), V = C.V;
      if (!V.length) { var ev0 = evolHTML() + curvasHTML(); return '<h1 class="ptitle">Leche</h1>' + (evolHTML() ? '<p class="grp">Evolución</p><div class="glist">' + ev0 + '</div>' : curvasHTML() + '<section class="card"><p class="hint" style="margin:0">Este respaldo no trae controles lecheros.</p></section>'); }
      var lt = prom(V, function (v) { return v.lt; }), sol = prom(V, function (v) { return v.sol; });
      var conPrev = V.filter(function (v) { return v.prev && v.prev[1] > 0; });
      var dif = conPrev.length ? prom(conPrev, function (v) { return v.lt - v.prev[1]; }) : null;
      var cuadro = function (n, l, x) { return '<div><b>' + n + '</b><span>' + l + '</span>' + (x ? '<small>' + x + '</small>' : '') + '</div>'; };
      var res = '<section class="card fijo ctl"><h2>' + (C.fecha ? 'Control del ' + A.fmt(C.fecha) : 'Último control') + '</h2>' +
        (C.ant ? '<p class="ctlsub">Comparado con el del ' + A.fmt(C.ant).slice(0, 5) + '</p>' : '') + '<div class="ctlg">' +
        cuadro(nf(lt, 1) + ' L', 'litros por vaca', dif != null ? '<em class="' + (dif >= 0 ? 'up' : 'dn') + '">' + (dif >= 0 ? '+' : '−') + nf(Math.abs(dif), 1) + ' L</em>' : '') +
        (sol != null ? cuadro(nf(sol, 2) + ' kg', 'sólidos por vaca', nf(prom(V, function (v) { return v.sol != null ? v.g : null; }), 2) + '% G · ' + nf(prom(V, function (v) { return v.sol != null ? v.p : null; }), 2) + '% P') : '') +
        cuadro(nf(prom(V, function (v) { return v.del; })), 'días en leche, prom.') + cuadro(nf(V.length), 'vacas controladas') + '</div></section>';
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
      var grp = function (t, html) { return html ? '<p class="grp">' + t + '</p><div class="glist">' + html + '</div>' : ''; };
      return '<h1 class="ptitle">Leche</h1>' + res + grp('Evolución', evolHTML() + curvasHTML()) + grp('Las vacas', top5 + caida + tabla);
    }

    /* ----- activación por tambo: links firmados por el Dr. Mauro Torterolo ----- */
    var PUBKEY = {"kty":"EC","crv":"P-256","x":"-zikzRKxDR2Iml5AuWh6PgDIipwqr1fpHjwct7moAoQ","y":"eWwwwoCwgfWupZrAebMISU7Yx3aUlhEYOoAJ79GFda0"};
    var ACT = []; try { ACT = JSON.parse(localStorage.getItem('libreta:act')) || []; } catch (e) { ACT = []; }
    function esVet() { try { return !!localStorage.getItem('libreta:vet'); } catch (e) { return false; } }
    /* productores bloqueados: lista en bloqueos.json (raíz del sitio, sirve para la oficial y la de prueba). Se revisa al abrir la
       app y al volver la conexión; la última lista leída queda guardada, así que un productor bloqueado sigue bloqueado sin internet.
       No borra nada: si se lo saca de la lista, vuelve a ver todo con su misma activación. */
    var BLOQ = []; try { BLOQ = JSON.parse(localStorage.getItem('libreta:bloq')) || []; } catch (e) { BLOQ = []; }
    function esBloq(p) { return BLOQ.indexOf(String(p)) >= 0; }
    BLOQ = BLOQ.map(String);
    // links bloqueados uno por uno (bloqueos.json → "links"): cada link con datos tiene su id (el comienzo de su firma), que el
    // teléfono guarda al abrirlo. Así se corta un link puntual (un operario que se fue, un link reenviado) sin tocar al productor
    var BLOQL = []; try { BLOQL = JSON.parse(localStorage.getItem('libreta:bloqL')) || []; } catch (e) { BLOQL = []; }
    function linkId(token) { var q = String(token || '').split('.'); return q.length > 1 ? q[1].slice(0, 12) : null; }
    function actOK(x) { return !(x.p || []).some(esBloq) && !(x.lid && BLOQL.indexOf(x.lid) >= 0); }
    // activaciones de antes de esta versión: si el último link abierto es de ese tambo, se le agrega su id
    (function () {
      var u = ''; try { u = localStorage.getItem('libreta:ultLink') || ''; } catch (e) {}
      var mm = /#libreta=[a-f0-9]+\.[A-Za-z0-9_\-]+\.([A-Za-z0-9_\-]+)\.([A-Za-z0-9_\-]+)/.exec(u); if (!mm) return;
      var pl = null; try { pl = JSON.parse(new TextDecoder().decode(unb64u(mm[1]))); } catch (e) { return; }
      var cambio = false;
      ACT.forEach(function (x) { if (!x.lid && pl && JSON.stringify(x.p) === JSON.stringify(pl.p) && x.f === pl.f && (x.r || '') === (pl.r || '')) { x.lid = mm[2].slice(0, 12); cambio = true; } });
      if (cambio) try { localStorage.setItem('libreta:act', JSON.stringify(ACT)); } catch (e) {}
    })();
    function suspendido() {
      if (esVet()) return false;
      if (DB && DB.idProd && DB.idProd.some(esBloq)) return true;
      return ACT.length > 0 && !ACT.some(actOK);
    }
    function revisarBloqueos() {
      if (esVet() || !root.fetch) return;
      fetch(baseApp().replace(/prueba\/$/, '') + 'bloqueos.json?t=' + Date.now(), { cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
        .then(function (o) {
          var L = ((o && o.productores) || []).map(function (x) { return String(x && typeof x === 'object' ? x.p : x).trim(); }).filter(function (n) { return n && n !== 'undefined' && n !== 'null'; }).sort();
          var LL = ((o && o.links) || []).map(function (x) { return String(x && typeof x === 'object' ? x.l : x).trim(); }).filter(Boolean).sort();
          if (JSON.stringify(L) === JSON.stringify(BLOQ) && JSON.stringify(LL) === JSON.stringify(BLOQL)) return;
          BLOQ = L; BLOQL = LL; try { localStorage.setItem('libreta:bloq', JSON.stringify(BLOQ)); localStorage.setItem('libreta:bloqL', JSON.stringify(BLOQL)); } catch (e) {}
          render();
        }).catch(function () {});
    }
    function habilitado(ids) {
      if (esVet()) return true;
      ids = ids || [];
      if (ids.some(esBloq)) return false;
      if (!ids.length) return ACT.some(actOK);
      return ACT.some(function (x) { return actOK(x) && (x.p || []).some(function (q) { return ids.indexOf(q) >= 0; }); });
    }
    function bloqueado(nombre) {
      if (suspendido()) { render(); return; }
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
    /* tambo precargado por link (solo veterinario): los datos están cifrados en el sitio y la clave viaja solo en el link
       (#cargar=<archivo>.<clave>), que el navegador nunca manda al servidor */
    function leerPrecarga(texto) {
      var m = texto != null ? /#cargar=([a-z0-9]+)\.([A-Za-z0-9_\-]+)/.exec(texto) : /^#cargar=([a-z0-9]+)\.([A-Za-z0-9_\-]+)$/.exec(location.hash || '');
      if (!m) { if (texto != null) toast('No encontré un link de tambo en lo que pegaste.'); return; }
      if (texto == null) { try { localStorage.setItem('libreta:ultLink', location.href); } catch (e) {} try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { location.hash = ''; } }
      if (!esVet()) { toast('Este link es solo para el modo veterinario.'); return; }
      state.inicio = false;
      if (!root.crypto || !crypto.subtle || !root.DecompressionStream) { toast('Este teléfono no puede abrir el tambo precargado.'); return; }
      var b64u = function (t) { t = t.replace(/-/g, '+').replace(/_/g, '/'); while (t.length % 4) t += '='; var bin = atob(t), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
      var datos = fetch('datos/' + m[1] + '.bin', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('No encontré el tambo precargado (quizás ya se quitó).'); return r.arrayBuffer(); })
        .then(function (buf) {
          return crypto.subtle.importKey('raw', b64u(m[2]), 'AES-GCM', false, ['decrypt']).then(function (k) { return crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(buf, 0, 12) }, k, new Uint8Array(buf, 12)); });
        })
        .then(function (plano) { return new Response(new Blob([plano]).stream().pipeThrough(new DecompressionStream('gzip'))).text(); })
        .then(function (t) { var d = JSON.parse(t); d.unidades = d.unidades || []; d.sel = null; d.unidadesSel = []; return d; });
      datos.catch(function () {});
      state.destino = 'nuevo';
      listo.then(function () { cargarRespaldo(datos, { name: 'tambo-precargado' }, 'pre'); });
    }
    /* ===== link con los datos (productor u operario) =====
       El veterinario sube el tambo cifrado al sitio (datos/<id>.bin, con su permiso de GitHub) y manda un link
       #libreta=<id>.<clave>.<activación firmada>. La clave viaja solo en el link: en el sitio queda cifrado.
       Quien abre el link queda activado (productor u operario) y con el tambo cargado; el link no cambia y, cuando el
       veterinario sube datos nuevos, la app los toma sola al abrirse con internet. */
    var GH_REPO = 'matorterolo-star/MAURO-SYSCAW2.0';
    function ghToken() { try { return localStorage.getItem('libreta:gh') || ''; } catch (e) { return ''; } }
    function dirDatos() { return /\/prueba\//.test(location.pathname) ? 'prueba/datos/' : 'datos/'; }
    function baseApp() { return location.href.split('#')[0].split('?')[0].replace(/index\.html$/, ''); }
    function lnkMeta(id) { try { return JSON.parse(localStorage.getItem('libreta:lnk:' + id) || 'null'); } catch (e) { return null; } }
    function pedirToken() {
      var t = (prompt('Pegá el permiso (token) de GitHub para subir los datos de los links. Empieza con "github_pat_".', '') || '').trim();
      if (!t) return;
      busy(true, 'Probando el permiso…');
      fetch('https://api.github.com/repos/' + GH_REPO, { headers: { Authorization: 'Bearer ' + t, Accept: 'application/vnd.github+json' } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          busy(false);
          if (!j || !j.permissions || !j.permissions.push) { toast('Ese permiso no sirve: tiene que poder escribir en la app (Contents: Read and write).'); return; }
          try { localStorage.setItem('libreta:gh', t); } catch (e) {}
          toast('Permiso guardado. Ya podés mandar links con los datos.'); render();
        }, function () { busy(false); toast('No pude probar el permiso (¿sin internet?).'); });
    }
    function b64std(u) { var s = '', i, n = 0x8000; for (i = 0; i < u.length; i += n) s += String.fromCharCode.apply(null, u.subarray(i, i + n)); return btoa(s); }
    // el tambo activo, completo (todas las unidades), con el formato de un respaldo recién leído
    // SysCaw: número de productor; FOSAPP: 'F' + ProductorId (es el número del productor en el servidor de FOSAPP, distinto en cada tambo);
    // sin número: el código del link
    function idsLink(meta) { return DB.idProd && DB.idProd.length ? DB.idProd : ['L' + meta.id]; }
    function paqueteTambo(meta) {
      var t = tamboAct();
      return leerDB(TAMBOS.activo).then(function (o) {
        if (!o || !o.hist) throw new Error('El tambo no tiene datos cargados.');
        return { animales: o.todos || o.animales || [], bajas: o.bajasT || o.bajas || [], ctrls: o.ctrls || [], curvas: o.curvas || null, config: o.config || {}, unidades: o.unidades || [], sel: null, unidadesSel: [], hist: o.hist, codes: o.codes, fecha: o.fecha, desdeHist: o.desdeHist, idProd: o.idProd && o.idProd.length ? o.idProd : ['L' + meta.id], tambo: (t && t.nombre) || PERFIL.nombre || '', origen: o.origen || 'syscaw' };
      });
    }
    function subirDatos() {
      var tok = ghToken(), meta = lnkMeta(TAMBOS.activo), nuevo = !meta;
      if (nuevo) { var r = crypto.getRandomValues(new Uint8Array(8)), k = crypto.getRandomValues(new Uint8Array(32)); meta = { id: Array.prototype.map.call(r, function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''), k: b64u(k) }; }
      var url = 'https://api.github.com/repos/' + GH_REPO + '/contents/' + dirDatos() + meta.id + '.bin', H = { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json' };
      return paqueteTambo(meta).then(function (d) {
        var json = JSON.stringify({ v: 1, subido: new Date().toISOString(), d: d });
        return new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
      }).then(function (gz) {
        var iv = crypto.getRandomValues(new Uint8Array(12));
        return crypto.subtle.importKey('raw', unb64u(meta.k), 'AES-GCM', false, ['encrypt']).then(function (key) { return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, gz); })
          .then(function (ct) { var u = new Uint8Array(12 + ct.byteLength); u.set(iv, 0); u.set(new Uint8Array(ct), 12); return u; });
      }).then(function (u) {
        return (nuevo ? Promise.resolve(null) : fetch(url + '?ref=main', { headers: H, cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { return j && j.sha; }, function () { return null; }))
          .then(function (sha) {
            var body = { message: 'Datos del tambo para link (' + today() + ')', content: b64std(u), branch: 'main' }; if (sha) body.sha = sha;
            return fetch(url, { method: 'PUT', headers: H, body: JSON.stringify(body) });
          }).then(function (r) {
            if (r.status === 401 || r.status === 403) throw new Error('el permiso de GitHub venció o no alcanza. Cargalo de nuevo en Ajustes.');
            if (!r.ok) return r.text().then(function (t) { throw new Error('GitHub respondió ' + r.status + (t ? ': ' + t.slice(0, 120) : '')); });
            try { localStorage.setItem('libreta:lnk:' + TAMBOS.activo, JSON.stringify(meta)); } catch (e) {}
            return meta;
          });
      });
    }
    function linkDatos() {
      var fos = soloLink(DB.origen);
      if (externo(DB.origen) && !fos) { toast('Los tambos de ' + SRC() + ' son solo para el modo veterinario.'); return; }
      if (!fos && (!DB.idProd || !DB.idProd.length)) { toast('Cargá el respaldo de SysCaw de este tambo para mandar el link.'); return; }
      if (!root.CompressionStream || !crypto.subtle) { toast('Este navegador no puede armar el link. Usá Chrome.'); return; }
      if (!ghToken()) { if (confirm('Para mandar links con los datos, primero hay que cargar el permiso de GitHub (se hace una sola vez). ¿Cargarlo ahora?')) { closeSheet(); pedirToken(); } return; }
      closeSheet();
      var m = lnkMeta(TAMBOS.activo);
      $('#sheetXTitle').textContent = 'Link con los datos';
      $('#xopts').innerHTML = '<p class="cap" style="margin:0 0 10px">' + esc(PERFIL.nombre || 'Este tambo') + ': se suben los datos de hoy (cifrados) y se arma el link. ' + (m ? 'Este tambo ya tiene link: quien lo tenga recibe los datos nuevos al abrir la app con internet.' + (soloLink(DB.origen) ? ' Número para bloquearlo: <b>' + esc(idsLink(m).join(', ')) + '</b>.' : '') : 'El link no cambia: cuando cargues un respaldo nuevo, tocá "Solo actualizar los datos".') + '</p>';
      $('#xbtns').innerHTML = '<button class="btn primary big" data-a="lnkprod">Mandar a productor · app completa</button><button class="btn big" data-a="lnkop">Mandar a operario · solo buscar y ficha</button>' + (m ? '<button class="btn big" data-a="lnkact">Solo actualizar los datos</button>' : '') + '<button class="btn" data-a="lnklista">Links mandados · bloquear uno</button><button class="btn" data-a="xcancel">Cancelar</button>';
      $('#sheetX').hidden = false;
    }
    // registro de los links con datos que se mandaron desde este teléfono (solo veterinario)
    function linksMandados(cambiar) { var L = []; try { L = JSON.parse(localStorage.getItem('libreta:links')) || []; } catch (e) {} if (cambiar) { cambiar(L); try { localStorage.setItem('libreta:links', JSON.stringify(L.slice(0, 300))); } catch (e) {} } return L; }
    function linksLista() {
      var L = linksMandados(), bl = state.bloqLinks || BLOQL;
      $('#sheetXTitle').textContent = 'Links mandados';
      $('#xopts').innerHTML = '<p class="cap" style="margin:0 0 10px">Bloquear un link corta a quien lo abrió con él: deja de ver la libreta y de recibir datos nuevos. El productor y los demás links del tambo siguen andando. Se puede desbloquear después.</p>' +
        (L.length ? L.map(function (x) {
          var b = bl.indexOf(x.l) >= 0;
          return '<div class="lnkrow' + (b ? ' bloq' : '') + '"><span><b>' + esc(x.n || 'Tambo') + '</b><small>' + (x.para ? 'Para ' + esc(x.para) + ' · ' : '') + (x.r === 'op' ? 'Operario' : 'Productor') + ' · ' + A.fmt(x.f) + (x.h ? ' ' + x.h : '') + (b ? ' · <b>bloqueado</b>' : '') + '</small></span><button class="btn" data-a="lnkbloq" data-l="' + esc(x.l) + '">' + (b ? 'Desbloquear' : 'Bloquear') + '</button></div>';
        }).join('') : '<p class="hint">Todavía no hay links registrados en este teléfono (se registran desde esta versión).</p>') +
        '<button class="lnk" data-a="lnkpegbloq" style="display:block;margin:12px 0 0">Bloquear un link que no está en la lista (pegarlo)</button>' +
        '<style>.lnkrow{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-top:1px solid var(--line)}.lnkrow span{display:flex;flex-direction:column;min-width:0}.lnkrow small{color:var(--muted)}.lnkrow.bloq b{color:var(--vacia)}.lnkrow .btn{min-height:40px;padding:6px 12px}</style>';
      $('#xbtns').innerHTML = '<button class="btn" data-a="xcancel">Cerrar</button>';
      $('#sheetX').hidden = false;
    }
    // escribe bloqueos.json en GitHub (con el permiso de los links): agrega o saca el id del link
    function bloquearLink(lid, bloquear, nota) {
      var tok = ghToken(); if (!tok) { toast('Falta el permiso de GitHub (Ajustes → permiso para links).'); return; }
      if (bloquear && !confirm('¿Bloquear este link? Quien lo tenga deja de ver la libreta la próxima vez que abra la app con internet.')) return;
      var url = 'https://api.github.com/repos/' + GH_REPO + '/contents/bloqueos.json', H = { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json' };
      busy(true, bloquear ? 'Bloqueando el link…' : 'Desbloqueando el link…');
      fetch(url + '?t=' + Date.now(), { headers: H, cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('No pude leer la lista de bloqueos (' + r.status + ').'); return r.json(); }).then(function (j) {
        var o = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(j.content.replace(/\s/g, '')), function (c) { return c.charCodeAt(0); })));
        o.links = (o.links || []).filter(function (x) { return (x && typeof x === 'object' ? x.l : x) !== lid; });
        if (bloquear) o.links.push({ l: lid, n: nota || '', f: today() });
        var txt = JSON.stringify(o, null, 2) + '\n';
        return fetch(url, { method: 'PUT', headers: H, body: JSON.stringify({ message: (bloquear ? 'Bloquear' : 'Desbloquear') + ' link ' + lid, content: b64std(new TextEncoder().encode(txt)), sha: j.sha }) });
      }).then(function (r) {
        if (!r.ok) throw new Error('No pude guardar la lista de bloqueos (' + r.status + ').');
        var bl = (state.bloqLinks || BLOQL).filter(function (x) { return x !== lid; }); if (bloquear) bl.push(lid); state.bloqLinks = bl;
        busy(false); toast(bloquear ? 'Link bloqueado. Se aplica en 1 o 2 minutos.' : 'Link desbloqueado.'); linksLista();
      }).catch(function (e) { busy(false); toast(e && e.message || 'No se pudo.'); });
    }
    // lista de bloqueos que ve el veterinario (para marcar los bloqueados en la lista)
    function leerBloqLinks() {
      fetch(baseApp().replace(/prueba\/$/, '') + 'bloqueos.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (o) {
        state.bloqLinks = ((o && o.links) || []).map(function (x) { return String(x && typeof x === 'object' ? x.l : x); });
        if (!$('#sheetX').hidden && $('#sheetXTitle').textContent === 'Links mandados') linksLista();
      }).catch(function () {});
    }
    function linkDatosRol(rol) {
      $('#sheetX').hidden = true;
      var para = rol === 'act' ? '' : (prompt('¿Para quién es este link? (opcional: sirve para reconocerlo si un día hay que bloquearlo)', '') || '').trim().slice(0, 60);
      busy(true, 'Subiendo los datos…<small>Quedan cifrados; la clave va solo en el link</small>');
      var nombre = PERFIL.nombre || 'tu tambo';
      subirDatos().then(function (meta) {
        if (rol === 'act') { busy(false); toast('Datos actualizados: en 1 o 2 minutos les llegan a quienes tienen el link.'); return; }
        var pl = { p: idsLink(meta), n: nombre, f: today() }; if (rol === 'op') pl.r = 'op';
        return firmar(pl).then(function (tok) {
          busy(false);
          var link = baseApp() + '#libreta=' + meta.id + '.' + meta.k + '.' + tok;
          linksMandados(function (L) { var hh = new Date(); L.unshift({ l: linkId(tok), n: nombre, r: rol === 'op' ? 'op' : 'prod', f: today(), h: pad2(hh.getHours()) + ':' + pad2(hh.getMinutes()), para: para }); });
          var txt = 'Hola. Este es el link de la *Libreta de vacas* de ' + nombre + (rol === 'op' ? ' (operario)' : '') + ', con los datos ya cargados:\n\n' + link +
            '\n\nTocalo y se abre lista para usar. Cuando haya datos nuevos, se actualiza sola al abrirla con internet.\n\nDr. Mauro Torterolo';
          if (navigator.share) navigator.share({ text: txt }).catch(function () {}); else window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank');
          toast('Link listo. Funciona en 1 o 2 minutos (lo que tarda en publicarse).');
        });
      }).catch(function (e) { busy(false); toast('No pude subir los datos: ' + (e && e.message || e)); });
    }
    // bajar y descifrar los datos de un link
    function bajarLibreta(id, k) {
      return fetch('datos/' + id + '.bin', { cache: 'no-cache' }).then(function (r) { if (!r.ok) { var e = new Error(r.status === 404 ? 'Los datos todavía no están publicados. Probá de nuevo en un par de minutos.' : 'No pude bajar los datos (' + r.status + ').'); e.noPublicado = r.status === 404; throw e; } return r.arrayBuffer(); })
        .then(function (buf) { return crypto.subtle.importKey('raw', unb64u(k), 'AES-GCM', false, ['decrypt']).then(function (key) { return crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(buf, 0, 12) }, key, new Uint8Array(buf, 12)); }); })
        .then(function (plano) { return new Response(new Blob([plano]).stream().pipeThrough(new DecompressionStream('gzip'))).text(); })
        .then(function (t) { var o = JSON.parse(t), d = o.d; d.unidades = d.unidades || []; d.sel = null; d.unidadesSel = []; return { subido: o.subido || '', d: d }; });
    }
    function leerLibreta(texto) {
      var re = /#libreta=([a-f0-9]+)\.([A-Za-z0-9_\-]+)\.([A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+)/;
      var m = re.exec(texto != null ? texto : (location.hash || ''));
      if (!m) { if (texto != null) toast('No encontré un link de libreta en lo que pegaste.'); return false; }
      if (texto == null) { try { localStorage.setItem('libreta:ultLink', location.href); } catch (e) {} try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { location.hash = ''; } }
      if (!root.crypto || !crypto.subtle || !root.DecompressionStream) { toast('Este teléfono no puede abrir el link. Probá con Chrome o actualizá el teléfono.'); return true; }
      state.inicio = false;
      busy(true, 'Abriendo la libreta…');
      verificar(m[3]).then(function (pl) {
        if (!pl || !pl.p) throw new Error('El link no es válido.');
        if (!esVet()) { pl.lid = linkId(m[3]); if (BLOQL.indexOf(pl.lid) >= 0) throw new Error('Este link fue dado de baja. Pedile uno nuevo al Dr. Mauro Torterolo.'); ACT = ACT.filter(function (x) { return JSON.stringify(x.p) !== JSON.stringify(pl.p); }).concat([pl]); try { localStorage.setItem('libreta:act', JSON.stringify(ACT)); } catch (e) {} }
        // recién generado, el link puede tardar 1 o 2 minutos en publicarse: se reintenta solo hasta 4 minutos
        var intento = 0;
        var probar = function () {
          return bajarLibreta(m[1], m[2]).catch(function (e) {
            if (!e || !e.noPublicado || ++intento > 12) throw e;
            busy(true, 'Esperando que se publiquen los datos…<small>Recién generado, el link tarda 1 o 2 minutos. No cierres la app.</small>');
            return new Promise(function (ok) { setTimeout(ok, 20000); }).then(probar);
          });
        };
        return probar();
      }).then(function (pk) {
        return listo.then(function () {
          var ya = null; TAMBOS.lista.forEach(function (t) { if (t.lnkIn && t.lnkIn.id === m[1]) ya = t; });
          if (ya) { TAMBOS.activo = ya.id; state.destino = null; } else state.destino = 'nuevo';
          state.lnkPend = { id: m[1], k: m[2], subido: pk.subido };
          cargarRespaldo(Promise.resolve(pk.d), { name: 'link' }, 'pre');
        });
      }).catch(function (e) { busy(false); state.error = 'No pude abrir el link: ' + (e && e.message || e); render(); });
      return true;
    }
    // al abrir la app con internet: si el tambo vino por link y hay datos más nuevos, se actualiza solo
    function actualizarDesdeLink(aviso) {
      if (suspendido()) return;
      var t = tamboAct(); if (!t || !t.lnkIn || !root.DecompressionStream) return;
      if (navigator.onLine === false) { if (aviso) toast('Sin internet: probá de nuevo cuando tengas conexión.'); return; }
      if (aviso) busy(true, 'Buscando datos nuevos…');
      bajarLibreta(t.lnkIn.id, t.lnkIn.k).then(function (pk) {
        if (aviso) busy(false);
        if (!pk.subido || pk.subido <= (t.lnkIn.subido || '')) { if (aviso) toast('Ya tenés los últimos datos' + (t.lnkIn.subido ? ' (del ' + A.fmt(t.lnkIn.subido.slice(0, 10)) + ')' : '') + '.'); return; }
        var ids = pk.d.idProd || [];
        if (ids.length && !habilitado(ids)) {
          var ya = ACT.filter(function (x) { return (x.p || []).indexOf('L' + t.lnkIn.id) >= 0; })[0];
          if (ya) { ids.forEach(function (q) { if (ya.p.indexOf(q) < 0) ya.p.push(q); }); try { localStorage.setItem('libreta:act', JSON.stringify(ACT)); } catch (e) {} }
        }
        state.destino = null; state.lnkPend = { id: t.lnkIn.id, k: t.lnkIn.k, subido: pk.subido };
        cargarRespaldo(Promise.resolve(pk.d), { name: 'link' }, 'pre');
      }).catch(function () { if (aviso) { busy(false); toast('No pude buscar datos nuevos. Probá de nuevo más tarde.'); } });
    }
    function pedirCodigo() { var t = prompt('Escribí el código de activación que te mandó el Dr. Mauro Torterolo'); if (t) activarCodigo(t); }
    function leerActivacion(texto) {
      var m = texto != null ? (/#act=([A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+)/.exec(texto) || /([A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{40,})/.exec(texto)) : /^#act=([A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+)$/.exec(location.hash || '');
      if (!m) { if (texto != null) toast('No encontré un link de activación en lo que pegaste.'); return Promise.resolve(false); }
      if (texto == null) { try { localStorage.setItem('libreta:ultLink', location.href); } catch (e) {} try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { location.hash = ''; } }
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
    /* iPhone: la app anclada al inicio no comparte datos con Safari; se ofrece copiar el link para pegarlo en la app anclada */
    function esIOS() { return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
    function esAnclada() { try { return !!navigator.standalone || matchMedia('(display-mode: standalone)').matches; } catch (e) { return false; } }
    function iosTipHTML() {
      var l = '', x = ''; try { l = localStorage.getItem('libreta:ultLink') || ''; x = localStorage.getItem('libreta:iostip') || ''; } catch (e) {}
      if (!l || x === '1' || !esIOS() || esAnclada()) return '';
      return '<style>.iostip{background:var(--surface);border:2px solid var(--gold);border-radius:14px;padding:12px 14px;margin:0 0 14px;font-size:15px;line-height:1.4}.iostip p{margin:4px 0}.iostip ol{margin:4px 0 10px;padding-left:22px}.iostip li{margin:2px 0}.iostipb{display:flex;gap:8px}.iostipb .btn{flex:1}</style><div class="iostip"><b>¿La vas a anclar al inicio del iPhone?</b><p>La app anclada no ve lo que abriste en Safari. Hacelo así:</p><ol><li>Tocá <b>Copiar link</b>.</li><li>En Safari: Compartir → <b>Agregar a inicio</b>.</li><li>Abrila desde el ícono y tocá <b>¿Te mandaron un link? Pegalo acá</b>.</li></ol>' +
        '<div class="iostipb"><button class="btn primary" data-a="ioscopy">Copiar link</button><button class="btn" data-a="iostipx">Listo</button></div></div>';
    }
    function iosCopiar() {
      var l = ''; try { l = localStorage.getItem('libreta:ultLink') || ''; } catch (e) {}
      if (!l) return;
      var manual = function () { prompt('Copiá el link (mantené apretado para seleccionarlo):', l); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(l).then(function () { toast('Link copiado. Ahora: Compartir → Agregar a inicio.'); }, manual); else manual();
    }
    function pegarActivacion() {
      var pedir = function (pre) { var t = prompt(esVet() ? 'Pegá acá el link del tambo' : 'Pegá acá el link que te mandó el Dr. Mauro Torterolo', pre || ''); if (t) { if (/#libreta=/.test(t)) leerLibreta(t); else if (/#cargar=/.test(t)) leerPrecarga(t); else leerActivacion(t); } };
      if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then(function (t) { if (/#libreta=/.test(t || '')) leerLibreta(t); else if (/#cargar=/.test(t || '')) leerPrecarga(t); else if (/#act=/.test(t || '')) leerActivacion(t); else pedir(''); }, function () { pedir(''); });
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
      if (externo(DB.origen)) { toast('Los tambos de ' + SRC() + ' son solo para el modo veterinario: no se activan para productores.'); return; }
      if (!DB.idProd || !DB.idProd.length) { toast('Cargá el respaldo de SysCaw de este tambo para generar la activación.'); return; }
      closeSheet();
      $('#sheetXTitle').textContent = '¿Para quién es la activación?';
      $('#xopts').innerHTML = '<p class="cap" style="margin:0 0 10px">' + esc(PERFIL.nombre || 'Este tambo') + '</p>';
      $('#xbtns').innerHTML = '<button class="btn primary big" data-a="actprod">Productor · app completa</button><button class="btn big" data-a="actop">Operario · solo buscar y ficha</button><button class="btn" data-a="xcancel">Cancelar</button>';
      $('#sheetX').hidden = false;
    }
    function enviarActivacionRol(rol) {
      if (externo(DB.origen)) { toast('Los tambos de ' + SRC() + ' son solo para el modo veterinario: no se activan para productores.'); return; }
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
      // servicios por preñez: como la concepción de los ciclos cerrados, solo servicios hechos al menos 28 días antes del
      // último tacto (si no, las que repiten se conocen antes que las preñadas y la cuenta se infla)
      var ultT = null; L.forEach(function (x) { x.h.ta.forEach(function (t) { if (t[0] <= ref && (!ultT || t[0] > ultT) && enSel(unidadEn(x, t[0]))) ultT = t[0]; }); });
      var finS = ultT ? A.addDays(ultT, -28) : null; if (finS && fin && finS > fin) finS = fin;
      var nServS = 0, nPrenS = 0;
      if (fin) L.forEach(function (x) {
        var h = x.h;
        h.pa.forEach(function (p, i) {
          if (!enSel(unidadEn(x, p[0]))) return;
          var c = concLac(h, i);
          var s1 = c.sv[0];
          if (s1 && s1[0] >= ini && s1[0] <= fin) ips.push(A.diffDays(s1[0], p[0]));
          // servicios por preñez: solo servicios con resultado conocido (igual que la concepción): el que preñó, o uno que
          // repitió (hubo otro servicio después o tacto vacía 25 días o más después). No cuentan los servicios todavía sin
          // resultado (servidas sin tacto) ni los hechos después de la concepción
          var vac = h.ta.filter(function (t) { return t[0] > p[0] && !esPren(t[1]); }).map(function (t) { return t[0]; });
          c.sv.forEach(function (e, j) {
            if (e[0] < ini || !finS || e[0] > finS) return;
            if (c.conc) { if (e[0] <= c.conc) nServS++; return; }
            var luego = c.sv[j + 1] || vac.some(function (d) { return d > e[0] && A.diffDays(d, e[0]) >= 25; });
            if (luego) nServS++;
          });
          if (c.conc && finS && c.conc >= ini && c.conc <= finS) nPrenS++;
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
        ips: av(ips), spp: nPrenS ? nServS / nPrenS : null, sppN: nServS, sppP: nPrenS, sppHasta: finS, ipp: av(ipp), pg: apt ? pre / apt * 100 : null, apt: apt, pre: pre,
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
    // u: una unidad del tambo (cada unidad con vacas es una fila aparte: mismo dueño, manejos distintos)
    function pobResumen(t, o, u) {
      var g = { DB: DB, act: TAMBOS.activo, ini21: state.ini21, pev: state.pev }, r = { id: t.id, nombre: (t.nombre || 'Sin nombre') + (u ? ' · ' + u.corto : ''), unidad: u ? u.id : null, origen: o && externo(o.origen) ? o.origen : 'syscaw' };
      if (!o || o.fuente !== 'syscaw' || !o.hist) { r.sin = true; return r; }
      var selAntes = o.sel;
      try {
        TAMBOS.activo = t.id; DB = o; DB.sel = u ? [u.id] : null; aplicarUnidad(); state.ini21 = null; state.pev = null;
        var ini = inicio21(), pev = pevActual(), ref = DB.fecha || today();
        var an = DB.animales.map(function (a) { return { h: DB.hist[a.rp], salida: null, desc: a.dFecha || (a.rech ? '0000' : null) }; })
          .concat((DB.bajas || []).map(function (b) { return { h: DB.hist[b.key], salida: b.bFecha, desc: b.dFecha || null }; }));
        var suma = function (C) { var T = { aptas: 0, serv: 0, pren: 0, sOk: 0, sMal: 0, n: 0 }; C.forEach(function (c) { if (!c.cerrado) return; T.n++; ['aptas', 'serv', 'pren', 'sOk', 'sMal'].forEach(function (k) { T[k] += c[k]; }); }); return T; };
        // temporada de servicios: 9 meses desde el inicio (ej. 1/5 a 31/1); lo de afuera no cuenta
        var finTemp = function (d) { var y = +d.slice(0, 4), m = +d.slice(5, 7) + 9; if (m > 12) { y++; m -= 12; } return A.addDays(y + '-' + (m < 10 ? '0' : '') + m + '-01', +d.slice(8, 10) - 2); };
        var finAct = finTemp(ini), C = ini <= ref ? A.ciclos21(an, esPren, ini, pev, finAct < ref ? finAct : ref) : [];
        r.ini = ini; r.ref = ref; r.T = suma(C);
        // primeros 3 ciclos de la temporada (concentran los partos de otoño): la tasa de servicio no necesita tacto,
        // alcanza con que el ciclo 3 haya terminado
        if (C.length >= 3 && C[2].fin <= ref) { r.T3 = { aptas: 0, serv: 0 }; C.slice(0, 3).forEach(function (c) { r.T3.aptas += c.aptas; r.T3.serv += c.serv; }); }
        var iniAnt = (+ini.slice(0, 4) - 1) + ini.slice(4), finAnt = finTemp(iniAnt);
        if (finAnt >= ini) finAnt = A.addDays(ini, -1);
        r.iniAnt = iniAnt; r.finAnt = finAnt;
        if (iniAnt >= (DB.desdeHist != null ? DB.desdeHist : A.addDays(ref, -730))) r.TA = suma(A.ciclos21(an, esPren, iniAnt, pev, finAnt));
        r.vacas = DB.animales.filter(function (a) { return !a.cat || a.cat === 'vaca' || a.cat === 'seca'; }).length;
        var D = infDatos('12'); r.ips = D.ips; r.ipp = D.ipp; r.spp = D.spp; r.pg = D.pg; r.vo = D.avo; r.vs = D.avs;
        r.mk = D.M.map(function (m) { return m.key; }); r.pv = D.pv; r.pq = D.pq; r.best = D.best;
        // leche: último control y promedio de los últimos 12 meses (litros por vaca en ordeñe)
        var porF = rondasCtrl((DB.ctrls || []).filter(function (c) { return !DB.sel || !DB.sel.length || DB.sel.indexOf(c[1]) >= 0; }));
        var fs = Object.keys(porF).filter(function (f) { return porF[f].v > 0; }).sort();
        if (fs.length) {
          var u = porF[fs[fs.length - 1]]; r.lFecha = fs[fs.length - 1]; r.lv = u.l / u.v; r.del = u.nd ? u.d / u.nd : null;
          var d12 = A.addDays(r.lFecha, -365), l12 = fs.filter(function (f) { return f > d12; }).map(function (f) { return porF[f].l / porF[f].v; });
          r.lv12 = l12.reduce(function (s, x) { return s + x; }, 0) / l12.length;
        }
      } catch (e) { r.error = String(e && e.message || e); }
      finally { o.sel = selAntes; DB = g.DB; TAMBOS.activo = g.act; state.ini21 = g.ini21; state.pev = g.pev; }
      return r;
    }
    // unidades del tambo con al menos 20 vacas (en ordeñe y secas): cada una va como fila propia en la población.
    // Las unidades sin vacas (recría, campo) no tienen fila; un tambo de una sola unidad sigue siendo una fila.
    function pobUnidades(t, o) {
      if (!o || !o.unidades || o.unidades.length < 2 || !o.todos) return null;
      var n = {}; o.todos.forEach(function (a) { if (a.cat === 'vaca' || a.cat === 'seca') n[a.u] = (n[a.u] || 0) + 1; });
      var us = o.unidades.filter(function (u) { return (n[u.id] || 0) >= 20; });
      if (us.length < 2) return null;
      var base = (t.nombre || '').toLowerCase();
      return us.map(function (u) {
        var nm = String(u.nombre || ('Unidad ' + u.id)), c = nm;
        // "El Teson (MFajardo) T1" en el tambo "El Teson (MFajardo)" → "T1"
        if (base && nm.toLowerCase().indexOf(base) === 0 && nm.length > base.length) c = nm.slice(base.length).replace(/^[\s\-·,:]+/, '');
        return { id: u.id, corto: c || nm };
      });
    }
    function pobCalc() {
      POB = { cargando: true }; render();
      var L = TAMBOS.lista.slice(), F = [], i = 0;
      var paso = function () {
        if (i >= L.length) {
          POB = { filas: F, hecho: Date.now() }; render(); return;
        }
        var t = L[i++]; POB.prog = i + ' de ' + L.length + ': ' + (t.nombre || ''); render();
        leerDB(t.id).then(function (o) {
          var us = pobUnidades(t, o);
          if (us) us.forEach(function (u) { F.push(pobResumen(t, o, u)); }); else F.push(pobResumen(t, o));
          setTimeout(paso, 30);
        }, function () { setTimeout(paso, 30); });
      };
      setTimeout(paso, 30);
    }
    function abrirPoblacion() {
      if (!esVet()) return;
      closeSheet(); state.pobIni = !!state.inicio; state.inicio = false; state.pobl = true; state.informe = false; pobCalc(); window.scrollTo(0, 0);
    }
    /* ===== indicadores de la población: ranking por indicador e informe general con rangos ===== */
    // cada indicador: valor de una fila (tambo o unidad), si más alto es mejor, unidad y decimales.
    // mín: lo que hace falta para que la fila entre (evita porcentajes con pocos datos)
    var POB_IND = [
      { k: 'serv', sinToro: true, g: 'Reproducción', t: 'Tasa de servicio', u: '%', alto: true, d: 0, val: function (f) { return f.T && f.T.aptas >= 30 ? f.T.serv / f.T.aptas * 100 : null; }, nota: 'Aptas servidas / aptas, ciclos de 21 días cerrados de la temporada actual.' },
      { k: 'serv3', sinToro: true, g: 'Reproducción', t: 'Tasa de servicio, primeros 3 ciclos', u: '%', alto: true, d: 0, val: function (f) { return f.T3 && f.T3.aptas >= 30 ? f.T3.serv / f.T3.aptas * 100 : null; }, nota: 'Aptas servidas / aptas en los 3 primeros ciclos de 21 días de la temporada, los que concentran los partos de otoño.' },
      { k: 'conc', sinToro: true, g: 'Reproducción', t: 'Tasa de concepción', u: '%', alto: true, d: 0, val: function (f) { return f.T && f.T.sOk + f.T.sMal >= 20 ? f.T.sOk / (f.T.sOk + f.T.sMal) * 100 : null; }, nota: 'Servicios que preñaron / servicios con resultado, ciclos cerrados.' },
      { k: 'pren', sinToro: true, g: 'Reproducción', t: 'Tasa de preñez (21 días)', u: '%', alto: true, d: 0, val: function (f) { return f.T && f.T.aptas >= 30 ? f.T.pren / f.T.aptas * 100 : null; }, nota: 'Aptas que se preñan en el ciclo / aptas, ciclos cerrados.' },
      { k: 'prenA', sinToro: true, g: 'Reproducción', t: 'Tasa de preñez temporada anterior', u: '%', alto: true, d: 0, val: function (f) { return f.TA && f.TA.aptas >= 30 ? f.TA.pren / f.TA.aptas * 100 : null; }, nota: 'La misma cuenta en la temporada del año pasado.' },
      { k: 'pg', g: 'Reproducción', t: '% preñez general', u: '%', alto: true, d: 0, val: function (f) { return f.pg; }, nota: 'Vacas preñadas en la temporada / vacas aptas al inicio (como el informe anual).' },
      { k: 'ips', sinToro: true, g: 'Reproducción', t: 'Intervalo parto – 1er servicio', u: 'días', alto: false, d: 0, val: function (f) { return f.ips; }, nota: 'Días promedio, temporada actual.' },
      { k: 'ipp', g: 'Reproducción', t: 'Intervalo parto – preñez', u: 'días', alto: false, d: 0, val: function (f) { return f.ipp; }, nota: 'Días promedio, temporada actual.' },
      { k: 'spp', sinToro: true, g: 'Reproducción', t: 'Servicios por preñez', u: '', alto: false, d: 1, val: function (f) { return f.spp; }, nota: 'Servicios de la temporada / preñeces de la temporada. Sube si falta tactar.' },
      { k: 'lv', g: 'Leche', t: 'Litros por vaca, último control', u: 'L', alto: true, d: 1, val: function (f) { return f.lv; }, nota: 'Litros por vaca en ordeñe en el último control (ronda de todas las unidades).' },
      { k: 'lv12', g: 'Leche', t: 'Litros por vaca, últimos 12 meses', u: 'L', alto: true, d: 1, val: function (f) { return f.lv12; }, nota: 'Promedio de los controles de los últimos 12 meses.' },
      { k: 'po', g: 'Rodeo', t: '% de vacas en ordeñe', u: '%', alto: true, d: 0, val: function (f) { return f.vo != null && f.vo + f.vs ? f.vo / (f.vo + f.vs) * 100 : null; }, nota: 'Vacas en ordeñe / (en ordeñe + secas), promedio de los últimos 12 meses.' },
      { k: 'vacas', g: 'Rodeo', t: 'Vacas (en ordeñe y secas)', u: '', alto: true, d: 0, neutro: true, val: function (f) { return f.vacas || null; }, nota: 'Tamaño del rodeo de vacas a la fecha del respaldo.' }
    ];
    // tambos o unidades con toro suelto en el rodeo (los marca el veterinario): sus servicios no están todos anotados,
    // así que no entran en los indicadores que dependen de los servicios (sinToro)
    function pobKey(f) { return f.id + (f.unidad != null ? '|' + f.unidad : ''); }
    function pobToro() { try { return JSON.parse(localStorage.getItem('libreta:pobtoro') || '{}') || {}; } catch (e) { return {}; } }
    function pobToroSet(k, on) { var T = pobToro(); if (on) T[k] = 1; else delete T[k]; try { localStorage.setItem('libreta:pobtoro', JSON.stringify(T)); } catch (e) {} }
    // percentil con interpolación (p entre 0 y 1) de una lista ordenada
    function pctl(o, p) { if (!o.length) return null; var i = (o.length - 1) * p, a = Math.floor(i), b = Math.ceil(i); return o[a] + (o[b] - o[a]) * (i - a); }
    function pobStats(F, ind) {
      var TT = ind.sinToro ? pobToro() : {}, fuera = [];
      var L = F.map(function (f) { return { f: f, x: ind.val(f) }; }).filter(function (z) { if (z.x == null || isNaN(z.x)) return false; if (TT[pobKey(z.f)]) { fuera.push(z); return false; } return true; });
      var o = L.map(function (z) { return z.x; }).sort(function (a, b) { return a - b; });
      var q1 = pctl(o, .25), q3 = pctl(o, .75), iq = q3 - q1;
      // valor atípico (regla de Tukey): más de 1,5 veces el rango intercuartil por fuera del 25%–75%; se avisa, no se saca
      if (o.length >= 8 && iq > 0) L.forEach(function (z) { z.atip = z.x < q1 - 1.5 * iq || z.x > q3 + 1.5 * iq; });
      return { L: L.sort(function (a, b) { return ind.alto ? b.x - a.x : a.x - b.x; }), fuera: fuera, n: o.length, prom: o.length ? o.reduce(function (s, x) { return s + x; }, 0) / o.length : null, min: o[0], max: o[o.length - 1], p25: q1, med: pctl(o, .5), p75: q3 };
    }
    // sin la unidad (va en el nombre del indicador), para la tabla compacta del informe general
    function pobNum(x, ind) { return x == null || isNaN(x) ? '–' : nf(x, ind.d, ind.d); }
    function pobTit(ind) { return ind.t + (ind.u ? ' (' + ind.u + ')' : ''); }
    function pobFmt(x, ind) { return x == null || isNaN(x) ? '–' : nf(x, ind.d, ind.d) + (ind.u === '%' ? '%' : ind.u ? ' ' + ind.u : ''); }
    function pobToroHTML(F) {
      var T = pobToro(), n = F.filter(function (f) { return T[pobKey(f)]; }).length;
      return '<details class="nota"' + (state.pobToroAb ? ' open' : '') + '><summary>Tambos con toro en el rodeo' + (n ? ' (' + n + ')' : '') + '</summary>' +
        '<p class="cap">Marcá los que tienen toro suelto: no entran en tasa de servicio (de la temporada y de los primeros 3 ciclos), concepción, tasa de preñez (esta temporada y la anterior), servicios por preñez ni intervalo parto–1er servicio, porque los servicios del toro no se anotan. Sí entran en intervalo parto–preñez, % preñez general, leche y rodeo.</p>' +
        F.slice().sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); }).map(function (f) { var k = pobKey(f); return '<label class="uopt"><input type="checkbox" class="pobToro" data-toro="' + esc(k) + '"' + (T[k] ? ' checked' : '') + '><b>' + esc(f.nombre) + '</b></label>'; }).join('') + '</details>';
    }
    // ranking: modo 'anon' (sin nombres), 'nombres' (todos) o el id de un tambo (solo se ve ese nombre)
    function pobRankHTML(F) {
      var modo = state.pobModo || 'anon', tambos = {}; F.forEach(function (f) { if (!tambos[f.id]) tambos[f.id] = (f.nombre || '').split(' · ')[0]; });
      var sel = modo !== 'anon' && modo !== 'nombres' ? modo : null;
      var ctrl = '<section class="card noprint"><h2>Ranking por indicador</h2><label class="secfecha">Mostrar <select id="pobSel"><option value="anon"' + (modo === 'anon' ? ' selected' : '') + '>Sin nombres (anónimo)</option><option value="nombres"' + (modo === 'nombres' ? ' selected' : '') + '>Con todos los nombres</option>' +
        Object.keys(tambos).sort(function (a, b) { return tambos[a].localeCompare(tambos[b], 'es'); }).map(function (id) { return '<option value="' + esc(id) + '"' + (sel === id ? ' selected' : '') + '>Solo ' + esc(tambos[id]) + '</option>'; }).join('') + '</select></label>' +
        '<p class="cap">Con "Solo …" se ve únicamente el nombre de ese tambo (y sus unidades); el resto queda como barras sin nombre. El 1° es el mejor en cada indicador.</p>' + pobToroHTML(F) + '</section>';
      var nom = function (f) { return modo === 'nombres' || (sel && String(f.id) === String(sel)) ? esc(f.nombre) : ''; };
      var res = '';
      if (sel) {
        var mios = F.filter(function (f) { return String(f.id) === String(sel); });
        res = '<section class="card rkres"><h2>' + esc(tambos[sel]) + ' en la población</h2><div class="tblwrap"><table class="tbl"><thead><tr><th>Indicador</th>' + mios.map(function (f) { return '<th>' + esc(f.nombre.split(' · ')[1] || 'Valor') + '</th>'; }).join('') + '<th>Población</th></tr></thead><tbody>' +
          POB_IND.filter(function (i) { return !i.neutro; }).map(function (ind) {
            var S = pobStats(F, ind);
            return '<tr><td>' + esc(ind.t) + '</td>' + mios.map(function (f) { var k = -1; S.L.forEach(function (z, j) { if (z.f === f) k = j; }); var fu = S.fuera.filter(function (z) { return z.f === f; })[0]; return '<td>' + (k < 0 ? (fu ? pobFmt(fu.x, ind) + '<small>con toro, no entra</small>' : '–') : '<b>' + pobFmt(S.L[k].x, ind) + (S.L[k].atip ? ' ⚠' : '') + '</b><small>' + (k + 1) + '° de ' + S.n + '</small>') + '</td>'; }).join('') + '<td>' + pobFmt(S.prom, ind) + '</td></tr>';
          }).join('') + '</tbody></table></div><p class="cap">Puesto entre los tambos o unidades con dato en cada indicador (1° = el mejor).</p></section>';
      }
      var cards = POB_IND.map(function (ind) {
        var S = pobStats(F, ind); if (!S.n) return '';
        var max = S.max > 0 ? S.max : 1, pos = function (x) { return Math.max(0, Math.min(100, x / max * 100)); };
        return '<section class="card rkcard"><h3>' + esc(ind.t) + '</h3><p class="cap">' + esc(ind.nota) + (ind.neutro ? '' : ' ' + (ind.alto ? 'Más alto es mejor.' : 'Más bajo es mejor.')) + '</p><div class="rk">' +
          S.L.map(function (z, j) {
            var mio = sel && String(z.f.id) === String(sel), n = nom(z.f);
            return '<div class="rkr' + (mio ? ' mio' : '') + '"><span class="rkp">' + (j + 1) + '°</span><span class="rkn">' + n + '</span><span class="rkb"><i style="width:' + pos(z.x).toFixed(1) + '%"></i><em style="left:' + pos(S.prom).toFixed(1) + '%"></em></span><span class="rkv">' + (z.atip ? '<span class="rkat" title="Valor atípico">⚠</span>' : '') + pobFmt(z.x, ind) + '</span></div>';
          }).join('') + '</div><p class="cap rkpie"><span class="rkleg"></span> Promedio de la población: <b>' + pobFmt(S.prom, ind) + '</b> · ' + S.n + ' tambos o unidades con dato' +
          (S.fuera.length ? ' · no entran ' + S.fuera.length + ' con toro en el rodeo' + (function () { var vis = S.fuera.filter(function (z) { return nom(z.f); }); return vis.length ? ' (' + vis.map(function (z) { return nom(z.f) + ': ' + pobFmt(z.x, ind); }).join(', ') + ')' : ''; })() : '') +
          (S.L.some(function (z) { return z.atip; }) ? '<br>⚠ Valor atípico: muy alejado del resto (más de 1,5 veces el rango del 25%–75% por fuera de ese rango). Conviene revisar si es real o un problema de registro.' : '') + '</p></section>';
      }).join('');
      return ctrl + '<section class="card rkhead"><h2>Población de tambos · ranking por indicador</h2><p class="cap">' + F.length + ' tambos o unidades · ' + (sel ? 'se muestra solo ' + esc(tambos[sel]) : modo === 'nombres' ? 'con nombres' : 'anónimo') + ' · ' + A.fmt(today()) + '</p></section>' + res + cards + '<p class="ifirma">Dr. Mauro Torterolo</p>';
    }
    // informe general: cada indicador con promedio y rangos de la población, sin nombres
    function pobGenHTML(F) {
      var grupos = [];
      POB_IND.forEach(function (ind) { if (grupos.indexOf(ind.g) < 0) grupos.push(ind.g); });
      var vac = F.reduce(function (s, f) { return s + (f.vacas || 0); }, 0), ids = {}; F.forEach(function (f) { ids[f.id] = 1; });
      return '<section class="card rkhead"><h2>Indicadores de la población</h2><p class="cap">' + Object.keys(ids).length + ' tambos (' + F.length + ' tambos o unidades) · ' + nf(vac) + ' vacas · ' + A.fmt(today()) + '</p></section>' +
        grupos.map(function (g) {
          return '<section class="card genc"><h3>' + esc(g) + '</h3><div class="tblwrap"><table class="tbl gentbl"><thead><tr><th>Indicador</th><th>Prom.</th><th>Med.</th><th>25% mejor</th><th>25% peor</th><th>Rango</th></tr></thead><tbody>' +
            POB_IND.filter(function (i) { return i.g === g; }).map(function (ind) {
              var S = pobStats(F, ind); if (!S.n) return '<tr><td>' + esc(pobTit(ind)) + '</td><td colspan="5">Sin datos</td></tr>';
              var mej = ind.alto ? S.p75 : S.p25, peo = ind.alto ? S.p25 : S.p75;
              var nat = S.L.filter(function (z) { return z.atip; }).length;
              return '<tr><td>' + esc(pobTit(ind)) + '<small>' + S.n + ' con dato' + (S.fuera.length ? ' · ' + S.fuera.length + ' con toro no entra' + (S.fuera.length === 1 ? '' : 'n') : '') + (nat ? ' · ⚠ ' + nat + ' atípico' + (nat === 1 ? '' : 's') : '') + '</small></td><td><b>' + pobNum(S.prom, ind) + '</b></td><td>' + pobNum(S.med, ind) + '</td><td>' + (ind.neutro ? '–' : pobNum(mej, ind)) + '</td><td>' + (ind.neutro ? '–' : pobNum(peo, ind)) + '</td><td class="nw">' + pobNum(S.min, ind) + '–' + pobNum(S.max, ind) + '</td></tr>';
            }).join('') + '</tbody></table></div>' +
            POB_IND.filter(function (i) { return i.g === g; }).map(function (ind) {
              var S = pobStats(F, ind); if (!S.n || S.max === S.min) return '';
              // franja: rango completo, caja del 25% al 75%, raya en la mediana y punto en el promedio
              var a = S.min, b = S.max, w = function (x) { return ((x - a) / (b - a) * 100).toFixed(1); };
              return '<div class="genr"><span class="genl">' + esc(ind.t) + '</span><span class="genb"><i class="r"></i><i class="q" style="left:' + w(S.p25) + '%;width:' + (w(S.p75) - w(S.p25)).toFixed(1) + '%"></i><i class="m" style="left:' + w(S.med) + '%"></i><i class="p" style="left:' + w(S.prom) + '%"></i></span><span class="genx">' + pobNum(a, ind) + '–' + pobNum(b, ind) + (ind.u ? ' ' + ind.u : '') + '</span></div>';
            }).join('') + '</section>';
        }).join('') +
        '<p class="cap">Prom.: promedio simple de los tambos o unidades (cada uno pesa igual). Med.: mediana (la mitad está por encima y la mitad por debajo). 25% mejor: el valor a partir del cual está el cuarto de mejores resultados; 25% peor: el límite del cuarto de peores. Debajo de cada indicador, cuántos tambos o unidades tienen dato, cuántos no entran por tener toro en el rodeo (marcados por el veterinario) y cuántos tienen un valor atípico (muy alejado del resto; se cuentan igual, pero conviene revisarlos). En las barras, la franja oscura va del 25% al 75% de los tambos, la raya es la mediana y el punto el promedio. Los tambos con varias unidades cuentan cada unidad con vacas por separado. Tasas de 21 días: solo filas con 30 aptas o más (concepción: 20 servicios con resultado).</p><p class="ifirma">Dr. Mauro Torterolo</p>';
    }
    function pdfPob() {
      var t = document.title; document.title = (state.pobVista === 'gen' ? 'Indicadores de la poblacion ' : 'Ranking de la poblacion ') + today();
      setTimeout(function () { window.print(); setTimeout(function () { document.title = t; }, 500); }, 50);
    }
    function pobHTML() {
      var vista = state.pobVista || 'tabla';
      var bar = '<div class="infbar"><button class="btn" data-a="pobcerrar">Volver</button><div class="filters">' + [['tabla', 'Tablas'], ['rank', 'Ranking'], ['gen', 'Indicadores']].map(function (c) { return '<button class="fchip" data-a="pobvista" data-pv="' + c[0] + '" aria-pressed="' + (vista === c[0]) + '">' + c[1] + '</button>'; }).join('') + '</div>' +
        (vista === 'tabla' ? '<button class="btn" data-a="pobcalc">Recalcular</button>' : '<button class="btn primary" data-a="pobpdf">PDF</button>') + '</div>';
      if (!POB || POB.cargando) return bar + '<section class="card"><h2>Población de tambos</h2><p class="hint">Calculando… ' + esc(POB && POB.prog || '') + '</p></section>';
      var F = POB.filas.filter(function (f) { return !f.sin && !f.error; }), sin = POB.filas.filter(function (f) { return f.sin || f.error; });
      if (vista === 'rank') return '<div class="pob">' + bar + pobRankHTML(F) + '</div>';
      if (vista === 'gen') return '<div class="pob">' + bar + pobGenHTML(F) + '</div>';
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
        '<p class="cap">Promedio de la población: ' + F.length + ' ' + (F.some(function (f) { return f.unidad != null; }) ? 'tambos o unidades' : 'tambos') + ', ' + nf(vac) + ' vacas, ciclos de 21 días cerrados. Tocá un título para ordenar.</p>' +
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
        '<section class="card"><h2>Población de tambos</h2><p>' + (function () { var ids = {}; F.forEach(function (f) { ids[f.id] = 1; }); var nt = Object.keys(ids).length, nu = F.filter(function (f) { return f.unidad != null; }).length; return nt + ' tambos en este equipo' + (nu ? ' (' + F.length + ' filas: ' + (function () { var g = {}; F.forEach(function (f) { if (f.unidad != null) g[f.id] = (g[f.id] || 0) + 1; }); return Object.keys(g).length; })() + ' con varias unidades van una fila por unidad)' : '') + ': '; })() + (function () { var ids2 = {}, Fu = F.filter(function (f) { if (ids2[f.id]) return false; ids2[f.id] = 1; return true; }); var nf2 = Fu.filter(function (f) { return f.origen === 'fosapp'; }).length, nm = Fu.filter(function (f) { return f.origen === 'sigea'; }).length, nd = Fu.filter(function (f) { return f.origen === 'dhm'; }).length, ndp = Fu.filter(function (f) { return f.origen === 'delpro'; }).length, ns = Fu.length - nf2 - nm - nd - ndp; var p = [ns ? ns + ' con respaldo de SysCaw' : '', nf2 ? nf2 + ' con base de FOSAPP' : '', nm ? nm + ' con base de SIGEA' : '', nd ? nd + ' con base de DHM' : '', ndp ? ndp + ' con base de DelPro' : ''].filter(Boolean); return p.length > 1 ? p.slice(0, -1).join(', ') + ' y ' + p[p.length - 1] : p.join(''); })() + (sin.length ? ' · sin respaldo: ' + sin.map(function (f) { return esc(f.nombre); }).join(', ') : '') + '.</p>' +
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
        // marcas de la población (tambos con toro en el rodeo)
        obj.toro = pobToro();
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
        // las marcas de "toro en el rodeo" se suman a las que ya hay en este equipo
        if (o.toro) Object.keys(o.toro).forEach(function (k) { pobToroSet(k, true); });
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
    // listado de parches: servidas entre smin y smax días sin diagnóstico, paridas hace más de psv días sin servicio y vacías al tacto
    function xMotivosParches(a, f, hoy) {
      var m = [], cat = a.cat || 'vaca';
      if (!((cat === 'vaca' && f.ord) || (cat === 'seca' && f.sec) || (cat === 'vaquillona' && f.vaq))) return m;
      if (f.sinDesc && a.rech) return m;
      if (a.estado === 'prenada') return m;
      var serv = a.sFecha && !/^celo/i.test(a.toro || '');
      if ((f.smin > 0 || f.smax > 0) && serv && (!a.tFecha || a.tFecha < a.sFecha)) {
        var d = A.diffDays(hoy, a.sFecha);
        if ((!(f.smin > 0) || d >= f.smin) && (!(f.smax > 0) || d <= f.smax)) m.push('Servida hace ' + d + ' días' + (a.sN ? ' (' + a.sN + '° servicio)' : ''));
      }
      if (f.psv > 0 && a.pFecha && (!a.sFecha || a.sFecha <= a.pFecha)) { var p = A.diffDays(hoy, a.pFecha); if (p >= f.psv) m.push('Parida hace ' + p + ' días sin servicio'); }
      if (f.vac && (a.estado === 'vacia' || a.estado === 'ciclando' || a.estado === 'apta')) m.push('Vacía al tacto' + (a.tFecha ? ' del ' + A.fmt(a.tFecha).slice(0, 5) : '') + (a.result && !/^vac/i.test(a.result) ? ' (' + a.result + ')' : ''));
      return m;
    }
    function xMotivos(a, f, hoy, secar) {
      if (state.xmode === 'parches') return xMotivosParches(a, f, hoy);
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
      if (f.secar && state.xmode !== 'parches') listaSecado(fechaSecado()).forEach(function (x) { secar[x.a.rp] = x; });
      var out = [];
      DB.animales.forEach(function (a) { var m = xMotivos(a, f, hoy, secar); if (m.length) out.push({ a: a, m: m }); });
      return out;
    }
    function xOpts() {
      var f = state.xf, n = xFiltradas().length;
      var chk = function (k, t) { return '<button class="fchip" data-xk="' + k + '" aria-pressed="' + !!f[k] + '">' + t + '</button>'; };
      var num = function (k, a, b) { return '<label class="xnum">' + a + ' <input type="number" inputmode="numeric" min="1" max="999" data-xn="' + k + '" value="' + (f[k] || '') + '" placeholder="–"> ' + b + '</label>'; };
      var inp = function (k) { return '<input type="number" inputmode="numeric" min="1" max="999" data-xn="' + k + '" value="' + (f[k] || '') + '" placeholder="–">'; };
      if (state.xmode === 'parches') {
        $('#xopts').innerHTML = '<p class="xlbl">Categoría</p><div class="filters">' + chk('ord', 'Vacas en ordeñe') + chk('sec', 'Secas') + chk('vaq', 'Vaquillonas') + '</div>' +
          '<div class="filters" style="margin-top:8px">' + chk('sinDesc', 'Excluir descartes') + '</div>' +
          '<p class="xlbl">Incluir (lo que quede vacío no se toma)</p>' +
          '<label class="xnum">Servidas entre ' + inp('smin') + ' y ' + inp('smax') + ' días</label>' +
          num('psv', 'Paridas con más de', 'días sin servicio') +
          '<div class="filters" style="margin-top:8px">' + chk('vac', 'Vacías al tacto') + '</div>' +
          '<p class="cap">Servidas: sin tacto después del servicio. Nunca entran las preñadas.</p>' +
          '<p class="xcount"><b>' + n + '</b> ' + (n === 1 ? 'animal' : 'animales') + '</p>';
        $('#btnXok').disabled = !n; return;
      }
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
    function abrirExport(modo) {
      state.xmode = modo === 'parches' ? 'parches' : 'lista';
      var g = null; try { g = JSON.parse(localStorage.getItem(state.xmode === 'parches' ? 'libreta:xfp' : 'libreta:xf')); } catch (e) {}
      state.xf = g || (state.xmode === 'parches' ? { ord: true, sec: false, vaq: true, sinDesc: true, smin: 18, smax: 24, psv: 45, vac: true }
        : { ord: true, sec: false, vaq: true, sinDesc: true, sdx: A.DX_MIN, psv: null, celo: false, secar: false });
      $('#sheetXTitle').textContent = state.xmode === 'parches' ? 'Listado de parches' : 'Lista para revisación';
      $('#xbtns').innerHTML = '<button class="btn primary big" id="btnXok" data-a="xok">Ver lista y exportar</button><button class="btn" data-a="xcancel">Cancelar</button>';
      xOpts(); $('#sheetX').hidden = false;
    }
    function exportarTactar() {
      var parches = state.xmode === 'parches', etq = parches ? 'Parches' : 'Lista';
      try { localStorage.setItem(parches ? 'libreta:xfp' : 'libreta:xf', JSON.stringify(state.xf)); } catch (e) {}
      var L = xFiltradas().sort(function (x, y) { return numRp(x.a, y.a); }), ref = today();
      var fila = function (x) {
        var a = x.a, h = DB.hist ? DB.hist[a.rp] : null, ins = null, serv = a.sFecha && !/^celo/i.test(a.toro || '');
        if (h) h.ev.forEach(function (e) { if (e[1] === 'S' && e[0] === a.sFecha) ins = e[3] || null; });
        return [a.rp, a.nombre || '', a.cat === 'vaquillona' ? 'Vaquillona' : a.cat === 'seca' ? 'Seca' : 'En ordeñe', a.rod || '', x.m.join(' · '), a.pN || '', a.pFecha ? A.fmt(a.pFecha) : '',
          a.pFecha ? A.diffDays(ref, a.pFecha) : '', a.sFecha ? A.fmt(a.sFecha) : '', a.sFecha ? A.diffDays(ref, a.sFecha) : '', a.sN || '', serv ? (a.toro || '') : (a.sFecha ? 'Celo' : ''), ins || '',
          a.tFecha ? A.fmt(a.tFecha) : '', a.result || '', a.rech ? (a.rechDet || a.rech) : '', typeof (a.pr || [])[0] === 'number' ? a.pr[0] : ''];
      };
      var head = ['Caravana', 'Nombre', 'Categoría', 'Rodeo', 'Motivo', 'Lactancia', 'Último parto', 'Días en leche', 'Último servicio', 'Días desde servicio', 'Nº servicio', 'Toro', 'Inseminador', 'Último tacto', 'Resultado', 'Descarte', 'Litros último control'];
      var tit = 'Lista · ' + (PERFIL.nombre || 'Tambo') + ' · ' + A.fmt(ref), ws;
      if (parches) {
        // parches: solo caravana (de menor a mayor) y fecha del último servicio de la lactancia; encabezado en la fila 1
        head = ['Caravana', 'Fecha último servicio'];
        fila = function (x) { var a = x.a; return [/^\d+$/.test(a.rp) ? +a.rp : a.rp, a.sFecha && (!a.pFecha || a.sFecha > a.pFecha) ? A.fmt(a.sFecha) : '']; };
        ws = root.XLSX.utils.aoa_to_sheet([head].concat(L.map(fila)));
        ws['!cols'] = [{ wch: 12 }, { wch: 22 }];
      } else {
        ws = root.XLSX.utils.aoa_to_sheet([[tit], [], head].concat(L.map(fila)));
        ws['!cols'] = head.map(function (h, i) { return { wch: i === 4 ? 34 : i === 1 ? 18 : Math.max(9, h.length + 2) }; });
      }
      var wb = root.XLSX.utils.book_new(); root.XLSX.utils.book_append_sheet(wb, ws, etq);
      var nombre = (etq + ' ' + (PERFIL.nombre || '') + ' ' + ref).replace(/[\\/:*?"<>|]+/g, '').trim() + '.xlsx';
      var buf = root.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      var file = null; try { file = new File([buf], nombre, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }); } catch (e) {}
      // CSV separado por comas (como lo lee Excel en el celular) para los teléfonos que no dejan compartir .xlsx
      var csv = '\ufeff' + [head].concat(L.map(fila)).map(function (r) { return r.map(function (v) { v = v == null ? '' : String(v); return /[,;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); }).join('\r\n');
      var fcsv = null; try { fcsv = new File([csv], nombre.replace(/\.xlsx$/, '.csv'), { type: 'text/csv' }); } catch (e) {}
      state.xout = { wb: wb, file: file, csv: fcsv, nombre: nombre };
      // la lista queda a la vista y después se elige compartir o guardar
      var puedeComp = !!(navigator.share && (file || fcsv));
      $('#sheetXTitle').textContent = (parches ? 'Parches' : 'Lista') + ' · ' + L.length + (L.length === 1 ? ' animal' : ' animales');
      $('#xopts').innerHTML = '<div class="xprev">' + L.map(function (x) { return '<div><b>' + esc(x.a.rp) + '</b><span>' + esc(x.m.join(' · ')) + '</span></div>'; }).join('') + '</div>' +
        '<p class="cap">Archivo: ' + esc(nombre) + '</p>';
      $('#xbtns').innerHTML = (puedeComp ? '<button class="btn primary big" data-a="xshare">Compartir Excel (WhatsApp, mail…)</button><button class="btn" data-a="xsharecsv">Compartir como CSV (se abre con Excel)</button>' : '') +
        '<button class="btn' + (puedeComp ? '' : ' primary big') + '" data-a="xsave">Guardar Excel en el teléfono</button><button class="btn" data-a="xcancel">Cerrar</button>';
    }
    function xCompartir() {
      var o = state.xout; if (!o) return;
      var falla = function () { if (o.blob) bajarBlob(o.blob, o.nombre); else root.XLSX.writeFile(o.wb, o.nombre); toast('Este teléfono no deja compartir Excel: quedó guardado en Descargas. Podés mandarlo desde ahí o usar "Compartir como CSV".'); };
      if (!o.file || !(navigator.canShare && navigator.canShare({ files: [o.file] }))) { falla(); return; }
      navigator.share({ files: [o.file], title: o.nombre }).catch(function (e) { if (!e || e.name !== 'AbortError') falla(); });
    }
    function xCompartirCSV() {
      var o = state.xout; if (!o || !o.csv) return;
      if (navigator.canShare && navigator.canShare({ files: [o.csv] })) navigator.share({ files: [o.csv], title: o.csv.name }).catch(function (e) { if (!e || e.name !== 'AbortError') toast('No se pudo compartir. Usá "Guardar Excel en el teléfono".'); });
      else toast('Este teléfono no deja compartir archivos. Usá "Guardar Excel en el teléfono".');
    }
    function bajarBlob(blob, nombre) { var u = URL.createObjectURL(blob), l = document.createElement('a'); l.href = u; l.download = nombre; document.body.appendChild(l); l.click(); setTimeout(function () { URL.revokeObjectURL(u); l.remove(); }, 4000); }
    function xGuardar() { var o = state.xout; if (!o) return; if (o.blob) bajarBlob(o.blob, o.nombre); else root.XLSX.writeFile(o.wb, o.nombre); toast('Guardado en Descargas: ' + o.nombre); }
    /* ----- planilla de tacto (modo veterinario): las vacas en ordeñe por caravana, en tres columnas para imprimir y anotar en el corral.
       Preñada: fecha probable de parto · servida: PARCHE (menos de 35 días) o REVISAR (35 o más) con los días de servida ·
       con tacto sin preñez y sin servicio después: el resultado con los días de parida · sin servicio ni tacto: PARIDA con los días de parida ·
       descarte programado: DESCARTE. Se arma un .xlsx a mano (con formato: caravana en negrita, anchos, saltos de página). ----- */
    var PLT_FILAS = 45, PLT_LTS = 14, PLT_PARIDA = 30;
    // preñada con celo o servicio después del tacto que la dio preñada: alerta (en las dos planillas)
    function prenConEvento(a) {
      if (a.estado !== 'prenada' || !a.tFecha) return null;
      var h = DB.hist ? DB.hist[a.rp] : null, ult = null; if (!h) return null;
      h.ev.forEach(function (e) { if (e[0] > a.tFecha && (e[1] === 'S' || e[1] === 'C')) ult = e; });
      return ult;
    }
    /* devuelve [texto, número, alerta] o null si la vaca no va (planilla simple: sin preñadas, descartes ni paridas de menos de 30 días;
       de las preñadas solo las que tienen celo o servicio después del tacto y las que hay que secar, por fecha o con menos de 14 litros) */
    function planillaFila(a, ref, simple, secar) {
      var dl = a.pFecha ? A.diffDays(ref, a.pFecha) : '';
      var ev = prenConEvento(a);
      if (ev && !(simple && a.rech)) return [ev[1] === 'S' ? 'PREÑ+SERV' : 'PREÑ+CELO', A.diffDays(ref, ev[0]), true];
      if (a.rech) return simple ? null : ['DESCARTE', ''];
      if (a.estado === 'prenada') {
        var pp = A.derive(a, ref).partoProb || a.partoProb;
        if (simple) {
          if (secar && secar[a.rp]) return ['SECAR', secar[a.rp].dp];
          var lt = (a.pr || [])[0]; if (typeof lt === 'number' && lt < PLT_LTS) return ['SECAR LTS', Math.round(lt * 10) / 10];
          return null;
        }
        return [pp ? pp.slice(8, 10) + '-' + pp.slice(5, 7) + '-' + pp.slice(2, 4) : 'Preñada', ''];
      }
      if (/^a/i.test(a.r1 || '') && dl !== '' && dl <= 30) return ['ABORTO', dl];
      if (a.estado === 'servida' && a.sFecha) { var ds = A.diffDays(ref, a.sFecha); return [ds >= A.DX_MIN ? 'REVISAR' : 'PARCHE', ds]; }
      if (a.result && a.tFecha && (!a.pFecha || a.tFecha >= a.pFecha)) return [a.result, dl];
      if (simple && dl !== '' && dl < PLT_PARIDA) return null;
      return ['PARIDA', dl];
    }
    /* ----- Voy mañana (modo veterinario): lo que hay que ver en la visita de mañana, en cuatro cuadros + leche y próximos 30 días.
       Todo calculado a la fecha de la visita (mañana). Sin descartes. A tocar: vacas en ordeñe servidas hace 35 días o más,
       vacías o con tacto sin preñez sin servicio después, y preñadas con celo o servicio después del tacto.
       A liberar: vacas en ordeñe paridas hace 30 días o más, sin servicio ni tacto. ----- */
    function voyDatos() {
      var ref = A.addDays(today(), 1), L = DB.animales, R = { ref: ref, tocar: [], liberar: [], vaq: [], atras: [], repe: [], secar: [], partos: [] };
      L.forEach(function (a) {
        var dl = a.pFecha ? A.diffDays(ref, a.pFecha) : null;
        // partos atrasados: también las de descarte (es un dato a corregir en el programa)
        var pa = partoAtrasado(a); if (pa) R.atras.push({ a: a, t: 'Parto atrasado', d: pa.d, u: 'días' });
        if (a.rech) return;
        if (a.cat === 'vaca') {
          var ev = prenConEvento(a);
          if (ev) R.tocar.push({ a: a, k: 'pren', t: ev[1] === 'S' ? 'Preñada + servicio' : 'Preñada + celo', d: A.diffDays(ref, ev[0]), u: 'días', al: true });
          else if (a.estado === 'servida' && a.sFecha) { var ds = A.diffDays(ref, a.sFecha); if (ds >= A.DX_MIN) R.tocar.push({ a: a, k: 'serv', t: 'Servida · diagnóstico de preñez', d: ds, u: 'días de servida' }); }
          else if (a.estado !== 'prenada' && a.result && a.tFecha && (!a.pFecha || a.tFecha >= a.pFecha)) R.tocar.push({ a: a, k: 'vac', t: a.result + ' · sin servicio', d: dl, u: 'días de parida' });
          else if (a.estado !== 'prenada' && dl != null && dl >= PLT_PARIDA) R.liberar.push({ a: a, t: 'Parida', d: dl, u: 'días de parida' });
        }
        if (a.cat === 'vaquillona' && a.estado === 'servida' && a.sFecha) { var dv = A.diffDays(ref, a.sFecha); if (dv >= A.DX_MIN) R.vaq.push({ a: a, t: 'Servida', d: dv, u: 'días de servida' }); }
        if (repetidora(a) && a.cat === 'vaca') R.repe.push({ a: a, t: 'Repetidora', d: a.sN, u: 'servicios' });
        if (a.estado === 'prenada') {
          var pp = A.derive(a, ref).partoProb || a.partoProb; if (!pp) return;
          var dp = A.diffDays(pp, ref);
          if (dp >= 0 && dp <= 30) R.partos.push({ a: a, t: 'Parto probable ' + A.fmt(pp), d: dp, u: 'días' });
          if (a.cat === 'vaca') { var dsec = dp - A.SECADO; if (dsec >= 0 && dsec <= 30) R.secar.push({ a: a, t: 'Secar el ' + A.fmt(A.addDays(ref, dsec)), d: dsec, u: 'días' }); }
        }
      });
      var ord = function (x, y) { return y.d - x.d; };
      ['tocar', 'liberar', 'vaq', 'atras', 'repe'].forEach(function (k) { R[k].sort(ord); });
      // a tocar: primero las servidas (diagnóstico de preñez), después las vacías sin servicio, al final preñadas con celo o servicio
      var KO = { serv: 0, vac: 1, pren: 2 }; R.tocar.sort(function (x, y) { return KO[x.k] - KO[y.k] || y.d - x.d; });
      R.nServ = R.tocar.filter(function (x) { return x.k === 'serv'; }).length; R.nVac = R.tocar.filter(function (x) { return x.k === 'vac'; }).length; R.nPren = R.tocar.length - R.nServ - R.nVac;
      R.secar.sort(function (x, y) { return x.d - y.d; }); R.partos.sort(function (x, y) { return x.d - y.d; });
      return R;
    }
    var VOY_T = { tocar: 'Vacas a tocar', liberar: 'Vacas a liberar', vaq: 'Vaquillonas a tocar', alertas: 'Alertas', prox: 'Próximos 30 días' };
    function voyHTML() {
      var R = voyDatos(), DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
      var dsem = DIAS[new Date(R.ref + 'T12:00:00').getDay()];
      var ult = '0000'; DB.animales.forEach(function (a) { if (a.tFecha && a.tFecha > ult) ult = a.tFecha; });
      var volver = '<button class="backbtn" data-a="voycerrar"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>Volver</button>';
      if (state.voyLista) {
        var k = state.voyLista, items = k === 'alertas' ? R.atras.concat(R.repe) : k === 'prox' ? R.secar.concat(R.partos) : R[k];
        return '<div class="voy">' + volver + '<h1 class="ptitle">' + VOY_T[k] + '</h1><p class="voysub">' + items.length + (items.length === 1 ? ' animal' : ' animales') + ' · a la fecha de la visita, ' + A.fmt(R.ref) + '</p>' +
          (items.length ? '<div class="list">' + items.map(function (x) { return rowHTML(x.a, { right: '<span class="when' + (x.al ? ' late' : '') + '">' + (x.d != null ? x.d + ' ' + (x.u || '') : '') + '</span>', sub: esc(x.t) }); }).join('') + '</div>' : '<p class="hint">No hay animales en esta lista.</p>') + '</div>';
      }
      var c = function (cls, k, n, l, s) { return '<button class="vt ' + cls + '" data-voy="' + k + '"><svg class="vch" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg><b>' + n + '</b><span><em>' + l + '</em><small>' + s + '</small></span></button>'; };
      var nAl = R.atras.length + R.repe.length;
      var al = [R.atras.length ? R.atras.length + (R.atras.length === 1 ? ' parto atrasado' : ' partos atrasados') : '', R.repe.length ? R.repe.length + (R.repe.length === 1 ? ' repetidora' : ' repetidoras') : ''].filter(Boolean).join(' · ') || 'Sin alertas';
      var P = panelOK() ? panelDatos() : null, le = P && P.le, d4 = le && le.prev ? (le.v / le.prev - 1) * 100 : null;
      return '<div class="voy">' + volver + '<h1 class="ptitle">Voy mañana</h1><p class="voysub">' + dsem.replace(/^./, function (x) { return x.toUpperCase(); }) + ' ' + A.fmt(R.ref).slice(0, 5) + (ult > '0000' ? ' · último tacto hace ' + A.diffDays(R.ref, ult) + ' días' : '') + '</p>' +
        // cuadro principal a lo ancho: el número grande es a tocar por preñez; a la derecha, sin servicio, preñadas con celo y total
        '<button class="vhero" data-voy="tocar"><span class="vh1"><b>' + R.nServ + '</b><em>A tocar por preñez</em><small>servidas +' + A.DX_MIN + ' días</small></span><span class="vh2">' +
          '<span><b>' + R.nVac + '</b> sin servicio</span>' + (R.nPren ? '<span><b>' + R.nPren + '</b> preñ. con celo</span>' : '') + '<span class="vtot"><b>' + R.tocar.length + '</b> en total</span></span>' +
          '<svg class="vch" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
        '<div class="vg">' + c('b', 'liberar', R.liberar.length, 'A liberar', 'paridas +' + PLT_PARIDA + ' días') + c('c', 'vaq', R.vaq.length, 'Vaquillonas', 'a tocar') + '</div>' +
        '<button class="valert' + (nAl ? '' : ' ok') + '" data-voy="alertas"><b>' + nAl + '</b><span><em>Alertas</em><small>' + al + '</small></span><svg class="vch" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
        (le ? '<button class="vf" data-a="voyleche"><span>Leche por vaca <b>' + nf(le.v, 1) + ' L</b></span>' + (d4 != null ? '<span class="' + (d4 < 0 ? 'dn' : 'up') + '">' + (d4 < 0 ? '▼ ' : '▲ +') + nf(Math.abs(d4), 0) + '% vs ' + le.mes + ' ' + (le.anio - 1) + '</span>' : '') + '</button>' : '') +
        '<button class="vf" data-voy="prox"><span>Próximos 30 días</span><span><b>' + R.secar.length + '</b> ' + (R.secar.length === 1 ? 'secado' : 'secados') + ' · <b>' + R.partos.length + '</b> ' + (R.partos.length === 1 ? 'parto' : 'partos') + '</span></button>' +
        '<button class="btn primary big vbtn" data-a="voyplanilla">Planilla de tacto para mañana</button></div>';
    }
    // refV: fecha a la que se calcula (Voy mañana la pide para mañana; desde Tareas, hoy)
    function planillaElegir(refV) {
      state.pltRef = refV || null;
      $('#sheetXTitle').textContent = 'Planilla de tacto' + (refV ? ' para el ' + A.fmt(refV) : '');
      $('#xopts').innerHTML = '<p class="cap" style="margin:0 0 6px">Vacas en ordeñe por caravana, en tres columnas para imprimir y anotar en el corral.</p>' +
        '<p class="cap"><b>Completa:</b> todas las vacas en ordeñe. <b>Para bastón:</b> ID de trazabilidad (858 0000 + los 8 números del ID electrónico), caravana y lo que dice la planilla completa, para cargar en el lector. <b>Simple:</b> sin preñadas, descartes ni paridas de menos de ' + PLT_PARIDA + ' días; de las preñadas solo van las que hay que secar (por la fecha de Para secar, el ' + A.fmt(fechaSecado()) + ', o con menos de ' + PLT_LTS + ' litros) y las que tienen celo o servicio después del tacto, que salen marcadas en rojo.</p>';
      $('#xbtns').innerHTML = '<button class="btn primary big" data-a="plt" data-m="simple">Planilla simple</button><button class="btn big" data-a="plt" data-m="completa">Planilla completa</button><button class="btn big" data-a="plt" data-m="baston">Planilla para bastón</button><button class="btn" data-a="xcancel">Cancelar</button>';
      $('#sheetX').hidden = false;
    }
    function crc32(u) { var c, t = crc32.t; if (!t) { t = crc32.t = []; for (var n = 0; n < 256; n++) { c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } } c = 0xFFFFFFFF; for (var i = 0; i < u.length; i++) c = t[(c ^ u[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
    // zip sin comprimir (alcanza para un .xlsx chico)
    function zipStore(files) {
      var enc = new TextEncoder(), partes = [], cd = [], off = 0;
      var le = function (n, b) { var a = []; for (var i = 0; i < b; i++) a.push((n >>> (8 * i)) & 255); return a; };
      files.forEach(function (f) {
        var nm = enc.encode(f[0]), d = enc.encode(f[1]), crc = crc32(d);
        var h = [].concat([0x50, 0x4b, 3, 4], le(20, 2), le(0, 2), le(0, 2), le(0, 4), le(crc, 4), le(d.length, 4), le(d.length, 4), le(nm.length, 2), le(0, 2));
        partes.push(new Uint8Array(h), nm, d);
        cd.push(new Uint8Array([].concat([0x50, 0x4b, 1, 2], le(20, 2), le(20, 2), le(0, 2), le(0, 2), le(0, 4), le(crc, 4), le(d.length, 4), le(d.length, 4), le(nm.length, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 4), le(off, 4))), nm);
        off += h.length + nm.length + d.length;
      });
      var cdl = 0; cd.forEach(function (x) { cdl += x.length; });
      var fin = new Uint8Array([].concat([0x50, 0x4b, 5, 6], le(0, 2), le(0, 2), le(files.length, 2), le(files.length, 2), le(cdl, 4), le(off, 4), le(0, 2)));
      return new Blob(partes.concat(cd, [fin]), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    }
    // .xlsx de una hoja (encabezado en negrita); los números van como número y el resto como texto
    function xlsxSimple(nombreHoja, head, filas, anchos) {
      var X = function (v) { return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
      var col = function (i) { return String.fromCharCode(65 + i); };
      var celda = function (v, r, c, st) { return v === '' || v == null ? '' : typeof v === 'number' ? '<c r="' + col(c) + r + '"' + (st ? ' s="' + st + '"' : '') + '><v>' + v + '</v></c>' : '<c r="' + col(c) + r + '"' + (st ? ' s="' + st + '"' : '') + ' t="inlineStr"><is><t>' + X(v) + '</t></is></c>'; };
      var rows = ['<row r="1">' + head.map(function (h, c) { return celda(h, 1, c, 1); }).join('') + '</row>'].concat(filas.map(function (f, i) { return '<row r="' + (i + 2) + '">' + f.map(function (v, c) { return celda(v, i + 2, c, 0); }).join('') + '</row>'; }));
      var hoja = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>' + anchos.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; }).join('') + '</cols><sheetData>' + rows.join('') + '</sheetData></worksheet>';
      var estilos = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
      return zipStore([
        ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
        ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
        ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="' + X(nombreHoja) + '" sheetId="1" r:id="rId1"/></sheets></workbook>'],
        ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
        ['xl/styles.xml', estilos], ['xl/worksheets/sheet1.xml', hoja]
      ]);
    }
    // ID de trazabilidad para el bastón: 858 0000 + los últimos 8 números del ID electrónico
    function idTraz(a) { var d = String(a.idElec || '').replace(/\D/g, ''); return d.length >= 8 ? '8580000' + d.slice(-8) : ''; }
    function planillaBaston(refV) {
      var ref = refV || today(), L = DB.animales.filter(function (a) { return a.cat === 'vaca'; }).sort(numRp);
      if (!L.length) { toast('No hay vacas en ordeñe en este tambo.'); return; }
      var desc = function (a) { var f = planillaFila(a, ref, false, {}); return (/^\d\d-\d\d-\d\d$/.test(f[0]) ? 'PARTO ' : '') + f[0] + (f[1] !== '' ? ' ' + String(f[1]).replace('.', ',') : ''); };
      var filas = L.map(function (a) { return [idTraz(a), /^\d+$/.test(a.rp) ? +a.rp : a.rp, desc(a)]; }), sinId = filas.filter(function (f) { return !f[0]; }).length;
      var blob = xlsxSimple('Baston', ['ID', 'Caravana', 'Tacto'], filas, [20, 11, 18]);
      var nombre = ('Baston ' + (PERFIL.nombre || '') + ' ' + ref).replace(/[\\/:*?"<>|]+/g, '').trim() + '.xlsx', file = null;
      try { file = new File([blob], nombre, { type: blob.type }); } catch (e) {}
      state.xout = { blob: blob, file: file, csv: null, nombre: nombre };
      $('#sheetXTitle').textContent = 'Planilla para bastón · ' + L.length + ' vacas';
      $('#xopts').innerHTML = '<p class="cap" style="margin:0 0 6px">Columna A: ID de trazabilidad (858 0000 + los 8 números del ID electrónico) · B: caravana · C: lo que dice la planilla completa (parto de las preñadas, REVISAR, PARCHE, PARIDA, DESCARTE…).</p>' +
        (sinId ? '<p class="ralerta">⚠ ' + sinId + (sinId === 1 ? ' vaca no tiene' : ' vacas no tienen') + ' ID electrónico en el respaldo: van sin ID y el bastón no las va a reconocer.</p>' : '') +
        '<div class="xprev">' + filas.map(function (f) { return '<div><b>' + esc(String(f[1])) + '</b><span>' + esc((f[0] || 'sin ID') + ' · ' + f[2]) + '</span></div>'; }).join('') + '</div><p class="cap">Archivo: ' + esc(nombre) + '</p>';
      var puede = !!(navigator.share && file);
      $('#xbtns').innerHTML = (puede ? '<button class="btn primary big" data-a="xshare">Compartir Excel (WhatsApp, mail…)</button>' : '') + '<button class="btn' + (puede ? '' : ' primary big') + '" data-a="xsave">Guardar Excel en el teléfono</button><button class="btn" data-a="xcancel">Cerrar</button>';
      $('#sheetX').hidden = false;
    }
    function planillaTacto(modo, refV) {
      if (modo === 'baston') { planillaBaston(refV); return; }
      var simple = modo === 'simple', ref = refV || today(), secar = {};
      if (simple) listaSecado(fechaSecado()).forEach(function (x) { secar[x.a.rp] = x; });
      var F = {}, L = DB.animales.filter(function (a) { if (a.cat !== 'vaca') return false; var f = planillaFila(a, ref, simple, secar); if (!f) return false; F[a.rp] = f; return true; }).sort(numRp);
      if (!L.length) { toast('No hay vacas para la planilla.'); return; }
      var X = function (v) { return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
      var col = function (i) { return String.fromCharCode(65 + i); };
      // 45 vacas por columna, 135 por hoja; la hoja se escala al papel (alto y ancho)
      var FP = PLT_FILAS;
      var pags = Math.ceil(L.length / (FP * 3)), filas = [];
      var HT = 16.5; // 45 filas llenan una hoja A4
      for (var pg = 0; pg < pags; pg++) for (var r = 0; r < FP; r++) {
        var celdas = [], hay = false;
        for (var c = 0; c < 3; c++) {
          var a = L[pg * FP * 3 + c * FP + r]; if (!a) continue; hay = true;
          var f = F[a.rp], fila = pg * FP + r + 1, b = c * 4;
          celdas.push(/^\d+$/.test(a.rp) ? '<c r="' + col(b) + fila + '" s="1"><v>' + (+a.rp) + '</v></c>' : '<c r="' + col(b) + fila + '" s="1" t="inlineStr"><is><t>' + X(a.rp) + '</t></is></c>');
          celdas.push('<c r="' + col(b + 1) + fila + '" s="' + (f[2] ? 5 : 2) + '" t="inlineStr"><is><t>' + X(f[0]) + '</t></is></c>');
          if (f[1] !== '') celdas.push('<c r="' + col(b + 2) + fila + '" s="' + (f[2] ? 6 : 3) + '"><v>' + f[1] + '</v></c>');
          celdas.push('<c r="' + col(b + 3) + fila + '" s="4"/>');
        }
        if (hay) filas.push('<row r="' + (pg * FP + r + 1) + '" ht="' + HT + '" customHeight="1">' + celdas.join('') + '</row>');
      }
      // ancho de la caravana según el largo (4 cifras como SysCaw; 5 o más en DelPro)
      var lmax = 0; L.forEach(function (a) { if (a.rp.length > lmax) lmax = a.rp.length; });
      var ws = [Math.max(6.33, lmax * 1.45 + 0.6), 12, 4.5, 12], cols = '';
      for (var k = 0; k < 12; k++) cols += '<col min="' + (k + 1) + '" max="' + (k + 1) + '" width="' + ws[k % 4] + '" customWidth="1"/>';
      var cortes = ''; for (pg = 1; pg < pags; pg++) cortes += '<brk id="' + pg * FP + '" max="16383" man="1"/>';
      var tit = (simple ? 'Tacto simple · ' : 'Tacto · ') + (PERFIL.nombre || 'Tambo') + ' · ' + A.fmt(ref);
      var hoja = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><cols>' + cols + '</cols><sheetData>' + filas.join('') + '</sheetData>' +
        '<pageMargins left="0.4" right="0.3" top="0.6" bottom="0.4" header="0.25" footer="0.2"/><pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="' + pags + '"/>' +
        '<headerFooter><oddHeader>' + X('&C&"-,Bold"' + tit) + '</oddHeader><oddFooter>' + X('&CPágina &P de &N') + '</oddFooter></headerFooter>' +
        (cortes ? '<rowBreaks count="' + (pags - 1) + '" manualBreakCount="' + (pags - 1) + '">' + cortes + '</rowBreaks>' : '') + '</worksheet>';
      var estilos = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<fonts count="3"><font><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="13"/><name val="Calibri"/></font><font><b/><sz val="10"/><color rgb="FFC00000"/><name val="Calibri"/></font></fonts>' +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
        '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFB0B0B0"/></bottom><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
        '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"><alignment vertical="center"/></xf>' +
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="center"/></xf>' +
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment horizontal="center" vertical="center"/></xf>' +
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>' +
        '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"><alignment vertical="center"/></xf>' +
        '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"><alignment horizontal="center" vertical="center"/></xf></cellXfs>' +
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
      var blob = zipStore([
        ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
        ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
        ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Tacto" sheetId="1" r:id="rId1"/></sheets></workbook>'],
        ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
        ['xl/styles.xml', estilos],
        ['xl/worksheets/sheet1.xml', hoja]
      ]);
      var nombre = ((simple ? 'Tacto simple ' : 'Tacto ') + (PERFIL.nombre || '') + ' ' + ref).replace(/[\\/:*?"<>|]+/g, '').trim() + '.xlsx', file = null;
      try { file = new File([blob], nombre, { type: blob.type }); } catch (e) {}
      state.xout = { blob: blob, file: file, csv: null, nombre: nombre };
      var cu = {}, nAl = 0; L.forEach(function (a) { var f = F[a.rp][0]; if (F[a.rp][2]) nAl++; var k = /^\d\d-/.test(f) ? 'Preñadas' : f === 'PARCHE' ? 'Parche' : f === 'REVISAR' ? 'Revisar' : f === 'PARIDA' ? 'Paridas' : f === 'DESCARTE' ? 'Descarte' : f === 'SECAR' || f === 'SECAR LTS' ? 'Para secar' : /^PREÑ\+/.test(f) ? 'Preñadas con celo o servicio' : 'Con tacto sin preñez'; cu[k] = (cu[k] || 0) + 1; });
      $('#sheetXTitle').textContent = (simple ? 'Planilla simple · ' : 'Planilla completa · ') + L.length + ' vacas';
      $('#xopts').innerHTML = '<p class="cap" style="margin:0 0 6px">Vacas en ordeñe por caravana, en tres columnas para imprimir (' + pags + (pags === 1 ? ' hoja' : ' hojas') + ').' + (simple ? ' Sin preñadas, descartes ni paridas de menos de ' + PLT_PARIDA + ' días.' : '') + '</p>' +
        (nAl ? '<p class="ralerta">⚠ ' + nAl + (nAl === 1 ? ' vaca preñada tiene' : ' vacas preñadas tienen') + ' celo o servicio después del tacto (en rojo en la planilla).</p>' : '') +
        '<details class="nota"><summary>Qué dice cada vaca</summary><p class="cap">' + (simple ? '' : 'Preñada: fecha probable de parto · ') + 'REVISAR: servida hace ' + A.DX_MIN + ' días o más · PARCHE: servida hace menos de ' + A.DX_MIN + ' días (el número son los días de servida) · PARIDA: sin servicio ni tacto, con los días de parida · con tacto sin preñez: el resultado y los días de parida · ' + (simple ? 'SECAR: preñada para secar el ' + A.fmt(fechaSecado()) + ' (días al parto) · SECAR LTS: preñada con menos de ' + PLT_LTS + ' litros en el último control · ' : 'DESCARTE · ') + 'PREÑ+CELO / PREÑ+SERV: preñada con celo o servicio después del tacto (días desde ese celo o servicio). Al lado de cada vaca queda una columna en blanco para anotar.</p></details>' +
        '<p class="cap">' + ['Revisar', 'Parche', 'Paridas', 'Con tacto sin preñez', 'Para secar', 'Preñadas con celo o servicio', 'Preñadas', 'Descarte'].filter(function (k) { return cu[k]; }).map(function (k) { return '<b>' + cu[k] + '</b> ' + k.toLowerCase(); }).join(' · ') + '</p>' +
        '<div class="xprev">' + L.map(function (a) { var f = F[a.rp]; return '<div><b>' + esc(a.rp) + '</b><span' + (f[2] ? ' style="color:var(--vacia);font-weight:700"' : '') + '>' + esc(f[0] + (f[1] !== '' ? ' ' + String(f[1]).replace('.', ',') : '')) + '</span></div>'; }).join('') + '</div><p class="cap">Archivo: ' + esc(nombre) + '</p>';
      var puede = !!(navigator.share && file);
      $('#xbtns').innerHTML = (puede ? '<button class="btn primary big" data-a="xshare">Compartir Excel (WhatsApp, mail…)</button>' : '') + '<button class="btn' + (puede ? '' : ' primary big') + '" data-a="xsave">Guardar Excel en el teléfono</button><button class="btn" data-a="xcancel">Cerrar</button>';
      $('#sheetX').hidden = false;
    }

    /* ----- render ----- */
    var NAVS = [
      ['panel', 'Panel', '<rect x="3.5" y="3.5" width="7" height="7" rx="1.6" fill="none" stroke="currentColor" stroke-width="2.1"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6" fill="none" stroke="currentColor" stroke-width="2.1"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6" fill="none" stroke="currentColor" stroke-width="2.1"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6" fill="none" stroke="currentColor" stroke-width="2.1"/>'],
      ['buscar', 'Buscar', '<circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M15.5 15.5L21 21" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'],
      ['tareas', 'Tareas', '<path d="M5 6.5l2 2 3.5-4M5 14.5l2 2 3.5-4M14 7h6M14 15h6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'],
      ['leche', 'Leche', '<path d="M12 3.5s-6 6.6-6 10.8a6 6 0 0 0 12 0c0-4.2-6-10.8-6-10.8z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>'],
      ['rodeo', 'Rodeo', '<path d="M5 20V11M12 20V4M19 20v-6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>']
    ];
    function render() {
      if (suspendido()) {
        var nv = $('#nav'); if (nv) nv.hidden = true; $('#ubtn').hidden = true; $('#tbtn').hidden = true; $('#meta').textContent = 'Acceso suspendido';
        $('#main').innerHTML = '<section class="empty"><div class="emptytag">' + LOGO_LIBRETA.replace('width="34" height="34"', 'width="72" height="72"') + '</div><h2>Acceso suspendido</h2></section>';
        return;
      }
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
      $('#meta').textContent = DB.animales.length + ' animales · ' + (DB.fuente === 'syscaw' ? SRCbase() + ' del ' + A.fmt(DB.fecha) : 'libreta del ' + A.fmt(DB.cargada)) + (state.persisted ? '' : ' (no se guarda en este navegador)') + (esOperario() ? ' · operario' : '');
      if (state.tab === 'panel' && !panelOK()) state.tab = 'buscar';
      nav.innerHTML = '<div class="navin">' + NAVS.filter(function (n) { return n[0] !== 'panel' || panelOK(); }).map(function (n) {
        return '<button class="nb" data-t="' + n[0] + '" aria-current="' + (!state.rp && state.tab === n[0] ? 'page' : 'false') + '"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">' + n[2] + '</svg><span>' + n[1] + '</span></button>';
      }).join('') + '</div>';
      document.body.classList.toggle('ancho', !!(state.pobl && esVet()));
      if (state.pobl && esVet()) { main.innerHTML = pobHTML(); return; }
      if (state.informe && esVet()) { main.innerHTML = informeHTML(); return; }
      if (state.voy && esVet() && DB.animales.length) { main.innerHTML = voyHTML(); return; }
      if (state.rp) {
        var a = byRp(state.rp);
        if (a) { main.innerHTML = fichaHTML(a); plegarFicha(main, true); agruparPlegadas(main); var gl = main.querySelector('.glist'); if (gl) gl.insertAdjacentHTML('beforebegin', '<p class="grp">Historial</p>'); plegarNotas(main); return; }
        state.rp = null;
      }
      var err = iosTipHTML() + (state.error ? '<p class="error" role="alert">' + esc(state.error) + '</p>' : '');
      if (state.tab === 'tareas') main.innerHTML = err + tareasHTML();
      else if (state.tab === 'rodeo') { main.innerHTML = err + rodeoHTML(); plegarFicha(main); vetCompartir(main); }
      else if (state.tab === 'leche') { main.innerHTML = err + lecheHTML(); plegarFicha(main); vetCompartir(main); }
      else if (state.tab === 'panel' && panelOK()) { main.innerHTML = err + panelHTML(); vetCompartir(main); }
      else { main.innerHTML = err + buscarHTML(); updateResults(); }
      plegarNotas(main);
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
      if ((el = e.target.closest('[data-voy]'))) { state.voyLista = el.dataset.voy; render(); window.scrollTo(0, 0); return; }
      if ((el = e.target.closest('[data-pan]'))) {
        var pa = el.dataset.pan;
        if (pa === 'leche') { setTab('leche'); return; }
        if (pa === 'tactar') { state.desp = state.desp || {}; state.desp.tactar = true; state.desp.tactarvq = true; setTab('tareas'); return; }
        if (pa === 'ptvac') { state.cat = 'todas'; state.filtro = 'ptvac'; state.q = ''; state.n = 60; setTab('buscar'); return; }
        var tit = pa === 'rep' ? 'Ciclos de 21 días' : 'Ordeñe y secas';
        FICHA_AB[tit] = true; state.cat = 'todas'; setTab('rodeo');
        var rs = Array.prototype.filter.call(document.querySelectorAll('section.card h2'), function (h) { return h.textContent.indexOf(tit) === 0; })[0];
        if (rs) rs.closest('section').scrollIntoView({ block: 'start' });
        return;
      }
      if ((el = e.target.closest('[data-cat]'))) { state.cat = el.dataset.cat; state.filtro = 'todas'; state.n = 60; render(); return; }
      if ((el = e.target.closest('[data-f]'))) { state.filtro = el.dataset.f; state.n = 60; render(); return; }
      if ((el = e.target.closest('[data-pev]'))) { state.pev = +el.dataset.pev; render(); return; }
      if ((el = e.target.closest('[data-clper]'))) { state.clPer = el.dataset.clper; render(); return; }
      if ((el = e.target.closest('[data-clg]'))) { state.clG = +el.dataset.clg; render(); return; }
      if ((el = e.target.closest('[data-clmes]'))) { var cm = +el.dataset.clmes; state.clMes = state.clMes === cm ? null : cm; render(); return; }
      if ((el = e.target.closest('[data-icf]'))) { var kf = el.dataset.icf; state.insCal = state.insCal === kf ? null : kf; var Fq = insFechas(); state.insCalM = (kf === 'd0' ? Fq[0] : Fq[1]).slice(0, 7); render(); return; }
      if ((el = e.target.closest('[data-icm]'))) { var mm = (state.insCalM || insFechas()[1].slice(0, 7)).split('-').map(Number), dt = new Date(mm[0], mm[1] - 1 + (+el.dataset.icm), 1, 12); state.insCalM = A.ymd(dt).slice(0, 7); render(); return; }
      if ((el = e.target.closest('[data-icd]'))) { var kd = state.insCal === 'd0' ? 'insD0' : 'insD1'; state[kd] = el.dataset.icd; setP(kd.toLowerCase(), el.dataset.icd); if (state.insCal === 'd0') { state.insCal = 'd1'; state.insCalM = insFechas()[1].slice(0, 7); } else state.insCal = null; render(); return; }
      if ((el = e.target.closest('[data-insel]'))) { state.insSel = el.dataset.insel; render(); return; }
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
      else if (a === 'lnkbuscar') { closeSheet(); actualizarDesdeLink(true); }
      else if (a === 'simlista') { state.simLista = !state.simLista; render(); }
      else if (a === 'repti') { state.repTI = !state.repTI; render(); }
      else if (a === 'ini21def') ini21Default();
      else if (a === 'pzab') { state.pzAb = !state.pzAb; render(); }
      else if (a === 'pzfec') { state.pzFec = !state.pzFec; render(); }
      else if (a === 'finzafdef') { try { localStorage.removeItem('libreta:finzaf:' + TAMBOS.activo); if (TAMBOS.lista.length < 2) localStorage.removeItem('libreta:finzaf'); } catch (e) {} render(); }
      else if (a === 'enviaract') enviarActivacion();
      else if (a === 'lnkdatos') linkDatos();
      else if (a === 'lnkprod') linkDatosRol('prod');
      else if (a === 'lnkop') linkDatosRol('op');
      else if (a === 'lnkact') linkDatosRol('act');
      else if (a === 'ghtoken') { closeSheet(); pedirToken(); }
      else if (a === 'actprod') enviarActivacionRol('prod');
      else if (a === 'actop') enviarActivacionRol('op');
      else if (a === 'vet') modoVet();
      else if (a === 'pegaract') { closeSheet(); pegarActivacion(); }
      else if (a === 'ioscopy') iosCopiar();
      else if (a === 'iostipx') { try { localStorage.setItem('libreta:iostip', '1'); } catch (e) {} render(); }
      else if (a === 'actcod') { var ic = $('#actCod'); activarCodigo(ic ? ic.value : ''); }
      else if (a === 'pedircod') { closeSheet(); pedirCodigo(); }
      else if (a === 'exptactar') abrirExport();
      else if (a === 'expparches') abrirExport('parches');
      else if (a === 'expplanilla') planillaElegir();
      else if (a === 'plt') planillaTacto(b.dataset.m, state.pltRef);
      else if (a === 'xok') { busy(true, 'Armando el Excel…'); cargarXlsx().then(function () { busy(false); exportarTactar(); }, function (er) { busy(false); toast(er.message); }); }
      else if (a === 'xshare') xCompartir();
      else if (a === 'vtacfg') vtaSheet();
      else if (a === 'vtaok') { setP('vta', JSON.stringify(state.vtaDraft)); $('#sheetX').hidden = true; render(); toast('Criterio de venta guardado'); }
      else if (a === 'xsharecsv') xCompartirCSV();
      else if (a === 'xsave') xGuardar();
      else if (a === 'xcancel') $('#sheetX').hidden = true;
      else if (a === 'informe') abrirInforme();
      else if (a === 'poblacion') abrirPoblacion();
      else if (a === 'pobvista') { state.pobVista = b.dataset.pv; render(); window.scrollTo(0, 0); }
      else if (a === 'pobpdf') pdfPob();
      else if (a === 'pobcerrar') { state.pobl = false; if (state.pobIni) { state.pobIni = false; state.inicio = true; } render(); window.scrollTo(0, 0); }
      else if (a === 'pobcalc') pobCalc();
      else if (a === 'base') exportarBase();
      else if (a === 'vetclave') copiarClaveVet();
      else if (a === 'basein') { closeSheet(); $('#baseFile').click(); }
      else if (a === 'voy') { state.voy = true; state.voyLista = null; render(); window.scrollTo(0, 0); }
      else if (a === 'voycerrar') { if (state.voyLista) state.voyLista = null; else state.voy = false; render(); window.scrollTo(0, 0); }
      else if (a === 'voyleche') { state.voy = false; state.voyLista = null; setTab('leche'); }
      else if (a === 'voyplanilla') planillaElegir(A.addDays(today(), 1));
      else if (a === 'infcerrar') { state.informe = false; render(); window.scrollTo(0, 0); }
      else if (a === 'infpdf') pdfInforme();
      else if (a === 'tnuevo') { closeSheetT(); state.destino = 'nuevo'; $('#file').click(); }
      else if (a === 'tcerrar') closeSheetT();
      else if (a === 'unidad') cambiarUnidad();
      else if (a === 'compsecar') compartirSecar();
      else if (a === 'lnklista') { linksLista(); leerBloqLinks(); }
      else if (a === 'lnkbloq') { var lidb = b.dataset.l, ya = (state.bloqLinks || BLOQL).indexOf(lidb) >= 0, xr = linksMandados().filter(function (q) { return q.l === lidb; })[0]; bloquearLink(lidb, !ya, xr ? xr.n + (xr.r === 'op' ? ' (operario)' : '') + (xr.para ? ' · para ' + xr.para : '') + ' · ' + xr.f : ''); }
      else if (a === 'lnkpegbloq') { var tx = prompt('Pegá el link que querés bloquear'); var mt = tx && /#libreta=[a-f0-9]+\.[A-Za-z0-9_\-]+\.([A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+)/.exec(tx); if (tx && !mt) toast('Eso no es un link de libreta.'); else if (mt) { var pj = null; try { pj = JSON.parse(new TextDecoder().decode(unb64u(mt[1].split('.')[0]))); } catch (e) {} bloquearLink(linkId(mt[1]), true, (pj && pj.n ? pj.n + (pj.r === 'op' ? ' (operario)' : '') + ' · ' + pj.f : 'pegado')); } }
      else if (a === 'cardimg') { var scd = b.closest('section.card'); if (scd) compartirCard(scd); }
      else if (a === 'shdos') shDesdeSheet('gt');
      else if (a === 'shgraf') shDesdeSheet('g');
      else if (a === 'shtab') shDesdeSheet('t');
      else if (a === 'shtodo') shDesdeSheet('todo');
      else if (a === 'panelimg') compartirPanel();
      else if (a === 'inscalc') { var F = insFechas(); if (F[0] > F[1]) { toast('La fecha "del" tiene que ser anterior a la fecha "al".'); return; } state.insR = insCalc(F[0], F[1]); state.insR.d0 = F[0]; state.insR.d1 = F[1]; render(); }
      else if (a === 'inswa') insComprobanteWA();
      else if (a === 'instk') insTicket();
      else if (a === 'insver') { state.insVer = !state.insVer; render(); }
      else if (a === 'uok') cerrarUnidad(idsMarcados());
      else if (a === 'ucancel') cerrarUnidad(null);
    });
    document.addEventListener('change', function (e) {
      if ((e.target.id === 'vomes' || e.target.id === 'pomes') && e.target.value) { state.vomes = e.target.value; render(); return; }
      if (e.target.id === 'simDesc') { state.simDesc = e.target.checked; setP('simdesc', state.simDesc ? '1' : ''); render(); return; }
      if (e.target.id === 'pobSel') { state.pobModo = e.target.value; render(); return; }
      if (e.target.classList && e.target.classList.contains('pobToro')) { pobToroSet(e.target.dataset.toro, e.target.checked); state.pobToroAb = true; render(); return; }
      if (e.target.id === 'finZaf' && e.target.value) { setP('finzaf', e.target.value.slice(5)); render(); return; }
      if (e.target.id === 'ini21' && e.target.value) { state.ini21 = e.target.value; setP('ini21', state.ini21); render(); }
      if ((e.target.id === 'insd0' || e.target.id === 'insd1') && e.target.value) { var k = e.target.id === 'insd0' ? 'insD0' : 'insD1'; state[k] = e.target.value; setP(k.toLowerCase(), e.target.value); render(); return; }
      if (e.target.dataset && e.target.dataset.ip) { var Pp = insPrecios(), v = parseFloat(String(e.target.value).replace(',', '.')); Pp[e.target.dataset.ip] = isFinite(v) && v >= 0 ? v : null; setP('insprec', JSON.stringify(Pp)); if (state.insR) render(); return; }
      if (e.target.id === 'fsec' && e.target.value) { state.fsec = e.target.value; setP('fsec', state.fsec); render(); }
    });
    document.addEventListener('input', function (e) {
      if (e.target.dataset && e.target.dataset.vn) { var w = parseInt(e.target.value, 10); state.vtaDraft[e.target.dataset.vn] = w > 0 ? w : null; vtaCuenta(); return; }
      if (e.target.dataset && e.target.dataset.xn) { var v = parseInt(e.target.value, 10); state.xf[e.target.dataset.xn] = v > 0 ? v : null; xActualizarCuenta(); return; }
      if (e.target.id === 'q') { state.q = e.target.value; updateResults(); }
      if (e.target.id === 'qTambo') { var k = normNom(e.target.value), vis = 0; document.querySelectorAll('#ilist .itambo').forEach(function (b) { b.hidden = !!k && b.dataset.nom.indexOf(k) < 0; if (!b.hidden) vis++; }); var nd = $('#inada'); if (nd) nd.hidden = vis > 0; var il = $('#ilist'); if (il) il.hidden = !vis; }
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
    if (!leerLibreta()) { leerActivacion(); leerPrecarga(); listo.then(function () { setTimeout(actualizarDesdeLink, 800); }); }
    listo.then(function () { setTimeout(revisarBloqueos, 400); });
    root.addEventListener('online', revisarBloqueos);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) revisarBloqueos(); });
    var desdeHash = function () { var r = rpDeHash(); if (r) state.rp = r; };
    desdeHash(); render();
    listo.then(function (cambio) { if (cambio) { desdeHash(); render(); } });
  }
})(typeof window !== 'undefined' ? window : this);
