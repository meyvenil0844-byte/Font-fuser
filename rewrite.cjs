const fs = require('fs');
let code = fs.readFileSync('src/components/UnicodeExplorer.tsx', 'utf8');

// Remove the state variable
code = code.replace("  const [showForgottenCharacters, setShowForgottenCharacters] = useState(false);\n", "");

// Update the useMemo for characters
const charsTarget = `  const characters = useMemo(() => {
    const chars = [];
    const query = glyphSearchQuery.trim().toLowerCase();
    
    for (let cp = block.start; cp <= block.end; cp++) {
      const charStr = safeStringFromCodePoint(cp);
      if (!charStr && !showForgottenCharacters) continue; // Skip unrenderable (surrogates)

      const mappedId = glyphMap[cp];
      const displayFont = mappedId ? fonts.find(f => f.id === mappedId) : baseFont;

      if (!showEmpty) {
        if (!displayFont || !displayFont.parsed) continue;
        const glyphIndex = displayFont.parsed.charToGlyphIndex(charStr || String.fromCharCode(cp));
        if (glyphIndex === 0 && !showForgottenCharacters) continue; // .notdef
      }

      if (query) {
         let match = false;
         if (displayFont && displayFont.parsed) {
             const glyphIndex = displayFont.parsed.charToGlyphIndex(charStr);
             const glyph = displayFont.parsed.glyphs.get(glyphIndex);
             if (glyph && glyph.name && glyph.name.toLowerCase().includes(query)) {
                 match = true;
             }
         }
         const hex = cp.toString(16).toUpperCase().padStart(4, '0');
         if (hex.toLowerCase().includes(query)) match = true;
         if (charStr.toLowerCase() === query) match = true;
         
         if (!match) continue;
      }

      chars.push(cp);
    }
    return chars;
  }, [block, showEmpty, baseFont, glyphMap, fonts, glyphSearchQuery, showForgottenCharacters]);`;

const charsReplacement = `  const characters = useMemo(() => {
    const chars = [];
    const query = glyphSearchQuery.trim().toLowerCase();
    
    const isForgottenBlock = block.name === 'Forgotten Characters';
    const start = isForgottenBlock ? 0 : block.start;
    const end = isForgottenBlock ? 0x10FFFF : block.end;

    for (let cp = start; cp <= end; cp++) {
      const charStr = safeStringFromCodePoint(cp);
      let isForgotten = false;
      
      const mappedId = glyphMap[cp];
      const displayFont = mappedId ? fonts.find(f => f.id === mappedId) : baseFont;

      if (!charStr) {
         isForgotten = true; // Surrogate or unrenderable
      } else {
         if (displayFont && displayFont.parsed) {
            const glyphIndex = displayFont.parsed.charToGlyphIndex(charStr);
            if (glyphIndex === 0) {
               isForgotten = true; // .notdef
            }
         } else {
            isForgotten = true; // No font or no glyphs
         }
      }

      if (isForgottenBlock) {
         if (!isForgotten) continue; // Only show forgotten ones in this block
      } else {
         if (!charStr) continue; // Standard blocks skip unrenderables
         if (!showEmpty && isForgotten) continue; // Standard blocks hide empty if toggled off
      }

      if (query) {
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
         
         if (!match) continue;
      }

      chars.push(cp);
    }
    return chars;
  }, [block, showEmpty, baseFont, glyphMap, fonts, glyphSearchQuery]);`;

code = code.replace(charsTarget, charsReplacement);

// Update select to hide start/end for Forgotten block
const selectTarget = `{filteredBlocks.map((b) => (
              <option key={b.name} value={b.originalIndex}>{b.name} (U+{b.start.toString(16).toUpperCase()} - U+{b.end.toString(16).toUpperCase()})</option>
            ))}`;
const selectReplacement = `{filteredBlocks.map((b) => (
              <option key={b.name} value={b.originalIndex}>{b.name} {b.start >= 0 ? \`(U+\${b.start.toString(16).toUpperCase()} - U+\${b.end.toString(16).toUpperCase()})\` : ''}</option>
            ))}`;
code = code.replace(selectTarget, selectReplacement);

// Remove the forgotten characters UI toggle
const labelTarget = `            <label className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-widest text-gray-500 cursor-pointer select-none">
              <input 
                type="checkbox" 
                checked={showForgottenCharacters} 
                onChange={e => setShowForgottenCharacters(e.target.checked)}
                className="accent-blue-500 bg-[#1a1a1a] border-white/10 rounded"
              />
              Show Forgotten Characters
            </label>`;
code = code.replace(labelTarget, "");

// Fix the container flex row that had 2 labels now has 1
const labelsContainerTarget = `<div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mt-2">
            <label className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-widest text-gray-500 cursor-pointer select-none">
              <input 
                type="checkbox" 
                checked={showEmpty} 
                onChange={e => setShowEmpty(e.target.checked)}
                className="accent-blue-500 bg-[#1a1a1a] border-white/10 rounded"
              />
              Show Empty Glyphs
            </label>
            
          </div>`;
const labelsContainerReplacement = `<label className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-widest text-gray-500 cursor-pointer select-none mt-2">
            <input 
              type="checkbox" 
              checked={showEmpty} 
              onChange={e => setShowEmpty(e.target.checked)}
              className="accent-blue-500 bg-[#1a1a1a] border-white/10 rounded"
            />
            Show Empty Glyphs
          </label>`;

// It might not match exactly due to formatting, so let's use regex or split
code = code.replace(
  /<div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mt-2">\s*<label className="flex items-center gap-2 text-\[10px\] uppercase font-bold tracking-widest text-gray-500 cursor-pointer select-none">\s*<input\s*type="checkbox"\s*checked=\{showEmpty\}\s*onChange=\{e => setShowEmpty\(e\.target\.checked\)\}\s*className="accent-blue-500 bg-\[\#1a1a1a\] border-white\/10 rounded"\s*\/>\s*Show Empty Glyphs\s*<\/label>\s*<\/div>/g,
  labelsContainerReplacement
);

// Fix span rendering to use block.name instead of showForgottenCharacters
const spanTarget = `{safeStringFromCodePoint(cp) || (showForgottenCharacters ? <span className="text-[10px] font-mono border border-dashed border-gray-600 px-1 text-gray-500">.notdef</span> : '')}`;
const spanReplacement = `{safeStringFromCodePoint(cp) || ((block.name === 'Forgotten Characters') ? <span className="text-[10px] font-mono border border-dashed border-gray-600 px-1 text-gray-500">.notdef</span> : '')}`;
code = code.replace(spanTarget, spanReplacement);

fs.writeFileSync('src/components/UnicodeExplorer.tsx', code);
console.log('Done rewriting');
