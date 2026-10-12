const fs = require('fs');

function applyPatches(filePath = 'node_modules/opentype.js/dist/opentype.js') {
    if (!fs.existsSync(filePath)) {
        console.warn(filePath + " not found, skipping patch");
        return;
    }
    
    let code = fs.readFileSync(filePath, 'utf8');
    
    // 0. Export internal helpers (_glyphToOps, _encodeCHARSTRING)
    const exportTarget = `  __export(opentype_exports, {`;
    if (code.includes(exportTarget) && !code.includes('_encodeCHARSTRING')) {
        code = code.replace(exportTarget, `  __export(opentype_exports, {
    _glyphToOps: () => glyphToOps,
    _encodeCHARSTRING: () => encode.CHARSTRING,`);
        console.log("Patched internal exports");
    }

    // 1. Patch computeCheckSum
    const checksumTarget = `  function computeCheckSum(bytes) {
    while (bytes.length % 4 !== 0) {
      bytes.push(0);
    }
    let sum = 0;
    for (let i = 0; i < bytes.length; i += 4) {
      sum += (bytes[i] << 24) + (bytes[i + 1] << 16) + (bytes[i + 2] << 8) + bytes[i + 3];
    }
    sum %= Math.pow(2, 32);
    return sum;
  }`;

    const checksumReplace = `  function computeCheckSum(bytes) {
    let padding = 0;
    while ((bytes.length + padding) % 4 !== 0) padding++;
    
    let sum = 0;
    for (let i = 0; i < bytes.length; i += 4) {
      let b0 = bytes[i] || 0;
      let b1 = bytes[i + 1] || 0;
      let b2 = bytes[i + 2] || 0;
      let b3 = bytes[i + 3] || 0;
      sum += (b0 << 24) + (b1 << 16) + (b2 << 8) + b3;
    }
    sum %= Math.pow(2, 32);
    return sum;
  }`;
    if (code.includes(checksumTarget)) {
        code = code.replace(checksumTarget, checksumReplace);
        console.log("Patched computeCheckSum");
    }

    // 2. Patch encode.CHARSTRING & sizeOf.CHARSTRING with high performance direct Buffer/Uint8Array writing
    const charstringTarget = code.includes('  encode.CHARSTRING = function(ops) {') ? '  encode.CHARSTRING = function(ops) {' : 'encode.CHARSTRING = function(ops) {';
    const charstringSectionEnd = code.includes('  encode.OBJECT = function(v) {') ? '  encode.OBJECT = function(v) {' : 'encode.OBJECT = function(v) {';
    
    const charstringReplacement = `  encode.CHARSTRING = function(ops) {
    let buf = (typeof Buffer !== 'undefined' && Buffer.allocUnsafe) ? Buffer.allocUnsafe(Math.max(32, ops.length * 5)) : new Uint8Array(Math.max(32, ops.length * 5));
    let pos = 0;
    const length = ops.length;
    for (let i = 0; i < length; i += 1) {
      const op = ops[i];
      if (op.type === "NUMBER") {
        let v = op.value;
        if (v >= -107 && v <= 107) {
          buf[pos++] = v + 139;
        } else if (v >= 108 && v <= 1131) {
          v = v - 108;
          buf[pos++] = (v >> 8) + 247;
          buf[pos++] = v & 255;
        } else if (v >= -1131 && v <= -108) {
          v = -v - 108;
          buf[pos++] = (v >> 8) + 251;
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
      } else if (op.type === "OP" || op.type === "BYTE") {
        const v = op.value;
        if (v < 1200) {
          buf[pos++] = v & 255;
        } else {
          buf[pos++] = 12;
          buf[pos++] = (v - 1200) & 255;
        }
      } else {
        buf[pos++] = (op.value || 0) & 255;
      }
    }
    return buf.subarray(0, pos);
  };
  sizeOf.CHARSTRING = function(ops) {
    return encode.CHARSTRING(ops).length;
  };
  `;

    if (code.includes(charstringTarget) && code.includes(charstringSectionEnd)) {
        const start = code.indexOf(charstringTarget);
        const end = code.indexOf(charstringSectionEnd);
        code = code.slice(0, start) + charstringReplacement + code.slice(end);
        console.log("Patched encode.CHARSTRING in " + filePath);
    }

    // 3. Patch encode.INDEX and sizeOf.INDEX
    const indexTarget = code.includes('  encode.INDEX = function(l) {') ? '  encode.INDEX = function(l) {' : 'encode.INDEX = function(l) {';
    const dictTarget = code.includes('  encode.DICT = function(m) {') ? '  encode.DICT = function(m) {' : 'encode.DICT = function(m) {';
    
    const indexReplacement = `  encode.INDEX = function(l) {
    if (!l || l.length === 0) return (typeof Buffer !== 'undefined' && Buffer.from) ? Buffer.from([0, 0]) : new Uint8Array([0, 0]);
    const chunks = new Array(l.length + 1);
    let dataLength = 0;
    for (let i = 0; i < l.length; i++) {
      const v = l[i];
      let val = (v !== null && typeof v === "object" && "value" in v) ? v.value : v;
      let b;
      const isB = typeof Buffer !== 'undefined' && Buffer.isBuffer(val);
      if (isB || val instanceof Uint8Array) b = val;
      else if (v && v.type === "RAW_BYTES") b = (typeof Buffer !== 'undefined' && Buffer.isBuffer(val)) ? val : (val instanceof Uint8Array ? val : new Uint8Array(val));
      else if (typeof val === "string") b = (typeof TextEncoder !== 'undefined') ? new TextEncoder().encode(val) : ((typeof Buffer !== 'undefined') ? Buffer.from(val, "utf8") : new Uint8Array(0));
      else if (Array.isArray(val)) b = (typeof Buffer !== 'undefined') ? Buffer.from(val) : new Uint8Array(val);
      else if (val && typeof val.encode === "function") {
        const enc = val.encode();
        b = (typeof Buffer !== 'undefined') ? Buffer.from(enc) : (enc instanceof Uint8Array ? enc : new Uint8Array(enc));
      }
      else if (val) b = (typeof Buffer !== 'undefined') ? Buffer.from(val) : (val instanceof Uint8Array ? val : new Uint8Array(val));
      else b = (typeof Buffer !== 'undefined') ? Buffer.alloc(0) : new Uint8Array(0);
      chunks[i + 1] = b;
      dataLength += b.length;
    }
    if (dataLength === 0 && l.length === 0) return (typeof Buffer !== 'undefined' && Buffer.from) ? Buffer.from([0, 0]) : new Uint8Array([0, 0]);
    
    const offset = 1 + dataLength;
    const offSize = 1 + Math.floor(Math.log(offset) / Math.log(2)) / 8 | 0;
    const headerLen = 3 + (l.length + 1) * offSize;
    const headerBuf = (typeof Buffer !== 'undefined' && Buffer.allocUnsafe) ? Buffer.allocUnsafe(headerLen) : new Uint8Array(headerLen);
    if (headerBuf.writeUInt16BE) {
      headerBuf.writeUInt16BE(l.length, 0);
      headerBuf.writeUInt8(offSize, 2);
    } else {
      headerBuf[0] = (l.length >> 8) & 0xFF;
      headerBuf[1] = l.length & 0xFF;
      headerBuf[2] = offSize & 0xFF;
    }
    chunks[0] = headerBuf;
    
    let currentOffset = 1;
    let pos = 3;
    function writeOffset(off) {
      if (headerBuf.writeUInt8) {
        if (offSize === 1) headerBuf.writeUInt8(off, pos);
        else if (offSize === 2) headerBuf.writeUInt16BE(off, pos);
        else if (offSize === 3) {
          headerBuf.writeUInt8((off >> 16) & 0xFF, pos);
          headerBuf.writeUInt16BE(off & 0xFFFF, pos + 1);
        } else {
          headerBuf.writeUInt32BE(off, pos);
        }
      } else {
        if (offSize === 1) {
          headerBuf[pos] = off & 0xFF;
        } else if (offSize === 2) {
          headerBuf[pos] = (off >> 8) & 0xFF;
          headerBuf[pos + 1] = off & 0xFF;
        } else if (offSize === 3) {
          headerBuf[pos] = (off >> 16) & 0xFF;
          headerBuf[pos + 1] = (off >> 8) & 0xFF;
          headerBuf[pos + 2] = off & 0xFF;
        } else {
          headerBuf[pos] = (off >>> 24) & 0xFF;
          headerBuf[pos + 1] = (off >>> 16) & 0xFF;
          headerBuf[pos + 2] = (off >>> 8) & 0xFF;
          headerBuf[pos + 3] = off & 0xFF;
        }
      }
      pos += offSize;
    }
    
    writeOffset(currentOffset);
    for (let i = 0; i < l.length; i++) {
      currentOffset += chunks[i + 1].length;
      writeOffset(currentOffset);
    }
    if (typeof Buffer !== 'undefined' && Buffer.concat) {
      return Buffer.concat(chunks.map(c => (Buffer.isBuffer(c) ? c : Buffer.from(c.buffer || c, c.byteOffset || 0, c.byteLength || c.length))));
    } else {
      const out = new Uint8Array(headerLen + dataLength);
      let p = 0;
      for (const ch of chunks) {
        out.set(ch, p);
        p += ch.length;
      }
      return out;
    }
  };
  sizeOf.INDEX = function(l) {
    if (!l || l.length === 0) return 2;
    let dataLength = 0;
    for (let i = 0; i < l.length; i++) {
      const v = l[i];
      let val = (v !== null && typeof v === "object" && "value" in v) ? v.value : v;
      const isB = typeof Buffer !== 'undefined' && Buffer.isBuffer(val);
      if (isB || val instanceof Uint8Array) dataLength += val.length;
      else if (v && v.type === "RAW_BYTES") dataLength += val.length;
      else if (typeof val === "string") dataLength += (typeof Buffer !== 'undefined' && Buffer.byteLength) ? Buffer.byteLength(val) : ((typeof TextEncoder !== 'undefined') ? new TextEncoder().encode(val).length : val.length);
      else if (Array.isArray(val)) dataLength += val.length;
      else if (val && typeof val.sizeOf === "function") dataLength += val.sizeOf();
      else if (val && typeof val.encode === "function") {
        const enc = val.encode();
        dataLength += (typeof Buffer !== 'undefined' && Buffer.byteLength) ? Buffer.byteLength(enc) : enc.length;
      }
      else if (val && val.length) dataLength += val.length;
    }
    if (dataLength === 0 && l.length === 0) return 2;
    const offset = 1 + dataLength;
    const offSize = 1 + Math.floor(Math.log(offset) / Math.log(2)) / 8 | 0;
    return 3 + (l.length + 1) * offSize + dataLength;
  };
  `;

    if (code.includes(indexTarget) && code.includes(dictTarget)) {
        const start = code.indexOf(indexTarget);
        const end = code.indexOf(dictTarget);
        code = code.slice(0, start) + indexReplacement + code.slice(end);
        console.log("Patched encode.INDEX and sizeOf.INDEX in " + filePath);
    }

    // 4. Patch RAW_BYTES encoder support
    const rawBytesTarget = code.includes('  encode.BYTE = function(v) {') ? '  encode.BYTE = function(v) {' : 'encode.BYTE = function(v) {';
    if (code.includes(rawBytesTarget) && !code.includes('encode.RAW_BYTES')) {
        code = code.replace(rawBytesTarget, `  encode.RAW_BYTES = function(v) { 
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(v)) return v;
    if (v instanceof Uint8Array) return v;
    return Array.isArray(v) ? v : Array.from(v);
  };
  sizeOf.RAW_BYTES = function(v) { return v.length; };
  ${rawBytesTarget}`);
        console.log("Added RAW_BYTES encoder");
    }

    // 5. Patch makeCharStringsIndex for precompiled _rawCharString and path.commands freeing
    const makeCharStringsIndexTarget = `function makeCharStringsIndex(glyphs, version) {`;
    const makePrivateDictTarget = `function makePrivateDict(attrs, strings, version) {`;
    
    const makeCharStringsIndexReplacement = `function makeCharStringsIndex(glyphs, version) {
    const t = new table_default.Record("CharStrings INDEX", [
      { name: "charStrings", type: "INDEX", value: [] }
    ]);
    for (let i = 0; i < glyphs.length; i += 1) {
      const glyph = glyphs.get(i);
      let buf;
      if (glyph._rawCharString) {
        buf = glyph._rawCharString;
      } else {
        let ops = glyphToOps(glyph, version);
        buf = encode.CHARSTRING(ops);
        ops = null;
        glyph._rawCharString = buf;
        if (glyph.path) {
          glyph.path.commands = [];
        }
      }
      t.charStrings.push({ name: glyph.name, type: "RAW_BYTES", value: buf });
      if (i % 2000 === 0 && typeof globalThis !== 'undefined' && typeof globalThis.gc === 'function') {
        globalThis.gc();
      }
    }
    return t;
  }
  `;

    if (code.includes(makeCharStringsIndexTarget) && code.includes(makePrivateDictTarget)) {
        const start = code.indexOf(makeCharStringsIndexTarget);
        const end = code.indexOf(makePrivateDictTarget);
        code = code.slice(0, start) + makeCharStringsIndexReplacement + code.slice(end);
        console.log("Patched makeCharStringsIndex");
    }

    // 6. Patch Glyph.prototype.getMetrics to cache and compute inline
    const getMetricsTarget = code.includes('  Glyph.prototype.getMetrics = function() {') ? '  Glyph.prototype.getMetrics = function() {' : 'Glyph.prototype.getMetrics = function() {';
    const getMetricsSectionEnd = code.includes('  Glyph.prototype.getBoundingBox = function() {') ? '  Glyph.prototype.getBoundingBox = function() {' : (code.includes('Glyph.prototype.getBoundingBox = function() {') ? 'Glyph.prototype.getBoundingBox = function() {' : 'Glyph.prototype.draw = function(ctx, x, y, fontSize, options) {');
    
    const getMetricsReplacement = `  Glyph.prototype.getMetrics = function() {
    if (this._cachedMetrics) return this._cachedMetrics;
    const path = this.path;
    if (!path || !path.commands || path.commands.length === 0) {
      const lsb = this.leftSideBearing !== void 0 ? this.leftSideBearing : 0;
      return (this._cachedMetrics = {
        xMin: 0, yMin: 0, xMax: 0, yMax: 0,
        leftSideBearing: lsb,
        rightSideBearing: (this.advanceWidth || 0)
      });
    }
    const commands = path.commands;
    let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
    for (let i = 0; i < commands.length; i += 1) {
      const cmd = commands[i];
      if (cmd.type !== "Z") {
        const x = cmd.x, y = cmd.y;
        if (x < xMin) xMin = x; if (x > xMax) xMax = x;
        if (y < yMin) yMin = y; if (y > yMax) yMax = y;
      }
      if (cmd.type === "Q" || cmd.type === "C") {
        const x1 = cmd.x1, y1 = cmd.y1;
        if (x1 < xMin) xMin = x1; if (x1 > xMax) xMax = x1;
        if (y1 < yMin) yMin = y1; if (y1 > yMax) yMax = y;
      }
      if (cmd.type === "C") {
        const x2 = cmd.x2, y2 = cmd.y2;
        if (x2 < xMin) xMin = x2; if (x2 > xMax) xMax = x2;
        if (y2 < yMin) yMin = y2; if (y2 > yMax) yMax = y2;
      }
    }
    if (!isFinite(xMin)) { xMin = 0; xMax = 0; yMin = 0; yMax = 0; }
    const lsb = this.leftSideBearing !== void 0 ? this.leftSideBearing : xMin;
    const metrics = {
      xMin,
      yMin,
      xMax,
      yMax,
      leftSideBearing: lsb,
      rightSideBearing: (this.advanceWidth || 0) - xMax
    };
    this._cachedMetrics = metrics;
    return metrics;
  };
  `;

    if (code.includes(getMetricsTarget) && code.includes(getMetricsSectionEnd)) {
        const start = code.indexOf(getMetricsTarget);
        const end = code.indexOf(getMetricsSectionEnd);
        code = code.slice(0, start) + getMetricsReplacement + code.slice(end);
        console.log("Patched Glyph.prototype.getMetrics in " + filePath);
    }

    // 7. Patch Font.prototype.toArrayBuffer for zero-copy ArrayBuffer extraction
    const toArrayBufferTarget = code.includes('  Font.prototype.toArrayBuffer = function() {') ? '  Font.prototype.toArrayBuffer = function() {' : 'Font.prototype.toArrayBuffer = function() {';
    const toArrayBufferSectionEnd = code.includes('  Font.prototype.download = function() {') ? '  Font.prototype.download = function() {' : 'Font.prototype.download = function() {';
    
    const toArrayBufferReplacement = `  Font.prototype.toArrayBuffer = function() {
    const sfntTable = this.toTables();
    const bytes = sfntTable.encode();
    if (typeof Buffer !== 'undefined') {
      const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    }
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
  };
  `;

    if (code.includes(toArrayBufferTarget) && code.includes(toArrayBufferSectionEnd)) {
        const start = code.indexOf(toArrayBufferTarget);
        const end = code.indexOf(toArrayBufferSectionEnd);
        code = code.slice(0, start) + toArrayBufferReplacement + code.slice(end);
        console.log("Patched Font.prototype.toArrayBuffer in " + filePath);
    }

    // 8. Patch fontToSfntTable globals to avoid Math.min/max stack overflow
    const sfntGlobalsTarget = `    const globals = {
      xMin: Math.min.apply(null, xMins),
      yMin: Math.min.apply(null, yMins),
      xMax: Math.max.apply(null, xMaxs),
      yMax: Math.max.apply(null, yMaxs),
      advanceWidthMax: Math.max.apply(null, advanceWidths),
      advanceWidthAvg: average(advanceWidths),
      minLeftSideBearing: Math.min.apply(null, leftSideBearings),
      maxLeftSideBearing: Math.max.apply(null, leftSideBearings),
      minRightSideBearing: Math.min.apply(null, rightSideBearings)
    };`;

    const sfntGlobalsReplace = `    function _arrMin(arr) {
      let m = Infinity;
      for (let i = 0; i < arr.length; i++) { if (arr[i] < m) m = arr[i]; }
      return m;
    }
    function _arrMax(arr) {
      let m = -Infinity;
      for (let i = 0; i < arr.length; i++) { if (arr[i] > m) m = arr[i]; }
      return m;
    }
    const globals = {
      xMin: _arrMin(xMins),
      yMin: _arrMin(yMins),
      xMax: _arrMax(xMaxs),
      yMax: _arrMax(yMaxs),
      advanceWidthMax: _arrMax(advanceWidths),
      advanceWidthAvg: average(advanceWidths),
      minLeftSideBearing: _arrMin(leftSideBearings),
      maxLeftSideBearing: _arrMax(leftSideBearings),
      minRightSideBearing: _arrMin(rightSideBearings)
    };`;

    // 8. Patch sfntGlobals calculation to avoid full font bounding box expansion from outlier glyphs
    const sfntGlobalsRegex = /([ \t]*)const globals = \{[\s\S]*?minRightSideBearing: Math\.min\.apply\(null, rightSideBearings\)[\s\S]*?\};/;
    const sfntGlobalsMatch = code.match(sfntGlobalsRegex);
    if (sfntGlobalsMatch) {
        const ind = sfntGlobalsMatch[1] || '    ';
        const sfntGlobalsReplace = `${ind}function _arrMin(arr) {
${ind}  let m = Infinity;
${ind}  for (let i = 0; i < arr.length; i++) { if (arr[i] < m) m = arr[i]; }
${ind}  return m;
${ind}}
${ind}function _arrMax(arr) {
${ind}  let m = -Infinity;
${ind}  for (let i = 0; i < arr.length; i++) { if (arr[i] > m) m = arr[i]; }
${ind}  return m;
${ind}}
${ind}const globals = {
${ind}  xMin: _arrMin(xMins),
${ind}  yMin: _arrMin(yMins),
${ind}  xMax: _arrMax(xMaxs),
${ind}  yMax: _arrMax(yMaxs),
${ind}  advanceWidthMax: _arrMax(advanceWidths),
${ind}  advanceWidthAvg: average(advanceWidths),
${ind}  minLeftSideBearing: _arrMin(leftSideBearings),
${ind}  maxLeftSideBearing: _arrMax(leftSideBearings),
${ind}  minRightSideBearing: _arrMin(rightSideBearings)
${ind}};`;
        code = code.replace(sfntGlobalsRegex, sfntGlobalsReplace);
        console.log("Patched sfntGlobals in " + filePath);
    }

    // 9. Patch font table pipeline for 100% Windows font installation validity
    const hheaOs2Regex = /(createdTimestamp: font\.createdTimestamp\s*\}\);\n)([\s\S]*?)(const sfntTable = makeSfntTable\(tables\);)/;
    const hheaOs2Match = code.match(hheaOs2Regex);
    if (hheaOs2Match) {
        const ind = '    ';
        const hheaOs2Replace = `$1${ind}const baseHhea = (font.tables && font.tables.hhea) || {};
${ind}const baseOs2 = (font.tables && font.tables.os2) || {};
${ind}const unitsPerEm = font.unitsPerEm || 1000;
${ind}const defaultAsc = Math.round(unitsPerEm * 0.80);
${ind}const defaultDesc = -Math.round(unitsPerEm * 0.20);
${ind}let typoAscender = baseOs2.sTypoAscender !== void 0 ? baseOs2.sTypoAscender : (font.ascender !== void 0 ? font.ascender : defaultAsc);
${ind}let typoDescender = baseOs2.sTypoDescender !== void 0 ? baseOs2.sTypoDescender : (font.descender !== void 0 ? font.descender : defaultDesc);
${ind}if (typoAscender <= 0 || typoAscender > unitsPerEm * 1.2) typoAscender = defaultAsc;
${ind}if (typoDescender >= 0 || typoDescender < -unitsPerEm * 0.6) typoDescender = defaultDesc;
${ind}const typoLineGap = baseOs2.sTypoLineGap !== void 0 ? baseOs2.sTypoLineGap : (baseHhea.lineGap !== void 0 ? baseHhea.lineGap : 0);

${ind}const hheaTable = hhea_default.make(Object.assign({}, baseHhea, {
${ind}  version: 65536,
${ind}  caretSlopeRise: (baseHhea.caretSlopeRise !== void 0 && !isNaN(baseHhea.caretSlopeRise)) ? baseHhea.caretSlopeRise : 1,
${ind}  caretSlopeRun: (baseHhea.caretSlopeRun !== void 0 && !isNaN(baseHhea.caretSlopeRun)) ? baseHhea.caretSlopeRun : 0,
${ind}  caretOffset: 0,
${ind}  lineGap: typoLineGap,
${ind}  ascender: typoAscender,
${ind}  descender: typoDescender,
${ind}  advanceWidthMax: globals.advanceWidthMax || Math.round(unitsPerEm * 0.6),
${ind}  minLeftSideBearing: globals.minLeftSideBearing || 0,
${ind}  minRightSideBearing: globals.minRightSideBearing || 0,
${ind}  xMaxExtent: (globals.maxLeftSideBearing || 0) + ((globals.xMax || unitsPerEm) - (globals.xMin || 0)),
${ind}  numberOfHMetrics: font.glyphs.length
${ind}}));
${ind}const maxpTable = maxp_default.make(font.glyphs.length);

${ind}// Harmonize usWinAscent and usWinDescent to prevent huge or tiny caret/cursor
${ind}// Set fsSelection bit 7 (USE_TYPO_METRICS = 128) and bit 6 (REGULAR = 64)
${ind}const fsSel = (((baseOs2.fsSelection !== void 0 ? baseOs2.fsSelection : font.fsSelection) || 0) | 128 | 64);
${ind}const winAscCandidate = baseOs2.usWinAscent !== void 0 ? baseOs2.usWinAscent : typoAscender;
${ind}const safeWinAscent = Math.max(typoAscender, Math.min(winAscCandidate, Math.round(unitsPerEm * 0.95)));
${ind}const winDescCandidate = baseOs2.usWinDescent !== void 0 ? baseOs2.usWinDescent : Math.abs(typoDescender);
${ind}const safeWinDescent = Math.max(Math.abs(typoDescender), Math.min(winDescCandidate, Math.round(unitsPerEm * 0.28)));
${ind}const safeWeight = (baseOs2.usWeightClass && baseOs2.usWeightClass > 0) ? baseOs2.usWeightClass : 400;
${ind}const safeWidth = (baseOs2.usWidthClass && baseOs2.usWidthClass >= 1 && baseOs2.usWidthClass <= 9) ? baseOs2.usWidthClass : 5;

${ind}const os2Table = os2_default.make(Object.assign({}, baseOs2, {
${ind}  version: 3,
${ind}  xAvgCharWidth: Math.round(globals.advanceWidthAvg || (unitsPerEm * 0.5)),
${ind}  usWeightClass: safeWeight,
${ind}  usWidthClass: safeWidth,
${ind}  fsType: 0, // 0 = Installable embedding (critical for Windows font installation!)
${ind}  usFirstCharIndex: firstCharIndex || 32,
${ind}  usLastCharIndex: Math.min(65535, lastCharIndex || 65535),
${ind}  ulUnicodeRange1: baseOs2.ulUnicodeRange1 || ulUnicodeRange1 || 1,
${ind}  ulUnicodeRange2: baseOs2.ulUnicodeRange2 || ulUnicodeRange2 || 0,
${ind}  ulUnicodeRange3: baseOs2.ulUnicodeRange3 || ulUnicodeRange3 || 0,
${ind}  ulUnicodeRange4: baseOs2.ulUnicodeRange4 || ulUnicodeRange4 || 0,
${ind}  sTypoAscender: typoAscender,
${ind}  sTypoDescender: typoDescender,
${ind}  sTypoLineGap: typoLineGap,
${ind}  usWinAscent: safeWinAscent,
${ind}  usWinDescent: safeWinDescent,
${ind}  fsSelection: fsSel,
${ind}  achVendID: "NONE",
${ind}  ulCodePageRange1: baseOs2.ulCodePageRange1 || 1,
${ind}  ulCodePageRange2: baseOs2.ulCodePageRange2 || 0,
${ind}  sxHeight: metricsForChar(font, "xyvw", { yMax: Math.round(globals.ascender / 2) }).yMax || Math.round(unitsPerEm * 0.5),
${ind}  sCapHeight: metricsForChar(font, "HIKLEFJMNTZBDPRAGOQSUVWXY", globals).yMax || Math.round(unitsPerEm * 0.7),
${ind}  usDefaultChar: 0,
${ind}  usBreakChar: 32,
${ind}  usMaxContext: 0
${ind}}));

${ind}const hmtxTable = hmtx_default.make(font.glyphs);
${ind}const cmapTable = cmap_default.make(font.glyphs);

${ind}const englishFamilyName = (font.getEnglishName("fontFamily") || "FusedFont").trim();
${ind}const englishStyleName = (font.getEnglishName("fontSubfamily") || "Regular").trim();
${ind}const englishFullName = englishFamilyName + (englishStyleName.toLowerCase() === "regular" ? " Regular" : " " + englishStyleName);
${ind}let postScriptName = font.getEnglishName("postScriptName") || (englishFamilyName.replace(/[\\s\\W]/g, "") + "-" + englishStyleName.replace(/[\\s\\W]/g, ""));
${ind}postScriptName = postScriptName.replace(/[^a-zA-Z0-9_-]/g, "");
${ind}if (!postScriptName || postScriptName.includes("undefined")) {
${ind}  postScriptName = "FusedFont-Regular";
${ind}}
${ind}if (postScriptName.length > 63) {
${ind}  postScriptName = postScriptName.substring(0, 63);
${ind}}
${ind}const uniqueID = "1.000;NONE;" + postScriptName;
${ind}const versionStr = "Version 1.000";

${ind}// Only create Windows (platform 3) and Macintosh (platform 1) records
${ind}// NEVER create Unicode (platform 0) records as they trigger the non-standard Apple 'ltag' table!
${ind}const names = {
${ind}  windows: {
${ind}    fontFamily: { en: englishFamilyName },
${ind}    fontSubfamily: { en: englishStyleName },
${ind}    uniqueID: { en: uniqueID },
${ind}    fullName: { en: englishFullName },
${ind}    version: { en: versionStr },
${ind}    postScriptName: { en: postScriptName },
${ind}    preferredFamily: { en: englishFamilyName },
${ind}    preferredSubfamily: { en: englishStyleName },
${ind}    description: { en: "Fused by AI Studio" }
${ind}  },
${ind}  macintosh: {
${ind}    fontFamily: { en: englishFamilyName },
${ind}    fontSubfamily: { en: englishStyleName },
${ind}    uniqueID: { en: uniqueID },
${ind}    fullName: { en: englishFullName },
${ind}    version: { en: versionStr },
${ind}    postScriptName: { en: postScriptName },
${ind}    preferredFamily: { en: englishFamilyName },
${ind}    preferredSubfamily: { en: englishStyleName },
${ind}    description: { en: "Fused by AI Studio" }
${ind}  }
${ind}};

${ind}const languageTags = [];
${ind}const nameTable = name_default.make(names, languageTags);
${ind}const postTable = post_default.make(font);

${ind}const cffTable = cff_default.make(font.glyphs, {
${ind}  version: "1.000",
${ind}  fullName: englishFullName,
${ind}  familyName: englishFamilyName,
${ind}  weightName: englishStyleName,
${ind}  postScriptName: postScriptName,
${ind}  unitsPerEm: unitsPerEm,
${ind}  fontBBox: [0, globals.yMin, globals.ascender, globals.advanceWidthMax],
${ind}  topDict: {}
${ind}});

${ind}const dsigTable = new table_default.Table("DSIG", [
${ind}  { name: "version", type: "ULONG", value: 1 },
${ind}  { name: "numSigs", type: "USHORT", value: 0 },
${ind}  { name: "flags", type: "USHORT", value: 0 }
${ind}]);

${ind}// Color update tables support (SVG in OpenType, COLR, CPAL, and CAPL)
${ind}const colorTables = [];
${ind}if (font.tables) {
${ind}  // 1. CPAL (Color Palette Table)
${ind}  const cpalSrc = font.tables.cpal || font.tables.CPAL;
${ind}  if (cpalSrc) {
${ind}    if (cpalSrc.tableName === "CPAL" && typeof cpalSrc.encode === "function") {
${ind}      colorTables.push(cpalSrc);
${ind}    } else if (cpalSrc.colorRecords && cpalSrc.colorRecords.length > 0) {
${ind}      try {
${ind}        colorTables.push(cpal_default.make(cpalSrc));
${ind}      } catch (e) {
${ind}        console.warn("Failed to encode CPAL table:", e);
${ind}      }
${ind}    }
${ind}  }
${ind}  // 1b. CAPL (Color Palette Table alias/specification)
${ind}  const caplSrc = font.tables.capl || font.tables.CAPL;
${ind}  if (caplSrc) {
${ind}    if (caplSrc.tableName === "CAPL" && typeof caplSrc.encode === "function") {
${ind}      colorTables.push(caplSrc);
${ind}    } else if (caplSrc.colorRecords && caplSrc.colorRecords.length > 0) {
${ind}      try {
${ind}        const caplTable = cpal_default.make(caplSrc);
${ind}        caplTable.tableName = "CAPL";
${ind}        colorTables.push(caplTable);
${ind}      } catch (e) {
${ind}        console.warn("Failed to encode CAPL table:", e);
${ind}      }
${ind}    }
${ind}  }
${ind}  // 2. COLR (Color Layers Table - COLRv0 Compatibility)
${ind}  const colrSrc = font.tables.colr || font.tables.COLR;
${ind}  if (colrSrc) {
${ind}    if (colrSrc.tableName === "COLR" && typeof colrSrc.encode === "function") {
${ind}      colorTables.push(colrSrc);
${ind}    } else if (colrSrc.baseGlyphRecords && colrSrc.baseGlyphRecords.length > 0) {
${ind}      try {
${ind}        // Strict COLRv0 specification: version 0 and baseGlyphRecords sorted ascending by glyphID
${ind}        const sortedBases = [...colrSrc.baseGlyphRecords].sort((a, b) => a.glyphID - b.glyphID);
${ind}        colorTables.push(colr_default.make({
${ind}          version: 0,
${ind}          baseGlyphRecords: sortedBases,
${ind}          layerRecords: colrSrc.layerRecords || []
${ind}        }));
${ind}      } catch (e) {
${ind}        console.warn("Failed to encode COLRv0 table:", e);
${ind}      }
${ind}    }
${ind}  }
${ind}  // 3. SVG (SVG in OpenType Table)
${ind}  const svgSrc = font.tables.svg || font.tables.SVG || font.tables["SVG "];
${ind}  if (svgSrc) {
${ind}    if (svgSrc.tableName === "SVG " && typeof svgSrc.encode === "function") {
${ind}      colorTables.push(svgSrc);
${ind}    } else if (svgSrc instanceof Map ? svgSrc.size > 0 : (typeof svgSrc === "object" && Object.keys(svgSrc).length > 0)) {
${ind}      try {
${ind}        const svgMap = svgSrc instanceof Map ? svgSrc : new Map(Object.entries(svgSrc).map(([k, v]) => [Number(k), typeof v === "string" ? new TextEncoder().encode(v) : v]));
${ind}        colorTables.push(svg_default.make(svgMap));
${ind}      } catch (e) {
${ind}        console.warn("Failed to encode SVG table:", e);
${ind}      }
${ind}    }
${ind}  }
${ind}}

${ind}const tables = [headTable, hheaTable, maxpTable, os2Table, nameTable, cmapTable, postTable, cffTable, hmtxTable, dsigTable, ...colorTables];
${ind}const sfntTable = makeSfntTable(tables);`;
        code = code.replace(hheaOs2Regex, hheaOs2Replace);
        console.log("Patched font table pipeline in " + filePath);
    }

    // 10. Export Table, colr, cpal, capl, svg on opentype
    if (code.includes('BoundingBox: () => bbox_default,') && !code.includes('colr: () => colr_default')) {
        code = code.replace(
            'BoundingBox: () => bbox_default,',
            'BoundingBox: () => bbox_default,\n    Table: () => table_default.Table,\n    table: () => table_default,\n    colr: () => colr_default,\n    cpal: () => cpal_default,\n    capl: () => cpal_default,\n    svg: () => svg_default,'
        );
    }
    if (code.includes('bbox_default as BoundingBox,') && !code.includes('colr_default as colr')) {
        code = code.replace(
            'bbox_default as BoundingBox,',
            'bbox_default as BoundingBox,\n  table_default as table,\n  colr_default as colr,\n  cpal_default as cpal,\n  cpal_default as capl,\n  svg_default as svg,'
        );
    }

    // 11. Resilient table decompression & parsing (never crash on missing/corrupt table entries)
    const uncompressTarget = `  function uncompressTable(data, tableEntry) {
    if (tableEntry.compression === "WOFF") {`;
    const uncompressReplace = `  function uncompressTable(data, tableEntry) {
    if (!tableEntry) return { data, offset: 0 };
    if (tableEntry.compression === "WOFF") {`;
    if (code.includes(uncompressTarget)) {
        code = code.replace(uncompressTarget, uncompressReplace);
    }

    const nameTableParseTarget = `    const nameTable = uncompressTable(data, nameTableEntry);
    font.tables.name = name_default.parse(nameTable.data, nameTable.offset, ltagTable);
    font.names = font.tables.name;`;
    const nameTableParseReplace = `    if (nameTableEntry) {
      try {
        const nameTable = uncompressTable(data, nameTableEntry);
        font.tables.name = name_default.parse(nameTable.data, nameTable.offset, ltagTable);
        font.names = font.tables.name;
      } catch (ne) {
        font.tables.name = {};
        font.names = {};
      }
    } else {
      font.tables.name = {};
      font.names = {};
    }`;
    if (code.includes(nameTableParseTarget)) {
        code = code.replace(nameTableParseTarget, nameTableParseReplace);
    }

    fs.writeFileSync(filePath, code);
    console.log("Patched file successfully: " + filePath);
}

function runAll() {
    applyPatches('node_modules/opentype.js/dist/opentype.js');
    if (fs.existsSync('node_modules/opentype.js/dist/opentype.mjs')) {
        applyPatches('node_modules/opentype.js/dist/opentype.mjs');
    }
}

runAll();
