
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

process.on('message', (workerData) => {
try {
  let { glyphMap, baseFontId, serverFontIds, uploadDir } = workerData;
  
  let baseFontParsed = null;
  {
    const serverFilename = serverFontIds[baseFontId];
    if (!serverFilename) throw new Error("Base font missing");
    const filePath = path.join(uploadDir, serverFilename);
    if (!fs.existsSync(filePath)) throw new Error("Base font file missing");
    let buffer = fs.readFileSync(filePath);
    let ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    baseFontParsed = opentype.parse(ab);
    buffer = null;
    ab = null;
    if (typeof global.gc === 'function') global.gc();
  }
  
  // Cache for target fonts to avoid memory bloat
  let parsedFontsCache = new Map();
  const MAX_CACHE = 1;
  
  function getTargetFont(clientId) {
    if (parsedFontsCache.has(clientId)) return parsedFontsCache.get(clientId);
    const serverFilename = serverFontIds[clientId];
    if (!serverFilename) return null;
    const filePath = path.join(uploadDir, serverFilename);
    if (!fs.existsSync(filePath)) return null;
    
    let buffer = fs.readFileSync(filePath);
    let ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const font = opentype.parse(ab);
    buffer = null;
    ab = null;
    
    if (parsedFontsCache.size >= MAX_CACHE) {
      const firstKey = parsedFontsCache.keys().next().value;
      parsedFontsCache.delete(firstKey);
    }
    parsedFontsCache.set(clientId, font);
    return font;
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
      
    const memBefore = process.memoryUsage();
    process.send({ type: 'progress', message: `Loading target font ${targetFontId} (Mem: ${Math.round(memBefore.heapUsed/1024/1024)}MB)` });
    const targetFont = getTargetFont(targetFontId);

      if (!targetFont) continue;
      
      for (const cp of cps) {
    
    let sourceGlyphIndex = targetFont.charToGlyphIndex(String.fromCodePoint(cp));
    if (!sourceGlyphIndex || sourceGlyphIndex <= 0) { 
       if (targetFont.names && targetFont.names.fontFamily && targetFont.names.fontFamily.en === 'TracedFont') {
        sourceGlyphIndex = targetFont.charToGlyphIndex('A');
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
          const fg = fallbackFont.charToGlyph(String.fromCodePoint(cp));
          if (fg && fg.path && fg.path.commands && fg.path.commands.length > 0) {
            isSourceValid = true;
          }
        }
    }
    
    if (!isSourceValid) {
        missingCount++; continue; 
    }
    
    let baseGlyphIndex = baseFontParsed.charToGlyphIndex(String.fromCodePoint(cp));
    if (cp === 0xFFFD && (!baseGlyphIndex || baseGlyphIndex <= 0)) {
        baseGlyphIndex = 0; 
    }

    const sourceGlyph = (sourceGlyphIndex > 0 || sourceGlyphIndex === 0) ? targetFont.glyphs.get(sourceGlyphIndex) : null;
    const scale = targetUnitsPerEm / targetFont.unitsPerEm;
    
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
      let scaledPath = sourceGlyph ? scalePath(sourceGlyph.path, scale, isCFF) : new opentype.Path();
      let advanceW = sourceGlyph ? Math.round((sourceGlyph.advanceWidth || 0) * scale) : 0;
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
          const fg = fallbackFont.charToGlyph(String.fromCodePoint(cp));
          if (fg && fg.path && fg.path.commands && fg.path.commands.length > 0) {
            const fScale = targetUnitsPerEm / fallbackFont.unitsPerEm;
            scaledPath = scalePath(fg.path, fScale, isCFF);
            advanceW = Math.round((fg.advanceWidth || 0) * fScale);
          }
        }
      }
      const tempGlyph = new opentype.Glyph({
        name: cp === 0 ? '.null' : (sourceGlyph?.name || `uni${cp.toString(16).toUpperCase()}`),
        unicode: cp,
        advanceWidth: advanceW,
        path: scaledPath
      });
      const metrics = tempGlyph.getMetrics();
      let rawCharString = null;
      try {
        const ops = opentype._glyphToOps(tempGlyph, 1);
        rawCharString = opentype._encodeCHARSTRING(ops);
      } catch (e) {}
      
      targetFont.precompiledCache.set(sourceGlyphIndex, {
        metrics,
        advanceWidth: tempGlyph.advanceWidth,
        rawCharString
      });
      
      newGlyph = tempGlyph;
      newGlyph._cachedMetrics = metrics;
      newGlyph._rawCharString = rawCharString;
      newGlyph.path.commands = [];
    }
    
    let replaceExisting = false;
    if (baseGlyphIndex > 0) {
        replaceExisting = true;
    }

    if (replaceExisting) {
      const oldGlyph = baseFontParsed.glyphs.get(baseGlyphIndex);
      let onlyUsedByCp = false;
      if (!oldGlyph || !oldGlyph.unicodes || oldGlyph.unicodes.length <= 1) onlyUsedByCp = true;
      
      if (onlyUsedByCp) {
        newGlyph.index = baseGlyphIndex;
        baseFontParsed.glyphs.glyphs[baseGlyphIndex] = newGlyph;
      } else {
        if (oldGlyph.unicodes) {
          oldGlyph.unicodes = oldGlyph.unicodes.filter((u) => u !== cp);
        }
        if (oldGlyph.unicode === cp) {
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
    if (processed % 500 === 0) {
      if (typeof global.gc === 'function') global.gc();
      const mem = process.memoryUsage();
      process.send({ type: 'progress', message: `Fused ${processed} / ${mappedCodepoints.size} (Mem: ${Math.round(mem.heapUsed/1024/1024)}MB)` });
    }
    } // End of cp loop
    if (targetFont) targetFont.precompiledCache = null;
    parsedFontsCache.clear();
    if (typeof global.gc === 'function') global.gc();
  } // End of targetFontId loop
  
  
    if (typeof global.gc === 'function') {
        global.gc();
        global.gc();
    }
    const memUsage = process.memoryUsage();
    process.send({ type: 'progress', message: 'Generating final font buffer... (Mem: ' + Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB / ' + Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB)' });

  
  // 1. Ensure Glyph 0 is strictly .notdef and unmapped in cmap
  if (baseFontParsed.glyphs && baseFontParsed.glyphs.length > 0) {
    const g0 = baseFontParsed.glyphs.get(0);
    if (g0) {
      g0.name = '.notdef';
      g0.unicode = undefined;
      g0.unicodes = [];
      if (!g0.path || !g0.path.commands || g0.path.commands.length === 0) {
        const notdefP = new opentype.Path();
        notdefP.moveTo(80, 0); notdefP.lineTo(520, 0); notdefP.lineTo(520, 750); notdefP.lineTo(80, 750); notdefP.close();
        notdefP.moveTo(140, 60); notdefP.lineTo(140, 690); notdefP.lineTo(460, 690); notdefP.lineTo(460, 60); notdefP.close();
        g0.path = notdefP;
        g0.advanceWidth = 600;
      }
    }
  }

  // 2. Ensure Space (Unicode 32, 0x0020) exists (Windows strictly requires space glyph)
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

  // 3. Clean and synchronize Name Table for 100% Windows installation compliance
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
  
  // Normalize any caret glyphs (0x005E, 0x02C6, 0x2038, 0x2041, 0x2303) in baseFontParsed
  const caretCodepoints = [0x005E, 0x02C6, 0x2038, 0x2041, 0x2303];
  for (const cCode of caretCodepoints) {
    const cIdx = baseFontParsed.charToGlyphIndex(String.fromCodePoint(cCode));
    if (cIdx && cIdx > 0) {
      const g = baseFontParsed.glyphs.get(cIdx);
      if (g && g.path && g.path.commands && g.path.commands.length > 0) {
        const norm = normalizeCaretPath(g.path, g.advanceWidth || 0, targetUnitsPerEm);
        if (norm.path !== g.path) {
          g.path = norm.path;
          g.advanceWidth = norm.advanceWidth;
          g._cachedMetrics = null;
          g._rawCharString = null;
          try {
            const ops = opentype._glyphToOps(g, 1);
            g._rawCharString = opentype._encodeCHARSTRING(ops);
          } catch (e) {}
        }
      }
    }
  }

  // Ensure Arabic Tatweel (U+0640) has a proper fixed baseline connecting elongation
  const tatweelIdx = baseFontParsed.charToGlyphIndex(String.fromCodePoint(0x0640));
  if (tatweelIdx && tatweelIdx > 0) {
    const g = baseFontParsed.glyphs.get(tatweelIdx);
    if (!g || !g.path || !g.path.commands || g.path.commands.length === 0) {
      const fixedTatweel = generateFixedTatweelGlyph(targetUnitsPerEm);
      g.path = fixedTatweel.path;
      g.advanceWidth = fixedTatweel.advanceWidth;
      g._cachedMetrics = null;
      g._rawCharString = null;
      try {
        const ops = opentype._glyphToOps(g, 1);
        g._rawCharString = opentype._encodeCHARSTRING(ops);
      } catch (e) {}
    }
  }

  // Ensure U+0338 (Combining Long Solidus Overlay) exists with strictly 0 advanceWidth and centered overlay positioning
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
      const ops = opentype._glyphToOps(g, 1);
      g._rawCharString = opentype._encodeCHARSTRING(ops);
    } catch(e) {}
    if (baseFontParsed.glyphs.length < 65535) {
      g.index = baseFontParsed.glyphs.length;
      baseFontParsed.glyphs.glyphs[baseFontParsed.glyphs.length] = g;
      baseFontParsed.glyphs.length++;
    }
  } else {
    const g = baseFontParsed.glyphs.get(solidusIdx);
    const norm = normalizeCombiningOverlayPath(g.path, g.advanceWidth, targetUnitsPerEm);
    g.path = norm.path;
    g.advanceWidth = 0;
    g._cachedMetrics = null;
    g._rawCharString = null;
    try {
      const ops = opentype._glyphToOps(g, 1);
      g._rawCharString = opentype._encodeCHARSTRING(ops);
    } catch (e) {}
  }

  // Ensure negated math symbols (⊄, ⊈, ≠, etc.) and their base symbols are paired properly
  for (const [negStr, baseStr] of Object.entries(NEGATED_MATH_MAP)) {
    const negCp = Number(negStr);
    const baseCp = Number(baseStr);
    const baseIdx = baseFontParsed.charToGlyphIndex(String.fromCodePoint(baseCp));
    const negIdx = baseFontParsed.charToGlyphIndex(String.fromCodePoint(negCp));
    
    // If base exists, but negated doesn't: synthesize negated glyph
    if (baseIdx > 0 && (!negIdx || negIdx <= 0)) {
      const baseG = baseFontParsed.glyphs.get(baseIdx);
      if (baseG && baseG.path && baseG.path.commands && baseG.path.commands.length > 0) {
        const advW = baseG.advanceWidth || Math.round(targetUnitsPerEm * 0.6);
        const p = new opentype.Path();
        for (const cmd of baseG.path.commands) {
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
          const ops = opentype._glyphToOps(synthGlyph, 1);
          synthGlyph._rawCharString = opentype._encodeCHARSTRING(ops);
        } catch(e) {}
        if (baseFontParsed.glyphs.length < 65535) {
          synthGlyph.index = baseFontParsed.glyphs.length;
          baseFontParsed.glyphs.glyphs[baseFontParsed.glyphs.length] = synthGlyph;
          baseFontParsed.glyphs.length++;
        }
      }
    }
  }

  // Ensure any Duployan glyphs present in baseFontParsed have visible outlines
  for (let cp = 0x1BC00; cp <= 0x1BCA3; cp++) {
    const idx = baseFontParsed.charToGlyphIndex(String.fromCodePoint(cp));
    if (idx > 0) {
      const g = baseFontParsed.glyphs.get(idx);
      if (!g || !g.path || !g.path.commands || g.path.commands.length === 0) {
        const fallbackFont = getDuployanFallbackFont();
        if (fallbackFont) {
          const fg = fallbackFont.charToGlyph(String.fromCodePoint(cp));
          if (fg && fg.path && fg.path.commands && fg.path.commands.length > 0) {
            const fScale = targetUnitsPerEm / fallbackFont.unitsPerEm;
            g.path = scalePath(fg.path, fScale, isCFF);
            g.advanceWidth = Math.round((fg.advanceWidth || 0) * fScale);
            g._cachedMetrics = null;
            g._rawCharString = null;
          }
        }
      }
    }
  }

  // 4. Sanitize every glyph in baseFontParsed for strict CFF and Windows validation
  for (let i = 0; i < baseFontParsed.glyphs.length; i++) {
    const g = baseFontParsed.glyphs.get(i);
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

    if (typeof g.path === 'function') {
      try { g.path = g.path(); } catch(e) { g.path = new opentype.Path(); }
    }
    if (!g.path) g.path = new opentype.Path();
    if (!Array.isArray(g.path.commands)) g.path.commands = [];

    let hasInvalidCoord = false;
    for (const cmd of g.path.commands) {
      if (!cmd) continue;
      if (cmd.x !== undefined && (!isFinite(cmd.x) || isNaN(cmd.x))) { cmd.x = 0; hasInvalidCoord = true; }
      if (cmd.y !== undefined && (!isFinite(cmd.y) || isNaN(cmd.y))) { cmd.y = 0; hasInvalidCoord = true; }
      if (cmd.x1 !== undefined && (!isFinite(cmd.x1) || isNaN(cmd.x1))) { cmd.x1 = 0; hasInvalidCoord = true; }
      if (cmd.y1 !== undefined && (!isFinite(cmd.y1) || isNaN(cmd.y1))) { cmd.y1 = 0; hasInvalidCoord = true; }
      if (cmd.x2 !== undefined && (!isFinite(cmd.x2) || isNaN(cmd.x2))) { cmd.x2 = 0; hasInvalidCoord = true; }
      if (cmd.y2 !== undefined && (!isFinite(cmd.y2) || isNaN(cmd.y2))) { cmd.y2 = 0; hasInvalidCoord = true; }
    }
    if (hasInvalidCoord) {
      g._rawCharString = null;
    }

    if (!g._rawCharString) {
      try {
        const ops = opentype._glyphToOps(g, 1);
        g._rawCharString = opentype._encodeCHARSTRING(ops);
      } catch (e) {
        const emptyOps = [
          { name: "width", type: "NUMBER", value: g.advanceWidth || 500 },
          { name: "endchar", type: "OP", value: 14 }
        ];
        g._rawCharString = opentype._encodeCHARSTRING(emptyOps);
      }
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

  // COLOR UPDATE: Preserve and merge SVG in OpenType, COLR (COLRv0), CPAL, and CAPL font tables
  try {
    let mergeColorTablesFn = null;
    try {
      mergeColorTablesFn = require('./src/lib/colorFontUtils.ts').mergeColorTables;
    } catch (e1) {
      try {
        mergeColorTablesFn = require('./src/lib/colorFontUtils').mergeColorTables;
      } catch (e2) {}
    }
    if (mergeColorTablesFn) {
      const allGlyphsList = [];
      if (baseFontParsed.glyphs && baseFontParsed.glyphs.length) {
        for (let gi = 0; gi < baseFontParsed.glyphs.length; gi++) {
          allGlyphsList.push(baseFontParsed.glyphs.get(gi));
        }
      }
      const colorTablesMerged = mergeColorTablesFn(baseFontParsed, parsedFontsCache, glyphMap, allGlyphsList);
      if (colorTablesMerged && colorTablesMerged.hasColor) {
        if (colorTablesMerged.cpalTable) {
          baseFontParsed.tables.cpal = colorTablesMerged.cpalTable;
          baseFontParsed.tables.capl = colorTablesMerged.caplTable;
          baseFontParsed.tables.CPAL = colorTablesMerged.cpalTable;
          baseFontParsed.tables.CAPL = colorTablesMerged.caplTable;
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
  
  const buffer = baseFontParsed.toArrayBuffer();
  const outputFilename = 'FusedFont_' + Date.now() + '.otf';
  const outputPath = path.join(uploadDir, outputFilename);
  fs.writeFileSync(outputPath, Buffer.from(buffer));
  
  process.send({ type: 'done', file: outputPath, originalName: 'FusedFont.otf' });
  setTimeout(() => process.exit(0), 100);
  
} catch (err) {
  process.send({ type: 'error', message: err.message || String(err), stack: err.stack });
  setTimeout(() => process.exit(1), 100);
}
});
