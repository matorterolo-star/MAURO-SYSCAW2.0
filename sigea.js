/* Lee la base de SIGEA (Macoel), un archivo de Firebird/InterBase (.GDB), sin instalar nada: recorre las páginas del archivo,
   arma las tablas que usa la libreta y devuelve lo mismo que SysCaw.build / Fosapp.build. Solo para el modo veterinario. */
(function (root) {
  'use strict';
  // Lector mínimo de bases Firebird/InterBase ODS 10 (páginas, punteros, registros)
  function open(buf){
    const B = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const dv = new DataView(B.buffer, B.byteOffset, B.length);
    const PS = dv.getUint16(16, true);
    const u8=o=>dv.getUint8(o), u16=o=>dv.getUint16(o,true), u32=o=>dv.getUint32(o,true);
    function unrle(src){ const out=new Uint8Array(65536*4); let n=0,i=0; while(i<src.length){ const c=(src[i]<<24)>>24; i++; if(c>0){ out.set(src.subarray(i,i+c),n); n+=c; i+=c; } else if(c<0){ out.fill(src[i],n,n-c); n-=c; i++; } } return out.slice(0,n); }
    // registro en (página, línea): devuelve bytes comprimidos completos (une fragmentos)
    function rawAt(page,line){
      const o=page*PS, cnt=u16(o+22); if(line>=cnt) return null;
      const off=u16(o+24+line*4), len=u16(o+26+line*4); if(!len) return null;
      const r=o+off, flags=u16(r+10);
      return { r, len, flags, trans:u32(r), format:u8(r+12) };
    }
    function recordBytes(page,line){
      const h=rawAt(page,line); if(!h) return null;
      let parts=[], cur=h, hdr=(h.flags&8)?22:13;
      parts.push(B.subarray(h.r+hdr, h.r+h.len));
      let fp=h.flags&8? u32(h.r+16):0, fl=h.flags&8? u16(h.r+20):0;
      while(fp){ const f=rawAt(fp,fl); if(!f) break; const fh=(f.flags&8)?22:13; parts.push(B.subarray(f.r+fh,f.r+f.len)); if(f.flags&8){ fp=u32(f.r+16); fl=u16(f.r+20);} else fp=0; }
      let tot=0; parts.forEach(p=>tot+=p.length); const c=new Uint8Array(tot); let k=0; parts.forEach(p=>{c.set(p,k);k+=p.length;});
      return { flags:h.flags, format:h.format, trans:h.trans, data:unrle(c) };
    }
    // páginas de datos de una relación, a partir de su primera página de punteros
    function dataPages(firstPtr){
      const res=[]; let p=firstPtr, seq=0;
      while(p){ const o=p*PS; const c=u16(o+24); for(let i=0;i<c;i++){ const dp=u32(o+32+i*4); res.push({dp, seq:u32(o+16), slot:i}); } p=u32(o+20); }
      return res;
    }
    // recorre los registros primarios (última versión, no borrados)
    function* records(firstPtr, opts){
      for(const {dp,seq,slot} of dataPages(firstPtr)){
        if(!dp) continue; const o=dp*PS; if(u8(o)!==5) continue; const cnt=u16(o+22);
        for(let l=0;l<cnt;l++){ const len=u16(o+26+l*4); if(!len) continue; const r=o+u16(o+24+l*4), fl=u16(r+10);
          if(opts&&opts.blobs){ if(!(fl&16)) continue; yield {seq,slot,line:l,page:dp,flags:fl}; continue; }
          if(fl & (1|2|4|16|32)) continue; // borrado, versión vieja, fragmento, blob, delta
          const rec=recordBytes(dp,l); if(rec) yield Object.assign(rec,{seq,slot,line:l,page:dp}); }
      }
    }
    return { B, dv, PS, u8,u16,u32, rawAt, recordBytes, records, dataPages };
  }
  // ---- capa de tablas: nombres, formatos y lectura de filas ----
  function db(buf){
    const F=open(buf), PS=F.PS, DPP=Math.floor((PS-32)*8/34), MR=Math.floor((PS-28)/17);
    const s16=(d,o)=>(d[o]|d[o+1]<<8)<<16>>16, s32=(d,o)=>d[o]|d[o+1]<<8|d[o+2]<<16|d[o+3]<<24;
    const txt=(d,o,n)=>{let s='';for(let i=0;i<n;i++)s+=String.fromCharCode(d[o+i]);return s.replace(/\s+$/,'');};
    const ptr={};
    for(const r of F.records(F.u32(20))){ const d=r.data; if(s16(d,16)===4){ const rel=s16(d,8); (ptr[rel]=ptr[rel]||[])[s32(d,12)]=s32(d,4); } }
    const first=rel=>ptr[rel]&&ptr[rel][0];
    const rels={}; for(const r of F.records(first(6))){ rels[txt(r.data,38,31)]=s16(r.data,28); }
    const fields={}; for(const r of F.records(first(5))){ const d=r.data; (fields[txt(d,35,31)]=fields[txt(d,35,31)]||{})[s16(d,302)]=txt(d,4,31); }
    // blobs de RDB$FORMATS
    const bidx={}; for(const x of F.records(first(8),{blobs:true})) bidx[(x.seq*DPP+x.slot)*MR+x.line]=x;
    function blob0(x){ const h=F.rawAt(x.page,x.line), r=h.r, lvl=F.u8(r+12); if(lvl!==0) throw new Error('blob nivel '+lvl); const raw=F.B.subarray(r+28,r+h.len); const out=[]; let i=0; while(i+2<=raw.length){ const n=raw[i]|raw[i+1]<<8; out.push(raw.subarray(i+2,i+2+n)); i+=2+n; } let t=0; out.forEach(o=>t+=o.length); const c=new Uint8Array(t); let k=0; out.forEach(o=>{c.set(o,k);k+=o.length}); return c; }
    const formats={};
    for(const r of F.records(first(8))){ const d=r.data, rel=s16(d,4), fmt=s16(d,6), num=s32(d,12); const x=bidx[num]; if(!x) continue; const b=blob0(x); const desc=[]; for(let i=0;i+12<=b.length;i+=12) desc.push({t:b[i], sc:(b[i+1]<<24)>>24, len:b[i+2]|b[i+3]<<8, off:s32(b,i+8)}); (formats[rel]=formats[rel]||{})[fmt]=desc; }
    const EPOCH=Date.UTC(1858,10,17);
    function val(d,f){ const o=f.off; switch(f.t){
      case 1: return txt(d,o,f.len);
      case 3: { const n=d[o]|d[o+1]<<8; return txt(d,o+2,n); }
      case 8: { const v=s16(d,o); return f.sc?+(v*Math.pow(10,f.sc)).toFixed(-f.sc):v; }
      case 9: { const v=s32(d,o); return f.sc?+(v*Math.pow(10,f.sc)).toFixed(-f.sc):v; }
      case 11: return new DataView(d.buffer,d.byteOffset+o,4).getFloat32(0,true);
      case 12: case 13: return new DataView(d.buffer,d.byteOffset+o,8).getFloat64(0,true);
      case 14: return new Date(EPOCH+s32(d,o)*864e5).toISOString().slice(0,10);
      case 16: return new Date(EPOCH+s32(d,o)*864e5).toISOString().slice(0,10);
      case 19: { const v=Number(new DataView(d.buffer,d.byteOffset+o,8).getBigInt64(0,true)); return f.sc?v*Math.pow(10,f.sc):v; }
      default: return null; } }
    function table(name, cols){
      const rel=rels[name]; if(rel==null) return null; const fm=formats[rel]||{}, fn=fields[name]||{};
      const want=cols? cols.map(c=>Object.keys(fn).find(id=>fn[id]===c)) : Object.keys(fn);
      const out=[];
      { const p=first(rel); if(p) for(const r of F.records(p)){ const ds=fm[r.format]; if(!ds) continue; const d=r.data, o={};
        want.forEach((id,k)=>{ const nm=cols?cols[k]:fn[id]; if(id==null){o[nm]=null;return;} const f=ds[id]; if(!f||f.t===0){o[nm]=null;return;} const isNull=(d[id>>3]>>(id&7))&1; o[nm]=isNull?null:val(d,f); });
        out.push(o); } }
      return out;
    }
    return { rels, fields, formats, table, F };
  }

  var GEST = 283;
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  function P(s) { var a = s.split('-').map(Number); return Date.UTC(a[0], a[1] - 1, a[2]); }
  function diffDays(a, b) { return Math.round((P(a) - P(b)) / 864e5); }
  function addDays(s, n) { var d = new Date(P(s) + n * 864e5); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function fch(s) { s = s == null ? '' : String(s).slice(0, 10); return s > '1900-01-01' && s < '2100' ? s : null; }
  function tx(s) { return s == null ? '' : String(s).replace(/[\s ]+/g, ' ').trim(); }
  function nom(s) { s = tx(s); if (!s) return ''; return s.toLowerCase().replace(/(^|[\s.(\/-])([a-záéíóúñü])/g, function (m, a, b) { return a + b.toUpperCase(); }); }
  function frase(s) { s = tx(s).toLowerCase(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
  var cmp = function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; };
  var CODES = { 1: ['Preñada', 'Preñada', '2'], 2: ['Vacía', 'Vacía', '1'] };

  // ¿es una base de Firebird/InterBase? (página de encabezado, firma 12345, ODS 10 u 11)
  function es(buf) {
    if (!buf || buf.byteLength < 64) return false;
    var u = new Uint8Array(buf, 0, 64), ods = (u[18] | u[19] << 8) & 0x7fff;
    return u[0] === 1 && u[2] === 0x39 && u[3] === 0x30 && (ods === 10 || ods === 11);
  }
  // nombre del archivo: BDSIGEA_MARTIN LINDHOLM_2026_11_5.GDB → tambo "Martin Lindholm", 5/11/2026
  function infoFromName(name) {
    var s = String(name || '').replace(/\.[a-z0-9]+$/i, ''), m = /^BDSIGEA[_ -]+(.*?)[_ -]+(\d{4})[_ -](\d{1,2})[_ -](\d{1,2})$/i.exec(s), fecha = null, tambo = null;
    if (m) { if (+m[3] >= 1 && +m[3] <= 12 && +m[4] >= 1 && +m[4] <= 31) fecha = m[2] + '-' + pad(+m[3]) + '-' + pad(+m[4]); tambo = nom(m[1].replace(/_/g, ' ')); }
    else { m = /^BDSIGEA[_ -]+(.+)$/i.exec(s); if (m) tambo = nom(m[1].replace(/_/g, ' ')); }
    return { tambo: tambo, fecha: fecha };
  }

  // lactancia a partir de los controles (igual que con FOSAPP)
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

  function build(D, opts) {
    opts = opts || {};
    var T = function (n, cols) { return D.table(n, cols) || []; };
    var by = function (rows, k) { var o = {}; rows.forEach(function (r) { o[r[k]] = r; }); return o; };
    var grp = function (rows, k) { var o = {}; rows.forEach(function (r) { (o[r[k]] || (o[r[k]] = [])).push(r); }); return o; };
    var anim = T('A_ANIMAL', ['IDANIMAL', 'RP', 'TI_EXISTENCIA']);
    var cata = by(T('CATAANIMAL', ['IDCATALOGO', 'HEMBRA', 'NOMBREPROPIO', 'CARAVANAOFICIAL', 'SNIG', 'DESCARTADA']), 'IDCATALOGO');
    var nac = by(T('A_NACIMIENTO', ['IDCATALOGO', 'FECHA', 'IDMADRE', 'IDPADRE']), 'IDCATALOGO');
    var hemb = by(T('A_AHEMBRAS', ['IDHEMBRA', 'ENLACTANCIA', 'DESCARTE']), 'IDHEMBRA');
    var rep = {}; T('A_REPRODUCTOR', ['IDREPRODUCTOR', 'ALIASEA', 'IDANIMAL']).forEach(function (r) { var n = tx(r.ALIASEA); rep[r.IDREPRODUCTOR] = /^desconocido$/i.test(n) ? '' : n; });
    var rpDe = {}; anim.forEach(function (a) { rpDe[a.IDANIMAL] = tx(a.RP); });
    var pers = {}; T('CATAPERSO', ['IDCATALOGO', 'NOMBRE', 'ALIAS']).forEach(function (p) { pers[p.IDCATALOGO] = nom(p.NOMBRE || p.ALIAS); });
    var serv = by(T('A_SERVICIO', ['ID_CELO', 'IDREPRODUCTOR']), 'ID_CELO');
    var servPer = by(T('A_SERVICIO_PER', ['ID_CELO', 'IDPERSONA']), 'ID_CELO');
    var cria = grp(T('A_PARTOCRIA', ['ID_PARTO', 'TI_SEXO']), 'ID_PARTO');
    var servParto = by(T('A_R_SERVICIOPARTO', ['ID_CELO', 'ID_PARTO']), 'ID_PARTO');
    var celoById = {};
    var finLac = by(T('A_LACTANFIN', ['ID_PARTO', 'FECHA', 'TOTAL', 'GRASA', 'PROTEINA']), 'ID_PARTO');
    var lacHem = {}; T('A_LACTANCIA', ['ID_LACTANCIA', 'IDHEMBRA']).forEach(function (l) { lacHem[l.ID_LACTANCIA] = l.IDHEMBRA; });
    var sol = by(T('A_CIP_SOLIDOS', ['ID_CIP', 'GRASA', 'PROTEINA']), 'ID_CIP');
    var lotes = {}; T('EA_LOTE', ['ID_LOTE', 'NOMBRE']).forEach(function (l) { lotes[l.ID_LOTE] = tx(l.NOMBRE); });
    var loteAct = {}; T('A_LOTE', ['IDANIMAL', 'ID_LOTE', 'FECHA']).forEach(function (l) { var x = loteAct[l.IDANIMAL]; if (!x || (l.FECHA || '') >= (x.FECHA || '')) loteAct[l.IDANIMAL] = l; });
    var causaNom = {}; T('TI_ANIBAJCAUSA', ['TI_CAUSA', 'NOMBRE']).forEach(function (c) { causaNom[c.TI_CAUSA] = frase(c.NOMBRE); });
    var bajaCausa = by(T('A_ANIMAL_BAJACAUSA', ['ID_ANIMAL_BAJA', 'TI_CAUSA']), 'ID_ANIMAL_BAJA');
    var bajaDe = {}; T('A_ANIMAL_BAJA', ['ID_ANIMAL_BAJA', 'IDANIMAL', 'FECHA', 'TI_BAJA', 'DESCRIPCION']).forEach(function (b) { var x = bajaDe[b.IDANIMAL]; if (!x || (b.FECHA || '') >= (x.FECHA || '')) bajaDe[b.IDANIMAL] = b; });

    // historial por hembra
    var G = {}, maxF = '0000';
    var g = function (id) { return G[id] || (G[id] = { pa: [], ev: [], ta: [], la: [], ct: [], ab: [] }); };
    var esH = function (id) { var c = cata[id]; return c ? c.HEMBRA === 1 : !!hemb[id]; };
    T('A_CELO', ['ID_CELO', 'IDHEMBRA', 'FECHA']).forEach(function (c) {
      celoById[c.ID_CELO] = c; var f = fch(c.FECHA); if (!f || !esH(c.IDHEMBRA)) return; if (f > maxF) maxF = f;
      var s = serv[c.ID_CELO];
      if (s) { var ip = servPer[c.ID_CELO]; g(c.IDHEMBRA).ev.push([f, 'S', rep[s.IDREPRODUCTOR] || '', ip ? (pers[ip.IDPERSONA] || null) : null]); }
      else g(c.IDHEMBRA).ev.push([f, 'C', '', null]);
    });
    T('A_PARTO', ['ID_PARTO', 'IDHEMBRA', 'FECHA', 'NRO_LACTANCIA', 'ABORTO']).forEach(function (p) {
      var f = fch(p.FECHA); if (!f) return; if (f > maxF) maxF = f;
      var cr = cria[p.ID_PARTO] || [], sx = cr.map(function (c) { return c.TI_SEXO === 1 ? 'H' : c.TI_SEXO === 2 ? 'M' : ''; }).filter(Boolean);
      var sp = servParto[p.ID_PARTO], cs = sp && serv[sp.ID_CELO], fl = finLac[p.ID_PARTO];
      g(p.IDHEMBRA).pa.push([f, p.NRO_LACTANCIA || 0, p.ABORTO ? 'A' : sx.slice(0, 2).join('/'), cs ? (rep[cs.IDREPRODUCTOR] || '') : '', null, fl ? fch(fl.FECHA) : null, p.ID_PARTO]);
      if (p.ABORTO) g(p.IDHEMBRA).ab.push(f);
    });
    T('A_DIAGNOSTICO', ['IDHEMBRA', 'FECHA', 'TI_RESULTADO']).forEach(function (d) { var f = fch(d.FECHA); if (!f || !CODES[d.TI_RESULTADO]) return; if (f > maxF) maxF = f; g(d.IDHEMBRA).ta.push([f, d.TI_RESULTADO]); });
    T('A_CIP', ['ID_CIP', 'ID_LACTANCIA', 'FECHA', 'TOTALDIARIO']).forEach(function (c) {
      var f = fch(c.FECHA), h = lacHem[c.ID_LACTANCIA]; if (!f || h == null || !(c.TOTALDIARIO > 0)) return; if (f > maxF) maxF = f;
      var s = sol[c.ID_CIP]; g(h).ct.push([f, Math.round(c.TOTALDIARIO * 10) / 10, s && s.GRASA > 0 ? s.GRASA : null, s && s.PROTEINA > 0 ? s.PROTEINA : null, null]);
    });

    var info = infoFromName(opts.nombreArchivo);
    var ref = info.fecha && info.fecha >= maxF && diffDays(info.fecha, maxF) <= 90 ? info.fecha : maxF;
    var desdeHist = addDays(ref, -730);
    var porF = {};
    Object.keys(G).forEach(function (id) {
      var x = G[id]; x.pa.sort(cmp); x.ev.sort(cmp); x.ta.sort(cmp); x.ct.sort(cmp); x.ab.sort();
      // número de lactancia: el que anota SIGEA; si falta, se cuenta
      x.pa.forEach(function (p, i) { if (!p[1]) p[1] = i ? x.pa[i - 1][1] + 1 : 1; });
      x.pa.forEach(function (p, i) {
        var np = x.pa[i + 1], hastaF = np ? np[0] : '9999';
        var est = addDays(p[0], -GEST), best = null;
        x.ev.forEach(function (e) { if (e[1] !== 'S' || e[0] >= p[0]) return; var d = Math.abs(diffDays(e[0], est)); if (d <= 20 && (!best || d < best[1])) best = [e[0], d]; });
        p[4] = best ? best[0] : null;
        var fl = finLac[p[6]], fin = p[5] ? diffDays(p[5], p[0]) : np ? diffDays(np[0], p[0]) - 60 : null;
        var cs = x.ct.filter(function (c) { return c[0] > p[0] && c[0] < hastaF; });
        var L = lactancia(cs, p[0], fin != null && fin > 0 ? fin : null);
        // lactancia cerrada en SIGEA: el total y los sólidos que calculó el programa
        var tot = fl && fl.TOTAL > 0 ? Math.round(fl.TOTAL) : L ? L.total : null;
        if (tot) x.la.push([p[1], tot, L ? L.l305 : null, fl && fl.GRASA > 0 ? Math.round(fl.GRASA / fl.TOTAL * 1e4) / 100 : null, fl && fl.PROTEINA > 0 ? Math.round(fl.PROTEINA / fl.TOTAL * 1e4) / 100 : null, L ? L.n : cs.length]);
      });
      x.ct.forEach(function (c) {
        var lp = null; x.pa.forEach(function (p) { if (p[0] < c[0]) lp = p; });
        var y = porF[c[0]] || (porF[c[0]] = { v: 0, l: 0, d: 0, nd: 0 }); y.v++; y.l += c[1];
        if (lp) { y.d += diffDays(c[0], lp[0]); y.nd++; }
      });
      x.pa.forEach(function (p) { p.length = 6; });
      var n = x.pa.length, desde = n > 1 ? x.pa[n - 2][0] : n ? x.pa[0][0] : null;
      x.ctAll = x.ct; x.ct = desde ? x.ct.filter(function (c) { return c[0] >= desde; }) : [];
    });
    var ctrls = Object.keys(porF).sort().filter(function (f) { return porF[f].v >= 5; }).map(function (f) { var y = porF[f]; return [f, 0, y.v, Math.round(y.l), y.nd ? Math.round(y.d / y.nd) : null, null]; });

    var animales = [], hist = {}, bajas = [], vacio = { pa: [], ev: [], ta: [], la: [], ct: [], ab: [] };
    var pa2 = function (P) { return P.filter(function (p) { return !/^A/.test(p[2] || ''); }).map(function (p) { return [p[0], p[5] || null]; }); }, VL = [];
    anim.forEach(function (a) {
      var id = a.IDANIMAL; if (!esH(id)) return;
      var c = cata[id] || {}, x = G[id] || vacio, n0 = nac[id] || {}, fn = fch(n0.FECHA);
      var rp = tx(a.RP) || tx(c.CARAVANAOFICIAL) || tx(c.SNIG) || ('ID ' + id);
      var lp = x.pa.length ? x.pa[x.pa.length - 1] : null, lpf = lp ? lp[0] : '0000';
      var ma = n0.IDMADRE ? (rpDe[n0.IDMADRE] || null) : null, pd = n0.IDPADRE ? (rep[n0.IDPADRE] || rpDe[n0.IDPADRE] || null) : null;
      if (a.TI_EXISTENCIA !== 1) {
        var b = bajaDe[id]; if (!b) return; // nunca estuvo en el tambo
        var bF = fch(b.FECHA), bc = bajaCausa[b.ID_ANIMAL_BAJA]; if (x.pa.length) VL.push({ u: 0, pa: pa2(x.pa), baja: bF, activa: false, seca: false });
        var tipo = b.TI_BAJA === 1 ? 'venta' : b.TI_BAJA === 2 ? 'muerte' : 'baja';
        var causa = bc && causaNom[bc.TI_CAUSA] ? causaNom[bc.TI_CAUSA] : frase(b.DESCRIPCION) || null;
        var key = 'm' + id, cat = x.pa.length ? 'vaca' : 'vaquillona';
        bajas.push({ key: key, rp: rp, nombre: tx(c.NOMBREPROPIO) || null, cat: cat, u: 0, dFecha: null, bFecha: bF, bTipo: tipo, bCausa: causa && !/desconocid|sin diag/i.test(causa) ? causa : null });
        if (!bF || bF >= desdeHist) {
          var paB = x.pa.filter(function (p) { return p[0] >= desdeHist; }); if (!paB.length && x.pa.length) paB = [x.pa[x.pa.length - 1]];
          var dB = paB.length ? paB[0][0] : '0000', dE = function (e) { return e[0] >= dB; }, nros = paB.map(function (p) { return p[1]; });
          hist[key] = { mv: null, pa: paB, ev: x.ev.filter(dE), ta: x.ta.filter(dE), la: x.la.filter(function (l) { return nros.indexOf(l[0]) >= 0; }), ct: x.ct.filter(dE), ult: true, fn: fn, ma: ma, pd: pd, vit: null };
        } else hist[key] = { pa: [], ev: [], ta: [], la: [], ct: [], fn: fn, ma: ma, pd: pd, vit: null, corto: true };
        return;
      }
      var h = hemb[id], cat;
      if (lp) cat = (h ? h.ENLACTANCIA === 1 : !(lp[5] && lp[5] > lpf)) ? 'vaca' : 'seca';
      if (x.pa.length) VL.push({ u: 0, pa: pa2(x.pa), baja: null, activa: true, seca: cat === 'seca' });
      else cat = x.ev.some(function (e) { return e[1] === 'S'; }) || (fn && diffDays(ref, fn) >= 365) ? 'vaquillona' : 'ternera';
      var evs = x.ev.filter(function (e) { return e[0] > lpf; }), servs = evs.filter(function (e) { return e[1] === 'S'; });
      var le = evs.length ? evs[evs.length - 1] : null;
      var tas = x.ta.filter(function (t) { return t[0] >= lpf; }), lt = tas.length ? tas[tas.length - 1] : null;
      var cd = lt ? CODES[lt[1]] : null, res = cd ? cd[0] : null, preg = !!(cd && cd[2] === '2'), conc = null;
      if (preg) { var sv = servs.filter(function (e) { return e[0] <= lt[0]; }); conc = sv.length ? sv[sv.length - 1][0] : null; }
      var estado = preg ? 'prenada' : res ? 'vacia' : 'sin';
      if (estado !== 'prenada' && le && le[1] === 'S' && (!lt || le[0] > lt[0])) estado = 'servida';
      var curLac = null; x.la.forEach(function (l) { if (lp && l[0] === lp[1]) curLac = l; });
      var mejs = x.la.map(function (l) { return l[2] || l[1]; }).filter(Boolean);
      var pr = lp ? x.ct.filter(function (cc) { return cc[0] >= lpf; }).map(function (cc) { return cc[1]; }).reverse().slice(0, 10) : [];
      var desc = (h && h.DESCARTE) || c.DESCARTADA ? 'Descarte' : null;
      var lote = loteAct[id];
      animales.push({
        rp: rp, nombre: tx(c.NOMBREPROPIO) || null, cat: cat, edad: fn ? Math.round(diffDays(ref, fn) / 365.25 * 10) / 10 : null,
        rod: lote && lotes[lote.ID_LOTE] ? lotes[lote.ID_LOTE] : null, idElec: tx(c.SNIG) || null,
        pFecha: lp ? lp[0] : null, pN: lp ? lp[1] : null, r1: lp ? (lp[2].split('/')[0] || null) : null, r2: lp ? (lp[2].split('/')[1] || null) : null,
        sFecha: le ? le[0] : null, sN: le ? servs.length : null, toro: le ? (le[1] === 'C' ? 'Celo' : (le[2] || null)) : null,
        tFecha: lt ? lt[0] : null, result: res, partoProb: conc ? addDays(conc, GEST) : null, estado: estado,
        u: 0, dFecha: null, rech: desc, rechDet: null, pr: pr, celo: estado === 'prenada' && !!le && le[1] === 'C',
        dLac: lp && (cat === 'vaca' || cat === 'seca') ? diffDays(ref, lp[0]) : null,
        prodLts: curLac ? curLac[1] : null, mej: mejs.length ? Math.max.apply(null, mejs) : null
      });
      hist[rp] = { mv: null, ec: null, pa: x.pa, ev: x.ev, ta: x.ta, la: x.la, ct: x.ct, ab: x.ab, fn: fn, ma: ma, pd: pd, vit: null };
    });
    animales.sort(function (p, q) { return p.rp.localeCompare(q.rp, 'es', { numeric: true }); });
    bajas.sort(function (p, q) { return (q.bFecha || '') < (p.bFecha || '') ? -1 : 1; });
    var cc = {}; animales.forEach(function (x) { cc[x.cat] = (cc[x.cat] || 0) + 1; });
    return { vovsH: root.SysCaw && root.SysCaw.vovsHist ? root.SysCaw.vovsHist(VL, ref) : null, idProd: [], ctrls: ctrls, config: {}, animales: animales, bajas: bajas, hist: hist, codes: CODES, fecha: ref, desdeHist: desdeHist, tambo: info.tambo, conteoCat: cc, origen: 'sigea' };
  }

  function fromFile(buf, nombre) {
    return new Promise(function (ok, mal) {
      try {
        if (!es(buf)) throw new Error('El archivo no parece una base de SIGEA.');
        var D = db(buf);
        if (D.rels.A_ANIMAL == null || D.rels.A_PARTO == null) throw new Error('La base no tiene las tablas de SIGEA (A_ANIMAL, A_PARTO).');
        var d = build(D, { nombreArchivo: nombre });
        d.unidades = []; d.sel = null; d.unidadesSel = [];
        ok(d);
      } catch (e) { mal(e); }
    });
  }

  var api = { fromFile: fromFile, build: build, es: es, infoFromName: infoFromName, db: db };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Sigea = api;
})(typeof window !== 'undefined' ? window : this);
