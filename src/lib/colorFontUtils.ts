import * as opentype from 'opentype.js';

export interface ColorLayer {
  glyphIndex: number;
  paletteIndex: number; // 0xFFFF means foreground color / currentColor
  color?: string; // resolved hex or rgba
}

export interface ColorGlyphRecord {
  glyphIndex: number;
  codepoint?: number;
  layers?: ColorLayer[];
  svgDocument?: string;
  hasCOLR?: boolean;
  hasCPAL?: boolean;
  hasCAPL?: boolean;
  hasSVG?: boolean;
}

export interface ColorFontData {
  hasColor: boolean;
  hasCOLR: boolean;
  colrVersion?: number; // 0 for COLRv0
  isColrV0?: boolean; // True when font adheres to COLRv0 specification
  hasCPAL: boolean;
  hasCAPL: boolean; // Alias / OpenType representation for CPAL
  hasSVG: boolean;
  palettes: string[][];
  colorGlyphs: Map<number, ColorGlyphRecord>; // glyphIndex -> record
  codepointColorMap: Map<number, ColorGlyphRecord>; // cp -> record
}

/**
 * Converts a hex (#RRGGBB or #RRGGBBAA) or rgb/rgba string into a 32-bit BGRA integer for OpenType CPAL / CAPL
 */
export function colorToBgraInt(colorStr: string): number {
  let r = 0, g = 0, b = 0, a = 255;
  const str = colorStr.trim().toLowerCase();
  
  if (str.startsWith('#')) {
    const hex = str.slice(1);
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 4) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
      a = parseInt(hex[3] + hex[3], 16);
    } else if (hex.length === 6) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    } else if (hex.length === 8) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
      a = parseInt(hex.slice(6, 8), 16);
    }
  } else if (str.startsWith('rgb')) {
    const match = str.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/);
    if (match) {
      r = Math.min(255, Math.max(0, Math.round(Number(match[1]))));
      g = Math.min(255, Math.max(0, Math.round(Number(match[2]))));
      b = Math.min(255, Math.max(0, Math.round(Number(match[3]))));
      if (match[4] !== undefined) {
        a = Math.min(255, Math.max(0, Math.round(Number(match[4]) * (Number(match[4]) <= 1 ? 255 : 1))));
      }
    }
  }
  
  // CPAL / CAPL stores BGRA: (B) | (G << 8) | (R << 16) | (A << 24)
  // uint32 representation
  return ((b & 0xFF) | ((g & 0xFF) << 8) | ((r & 0xFF) << 16) | ((a & 0xFF) << 24)) >>> 0;
}

/**
 * Converts a 32-bit BGRA integer from OpenType CPAL into a hex color string #RRGGBBAA
 */
export function bgraIntToHex(bgra: number): string {
  const b = bgra & 0xFF;
  const g = (bgra >> 8) & 0xFF;
  const r = (bgra >> 16) & 0xFF;
  const a = (bgra >> 24) & 0xFF;
  
  const toHex2 = (v: number) => v.toString(16).padStart(2, '0');
  if (a === 255) {
    return `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`;
  }
  return `#${toHex2(r)}${toHex2(g)}${toHex2(b)}${toHex2(a)}`;
}

/**
 * Builds OpenType CPAL (Color Palette) Table Structure
 */
export function buildCpalTable(palettes: string[][]): any {
  if (!palettes || palettes.length === 0 || palettes[0].length === 0) {
    palettes = [["#000000", "#FFFFFF", "#3B82F6", "#EF4444", "#10B981", "#F59E0B"]];
  }
  
  const numPalettes = palettes.length;
  const numPaletteEntries = Math.max(...palettes.map(p => p.length));
  
  const colorRecords: number[] = [];
  const colorRecordIndices: number[] = [];
  
  for (let p = 0; p < numPalettes; p++) {
    colorRecordIndices.push(p * numPaletteEntries);
    for (let i = 0; i < numPaletteEntries; i++) {
      const colorStr = palettes[p][i] || "#000000";
      colorRecords.push(colorToBgraInt(colorStr));
    }
  }
  
  return {
    version: 0,
    numPaletteEntries,
    colorRecords,
    colorRecordIndices
  };
}

/**
 * Builds OpenType CAPL (Color Palette alias) Table Structure
 */
export const buildCaplTable = buildCpalTable;

/**
 * Builds OpenType COLR (Color Layers) Table Structure
 */
