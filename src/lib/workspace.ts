import { get, set, keys, del } from 'idb-keyval';
import * as opentype from 'opentype.js';
import type { UploadedFont, GlyphMapping } from '../types';
import { parseFont, extractSupportedCodePoints, normalizeFontBuffer, parseSfntBasic, clearSessionServerFontCache } from './fontUtils';
import { extractColorFontInfo, type ColorFontData } from './colorFontUtils';

const WORKSPACE_KEY = 'font-fuser-workspace';
const WORKSPACE_BACKUP_KEY = 'font-fuser-workspace-backup';
const SAVES_KEY = 'font-fuser-saves';

// High-speed RAM font buffer registry (instant 0ms retrieval across project switches)
export const fontMemoryCache = new Map<string, ArrayBuffer>();

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {}
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function isAliveArrayBuffer(buf: any): buf is ArrayBuffer {
  try {
    return Boolean(
      buf &&
      buf instanceof ArrayBuffer &&
      buf.byteLength > 0 &&
      !(buf as any).detached
    );
  } catch {
    return false;
  }
}

export function safeCloneArrayBuffer(buf: any): ArrayBuffer | undefined {
  if (!isAliveArrayBuffer(buf)) return undefined;
  try {
    return buf.slice(0);
  } catch {
    return undefined;
  }
}

export function coerceToArrayBuffer(val: any): ArrayBuffer | null {
  if (!val) return null;
  if (val instanceof ArrayBuffer) {
    return isAliveArrayBuffer(val) ? val : null;
  }
  if (ArrayBuffer.isView(val)) {
    return val.byteLength > 0 
      ? (val.byteOffset === 0 && val.byteLength === val.buffer.byteLength ? val.buffer : val.buffer.slice(val.byteOffset, val.byteOffset + val.byteLength))
      : null;
  }
  if (typeof val === 'string') {
    try {
      const comma = val.indexOf(',');
      const b64 = comma !== -1 ? val.slice(comma + 1) : val;
      const cleanB64 = b64.replace(/\s+/g, '');
      const binary = atob(cleanB64);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes.buffer;
    } catch {
      return null;
    }
  }
  if (typeof val === 'object') {
    if (val.buffer) {
      const b = coerceToArrayBuffer(val.buffer);
      if (b && b.byteLength > 0) return b;
    }
    if (val.dataUrl && typeof val.dataUrl === 'string') {
      const b = coerceToArrayBuffer(val.dataUrl);
      if (b && b.byteLength > 0) return b;
    }
    if (Array.isArray((val as any).data) && (val as any).data.length > 0) {
      try {
        const u8 = new Uint8Array((val as any).data);
        return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
      } catch {
        return null;
      }
    }
  }
  return null;
}

export async function coerceToArrayBufferAsync(val: any): Promise<ArrayBuffer | null> {
  const sync = coerceToArrayBuffer(val);
  if (sync && sync.byteLength > 0) return sync;
  if (val && typeof Blob !== 'undefined' && val instanceof Blob) {
    try {
      const ab = await val.arrayBuffer();
      if (ab && ab.byteLength > 0) return ab;
    } catch {}
  }
  if (val && typeof val === 'object') {
    if (val.file && typeof Blob !== 'undefined' && val.file instanceof Blob) {
      try {
        const ab = await val.file.arrayBuffer();
        if (ab && ab.byteLength > 0) return ab;
      } catch {}
    }
  }
  return null;
}


export function registerFontBuffer(id?: string, name?: string, fileName?: string, buffer?: any) {
  const cleanBuf = coerceToArrayBuffer(buffer);
  if (!cleanBuf || cleanBuf.byteLength === 0) return;
  if (id) {
    fontMemoryCache.set(id, cleanBuf);
    persistedFontKeys.add(id);
    persistedFontKeys.add(`font-file-${id}`);
  }
  if (fileName) {
    const lowerFile = fileName.toLowerCase();
    fontMemoryCache.set(lowerFile, cleanBuf);
  }
  if (name) {
    const lowerName = name.toLowerCase();
    fontMemoryCache.set(lowerName, cleanBuf);
  }
}

interface SavedWorkspace {
  fonts: {
    id: string;
    name: string;
    fileName: string;
    color: string;
    buffer?: ArrayBuffer;
  }[];
  glyphMap: GlyphMapping;
}

export interface RestoreProgress {
  current: number;
  total: number;
  percent: number;
  fileName: string;
  status: string;
}

export interface FusionSaveInfo {
  id: string;
  name: string;
  timestamp: number;
  storageKey?: string;
}

export interface FusionSave extends SavedWorkspace {
  id: string;
  name: string;
  timestamp: number;
}

async function migrateSavesIfNeeded(fusions: FusionSave[]) {
  for (const fusion of fusions) {
    if (!fusion || !fusion.fonts) continue;
    for (const sf of fusion.fonts) {
      const clean = coerceToArrayBuffer(sf.buffer);
      if (clean && clean.byteLength > 0) {
        registerFontBuffer(sf.id, sf.name, sf.fileName, clean);
        await set(`font-file-${sf.id}`, clean).catch(() => {});
      }
    }
  }
}

const persistedFontKeys = new Set<string>();

