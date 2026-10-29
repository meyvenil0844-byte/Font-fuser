
// Polyfill for DataView bounds checking to prevent "Offset is outside the bounds of the DataView"
function installDataViewSafetyPolyfill() {
  if (typeof globalThis === 'undefined') return;
  const OriginalDataView = globalThis.DataView;
  if (!OriginalDataView || OriginalDataView.__isPatched) return;

  function SafeDataView(buffer, byteOffset = 0, byteLength) {
    if (!(buffer instanceof ArrayBuffer) && !(typeof SharedArrayBuffer !== 'undefined' && buffer instanceof SharedArrayBuffer)) {
      try {
        if (buffer && buffer.buffer instanceof ArrayBuffer) {
          byteOffset = (buffer.byteOffset || 0) + (byteOffset || 0);
          buffer = buffer.buffer;
        } else {
          buffer = new ArrayBuffer(0);
        }
      } catch (e) {
        buffer = new ArrayBuffer(0);
      }
    }
    const maxLen = buffer.byteLength;
    const safeOffset = Math.max(0, Math.min(byteOffset || 0, maxLen));
    let safeLength = byteLength === undefined ? (maxLen - safeOffset) : byteLength;
    if (safeLength < 0 || safeOffset + safeLength > maxLen) {
      safeLength = Math.max(0, maxLen - safeOffset);
    }
    return new OriginalDataView(buffer, safeOffset, safeLength);
  }

  SafeDataView.prototype = OriginalDataView.prototype;
  Object.setPrototypeOf(SafeDataView, OriginalDataView);
  SafeDataView.__isPatched = true;
  globalThis.DataView = SafeDataView;

  const getters = [
    { name: 'getInt8', size: 1, def: 0 },
    { name: 'getUint8', size: 1, def: 0 },
    { name: 'getInt16', size: 2, def: 0 },
    { name: 'getUint16', size: 2, def: 0 },
    { name: 'getInt32', size: 4, def: 0 },
    { name: 'getUint32', size: 4, def: 0 },
    { name: 'getFloat32', size: 4, def: 0 },
    { name: 'getFloat64', size: 8, def: 0 },
    { name: 'getBigInt64', size: 8, def: 0n },
    { name: 'getBigUint64', size: 8, def: 0n }
  ];

  for (const { name, size, def } of getters) {
    const orig = OriginalDataView.prototype[name];
    if (typeof orig === 'function') {
      OriginalDataView.prototype[name] = function(offset, littleEndian) {
        if (typeof offset !== 'number' || offset < 0 || offset + size > this.byteLength) {
          return def;
        }
        try {
          return orig.call(this, offset, littleEndian);
        } catch (e) {
          return def;
        }
      };
    }
  }

  const setters = [
    { name: 'setInt8', size: 1 },
    { name: 'setUint8', size: 1 },
    { name: 'setInt16', size: 2 },
    { name: 'setUint16', size: 2 },
    { name: 'setInt32', size: 4 },
    { name: 'setUint32', size: 4 },
    { name: 'setFloat32', size: 4 },
    { name: 'setFloat64', size: 8 },
    { name: 'setBigInt64', size: 8 },
    { name: 'setBigUint64', size: 8 }
  ];

  for (const { name, size } of setters) {
    const orig = OriginalDataView.prototype[name];
    if (typeof orig === 'function') {
      OriginalDataView.prototype[name] = function(offset, val, littleEndian) {
        if (typeof offset !== 'number' || offset < 0 || offset + size > this.byteLength) {
          return;
        }
        try {
          orig.call(this, offset, val, littleEndian);
        } catch (e) {}
      };
    }
  }
}
installDataViewSafetyPolyfill();

function extractSubfontFromTtc(arrayBuffer, preferredSubfontName) {
  if (!arrayBuffer || arrayBuffer.byteLength < 16) return arrayBuffer;
  const view = new DataView(arrayBuffer);
  if (view.getUint32(0, false) !== 0x74746366) return arrayBuffer;

  const numFonts = view.getUint32(8, false);
  if (numFonts <= 0) return arrayBuffer;

  const fontOffsets = [];
  for (let i = 0; i < numFonts; i++) {
    const off = view.getUint32(12 + i * 4, false);
    if (off + 12 <= arrayBuffer.byteLength) fontOffsets.push(off);
  }
  if (fontOffsets.length === 0) return arrayBuffer;

  const getSubfontName = (sfntOff) => {
    try {
      const numTables = view.getUint16(sfntOff + 4, false);
      let nameTableOff = 0;
      for (let t = 0; t < numTables; t++) {
        const rec = sfntOff + 12 + t * 16;
        if (rec + 16 > arrayBuffer.byteLength) break;
        const tag = String.fromCharCode(view.getUint8(rec), view.getUint8(rec + 1), view.getUint8(rec + 2), view.getUint8(rec + 3));
        if (tag === 'name') {
          nameTableOff = view.getUint32(rec + 8, false);
          break;
        }
      }
      if (nameTableOff > 0 && nameTableOff + 6 <= arrayBuffer.byteLength) {
        const count = view.getUint16(nameTableOff + 2, false);
        const stringOffset = nameTableOff + view.getUint16(nameTableOff + 4, false);
        let bestName = '';
        for (let k = 0; k < count; k++) {
          const nr = nameTableOff + 6 + k * 12;
          if (nr + 12 > arrayBuffer.byteLength) break;
          const nameId = view.getUint16(nr + 6, false);
          if (nameId === 1 || nameId === 4) {
            const len = view.getUint16(nr + 8, false);
            const strOff = stringOffset + view.getUint16(nr + 10, false);
            if (strOff + len <= arrayBuffer.byteLength && len > 0) {
              const b = new Uint8Array(arrayBuffer, strOff, len);
              let s = '';
              if (b.length >= 2 && b[0] === 0) {
                for (let j = 1; j < b.length; j += 2) s += String.fromCharCode(b[j]);
              } else {
                try { s = Buffer.from(b).toString('utf8'); } catch { s = ''; }
              }
              s = s.trim();
              if (s) {
                if (nameId === 4) return s;
                if (!bestName) bestName = s;
              }
            }
          }
        }
        return bestName;
      }
    } catch {}
    return '';
  };

  let selectedIndex = 0;
  if (preferredSubfontName && fontOffsets.length > 1) {
    const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const targetNorm = norm(preferredSubfontName);
    let bestScore = -1;
    for (let i = 0; i < fontOffsets.length; i++) {
      const name = getSubfontName(fontOffsets[i]);
      const subNorm = norm(name);
      let score = 0;
      if (subNorm === targetNorm) score = 100;
      else if (subNorm && targetNorm && subNorm.includes(targetNorm)) score = 80;
      else if (subNorm && targetNorm && targetNorm.includes(subNorm)) score = 70;
      else if (targetNorm.includes('tc') && (subNorm.includes('tc') || subNorm.includes('traditional'))) score = 90;
      else if (targetNorm.includes('sc') && (subNorm.includes('sc') || subNorm.includes('simplified'))) score = 90;
      else if (targetNorm.includes('hk') && subNorm.includes('hk')) score = 90;
      if (score > bestScore) {
        bestScore = score;
        selectedIndex = i;
      }
    }
  }

  const sfntOffset = fontOffsets[selectedIndex];
  if (sfntOffset + 12 > arrayBuffer.byteLength) return arrayBuffer;
  const numTables = view.getUint16(sfntOffset + 4, false);
  const headerLen = 12 + numTables * 16;
  if (sfntOffset + headerLen > arrayBuffer.byteLength) return arrayBuffer;

  const tables = [];
  let totalDataLength = 0;
  for (let t = 0; t < numTables; t++) {
    const rec = sfntOffset + 12 + t * 16;
    const tagBytes = new Uint8Array(arrayBuffer, rec, 4);
    const checkSum = view.getUint32(rec + 4, false);
    const origOffset = view.getUint32(rec + 8, false);
    const length = view.getUint32(rec + 12, false);
    if (origOffset + length > arrayBuffer.byteLength) continue;
    tables.push({ tag: tagBytes, checkSum, origOffset, length });
    totalDataLength += ((length + 3) & ~3);
  }

  const outSize = 12 + tables.length * 16 + totalDataLength;
  const outBuf = new ArrayBuffer(outSize);
  const outBytes = new Uint8Array(outBuf);
  const outView = new DataView(outBuf);

  outBytes.set(new Uint8Array(arrayBuffer, sfntOffset, 12), 0);
  outView.setUint16(4, tables.length, false);

  let currentDataOffset = 12 + tables.length * 16;
  for (let t = 0; t < tables.length; t++) {
    const tbl = tables[t];
    const recOffset = 12 + t * 16;
    outBytes.set(tbl.tag, recOffset);
    outView.setUint32(recOffset + 4, tbl.checkSum, false);
    outView.setUint32(recOffset + 8, currentDataOffset, false);
    outView.setUint32(recOffset + 12, tbl.length, false);
    outBytes.set(new Uint8Array(arrayBuffer, tbl.origOffset, tbl.length), currentDataOffset);
    currentDataOffset += ((tbl.length + 3) & ~3);
  }

  return outBuf;
}

