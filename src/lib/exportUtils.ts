import type { UploadedFont, GlyphMapping } from '../types';
import { parseFont, extractSupportedCodePoints, parseSfntBasic } from './fontUtils';
import { extractColorFontInfo, createEmptyColorData } from './colorFontUtils';
import { registerFontBuffer, fontMemoryCache, coerceToArrayBuffer, generateUUID, findFontBuffer, arrayBufferToDataUrl, arrayBufferToDataUrlAsync, loadNamedFusion } from './workspace';
import { set, get } from 'idb-keyval';

/**
 * Decodes base64 string or dataURL into an ArrayBuffer synchronously
 */
function decodeBase64ToArrayBuffer(dataStr: string): ArrayBuffer | null {
  try {
    const comma = dataStr.indexOf(',');
    const b64 = comma !== -1 ? dataStr.slice(comma + 1) : dataStr;
    const cleanB64 = b64.replace(/\s+/g, '');
    const binary = atob(cleanB64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  } catch (e) {
    return null;
  }
}

/**
 * Extracts ArrayBuffer from various save font formats
 */
function extractBufferFromSavedFont(sf: any): ArrayBuffer | null {
  if (!sf) return null;
  if (sf.dataUrl && typeof sf.dataUrl === 'string') {
    const b = decodeBase64ToArrayBuffer(sf.dataUrl);
    if (b && b.byteLength > 0) return b;
  }
  if (sf.buffer) {
    const direct = coerceToArrayBuffer(sf.buffer);
    if (direct && direct.byteLength > 0) return direct;
    if (typeof sf.buffer === 'string') {
      const b = decodeBase64ToArrayBuffer(sf.buffer);
      if (b && b.byteLength > 0) return b;
    }
  }
  if (sf.data && typeof sf.data === 'string') {
    const b = decodeBase64ToArrayBuffer(sf.data);
    if (b && b.byteLength > 0) return b;
  }
  return null;
}

async function downloadFuserFile(data: any, fileName: string): Promise<{ success: boolean; fileName: string; downloadUrl?: string; blob?: Blob }> {
    const safeFileName = fileName.endsWith('.fuser') ? fileName : `${fileName}.fuser`;
    const jsonStr = typeof data === 'string' ? data : JSON.stringify(data);
    let serverDownloadUrl: string | null = null;
    let blobDownloadOk = false;
    let createdBlob: Blob | undefined = undefined;

    // 1. Immediately trigger client-side Blob download as instant direct browser download
    try {
        createdBlob = new Blob([jsonStr], { type: 'application/octet-stream' });
        const blobUrl = URL.createObjectURL(createdBlob);
        const aBlob = document.createElement('a');
        aBlob.href = blobUrl;
        aBlob.download = safeFileName;
        aBlob.rel = 'noopener';
        aBlob.style.display = 'none';
        document.body.appendChild(aBlob);
        aBlob.click();
        blobDownloadOk = true;

        setTimeout(() => {
            try {
                document.body.removeChild(aBlob);
                URL.revokeObjectURL(blobUrl);
            } catch (e) {}
        }, 30000);
    } catch (blobErr) {
        console.warn('Direct Blob URL download notice:', blobErr);
    }

    // 2. Non-blocking asynchronous backup sync to server (never blocks the user download)
    try {
        fetch('/api/export-fuser?format=json', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: safeFileName.replace(/\.(fuser|json)$/i, ''), data })
        }).then(async res => {
            if (res.ok) {
                const resp = await res.json().catch(() => ({}));
                if (resp && resp.downloadUrl) serverDownloadUrl = resp.downloadUrl;
            }
        }).catch(err => {
            console.warn('Server export backup endpoint notice:', err);
        });
    } catch (err) {}

    // 3. Fallback: if client-side Blob creation failed, synchronously try server route
    if (!blobDownloadOk) {
        try {
            const res = await fetch('/api/export-fuser?format=json', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: safeFileName.replace(/\.(fuser|json)$/i, ''), data })
            });
            if (res.ok) {
                const resp = await res.json();
                if (resp && resp.downloadUrl) {
                    serverDownloadUrl = resp.downloadUrl;
                    const aServer = document.createElement('a');
                    aServer.href = serverDownloadUrl;
                    aServer.download = safeFileName;
                    aServer.style.display = 'none';
                    document.body.appendChild(aServer);
                    aServer.click();
                    setTimeout(() => {
                        try { document.body.removeChild(aServer); } catch (e) {}
                    }, 6000);
                }
            }
        } catch (e) {
            console.warn('Server export route fallback warning:', e);
        }
    }

    return { success: true, fileName: safeFileName, downloadUrl: serverDownloadUrl || undefined, blob: createdBlob };
}

