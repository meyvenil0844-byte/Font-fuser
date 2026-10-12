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

export function coerceToArrayBuffer(val: any): ArrayBuffer | null {
  if (!val) return null;
  if (val instanceof ArrayBuffer) {
    return val.byteLength > 0 ? val.slice(0) : null;
  }
  if (ArrayBuffer.isView(val)) {
    return val.byteLength > 0 ? val.buffer.slice(val.byteOffset, val.byteOffset + val.byteLength) : null;
  }
  if (typeof val === 'object' && Array.isArray((val as any).data) && (val as any).data.length > 0) {
    try {
      const u8 = new Uint8Array((val as any).data);
      return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
    } catch {
      return null;
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
  // Persistent storage in IndexedDB (only once per font ID to avoid storage flooding and memory exhaustion)
  if (id && typeof indexedDB !== 'undefined') {
    const fileKey = `font-file-${id}`;
    try { set(fileKey, cleanBuf).catch(() => {}); } catch {}
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

export interface FusionSaveInfo {
  id: string;
  name: string;
  timestamp: number;
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
      let fontBuffer: ArrayBuffer | undefined = f.buffer;
      
      if (!fontBuffer || fontBuffer.byteLength === 0) {
        if (fontMemoryCache.has(f.id)) {
          fontBuffer = fontMemoryCache.get(f.id);
        } else if (f.fileName && fontMemoryCache.has(f.fileName.toLowerCase())) {
          fontBuffer = fontMemoryCache.get(f.fileName.toLowerCase());
        }
      }

      if (!fontBuffer || fontBuffer.byteLength === 0) {
        try {
          const buf = await f.file.arrayBuffer();
          if (buf && buf.byteLength > 0) fontBuffer = buf;
        } catch (e) {}
      }

      if (fontBuffer && fontBuffer.byteLength > 0) {
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

      savedFonts.push({
        id: f.id,
        name: f.name,
        fileName: f.fileName,
        color: f.color
      });
    }

    await set(WORKSPACE_KEY, {
      fonts: savedFonts,
      glyphMap,
    });
    if (savedFonts.length > 0) {
      await set(WORKSPACE_BACKUP_KEY, {
        fonts: savedFonts,
        glyphMap,
      });
    }
  } catch (error) {
    console.error('Failed to save workspace', error);
    throw error;
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
        const allKeys = await keys();
        for (const k of allKeys) {
          const keyStr = String(k);
          if (
            keyStr.startsWith('font-') || 
            keyStr.startsWith('font-file-') || 
            keyStr.startsWith('fontfuser-') ||
            keyStr === WORKSPACE_KEY ||
            keyStr === WORKSPACE_BACKUP_KEY
          ) {
            await del(k).catch(() => {});
          }
        }
      } catch (idbErr) {
        console.warn('Error clearing IndexedDB keys:', idbErr);
      }
    }

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem('fontfuser_last_project');
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

async function getWithTimeout<T>(key: any, timeoutMs: number = 600): Promise<T | undefined> {
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

export async function loadWorkspace(): Promise<{ fonts: UploadedFont[]; glyphMap: GlyphMapping } | null> {
  try {
    let saved = await getWithTimeout<SavedWorkspace>(WORKSPACE_KEY, 800);
    if (!saved || !saved.fonts || saved.fonts.length === 0) {
      const backup = await getWithTimeout<SavedWorkspace>(WORKSPACE_BACKUP_KEY, 600);
      if (backup && backup.fonts && backup.fonts.length > 0) {
        saved = backup;
      }
    }
    if (!saved) return null;
    return await restoreWorkspaceData(saved);
  } catch (error) {
    console.error('Failed to load workspace', error);
    try {
      const backup = await getWithTimeout<SavedWorkspace>(WORKSPACE_BACKUP_KEY, 600);
      if (backup && backup.fonts && backup.fonts.length > 0) {
        return await restoreWorkspaceData(backup);
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

async function findFontBuffer(sf: { id?: string; name?: string; fileName?: string; buffer?: any }): Promise<ArrayBuffer | null> {
  const id = sf.id || '';
  const name = sf.name || '';
  const fileName = sf.fileName || '';
  const lowerFile = fileName.toLowerCase();
  const lowerName = name.toLowerCase();

  // 1. Direct buffer on saved object (instant 0ms)
  const directClean = coerceToArrayBuffer(sf.buffer);
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

  // 3. Fast IndexedDB keys (id, filename, name)
  const idbKeys = [
    id ? `font-file-${id}` : '',
    lowerFile ? `font-file-${lowerFile}` : '',
    lowerName ? `font-file-${lowerName}` : '',
    id ? `font-${id}` : '',
    lowerFile ? `font-${lowerFile}` : '',
    id,
    lowerFile
  ].filter(Boolean);

  for (const k of idbKeys) {
    try {
      const val = await getWithTimeout<any>(k, 300);
      const b = coerceToArrayBuffer(val) || (val instanceof Blob ? await val.arrayBuffer() : null);
      if (b && b.byteLength > 0) {
        registerFontBuffer(id, name, fileName, b);
        return b;
      }
    } catch (e) {}
  }

  // 4. Fallback server check (reliable 600ms timeout)
  if (fileName || id) {
    try {
      const sRes = await fetchWithTimeout(`/api/get-cached-font?name=${encodeURIComponent(fileName)}&id=${encodeURIComponent(id)}`, 600);
      if (sRes.ok) {
        const sBuf = await sRes.arrayBuffer();
        if (sBuf && sBuf.byteLength > 0) {
          registerFontBuffer(id, name, fileName, sBuf);
          return sBuf;
        }
      }
    } catch (e) {}
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

async function restoreWorkspaceData(saved: SavedWorkspace): Promise<{ fonts: UploadedFont[]; glyphMap: GlyphMapping }> {
  if (!saved || !saved.fonts || !Array.isArray(saved.fonts)) return { fonts: [], glyphMap: {} };

  // Parallel loading for fast, instant workspace restoration
  const fontPromises = saved.fonts.map(async (sf): Promise<UploadedFont> => {
    const fallbackId = (sf && sf.id) || generateUUID();
    const fallbackName = (sf && (sf.name || sf.fileName)) || 'Untitled Font';
    const fallbackFileName = (sf && sf.fileName) || 'font.ttf';
    const fallbackColor = (sf && sf.color) || '#3b82f6';
    const fallbackFamilyName = `FontFuser_${fallbackId}`;

    if (!sf) {
      return {
        id: fallbackId,
        name: fallbackName,
        fileName: fallbackFileName,
        file: new File([], fallbackFileName, { type: 'application/octet-stream' }),
        buffer: new ArrayBuffer(0),
        fontFamilyName: fallbackFamilyName,
        color: fallbackColor,
        hasColor: false,
        colorData: createEmptyColorData(),
        supportedCodePoints: new Set<number>()
      } as UploadedFont;
    }

    let buffer: ArrayBuffer | null = null;
    try {
      buffer = await findFontBuffer(sf);
    } catch (e) {
      console.warn("Buffer retrieval warning for", sf.fileName, e);
    }

    if (!buffer || buffer.byteLength === 0) {
      return {
        id: sf.id || fallbackId,
        name: sf.name || sf.fileName || fallbackName,
        fileName: sf.fileName || fallbackFileName,
        file: new File([], sf.fileName || fallbackFileName, { type: 'application/octet-stream' }),
        buffer: new ArrayBuffer(0),
        fontFamilyName: fallbackFamilyName,
        color: sf.color || fallbackColor,
        hasColor: false,
        colorData: createEmptyColorData(),
        supportedCodePoints: new Set<number>()
      } as UploadedFont;
    }

    try {
      let fontBuffer = buffer.slice(0);
      try {
        fontBuffer = await normalizeFontBuffer(fontBuffer, sf.fileName || fallbackFileName);
      } catch (ne) {
        console.warn("Font normalization warning for", sf.fileName, ne);
      }
      const file = new File([fontBuffer.slice(0)], sf.fileName || fallbackFileName, { type: 'application/octet-stream' });
      const fontFamilyName = `FontFuser_${sf.id || fallbackId}`;
      
      // 1. Register FontFace in CSS safely
      if (typeof FontFace !== 'undefined' && fontBuffer.byteLength > 0) {
        try {
          const fontFace = new FontFace(fontFamilyName, fontBuffer.slice(0));
          document.fonts.add(fontFace);
          fontFace.load().catch(() => {});
        } catch (err) {}
      }

      // 2. Parse font safely directly from buffer
      let parsed: opentype.Font | undefined = undefined;
      try {
        parsed = opentype.parse(fontBuffer.slice(0));
      } catch (pe) {
        console.warn("Failed to parse font for inspection:", pe);
      }

      // 3. Extract supported codepoints
      let supportedCodePoints = new Set<number>();
      if (parsed) {
        try {
          supportedCodePoints = extractSupportedCodePoints(parsed);
        } catch (spe) {}
      }
      if (supportedCodePoints.size === 0 && fontBuffer.byteLength > 0) {
        try {
          const sfnt = parseSfntBasic(fontBuffer, sf.name);
          if (sfnt.codePoints.size > 0) supportedCodePoints = sfnt.codePoints;
        } catch (sfe) {}
      }

      // 4. Extract color font data
      let colorData: ColorFontData = createEmptyColorData();
      if (parsed) {
        try {
          colorData = extractColorFontInfo(parsed);
        } catch (ce) {
          console.warn("Failed to extract color font info:", ce);
        }
      }

      registerFontBuffer(sf.id, sf.name, sf.fileName, fontBuffer);

      return {
        id: sf.id || fallbackId,
        name: sf.name || sf.fileName || fallbackName,
        fileName: sf.fileName || fallbackFileName,
        file,
        buffer: fontBuffer.slice(0),
        parsed,
        fontFamilyName,
        color: sf.color || fallbackColor,
        hasColor: !!colorData?.hasColor,
        colorData,
        supportedCodePoints
      } as UploadedFont;
    } catch (err) {
      console.error(`Failed to load saved font ${sf.fileName}`, err);
      return {
        id: sf.id || fallbackId,
        name: sf.name || sf.fileName || fallbackName,
        fileName: sf.fileName || fallbackFileName,
        file: new File([], sf.fileName || fallbackFileName, { type: 'application/octet-stream' }),
        buffer: new ArrayBuffer(0),
        fontFamilyName: fallbackFamilyName,
        color: sf.color || fallbackColor,
        hasColor: false,
        colorData: createEmptyColorData(),
        supportedCodePoints: new Set<number>()
      } as UploadedFont;
    }
  });

  const loadedFonts = await Promise.all(fontPromises);

  // Retain 100% of user assignments
  const validGlyphMap: GlyphMapping = { ...(saved.glyphMap || {}) };

  return { fonts: loadedFonts, glyphMap: validGlyphMap };
}

export async function getFusionsList(): Promise<FusionSaveInfo[]> {
  try {
    const rawFusions = await get<any>(SAVES_KEY);
    if (!Array.isArray(rawFusions)) return [];

    // Instant O(1) projection: ONLY extract metadata (id, name, timestamp)
    return rawFusions
      .filter(f => f && typeof f === 'object' && f.id)
      .map(f => ({
        id: String(f.id),
        name: String(f.name || 'Untitled Fusion'),
        timestamp: Number(f.timestamp) || Date.now()
      }));
  } catch (error) {
    console.error('Failed to get fusions list', error);
    return [];
  }
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
      let fontBuffer: ArrayBuffer | undefined = f.buffer;
      
      if (!fontBuffer || fontBuffer.byteLength === 0) {
        if (fontMemoryCache.has(f.id)) {
          fontBuffer = fontMemoryCache.get(f.id);
        } else if (f.fileName && fontMemoryCache.has(f.fileName.toLowerCase())) {
          fontBuffer = fontMemoryCache.get(f.fileName.toLowerCase());
        }
      }

      if (!fontBuffer || fontBuffer.byteLength === 0) {
        try {
          const buf = await f.file.arrayBuffer();
          if (buf && buf.byteLength > 0) fontBuffer = buf;
        } catch (e) {}
      }

      if (fontBuffer && fontBuffer.byteLength > 0) {
        registerFontBuffer(f.id, f.name, f.fileName, fontBuffer);
        await set(`font-file-${f.id}`, fontBuffer).catch(() => {});
      }

      savedFonts.push({
        id: f.id,
        name: f.name,
        fileName: f.fileName,
        color: f.color,
        buffer: fontBuffer ? fontBuffer.slice(0) : undefined
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
    await set(`fusion-project-${projectId}`, projectData);

    // 2. Update metadata index in SAVES_KEY
    const meta: FusionSaveInfo = {
      id: projectId,
      name: trimmedName,
      timestamp: projectData.timestamp
    };
    const existingIdx = indexList.findIndex(f => f.id === projectId);
    if (existingIdx !== -1) {
      indexList[existingIdx] = meta;
    } else {
      indexList.unshift(meta);
    }
    await set(SAVES_KEY, indexList);
  } catch (error) {
    console.error('Failed to save named fusion', error);
    throw error;
  }
}

export async function loadNamedFusion(id: string): Promise<{ fonts: UploadedFont[]; glyphMap: GlyphMapping } | null> {
  try {
    // 1. Check dedicated project record
    let fusion = await get<FusionSave>(`fusion-project-${id}`);

    // 2. Fallback to legacy structure in SAVES_KEY
    if (!fusion) {
      const rawFusions = await get<any>(SAVES_KEY);
      if (Array.isArray(rawFusions)) {
        fusion = rawFusions.find(f => f && String(f.id) === String(id));
      }
    }

    if (!fusion) {
      console.warn('Project not found for id:', id);
      return null;
    }

    // Register all buffers from the project in RAM & IndexedDB
    if (Array.isArray(fusion.fonts)) {
      for (const sf of fusion.fonts) {
        if (sf && (sf as any).buffer) {
          const clean = coerceToArrayBuffer((sf as any).buffer);
          if (clean && clean.byteLength > 0) {
            registerFontBuffer(sf.id, sf.name, sf.fileName, clean);
            set(`font-file-${sf.id}`, clean).catch(() => {});
          }
        }
      }
    }

    return await restoreWorkspaceData(fusion);
  } catch (error) {
    console.error('Failed to load named fusion', error);
    return null;
  }
}

export async function deleteNamedFusion(id: string) {
  try {
    await del(`fusion-project-${id}`);
    const fusions = await get<FusionSaveInfo[]>(SAVES_KEY) || [];
    await set(SAVES_KEY, fusions.filter(f => f.id !== id));
  } catch (error) {
    console.error('Failed to delete named fusion', error);
  }
}

export async function cleanupOrphanedFonts() {
  // Mass cleanups permanently disabled to protect user fonts and workspace integrity
  return;
}
