import { get } from 'idb-keyval';
import { coerceToArrayBuffer } from './workspace';

export interface SaveFileStats {
  projectName: string;
  totalFonts: number;
  neededFontsCount: number;
  mappedGlyphsCount: number;
  baseFontName: string;
  sourceFontNames: string[];
}

export interface ParsedSaveData {
  name: string;
  id?: string;
  fonts: any[];
  glyphMap: Record<string, string>;
  stats: SaveFileStats;
  raw: any;
}

/**
 * Parses a save file from File, string, or object and extracts stats
 */
export async function parseSaveFile(input: File | string | object): Promise<ParsedSaveData> {
  let raw: any = null;

  if (input instanceof File) {
    const text = await input.text();
    try {
      raw = JSON.parse(text);
    } catch {
      throw new Error(`The selected file "${input.name}" is not a valid JSON or .fuser save file.`);
    }
  } else if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch {
      throw new Error('Provided text is not a valid JSON save string.');
    }
  } else if (typeof input === 'object' && input !== null) {
    raw = input;
  } else {
    throw new Error('Unsupported save file format.');
  }

  // Handle various wrapper formats (root, { saved: ... }, or array)
  const rawFonts = Array.isArray(raw.fonts) ? raw.fonts : (Array.isArray(raw) ? raw : (raw.saved?.fonts || []));
  const glyphMap: Record<string, string> = raw.glyphMap || raw.saved?.glyphMap || {};
  let projectName = (raw.name || raw.saved?.name || (input instanceof File ? input.name : 'FusedFont'))
    .replace(/\.(fuser|json|ttf|otf)$/i, '')
    .trim() || 'FusedFont';

  if (!Array.isArray(rawFonts) || rawFonts.length === 0) {
    throw new Error('Save file does not contain any font data to convert.');
  }

  const baseFont = rawFonts[0];
  const baseFontName = baseFont?.name || baseFont?.fileName || 'Base Font';

  const neededFontIds = new Set(Object.values(glyphMap).map(String));
  neededFontIds.add(String(baseFont.id));

  const neededFonts = rawFonts.filter(f => f && (String(f.id) === String(baseFont.id) || neededFontIds.has(String(f.id))));
  const sourceFontNames = neededFonts.map(f => f.name || f.fileName || String(f.id));

  return {
    name: projectName,
    id: raw.id || raw.saved?.id,
    fonts: rawFonts,
    glyphMap,
    stats: {
      projectName,
      totalFonts: rawFonts.length,
      neededFontsCount: neededFonts.length,
      mappedGlyphsCount: Object.keys(glyphMap).length,
      baseFontName,
      sourceFontNames
    },
    raw
  };
}

/**
 * Load project data from IndexedDB or server without parsing opentype objects
 */
export async function loadRawProjectSave(projectId: string, storageKey?: string): Promise<ParsedSaveData> {
  const cleanId = String(projectId).trim();
  let raw: any = null;

  // 1. StorageKey lookup if provided
  if (storageKey) {
    try {
      raw = await get<any>(storageKey);
    } catch {}
  }

  // 2. Direct key in IndexedDB
  if (!raw && cleanId) {
    try {
      raw = await get<any>(`fusion-project-${cleanId}`);
    } catch {}
    if (!raw) {
      try {
        raw = await get<any>(cleanId);
      } catch {}
    }
  }

  // 3. Server API fallback
  if (!raw && cleanId) {
    try {
      const res = await fetch(`/api/project/${encodeURIComponent(cleanId)}`);
      if (res.ok) {
        raw = await res.json();
      }
    } catch {}
  }

  if (!raw) {
    throw new Error(`Could not find saved project "${cleanId}".`);
  }

  return parseSaveFile(raw);
}

/**
 * Helper to download ArrayBuffer as a file in browser
 */
export function triggerFileDownload(buffer: ArrayBuffer | Blob, filename: string, directUrl?: string) {
  if (directUrl) {
    const a = document.createElement('a');
    a.href = directUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return;
  }

  const blob = buffer instanceof Blob ? buffer : new Blob([buffer], { type: 'font/ttf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

/**
 * Fast Convert Save File to TTF
 * Directly sends the save file data to the server fast converter worker
 * and monitors progress until the TTF file is downloaded.
 */
export async function convertSaveToTtf(
  saveData: ParsedSaveData | any,
  onProgress?: (percent: number, message: string) => void,
  targetFilename?: string
): Promise<{ success: boolean; filename: string; downloadUrl: string }> {
  onProgress?.(5, 'Preparing save file data...');

  const rawPayload = saveData.raw || saveData;
  const projectName = (targetFilename || saveData.name || rawPayload.name || 'FusedFont')
    .replace(/\.(fuser|json|ttf|otf)$/i, '')
    .trim() || 'FusedFont';
  const expectedFilename = `${projectName}.ttf`;

  onProgress?.(10, 'Sending fonts and glyph map to fast converter...');

  const res = await fetch('/api/convert-save-to-ttf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      saveFile: rawPayload,
      projectId: saveData.id || rawPayload.id
    })
  });

  if (!res.ok) {
    let errMsg = 'Failed to start conversion';
    try {
      const errJson = await res.json();
      errMsg = errJson.error || errMsg;
    } catch {
      errMsg = await res.text() || errMsg;
    }
    throw new Error(errMsg);
  }

  const { jobId, filename } = await res.json();
  const finalFilename = filename || expectedFilename;

  onProgress?.(20, 'Fusing glyphs in background worker...');

  // Poll status until done
  const startTime = Date.now();
  let done = false;

  while (!done) {
    await new Promise(r => setTimeout(r, 350));
    const statusRes = await fetch(`/api/fuse-status/${jobId}`);
    if (!statusRes.ok) {
      if (Date.now() - startTime > 180000) {
        throw new Error('Font conversion timed out after 3 minutes.');
      }
      continue;
    }

    const job = await statusRes.json();
    if (job.status === 'progress') {
      const pct = typeof job.percent === 'number' ? job.percent : 50;
      onProgress?.(pct, job.message || 'Fusing glyphs into TTF font...');
    } else if (job.status === 'done') {
      done = true;
      onProgress?.(100, 'Conversion complete! Downloading TTF...');
      const downloadUrl = `/api/fuse-download/${jobId}?filename=${encodeURIComponent(finalFilename)}`;
      
      // Auto-trigger the download
      triggerFileDownload(new ArrayBuffer(0), finalFilename, downloadUrl);

      return {
        success: true,
        filename: finalFilename,
        downloadUrl
      };
    } else if (job.status === 'error') {
      throw new Error(job.message || 'Worker failed to convert save file to TTF.');
    }
  }

  throw new Error('Unexpected conversion termination.');
}