export const exportFusionWorkspace = async (name: string, fonts: UploadedFont[], glyphMap: GlyphMapping) => {
    const cleanName = (name || 'fusion-project').replace(/\.(fuser|json)$/i, '').trim() || 'fusion-project';
    const downloadFileName = `${cleanName}.fuser`;

    const serializedFonts = await Promise.all(fonts.map(async f => {
        let dataUrl = (f as any).dataUrl || '';

        // If dataUrl not present, find or serialize the font buffer
        if (!dataUrl) {
            let buf: ArrayBuffer | null = f.buffer || null;
            if (!buf || buf.byteLength === 0) {
                if (f.id && fontMemoryCache.has(f.id)) buf = fontMemoryCache.get(f.id) || null;
                else if (f.fileName && fontMemoryCache.has(f.fileName.toLowerCase())) buf = fontMemoryCache.get(f.fileName.toLowerCase()) || null;
            }
            if (!buf || buf.byteLength === 0) {
                try {
                    buf = await findFontBuffer(f);
                } catch (e) {}
            }
            if (!buf || buf.byteLength === 0) {
                try {
                    if (f.file && f.file.size > 0) buf = await f.file.arrayBuffer();
                } catch (e) {}
            }

            if (buf && buf.byteLength > 0) {
                try {
                    dataUrl = await arrayBufferToDataUrlAsync(buf);
                    (f as any).dataUrl = dataUrl;
                } catch (e) {
                    console.warn("Base64 serialization fallback:", e);
                }
            }
        }

        return {
            id: f.id,
            name: f.name || f.fileName,
            fileName: f.fileName,
            color: f.color,
            dataUrl
        };
    }));

    const data = {
        version: 1,
        id: `project_${Date.now()}`,
        name: cleanName,
        timestamp: Date.now(),
        fonts: serializedFonts,
        glyphMap: glyphMap || {}
    };

    return await downloadFuserFile(data, downloadFileName);
};

/**
 * Directly exports an existing saved project as a .fuser file
 */
export const exportSavedProjectAsFuser = async (projectId: string, name?: string, storageKey?: string) => {
    const cleanId = String(projectId || '').trim();
    let raw: any = null;

    const cleanName = (name || cleanId || 'fusion-project').replace(/\.(fuser|json)$/i, '').trim();
    const downloadFileName = `${cleanName}.fuser`;

    // 1. Direct check of storageKey
    if (storageKey) {
        try {
            raw = await get<any>(storageKey);
        } catch {}
    }

    // 2. Check fusion-project-${cleanId} and cleanId
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

    // 3. Check SAVES_KEY list in IndexedDB
    if (!raw) {
        try {
            const saves = await get<any[]>('font-fuser-saves');
            if (Array.isArray(saves)) {
                const found = saves.find(s => s && (s.id === cleanId || s.name === name || s.name === cleanName));
                if (found) {
                    if (Array.isArray(found.fonts) && found.fonts.length > 0) {
                        raw = found;
                    } else if (found.storageKey) {
                        raw = await get<any>(found.storageKey).catch(() => null);
                    }
                }
            }
        } catch {}
    }

    // 4. Fallback: fully load & restore the project fonts and glyph mapping via loadNamedFusion
    if (!raw || !Array.isArray(raw.fonts) || raw.fonts.length === 0) {
        try {
            const restored = await loadNamedFusion(cleanId, name || cleanName, storageKey);
            if (restored && Array.isArray(restored.fonts) && restored.fonts.length > 0) {
                return await exportFusionWorkspace(cleanName, restored.fonts, restored.glyphMap);
            }
        } catch (restoreErr) {
            console.warn('loadNamedFusion export restore notice:', restoreErr);
        }
    }

    // 5. Server API check /api/project/${id}
    if ((!raw || !Array.isArray(raw.fonts) || raw.fonts.length === 0) && cleanId) {
        try {
            const res = await fetch(`/api/project/${encodeURIComponent(cleanId)}`);
            if (res.ok) {
                raw = await res.json();
            }
        } catch {}
    }

    if (raw && Array.isArray(raw.fonts) && raw.fonts.length > 0) {
        // Ensure all fonts have complete dataUrl representation
        for (const f of raw.fonts) {
            if (!f.dataUrl) {
                let buf = extractBufferFromSavedFont(f) || (f.id ? fontMemoryCache.get(f.id) : null);
                if (!buf) {
                    try {
                        buf = await findFontBuffer(f);
                    } catch (e) {}
                }
                if (buf && buf.byteLength > 0) {
                    try {
                        f.dataUrl = await arrayBufferToDataUrlAsync(buf);
                    } catch (e) {}
                }
            }
        }

        raw.name = cleanName;
        raw.id = cleanId || raw.id;
        return await downloadFuserFile(raw, downloadFileName);
    }

    // 6. Direct server download fallback only if server confirmed the file exists
    try {
        const directUrl = `/api/download-fuser/${encodeURIComponent(cleanId)}`;
        const checkRes = await fetch(directUrl, { method: 'HEAD' });
        if (checkRes.ok) {
            const directA = document.createElement('a');
            directA.href = directUrl;
            directA.download = downloadFileName;
            directA.rel = 'noopener';
            directA.style.display = 'none';
            document.body.appendChild(directA);
            directA.click();
            setTimeout(() => {
                try { document.body.removeChild(directA); } catch (e) {}
            }, 6000);
            return { success: true, fileName: downloadFileName, downloadUrl: directUrl };
        }
    } catch {}

    throw new Error(`Could not find saved font data for "${cleanName}".`);
};

