const fs = require('fs');

let code = fs.readFileSync('src/components/UnicodeExplorer.tsx', 'utf8');

const target = `      if (query) {
         let match = false;
         if (displayFont && displayFont.parsed && charStr) {
             const glyphIndex = displayFont.parsed.charToGlyphIndex(charStr);
             const glyph = displayFont.parsed.glyphs.get(glyphIndex);
             if (glyph && glyph.name && glyph.name.toLowerCase().includes(query)) {
                 match = true;
             }
         }
         const hex = cp.toString(16).toUpperCase().padStart(4, '0');
         if (hex.toLowerCase().includes(query)) match = true;
         if (charStr && charStr.toLowerCase() === query) match = true;
         
         // Also match formats like "U+0041" or "0x0041" in the bottom filter box
         let cleanQuery = query.replace(/^(u\\+?|0x|\\\\u)/i, '').trim();
         if (cleanQuery && hex.toLowerCase().includes(cleanQuery)) match = true;
         
         if (!match) continue;
      }`;

const replace = `      if (query) {
         let match = false;
         
         // 1. Exact Codepoint Match (e.g., "u+0041", "0x41", "41")
         // This ensures that typing an exact codepoint finds it immediately without garbage substring matches if prefixed.
         const exactHexMatch = query.match(/^(u\\+?|0x|\\\\u)?0*([0-9a-f]+)$/i);
         if (exactHexMatch) {
             const searchCp = parseInt(exactHexMatch[2], 16);
             if (searchCp === cp) match = true;
         }
         
         // 2. Exact Literal Character Match (e.g., typing "A" or "!")
         if (!match && charStr && charStr.toLowerCase() === query) {
             match = true;
         }
         
         // 3. Glyph Name Match (e.g., "arrow", "face")
         if (!match && displayFont && displayFont.parsed && charStr) {
             const glyphIndex = displayFont.parsed.charToGlyphIndex(charStr);
             const glyph = displayFont.parsed.glyphs.get(glyphIndex);
             if (glyph && glyph.name && glyph.name.toLowerCase().includes(query)) {
                 match = true;
             }
         }
         
         // 4. Substring Hex Match ONLY if they didn't use a prefix, and it's >= 2 chars long.
         // This prevents typing "a" from matching 0x00A0 just because it contains "a".
         if (!match && query.length >= 2 && /^[0-9a-f]+$/i.test(query)) {
             const hex = cp.toString(16).toUpperCase().padStart(4, '0');
             if (hex.toLowerCase().includes(query)) match = true;
         }
         
         if (!match) continue;
      }`;

if (code.includes(target)) {
    code = code.replace(target, replace);
    fs.writeFileSync('src/components/UnicodeExplorer.tsx', code);
    console.log("Patched exact search!");
} else {
    console.log("Failed to patch exact search!");
}