export function buildColrTable(baseGlyphs: { glyphID: number; layers: { glyphID: number; paletteIndex: number }[] }[]): any {
  // OpenType COLR requirement: baseGlyphRecords MUST be sorted by glyphID in ascending order
  const sortedBases = [...baseGlyphs].sort((a, b) => a.glyphID - b.glyphID);
  
  const baseGlyphRecords: { glyphID: number; firstLayerIndex: number; numLayers: number }[] = [];
  const layerRecords: { glyphID: number; paletteIndex: number }[] = [];
  
  let currentLayerIndex = 0;
  for (const b of sortedBases) {
    baseGlyphRecords.push({
      glyphID: b.glyphID,
      firstLayerIndex: currentLayerIndex,
      numLayers: b.layers.length
    });
    for (const l of b.layers) {
      layerRecords.push({
        glyphID: l.glyphID,
        paletteIndex: l.paletteIndex
      });
      currentLayerIndex++;
    }
  }
  
  return {
    version: 0,
    baseGlyphRecords,
    layerRecords
  };
}

/**
 * Builds OpenType SVG (SVG in OpenType) Table Structure (Map of glyphId -> Uint8Array)
 */
export function buildSvgTable(svgEntries: { glyphID: number; svg: string | Uint8Array }[]): Map<number, Uint8Array> {
  const map = new Map<number, Uint8Array>();
  const encoder = new TextEncoder();
  
  for (const entry of svgEntries) {
    let bytes: Uint8Array;
    if (typeof entry.svg === 'string') {
      let doc = entry.svg.trim();
      // Ensure valid <svg> root with id matching glyph ID
      if (!doc.includes(`id="glyph${entry.glyphID}"`)) {
        doc = doc.replace(/<svg\b([^>]*)>/i, `<svg$1 id="glyph${entry.glyphID}">`);
      }
      bytes = encoder.encode(doc);
    } else {
      bytes = entry.svg;
    }
    map.set(entry.glyphID, bytes);
  }
  
  return map;
}

/**
 * Extracts and inspects all Color OpenType tables (SVG in OpenType, COLR, CPAL, CAPL) from an opentype.Font
 */
