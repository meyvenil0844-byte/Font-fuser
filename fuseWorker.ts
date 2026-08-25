import { parentPort, workerData } from 'worker_threads';
import * as opentype from 'opentype.js';
import * as fs from 'fs';
import * as path from 'path';

function scalePath(path: any, scale: number, isCFF: boolean) {
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
  console.log("Worker parsing fonts...");
  
  const parsedFonts = new Map<string, opentype.Font>();
  let baseFontParsed: opentype.Font | null = null;
  
  for (const [clientId, serverFilename] of Object.entries(serverFontIds)) {
    const filePath = path.join(uploadDir, serverFilename as string);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Uploaded font file missing for ${clientId}`);
    }
    const buffer = fs.readFileSync(filePath);
    const ab = new ArrayBuffer(buffer.length);
    const view = new Uint8Array(ab);
    for (let i = 0; i < buffer.length; ++i) view[i] = buffer[i];
    
    const font = opentype.parse(ab);
    parsedFonts.set(clientId, font);
    if (clientId === baseFontId) baseFontParsed = font;
  }
  
  if (!baseFontParsed) throw new Error('Failed to parse base font');
  
  const targetUnitsPerEm = baseFontParsed.unitsPerEm;
  const isCFF = true;
  const newGlyphs: opentype.Glyph[] = [];
  
  console.log(`Base font has ${baseFontParsed.glyphs.length} glyphs. Extracting...`);
  for (let i = 0; i < baseFontParsed.glyphs.length; i++) {
    newGlyphs.push(baseFontParsed.glyphs.get(i));
  }
  
  const mappedCodepoints = new Set(Object.keys(glyphMap).map(Number));
  let missingCount = 0;
  let hitLimit = false;
  let processed = 0;
  
  for (const cp of mappedCodepoints) {
    const targetFontId = glyphMap[cp as unknown as string];
    const targetFont = parsedFonts.get(targetFontId);
    if (!targetFont) continue;
    
    let sourceGlyphIndex = targetFont.charToGlyphIndex(String.fromCodePoint(cp));
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
        oldGlyph.unicodes = oldGlyph.unicodes.filter((u: number) => u !== cp);
        if (oldGlyph.unicode === cp) {
          oldGlyph.unicode = oldGlyph.unicodes && oldGlyph.unicodes.length > 0 ? oldGlyph.unicodes[0] : undefined;
        }
        if (newGlyphs.length < 65535) newGlyphs.push(newGlyph); else hitLimit = true;
      }
    } else {
      if (newGlyphs.length < 65535) newGlyphs.push(newGlyph); else hitLimit = true;
    }
    
    processed++;
    if (processed % 500 === 0) parentPort?.postMessage({ type: 'progress', message: `Fused ${processed} / ${mappedCodepoints.size}` });
  }
  
  console.log(`Fusion loop complete. Assembling new font with ${newGlyphs.length} glyphs...`);
  parentPort?.postMessage({ type: 'progress', message: 'Generating final font buffer...' });
  
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
  
  const buffer = newFont.toArrayBuffer();
  
  // To avoid structured clone cloning a huge arraybuffer and failing, we can write it to disk or pass it
  const outputFilename = 'FusedFont_' + Date.now() + '.ttf';
  const outputPath = path.join(uploadDir, outputFilename);
  fs.writeFileSync(outputPath, Buffer.from(buffer));
  
  parentPort?.postMessage({ type: 'done', file: outputPath, originalName: 'FusedFont.ttf' });
  
} catch (err: any) {
  parentPort?.postMessage({ type: 'error', message: err.message || String(err), stack: err.stack });
}