export async function saveWorkspace(fonts: UploadedFont[], glyphMap: GlyphMapping) {
  try {
    // Guard: never overwrite non-empty saved workspace with empty state
    if (fonts.length === 0 && Object.keys(glyphMap).length === 0) {
      const existing = await get<SavedWorkspace>(WORKSPACE_KEY);
      if (existing && existing.fonts && existing.fonts.length > 0) {
        console.warn('Skipping save: prevent accidental wipe of existing workspace');
        return;
      }
    }

    const savedFonts = [];
    
    for (const f of fonts) {
      const fileKey = `font-file-${f.id}`;
      let fontBuffer: ArrayBuffer | undefined = isAliveArrayBuffer(f.buffer) ? f.buffer : undefined;
      
      if (!isAliveArrayBuffer(fontBuffer)) {
        if (f.id && fontMemoryCache.has(f.id)) {
          const cached = fontMemoryCache.get(f.id);
          if (isAliveArrayBuffer(cached)) fontBuffer = cached;
        } else if (f.fileName && fontMemoryCache.has(f.fileName.toLowerCase())) {
          const cached = fontMemoryCache.get(f.fileName.toLowerCase());
          if (isAliveArrayBuffer(cached)) fontBuffer = cached;
        }
      }

      if (!isAliveArrayBuffer(fontBuffer) && f.file) {
        try {
          const buf = await f.file.arrayBuffer();
          if (isAliveArrayBuffer(buf)) fontBuffer = buf;
        } catch (e) {}
      }

      if (isAliveArrayBuffer(fontBuffer)) {
        f.buffer = fontBuffer;
        if (f.id) fontMemoryCache.set(f.id, fontBuffer);
        if (f.fileName) fontMemoryCache.set(f.fileName.toLowerCase(), fontBuffer);
        if (f.name) fontMemoryCache.set(f.name.toLowerCase(), fontBuffer);
        if (!persistedFontKeys.has(fileKey)) {
          persistedFontKeys.add(fileKey);
          persistedFontKeys.add(f.id);
          if (typeof indexedDB !== 'undefined') {
            try { set(fileKey, fontBuffer).catch(() => {}); } catch {}
          }
        }
      }

      const serverCacheKey = `server-cached-${f.id}`;
      if (isAliveArrayBuffer(fontBuffer) && !persistedFontKeys.has(serverCacheKey)) {
        persistedFontKeys.add(serverCacheKey);
        try {
          const blob = new Blob([fontBuffer], { type: 'application/octet-stream' });
          fetch(`/api/cache-font?id=${encodeURIComponent(f.id)}&name=${encodeURIComponent(f.name)}&filename=${encodeURIComponent(f.fileName)}`, {
            method: 'POST',
            body: blob
          }).catch(() => {});
        } catch {}
      }

      const rawSupp = f.supportedCodePoints as any;
      const suppSize = rawSupp instanceof Set 
        ? rawSupp.size 
        : (Array.isArray(rawSupp) ? rawSupp.length : 0);
      const supportedToSave = suppSize <= 2000
        ? (rawSupp instanceof Set ? Array.from(rawSupp as Set<number>) : (Array.isArray(rawSupp) ? rawSupp : []))
        : undefined;

      savedFonts.push({
        id: f.id,
        name: f.name,
        fileName: f.fileName,
        color: f.color,
        hasColor: !!f.hasColor,
        supportedCodePoints: supportedToSave,
        dataUrl: (f as any).dataUrl || '',
        // Large font buffers (>512KB) are already safely persisted under font-file-${id} and in fontMemoryCache.
        // Storing huge buffers inside WORKSPACE_KEY causes catastrophic browser structuredClone memory spikes.
        buffer: (fontBuffer && fontBuffer.byteLength <= 512 * 1024) ? fontBuffer : undefined
      });
    }

    try {
      await set(WORKSPACE_KEY, {
        fonts: savedFonts,
        glyphMap,
      });
      if (savedFonts.length > 0) {
        // Backup metadata without duplicating multi-megabyte array buffers (buffers are already individually persisted under font-file-${id})
        const backupFonts = savedFonts.map(sf => ({
          ...sf,
          buffer: undefined
        }));
        await set(WORKSPACE_BACKUP_KEY, {
          fonts: backupFonts,
          glyphMap,
        }).catch(() => {});
      }
    } catch (idbErr) {
      console.warn('Non-fatal: failed to persist workspace to IndexedDB:', idbErr);
    }
  } catch (error) {
    console.warn('Workspace save warning:', error);
  }
}

export async function clearWorkspace(): Promise<void> {
  try {
    fontMemoryCache.clear();
    persistedFontKeys.clear();
    clearSessionServerFontCache();

    if (typeof indexedDB !== 'undefined') {
      try {
        await del(WORKSPACE_KEY).catch(() => {});
        await del(WORKSPACE_BACKUP_KEY).catch(() => {});
        // CRITICAL: NEVER delete SAVES_KEY ('font-fuser-saves'), 'fusion-project-*', or saved project keys!
        // Mass wipeouts permanently prevented to protect all user projects.
      } catch (idbErr) {
        console.warn('Error clearing IndexedDB keys:', idbErr);
      }
    }

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem('fontfuser_loading_workspace');
      } catch {}
    }

    // Also call server clear cache endpoint
    try {
      await fetch('/api/clear-cache', { method: 'POST' });
    } catch {}
  } catch (error) {
    console.warn('Failed to clear workspace', error);
  }
}

async function getWithTimeout<T>(key: any, timeoutMs: number = 2000): Promise<T | undefined> {
  if (typeof indexedDB === 'undefined') return undefined;
  try {
    return await Promise.race([
      get<T>(key),
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), timeoutMs))
    ]);
  } catch {
    return undefined;
  }
}