export function extractColorFontInfo(font: any): ColorFontData {
  const result: ColorFontData = {
    hasColor: false,
    hasCOLR: false,
    hasCPAL: false,
    hasCAPL: false,
    hasSVG: false,
    palettes: [],
    colorGlyphs: new Map(),
    codepointColorMap: new Map()
  };
  
  if (!font) return result;
  
  // 1. Inspect CPAL / CAPL (Color Palette)
  const cpal = font.tables?.cpal || font.tables?.CPAL || font.tables?.capl || font.tables?.CAPL;
  if (cpal && cpal.colorRecords && cpal.colorRecords.length > 0) {
    result.hasCPAL = true;
    result.hasCAPL = true;
    const numEntries = cpal.numPaletteEntries || cpal.colorRecords.length;
    const numPalettes = cpal.colorRecordIndices ? cpal.colorRecordIndices.length : 1;
    
    for (let p = 0; p < numPalettes; p++) {
      const paletteColors: string[] = [];
      const startIndex = cpal.colorRecordIndices ? cpal.colorRecordIndices[p] : (p * numEntries);
      for (let i = 0; i < numEntries; i++) {
        const raw = cpal.colorRecords[startIndex + i];
        paletteColors.push(bgraIntToHex(raw !== undefined ? raw : 0));
      }
      result.palettes.push(paletteColors);
    }
  }
  
  // 2. Inspect COLR (Color Layers - COLRv0 compatible)
  const colr = font.tables?.colr || font.tables?.COLR;
  if (colr && Array.isArray(colr.baseGlyphRecords) && colr.baseGlyphRecords.length > 0 && Array.isArray(colr.layerRecords)) {
    result.hasCOLR = true;
    result.colrVersion = colr.version !== undefined ? colr.version : 0;
    result.isColrV0 = result.colrVersion === 0;
    const defaultPalette = result.palettes[0] || [];
    
    for (const bg of colr.baseGlyphRecords) {
      if (!bg) continue;
      const gid = bg.glyphID;
      const layers: ColorLayer[] = [];
      const start = bg.firstLayerIndex || 0;
      const count = bg.numLayers || 0;
      
      for (let i = 0; i < count; i++) {
        const lr = colr.layerRecords[start + i];
        if (lr) {
          const colorHex = lr.paletteIndex === 0xFFFF
            ? 'currentColor'
            : (defaultPalette[lr.paletteIndex] || '#000000');
          layers.push({
            glyphIndex: lr.glyphID,
            paletteIndex: lr.paletteIndex,
            color: colorHex
          });
        }
      }
      
      const record: ColorGlyphRecord = {
        glyphIndex: gid,
        layers,
        hasCOLR: true,
        hasCPAL: result.hasCPAL,
        hasCAPL: result.hasCAPL
      };
      result.colorGlyphs.set(gid, record);
    }
  }
  
  // 3. Inspect SVG in OpenType
  const svgTable = font.tables?.svg || font.tables?.SVG || font.tables?.['SVG '];
  if (svgTable) {
    const decoder = new TextDecoder('utf-8');
    if (svgTable instanceof Map && svgTable.size > 0) {
      result.hasSVG = true;
      for (const [gid, bytes] of svgTable.entries()) {
        try {
          const svgStr = typeof bytes === 'string' ? bytes : decoder.decode(bytes);
          const existing: ColorGlyphRecord = result.colorGlyphs.get(gid) || { glyphIndex: gid };
          existing.svgDocument = svgStr;
          existing.hasSVG = true;
          result.colorGlyphs.set(gid, existing);
        } catch (e) {}
      }
    } else if (typeof svgTable === 'object' && Object.keys(svgTable).length > 0) {
      result.hasSVG = true;
      for (const [gidStr, bytes] of Object.entries(svgTable)) {
        try {
          const gid = Number(gidStr);
          const svgStr = typeof bytes === 'string' ? bytes : decoder.decode(bytes as any);
          const existing: ColorGlyphRecord = result.colorGlyphs.get(gid) || { glyphIndex: gid };
          existing.svgDocument = svgStr;
          existing.hasSVG = true;
          result.colorGlyphs.set(gid, existing);
        } catch (e) {}
      }
    }
  }
  
  result.hasColor = result.hasCOLR || result.hasCPAL || result.hasCAPL || result.hasSVG;
  
  // Map codepoints to color records efficiently (inspect only color glyph IDs, never decompile outlines)
  if (result.hasColor && result.colorGlyphs.size > 0) {
    const glyphIdToUnicode = new Map<number, number>();
    
    // Check main cmap and all cmap subtables (format 4 BMP and format 12 32-bit supplementary planes)
    const cmap = font.tables?.cmap;
    if (cmap) {
      if (cmap.glyphIndexMap && typeof cmap.glyphIndexMap === 'object') {
        for (const [uniStr, gid] of Object.entries(cmap.glyphIndexMap)) {
          glyphIdToUnicode.set(Number(gid), Number(uniStr));
        }
      }
      if (Array.isArray(cmap.tables)) {
        for (const sub of cmap.tables) {
          if (sub && sub.glyphIndexMap && typeof sub.glyphIndexMap === 'object') {
            for (const [uniStr, gid] of Object.entries(sub.glyphIndexMap)) {
              glyphIdToUnicode.set(Number(gid), Number(uniStr));
            }
          }
        }
      }
    }

    const encCmap = (font.encoding as any)?.cmap?.glyphIndexMap;
    if (encCmap && typeof encCmap === 'object') {
      for (const [uniStr, gid] of Object.entries(encCmap)) {
        glyphIdToUnicode.set(Number(gid), Number(uniStr));
      }
    }

    // Assign codepoints instantly without triggering expensive glyph outline decompilations
    for (const [gid, record] of result.colorGlyphs.entries()) {
      let unicode = glyphIdToUnicode.get(gid);
      if (unicode === undefined && font.glyphs?.glyphs && Array.isArray(font.glyphs.glyphs)) {
        const g = font.glyphs.glyphs[gid];
        if (g && typeof g.unicode === 'number') {
          unicode = g.unicode;
        }
      }
      if (unicode !== undefined) {
        record.codepoint = unicode;
        result.codepointColorMap.set(unicode, record);
      }
    }
  }
  
  return result;
}

/**
 * Creates an SVG document string for a glyph with custom colors / fills / gradients
 */
