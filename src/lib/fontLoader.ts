import * as opentype from 'opentype.js';
import { set } from 'idb-keyval';
import type { UploadedFont, GlyphMapping } from '../types';
import { traceImageToFont, extractSupportedCodePoints, normalizeFontBuffer, parseSfntBasic, sessionServerFontCache } from './fontUtils';
import { extractColorFontInfo } from './colorFontUtils';
import { registerFontBuffer, generateUUID, arrayBufferToDataUrl, isAliveArrayBuffer } from './workspace';

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

export type FontStepProgressCallback = (subPercent: number, status: string) => void;

export async function loadFontFile(
  file: File, 
  colorIndex: number = 0,
  onStepProgress?: FontStepProgressCallback
): Promise<{ font?: UploadedFont; embeddedGlyphMap?: GlyphMapping; error?: string }> {
  try {
    if (!file || (file.size === 0 && !file.name.match(/\.(png|jpe?g|svg)$/i))) {
      return { error: `File "${file?.name || 'unknown'}" is empty (0 bytes)` };
    }

    onStepProgress?.(12, `Reading ${file.name}...`);

    if (file.name.match(/\.(png|jpe?g|svg)$/i)) {
      onStepProgress?.(30, `Tracing image ${file.name} to vector font...`);
      const newFont = await traceImageToFont(file, file.name, [65]);
      if (newFont) {
        onStepProgress?.(90, `Registering traced font ${file.name}...`);
        registerFontBuffer(newFont.id, newFont.name, newFont.fileName, newFont.buffer);
        onStepProgress?.(100, `Loaded ${file.name}`);
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

    onStepProgress?.(35, `Analyzing font format & decompressing...`);

    // Standardize font format (automatically decodes WOFF2, WOFF1, or TTC into TTF/OTF)
    try {
      rawBuffer = await normalizeFontBuffer(rawBuffer, file.name);
    } catch (normErr) {
      console.warn("Font normalization warning for", file.name, normErr);
    }

    await new Promise(r => setTimeout(r, 0));
    onStepProgress?.(55, `Parsing OpenType tables & glyph data...`);

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

    const isLargeFont = rawBuffer.byteLength > 1.5 * 1024 * 1024; // 1.5MB threshold ensures all CJK/symbol fonts index in <2ms

    if (isLargeFont) {
      // High-speed instant SFNT binary extraction for large fonts (PingFang, CJK) in 2ms
      try {
        const sfnt = parseSfntBasic(rawBuffer, fontName);
        if (sfnt.name && sfnt.name !== 'Custom Font') {
          fontName = sfnt.name;
        }
        if (sfnt.codePoints && sfnt.codePoints.size > 0) {
          supportedCodePoints = sfnt.codePoints;
        }
      } catch (sfe) {}
      onStepProgress?.(72, `Indexed ${supportedCodePoints.size} glyphs instantly...`);
    } else {
      // Standard-size fonts: Full OpenType parse
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

        await new Promise(r => setTimeout(r, 0));
        onStepProgress?.(72, `Indexing Unicode character mapping...`);

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
    }

    // Fast, non-blocking glyph unicodes fallback (never calls glyphs.get)
    if (supportedCodePoints.size === 0 && parsed) {
      try {
        const extracted = extractSupportedCodePoints(parsed);
        if (extracted.size > 0) {
          supportedCodePoints = extracted;
        } else if (parsed.glyphs?.glyphs && typeof parsed.glyphs.glyphs === 'object') {
          const vals = Object.values(parsed.glyphs.glyphs);
          for (let i = 0; i < vals.length; i++) {
            const g: any = vals[i];
            if (g) {
              if (typeof g.unicode === 'number' && g.unicode > 0) supportedCodePoints.add(g.unicode);
              if (Array.isArray(g.unicodes)) {
                for (const u of g.unicodes) if (typeof u === 'number' && u > 0) supportedCodePoints.add(u);
              }
            }
            if (supportedCodePoints.size >= 65536) break;
          }
        }
      } catch {}
    }

    // Strict validation: if font could not be parsed and has 0 supported glyphs, it is NOT loaded -> ERROR!
    if (!parsed && supportedCodePoints.size === 0) {
      return { error: `Failed to load "${file.name}": Unsupported format or corrupted font data.` };
    }

    await new Promise(r => setTimeout(r, 0));
    onStepProgress?.(88, `Registering font preview and CSS...`);

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

    // Register in RAM cache safely
    registerFontBuffer(id, fontName, effectiveFileName, rawBuffer);

    // Asynchronously pre-cache on server persistent store so fused font generation has instant 0ms access
    if (typeof fetch !== 'undefined' && isAliveArrayBuffer(rawBuffer)) {
      try {
        const cacheBlob = new Blob([rawBuffer], { type: 'application/octet-stream' });
        fetch(`/api/cache-font?id=${encodeURIComponent(id)}&name=${encodeURIComponent(fontName)}&filename=${encodeURIComponent(effectiveFileName)}`, {
          method: 'POST',
          body: cacheBlob
        }).then(res => res.json()).then(data => {
          if (data && data.saved) {
            sessionServerFontCache[id] = data.saved;
          }
        }).catch(() => {});
      } catch {}
    }

    // Inject @font-face immediately into document so CSS resolves font via Blob URL (never detaches or locks buffer)
    if (typeof FontFace !== 'undefined' && isAliveArrayBuffer(rawBuffer)) {
      try {
        const blob = new Blob([rawBuffer], { type: 'font/ttf' });
        const blobUrl = URL.createObjectURL(blob);
        const fontFace = new FontFace(fontFamilyName, `url(${blobUrl})`);
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

    onStepProgress?.(100, `Font ready!`);

    const uploadedFont: UploadedFont = {
      id,
      name: fontName,
      fileName: effectiveFileName,
      file: fileClone,
      buffer: rawBuffer,
      dataUrl: (file as any).dataUrl || undefined,
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

  let highestCurrent = 1;
  let highestPercent = 10;

  if (onProgress && filesArray.length > 0) {
    onProgress({
      current: 1,
      total: filesArray.length,
      percent: 10,
      fileName: filesArray[0]?.name || 'font file',
      status: `Initializing ${filesArray.length} font${filesArray.length > 1 ? 's' : ''}...`
    });
  }

  // Load font files sequentially with guaranteed strictly monotonic non-decreasing counters
  for (let idx = 0; idx < filesArray.length; idx++) {
    const file = filesArray[idx];
    const currentNumber = idx + 1;
    highestCurrent = Math.max(highestCurrent, currentNumber);

    const onStep: FontStepProgressCallback = (subPercent: number, status: string) => {
      if (!onProgress) return;
      const basePct = (idx / filesArray.length) * 100;
      const stepPct = (subPercent / filesArray.length);
      const overallPct = Math.min(99, Math.round(basePct + stepPct));
      highestPercent = Math.max(highestPercent, overallPct);
      onProgress({
        current: highestCurrent,
        total: filesArray.length,
        percent: highestPercent,
        fileName: file.name,
        status
      });
    };

    onStep(15, `Reading ${file.name}...`);
    const res = await loadFontFile(file, existingFontCount + idx, onStep);

    if (res.font) {
      newFonts.push(res.font);
      if (res.embeddedGlyphMap) {
        mergedGlyphMap = { ...mergedGlyphMap, ...res.embeddedGlyphMap };
      }
    } else if (res.error) {
      errors.push(res.error);
    }

    if (onProgress) {
      const pct = Math.round(((idx + 1) / filesArray.length) * 100);
      highestPercent = Math.max(highestPercent, pct);
      onProgress({
        current: Math.min(filesArray.length, highestCurrent),
        total: filesArray.length,
        percent: highestPercent,
        fileName: file.name,
        status: res.font ? `Loaded ${file.name}` : `Failed ${file.name}`
      });
    }

    // Yield to browser event loop so garbage collector can sweep intermediate allocations
    await new Promise(r => setTimeout(r, 40));
  }

  return {
    newFonts,
    embeddedGlyphMap: Object.keys(mergedGlyphMap).length > 0 ? mergedGlyphMap : undefined,
    errors
  };
}
