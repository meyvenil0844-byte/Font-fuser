
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

const { parentPort, workerData } = require('worker_threads');
const opentype = require('opentype.js');
const fs = require('fs');
const path = require('path');

function scalePath(path, scale, isCFF) {
  const newPath = new opentype.Path();
  for (const cmd of path.commands) {
     if (cmd.type === 'M') newPath.moveTo(Math.round(cmd.x * scale), Math.round(cmd.y * scale));
     else if (cmd.type === 'L') newPath.lineTo(Math.round(cmd.x * scale), Math.round(cmd.y * scale));
     else if (cmd.type === 'Q') newPath.quadraticCurveTo(Math.round(cmd.x1 * scale), Math.round(cmd.y1 * scale), Math.round(cmd.x * scale), Math.round(cmd.y * scale));
     else if (cmd.type === 'C') newPath.curveTo(Math.round(cmd.x1 * scale), Math.round(cmd.y1 * scale), Math.round(cmd.x2 * scale), Math.round(cmd.y2 * scale), Math.round(cmd.x * scale), Math.round(cmd.y * scale));
     else if (cmd.type === 'Z') newPath.close();
  }
  return newPath;
}

try {
  const { glyphMap, baseFontId, serverFontIds, uploadDir } = workerData;
  
  const parsedFonts = new Map();
  let baseFontParsed = null;
  
  for (const [clientId, serverFilename] of Object.entries(serverFontIds)) {
    const filePath = path.join(uploadDir, serverFilename);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Uploaded font file missing for ${clientId}`);
    }
    const buffer = fs.readFileSync(filePath);
    const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    
    const font = opentype.parse(ab);
    parsedFonts.set(clientId, font);
    if (clientId === baseFontId) baseFontParsed = font;
  }
  
  if (!baseFontParsed) throw new Error('Failed to parse base font');
  
  const targetUnitsPerEm = baseFontParsed.unitsPerEm;
  const isCFF = true;
  const newGlyphs = [];
  
  for (let i = 0; i < baseFontParsed.glyphs.length; i++) {
    newGlyphs.push(baseFontParsed.glyphs.get(i));
  }
  
  const mappedCodepoints = new Set(Object.keys(glyphMap).map(Number));
  let missingCount = 0;
  let hitLimit = false;
  let processed = 0;
  
  for (const cp of mappedCodepoints) {
    const targetFontId = glyphMap[String(cp)];
    const targetFont = parsedFonts.get(targetFontId);
    if (!targetFont) continue;
    
    let sourceGlyphIndex = targetFont.charToGlyphIndex(String.fromCodePoint(cp));
    if (!sourceGlyphIndex || sourceGlyphIndex <= 0) { 
      if (targetFont.names && targetFont.names.fontFamily && targetFont.names.fontFamily.en === 'TracedFont') {
        sourceGlyphIndex = targetFont.charToGlyphIndex('A');
      }
    }
    if (!sourceGlyphIndex || sourceGlyphIndex <= 0) { 
       missingCount++; continue; 
    }
    
    let baseGlyphIndex = baseFontParsed.charToGlyphIndex(String.fromCodePoint(cp));
    const sourceGlyph = targetFont.glyphs.get(sourceGlyphIndex);
    const scale = targetUnitsPerEm / targetFont.unitsPerEm;
    
    const newGlyph = new opentype.Glyph({
      name: cp === 0 ? '.null' : (sourceGlyph.name || `uni${cp.toString(16).toUpperCase()}`),
      unicode: cp,
      advanceWidth: Math.round((sourceGlyph.advanceWidth || 0) * scale),
      path: scalePath(sourceGlyph.path, scale, isCFF)
    });
    
    if (baseGlyphIndex > 0) {
      const oldGlyph = newGlyphs[baseGlyphIndex];
      let onlyUsedByCp = false;
      if (!oldGlyph.unicodes || oldGlyph.unicodes.length <= 1) onlyUsedByCp = true;
      
      if (onlyUsedByCp) {
        newGlyphs[baseGlyphIndex] = newGlyph;
      } else {
        oldGlyph.unicodes = oldGlyph.unicodes.filter((u) => u !== cp);
        if (oldGlyph.unicode === cp) {
          oldGlyph.unicode = oldGlyph.unicodes && oldGlyph.unicodes.length > 0 ? oldGlyph.unicodes[0] : undefined;
        }
        if (newGlyphs.length < 65535) newGlyphs.push(newGlyph); else hitLimit = true;
      }
    } else {
      if (newGlyphs.length < 65535) newGlyphs.push(newGlyph); else hitLimit = true;
    }
    
    processed++;
    if (processed % 500 === 0) parentPort.postMessage({ type: 'progress', message: `Fused ${processed} / ${mappedCodepoints.size}` });
  }
  
  parentPort.postMessage({ type: 'progress', message: 'Generating final font buffer...' });
  
  const newFont = new opentype.Font({
    familyName: "FusedFont",
    styleName: 'Regular',
    unitsPerEm: targetUnitsPerEm,
    ascender: baseFontParsed.ascender,
    descender: baseFontParsed.descender,
    glyphs: newGlyphs,
  });
  
  const metaPayload = JSON.stringify({ glyphMap: glyphMap });
  for (const platform of ['macintosh', 'windows', 'unicode']) {
    if (newFont.names[platform]) {
      newFont.names[platform].description = { en: metaPayload };
    }
  }
  
  newFont.outlinesFormat = 'truetype';
  
  parsedFonts.clear();
  baseFontParsed = null;
  if (typeof global.gc === 'function') {
    global.gc();
  }
  
  const buffer = newFont.toArrayBuffer();
  
  const outputFilename = 'FusedFont_' + Date.now() + '.ttf';
  const outputPath = path.join(uploadDir, outputFilename);
  fs.writeFileSync(outputPath, Buffer.from(buffer));
  
  parentPort.postMessage({ type: 'done', file: outputPath, originalName: 'FusedFont.ttf' });
  
} catch (err) {
  parentPort.postMessage({ type: 'error', message: err.message || String(err), stack: err.stack });
}
