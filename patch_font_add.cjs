const fs = require('fs');

// Patch workspace.ts
let workspace = fs.readFileSync('src/lib/workspace.ts', 'utf8');
workspace = workspace.replace(
  /try \{ await fontFace\.load\(\); \} catch \(err\) \{ console\.warn\("FontFace load error", err\); \}\s*document\.fonts\.add\(fontFace\);/g,
  `try { 
        await fontFace.load(); 
        document.fonts.add(fontFace);
      } catch (err) { 
        console.warn("FontFace load error", err); 
      }`
);
fs.writeFileSync('src/lib/workspace.ts', workspace);

// Patch FontManager.tsx
let fontManager = fs.readFileSync('src/components/FontManager.tsx', 'utf8');
fontManager = fontManager.replace(
  /try \{ await fontFace\.load\(\); \} catch \(e\) \{ console\.warn\(e\); \}\s*document\.fonts\.add\(fontFace\);/g,
  `try { 
          await fontFace.load(); 
          document.fonts.add(fontFace);
        } catch (e) { 
          console.warn("FontManager FontFace load error:", e); 
        }`
);
fs.writeFileSync('src/components/FontManager.tsx', fontManager);

console.log("Patched FontFace adds");