process.on('uncaughtException', (err) => {
  console.error('[Worker uncaughtException]', err);
  if (process.send) {
    try {
      process.send({ type: 'error', message: err.message || String(err), stack: err.stack });
    } catch (e) {}
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Worker unhandledRejection]', reason);
  if (process.send) {
    try {
      process.send({ type: 'error', message: String(reason) });
    } catch (e) {}
  }
  process.exit(1);
});

// Polyfill for Function.prototype.apply to prevent "Maximum call stack size exceeded"
if (typeof Function !== 'undefined') {
  const originalApply = Function.prototype.apply;
  Function.prototype.apply = function(thisArg, argsArray) {
    if (argsArray && argsArray.length > 5000) {
      const fn = this;
      if (fn === Array.prototype.push) {
        for (let i = 0; i < argsArray.length; i += 5000) {
          const chunk = Array.prototype.slice.call(argsArray, i, i + 5000);
          originalApply.call(fn, thisArg, chunk);
        }
        return thisArg.length;
      }
      if (fn === Math.min) {
        let min = Infinity;
        for (let i = 0; i < argsArray.length; i++) {
          if (argsArray[i] < min) min = argsArray[i];
        }
        return min;
      }
      if (fn === Math.max) {
        let max = -Infinity;
        for (let i = 0; i < argsArray.length; i++) {
          if (argsArray[i] > max) max = argsArray[i];
        }
        return max;
      }
      if (fn === String.fromCharCode) {
        let str = "";
        for (let i = 0; i < argsArray.length; i += 5000) {
          const chunk = Array.prototype.slice.call(argsArray, i, i + 5000);
          str += originalApply.call(fn, thisArg, chunk);
        }
        return str;
      }
    }
    return originalApply.call(this, thisArg, argsArray);
  };
}


const opentype = require('opentype.js');
const fs = require('fs');
const path = require('path');

function sanitizeGlyphName(name, cp, index) {
  if (index === 0) return '.notdef';
  if (cp === 0) return '.null';
  if (name && typeof name === 'string') {
    const clean = name.replace(/[^a-zA-Z0-9_.]/g, '');
    if (clean.length > 0 && clean.length <= 31 && clean !== '.notdef') {
      return clean;
    }
  }
  if (typeof cp === 'number' && !isNaN(cp) && cp >= 0) {
    if (cp <= 0xFFFF) {
      return 'uni' + cp.toString(16).toUpperCase().padStart(4, '0');
    } else {
      return 'u' + cp.toString(16).toUpperCase();
    }
  }
  return 'glyph' + index;
}

function scalePath(path, scale, isCFF) {
  const newPath = new opentype.Path();
  if (!path) return newPath;
  let commands = [];
  if (Array.isArray(path.commands)) {
    commands = path.commands;
  } else if (typeof path.getPath === 'function') {
    try {
      const p = path.getPath();
      if (p && Array.isArray(p.commands)) commands = p.commands;
    } catch(e) {}
  }
  const s = (typeof scale === 'number' && isFinite(scale) && scale > 0) ? scale : 1.0;
  const num = (v) => (typeof v === 'number' && isFinite(v)) ? v : 0;

  for (const cmd of commands) {
    if (!cmd || typeof cmd.type !== 'string') continue;
    const type = cmd.type.toUpperCase();
    if (type === 'M') {
      newPath.moveTo(Math.round(num(cmd.x) * s), Math.round(num(cmd.y) * s));
    } else if (type === 'L') {
      newPath.lineTo(Math.round(num(cmd.x) * s), Math.round(num(cmd.y) * s));
    } else if (type === 'Q') {
      newPath.quadraticCurveTo(
        Math.round(num(cmd.x1) * s), Math.round(num(cmd.y1) * s),
        Math.round(num(cmd.x) * s), Math.round(num(cmd.y) * s)
      );
    } else if (type === 'C') {
      newPath.curveTo(
        Math.round(num(cmd.x1) * s), Math.round(num(cmd.y1) * s),
        Math.round(num(cmd.x2) * s), Math.round(num(cmd.y2) * s),
        Math.round(num(cmd.x) * s), Math.round(num(cmd.y) * s)
      );
    } else if (type === 'Z') {
      newPath.close();
    }
  }
  return newPath;
}

function normalizeCaretPath(path, advanceWidth, unitsPerEm) {
  const em = (typeof unitsPerEm === 'number' && isFinite(unitsPerEm) && unitsPerEm > 0) ? unitsPerEm : 1000;
  const num = (v) => (typeof v === 'number' && isFinite(v)) ? v : 0;

  const targetHeight = Math.round(em * 0.38);
  const targetWidth = Math.round(em * 0.40);
  const targetTop = Math.round(em * 0.70);
  const targetAdvWidth = Math.round(em * 0.50);

  if (!path || !Array.isArray(path.commands) || path.commands.length === 0) {
    const newPath = new opentype.Path();
    const halfW = Math.round(targetWidth / 2);
    const midX = Math.round(targetAdvWidth / 2);
    const strokeW = Math.round(em * 0.055);
    newPath.moveTo(midX, targetTop);
    newPath.lineTo(midX + halfW, targetTop - targetHeight);
    newPath.lineTo(midX + halfW - Math.round(strokeW * 0.8), targetTop - targetHeight);
    newPath.lineTo(midX, targetTop - Math.round(strokeW * 1.3));
    newPath.lineTo(midX - halfW + Math.round(strokeW * 0.8), targetTop - targetHeight);
    newPath.lineTo(midX - halfW, targetTop - targetHeight);
    newPath.close();
    return { path: newPath, advanceWidth: targetAdvWidth };
  }

  let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
  for (const cmd of path.commands) {
    if (cmd && cmd.type !== 'Z') {
      const cx = num(cmd.x);
      const cy = num(cmd.y);
      if (cx < xMin) xMin = cx; if (cx > xMax) xMax = cx;
      if (cy < yMin) yMin = cy; if (cy > yMax) yMax = cy;
      if (cmd.x1 !== undefined) {
        const cx1 = num(cmd.x1);
        if (cx1 < xMin) xMin = cx1; if (cx1 > xMax) xMax = cx1;
      }
      if (cmd.y1 !== undefined) {
        const cy1 = num(cmd.y1);
        if (cy1 < yMin) yMin = cy1; if (cy1 > yMax) yMax = cy1;
      }
    }
  }

  if (!isFinite(xMin) || !isFinite(yMin) || !isFinite(xMax) || !isFinite(yMax) || xMax <= xMin || yMax <= yMin) {
    const newPath = new opentype.Path();
    const halfW = Math.round(targetWidth / 2);
    const midX = Math.round(targetAdvWidth / 2);
    const strokeW = Math.round(em * 0.055);
    newPath.moveTo(midX, targetTop);
    newPath.lineTo(midX + halfW, targetTop - targetHeight);
    newPath.lineTo(midX + halfW - Math.round(strokeW * 0.8), targetTop - targetHeight);
    newPath.lineTo(midX, targetTop - Math.round(strokeW * 1.3));
    newPath.lineTo(midX - halfW + Math.round(strokeW * 0.8), targetTop - targetHeight);
    newPath.lineTo(midX - halfW, targetTop - targetHeight);
    newPath.close();
    return { path: newPath, advanceWidth: targetAdvWidth };
  }

  const curHeight = yMax - yMin;
  const curWidth = xMax - xMin;

  let scale = Math.min(targetWidth / curWidth, targetHeight / curHeight);
  if (!isFinite(scale) || scale <= 0) scale = 1;
  let scaleX = scale;
  let scaleY = scale;
  const aspect = curWidth / curHeight;
  if (aspect > 1.8) {
    scaleY = targetHeight / curHeight;
    scaleX = Math.min(targetWidth / curWidth, scaleY * 0.6);
  } else if (aspect < 0.6) {
    scaleX = targetWidth / curWidth;
    scaleY = Math.min(targetHeight / curHeight, scaleX * 0.6);
  }
  if (!isFinite(scaleX) || scaleX <= 0) scaleX = 1;
  if (!isFinite(scaleY) || scaleY <= 0) scaleY = 1;

  const newW = curWidth * scaleX;
  const newH = curHeight * scaleY;
  const targetBottom = targetTop - newH;
  const finalAdvWidth = Math.max(targetAdvWidth, Math.round(newW + em * 0.10));
  const targetLeft = Math.round((finalAdvWidth - newW) / 2);

  const newPath = new opentype.Path();
  for (const cmd of path.commands) {
    if (!cmd || typeof cmd.type !== 'string') continue;
    if (cmd.type === 'M') {
      newPath.moveTo(Math.round(targetLeft + (num(cmd.x) - xMin) * scaleX), Math.round(targetBottom + (num(cmd.y) - yMin) * scaleY));
    } else if (cmd.type === 'L') {
      newPath.lineTo(Math.round(targetLeft + (num(cmd.x) - xMin) * scaleX), Math.round(targetBottom + (num(cmd.y) - yMin) * scaleY));
    } else if (cmd.type === 'Q') {
      newPath.quadraticCurveTo(
        Math.round(targetLeft + (num(cmd.x1) - xMin) * scaleX), Math.round(targetBottom + (num(cmd.y1) - yMin) * scaleY),
        Math.round(targetLeft + (num(cmd.x) - xMin) * scaleX), Math.round(targetBottom + (num(cmd.y) - yMin) * scaleY)
      );
    } else if (cmd.type === 'C') {
      newPath.curveTo(
        Math.round(targetLeft + (num(cmd.x1) - xMin) * scaleX), Math.round(targetBottom + (num(cmd.y1) - yMin) * scaleY),
        Math.round(targetLeft + (num(cmd.x2) - xMin) * scaleX), Math.round(targetBottom + (num(cmd.y2) - yMin) * scaleY),
        Math.round(targetLeft + (num(cmd.x) - xMin) * scaleX), Math.round(targetBottom + (num(cmd.y) - yMin) * scaleY)
      );
    } else if (cmd.type === 'Z') {
      newPath.close();
    }
  }
  return { path: newPath, advanceWidth: finalAdvWidth };
}