export async function loadWorkspace(
  onProgress?: (progress: RestoreProgress) => void
): Promise<{ fonts: UploadedFont[]; glyphMap: GlyphMapping } | null> {
  try {
    let saved = await getWithTimeout<SavedWorkspace>(WORKSPACE_KEY, 2000);
    if (!saved || !saved.fonts || saved.fonts.length === 0) {
      const backup = await getWithTimeout<SavedWorkspace>(WORKSPACE_BACKUP_KEY, 1500);
      if (backup && backup.fonts && backup.fonts.length > 0) {
        saved = backup;
      }
    }
    if (!saved) return null;
    return await restoreWorkspaceData(saved, onProgress);
  } catch (error) {
    console.error('Failed to load workspace', error);
    try {
      const backup = await getWithTimeout<SavedWorkspace>(WORKSPACE_BACKUP_KEY, 1500);
      if (backup && backup.fonts && backup.fonts.length > 0) {
        return await restoreWorkspaceData(backup, onProgress);
      }
    } catch (e) {}
    return null;
  }
}

function fetchWithTimeout(url: string, timeoutMs: number = 800): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

export function arrayBufferToDataUrl(buffer: ArrayBuffer, mimeType: string = 'font/ttf'): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 32768;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, chunk as any);
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

export function arrayBufferToDataUrlAsync(buffer: ArrayBuffer, mimeType: string = 'font/ttf'): Promise<string> {
  return new Promise((resolve) => {
    try {
      if (typeof Blob !== 'undefined' && typeof FileReader !== 'undefined') {
        const blob = new Blob([buffer], { type: mimeType });
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve((reader.result as string) || '');
        };
        reader.onerror = () => {
          resolve(arrayBufferToDataUrl(buffer, mimeType));
        };
        reader.readAsDataURL(blob);
        return;
      }
    } catch {}
    resolve(arrayBufferToDataUrl(buffer, mimeType));
  });
}

