/* Lector mínimo de tablas Paradox (.DB) — solo lectura */
(function (root) {
  'use strict';
  var CP850_HI = { 0xA4: 'ñ', 0xA5: 'Ñ', 0xA0: 'á', 0x82: 'é', 0xA1: 'í', 0xA2: 'ó', 0xA3: 'ú', 0x81: 'ü' };
  var dec1252 = (typeof TextDecoder !== 'undefined') ? new TextDecoder('windows-1252') : null;
  function decName(bytes) { var s = ''; for (var i = 0; i < bytes.length; i++) { var c = bytes[i]; s += c < 128 ? String.fromCharCode(c) : (CP850_HI[c] || '?'); } return s; }
  // días desde 01/01/0001 (día 1) -> 'YYYY-MM-DD'
  var EPOCH = Date.UTC(1, 0, 1) - 864e5; // Date.UTC trata año 1 como 1901, se corrige abajo
  function daysToISO(n) {
    var d = new Date(0); d.setUTCFullYear(1, 0, 1); d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + n - 1);
    var y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, dd = d.getUTCDate();
    return (y < 1000 ? ('000' + y).slice(-4) : y) + '-' + (m < 10 ? '0' : '') + m + '-' + (dd < 10 ? '0' : '') + dd;
  }
  function readTable(buf, opts) {
    opts = opts || {};
    var u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    var recSize = dv.getUint16(0, true), headSize = dv.getUint16(2, true);
    var blockSize = u8[5] * 1024, nFields = dv.getUint16(0x21, true), ver = u8[0x39];
    var fiOff = ver >= 5 ? 0x78 : 0x58;
    var types = [], sizes = [];
    for (var i = 0; i < nFields; i++) { types.push(u8[fiOff + i * 2]); sizes.push(u8[fiOff + i * 2 + 1]); }
    var p = fiOff + nFields * 2 + 4 + nFields * 4;
    p += ver >= 12 ? 261 : 79;
    var names = [];
    for (i = 0; i < nFields; i++) { var q = p; while (u8[q] !== 0 && q < headSize) q++; names.push(decName(u8.subarray(p, q))); p = q + 1; }
    var offs = [], o = 0; for (i = 0; i < nFields; i++) { offs.push(o); o += sizes[i]; }
    var want = opts.fields ? opts.fields.map(function (n) { var k = names.indexOf(n); if (k < 0) throw new Error('Campo ' + n + ' no existe'); return k; }) : names.map(function (_, k) { return k; });
    var rows = [], fileBlocks = dv.getUint16(0x0C, true);
    var blk = dv.getUint16(0x0E, true), seen = 0;
    var tmp = new DataView(new ArrayBuffer(8));
    while (blk && seen++ <= fileBlocks + 2) {
      var bo = headSize + (blk - 1) * blockSize;
      if (bo + 6 > u8.length) break;
      var next = dv.getUint16(bo, true), add = dv.getInt16(bo + 4, true);
      if (add >= 0) {
        var n = Math.floor(add / recSize) + 1;
        for (var r = 0; r < n; r++) {
          var ro = bo + 6 + r * recSize, row = opts.array ? new Array(want.length) : {};
          for (var w = 0; w < want.length; w++) {
            var f = want[w], fo = ro + offs[f], sz = sizes[f], t = types[f], v = null, j, allz;
            switch (t) {
              case 0x01: // alpha
                j = 0; while (j < sz && u8[fo + j] !== 0) j++;
                if (j) { v = dec1252 ? dec1252.decode(u8.subarray(fo, fo + j)) : decName(u8.subarray(fo, fo + j)); v = v.replace(/\s+$/, ''); if (!v) v = null; }
                break;
              case 0x02: case 0x04: case 0x16: // date, long, autoinc
                if (u8[fo] | u8[fo + 1] | u8[fo + 2] | u8[fo + 3]) {
                  var x = (((u8[fo] ^ 0x80) << 24) | (u8[fo + 1] << 16) | (u8[fo + 2] << 8) | u8[fo + 3]);
                  v = t === 0x02 ? (x > 0 ? daysToISO(x) : null) : x;
                }
                break;
              case 0x03: // short
                if (u8[fo] | u8[fo + 1]) { var s = ((u8[fo] ^ 0x80) << 8) | u8[fo + 1]; v = s & 0x8000 ? s - 0x10000 : s; }
                break;
              case 0x05: case 0x06: // money, number
                allz = true; for (j = 0; j < 8; j++) if (u8[fo + j]) { allz = false; break; }
                if (!allz) {
                  if (u8[fo] & 0x80) { tmp.setUint8(0, u8[fo] & 0x7F); for (j = 1; j < 8; j++) tmp.setUint8(j, u8[fo + j]); }
                  else { for (j = 0; j < 8; j++) tmp.setUint8(j, (~u8[fo + j]) & 0xFF); }
                  v = tmp.getFloat64(0, false);
                }
                break;
              case 0x09: // logical
                v = u8[fo] === 0 ? null : u8[fo] === 0x81; break;
              default: v = null; // blobs, time, bcd: no usados
            }
            if (opts.array) row[w] = v; else row[names[f]] = v;
          }
          rows.push(row);
        }
      }
      blk = next;
    }
    return { names: opts.fields || names, rows: rows, total: dv.getUint32(6, true) };
  }
  var api = { readTable: readTable, daysToISO: daysToISO };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Paradox = api;
})(typeof window !== 'undefined' ? window : this);