const normalizeCaratPath = normalizeCaretPath;

function generateFixedTatweelGlyph(unitsPerEm) {
  const em = unitsPerEm || 1000;
  const advanceWidth = Math.round(em * 0.50); // 500
  const yBottom = -Math.round(em * 0.025); // -25
  const yTop = Math.round(em * 0.085); // +85
  const p = new opentype.Path();
  p.moveTo(0, yBottom);
  p.lineTo(advanceWidth, yBottom);
  p.lineTo(advanceWidth, yTop);
  p.lineTo(0, yTop);
  p.close();
  return { path: p, advanceWidth: advanceWidth };
}

function generateCombiningLongSolidusOverlay(unitsPerEm) {
  const em = unitsPerEm || 1000;
  const p = new opentype.Path();
  const halfThick = Math.round(em * 0.028); // ~28 units (stroke ~56 units)
  const x1 = Math.round(-em * 0.52);
  const y1 = Math.round(-em * 0.08);
  const x2 = Math.round(-em * 0.08);
  const y2 = Math.round(+em * 0.72);
  
  p.moveTo(x1 - halfThick, y1);
  p.lineTo(x2 - halfThick, y2);
  p.lineTo(x2 + halfThick, y2);
  p.lineTo(x1 + halfThick, y1);
  p.close();
  
  return { path: p, advanceWidth: 0 };
}

function normalizeCombiningOverlayPath(path, advanceWidth, unitsPerEm) {
  const em = unitsPerEm || 1000;
  if (!path || !path.commands || path.commands.length === 0) {
    return generateCombiningLongSolidusOverlay(em);
  }
  
  let minX = Infinity, maxX = -Infinity;
  for (const cmd of path.commands) {
    if (cmd.x !== undefined) {
      if (cmd.x < minX) minX = cmd.x;
      if (cmd.x > maxX) maxX = cmd.x;
    }
  }
  
  if (minX === Infinity || maxX === -Infinity) {
    return generateCombiningLongSolidusOverlay(em);
  }
  
  const midX = (minX + maxX) / 2;
  const targetMidX = -Math.round(em * 0.30);
  const shiftX = targetMidX - midX;
  
  const newPath = new opentype.Path();
  for (const cmd of path.commands) {
    const newCmd = { ...cmd };
    if (newCmd.x !== undefined) newCmd.x += shiftX;
    if (newCmd.x1 !== undefined) newCmd.x1 += shiftX;
    if (newCmd.x2 !== undefined) newCmd.x2 += shiftX;
    newPath.commands.push(newCmd);
  }
  
  return { path: newPath, advanceWidth: 0 };
}

const NEGATED_MATH_MAP = {
  0x2284: 0x2282, // ⊄ (not subset) -> ⊂ (subset)
  0x2288: 0x2286, // ⊈ (not subset or equal) -> ⊆ (subset or equal)
  0x2285: 0x2283, // ⊅ (not superset) -> ⊃ (superset)
  0x2289: 0x2287, // ⊉ (not superset or equal) -> ⊇ (superset or equal)
  0x2260: 0x003D, // ≠ (not equal) -> = (equal)
  0x2262: 0x2261, // ≢ (not identical) -> ≡ (identical)
  0x2209: 0x2208, // ∉ (not element of) -> ∈ (element of)
  0x220C: 0x220B, // ∌ (does not contain) -> ∋ (contains)
  0x2224: 0x2223, // ∤ (does not divide) -> ∣ (divides)
  0x2226: 0x2225, // ∦ (not parallel) -> ∥ (parallel)
  0x2241: 0x223C, // ≁ (not tilde) -> ∼ (tilde)
  0x2244: 0x2243, // ≄ -> ≃
  0x2247: 0x2245, // ≇ -> ≅
  0x2249: 0x2248, // ≉ -> ≈
  0x226D: 0x224D, // ≭ -> ≍
  0x226E: 0x003C, // ≮ -> <
  0x226F: 0x003E, // ≯ -> >
  0x2270: 0x2264, // ≰ -> ≤
  0x2271: 0x2265, // ≱ -> ≥
};

const SHARED_CFF_BUF = Buffer.allocUnsafe(131072);

function writeCffNumber(buf, pos, v) {
  v = Math.round(v);
  if (v >= -107 && v <= 107) {
    buf[pos++] = (v + 139) & 255;
  } else if (v >= 108 && v <= 1131) {
    v = v - 108;
    buf[pos++] = ((v >> 8) + 247) & 255;
    buf[pos++] = v & 255;
  } else if (v >= -1131 && v <= -108) {
    v = -v - 108;
    buf[pos++] = ((v >> 8) + 251) & 255;
    buf[pos++] = v & 255;
  } else if (v >= -32768 && v <= 32767) {
    buf[pos++] = 28;
    buf[pos++] = (v >> 8) & 255;
    buf[pos++] = v & 255;
  } else {
    buf[pos++] = 29;
    buf[pos++] = (v >> 24) & 255;
    buf[pos++] = (v >> 16) & 255;
    buf[pos++] = (v >> 8) & 255;
    buf[pos++] = v & 255;
  }
  return pos;
}

