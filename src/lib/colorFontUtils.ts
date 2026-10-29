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
  
  if (str === 'currentcolor' || str === 'inherit') {
    return 0xFFFFFFFF;
  }
  
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
        const aVal = Number(match[4]);
        a = Math.min(255, Math.max(0, Math.round(aVal <= 1 ? aVal * 255 : aVal)));
      }
    }
  }
  
  return (((b & 0xFF) << 24) | ((g & 0xFF) << 16) | ((r & 0xFF) << 8) | (a & 0xFF)) >>> 0;
}

/**
 * Converts a 32-bit BGRA integer from OpenType CPAL (read as big-endian ULong by opentype.js)
 * into a hex color string #RRGGBB or #RRGGBBAA
 */
export function bgraIntToHex(bgra: number): string {
  const b = (bgra >>> 24) & 0xFF;
  const g = (bgra >>> 16) & 0xFF;
  const r = (bgra >>> 8) & 0xFF;
  const a = bgra & 0xFF;
  
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

export function createEmptyColorData(): ColorFontData {
  return {
    hasColor: false,
    hasCOLR: false,
    hasCPAL: false,
    hasCAPL: false,
    hasSVG: false,
    palettes: [],
    colorGlyphs: new Map(),
    codepointColorMap: new Map()
  };
}

/**
 * Extracts and inspects all Color OpenType tables (SVG in OpenType, COLR, CPAL, CAPL) from an opentype.Font
 */
export function extractColorFontInfo(font: any): ColorFontData {
  if (font && font._cachedColorInfo) {
    return font._cachedColorInfo;
  }

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
            : (defaultPalette[lr.paletteIndex] || '#ff0000');
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
      svgTable.forEach((bytes, gid) => {
        try {
          const svgStr = typeof bytes === 'string' ? bytes : decoder.decode(bytes);
          const existing: ColorGlyphRecord = result.colorGlyphs.get(gid) || { glyphIndex: gid };
          existing.svgDocument = svgStr;
          existing.hasSVG = true;
          result.colorGlyphs.set(gid, existing);
        } catch (e) {}
      });
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

  // Map codepoints to color records efficiently using cmap without touching glyph outlines
  if (result.hasColor && result.colorGlyphs.size > 0) {
    const glyphIdToUnicode = new Map<number, number>();

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

    result.colorGlyphs.forEach((record, gid) => {
      let unicode = glyphIdToUnicode.get(gid);
      if (unicode === undefined && font.glyphs?.glyphs) {
        try {
          const g = font.glyphs.glyphs[gid];
          if (g && typeof g.unicode === 'number' && g.unicode > 0) {
            unicode = g.unicode;
          }
        } catch (e) {}
      }
      if (unicode !== undefined) {
        record.codepoint = unicode;
        result.codepointColorMap.set(unicode, record);
      }
    });
  }

  try {
    font._cachedColorInfo = result;
  } catch (e) {}

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
 * Ultra-low memory implementation: supports optional newGlyphs and prevents reading undefined.length.
 */
export function mergeColorTables(
  baseFont: any,
  parsedFonts: Map<string, any> | { get: (id: string) => any; forEach?: any },
  glyphMap: Record<number, string>,
  newGlyphs?: any[]
): {
  hasColor: boolean;
  colrTable: any | null;
  cpalTable: any | null;
  caplTable: any | null;
  svgTable: Map<number, Uint8Array> | null;
} {
  const encoder = new TextEncoder();
  const baseColorInfo = extractColorFontInfo(baseFont);

  // Cache target font color data to prevent re-extracting in loops
  const targetColorCache = new Map<string, ColorFontData>();
  const getTargetColor = (fontId: string): ColorFontData | null => {
    if (targetColorCache.has(fontId)) return targetColorCache.get(fontId)!;
    const font = parsedFonts.get(fontId);
    if (!font) return null;
    const info = extractColorFontInfo(font);
    targetColorCache.set(fontId, info);
    return info;
  };

  // Check if any font in the mapping has color
  let anyFontHasColor = baseColorInfo.hasColor;
  if (!anyFontHasColor) {
    const usedFontIds = new Set(Object.values(glyphMap || {}));
    for (const fId of usedFontIds) {
      const info = getTargetColor(fId);
      if (info && info.hasColor) {
        anyFontHasColor = true;
        break;
      }
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
    masterPalette.push('#000000', '#ffffff', '#ff0000', '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899');
  }

  const getOrAddPaletteColor = (fontId: string, origIdx: number, colorHex: string): number => {
    if (origIdx === 0xFFFF) return 0xFFFF; // currentColor
    const key = `${fontId}:${origIdx}`;
    if (paletteIndexMap.has(key)) return paletteIndexMap.get(key)!;

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

  // A. Migrate base font color glyphs that were NOT swapped
  baseColorInfo.colorGlyphs.forEach((baseColr, targetGid) => {
    const cp = baseColr.codepoint;
    const isSwapped = cp !== undefined && glyphMap && glyphMap[cp] !== undefined;

    if (!isSwapped) {
      if (baseColr.svgDocument) {
        let doc = baseColr.svgDocument.replace(/id="glyph\d+"/g, `id="glyph${targetGid}"`);
        if (!doc.includes(`id="glyph${targetGid}"`)) {
          doc = doc.replace(/<svg\b([^>]*)>/i, `<svg$1 id="glyph${targetGid}">`);
        }
        mergedSvgMap.set(targetGid, encoder.encode(doc));
      }

      if (baseColr.layers && baseColr.layers.length > 0) {
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
  });

  // Pre-index baseFont glyphs by unicode in a single pass (O(N)) to eliminate linear scans
  const baseUnicodeToGid = new Map<number, number>();
  if (Array.isArray(newGlyphs) && newGlyphs.length > 0) {
    for (let i = 0; i < newGlyphs.length; i++) {
      const g = newGlyphs[i];
      if (g) {
        if (typeof g.unicode === 'number') baseUnicodeToGid.set(g.unicode, i);
        if (Array.isArray(g.unicodes)) {
          for (const u of g.unicodes) baseUnicodeToGid.set(u, i);
        }
      }
    }
  } else if (baseFont) {
    const cmap = baseFont.tables?.cmap?.glyphIndexMap || (baseFont.encoding as any)?.cmap?.glyphIndexMap;
    if (cmap && typeof cmap === 'object') {
      for (const [uStr, gid] of Object.entries(cmap)) {
        baseUnicodeToGid.set(Number(uStr), Number(gid));
      }
    } else if (baseFont.glyphs?.glyphs) {
      const gObj = baseFont.glyphs.glyphs;
      const vals = Object.values(gObj);
      for (let i = 0; i < vals.length; i++) {
        const g: any = vals[i];
        if (g) {
          if (typeof g.unicode === 'number') baseUnicodeToGid.set(g.unicode, g.index ?? i);
          if (Array.isArray(g.unicodes)) {
            for (const u of g.unicodes) baseUnicodeToGid.set(u, g.index ?? i);
          }
        }
      }
    }
  }

  // Pre-index target fonts
  const targetUnicodeToGidMaps = new Map<string, Map<number, number>>();
  const getTargetGidMap = (fId: string, font: any): Map<number, number> => {
    if (targetUnicodeToGidMaps.has(fId)) return targetUnicodeToGidMaps.get(fId)!;
    const m = new Map<number, number>();
    if (font) {
      const cmap = font.tables?.cmap?.glyphIndexMap || (font.encoding as any)?.cmap?.glyphIndexMap;
      if (cmap && typeof cmap === 'object') {
        for (const [uStr, gid] of Object.entries(cmap)) {
          m.set(Number(uStr), Number(gid));
        }
      } else if (font.glyphs?.glyphs) {
        const gObj = font.glyphs.glyphs;
        const vals = Object.values(gObj);
        for (let i = 0; i < vals.length; i++) {
          const g: any = vals[i];
          if (g) {
            if (typeof g.unicode === 'number') m.set(g.unicode, g.index ?? i);
            if (Array.isArray(g.unicodes)) {
              for (const u of g.unicodes) m.set(u, g.index ?? i);
            }
          }
        }
      }
    }
    targetUnicodeToGidMaps.set(fId, m);
    return m;
  };

  // B. Merge swapped glyphs from target fonts
  for (const [cpStr, targetFontId] of Object.entries(glyphMap || {})) {
    const cp = Number(cpStr);
    if (!targetFontId) continue;

    const targetColorInfo = getTargetColor(targetFontId);
    if (!targetColorInfo || !targetColorInfo.hasColor) continue;

    const targetFont = parsedFonts.get(targetFontId);
    if (!targetFont) continue;

    const targetGidMap = getTargetGidMap(targetFontId, targetFont);
    const sourceGid = targetGidMap.get(cp) || (typeof targetFont.charToGlyphIndex === 'function' ? targetFont.charToGlyphIndex(String.fromCodePoint(cp)) : 0);
    if (!sourceGid || sourceGid <= 0) continue;

    const sourceColr = targetColorInfo.colorGlyphs.get(sourceGid) || targetColorInfo.codepointColorMap.get(cp);
    if (!sourceColr) continue;

    let targetGid = baseUnicodeToGid.get(cp);
    if (targetGid === undefined && typeof baseFont.charToGlyphIndex === 'function') {
      targetGid = baseFont.charToGlyphIndex(String.fromCodePoint(cp));
    }
    if (targetGid === undefined || targetGid < 0) continue;

    // SVG in OpenType for swapped glyph
    const sourceSvgDoc = sourceColr.svgDocument;
    if (sourceSvgDoc) {
      let doc = sourceSvgDoc.replace(/id="glyph\d+"/g, `id="glyph${targetGid}"`);
      if (!doc.includes(`id="glyph${targetGid}"`)) {
        doc = doc.replace(/<svg\b([^>]*)>/i, `<svg$1 id="glyph${targetGid}">`);
      }
      mergedSvgMap.set(targetGid, encoder.encode(doc));
    }

    // COLR for swapped glyph
    if (sourceColr.layers && sourceColr.layers.length > 0) {
      const remappedLayers: { glyphID: number; paletteIndex: number }[] = [];
      const targetPalette = targetColorInfo.palettes[0] || [];

      for (const l of sourceColr.layers) {
        const layerColorHex = l.paletteIndex === 0xFFFF ? 'currentColor' : (targetPalette[l.paletteIndex] || '#ff0000');
        const newPaletteIdx = getOrAddPaletteColor(targetFontId, l.paletteIndex, layerColorHex);

        let layerGid = l.glyphIndex;
        if (l.glyphIndex === sourceGid) {
          layerGid = targetGid;
        } else {
          layerGid = targetGid;
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
  let svgTable: Map<number, Uint8Array> | null = null;

  if (hasMergedColor) {
    cpalTable = buildCpalTable([masterPalette]);
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
    caplTable: null,
    svgTable
  };
}
