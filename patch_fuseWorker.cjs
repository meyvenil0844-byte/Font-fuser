const fs = require('fs');

let code = fs.readFileSync('fuseWorker.cjs', 'utf8');

const targetStart = `  const targetUnitsPerEm = baseFontParsed.unitsPerEm;`;
const targetEnd = `  const buffer = newFont.toArrayBuffer();`;

const replacement = `  const targetUnitsPerEm = baseFontParsed.unitsPerEm;
  const isCFF = true;
  
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
    
    // Explicitly handle .notdef (FFFD)
    if ((!sourceGlyphIndex || sourceGlyphIndex <= 0) && cp === 0xFFFD) {
       sourceGlyphIndex = 0; 
    }

    if (sourceGlyphIndex === undefined || sourceGlyphIndex < 0) {
        missingCount++; continue; 
    }
    
    let baseGlyphIndex = baseFontParsed.charToGlyphIndex(String.fromCodePoint(cp));
    if (cp === 0xFFFD && (!baseGlyphIndex || baseGlyphIndex <= 0)) {
        baseGlyphIndex = 0; 
    }

    const sourceGlyph = targetFont.glyphs.get(sourceGlyphIndex);
    const scale = targetUnitsPerEm / targetFont.unitsPerEm;
    
    const newGlyph = new opentype.Glyph({
      name: cp === 0 ? '.null' : (sourceGlyph.name || \`uni\${cp.toString(16).toUpperCase()}\`),
      unicode: cp,
      advanceWidth: Math.round((sourceGlyph.advanceWidth || 0) * scale),
      path: scalePath(sourceGlyph.path, scale, isCFF)
    });
    
    if (baseGlyphIndex >= 0) {
      baseFontParsed.glyphs.get(baseGlyphIndex); // cache it
      const oldGlyph = baseFontParsed.glyphs.glyphs[baseGlyphIndex];
      let onlyUsedByCp = false;
      if (!oldGlyph.unicodes || oldGlyph.unicodes.length <= 1) onlyUsedByCp = true;
      
      if (onlyUsedByCp || baseGlyphIndex === 0) {
        baseFontParsed.glyphs.glyphs[baseGlyphIndex] = newGlyph;
      } else {
        oldGlyph.unicodes = oldGlyph.unicodes.filter((u) => u !== cp);
        if (oldGlyph.unicode === cp) {
          oldGlyph.unicode = oldGlyph.unicodes && oldGlyph.unicodes.length > 0 ? oldGlyph.unicodes[0] : undefined;
        }
        if (baseFontParsed.glyphs.length < 65535) {
          baseFontParsed.glyphs.glyphs[baseFontParsed.glyphs.length] = newGlyph;
          baseFontParsed.glyphs.length++;
        } else {
          hitLimit = true;
        }
      }
    } else {
      if (baseFontParsed.glyphs.length < 65535) {
        baseFontParsed.glyphs.glyphs[baseFontParsed.glyphs.length] = newGlyph;
        baseFontParsed.glyphs.length++;
      } else {
        hitLimit = true;
      }
    }
    
    processed++;
    if (processed % 500 === 0) parentPort.postMessage({ type: 'progress', message: \`Fused \${processed} / \${mappedCodepoints.size}\` });
  }
  
  parentPort.postMessage({ type: 'progress', message: 'Generating final font buffer...' });
  
  const metaPayload = JSON.stringify({ glyphMap: glyphMap });
  if (!baseFontParsed.names) baseFontParsed.names = {};
  
  for (const platform of ['macintosh', 'windows', 'unicode']) {
    if (!baseFontParsed.names[platform]) baseFontParsed.names[platform] = {};
    baseFontParsed.names[platform].description = { en: metaPayload };
    baseFontParsed.names[platform].fontFamily = { en: 'FusedFont' };
  }
  
  baseFontParsed.outlinesFormat = 'truetype';
  
  parsedFonts.clear();
  if (typeof global.gc === 'function') {
    global.gc();
  }
  
  const buffer = baseFontParsed.toArrayBuffer();`;

const startIndex = code.indexOf(targetStart);
const endIndex = code.indexOf(targetEnd) + targetEnd.length;

if (startIndex === -1 || endIndex < startIndex) {
  console.log("Could not find target content.");
} else {
  code = code.slice(0, startIndex) + replacement + code.slice(endIndex);
  fs.writeFileSync('fuseWorker.cjs', code);
  console.log("Patched successfully");
}