function fastEncodeCharStringAndMetrics(glyph) {
  if (glyph._rawCharString && glyph._cachedMetrics) {
    return { rawCharString: glyph._rawCharString, metrics: glyph._cachedMetrics };
  }

  const advW = typeof glyph.advanceWidth === 'number' && isFinite(glyph.advanceWidth) ? Math.round(glyph.advanceWidth) : 500;
  let path = null;
  try {
    if (typeof glyph.path === 'function') path = glyph.path();
    else if (glyph.path) path = glyph.path;
    else if (typeof glyph.getPath === 'function') path = glyph.getPath();
  } catch (e) {}

  const commands = path && Array.isArray(path.commands) ? path.commands : [];
  if (commands.length === 0) {
    let pos = 0;
    pos = writeCffNumber(SHARED_CFF_BUF, pos, advW);
    SHARED_CFF_BUF[pos++] = 14; // endchar
    const rawCharString = Buffer.from(SHARED_CFF_BUF.subarray(0, pos));
    const lsb = glyph.leftSideBearing !== undefined ? glyph.leftSideBearing : 0;
    const metrics = { xMin: 0, yMin: 0, xMax: 0, yMax: 0, leftSideBearing: lsb, rightSideBearing: advW };
    glyph._rawCharString = rawCharString;
    glyph._cachedMetrics = metrics;
    return { rawCharString, metrics };
  }

  let buf = SHARED_CFF_BUF;
  const maxNeeded = commands.length * 36 + 32;
  if (maxNeeded > buf.length) {
    buf = Buffer.allocUnsafe(maxNeeded);
  }

  let pos = 0;
  pos = writeCffNumber(buf, pos, advW);

  let x = 0;
  let y = 0;
  let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
  const num = (v) => (typeof v === 'number' && isFinite(v)) ? v : 0;

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i];
    if (!cmd) continue;

    if (cmd.type === 'M') {
      const cx = Math.round(num(cmd.x));
      const cy = Math.round(num(cmd.y));
      if (cx < xMin) xMin = cx; if (cx > xMax) xMax = cx;
      if (cy < yMin) yMin = cy; if (cy > yMax) yMax = cy;

      pos = writeCffNumber(buf, pos, cx - x);
      pos = writeCffNumber(buf, pos, cy - y);
      buf[pos++] = 21; // rmoveto
      x = cx;
      y = cy;
    } else if (cmd.type === 'L') {
      const cx = Math.round(num(cmd.x));
      const cy = Math.round(num(cmd.y));
      if (cx < xMin) xMin = cx; if (cx > xMax) xMax = cx;
      if (cy < yMin) yMin = cy; if (cy > yMax) yMax = cy;

      pos = writeCffNumber(buf, pos, cx - x);
      pos = writeCffNumber(buf, pos, cy - y);
      buf[pos++] = 5; // rlineto
      x = cx;
      y = cy;
    } else if (cmd.type === 'C') {
      const cx1 = Math.round(cmd.x1);
      const cy1 = Math.round(cmd.y1);
      const cx2 = Math.round(cmd.x2);
      const cy2 = Math.round(cmd.y2);
      const cx = Math.round(cmd.x);
      const cy = Math.round(cmd.y);

      if (cx1 < xMin) xMin = cx1; if (cx1 > xMax) xMax = cx1;
      if (cy1 < yMin) yMin = cy1; if (cy1 > yMax) yMax = cy1;
      if (cx2 < xMin) xMin = cx2; if (cx2 > xMax) xMax = cx2;
      if (cy2 < yMin) yMin = cy2; if (cy2 > yMax) yMax = cy2;
      if (cx < xMin) xMin = cx; if (cx > xMax) xMax = cx;
      if (cy < yMin) yMin = cy; if (cy > yMax) yMax = cy;

      pos = writeCffNumber(buf, pos, cx1 - x);
      pos = writeCffNumber(buf, pos, cy1 - y);
      pos = writeCffNumber(buf, pos, cx2 - cx1);
      pos = writeCffNumber(buf, pos, cy2 - cy1);
      pos = writeCffNumber(buf, pos, cx - cx2);
      pos = writeCffNumber(buf, pos, cy - cy2);
      buf[pos++] = 8; // rrcurveto
      x = cx;
      y = cy;
    } else if (cmd.type === 'Q') {
      const qx1 = cmd.x1;
      const qy1 = cmd.y1;
      const qx = cmd.x;
      const qy = cmd.y;

      const cx1 = Math.round(x + (2 / 3) * (qx1 - x));
      const cy1 = Math.round(y + (2 / 3) * (qy1 - y));
      const cx2 = Math.round(qx + (2 / 3) * (qx1 - qx));
      const cy2 = Math.round(qy + (2 / 3) * (qy1 - qy));
      const cx = Math.round(qx);
      const cy = Math.round(qy);

      if (cx1 < xMin) xMin = cx1; if (cx1 > xMax) xMax = cx1;
      if (cy1 < yMin) yMin = cy1; if (cy1 > yMax) yMax = cy1;
      if (cx2 < xMin) xMin = cx2; if (cx2 > xMax) xMax = cx2;
      if (cy2 < yMin) yMin = cy2; if (cy2 > yMax) yMax = cy2;
      if (cx < xMin) xMin = cx; if (cx > xMax) xMax = cx;
      if (cy < yMin) yMin = cy; if (cy > yMax) yMax = cy;

      pos = writeCffNumber(buf, pos, cx1 - x);
      pos = writeCffNumber(buf, pos, cy1 - y);
      pos = writeCffNumber(buf, pos, cx2 - cx1);
      pos = writeCffNumber(buf, pos, cy2 - cy1);
      pos = writeCffNumber(buf, pos, cx - cx2);
      pos = writeCffNumber(buf, pos, cy - cy2);
      buf[pos++] = 8; // rrcurveto
      x = cx;
      y = cy;
    }
  }

  buf[pos++] = 14; // endchar

  if (!isFinite(xMin)) { xMin = 0; xMax = 0; yMin = 0; yMax = 0; }
  const lsb = glyph.leftSideBearing !== undefined ? glyph.leftSideBearing : xMin;
  const metrics = {
    xMin,
    yMin,
    xMax,
    yMax,
    leftSideBearing: lsb,
    rightSideBearing: advW - xMax
  };

  const rawCharString = Buffer.from(buf.subarray(0, pos));
  glyph._rawCharString = rawCharString;
  glyph._cachedMetrics = metrics;
  return { rawCharString, metrics };
}

