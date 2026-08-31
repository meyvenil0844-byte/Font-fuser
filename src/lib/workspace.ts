import { get, set, keys, del } from 'idb-keyval';
import type { UploadedFont, GlyphMapping } from '../types';
import { parseFont } from './fontUtils';

const WORKSPACE_KEY = 'font-fuser-workspace';
const SAVES_KEY = 'font-fuser-saves';

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
  let migrated = false;
  for (const fusion of fusions) {
    for (const sf of fusion.fonts) {
      if (sf.buffer) {
        await set(`font-file-${sf.id}`, sf.buffer);
        delete sf.buffer;
        migrated = true;
      }
    }
  }
  return migrated;
}

export async function saveWorkspace(fonts: UploadedFont[], glyphMap: GlyphMapping) {
  try {
    const existingKeys = new Set(await keys());
    const savedFonts = [];
    for (const f of fonts) {
      const fileKey = `font-file-${f.id}`;
      if (!existingKeys.has(fileKey)) {
        const buffer = await f.file.arrayBuffer();
        await set(fileKey, buffer);
      }
      savedFonts.push({
        id: f.id,
        name: f.name,
        fileName: f.fileName,
        color: f.color,
      });
    }
    
    // Also try migrating the main workspace if it has old buffers
    const oldSaved = await get<SavedWorkspace>(WORKSPACE_KEY);
    if (oldSaved && oldSaved.fonts) {
      for (const sf of oldSaved.fonts) {
        if (sf.buffer) {
           await set(`font-file-${sf.id}`, sf.buffer);
        }
      }
    }

    await set(WORKSPACE_KEY, {
      fonts: savedFonts,
      glyphMap,
    });
  } catch (error) {
    console.error('Failed to save workspace', error);
    throw error;
  }
}

export async function loadWorkspace(): Promise<{ fonts: UploadedFont[]; glyphMap: GlyphMapping } | null> {
  try {
    const saved = await get<SavedWorkspace>(WORKSPACE_KEY);
    if (!saved) return null;
    return await restoreWorkspaceData(saved);
  } catch (error) {
    console.error('Failed to load workspace', error);
    return null;
  }
}

async function restoreWorkspaceData(saved: SavedWorkspace): Promise<{ fonts: UploadedFont[]; glyphMap: GlyphMapping }> {
  const loadedFonts: UploadedFont[] = [];
  
  if (!saved.fonts || !Array.isArray(saved.fonts)) return { fonts: [], glyphMap: {} };
  for (const sf of saved.fonts) {
    if (!sf) continue;
    try {
      let buffer = sf.buffer;
      if (!buffer) {
        buffer = await get<ArrayBuffer>(`font-file-${sf.id}`);
      }
      if (!buffer) {
        console.warn(`Font buffer not found for ${sf.fileName} (${sf.id})`);
        continue;
      }

      const file = new File([buffer], sf.fileName, { type: 'application/octet-stream' });
      const fontFamilyName = `FontFuser_${sf.id}`;
      
      const fontFace = new FontFace(fontFamilyName, buffer);
      try { 
        await fontFace.load(); 
        document.fonts.add(fontFace);
      } catch (err) { 
        console.warn("FontFace load error", err); 
      }

      loadedFonts.push({
        id: sf.id,
        name: sf.name,
        fileName: sf.fileName,
        file,

        fontFamilyName,
        color: sf.color,
      });
    } catch (err) {
      console.error(`Failed to load saved font ${sf.fileName}`, err);
    }
  }

  // Filter out glyph map entries for fonts that failed to load
  const validFontIds = new Set(loadedFonts.map(f => f.id));
  const validGlyphMap: GlyphMapping = {};
  if (saved.glyphMap) {
    for (const [cpStr, fontId] of Object.entries(saved.glyphMap)) {
      if (validFontIds.has(fontId)) {
        validGlyphMap[Number(cpStr)] = fontId;
      }
    }
  }

  return { fonts: loadedFonts, glyphMap: validGlyphMap };
}

export async function getFusionsList(): Promise<FusionSaveInfo[]> {
  try {
    const fusions = await get<FusionSave[]>(SAVES_KEY) || [];
    return fusions.map(f => ({ id: f.id, name: f.name, timestamp: f.timestamp }));
  } catch (error) {
    console.error('Failed to get fusions list', error);
    return [];
  }
}

export async function saveNamedFusion(name: string, fonts: UploadedFont[], glyphMap: GlyphMapping) {
  try {
    const fusions = await get<FusionSave[]>(SAVES_KEY) || [];
    
    // Migrate old ones to prevent quota errors
    await migrateSavesIfNeeded(fusions);

    const existingKeys = new Set(await keys());
    const savedFonts = [];
    for (const f of fonts) {
      const fileKey = `font-file-${f.id}`;
      if (!existingKeys.has(fileKey)) {
        const buffer = await f.file.arrayBuffer();
        await set(fileKey, buffer);
      }
      savedFonts.push({
        id: f.id,
        name: f.name,
        fileName: f.fileName,
        color: f.color,
      });
    }
    
    fusions.push({
      id: crypto.randomUUID(),
      name,
      timestamp: Date.now(),
      fonts: savedFonts,
      glyphMap,
    });
    
    await set(SAVES_KEY, fusions);
  } catch (error) {
    console.error('Failed to save named fusion', error);
    throw error;
  }
}

export async function loadNamedFusion(id: string): Promise<{ fonts: UploadedFont[]; glyphMap: GlyphMapping } | null> {
  try {
    const fusions = await get<FusionSave[]>(SAVES_KEY) || [];
    const fusion = fusions.find(f => f.id === id);
    if (!fusion) return null;
    return await restoreWorkspaceData(fusion);
  } catch (error) {
    console.error('Failed to load named fusion', error);
    return null;
  }
}

export async function deleteNamedFusion(id: string) {
  try {
    const fusions = await get<FusionSave[]>(SAVES_KEY) || [];
    await set(SAVES_KEY, fusions.filter(f => f.id !== id));
  } catch (error) {
    console.error('Failed to delete named fusion', error);
  }
}


export async function cleanupOrphanedFonts() {
  try {
    const allKeys = await keys();
    const fontKeys = allKeys.filter(k => typeof k === 'string' && k.startsWith('font-file-'));
    
    const activeIds = new Set<string>();
    
    const workspace = await get<SavedWorkspace>(WORKSPACE_KEY);
    if (workspace && workspace.fonts) {
      workspace.fonts.forEach(f => { if (f) activeIds.add(f.id); });
    }
    
    const fusions = await get<FusionSave[]>(SAVES_KEY) || [];
    fusions.forEach(fusion => {
      if (fusion.fonts) {
        fusion.fonts.forEach(f => { if (f) activeIds.add(f.id); });
      }
    });
    
    for (const key of fontKeys) {
      const id = (key as string).replace('font-file-', '');
      if (!activeIds.has(id)) {
        console.log('Cleaning up orphaned font buffer:', key);
        
        await del(key);
      }
    }
  } catch (err) {
    console.error('Failed to cleanup fonts', err);
  }
}
