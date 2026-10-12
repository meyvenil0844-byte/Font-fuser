import type { UploadedFont, GlyphMapping } from '../types';
import { parseFont, extractSupportedCodePoints, parseSfntBasic } from './fontUtils';
import { extractColorFontInfo } from './colorFontUtils';
import { registerFontBuffer } from './workspace';
import { set } from 'idb-keyval';

export const exportFusionWorkspace = async (name: string, fonts: UploadedFont[], glyphMap: GlyphMapping) => {
    const serializedFonts = await Promise.all(fonts.map(async f => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                resolve({
                    id: f.id,
                    name: f.name,
                    fileName: f.fileName,
                    color: f.color,
                    dataUrl: reader.result
                });
            };
            reader.onerror = reject;
            const blobToRead = (f.file && f.file.size > 0) ? f.file : (f.buffer && f.buffer.byteLength > 0 ? new Blob([f.buffer]) : f.file);
            reader.readAsDataURL(blobToRead);
        });
    }));

    const data = {
        version: 1,
        name,
        timestamp: Date.now(),
        fonts: serializedFonts,
        glyphMap
    };

    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name || 'fusion-project'}.fuser`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

export const importFusionWorkspace = async (file: File): Promise<{ fonts: UploadedFont[], glyphMap: GlyphMapping, name: string }> => {
    const text = await file.text();
    const data = JSON.parse(text);
    
    const loadedFonts: UploadedFont[] = [];
    
    // Process sequentially to avoid browser OOM when fetching large dataURLs
    for (const sf of data.fonts) {
        try {
            const res = await fetch(sf.dataUrl);
            const blob = await res.blob();
            const fontFile = new File([blob], sf.fileName, { type: blob.type || 'application/octet-stream' });
            const fontFamilyName = `FontFuser_${sf.id}`;
            const buffer = await fontFile.arrayBuffer();
            
            try {
                const fontFace = new FontFace(fontFamilyName, buffer.slice(0));
                await fontFace.load();
                document.fonts.add(fontFace);
            } catch (e) {
                console.warn("Failed to load fontface during import", e);
            }

            let parsed: any = undefined;
            let colorData: any = undefined;
            let supportedCodePoints = new Set<number>();
            try {
                parsed = await parseFont(fontFile);
                colorData = extractColorFontInfo(parsed);
                supportedCodePoints = extractSupportedCodePoints(parsed);
            } catch (pe) {
                console.warn("Failed to parse font during import:", pe);
                const sfnt = parseSfntBasic(buffer, sf.name);
                if (sfnt.codePoints.size > 0) supportedCodePoints = sfnt.codePoints;
            }

            registerFontBuffer(sf.id, sf.name, sf.fileName, buffer);
            set(`font-file-${sf.id}`, buffer.slice(0)).catch(() => {});

            loadedFonts.push({
                id: sf.id,
                name: sf.name,
                fileName: sf.fileName,
                color: sf.color,
                file: fontFile,
                buffer: buffer.slice(0),
                parsed,
                fontFamilyName,
                hasColor: !!colorData?.hasColor,
                colorData,
                supportedCodePoints
            } as UploadedFont);
            
            // Yield to event loop to keep UI responsive
            await new Promise(r => setTimeout(r, 0));
        } catch (e) {
            console.error("Failed to load font", e);
        }
    }
    
    // Filter valid glyph maps
    const validFontIds = new Set(loadedFonts.map(f => f.id));
    const validGlyphMap: GlyphMapping = {};
    if (data.glyphMap) {
        for (const [cpStr, fontId] of Object.entries(data.glyphMap)) {
            if (typeof fontId === 'string' && validFontIds.has(fontId)) {
                validGlyphMap[Number(cpStr)] = fontId;
            }
        }
    }
    return {
        name: data.name || 'Imported Project',
        fonts: loadedFonts,
        glyphMap: validGlyphMap
    };
};