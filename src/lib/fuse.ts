import * as opentype from 'opentype.js';
import type { UploadedFont, GlyphMapping } from '../types';
import { mergeColorTables } from './colorFontUtils';

function normalizeCaretPath(path: opentype.Path, advanceWidth: number, unitsPerEm: number): { path: opentype.Path, advanceWidth: number } {
  const em = unitsPerEm || 1000;
  let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
  for (const cmd of path.commands) {
    if (cmd.type !== 'Z') {
      if (cmd.x < xMin) xMin = cmd.x; if (cmd.x > xMax) xMax = cmd.x;
      if (cmd.y < yMin) yMin = cmd.y; if (cmd.y > yMax) yMax = cmd.y;
    }
  }
  const curHeight = yMax - yMin;
  const curWidth = xMax - xMin;

  // Standard typographical caret dimensions:
  // Height: ~36% - 39% of unitsPerEm (~380 on 1000 em)
  // Width: ~38% - 42% of unitsPerEm (~400 on 1000 em)
  // Top: ~70% of unitsPerEm (aligning with Cap Height, ~700 on 1000 em)
  // Bottom: ~32% of unitsPerEm (~320 on 1000 em, sitting right at x-height/mid-cap)
  // Advance width: ~48% - 52% of unitsPerEm (~500 on 1000 em)
  // Horizontally centered: leftSideBearing = rightSideBearing
  const targetHeight = Math.round(em * 0.38);
  const targetWidth = Math.round(em * 0.40);
  const targetTop = Math.round(em * 0.70);
  const targetAdvWidth = Math.round(em * 0.50);

  if (curHeight <= 0 || curWidth <= 0) {
    // Generate clean default caret if empty
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

  // Check if caret is already in correct size, proportions, and position
  const isCorrectHeight = curHeight >= em * 0.32 && curHeight <= em * 0.44;
  const isCorrectWidth = curWidth >= em * 0.30 && curWidth <= em * 0.52;
  const isCorrectTop = yMax >= em * 0.64 && yMax <= em * 0.76;
  const isCorrectBottom = yMin >= em * 0.24 && yMin <= em * 0.38;
  const isCorrectAdvance = advanceWidth >= em * 0.40 && advanceWidth <= em * 0.65;

  if (isCorrectHeight && isCorrectWidth && isCorrectTop && isCorrectBottom && isCorrectAdvance) {
    return { path, advanceWidth };
  }

  // Sizing: calculate scale factors without over-stretching
  let scale = Math.min(targetWidth / curWidth, targetHeight / curHeight);
  let scaleX = scale;
  let scaleY = scale;
  const aspect = curWidth / curHeight;
  if (aspect > 1.8) {
    // Overly wide / flat accent
    scaleY = targetHeight / curHeight;
    scaleX = Math.min(targetWidth / curWidth, scaleY * 0.6);
  } else if (aspect < 0.6) {
    // Overly tall / skinny
    scaleX = targetWidth / curWidth;
    scaleY = Math.min(targetHeight / curHeight, scaleX * 0.6);
  }

  const newW = curWidth * scaleX;
  const newH = curHeight * scaleY;
  const targetBottom = targetTop - newH;
  const finalAdvWidth = Math.max(targetAdvWidth, Math.round(newW + em * 0.10));
  const targetLeft = Math.round((finalAdvWidth - newW) / 2);

  const newPath = new opentype.Path();
  for (const cmd of path.commands) {
    if (cmd.type === 'M') {
      newPath.moveTo(Math.round(targetLeft + (cmd.x - xMin) * scaleX), Math.round(targetBottom + (cmd.y - yMin) * scaleY));
    } else if (cmd.type === 'L') {
      newPath.lineTo(Math.round(targetLeft + (cmd.x - xMin) * scaleX), Math.round(targetBottom + (cmd.y - yMin) * scaleY));
    } else if (cmd.type === 'Q') {
      newPath.quadraticCurveTo(
        Math.round(targetLeft + (cmd.x1 - xMin) * scaleX), Math.round(targetBottom + (cmd.y1 - yMin) * scaleY),
        Math.round(targetLeft + (cmd.x - xMin) * scaleX), Math.round(targetBottom + (cmd.y - yMin) * scaleY)
      );
    } else if (cmd.type === 'C') {
      newPath.curveTo(
        Math.round(targetLeft + (cmd.x1 - xMin) * scaleX), Math.round(targetBottom + (cmd.y1 - yMin) * scaleY),
        Math.round(targetLeft + (cmd.x2 - xMin) * scaleX), Math.round(targetBottom + (cmd.y2 - yMin) * scaleY),
        Math.round(targetLeft + (cmd.x - xMin) * scaleX), Math.round(targetBottom + (cmd.y - yMin) * scaleY)
      );
    } else if (cmd.type === 'Z') {
      newPath.close();
    }
  }
  return { path: newPath, advanceWidth: finalAdvWidth };
}

const normalizeCaratPath = normalizeCaretPath;

function generateCombiningLongSolidusOverlay(unitsPerEm: number): { path: opentype.Path; advanceWidth: number } {
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

function normalizeCombiningOverlayPath(path: opentype.Path, advanceWidth: number, unitsPerEm: number): { path: opentype.Path; advanceWidth: number } {
  const em = unitsPerEm || 1000;
  if (!path || !path.commands || path.commands.length === 0) {
    return generateCombiningLongSolidusOverlay(em);
  }
  
  let minX = Infinity, maxX = -Infinity;
  for (const cmd of path.commands) {
    if (cmd.type !== 'Z') {
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
    if (newCmd.type !== 'Z') {
      newCmd.x += shiftX;
      if (newCmd.type === 'Q') {
        newCmd.x1 += shiftX;
      } else if (newCmd.type === 'C') {
        newCmd.x1 += shiftX;
        newCmd.x2 += shiftX;
      }
    }
    newPath.commands.push(newCmd);
  }
  
  return { path: newPath, advanceWidth: 0 };
}

const NEGATED_MATH_MAP: Record<number, number> = {
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

const DUPLOYAN_COMPOUNDS: Record<number, { baseG?: number; directG?: number; marks?: { gid: number; dx: number; dy: number }[] }> = {
  0x1BC11: { baseG: 69, marks: [{ gid: 6825, dx: 370, dy: 130 }] },
  0x1BC12: { baseG: 69, marks: [{ gid: 6826, dx: 370, dy: 130 }] },
  0x1BC13: { baseG: 74, marks: [{ gid: 6825, dx: 620, dy: 130 }] },
  0x1BC14: { baseG: 71, marks: [{ gid: 6826, dx: 264, dy: 300 }] },
  0x1BC15: { baseG: 76, marks: [{ gid: 6825, dx: 409, dy: 534 }] },
  0x1BC16: { baseG: 72, marks: [{ gid: 6825, dx: 370, dy: 320 }] },
  0x1BC17: { baseG: 72, marks: [{ gid: 6826, dx: 370, dy: 320 }] },
  0x1BC18: { baseG: 77, marks: [{ gid: 6825, dx: 560, dy: 550 }, { gid: 6826, dx: 680, dy: 550 }] },
  0x1BC1D: { baseG: 83, marks: [{ gid: 169, dx: 155, dy: 395 }] },
  0x1BC1E: { baseG: 84, marks: [{ gid: 169, dx: 155, dy: 395 }] },
  0x1BC1F: { baseG: 85, marks: [{ gid: 169, dx: 365, dy: 185 }] },
  0x1BC20: { baseG: 86, marks: [{ gid: 169, dx: 365, dy: 185 }] },
  0x1BC21: { baseG: 83, marks: [{ gid: 6825, dx: 270, dy: 395 }] },
  0x1BC22: { baseG: 84, marks: [{ gid: 6825, dx: 270, dy: 395 }] },
  0x1BC23: { baseG: 85, marks: [{ gid: 6825, dx: 480, dy: 185 }] },
  0x1BC24: { baseG: 85, marks: [{ gid: 6825, dx: 480, dy: 185 }, { gid: 6826, dx: 480, dy: 420 }] },
  0x1BC25: { baseG: 86, marks: [{ gid: 6825, dx: 480, dy: 185 }] },
  0x1BC26: { baseG: 86, marks: [{ gid: 6826, dx: 480, dy: -60 }] },
  0x1BC2B: { baseG: 87, marks: [{ gid: 169, dx: 205, dy: 755 }] },
  0x1BC2C: { baseG: 88, marks: [{ gid: 169, dx: 205, dy: 755 }] },
  0x1BC2D: { baseG: 89, marks: [{ gid: 169, dx: 725, dy: 235 }] },
  0x1BC2E: { baseG: 90, marks: [{ gid: 169, dx: 725, dy: 235 }] },
  0x1BC2F: { baseG: 89, marks: [{ gid: 6825, dx: 840, dy: 235 }] },
  0x1BC39: { baseG: 99, marks: [{ gid: 6825, dx: 320, dy: 235 }] },
  0x1BC42: { directG: 107 },
  0x1BC4C: { baseG: 112, marks: [{ gid: 6825, dx: 220, dy: 180 }] },
  0x1BC4D: { baseG: 112, marks: [{ gid: 6826, dx: 220, dy: 180 }] },
  0x1BC4E: { baseG: 112, marks: [{ gid: 6830, dx: 110, dy: 180 }] },
  0x1BC53: { baseG: 119, marks: [{ gid: 6825, dx: 270, dy: 185 }] },
  0x1BC56: { baseG: 176, marks: [{ gid: 6831, dx: 232, dy: 185 }] },
  0x1BC58: { baseG: 123, marks: [{ gid: 6831, dx: 345, dy: 260 }] },
  0x1BC59: { baseG: 123, marks: [{ gid: 6826, dx: 345, dy: 260 }] },
  0x1BC5A: { baseG: 109, marks: [{ gid: 6831, dx: 270, dy: 185 }] },
  0x1BC60: { baseG: 126, marks: [{ gid: 6831, dx: 320, dy: 235 }] },
  0x1BC67: { baseG: 129, marks: [{ gid: 6825, dx: 200, dy: 130 }] },
  0x1BC68: { baseG: 129, marks: [{ gid: 6826, dx: 200, dy: 130 }] },
  0x1BC69: { baseG: 135, marks: [{ gid: 6826, dx: 200, dy: 130 }] },
  0x1BC7B: { directG: 111 }
};

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
      
      // Automatically expand glyphMap for negated math symbols & base symbols
      for (const [negStr, baseStr] of Object.entries(NEGATED_MATH_MAP)) {
        const negCp = Number(negStr);
        const baseCp = Number(baseStr);
        if (glyphMap[negCp] && !glyphMap[baseCp]) {
          glyphMap[baseCp] = glyphMap[negCp];
          if (!mappedCodepoints.includes(baseCp)) {
            mappedCodepoints.push(baseCp);
          }
        }
      }

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
        
        let scaledPath = new opentype.Path();
        for (const cmd of sourceGlyph.path.commands) {
           if (cmd.type === 'M') scaledPath.moveTo(Math.round(cmd.x * scale), Math.round(cmd.y * scale));
           else if (cmd.type === 'L') scaledPath.lineTo(Math.round(cmd.x * scale), Math.round(cmd.y * scale));
           else if (cmd.type === 'Q') scaledPath.quadraticCurveTo(Math.round(cmd.x1 * scale), Math.round(cmd.y1 * scale), Math.round(cmd.x * scale), Math.round(cmd.y * scale));
           else if (cmd.type === 'C') scaledPath.curveTo(Math.round(cmd.x1 * scale), Math.round(cmd.y1 * scale), Math.round(cmd.x2 * scale), Math.round(cmd.y2 * scale), Math.round(cmd.x * scale), Math.round(cmd.y * scale));
           else if (cmd.type === 'Z') scaledPath.close();
        }
        
        let advanceW = Math.round((sourceGlyph.advanceWidth || 0) * scale);
        const isCaretCp = cp === 0x005E || cp === 0x02C6 || cp === 0x2038 || cp === 0x2041 || cp === 0x2303;
        if (isCaretCp) {
          const norm = normalizeCaretPath(scaledPath, advanceW, baseFont.unitsPerEm);
          scaledPath = norm.path;
          advanceW = norm.advanceWidth;
        } else if (cp === 0x0640 && (!scaledPath || !scaledPath.commands || scaledPath.commands.length === 0)) {
          const em = baseFont.unitsPerEm || 1000;
          advanceW = Math.round(em * 0.50);
          const yBottom = -Math.round(em * 0.025);
          const yTop = Math.round(em * 0.085);
          const p = new opentype.Path();
          p.moveTo(0, yBottom);
          p.lineTo(advanceW, yBottom);
          p.lineTo(advanceW, yTop);
          p.lineTo(0, yTop);
          p.close();
          scaledPath = p;
        } else if (cp === 0x0338) {
          const em = baseFont.unitsPerEm || 1000;
          const norm = normalizeCombiningOverlayPath(scaledPath, advanceW, em);
          scaledPath = norm.path;
          advanceW = 0;
        } else if (cp >= 0x1BC00 && cp <= 0x1BCA3 && (!scaledPath || !scaledPath.commands || scaledPath.commands.length === 0)) {
          const spec = DUPLOYAN_COMPOUNDS[cp];
          if (spec) {
            if (spec.directG && targetFont.glyphs.get(spec.directG)) {
              const dg = targetFont.glyphs.get(spec.directG);
              const p = new opentype.Path();
              for (const cmd of dg.path.commands) {
                if (cmd.type === 'M') p.moveTo(Math.round(cmd.x * scale), Math.round(cmd.y * scale));
                else if (cmd.type === 'L') p.lineTo(Math.round(cmd.x * scale), Math.round(cmd.y * scale));
                else if (cmd.type === 'Q') p.quadraticCurveTo(Math.round(cmd.x1 * scale), Math.round(cmd.y1 * scale), Math.round(cmd.x * scale), Math.round(cmd.y * scale));
                else if (cmd.type === 'C') p.curveTo(Math.round(cmd.x1 * scale), Math.round(cmd.y1 * scale), Math.round(cmd.x2 * scale), Math.round(cmd.y2 * scale), Math.round(cmd.x * scale), Math.round(cmd.y * scale));
                else if (cmd.type === 'Z') p.close();
              }
              scaledPath = p;
              advanceW = Math.round((dg.advanceWidth || 0) * scale);
            } else if (spec.baseG && targetFont.glyphs.get(spec.baseG)) {
              const bg = targetFont.glyphs.get(spec.baseG);
              const p = new opentype.Path();
              for (const cmd of bg.path.commands) {
                if (cmd.type === 'M') p.moveTo(Math.round(cmd.x * scale), Math.round(cmd.y * scale));
                else if (cmd.type === 'L') p.lineTo(Math.round(cmd.x * scale), Math.round(cmd.y * scale));
                else if (cmd.type === 'Q') p.quadraticCurveTo(Math.round(cmd.x1 * scale), Math.round(cmd.y1 * scale), Math.round(cmd.x * scale), Math.round(cmd.y * scale));
                else if (cmd.type === 'C') p.curveTo(Math.round(cmd.x1 * scale), Math.round(cmd.y1 * scale), Math.round(cmd.x2 * scale), Math.round(cmd.y2 * scale), Math.round(cmd.x * scale), Math.round(cmd.y * scale));
                else if (cmd.type === 'Z') p.close();
              }
              if (spec.marks) {
                for (const m of spec.marks) {
                  const mg = targetFont.glyphs.get(m.gid);
                  if (mg && mg.path && mg.path.commands) {
                    for (const rawCmd of mg.path.commands) {
                      const cmd = rawCmd as any;
                      const mx = (cmd.x !== undefined ? cmd.x + m.dx : 0);
                      const my = (cmd.y !== undefined ? cmd.y + m.dy : 0);
                      const mx1 = (cmd.x1 !== undefined ? cmd.x1 + m.dx : 0);
                      const my1 = (cmd.y1 !== undefined ? cmd.y1 + m.dy : 0);
                      const mx2 = (cmd.x2 !== undefined ? cmd.x2 + m.dx : 0);
                      const my2 = (cmd.y2 !== undefined ? cmd.y2 + m.dy : 0);
                      if (cmd.type === 'M') p.moveTo(Math.round(mx * scale), Math.round(my * scale));
                      else if (cmd.type === 'L') p.lineTo(Math.round(mx * scale), Math.round(my * scale));
                      else if (cmd.type === 'Q') p.quadraticCurveTo(Math.round(mx1 * scale), Math.round(my1 * scale), Math.round(mx * scale), Math.round(my * scale));
                      else if (cmd.type === 'C') p.curveTo(Math.round(mx1 * scale), Math.round(my1 * scale), Math.round(mx2 * scale), Math.round(my2 * scale), Math.round(mx * scale), Math.round(my * scale));
                      else if (cmd.type === 'Z') p.close();
                    }
                  }
                }
              }
              scaledPath = p;
              advanceW = Math.round((bg.advanceWidth || 0) * scale);
            }
          }
        }

        const newGlyph = new opentype.Glyph({
          name: cp === 0 ? '.null' : (sourceGlyph.name || `uni${cp.toString(16).toUpperCase()}`),
          unicode: cp,
          advanceWidth: advanceW,
          path: scaledPath
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
      
      // Ensure all carets in newGlyphs are normalized
      const caretCodes = [0x005E, 0x02C6, 0x2038, 0x2041, 0x2303];
      for (const g of newGlyphs) {
        if (g && (caretCodes.includes(g.unicode!) || (g.unicodes && g.unicodes.some(u => caretCodes.includes(u))))) {
          if (g.path && g.path.commands && g.path.commands.length > 0) {
            const norm = normalizeCaretPath(g.path, g.advanceWidth || 0, baseFont.unitsPerEm);
            if (norm.path !== g.path) {
              g.path = norm.path;
              g.advanceWidth = norm.advanceWidth;
            }
          }
        }
      }

      // Ensure Arabic Tatweel (U+0640) has a proper fixed baseline connecting elongation if present but empty
      for (const g of newGlyphs) {
        if (g && (g.unicode === 0x0640 || (g.unicodes && g.unicodes.includes(0x0640)))) {
          if (!g.path || !g.path.commands || g.path.commands.length === 0) {
            const em = baseFont.unitsPerEm || 1000;
            const advW = Math.round(em * 0.50);
            const yBottom = -Math.round(em * 0.025);
            const yTop = Math.round(em * 0.085);
            const p = new opentype.Path();
            p.moveTo(0, yBottom);
            p.lineTo(advW, yBottom);
            p.lineTo(advW, yTop);
            p.lineTo(0, yTop);
            p.close();
            g.path = p;
            g.advanceWidth = advW;
          }
        }
      }

      // Ensure U+0338 (Combining Long Solidus Overlay) exists with strictly 0 advanceWidth and centered overlay positioning
      const solidusGlyph = newGlyphs.find(g => g && (g.unicode === 0x0338 || (g.unicodes && g.unicodes.includes(0x0338))));
      if (!solidusGlyph) {
        const em = baseFont.unitsPerEm || 1000;
        const fixedSolidus = generateCombiningLongSolidusOverlay(em);
        newGlyphs.push(new opentype.Glyph({
          name: 'uni0338',
          unicode: 0x0338,
          advanceWidth: 0,
          path: fixedSolidus.path
        }));
      } else {
        const em = baseFont.unitsPerEm || 1000;
        const norm = normalizeCombiningOverlayPath(solidusGlyph.path, solidusGlyph.advanceWidth, em);
        solidusGlyph.path = norm.path;
        solidusGlyph.advanceWidth = 0;
      }

      // Ensure negated math symbols (⊄, ⊈, ≠, etc.) and their base symbols are paired properly
      for (const [negStr, baseStr] of Object.entries(NEGATED_MATH_MAP)) {
        const negCp = Number(negStr);
        const baseCp = Number(baseStr);
        const hasBase = newGlyphs.some(g => g && (g.unicode === baseCp || (g.unicodes && g.unicodes.includes(baseCp))));
        const hasNeg = newGlyphs.some(g => g && (g.unicode === negCp || (g.unicodes && g.unicodes.includes(negCp))));
        
        if (hasBase && !hasNeg) {
          const baseG = newGlyphs.find(g => g && (g.unicode === baseCp || (g.unicodes && g.unicodes.includes(baseCp))));
          if (baseG && baseG.path && baseG.path.commands && baseG.path.commands.length > 0) {
            const em = baseFont.unitsPerEm || 1000;
            const advW = baseG.advanceWidth || Math.round(em * 0.6);
            const p = new opentype.Path();
            for (const cmd of baseG.path.commands) {
              p.commands.push({ ...cmd });
            }
            const halfThick = Math.round(em * 0.028);
            const x1 = Math.round(advW - em * 0.52);
            const y1 = Math.round(-em * 0.08);
            const x2 = Math.round(advW - em * 0.08);
            const y2 = Math.round(+em * 0.72);
            p.moveTo(x1 - halfThick, y1);
            p.lineTo(x2 - halfThick, y2);
            p.lineTo(x2 + halfThick, y2);
            p.lineTo(x1 + halfThick, y1);
            p.close();

            newGlyphs.push(new opentype.Glyph({
              name: `uni${negCp.toString(16).toUpperCase()}`,
              unicode: negCp,
              advanceWidth: advW,
              path: p
            }));
          }
        }
      }

      // 1. Ensure Glyph 0 is strictly .notdef
      if (newGlyphs.length > 0 && newGlyphs[0]) {
        (newGlyphs[0] as any).name = '.notdef';
      }

      // 2. Ensure Space (Unicode 32, 0x0020) exists
      if (!newGlyphs.some(g => g.unicode === 32 || (g.unicodes && g.unicodes.includes(32)))) {
        newGlyphs.push(new opentype.Glyph({
          name: 'space',
          unicode: 32,
          advanceWidth: Math.round(baseFont.unitsPerEm * 0.25),
          path: new opentype.Path()
        }));
      }

      const asc = baseFont.ascender || Math.round(baseFont.unitsPerEm * 0.8);
      const desc = baseFont.descender || -Math.round(baseFont.unitsPerEm * 0.2);

      const familyName = 'FusedFont';
      const styleName = 'Regular';
      const fullName = 'FusedFont Regular';
      const postScriptName = 'FusedFont-Regular';
      const uniqueID = `1.000;AIStudio;${postScriptName}`;
      const versionString = 'Version 1.000';

      const newFont = new opentype.Font({
        familyName: familyName,
        styleName: styleName,
        unitsPerEm: baseFont.unitsPerEm,
        ascender: asc,
        descender: desc,
        glyphs: newGlyphs
      });

      (newFont as any).names = {
        windows: {
          fontFamily: { en: familyName },
          fontSubfamily: { en: styleName },
          uniqueID: { en: uniqueID },
          fullName: { en: fullName },
          version: { en: versionString },
          postScriptName: { en: postScriptName },
          preferredFamily: { en: familyName },
          preferredSubfamily: { en: styleName },
          description: { en: 'Fused by AI Studio' }
        },
        macintosh: {
          fontFamily: { en: familyName },
          fontSubfamily: { en: styleName },
          uniqueID: { en: uniqueID },
          fullName: { en: fullName },
          version: { en: versionString },
          postScriptName: { en: postScriptName },
          preferredFamily: { en: familyName },
          preferredSubfamily: { en: styleName },
          description: { en: 'Fused by AI Studio' }
        }
      };

      if (!(newFont as any).tables) (newFont as any).tables = {};
      if (!(newFont as any).tables.hhea) (newFont as any).tables.hhea = {};
      if (!(newFont as any).tables.os2) (newFont as any).tables.os2 = {};

      (newFont as any).tables.hhea.version = 65536; // 0x00010000 (OpenType standard Version 1.0)
      (newFont as any).tables.hhea.ascender = asc;
      (newFont as any).tables.hhea.descender = desc;
      (newFont as any).tables.hhea.caretSlopeRise = 1;
      (newFont as any).tables.hhea.caretSlopeRun = 0;
      (newFont as any).tables.hhea.caretOffset = 0;

      (newFont as any).tables.os2.version = 3;
      (newFont as any).tables.os2.sTypoAscender = asc;
      (newFont as any).tables.os2.sTypoDescender = desc;
      (newFont as any).tables.os2.sTypoLineGap = 0;
      (newFont as any).tables.os2.usWinAscent = Math.max(asc, Math.round(baseFont.unitsPerEm * 0.8));
      (newFont as any).tables.os2.usWinDescent = Math.max(Math.abs(desc), Math.round(baseFont.unitsPerEm * 0.2));
      (newFont as any).tables.os2.usWeightClass = 400; // Normal / Regular
      (newFont as any).tables.os2.usWidthClass = 5; // Medium
      (newFont as any).tables.os2.fsType = 0; // Installable embedding
      (newFont as any).tables.os2.fsSelection = 192; // USE_TYPO_METRICS (128) + REGULAR (64)
      (newFont as any).tables.os2.achVendID = 'NONE';
      
      // Explicitly strip non-CFF or stale layout tables
      if ((newFont as any).tables) {
          delete (newFont as any).tables.gasp;
          delete (newFont as any).tables.math;
          delete (newFont as any).tables.MATH;
          delete (newFont as any).tables.GSUB;
          delete (newFont as any).tables.gsub;
          delete (newFont as any).tables.GPOS;
          delete (newFont as any).tables.gpos;
          delete (newFont as any).tables.GDEF;
          delete (newFont as any).tables.gdef;
          delete (newFont as any).tables.BASE;
          delete (newFont as any).tables.base;
          delete (newFont as any).tables.JSTF;
          delete (newFont as any).tables.jstf;
          delete (newFont as any).tables.fvar;
          delete (newFont as any).tables.avar;
          delete (newFont as any).tables.cvar;
          delete (newFont as any).tables.gvar;
          delete (newFont as any).tables.stat;
          delete (newFont as any).tables.cvt;
          delete (newFont as any).tables.fpgm;
          delete (newFont as any).tables.prep;
          delete (newFont as any).tables.glyf;
          delete (newFont as any).tables.loca;
          delete (newFont as any).tables.ltag;
      }

      // COLOR UPDATE: Preserve and merge SVG in OpenType, COLR, CPAL, and CAPL font tables
      try {
        const mergedColors = mergeColorTables(baseFont, parsedFonts, glyphMap, newGlyphs);
        if (mergedColors.hasColor) {
          if (mergedColors.cpalTable) {
            (newFont as any).tables.cpal = mergedColors.cpalTable;
            (newFont as any).tables.capl = mergedColors.caplTable;
            (newFont as any).tables.CPAL = mergedColors.cpalTable;
            (newFont as any).tables.CAPL = mergedColors.caplTable;
          }
          if (mergedColors.colrTable) {
            (newFont as any).tables.colr = mergedColors.colrTable;
            (newFont as any).tables.COLR = mergedColors.colrTable;
          }
          if (mergedColors.svgTable) {
            (newFont as any).tables.svg = mergedColors.svgTable;
            (newFont as any).tables.SVG = mergedColors.svgTable;
          }
        }
      } catch (e) {
        console.warn('Failed to merge color tables during client font fusion:', e);
      }
      
      
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
