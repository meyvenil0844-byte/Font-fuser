import * as opentype from 'opentype.js';
import { set } from 'idb-keyval';
import type { UploadedFont, GlyphMapping } from '../types';
import { traceImageToFont, extractSupportedCodePoints, normalizeFontBuffer, parseSfntBasic } from './fontUtils';
import { extractColorFontInfo } from './colorFontUtils';
import { registerFontBuffer, generateUUID } from './workspace';

export const FONT_PALETTE_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#ef4444'
];

export interface FontLoadingProgress {
  current: number;
  total: number;
  percent: number;
  fileName: string;
  status: string;
}

export interface LoadFontsResult {
  newFonts: UploadedFont[];
  embeddedGlyphMap?: GlyphMapping;
  errors: string[];
}

export async function loadFontFile(
  file: File, 
  colorIndex: number = 0
): Promise<{ font?: UploadedFont; embeddedGlyphMap?: GlyphMapping; error?: string }> {
  try {
    if (!file || (file.size === 0 && !file.name.match(/\.(png|jpe?g|svg)$/i))) {
      return { error: `File "${file?.name || 'unknown'}" is empty (0 bytes)` };
    }

    if (file.name.match(/\.(png|jpe?g|svg)$/i)) {
      const newFont = await traceImageToFont(file, file.name, [65]);
      if (newFont) {
        registerFontBuffer(newFont.id, newFont.name, newFont.fileName, newFont.buffer);
        return { font: newFont };
      }
      return { error: `Failed to trace image "${file.name}" to font` };
    }

    let rawBuffer: ArrayBuffer | null = null;
    try {
      if (typeof file.arrayBuffer === 'function') {
        const ab = await file.arrayBuffer();
        if (ab && ab.byteLength > 0) rawBuffer = ab;
      }
    } catch {}

    if (!rawBuffer || rawBuffer.byteLength === 0) {
      try {
        rawBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as ArrayBuffer);
          reader.onerror = () => reject(new Error('FileReader failed'));
          reader.readAsArrayBuffer(file);
        });
      } catch (readErr: any) {
        return { error: `Failed to read "${file.name}": ${readErr?.message || String(readErr)}` };
      }
    }

    if (!rawBuffer || rawBuffer.byteLength < 12) {
      return { error: `File "${file.name}" is too small to be a font (${rawBuffer?.byteLength || 0} bytes)` };
    }

    // Standardize font format (automatically decodes WOFF2, WOFF1, or TTC into TTF/OTF)
    try {
      rawBuffer = await normalizeFontBuffer(rawBuffer, file.name);
    } catch (normErr) {
      console.warn("Font normalization warning for", file.name, normErr);
    }

    let parsed: any = null;
    let fontName = file.name.replace(/\.[^/.]+$/, '');
    let supportedCodePoints = new Set<number>();
    let colorData = {
      hasColor: false,
      hasCOLR: false,
      hasCPAL: false,
      hasCAPL: false,
      hasSVG: false,
      palettes: [] as string[][],
      colorGlyphs: new Map<number, any>(),
      codepointColorMap: new Map<number, any>()
    };

    // Attempt 1: Full OpenType parse
    try {
      parsed = opentype.parse(rawBuffer.slice(0));
      
      const n = parsed.names;
      const familyCandidate = 
        (n?.fontFamily as any)?.en 
        || (typeof n?.fontFamily === 'string' ? n.fontFamily : '')
        || (n?.macintosh?.fontFamily as any)?.en
        || (n?.windows?.fontFamily as any)?.en
        || (n?.fullName as any)?.en
        || (n?.macintosh?.fullName as any)?.en
        || (n?.windows?.fullName as any)?.en;
      if (familyCandidate && typeof familyCandidate === 'string' && familyCandidate.trim()) {
        fontName = familyCandidate.trim();
      }

      try {
        colorData = extractColorFontInfo(parsed);
      } catch {}

      try {
        supportedCodePoints = extractSupportedCodePoints(parsed);
      } catch {}
    } catch (parseErr) {
      console.warn("opentype.js parse warning for", file.name, parseErr, "using SFNT fallback");
    }

    // Resilient SFNT extraction fallback if supportedCodePoints is still empty
    if (supportedCodePoints.size === 0 && rawBuffer.byteLength > 0) {
      try {
        const sfnt = parseSfntBasic(rawBuffer, fontName);
        if (sfnt.name && sfnt.name !== 'Custom Font' && (!fontName || fontName === file.name.replace(/\.[^/.]+$/, ''))) {
          fontName = sfnt.name;
        }
        if (sfnt.codePoints && sfnt.codePoints.size > 0) {
          supportedCodePoints = sfnt.codePoints;
        }
      } catch {}
    }

    // Direct glyph unicodes fallback
    if (supportedCodePoints.size === 0 && parsed?.glyphs) {
      try {
        const glyphs = parsed.glyphs;
        const count = typeof glyphs.length === 'number' ? glyphs.length : Object.keys(glyphs).length;
        for (let gIdx = 0; gIdx < count; gIdx++) {
          const g = typeof glyphs.get === 'function' ? glyphs.get(gIdx) : glyphs[gIdx];
          if (g) {
            if (typeof g.unicode === 'number' && g.unicode > 0) supportedCodePoints.add(g.unicode);
            if (Array.isArray(g.unicodes)) {
              for (const u of g.unicodes) if (typeof u === 'number' && u > 0) supportedCodePoints.add(u);
            }
          }
        }
      } catch {}
    }

    // Strict validation: if font could not be parsed and has 0 supported glyphs, it is NOT loaded -> ERROR!
    if (!parsed && supportedCodePoints.size === 0) {
      return { error: `Failed to load "${file.name}": Unsupported format or corrupted font data.` };
    }

    const id = generateUUID();
    const fontFamilyName = `FontFuser_${id}`;
    const effectiveFileName = file.name.endsWith('.woff2') ? file.name.replace(/\.woff2$/i, '.ttf') : file.name;
    
    let fileClone: File;
    try {
      fileClone = new File([rawBuffer], effectiveFileName, { type: 'application/octet-stream' });
    } catch {
      const blob = new Blob([rawBuffer], { type: 'application/octet-stream' });
      (blob as any).name = effectiveFileName;
      fileClone = blob as any;
    }

    // Register in RAM cache and IndexedDB
    registerFontBuffer(id, fontName, effectiveFileName, rawBuffer);
    if (typeof indexedDB !== 'undefined') {
      try {
        set(`font-file-${id}`, rawBuffer.slice(0)).catch(() => {});
      } catch {}
    }

    // Inject @font-face immediately into document so CSS resolves font
    if (typeof FontFace !== 'undefined' && rawBuffer.byteLength > 0) {
      try {
        const fontFace = new FontFace(fontFamilyName, rawBuffer.slice(0));
        document.fonts.add(fontFace);
        fontFace.load().catch(() => {});
      } catch {}
    }

    // Check for embedded project metadata
    let embeddedGlyphMap: GlyphMapping | undefined = undefined;
    if (parsed) {
      try {
        let metaStr: string | null = null;
        if ((parsed.names as any)?.unicode?.description?.en) metaStr = (parsed.names as any).unicode.description.en;
        else if ((parsed.names as any)?.macintosh?.description?.en) metaStr = (parsed.names as any).macintosh.description.en;
        else if ((parsed.names as any)?.windows?.description?.en) metaStr = (parsed.names as any).windows.description.en;
        
        if (metaStr) {
          const meta = JSON.parse(metaStr);
          if (meta.glyphMap) {
            embeddedGlyphMap = {};
            for (const cp of Object.keys(meta.glyphMap)) {
              embeddedGlyphMap[Number(cp)] = id;
            }
          }
        }
      } catch {}
    }

    const uploadedFont: UploadedFont = {
      id,
      name: fontName,
      fileName: effectiveFileName,
      file: fileClone,
      buffer: rawBuffer,
      parsed,
      fontFamilyName,
      color: FONT_PALETTE_COLORS[colorIndex % FONT_PALETTE_COLORS.length],
      hasColor: !!colorData?.hasColor,
      colorData,
      supportedCodePoints
    };

    return { font: uploadedFont, embeddedGlyphMap };
  } catch (err: any) {
    return { error: `Error processing "${file.name}": ${err?.message || String(err)}` };
  }
}