export async function findFontBuffer(sf: { id?: string; name?: string; fileName?: string; buffer?: any; dataUrl?: string; data?: any }): Promise<ArrayBuffer | null> {
  const id = sf.id || '';
  const name = sf.name || '';
  const fileName = sf.fileName || '';
  const lowerFile = fileName.toLowerCase();
  const lowerName = name.toLowerCase();

  // Helper to normalize font names for resilient matching across formats and spaces
  const norm = (s?: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const normFile = norm(fileName);
  const normName = norm(name);

  // 1. Direct buffer or base64 dataUrl on saved object (instant 0ms)
  const directClean = await coerceToArrayBufferAsync(sf.buffer) 
    || await coerceToArrayBufferAsync((sf as any).dataUrl) 
    || await coerceToArrayBufferAsync((sf as any).data);
  if (directClean && directClean.byteLength > 0) {
    registerFontBuffer(id, name, fileName, directClean);
    return directClean;
  }

  // 2. High-speed in-memory RAM cache (instant 0ms)
  if (id && fontMemoryCache.has(id)) {
    return fontMemoryCache.get(id)!;
  }
  if (lowerFile && fontMemoryCache.has(lowerFile)) {
    return fontMemoryCache.get(lowerFile)!;
  }
  if (lowerName && fontMemoryCache.has(lowerName)) {
    return fontMemoryCache.get(lowerName)!;
  }
  if (name && fontMemoryCache.has(name)) {
    return fontMemoryCache.get(name)!;
  }
  if (fileName && fontMemoryCache.has(fileName)) {
    return fontMemoryCache.get(fileName)!;
  }

  // 2b. Fuzzy in-memory RAM cache search
  for (const [k, buf] of fontMemoryCache.entries()) {
    if (!buf || buf.byteLength === 0) continue;
    const nk = norm(k);
    if ((normFile && (nk === normFile || nk.includes(normFile) || normFile.includes(nk))) ||
        (normName && (nk === normName || nk.includes(normName) || normName.includes(nk)))) {
      registerFontBuffer(id, name, fileName, buf);
      return buf;
    }
  }

  // 3. Fast IndexedDB candidate keys in parallel (instant 0-5ms)
  const idbKeys = [
    id ? `font-file-${id}` : '',
    fileName ? `font-file-${fileName}` : '',
    lowerFile ? `font-file-${lowerFile}` : '',
    name ? `font-file-${name}` : '',
    lowerName ? `font-file-${lowerName}` : '',
    id ? `font-${id}` : '',
    lowerFile ? `font-${lowerFile}` : '',
    lowerName ? `font-${lowerName}` : '',
    id,
    lowerFile,
    fileName
  ].filter(Boolean);

  try {
    const values = await Promise.all(idbKeys.map(k => get<any>(k).catch(() => null)));
    for (const val of values) {
      if (val) {
        const b = await coerceToArrayBufferAsync(val);
        if (b && b.byteLength > 0) {
          registerFontBuffer(id, name, fileName, b);
          return b;
        }
      }
    }
  } catch (e) {}

  // 4. Check active workspace & backup for embedded font buffers
  try {
    for (const wsKey of [WORKSPACE_KEY, WORKSPACE_BACKUP_KEY]) {
      const ws = await get<SavedWorkspace>(wsKey).catch(() => null);
      if (ws && Array.isArray(ws.fonts)) {
        for (const f of ws.fonts) {
          const nfId = norm(f.id);
          const nfFile = norm(f.fileName);
          const nfName = norm(f.name);
          const isMatch = (id && f.id === id) ||
            (normFile && (nfFile === normFile || nfFile.includes(normFile))) ||
            (normName && (nfName === normName || nfName.includes(normName)));

          if (isMatch) {
            const b = await coerceToArrayBufferAsync(f.buffer) || await coerceToArrayBufferAsync((f as any).dataUrl);
            if (b && b.byteLength > 0) {
              registerFontBuffer(id, name, fileName, b);
              return b;
            }
          }
        }
      }
    }
  } catch (e) {}

  // 5. Check matching keys in IndexedDB (fast parallel lookup, max 5 candidate keys)
  try {
    const allKeys = await keys().catch(() => []);
    const matchingKeys = allKeys.filter(k => {
      const kStr = String(k).toLowerCase();
      return (id && kStr.includes(id.toLowerCase())) ||
        (lowerFile && kStr.includes(lowerFile)) ||
        (lowerName && kStr.includes(lowerName)) ||
        (normFile && norm(kStr).includes(normFile)) ||
        (normName && norm(kStr).includes(normName));
    }).slice(0, 5);

    if (matchingKeys.length > 0) {
      const vals = await Promise.all(matchingKeys.map(k => get<any>(k).catch(() => null)));
      for (const val of vals) {
        if (val) {
          const b = await coerceToArrayBufferAsync(val);
          if (b && b.byteLength > 0) {
            registerFontBuffer(id, name, fileName, b);
            return b;
          }
        }
      }
    }
  } catch (e) {}

  // 6. Fast server check (5000ms timeout for large CJK/PingFang fonts)
  try {
    const sRes = await fetchWithTimeout(`/api/get-cached-font?name=${encodeURIComponent(fileName || '')}&id=${encodeURIComponent(id || '')}&fontName=${encodeURIComponent(name || '')}`, 5000);
    if (sRes.ok) {
      const sBuf = await sRes.arrayBuffer();
      if (sBuf && sBuf.byteLength > 100) {
        registerFontBuffer(id, name, fileName, sBuf);
        return sBuf;
      }
    }
  } catch (e) {}

  // 7. Single font in RAM fallback
  if (fontMemoryCache.size === 1) {
    const singleBuf = Array.from(fontMemoryCache.values())[0];
    if (singleBuf && singleBuf.byteLength > 0) {
      registerFontBuffer(id, name, fileName, singleBuf);
      return singleBuf;
    }
  }

  return null;
}

function createEmptyColorData(): ColorFontData {
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

async function restoreWorkspaceData(
  saved: SavedWorkspace,
  onProgress?: (progress: RestoreProgress) => void
): Promise<{ fonts: UploadedFont[]; glyphMap: GlyphMapping } | null> {
  if (!saved || !saved.fonts || !Array.isArray(saved.fonts)) return null;

  const total = saved.fonts.length;
  let completedCount = 0;

  if (onProgress && total > 0) {
    const firstFont = saved.fonts[0];
    const initialName = firstFont ? (firstFont.name || firstFont.fileName || 'font') : 'font';
    onProgress({
      current: 1,
      total,
      percent: 10,
      fileName: initialName,
      status: `Restoring ${total} saved font${total > 1 ? 's' : ''}...`
    });
  }

  // Sequential loading with small yields between fonts to minimize memory pressure
  const rawLoadedFonts: (UploadedFont | null)[] = [];
  for (let idx = 0; idx < saved.fonts.length; idx++) {
    const sf = saved.fonts[idx];
    const fallbackId = (sf && sf.id) || generateUUID();
    const fallbackName = (sf && (sf.name || sf.fileName)) || 'Untitled Font';
    const fallbackFileName = (sf && sf.fileName) || 'font.ttf';
    const fallbackColor = (sf && sf.color) || '#3b82f6';
    const fallbackFamilyName = `FontFuser_${fallbackId}`;

    if (!sf) {
      rawLoadedFonts.push(null);
      continue;
    }

    const fontLabel = sf.name || sf.fileName || fallbackName;

    const reportSub = (subPct: number, status: string) => {
      if (!onProgress || total === 0) return;
      const weightedCompleted = completedCount + (subPct / 100);
      const overallPct = Math.min(99, Math.round((weightedCompleted / total) * 100));
      onProgress({
        current: Math.min(total, completedCount + 1),
        total,
        percent: Math.max(10, overallPct),
        fileName: fontLabel,
        status
      });
    };

    reportSub(20, `Locating ${fontLabel}...`);

    let buffer: ArrayBuffer | null = null;
    try {
      buffer = await findFontBuffer(sf);
    } catch (e) {
      console.warn("Buffer retrieval warning for", sf.fileName, e);
    }

    if (!buffer || buffer.byteLength === 0) {
      completedCount++;
      rawLoadedFonts.push(null);
      continue;
    }

    try {
      let fontBuffer = buffer;
      try {
        fontBuffer = await normalizeFontBuffer(fontBuffer, sf.fileName || fallbackFileName);
      } catch (ne) {
        console.warn("Font normalization warning for", sf.fileName, ne);
      }

      reportSub(50, `Parsing ${fontLabel}...`);

      const file = new File([fontBuffer], sf.fileName || fallbackFileName, { type: 'application/octet-stream' });
      const fontFamilyName = `FontFuser_${sf.id || fallbackId}`;
      
      // 1. Register FontFace in CSS safely using Blob URL (never detaches or locks buffer)
      if (typeof FontFace !== 'undefined' && isAliveArrayBuffer(fontBuffer)) {
        try {
          const blob = new Blob([fontBuffer], { type: 'font/ttf' });
          const blobUrl = URL.createObjectURL(blob);
          const fontFace = new FontFace(fontFamilyName, `url(${blobUrl})`);
          document.fonts.add(fontFace);
          fontFace.load().catch(() => {});
        } catch (err) {}
      }

      // 2. Parse font safely (fast SFNT parse for fonts > 8MB to prevent 10s browser freeze)
      let parsed: opentype.Font | undefined = undefined;
      let supportedCodePoints: Set<number> = new Set<number>();

      if (Array.isArray((sf as any).supportedCodePoints) && (sf as any).supportedCodePoints.length > 0) {
        supportedCodePoints = new Set<number>((sf as any).supportedCodePoints);
      } else if ((sf as any).supportedCodePoints instanceof Set && (sf as any).supportedCodePoints.size > 0) {
        supportedCodePoints = (sf as any).supportedCodePoints;
      }

      const isLargeSavedFont = fontBuffer.byteLength > 1.5 * 1024 * 1024;
      if (isLargeSavedFont) {
        if (supportedCodePoints.size === 0) {
          try {
            const sfnt = parseSfntBasic(fontBuffer, sf.name || fontLabel);
            if (sfnt.codePoints && sfnt.codePoints.size > 0) {
              supportedCodePoints = sfnt.codePoints;
            }
          } catch {}
        }
      } else {
        try {
          parsed = opentype.parse(fontBuffer.slice(0));
          if (supportedCodePoints.size === 0) {
            supportedCodePoints = extractSupportedCodePoints(parsed);
          }
        } catch (pe) {
          console.warn("Failed to parse font for inspection:", pe);
        }
      }

      reportSub(75, `Mapping glyphs for ${fontLabel}...`);

      // CRITICAL: Resilient SFNT extraction fallback if supportedCodePoints is still empty or parsed is undefined
      if (supportedCodePoints.size === 0 && fontBuffer && fontBuffer.byteLength >= 12) {
        try {
          const sfnt = parseSfntBasic(fontBuffer, sf.name || fontLabel);
          if (sfnt.codePoints && sfnt.codePoints.size > 0) {
            supportedCodePoints = sfnt.codePoints;
          }
        } catch (sfe) {}
      }

      // 4. Fast-path color font data
      const colorData: ColorFontData = (sf as any).colorData || (parsed ? extractColorFontInfo(parsed) : createEmptyColorData());

      registerFontBuffer(sf.id, sf.name, sf.fileName, fontBuffer);

      completedCount++;
      if (onProgress) {
        const pct = Math.round((completedCount / total) * 100);
        onProgress({
          current: completedCount,
          total,
          percent: pct,
          fileName: fontLabel,
          status: `Restored ${fontLabel}`
        });
      }

      rawLoadedFonts.push({
        id: sf.id || fallbackId,
        name: sf.name || sf.fileName || fallbackName,
        fileName: sf.fileName || fallbackFileName,
        file,
        buffer: fontBuffer,
        dataUrl: (sf as any).dataUrl || '',
        parsed,
        fontFamilyName,
        color: sf.color || fallbackColor,
        hasColor: !!colorData?.hasColor,
        colorData,
        supportedCodePoints
      } as UploadedFont);
    } catch (err) {
      console.error(`Failed to load saved font ${sf.fileName}`, err);
      completedCount++;
      rawLoadedFonts.push(null);
    }

    // Yield to browser event loop so garbage collector can sweep
    await new Promise(r => setTimeout(r, 20));
  }
  const loadedFonts: UploadedFont[] = rawLoadedFonts.filter((f): f is UploadedFont => !!f && !!f.buffer && f.buffer.byteLength > 0);

  if (onProgress && total > 0) {
    onProgress({
      current: total,
      total,
      percent: 100,
      fileName: 'All fonts',
      status: `Restored ${loadedFonts.length} of ${total} font${total > 1 ? 's' : ''}`
    });
  }

  // If saved project had fonts declared, but NONE could be parsed, salvage from RAM cache before giving up
  if (loadedFonts.length === 0 && saved.fonts.length > 0 && fontMemoryCache.size > 0) {
    for (const [key, sBuf] of fontMemoryCache.entries()) {
      if (!sBuf || sBuf.byteLength === 0) continue;
      try {
        const sParsed = opentype.parse(sBuf.slice(0));
        const sSupported = extractSupportedCodePoints(sParsed);
        const sColor = extractColorFontInfo(sParsed);
        const sId = generateUUID();
        const sName = (sParsed.names as any)?.fontFamily?.en || key;
        loadedFonts.push({
          id: sId,
          name: sName,
          fileName: key.endsWith('.ttf') ? key : `${sName}.ttf`,
          file: new File([sBuf.slice(0)], `${sName}.ttf`, { type: 'application/octet-stream' }),
          buffer: sBuf.slice(0),
          dataUrl: '',
          parsed: sParsed,
          fontFamilyName: `FontFuser_${sId}`,
          color: '#3b82f6',
          hasColor: !!sColor?.hasColor,
          colorData: sColor,
          supportedCodePoints: sSupported
        });
        break;
      } catch {}
    }
  }

  // If project had fonts but 0 fonts could be recovered, return null so callers never wipe out active fonts!
  if (loadedFonts.length === 0 && saved.fonts.length > 0) {
    return null;
  }

  // Retain 100% of user assignments
  const validGlyphMap: GlyphMapping = { ...(saved.glyphMap || {}) };

  return { fonts: loadedFonts, glyphMap: validGlyphMap };
}

export async function getFusionsList(): Promise<FusionSaveInfo[]> {
  const resultList: FusionSaveInfo[] = [];
  const seenIds = new Set<string>();

  // 1. Try server persistent API first (fast 1200ms timeout)
  try {
    const sRes = await fetchWithTimeout('/api/projects', 1200);
    if (sRes.ok) {
      const serverList = await sRes.json();
      if (Array.isArray(serverList)) {
        for (const f of serverList) {
          if (f && f.id && !seenIds.has(String(f.id))) {
            seenIds.add(String(f.id));
            resultList.push({
              id: String(f.id),
              name: String(f.name || 'Untitled Fusion'),
              timestamp: Number(f.timestamp) || Date.now()
            });
          }
        }
      }
    }
  } catch (e) {}

  // 2. Try SAVES_KEY in IndexedDB and migrate any projects found with fonts
  let rawFusions: any = null;
  try {
    rawFusions = await get<any>(SAVES_KEY);
    if (Array.isArray(rawFusions)) {
      for (const f of rawFusions) {
        if (!f) continue;
        const effId = String(f.id || generateUUID());
        if (!seenIds.has(effId)) {
          seenIds.add(effId);
          resultList.push({
            id: effId,
            name: String(f.name || 'Untitled Fusion'),
            timestamp: Number(f.timestamp) || Date.now(),
            storageKey: `fusion-project-${effId}`
          });
        }
        // If this save contains fonts, safely store it into fusion-project-${effId} immediately
        if (Array.isArray(f.fonts) && f.fonts.length > 0) {
          await set(`fusion-project-${effId}`, f).catch(() => {});
          for (const sf of f.fonts) {
            const b = await coerceToArrayBufferAsync(sf.buffer) || await coerceToArrayBufferAsync(sf.dataUrl);
            if (b && b.byteLength > 0) {
              registerFontBuffer(sf.id, sf.name, sf.fileName, b);
              await set(`font-file-${sf.id}`, b).catch(() => {});
            }
          }
          try {
            fetch('/api/save-project', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(f)
            }).catch(() => {});
          } catch {}
        }
      }
    }
  } catch (error) {
    console.warn('Failed to get fusions list from SAVES_KEY', error);
  }

  // 3. Scan ALL keys in IndexedDB for dedicated project entries (including UUID keys, project-*, fusion-*)
  try {
    if (typeof indexedDB !== 'undefined') {
      const allKeys = await keys().catch(() => []);
      for (const k of allKeys) {
        const kStr = String(k);
        if (kStr === WORKSPACE_KEY || kStr === WORKSPACE_BACKUP_KEY || kStr === SAVES_KEY || kStr.startsWith('font-file-')) continue;

        try {
          const proj = await get<any>(k);
          if (!proj || typeof proj !== 'object') continue;

          // Check if this entry is a project record
          const isProject = (Array.isArray(proj.fonts) && proj.fonts.length > 0) ||
            (proj.glyphMap && Object.keys(proj.glyphMap).length > 0) ||
            (kStr.startsWith('fusion-project-') || kStr.startsWith('project-') || kStr.startsWith('fusion-'));

          if (isProject) {
            const effId = String(proj.id || kStr.replace(/^fusion-project-|^project-|^fusion-/, ''));
            if (!seenIds.has(effId)) {
              seenIds.add(effId);
              resultList.push({
                id: effId,
                name: String(proj.name || effId || 'Untitled Fusion'),
                timestamp: Number(proj.timestamp) || Date.now(),
                storageKey: kStr
              });
            }

            // Register font buffers if present
            if (Array.isArray(proj.fonts)) {
              for (const sf of proj.fonts) {
                const b = await coerceToArrayBufferAsync(sf.buffer) || await coerceToArrayBufferAsync(sf.dataUrl);
                if (b && b.byteLength > 0) {
                  registerFontBuffer(sf.id, sf.name, sf.fileName, b);
                  await set(`font-file-${sf.id}`, b).catch(() => {});
                }
              }
            }

            // Ensure dedicated fusion-project-${effId} exists
            if (!kStr.startsWith('fusion-project-')) {
              await set(`fusion-project-${effId}`, proj).catch(() => {});
            }
          }
        } catch {}
      }
    }
  } catch (e) {
    console.warn('Failed to scan indexedDB project keys', e);
  }

  // 4. Fallback to localStorage backup
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem('fontfuser_fusions_list');
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          for (const f of list) {
            if (f && f.id && !seenIds.has(String(f.id))) {
              seenIds.add(String(f.id));
              resultList.push({
                id: String(f.id),
                name: String(f.name || 'Untitled Fusion'),
                timestamp: Number(f.timestamp) || Date.now()
              });
            }
          }
        }
      }
    } catch {}
  }

  // Sort newest first
  resultList.sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));

  // Sync back safely: preserve full project objects in SAVES_KEY
  if (resultList.length > 0) {
    try {
      const mergedSaves = await Promise.all(resultList.map(async (info) => {
        const full = await get<any>(`fusion-project-${info.id}`).catch(() => null);
        if (full && Array.isArray(full.fonts) && full.fonts.length > 0) {
          return full;
        }
        if (Array.isArray(rawFusions)) {
          const match = rawFusions.find((rf: any) => rf && String(rf.id) === info.id);
          if (match && Array.isArray(match.fonts) && match.fonts.length > 0) {
            return match;
          }
        }
        return info;
      }));

      await set(SAVES_KEY, mergedSaves);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('fontfuser_fusions_list', JSON.stringify(resultList));
      }
    } catch {}
  }

  return resultList;
}