export function wrapGlyphSvg(pathData: string, options: { 
  fill?: string; 
  stroke?: string; 
  strokeWidth?: number;
  width?: number; 
  height?: number;
  glyphId?: number;
} = {}): string {
  const w = options.width || 1000;
  const h = options.height || 1000;
  const gid = options.glyphId !== undefined ? ` id="glyph${options.glyphId}"` : '';
  const fill = options.fill || '#3b82f6';
  const stroke = options.stroke ? ` stroke="${options.stroke}" stroke-width="${options.strokeWidth || 10}"` : '';
  
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"${gid}>
  <path d="${pathData}" fill="${fill}"${stroke} fill-rule="evenodd" />
</svg>`;
}

/**
 * Merges Color Tables (SVG in OpenType, COLR, CPAL, and CAPL) across base font and mapped target fonts
 */
export function mergeColorTables(
  baseFont: any,
  parsedFonts: Map<string, any>,
  glyphMap: Record<number, string>,
  newGlyphs: any[]
): {
  hasColor: boolean;
  colrTable: any | null;
  cpalTable: any | null;
  caplTable: any | null;
  svgTable: Map<number, Uint8Array> | null;
} {
  const decoder = new TextDecoder('utf-8');
  const encoder = new TextEncoder();
  
  const baseColorInfo = extractColorFontInfo(baseFont);
  
  // Check if any source font or base font has color
  let anyFontHasColor = baseColorInfo.hasColor;
  for (const font of parsedFonts.values()) {
    if (extractColorFontInfo(font).hasColor) {
      anyFontHasColor = true;
      break;
    }
  }
  
  if (!anyFontHasColor) {
    return {
      hasColor: false,
      colrTable: null,
      cpalTable: null,
      caplTable: null,
      svgTable: null
    };
  }
  
  // 1. Consolidate Palettes (CPAL & CAPL)
  const masterPalette: string[] = [];
  const paletteIndexMap = new Map<string, number>(); // fontId:origIndex -> newIndex
  
  // Copy base font palette 0
  if (baseColorInfo.palettes.length > 0) {
    for (let i = 0; i < baseColorInfo.palettes[0].length; i++) {
      const col = baseColorInfo.palettes[0][i];
      masterPalette.push(col);
      paletteIndexMap.set(`base:${i}`, i);
    }
  }
  
  // Ensure default vibrant palette if empty
  if (masterPalette.length === 0) {
    masterPalette.push('#000000', '#ffffff', '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899');
  }
  
  const getOrAddPaletteColor = (fontId: string, origIdx: number, colorHex: string): number => {
    if (origIdx === 0xFFFF) return 0xFFFF; // currentColor
    const key = `${fontId}:${origIdx}`;
    if (paletteIndexMap.has(key)) return paletteIndexMap.get(key)!;
    
    // Check if color is already in masterPalette
    const existing = masterPalette.indexOf(colorHex.toLowerCase());
    if (existing !== -1) {
      paletteIndexMap.set(key, existing);
      return existing;
    }
    
    const newIdx = masterPalette.length;
    masterPalette.push(colorHex);
    paletteIndexMap.set(key, newIdx);
    return newIdx;
  };
  
  // 2. Build Merged SVG in OpenType Table
  const mergedSvgMap = new Map<number, Uint8Array>();
  
  // 3. Build Merged COLR Table
  const colrBaseGlyphMap = new Map<number, { glyphID: number; layers: { glyphID: number; paletteIndex: number }[] }>();
  
  // First, migrate base font color glyphs that were NOT swapped
  for (let targetGid = 0; targetGid < newGlyphs.length; targetGid++) {
    const g = newGlyphs[targetGid];
    if (!g) continue;
    const cp = g.unicode;
    const isSwapped = cp !== undefined && glyphMap[cp] !== undefined;
    
    if (!isSwapped) {
      // Retain base font SVG
      const baseSvg = baseColorInfo.colorGlyphs.get(targetGid)?.svgDocument;
      if (baseSvg) {
        let doc = baseSvg.replace(/id="glyph\d+"/g, `id="glyph${targetGid}"`);
        if (!doc.includes(`id="glyph${targetGid}"`)) {
          doc = doc.replace(/<svg\b([^>]*)>/i, `<svg$1 id="glyph${targetGid}">`);
        }
        mergedSvgMap.set(targetGid, encoder.encode(doc));
      }
      
      // Retain base font COLR
      const baseColr = baseColorInfo.colorGlyphs.get(targetGid);
      if (baseColr && baseColr.layers && baseColr.layers.length > 0) {
        const remappedLayers: { glyphID: number; paletteIndex: number }[] = [];
        for (const l of baseColr.layers) {
          remappedLayers.push({
            glyphID: l.glyphIndex,
            paletteIndex: getOrAddPaletteColor('base', l.paletteIndex, l.color || '#000000')
          });
        }
        colrBaseGlyphMap.set(targetGid, {
          glyphID: targetGid,
          layers: remappedLayers
        });
      }
    }
  }
  
  // Now, merge swapped glyphs from target fonts
  for (let targetGid = 0; targetGid < newGlyphs.length; targetGid++) {
    const g = newGlyphs[targetGid];
    if (!g || g.unicode === undefined) continue;
    const cp = g.unicode;
    const targetFontId = glyphMap[cp];
    if (!targetFontId) continue;
    
    const targetFont = parsedFonts.get(targetFontId);
    if (!targetFont) continue;
    
    const targetColorInfo = extractColorFontInfo(targetFont);
    const sourceGid = targetFont.charToGlyphIndex(String.fromCodePoint(cp));
    if (!sourceGid || sourceGid <= 0) continue;
    
    // A. SVG in OpenType for swapped glyph
    const sourceSvgDoc = targetColorInfo.colorGlyphs.get(sourceGid)?.svgDocument;
    if (sourceSvgDoc) {
      let doc = sourceSvgDoc.replace(/id="glyph\d+"/g, `id="glyph${targetGid}"`);
      if (!doc.includes(`id="glyph${targetGid}"`)) {
        doc = doc.replace(/<svg\b([^>]*)>/i, `<svg$1 id="glyph${targetGid}">`);
      }
      mergedSvgMap.set(targetGid, encoder.encode(doc));
    }
    
    // B. COLR for swapped glyph
    const sourceColr = targetColorInfo.colorGlyphs.get(sourceGid);
    if (sourceColr && sourceColr.layers && sourceColr.layers.length > 0) {
      const remappedLayers: { glyphID: number; paletteIndex: number }[] = [];
      const targetPalette = targetColorInfo.palettes[0] || [];
      
      for (const l of sourceColr.layers) {
        const layerColorHex = l.paletteIndex === 0xFFFF ? 'currentColor' : (targetPalette[l.paletteIndex] || '#000000');
        const newPaletteIdx = getOrAddPaletteColor(targetFontId, l.paletteIndex, layerColorHex);
        
        // Ensure layer glyph exists in newGlyphs
        let layerGid = l.glyphIndex;
        // If layer glyph is beyond original glyphs, we map or clone it
        if (l.glyphIndex < targetFont.glyphs.length) {
          const layerGlyph = targetFont.glyphs.get(l.glyphIndex);
          if (layerGlyph) {
            // Find existing identical glyph or append as unmapped layer glyph
            const scale = (baseFont.unitsPerEm || 1000) / (targetFont.unitsPerEm || 1000);
            const PathClass = opentype.Path;
            const GlyphClass = opentype.Glyph;
            const scaledPath = new PathClass();
            if (layerGlyph.path && layerGlyph.path.commands) {
              for (const cmd of layerGlyph.path.commands) {
                if (cmd.type === 'M') scaledPath.moveTo(Math.round(cmd.x * scale), Math.round(cmd.y * scale));
                else if (cmd.type === 'L') scaledPath.lineTo(Math.round(cmd.x * scale), Math.round(cmd.y * scale));
                else if (cmd.type === 'Q') scaledPath.quadraticCurveTo(Math.round(cmd.x1 * scale), Math.round(cmd.y1 * scale), Math.round(cmd.x * scale), Math.round(cmd.y * scale));
                else if (cmd.type === 'C') scaledPath.curveTo(Math.round(cmd.x1 * scale), Math.round(cmd.y1 * scale), Math.round(cmd.x2 * scale), Math.round(cmd.y2 * scale), Math.round(cmd.x * scale), Math.round(cmd.y * scale));
                else if (cmd.type === 'Z') scaledPath.close();
              }
            }
            
            const newLayerGlyph = new GlyphClass({
              name: `layer_${targetGid}_${l.glyphIndex}`,
              advanceWidth: Math.round((layerGlyph.advanceWidth || 0) * scale),
              path: scaledPath
            });
            layerGid = newGlyphs.length;
            newGlyphs.push(newLayerGlyph);
          }
        }
        
        remappedLayers.push({
          glyphID: layerGid,
          paletteIndex: newPaletteIdx
        });
      }
      
      colrBaseGlyphMap.set(targetGid, {
        glyphID: targetGid,
        layers: remappedLayers
      });
    }
  }
  
  // 4. Assemble final tables
  const hasMergedSvg = mergedSvgMap.size > 0;
  const hasMergedColr = colrBaseGlyphMap.size > 0;
  const hasMergedColor = hasMergedSvg || hasMergedColr;
  
  let colrTable = null;
  let cpalTable = null;
  let caplTable = null;
  let svgTable: Map<number, Uint8Array> | null = null;
  
  if (hasMergedColor) {
    // Build CPAL and CAPL tables
    cpalTable = buildCpalTable([masterPalette]);
    caplTable = buildCaplTable([masterPalette]);
  }
  
  if (hasMergedColr) {
    const colrBases = Array.from(colrBaseGlyphMap.values());
    colrTable = buildColrTable(colrBases);
  }
  
  if (hasMergedSvg) {
    svgTable = mergedSvgMap;
  }
  
  return {
    hasColor: hasMergedColor,
    colrTable,
    cpalTable,
    caplTable,
    svgTable
  };
}
