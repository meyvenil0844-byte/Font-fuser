import * as opentype from 'opentype.js';
import type { UploadedFont, GlyphMapping } from '../types';

export async function generateFusedFontClient(
  baseFontInfo: UploadedFont,
  fonts: UploadedFont[],
  glyphMap: GlyphMapping,
  onProgress?: (msg: string) => void
): Promise<ArrayBuffer> {
  return new Promise(async (resolve, reject) => {
    try {
      if (onProgress) onProgress('Parsing base font...');
      if (!baseFontInfo.file) throw new Error('Base font file is missing');
      const baseBuffer = await baseFontInfo.file.arrayBuffer();
      const baseFont = opentype.parse(baseBuffer);
      
      const parsedFonts = new Map<string, opentype.Font>();
      parsedFonts.set(baseFontInfo.id, baseFont);
      
      let i = 0;
      for (const font of fonts) {
        if (font.id !== baseFontInfo.id && font.file) {
          if (onProgress) onProgress(`Parsing target fonts (${++i}/${fonts.length - 1})...`);
          const buf = await font.file.arrayBuffer();
          parsedFonts.set(font.id, opentype.parse(buf));
        }
      }
      
      if (onProgress) onProgress('Assembling fused font...');
      
      const newGlyphs = [];
      for (let j = 0; j < baseFont.glyphs.length; j++) {
        newGlyphs.push(baseFont.glyphs.get(j));
      }
      
      const mappedCodepoints = Object.keys(glyphMap).map(Number);
      let missingCount = 0;
      let processed = 0;
      for (const cp of mappedCodepoints) {
        if (isNaN(cp) || cp < 0 || cp > 0x10FFFF) continue;
        const targetFontId = glyphMap[cp];
        const targetFont = parsedFonts.get(targetFontId);
        if (!targetFont) continue;
        
        let sourceGlyphIndex = targetFont.charToGlyphIndex(String.fromCodePoint(cp));
        if (!sourceGlyphIndex || sourceGlyphIndex <= 0) {
          missingCount++;
          continue;
        }
        
        const sourceGlyph = targetFont.glyphs.get(sourceGlyphIndex);
        const scale = baseFont.unitsPerEm / targetFont.unitsPerEm;
        
        const newPath = new opentype.Path();
        for (const cmd of sourceGlyph.path.commands) {
           if (cmd.type === 'M') newPath.moveTo(Math.round(cmd.x * scale), Math.round(cmd.y * scale));
           else if (cmd.type === 'L') newPath.lineTo(Math.round(cmd.x * scale), Math.round(cmd.y * scale));
           else if (cmd.type === 'Q') newPath.quadraticCurveTo(Math.round(cmd.x1 * scale), Math.round(cmd.y1 * scale), Math.round(cmd.x * scale), Math.round(cmd.y * scale));
           else if (cmd.type === 'C') newPath.curveTo(Math.round(cmd.x1 * scale), Math.round(cmd.y1 * scale), Math.round(cmd.x2 * scale), Math.round(cmd.y2 * scale), Math.round(cmd.x * scale), Math.round(cmd.y * scale));
           else if (cmd.type === 'Z') newPath.close();
        }
        
        const newGlyph = new opentype.Glyph({
          name: cp === 0 ? '.null' : (sourceGlyph.name || `uni${cp.toString(16).toUpperCase()}`),
          unicode: cp,
          advanceWidth: Math.round((sourceGlyph.advanceWidth || 0) * scale),
          path: newPath
        });
        
        let baseGlyphIndex = baseFont.charToGlyphIndex(String.fromCodePoint(cp));
        if (baseGlyphIndex > 0) {
          const originalOldGlyph = newGlyphs[baseGlyphIndex];
          let onlyUsedByCp = false;
          if (!originalOldGlyph.unicodes || originalOldGlyph.unicodes.length <= 1) onlyUsedByCp = true;
          
          if (onlyUsedByCp) {
            newGlyphs[baseGlyphIndex] = newGlyph;
          } else {
            // Clone oldGlyph to avoid mutating base font
            const oldGlyph = new opentype.Glyph({
              name: originalOldGlyph.unicode === 0 ? '.null' : originalOldGlyph.name,
              unicode: originalOldGlyph.unicode,
              advanceWidth: originalOldGlyph.advanceWidth,
              path: originalOldGlyph.path
            });
            oldGlyph.unicodes = originalOldGlyph.unicodes.filter(u => u !== cp);
            if (oldGlyph.unicode === cp) {
              oldGlyph.unicode = oldGlyph.unicodes && oldGlyph.unicodes.length > 0 ? oldGlyph.unicodes[0] : undefined;
            }
            newGlyphs[baseGlyphIndex] = oldGlyph;
            if (newGlyphs.length < 65535) newGlyphs.push(newGlyph);
          }
        } else {
          if (newGlyphs.length < 65535) newGlyphs.push(newGlyph);
        }
        processed++;
        if (processed % 100 === 0) {
            if (onProgress) onProgress(`Fusing glyphs (${processed}/${mappedCodepoints.length})...`);
            await new Promise(r => setTimeout(r, 0));
        }
      }
      
      const newFont = new opentype.Font({
        familyName: "FusedFont",
        styleName: 'Regular',
        unitsPerEm: baseFont.unitsPerEm,
        ascender: baseFont.ascender,
        descender: baseFont.descender,
        glyphs: newGlyphs
      });
      
      
      if (onProgress) onProgress('Finalizing font buffer (this may take a few seconds)...');
      
      // Free memory before synchronous toArrayBuffer
      parsedFonts.clear();
      
      // Delay so UI can update
      setTimeout(() => {
        try {
          const buffer = newFont.toArrayBuffer();
          resolve(buffer);
        } catch (err) {
          reject(err);
        }
      }, 50);
      
    } catch (err) {
      reject(err);
    }
  });
}