export async function saveNamedFusion(name: string, fonts: UploadedFont[], glyphMap: GlyphMapping, targetId?: string) {
  try {
    const rawFusions = await get<any>(SAVES_KEY);
    const indexList: FusionSaveInfo[] = Array.isArray(rawFusions) ? rawFusions : [];
    
    const trimmedName = name.trim() || 'Untitled Fusion';
    let projectId = targetId;
    if (!projectId) {
      const existing = indexList.find(f => f.name && f.name.toLowerCase() === trimmedName.toLowerCase());
      if (existing) {
        projectId = existing.id;
      } else {
        projectId = generateUUID();
      }
    }
    
    const savedFonts = [];
    
    for (const f of fonts) {
      let fontBuffer: ArrayBuffer | undefined = isAliveArrayBuffer(f.buffer) ? f.buffer : undefined;
      
      if (!isAliveArrayBuffer(fontBuffer)) {
        if (f.id && fontMemoryCache.has(f.id)) {
          const cached = fontMemoryCache.get(f.id);
          if (isAliveArrayBuffer(cached)) fontBuffer = cached;
        } else if (f.fileName && fontMemoryCache.has(f.fileName.toLowerCase())) {
          const cached = fontMemoryCache.get(f.fileName.toLowerCase());
          if (isAliveArrayBuffer(cached)) fontBuffer = cached;
        }
      }

      if (!isAliveArrayBuffer(fontBuffer)) {
        try {
          const recovered = await findFontBuffer(f);
          if (isAliveArrayBuffer(recovered)) fontBuffer = recovered;
        } catch (e) {}
      }

      if (isAliveArrayBuffer(fontBuffer)) {
        f.buffer = fontBuffer;
        registerFontBuffer(f.id, f.name, f.fileName, fontBuffer);
        const clone1 = safeCloneArrayBuffer(fontBuffer);
        if (clone1) await set(`font-file-${f.id}`, clone1).catch(() => {});
        if (f.fileName) {
          const clone2 = safeCloneArrayBuffer(fontBuffer);
          if (clone2) await set(`font-file-${f.fileName}`, clone2).catch(() => {});
        }
        const serverCacheKey = `server-cached-${f.id}`;
        if (!persistedFontKeys.has(serverCacheKey)) {
          persistedFontKeys.add(serverCacheKey);
          const clone3 = safeCloneArrayBuffer(fontBuffer);
          if (clone3) {
            try {
              fetch(`/api/cache-font?id=${encodeURIComponent(f.id)}&name=${encodeURIComponent(f.name)}&filename=${encodeURIComponent(f.fileName)}`, {
                method: 'POST',
                body: clone3
              }).catch(() => {});
            } catch {}
          }
        }
      }

      savedFonts.push({
        id: f.id,
        name: f.name,
        fileName: f.fileName,
        color: f.color,
        hasColor: !!f.hasColor,
        supportedCodePoints: f.supportedCodePoints instanceof Set 
          ? Array.from(f.supportedCodePoints) 
          : (Array.isArray(f.supportedCodePoints) ? f.supportedCodePoints : []),
        dataUrl: (f as any).dataUrl || '',
        buffer: safeCloneArrayBuffer(fontBuffer)
      });
    }

    const projectData: FusionSave = {
      id: projectId,
      name: trimmedName,
      timestamp: Date.now(),
      fonts: savedFonts,
      glyphMap: { ...glyphMap }
    };

    // 1. Save complete project with fonts & buffers in its dedicated key
    try {
      await set(`fusion-project-${projectId}`, projectData);
    } catch (saveErr) {
      console.warn('Non-fatal: could not write fusion-project to IndexedDB:', saveErr);
    }

    // 2. Update metadata index in SAVES_KEY
    const meta: FusionSaveInfo = {
      id: projectId,
      name: trimmedName,
      timestamp: projectData.timestamp,
      storageKey: `fusion-project-${projectId}`
    };
    const existingIdx = indexList.findIndex(f => f.id === projectId);
    if (existingIdx !== -1) {
      indexList[existingIdx] = meta;
    } else {
      indexList.unshift(meta);
    }
    await set(SAVES_KEY, indexList);

    // 3. Save to localStorage backup
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('fontfuser_fusions_list', JSON.stringify(indexList));
        localStorage.setItem('fontfuser_last_project', projectId);
      } catch {}
    }

    // 4. Asynchronously send complete project to server backup
    try {
      fetch('/api/save-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: projectId,
          name: trimmedName,
          timestamp: projectData.timestamp,
          glyphMap: projectData.glyphMap,
          fonts: savedFonts.map(sf => ({
            id: sf.id,
            name: sf.name,
            fileName: sf.fileName,
            color: sf.color,
            dataUrl: (sf as any).dataUrl || undefined
          }))
        })
      }).catch(() => {});
    } catch {}

    return projectId;
  } catch (error) {
    console.error('Failed to save named fusion', error);
    throw error;
  }
}