export const importFusionWorkspace = async (file: File): Promise<{ fonts: UploadedFont[], glyphMap: GlyphMapping, name: string }> => {
    const text = await file.text();
    let data: any = {};
    try {
        data = JSON.parse(text);
    } catch (e) {
        throw new Error('Invalid project save file (not valid JSON).');
    }

    const rawFonts = Array.isArray(data.fonts) ? data.fonts : (Array.isArray(data) ? data : (data.saved?.fonts || []));
    const rawGlyphMap = data.glyphMap || data.saved?.glyphMap || {};
    const projectName = data.name || data.saved?.name || file.name.replace(/\.(fuser|json)$/i, '') || 'Imported Project';

    const loadedFonts: UploadedFont[] = [];

    for (const sf of rawFonts) {
        if (!sf) continue;
        try {
            const buffer = extractBufferFromSavedFont(sf);
            if (!buffer || buffer.byteLength === 0) {
                console.warn("Could not retrieve font binary data for", sf.name || sf.fileName);
                continue;
            }

            const fontId = sf.id || generateUUID();
            const fileName = sf.fileName || `${sf.name || 'font'}.ttf`;
            const fontFile = new File([buffer.slice(0)], fileName, { type: 'application/octet-stream' });
            const fontFamilyName = `FontFuser_${fontId}`;

            try {
                const fontFace = new FontFace(fontFamilyName, buffer.slice(0));
                await fontFace.load();
                document.fonts.add(fontFace);
            } catch (e) {
                console.warn("Failed to register fontface during import", e);
            }

            let parsed: any = undefined;
            let colorData: any = undefined;
            let supportedCodePoints = new Set<number>();
            const isLarge = buffer.byteLength > 1.5 * 1024 * 1024;
            if (isLarge) {
                try {
                    const sfnt = parseSfntBasic(buffer, sf.name);
                    if (sfnt.codePoints && sfnt.codePoints.size > 0) supportedCodePoints = sfnt.codePoints;
                } catch (pe) {
                    console.warn("Failed to parse large font during import:", pe);
                }
                colorData = (sf as any).colorData || createEmptyColorData();
            } else {
                try {
                    parsed = await parseFont(fontFile);
                    colorData = extractColorFontInfo(parsed);
                    supportedCodePoints = extractSupportedCodePoints(parsed);
                } catch (pe) {
                    console.warn("Failed to parse font during import:", pe);
                    const sfnt = parseSfntBasic(buffer, sf.name);
                    if (sfnt.codePoints.size > 0) supportedCodePoints = sfnt.codePoints;
                }
            }

            registerFontBuffer(fontId, sf.name, fileName, buffer);
            set(`font-file-${fontId}`, buffer.slice(0)).catch(() => {});

            loadedFonts.push({
                id: fontId,
                name: sf.name || fileName,
                fileName,
                color: sf.color || '#3b82f6',
                file: fontFile,
                buffer: buffer.slice(0),
                parsed,
                fontFamilyName,
                hasColor: !!colorData?.hasColor,
                colorData,
                supportedCodePoints
            } as UploadedFont);

            await new Promise(r => setTimeout(r, 0));
        } catch (e) {
            console.error("Failed to load font from import file", e);
        }
    }

    const validFontIds = new Set(loadedFonts.map(f => f.id));
    const validGlyphMap: GlyphMapping = {};
    if (rawGlyphMap) {
        for (const [cpStr, fontId] of Object.entries(rawGlyphMap)) {
            if (typeof fontId === 'string' && (validFontIds.has(fontId) || validFontIds.size === 1)) {
                validGlyphMap[Number(cpStr)] = validFontIds.has(fontId) ? fontId : (loadedFonts[0]?.id || fontId);
            }
        }
    }

    return {
        name: projectName,
        fonts: loadedFonts,
        glyphMap: validGlyphMap
    };
};