process.on('message', (workerData) => {
try {
  let { glyphMap, baseFontId, serverFontIds, uploadDir } = workerData;
  const os = require('os');
  const defaultUploadDir = path.join(os.tmpdir ? os.tmpdir() : '/tmp', 'fontfuser-uploads');
  uploadDir = uploadDir || defaultUploadDir;
  if (!fs.existsSync(uploadDir)) {
    try { fs.mkdirSync(uploadDir, { recursive: true }); } catch (e) {}
  }

  process.send({ type: 'progress', percent: 10, message: 'Parsing base font and glyph mappings...' });
  
  let baseFontParsed = null;
  const baseServerFilename = serverFontIds[baseFontId];
  if (!baseServerFilename) throw new Error("Base font missing");
  let baseFilePath = path.join(uploadDir, baseServerFilename);
  if (!fs.existsSync(baseFilePath)) {
    const pPath = path.join(process.cwd(), 'user_fonts', baseServerFilename);
    if (fs.existsSync(pPath)) baseFilePath = pPath;
  }
  if (!fs.existsSync(baseFilePath)) throw new Error("Base font file missing");
  {
    let buffer = fs.readFileSync(baseFilePath);
    let ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    if (ab.byteLength >= 4 && new DataView(ab).getUint32(0, false) === 0x74746366) {
      ab = extractSubfontFromTtc(ab, baseServerFilename);
    }
    baseFontParsed = opentype.parse(ab);
    buffer = null;
    ab = null;
    if (typeof global.gc === 'function') global.gc();
  }
  
  // Cache for target fonts to avoid memory bloat
  let parsedFontsCache = new Map();
  const MAX_CACHE = 1;
  
  function getTargetFont(clientId) {
    if (clientId === baseFontId && baseFontParsed) return baseFontParsed;
    if (parsedFontsCache.has(clientId)) return parsedFontsCache.get(clientId);
    let serverFilename = serverFontIds[clientId];
    if (!serverFilename && typeof clientId === 'string') {
      if (clientId.endsWith('.ttf') || clientId.endsWith('.otf') || clientId.endsWith('.ttc')) {
        serverFilename = clientId;
      }
    }
    if (!serverFilename) return null;
    let filePath = path.join(uploadDir, serverFilename);
    if (!fs.existsSync(filePath)) {
      const pPath = path.join(process.cwd(), 'user_fonts', serverFilename);
      if (fs.existsSync(pPath)) filePath = pPath;
    }
    if (!fs.existsSync(filePath)) return null;
    
    try {
      let buffer = fs.readFileSync(filePath);
      let ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      if (ab.byteLength >= 4 && new DataView(ab).getUint32(0, false) === 0x74746366) {
        try {
          ab = extractSubfontFromTtc(ab, serverFilename);
        } catch (te) {}
      }
      const font = opentype.parse(ab);
      buffer = null;
      ab = null;
      
      if (parsedFontsCache.size >= MAX_CACHE) {
        const firstKey = parsedFontsCache.keys().next().value;
        parsedFontsCache.delete(firstKey);
        if (typeof global.gc === 'function') global.gc();
      }
      parsedFontsCache.set(clientId, font);
      return font;
    } catch (err) {
      console.warn(`[Worker] Failed to parse target font ${clientId} (${serverFilename}):`, err.message);
      return null;
    }
  }
  
  if (!baseFontParsed) throw new Error('Failed to parse base font');
  
  const targetUnitsPerEm = baseFontParsed.unitsPerEm;
  const isCFF = true;

  let duployanFallbackFont = null;
  function getDuployanFallbackFont() {
    if (!duployanFallbackFont) {
      try {
        const p = path.join(__dirname, 'NotoSansDuployan.ttf');
        if (fs.existsSync(p)) {
          const buf = fs.readFileSync(p);
          duployanFallbackFont = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
        }
      } catch (e) {
        console.error('Failed to load Duployan fallback font:', e);
      }
    }
    return duployanFallbackFont;
  }
  
  // Automatically expand glyphMap for negated math symbols & base symbols
  // If a negated symbol is mapped (e.g. 0x2284), ensure its base (0x2282) is mapped if available
  for (const [negStr, baseStr] of Object.entries(NEGATED_MATH_MAP)) {
    const negCp = Number(negStr);
    const baseCp = Number(baseStr);
    if (glyphMap[negCp] && !glyphMap[baseCp]) {
      glyphMap[baseCp] = glyphMap[negCp];
    }
  }

  function createFastGlyphIndexLookup(font) {
    if (!font) return () => 0;
    const cmapMap = (font.tables && font.tables.cmap && font.tables.cmap.glyphIndexMap) ||
                    (font.encoding && font.encoding.cmap && font.encoding.cmap.glyphIndexMap);
    if (cmapMap) {
      return (cp) => {
        const idx = cmapMap[cp];
        return (typeof idx === 'number' && idx >= 0) ? idx : 0;
      };
    }
    const cache = new Map();
    return (cp) => {
      if (cache.has(cp)) return cache.get(cp);
      let idx = 0;
      try {
        idx = font.charToGlyphIndex(String.fromCodePoint(cp)) || 0;
      } catch (e) {}
      cache.set(cp, idx);
      return idx;
    };
  }

  const baseGlyphLookup = createFastGlyphIndexLookup(baseFontParsed);

  const mappedCodepoints = new Set(Object.keys(glyphMap).map(Number));
  let missingCount = 0;
  let hitLimit = false;
  let processed = 0;
  
  // Group codepoints by targetFontId so we only load one target font into memory at a time
  let fontToCps = {};
  for (const cp of mappedCodepoints) {
      const targetFontId = glyphMap[String(cp)];
      if (!fontToCps[targetFontId]) fontToCps[targetFontId] = [];
      fontToCps[targetFontId].push(cp);
  }
  
  for (const targetFontId of Object.keys(fontToCps)) {
    const cps = fontToCps[targetFontId];
    if (!cps || cps.length === 0) continue;
      
    const memBefore = process.memoryUsage();
    const loadPct = Math.min(68, 15 + Math.round((processed / Math.max(1, mappedCodepoints.size)) * 50));
    process.send({ type: 'progress', percent: loadPct, message: `Loading font ${targetFontId} (Mem: ${Math.round(memBefore.heapUsed/1024/1024)}MB)` });
    const targetFont = getTargetFont(targetFontId);

    if (!targetFont) {
      processed += cps.length;
      missingCount += cps.length;
      continue;
    }
    
    const targetGlyphLookup = createFastGlyphIndexLookup(targetFont);
      
    for (const cp of cps) {
      try {
        let sourceGlyphIndex = targetGlyphLookup(cp);
        if (!sourceGlyphIndex || sourceGlyphIndex <= 0) { 
          const isTraced = (targetFont.names && (
            (targetFont.names.fontFamily && (targetFont.names.fontFamily.en === 'TracedFont' || targetFont.names.fontFamily === 'TracedFont')) ||
            (targetFont.names.windows && targetFont.names.windows.fontFamily && targetFont.names.windows.fontFamily.en === 'TracedFont') ||
            (targetFont.names.macintosh && targetFont.names.macintosh.fontFamily && targetFont.names.macintosh.fontFamily.en === 'TracedFont')
          ));
          if (isTraced || (targetFont.glyphs && targetFont.glyphs.length === 2)) {
            sourceGlyphIndex = targetGlyphLookup(65); // 'A'
            if (!sourceGlyphIndex || sourceGlyphIndex <= 0) {
              sourceGlyphIndex = 1;
            }
          }
        }
        
        let isSourceValid = false;
        if (sourceGlyphIndex > 0) {
          isSourceValid = true;
        } else if (sourceGlyphIndex === 0 && (cp === 0xFFFD || cp === 0)) {
          isSourceValid = true;
        } else if (cp >= 0x1BC00 && cp <= 0x1BCA3) {
          const fallbackFont = getDuployanFallbackFont();
          if (fallbackFont) {
            try {
              const fg = fallbackFont.charToGlyph(String.fromCodePoint(cp));
              if (fg) {
                let fgCommands = null;
                if (typeof fg.path === 'function') fgCommands = fg.path()?.commands;
                else if (fg.path) fgCommands = fg.path.commands;
                else if (typeof fg.getPath === 'function') fgCommands = fg.getPath()?.commands;
                if (fgCommands && fgCommands.length > 0) isSourceValid = true;
              }
            } catch (e) {}
          }
        }
        
        if (!isSourceValid) {
          missingCount++;
          processed++;
          continue; 
        }
        
        let baseGlyphIndex = 0;
        try {
          baseGlyphIndex = baseGlyphLookup(cp);
        } catch (e) {}
        if (cp === 0xFFFD && (!baseGlyphIndex || baseGlyphIndex <= 0)) {
          baseGlyphIndex = 0; 
        }

        let sourceGlyph = null;
        try {
          sourceGlyph = (sourceGlyphIndex > 0 || sourceGlyphIndex === 0) ? targetFont.glyphs.get(sourceGlyphIndex) : null;
        } catch (e) {
          sourceGlyph = null;
        }
        const scale = targetUnitsPerEm / (targetFont.unitsPerEm || 1000);
        
        let newGlyph = null;
        if (!targetFont.precompiledCache) targetFont.precompiledCache = new Map();
        if (sourceGlyphIndex > 0 && targetFont.precompiledCache.has(sourceGlyphIndex)) {
          const cached = targetFont.precompiledCache.get(sourceGlyphIndex);
          newGlyph = new opentype.Glyph({
            name: cp === 0 ? '.null' : (sourceGlyph?.name || `uni${cp.toString(16).toUpperCase()}`),
            unicode: cp,
            advanceWidth: cached.advanceWidth,
            path: new opentype.Path()
          });
          newGlyph._cachedMetrics = cached.metrics;
          newGlyph._rawCharString = cached.rawCharString;
        } else {
          let scaledPath = new opentype.Path();
          if (sourceGlyph) {
            try {
              let p = null;
              if (typeof sourceGlyph.path === 'function') {
                p = sourceGlyph.path();
              } else if (sourceGlyph.path) {
                p = sourceGlyph.path;
              } else if (typeof sourceGlyph.getPath === 'function') {
                p = sourceGlyph.getPath();
              }
              scaledPath = scalePath(p, scale, isCFF);
            } catch (e) {
              scaledPath = new opentype.Path();
            }
          }
          let advanceW = 0;
          try {
            advanceW = sourceGlyph ? Math.round((sourceGlyph.advanceWidth || 0) * scale) : 0;
          } catch (e) {}

          const isCaretCp = cp === 0x005E || cp === 0x02C6 || cp === 0x2038 || cp === 0x2041 || cp === 0x2303;
          if (isCaretCp) {
            const norm = normalizeCaretPath(scaledPath, advanceW, targetUnitsPerEm);
            scaledPath = norm.path;
            advanceW = norm.advanceWidth;
          } else if (cp === 0x0640 && (!scaledPath || !scaledPath.commands || scaledPath.commands.length === 0)) {
            const fixedTatweel = generateFixedTatweelGlyph(targetUnitsPerEm);
            scaledPath = fixedTatweel.path;
            advanceW = fixedTatweel.advanceWidth;
          } else if (cp === 0x0338) {
            const norm = normalizeCombiningOverlayPath(scaledPath, advanceW, targetUnitsPerEm);
            scaledPath = norm.path;
            advanceW = 0;
          } else if (cp >= 0x1BC00 && cp <= 0x1BCA3 && (!scaledPath || !scaledPath.commands || scaledPath.commands.length === 0)) {
            const fallbackFont = getDuployanFallbackFont();
            if (fallbackFont) {
              try {
                const fg = fallbackFont.charToGlyph(String.fromCodePoint(cp));
                if (fg) {
                  let fgPath = null;
                  if (typeof fg.path === 'function') fgPath = fg.path();
                  else if (fg.path) fgPath = fg.path;
                  else if (typeof fg.getPath === 'function') fgPath = fg.getPath();
                  if (fgPath && fgPath.commands && fgPath.commands.length > 0) {
                    const fScale = targetUnitsPerEm / (fallbackFont.unitsPerEm || 1000);
                    scaledPath = scalePath(fgPath, fScale, isCFF);
                    advanceW = Math.round((fg.advanceWidth || 0) * fScale);
                  }
                }
              } catch (e) {}
            }
          }
          const tempGlyph = new opentype.Glyph({
            name: cp === 0 ? '.null' : (sourceGlyph?.name || `uni${cp.toString(16).toUpperCase()}`),
            unicode: cp,
            advanceWidth: advanceW,
            path: scaledPath
          });
          const { rawCharString, metrics } = fastEncodeCharStringAndMetrics(tempGlyph);
          
          if (sourceGlyphIndex > 0) {
            targetFont.precompiledCache.set(sourceGlyphIndex, {
              metrics,
              advanceWidth: tempGlyph.advanceWidth,
              rawCharString
            });
          }
          
          newGlyph = tempGlyph;
          newGlyph._cachedMetrics = metrics;
          newGlyph._rawCharString = rawCharString;
          newGlyph.path.commands = [];

          if (sourceGlyph && sourceGlyph.path && Array.isArray(sourceGlyph.path.commands)) {
            sourceGlyph.path.commands = [];
          }
        }
        
        let replaceExisting = false;
        if (baseGlyphIndex > 0) {
          replaceExisting = true;
        }

        if (replaceExisting) {
          let oldGlyph = null;
          try {
            oldGlyph = baseFontParsed.glyphs.get(baseGlyphIndex);
          } catch (e) {}
          let onlyUsedByCp = false;
          if (!oldGlyph || !oldGlyph.unicodes || oldGlyph.unicodes.length <= 1) onlyUsedByCp = true;
          
          if (onlyUsedByCp) {
            newGlyph.index = baseGlyphIndex;
            baseFontParsed.glyphs.glyphs[baseGlyphIndex] = newGlyph;
          } else {
            if (oldGlyph && oldGlyph.unicodes) {
              oldGlyph.unicodes = oldGlyph.unicodes.filter((u) => u !== cp);
            }
            if (oldGlyph && oldGlyph.unicode === cp) {
              oldGlyph.unicode = oldGlyph.unicodes && oldGlyph.unicodes.length > 0 ? oldGlyph.unicodes[0] : undefined;
            }
            if (baseFontParsed.glyphs.length < 65535) {
              newGlyph.index = baseFontParsed.glyphs.length;
              baseFontParsed.glyphs.glyphs[baseFontParsed.glyphs.length] = newGlyph;
              baseFontParsed.glyphs.length++;
            } else {
              hitLimit = true;
            }
          }
        } else {
          if (baseFontParsed.glyphs.length < 65535) {
            newGlyph.index = baseFontParsed.glyphs.length;
            baseFontParsed.glyphs.glyphs[baseFontParsed.glyphs.length] = newGlyph;
            baseFontParsed.glyphs.length++;
          } else {
            hitLimit = true;
          }
        }
        
        processed++;
        if (processed % 20 === 0 || processed >= mappedCodepoints.size) {
          if (processed % 500 === 0 && typeof global.gc === 'function') {
            const mem = process.memoryUsage();
            if (mem.heapUsed > 750 * 1024 * 1024) global.gc();
          }
          const pct = Math.min(68, 15 + Math.round((processed / Math.max(1, mappedCodepoints.size)) * 53));
          process.send({
            type: 'progress',
            percent: pct,
            message: `Fused ${processed} / ${mappedCodepoints.size} glyphs (${Math.round((processed / Math.max(1, mappedCodepoints.size)) * 100)}%)`
          });
        }
      } catch (cpErr) {
        console.warn(`[Worker] Error fusing codepoint U+${cp.toString(16).toUpperCase()}:`, cpErr.message);
        missingCount++;
        processed++;
      }
    } // End of cp loop
    if (targetFont) targetFont.precompiledCache = null;
    parsedFontsCache.clear();
    if (typeof global.gc === 'function') global.gc();
  } // End of targetFontId loop

  process.send({ type: 'progress', percent: 69, message: 'Normalizing OpenType metrics and layout tables...' });

  
  // 1. Ensure Glyph 0 is strictly .notdef and unmapped in cmap
  try {
    if (baseFontParsed.glyphs && baseFontParsed.glyphs.length > 0) {
      const g0 = baseFontParsed.glyphs.get(0);
      if (g0) {
        g0.name = '.notdef';
        g0.unicode = undefined;
        g0.unicodes = [];
        let p0 = null;
        try {
          p0 = typeof g0.getPath === 'function' ? g0.getPath() : (typeof g0.path === 'function' ? g0.path() : g0.path);
        } catch (e) {}
        if (!p0 || !p0.commands || p0.commands.length === 0) {
          const notdefP = new opentype.Path();
          notdefP.moveTo(80, 0); notdefP.lineTo(520, 0); notdefP.lineTo(520, 750); notdefP.lineTo(80, 750); notdefP.close();
          notdefP.moveTo(140, 60); notdefP.lineTo(140, 690); notdefP.lineTo(460, 690); notdefP.lineTo(460, 60); notdefP.close();
          g0.path = notdefP;
          g0.advanceWidth = 600;
        }
      }
    }
  } catch (e) {}

  // 2. Ensure Space (Unicode 32, 0x0020) exists (Windows strictly requires space glyph)
  try {
    if (baseFontParsed.charToGlyphIndex(' ') <= 0) {
      const spaceGlyph = new opentype.Glyph({
        name: 'space',
        unicode: 32,
        advanceWidth: Math.round(targetUnitsPerEm * 0.25),
        path: new opentype.Path()
      });
      if (baseFontParsed.glyphs.length < 65535) {
        baseFontParsed.glyphs.glyphs[baseFontParsed.glyphs.length] = spaceGlyph;
        baseFontParsed.glyphs.length++;
      }
    }
  } catch (e) {}

  // 3. Clean and synchronize Name Table for 100% Windows installation compliance
  try {
    const familyName = 'FusedFont';
    const styleName = 'Regular';
    const fullName = 'FusedFont Regular';
    const postScriptName = 'FusedFont-Regular';
    const uniqueID = `1.000;NONE;${postScriptName}`;
    const versionString = 'Version 1.000';

    baseFontParsed.names = {
      windows: {
        fontFamily: { en: familyName },
        fontSubfamily: { en: styleName },
        uniqueID: { en: uniqueID },
        fullName: { en: fullName },
        version: { en: versionString },
        postScriptName: { en: postScriptName },
        description: { en: 'Fused by AI Studio' }
      },
      macintosh: {
        fontFamily: { en: familyName },
        fontSubfamily: { en: styleName },
        uniqueID: { en: uniqueID },
        fullName: { en: fullName },
        version: { en: versionString },
        postScriptName: { en: postScriptName },
        description: { en: 'Fused by AI Studio' }
      }
    };
  } catch (e) {}
  
  // Normalize any caret glyphs (0x005E, 0x02C6, 0x2038, 0x2041, 0x2303) in baseFontParsed
  try {
    const caretCodepoints = [0x005E, 0x02C6, 0x2038, 0x2041, 0x2303];
    for (const cCode of caretCodepoints) {
      const cIdx = baseFontParsed.charToGlyphIndex(String.fromCodePoint(cCode));
      if (cIdx && cIdx > 0) {
        const g = baseFontParsed.glyphs.get(cIdx);
        if (g) {
          let gPath = null;
          try {
            gPath = typeof g.getPath === 'function' ? g.getPath() : (typeof g.path === 'function' ? g.path() : g.path);
          } catch (e) {}
          if (gPath && gPath.commands && gPath.commands.length > 0) {
            const norm = normalizeCaretPath(gPath, g.advanceWidth || 0, targetUnitsPerEm);
            if (norm.path !== gPath) {
              g.path = norm.path;
              g.advanceWidth = norm.advanceWidth;
              g._cachedMetrics = null;
              g._rawCharString = null;
              try {
                fastEncodeCharStringAndMetrics(g);
              } catch (e) {}
            }
          }
        }
      }
    }
  } catch (e) {}

  // Ensure Arabic Tatweel (U+0640) has a proper fixed baseline connecting elongation
  try {
    const tatweelIdx = baseFontParsed.charToGlyphIndex(String.fromCodePoint(0x0640));
    if (tatweelIdx && tatweelIdx > 0) {
      const g = baseFontParsed.glyphs.get(tatweelIdx);
      if (g) {
        let gPath = null;
        try {
          gPath = typeof g.getPath === 'function' ? g.getPath() : (typeof g.path === 'function' ? g.path() : g.path);
        } catch (e) {}
        if (!gPath || !gPath.commands || gPath.commands.length === 0) {
          const fixedTatweel = generateFixedTatweelGlyph(targetUnitsPerEm);
          g.path = fixedTatweel.path;
          g.advanceWidth = fixedTatweel.advanceWidth;
          g._cachedMetrics = null;
          g._rawCharString = null;
          try {
            fastEncodeCharStringAndMetrics(g);
          } catch (e) {}
        }
      }
    }
  } catch (e) {}

  // Ensure U+0338 (Combining Long Solidus Overlay) exists with strictly 0 advanceWidth and centered overlay positioning
  try {
    const solidusIdx = baseFontParsed.charToGlyphIndex(String.fromCodePoint(0x0338));
    if (!solidusIdx || solidusIdx <= 0) {
      const fixedSolidus = generateCombiningLongSolidusOverlay(targetUnitsPerEm);
      const g = new opentype.Glyph({
        name: 'uni0338',
        unicode: 0x0338,
        advanceWidth: 0,
        path: fixedSolidus.path
      });
      try {
        fastEncodeCharStringAndMetrics(g);
      } catch(e) {}
      if (baseFontParsed.glyphs.length < 65535) {
        g.index = baseFontParsed.glyphs.length;
        baseFontParsed.glyphs.glyphs[baseFontParsed.glyphs.length] = g;
        baseFontParsed.glyphs.length++;
      }
    } else {
      const g = baseFontParsed.glyphs.get(solidusIdx);
      if (g) {
        let gPath = null;
        try {
          gPath = typeof g.getPath === 'function' ? g.getPath() : (typeof g.path === 'function' ? g.path() : g.path);
        } catch (e) {}
        const norm = normalizeCombiningOverlayPath(gPath, g.advanceWidth, targetUnitsPerEm);
        g.path = norm.path;
        g.advanceWidth = 0;
        g._cachedMetrics = null;
        g._rawCharString = null;
        try {
          fastEncodeCharStringAndMetrics(g);
        } catch (e) {}
      }
    }
  } catch (e) {}

  // Ensure negated math symbols (⊄, ⊈, ≠, etc.) and their base symbols are paired properly
  try {
    for (const [negStr, baseStr] of Object.entries(NEGATED_MATH_MAP)) {
      const negCp = Number(negStr);
      const baseCp = Number(baseStr);
      const baseIdx = baseFontParsed.charToGlyphIndex(String.fromCodePoint(baseCp));
      const negIdx = baseFontParsed.charToGlyphIndex(String.fromCodePoint(negCp));
      
      // If base exists, but negated doesn't: synthesize negated glyph
      if (baseIdx > 0 && (!negIdx || negIdx <= 0)) {
        const baseG = baseFontParsed.glyphs.get(baseIdx);
        if (baseG) {
          let bgPath = null;
          try {
            bgPath = typeof baseG.getPath === 'function' ? baseG.getPath() : (typeof baseG.path === 'function' ? baseG.path() : baseG.path);
          } catch (e) {}
          if (bgPath && bgPath.commands && bgPath.commands.length > 0) {
            const advW = baseG.advanceWidth || Math.round(targetUnitsPerEm * 0.6);
            const p = new opentype.Path();
            for (const cmd of bgPath.commands) {
              p.commands.push({ ...cmd });
            }
            const halfThick = Math.round(targetUnitsPerEm * 0.028);
            const x1 = Math.round(advW - targetUnitsPerEm * 0.52);
            const y1 = Math.round(-targetUnitsPerEm * 0.08);
            const x2 = Math.round(advW - targetUnitsPerEm * 0.08);
            const y2 = Math.round(+targetUnitsPerEm * 0.72);
            p.moveTo(x1 - halfThick, y1);
            p.lineTo(x2 - halfThick, y2);
            p.lineTo(x2 + halfThick, y2);
            p.lineTo(x1 + halfThick, y1);
            p.close();

            const synthGlyph = new opentype.Glyph({
              name: `uni${negCp.toString(16).toUpperCase()}`,
              unicode: negCp,
              advanceWidth: advW,
              path: p
            });
            try {
              fastEncodeCharStringAndMetrics(synthGlyph);
            } catch(e) {}
            if (baseFontParsed.glyphs.length < 65535) {
              synthGlyph.index = baseFontParsed.glyphs.length;
              baseFontParsed.glyphs.glyphs[baseFontParsed.glyphs.length] = synthGlyph;
              baseFontParsed.glyphs.length++;
            }
          }
        }
      }
    }
  } catch (e) {}

  // Ensure any Duployan glyphs present in baseFontParsed have visible outlines
  try {
    for (let cp = 0x1BC00; cp <= 0x1BCA3; cp++) {
      const idx = baseFontParsed.charToGlyphIndex(String.fromCodePoint(cp));
      if (idx > 0) {
        const g = baseFontParsed.glyphs.get(idx);
        if (g) {
          let gPath = null;
          try {
            gPath = typeof g.getPath === 'function' ? g.getPath() : (typeof g.path === 'function' ? g.path() : g.path);
          } catch (e) {}
          if (!gPath || !gPath.commands || gPath.commands.length === 0) {
            const fallbackFont = getDuployanFallbackFont();
            if (fallbackFont) {
              const fg = fallbackFont.charToGlyph(String.fromCodePoint(cp));
              if (fg) {
                let fgPath = null;
                try {
                  fgPath = typeof fg.getPath === 'function' ? fg.getPath() : (typeof fg.path === 'function' ? fg.path() : fg.path);
                } catch (e) {}
                if (fgPath && fgPath.commands && fgPath.commands.length > 0) {
                  const fScale = targetUnitsPerEm / (fallbackFont.unitsPerEm || 1000);
                  g.path = scalePath(fgPath, fScale, isCFF);
                  g.advanceWidth = Math.round((fg.advanceWidth || 0) * fScale);
                  g._cachedMetrics = null;
                  g._rawCharString = null;
                }
              }
            }
          }
        }
      }
    }
  } catch (e) {}

  // 4. Sanitize and pre-compile every glyph in baseFontParsed for strict CFF and Windows validation
  const totalBaseGlyphs = baseFontParsed.glyphs.length;
  const sanitizeStep = Math.max(50, Math.floor(totalBaseGlyphs / 50));
  for (let i = 0; i < totalBaseGlyphs; i++) {
    let g = null;
    try {
      g = baseFontParsed.glyphs.get(i);
    } catch (e) {
      continue;
    }
    if (!g) continue;
    if (i === 0) {
      g.name = '.notdef';
      g.unicode = undefined;
      g.unicodes = [];
    } else {
      g.name = sanitizeGlyphName(g.name, g.unicode, i);
      if (typeof g.advanceWidth !== 'number' || !isFinite(g.advanceWidth) || g.advanceWidth < 0) {
        g.advanceWidth = Math.round(targetUnitsPerEm * 0.5);
      }
    }

    if (g.path && Array.isArray(g.path.commands) && g.path.commands.length > 0) {
      for (const cmd of g.path.commands) {
        if (!cmd) continue;
        if (cmd.x !== undefined && (!isFinite(cmd.x) || isNaN(cmd.x))) cmd.x = 0;
        if (cmd.y !== undefined && (!isFinite(cmd.y) || isNaN(cmd.y))) cmd.y = 0;
        if (cmd.x1 !== undefined && (!isFinite(cmd.x1) || isNaN(cmd.x1))) cmd.x1 = 0;
        if (cmd.y1 !== undefined && (!isFinite(cmd.y1) || isNaN(cmd.y1))) cmd.y1 = 0;
        if (cmd.x2 !== undefined && (!isFinite(cmd.x2) || isNaN(cmd.x2))) cmd.x2 = 0;
        if (cmd.y2 !== undefined && (!isFinite(cmd.y2) || isNaN(cmd.y2))) cmd.y2 = 0;
      }
    }

    // Precompile _rawCharString and _cachedMetrics now while glyf/loca is available so toArrayBuffer is instant and NEVER freezes
    if (!g._rawCharString || !g._cachedMetrics) {
      try {
        fastEncodeCharStringAndMetrics(g);
      } catch (err) {}
    }
    if (g.path && Array.isArray(g.path.commands) && g._rawCharString) {
      g.path.commands = [];
    }

    if (i % sanitizeStep === 0 || i === totalBaseGlyphs - 1) {
      if (i % 5000 === 0 && typeof global.gc === 'function') {
        const mem = process.memoryUsage();
        if (mem.heapUsed > 750 * 1024 * 1024) {
          global.gc();
        }
      }
      const pct = 70 + Math.round((i / Math.max(1, totalBaseGlyphs)) * 25);
      process.send({
        type: 'progress',
        percent: pct,
        message: `Finalizing font outlines: ${i} / ${totalBaseGlyphs} glyphs (${Math.round((i / Math.max(1, totalBaseGlyphs)) * 100)}%)`
      });
    }
  }

  // Ensure caret/cursor metrics and table consistency across platforms
  const asc = baseFontParsed.ascender || (baseFontParsed.tables && baseFontParsed.tables.hhea && baseFontParsed.tables.hhea.ascender) || Math.round(targetUnitsPerEm * 0.8);
  const desc = baseFontParsed.descender || (baseFontParsed.tables && baseFontParsed.tables.hhea && baseFontParsed.tables.hhea.descender) || -Math.round(targetUnitsPerEm * 0.2);

  if (!baseFontParsed.tables) baseFontParsed.tables = {};
  if (!baseFontParsed.tables.hhea) baseFontParsed.tables.hhea = {};
  if (!baseFontParsed.tables.os2) baseFontParsed.tables.os2 = {};

  baseFontParsed.ascender = asc;
  baseFontParsed.descender = desc;
  baseFontParsed.tables.hhea.version = 65536; // 0x00010000 (OpenType standard Version 1.0)
  baseFontParsed.tables.hhea.ascender = asc;
  baseFontParsed.tables.hhea.descender = desc;
  baseFontParsed.tables.hhea.lineGap = 0;
  baseFontParsed.tables.hhea.caretSlopeRise = 1;
  baseFontParsed.tables.hhea.caretSlopeRun = 0;
  baseFontParsed.tables.hhea.caretOffset = 0;

  baseFontParsed.tables.os2.version = 3;
  baseFontParsed.tables.os2.sTypoAscender = asc;
  baseFontParsed.tables.os2.sTypoDescender = desc;
  baseFontParsed.tables.os2.sTypoLineGap = 0;
  baseFontParsed.tables.os2.usWinAscent = Math.max(asc, Math.round(targetUnitsPerEm * 0.8));
  baseFontParsed.tables.os2.usWinDescent = Math.max(Math.abs(desc), Math.round(targetUnitsPerEm * 0.2));
  baseFontParsed.tables.os2.usWeightClass = 400; // Normal / Regular (never 0!)
  baseFontParsed.tables.os2.usWidthClass = 5; // Medium (never 0!)
  baseFontParsed.tables.os2.fsType = 0; // 0 = Installable embedding (critical for Windows font installation!)
  baseFontParsed.tables.os2.fsSelection = 192; // USE_TYPO_METRICS (128) + REGULAR (64)
  baseFontParsed.tables.os2.achVendID = 'NONE';
  baseFontParsed.tables.os2.ulCodePageRange1 = 1; // Latin 1 (1252) - required by Windows
  baseFontParsed.tables.os2.ulCodePageRange2 = 0;
  baseFontParsed.tables.os2.panose = [2, 0, 5, 3, 0, 0, 0, 0, 0, 0];

  // Strip all non-CFF, TrueType, variable, or stale layout tables that corrupt font validation in Windows
  if (baseFontParsed.tables) {
    delete baseFontParsed.tables.name; // Critical: eliminates raw bloated/corrupt base name table
    delete baseFontParsed.tables.ltag; // Critical: eliminates Apple language tags table
    delete baseFontParsed.tables.gasp;
    delete baseFontParsed.tables.gsub;
    delete baseFontParsed.tables.GSUB;
    delete baseFontParsed.tables.gpos;
    delete baseFontParsed.tables.GPOS;
    delete baseFontParsed.tables.gdef;
    delete baseFontParsed.tables.GDEF;
    delete baseFontParsed.tables.math;
    delete baseFontParsed.tables.MATH;
    delete baseFontParsed.tables.base;
    delete baseFontParsed.tables.BASE;
    delete baseFontParsed.tables.jstf;
    delete baseFontParsed.tables.JSTF;
    delete baseFontParsed.tables.fvar;
    delete baseFontParsed.tables.avar;
    delete baseFontParsed.tables.cvar;
    delete baseFontParsed.tables.gvar;
    delete baseFontParsed.tables.stat;
    delete baseFontParsed.tables.STAT;
    delete baseFontParsed.tables.cvt;
    delete baseFontParsed.tables.fpgm;
    delete baseFontParsed.tables.prep;
    delete baseFontParsed.tables.glyf;
    delete baseFontParsed.tables.loca;
  }

  // COLOR UPDATE: Preserve and merge SVG in OpenType, COLR (COLRv0), and CPAL font tables
  try {
    function fontFileHasColor(fPath) {
      if (!fPath || !fs.existsSync(fPath)) return false;
      try {
        const fd = fs.openSync(fPath, 'r');
        const headBuf = Buffer.alloc(1024);
        const bytesRead = fs.readSync(fd, headBuf, 0, 1024, 0);
        fs.closeSync(fd);
        if (bytesRead < 12) return false;
        const numTables = headBuf.readUInt16BE(4);
        for (let ti = 0; ti < numTables && 12 + ti * 16 + 4 <= bytesRead; ti++) {
          const tag = headBuf.toString('ascii', 12 + ti * 16, 12 + ti * 16 + 4);
          if (tag === 'COLR' || tag === 'CPAL' || tag === 'SVG ') return true;
        }
      } catch (e) {}
      return false;
    }

    const baseHasColor = (baseFontParsed.tables && (baseFontParsed.tables.colr || baseFontParsed.tables.COLR || baseFontParsed.tables.cpal || baseFontParsed.tables.CPAL || baseFontParsed.tables.svg || baseFontParsed.tables.SVG)) || (baseServerFilename ? fontFileHasColor(path.join(uploadDir, baseServerFilename)) : false);

    const targetIdsWithColor = [];
    const usedTargetIds = new Set(Object.values(glyphMap || {}));
    for (const tId of usedTargetIds) {
      const sfn = serverFontIds[tId];
      if (sfn && fontFileHasColor(path.join(uploadDir, sfn))) {
        targetIdsWithColor.push(tId);
      }
    }

    if (baseHasColor || targetIdsWithColor.length > 0) {
      process.send({ type: 'progress', percent: 71, message: 'Processing color OpenType tables (COLR / CPAL / SVG)...' });
      let mergeColorTablesFn = null;
      try {
        mergeColorTablesFn = require('./src/lib/colorFontUtils.ts').mergeColorTables;
      } catch (e1) {
        try {
          mergeColorTablesFn = require('./src/lib/colorFontUtils').mergeColorTables;
        } catch (e2) {}
      }
      if (mergeColorTablesFn) {
        const targetFontsForColor = new Map();
        for (const tId of targetIdsWithColor) {
          const tf = getTargetFont(tId);
          if (tf) targetFontsForColor.set(tId, tf);
        }
        const colorTablesMerged = mergeColorTablesFn(baseFontParsed, targetFontsForColor, glyphMap);
        if (colorTablesMerged && colorTablesMerged.hasColor) {
          if (colorTablesMerged.cpalTable) {
            baseFontParsed.tables.cpal = colorTablesMerged.cpalTable;
            baseFontParsed.tables.CPAL = colorTablesMerged.cpalTable;
          }
          if (colorTablesMerged.colrTable) {
            baseFontParsed.tables.colr = colorTablesMerged.colrTable;
            baseFontParsed.tables.COLR = colorTablesMerged.colrTable;
          }
          if (colorTablesMerged.svgTable) {
            baseFontParsed.tables.svg = colorTablesMerged.svgTable;
            baseFontParsed.tables.SVG = colorTablesMerged.svgTable;
          }
        }
        targetFontsForColor.clear();
      }
    } else {
      process.send({ type: 'progress', percent: 71, message: 'Verified OpenType tables (standard monochrome outlines)...' });
    }
  } catch (e) {
    console.warn("Color table merge warning in worker:", e);
  }

  // Use CFF outlines format for fast, ultra-low memory compilation
  baseFontParsed.outlinesFormat = 'cff';
  
  // SUPER AGGRESSIVE MEMORY FREE
  parsedFontsCache.clear();
  parsedFontsCache = null;
  fontToCps = null;
  glyphMap = null;
  
  if (typeof global.gc === 'function') {
    global.gc();
    global.gc(); // Double sweep
  }
  
  process.send({ type: 'progress', percent: 96, message: 'Generating final font buffer...' });
  const buffer = baseFontParsed.toArrayBuffer();
  
  process.send({ type: 'progress', percent: 99, message: 'Writing final font file to disk...' });
  const outputFilename = 'FusedFont_' + Date.now() + '.otf';
  const outputPath = path.join(uploadDir, outputFilename);
  fs.writeFileSync(outputPath, Buffer.from(buffer));
  
  process.send({ type: 'done', percent: 100, file: outputPath, originalName: 'FusedFont.otf' });
  setTimeout(() => process.exit(0), 100);
  
} catch (err) {
  process.send({ type: 'error', message: err.message || String(err), stack: err.stack });
  setTimeout(() => process.exit(1), 100);
}
});