export async function loadFontFiles(
  files: FileList | File[],
  existingFontCount: number = 0,
  onProgress?: (progress: FontLoadingProgress) => void
): Promise<LoadFontsResult> {
  const filesArray = Array.from(files);
  const newFonts: UploadedFont[] = [];
  const errors: string[] = [];
  let mergedGlyphMap: GlyphMapping = {};

  for (let i = 0; i < filesArray.length; i++) {
    const file = filesArray[i];
    const initialPercent = Math.round((i / filesArray.length) * 100);
    if (onProgress) {
      onProgress({
        current: i + 1,
        total: filesArray.length,
        percent: initialPercent,
        fileName: file.name,
        status: `Processing ${i + 1}/${filesArray.length}: ${file.name}...`
      });
    }
    // Yield to main event loop for smooth UI
    await new Promise(r => setTimeout(r, 15));

    const result = await loadFontFile(file, existingFontCount + newFonts.length);
    if (result.font) {
      newFonts.push(result.font);
      if (result.embeddedGlyphMap) {
        mergedGlyphMap = { ...mergedGlyphMap, ...result.embeddedGlyphMap };
      }
    } else if (result.error) {
      errors.push(result.error);
    }

    if (onProgress) {
      const completedPercent = Math.round(((i + 1) / filesArray.length) * 100);
      onProgress({
        current: i + 1,
        total: filesArray.length,
        percent: completedPercent,
        fileName: file.name,
        status: result.font ? `Loaded ${file.name}` : `Failed ${file.name}`
      });
    }
  }

  return {
    newFonts,
    embeddedGlyphMap: Object.keys(mergedGlyphMap).length > 0 ? mergedGlyphMap : undefined,
    errors
  };
}
