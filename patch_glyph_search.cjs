const fs = require('fs');
let code = fs.readFileSync('src/components/UnicodeExplorer.tsx', 'utf8');

const charsUseMemoTarget = `  // Generate characters for current block
  const characters = useMemo(() => {
    const chars = [];
    for (let cp = block.start; cp <= block.end; cp++) {
      const charStr = safeStringFromCodePoint(cp);
      if (!charStr) continue; // Skip unrenderable (surrogates)

      if (!showEmpty && baseFont) {
        const mappedId = glyphMap[cp];
        const fontToCheck = null;
        
        if (fontToCheck) {
          const glyphIndex = fontToCheck.charToGlyphIndex(charStr);
          if (glyphIndex === 0) continue; // .notdef
        } else {
          continue;
        }
      }

      chars.push(cp);
    }
    return chars;
  }, [block, showEmpty, baseFont, glyphMap, fonts]);`;

const charsUseMemoReplacement = `  // Generate characters for current block
  const characters = useMemo(() => {
    const chars = [];
    const query = glyphSearchQuery.trim().toLowerCase();
    
    for (let cp = block.start; cp <= block.end; cp++) {
      const charStr = safeStringFromCodePoint(cp);
      if (!charStr) continue; // Skip unrenderable (surrogates)

      const mappedId = glyphMap[cp];
      const displayFont = mappedId ? fonts.find(f => f.id === mappedId) : baseFont;

      if (!showEmpty) {
        if (!displayFont || !displayFont.parsed) continue;
        const glyphIndex = displayFont.parsed.charToGlyphIndex(charStr);
        if (glyphIndex === 0) continue; // .notdef
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
  }, [block, showEmpty, baseFont, glyphMap, fonts, glyphSearchQuery]);`;

code = code.replace(charsUseMemoTarget, charsUseMemoReplacement);

const inputTarget = `            {filteredBlocks.length === 0 && (
              <option disabled value={-1}>No results found</option>
            )}
          </select>
          <label className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-widest text-gray-500 cursor-pointer select-none mt-2">`;

const inputReplacement = `            {filteredBlocks.length === 0 && (
              <option disabled value={-1}>No results found</option>
            )}
          </select>
          <div className="relative mt-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
            <input
              type="text"
              placeholder="Filter by glyph name (e.g. 'arrow', 'face')"
              value={glyphSearchQuery}
              onChange={e => setGlyphSearchQuery(e.target.value)}
              className="bg-[#1a1a1a] border border-white/10 text-xs py-1.5 pl-8 pr-2 rounded outline-none focus:border-blue-500 text-gray-200 w-full"
            />
          </div>
          <label className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-widest text-gray-500 cursor-pointer select-none mt-2">`;

code = code.replace(inputTarget, inputReplacement);

fs.writeFileSync('src/components/UnicodeExplorer.tsx', code);
console.log('Patched UnicodeExplorer.tsx');