export async function loadNamedFusion(
  id: string, 
  name?: string, 
  storageKey?: string,
  onProgress?: (progress: RestoreProgress) => void
): Promise<{ fonts: UploadedFont[]; glyphMap: GlyphMapping } | null> {
  try {
    const cleanId = String(id || '').trim();
    let fusion: any = null;

    const hasUsableFonts = (p: any) => Boolean(p && Array.isArray(p.fonts) && p.fonts.length > 0);
    const hasCompleteFontData = (p: any) => Boolean(p && Array.isArray(p.fonts) && p.fonts.length > 0 && p.fonts.some((sf: any) => sf && (sf.dataUrl || sf.buffer || sf.data)));

    // 0. Direct lookup via storageKey if provided (instant 0-1ms)
    if (storageKey) {
      try {
        const val = await get<FusionSave>(storageKey);
        if (hasCompleteFontData(val)) {
          fusion = val;
        } else if (hasUsableFonts(val)) {
          fusion = val;
        }
      } catch {}
    }

    // 1. Check dedicated project record by id (fusion-project-${cleanId})
    if ((!fusion || !hasCompleteFontData(fusion)) && cleanId) {
      const byId = await getWithTimeout<FusionSave>(`fusion-project-${cleanId}`, 4000);
      if (hasCompleteFontData(byId)) {
        fusion = byId;
      } else if (!hasUsableFonts(fusion) && hasUsableFonts(byId)) {
        fusion = byId;
      } else {
        const directId = await getWithTimeout<FusionSave>(cleanId, 2000);
        if (hasCompleteFontData(directId)) {
          fusion = directId;
        } else if (!hasUsableFonts(fusion) && hasUsableFonts(directId)) {
          fusion = directId;
        }
      }
    }

    // 2. Check dedicated project record by name
    if ((!fusion || !hasCompleteFontData(fusion)) && name) {
      const byName = await getWithTimeout<FusionSave>(`fusion-project-${name.trim()}`, 3000);
      if (hasCompleteFontData(byName)) {
        fusion = byName;
      } else if (!hasUsableFonts(fusion) && hasUsableFonts(byName)) {
        fusion = byName;
      }
    }

    // 3. Scan candidate keys in IndexedDB
    if (!fusion || !hasCompleteFontData(fusion)) {
      try {
        const allKeys = await keys().catch(() => []);
        const matchingKeys = allKeys.filter(k => {
          const kStr = String(k);
          return (
            (cleanId && kStr.includes(cleanId)) ||
            (name && kStr.includes(name)) ||
            kStr.startsWith('fusion-project-') ||
            kStr.startsWith('project-') ||
            kStr.startsWith('fusion-')
          );
        });

        for (const k of matchingKeys) {
          const val = await getWithTimeout<any>(k, 1500);
          if (val && Array.isArray(val.fonts) && val.fonts.length > 0) {
            if (String(val.id) === cleanId || (name && val.name === name) || (cleanId && String(k).includes(cleanId))) {
              if (hasCompleteFontData(val)) {
                fusion = val;
                break;
              } else if (!hasUsableFonts(fusion)) {
                fusion = val;
              }
            }
          }
        }
      } catch {}
    }

    // 4. Fallback to server persistent API (/api/project/${cleanId})
    if (!fusion || !hasCompleteFontData(fusion)) {
      try {
        if (cleanId) {
          const sRes = await fetchWithTimeout(`/api/project/${encodeURIComponent(cleanId)}`, 4000);
          if (sRes.ok) {
            const sData = await sRes.json();
            if (hasCompleteFontData(sData)) {
              fusion = sData;
            } else if (!hasUsableFonts(fusion) && hasUsableFonts(sData)) {
              fusion = sData;
            }
          }
        }
      } catch {}
    }

    // 5. Fallback to legacy structure in SAVES_KEY
    if (!fusion || !hasUsableFonts(fusion)) {
      const rawFusions = await getWithTimeout<any>(SAVES_KEY, 2000);
      if (Array.isArray(rawFusions)) {
        const found = rawFusions.find(f => f && (String(f.id) === cleanId || (name && f.name === name)));
        if (found && Array.isArray(found.fonts) && found.fonts.length > 0) {
          fusion = found;
        }
      }
    }

    // 6. Fallback to localStorage backup
    if ((!fusion || !hasUsableFonts(fusion)) && typeof localStorage !== 'undefined') {
      try {
        const candidateKeys = [
          cleanId ? `fusion-project-${cleanId}` : '',
          name ? `fusion-project-${name}` : '',
          cleanId ? `fontfuser_project_${cleanId}` : ''
        ].filter(Boolean);

        for (const k of candidateKeys) {
          const raw = localStorage.getItem(k);
          if (raw) {
            const p = JSON.parse(raw);
            if (p && Array.isArray(p.fonts) && p.fonts.length > 0) {
              fusion = p;
              break;
            }
          }
        }
      } catch {}
    }

    // 7. Fallback to active workspace if project matches current workspace
    if (!fusion) {
      try {
        const ws = await getWithTimeout<SavedWorkspace>(WORKSPACE_KEY, 3000);
        if (ws && Array.isArray(ws.fonts) && ws.fonts.length > 0) {
          fusion = { id: cleanId, name: name || 'Untitled Fusion', timestamp: Date.now(), fonts: ws.fonts, glyphMap: ws.glyphMap };
        }
      } catch {}
    }

    if (!fusion) {
      console.warn('Project not found for id/name:', cleanId, name);
      return null;
    }

    // Register all buffers from the project in RAM & IndexedDB
    if (Array.isArray(fusion.fonts)) {
      for (const sf of fusion.fonts) {
        const rawBuf = (sf as any).buffer || (sf as any).dataUrl || (sf as any).data;
        if (rawBuf) {
          const clean = coerceToArrayBuffer(rawBuf);
          if (clean && clean.byteLength > 0) {
            registerFontBuffer(sf.id, sf.name, sf.fileName, clean);
            set(`font-file-${sf.id}`, clean).catch(() => {});
            if (sf.fileName) set(`font-file-${sf.fileName}`, clean).catch(() => {});
          }
        }
      }
    }

    if (typeof localStorage !== 'undefined' && cleanId) {
      try {
        localStorage.setItem('fontfuser_last_project', cleanId);
      } catch {}
    }

    return await restoreWorkspaceData(fusion, onProgress);
  } catch (error) {
    console.error('Failed to load named fusion', error);
    return null;
  }
}

export async function deleteNamedFusion(id: string) {
  try {
    await del(`fusion-project-${id}`);
    const fusions = (await get<FusionSaveInfo[]>(SAVES_KEY)) || [];
    const filtered = fusions.filter(f => f.id !== id);
    await set(SAVES_KEY, filtered);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('fontfuser_fusions_list', JSON.stringify(filtered));
        if (localStorage.getItem('fontfuser_last_project') === id) {
          localStorage.removeItem('fontfuser_last_project');
        }
      } catch {}
    }
    try {
      fetch(`/api/project/${id}`, { method: 'DELETE' }).catch(() => {});
    } catch {}
  } catch (error) {
    console.error('Failed to delete named fusion', error);
  }
}

export async function cleanupOrphanedFonts() {
  // Mass cleanups permanently disabled to protect user fonts and workspace integrity
  return;
}
