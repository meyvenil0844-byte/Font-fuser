const fs = require('fs');
let code = fs.readFileSync('src/lib/workspace.ts', 'utf8');

const regex = /async function restoreWorkspaceData\([\s\S]*?\/\/ Filter out glyph map entries for fonts that failed to load/;

const replacement = `async function restoreWorkspaceData(saved: SavedWorkspace): Promise<{ fonts: UploadedFont[]; glyphMap: GlyphMapping }> {
  if (!saved.fonts || !Array.isArray(saved.fonts)) return { fonts: [], glyphMap: {} };
  
  const loadedFonts: UploadedFont[] = [];
  
  // Process sequentially to avoid browser crash/OOM and IndexedDB overload
  for (const sf of saved.fonts) {
    if (!sf) continue;
    let buffer = sf.buffer;
    if (!buffer) {
      try {
        buffer = await get<ArrayBuffer>(\`font-file-\${sf.id}\`);
      } catch (e) {
        console.warn("Failed to get buffer", e);
        continue;
      }
    }
    
    if (!buffer) {
      console.warn(\`Font buffer not found for \${sf.fileName} (\${sf.id})\`);
      continue;
    }
    
    try {
      const file = new File([buffer], sf.fileName, { type: 'application/octet-stream' });
      const fontFamilyName = \`FontFuser_\${sf.id}\`;
      
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
      } as UploadedFont);
      
      // Yield to the event loop so the browser doesn't freeze
      await new Promise(r => setTimeout(r, 0));
    } catch (err) {
      console.error(\`Failed to load saved font \${sf.fileName}\`, err);
    }
  }

  // Filter out glyph map entries for fonts that failed to load`;

if (regex.test(code)) {
  code = code.replace(regex, replacement);
  fs.writeFileSync('src/lib/workspace.ts', code);
  console.log("Patched restoreWorkspaceData!");
} else {
  console.log("Failed to find restoreWorkspaceData with regex.");
}
