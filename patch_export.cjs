const fs = require('fs');
let code = fs.readFileSync('src/lib/exportUtils.ts', 'utf8');

const startIndex = code.indexOf('export const importFusionWorkspace');
const replacement = `export const importFusionWorkspace = async (file: File): Promise<{ fonts: UploadedFont[], glyphMap: GlyphMapping, name: string }> => {
    const text = await file.text();
    const data = JSON.parse(text);
    
    const loadedFonts: UploadedFont[] = [];
    
    // Process sequentially to avoid browser OOM when fetching large dataURLs
    for (const sf of data.fonts) {
        try {
            const res = await fetch(sf.dataUrl);
            const blob = await res.blob();
            const fontFile = new File([blob], sf.fileName, { type: blob.type || 'application/octet-stream' });
            const fontFamilyName = \`FontFuser_\${sf.id}\`;
            
            try {
                const buffer = await fontFile.arrayBuffer();
                const fontFace = new FontFace(fontFamilyName, buffer);
                await fontFace.load();
                document.fonts.add(fontFace);
            } catch (e) {
                console.warn("Failed to load fontface during import", e);
            }

            loadedFonts.push({
                id: sf.id,
                name: sf.name,
                fileName: sf.fileName,
                color: sf.color,
                file: fontFile,
                fontFamilyName
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
};`;

if (startIndex !== -1) {
    code = code.slice(0, startIndex) + replacement;
    fs.writeFileSync('src/lib/exportUtils.ts', code);
    console.log("Patched exportUtils.ts");
} else {
    console.log("Failed to patch exportUtils.ts");
}
