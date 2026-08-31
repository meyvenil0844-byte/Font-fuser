const fs = require('fs');
let code = fs.readFileSync('src/components/UnicodeExplorer.tsx', 'utf8');

const targetMemo = `  const characters = useMemo(() => {
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

const replacementMemo = `  const characters = useMemo(() => {
    const chars = [];
    const query = glyphSearchQuery.trim().toLowerCase();
    
    const isForgottenBlock = block.name === 'Forgotten Characters';
    
    // Explicit list of tricky/forgotten/meta codepoints that font devs care about
    const forgottenList = [
      0x0000, // NULL
      0x0009, // Tab
      0x000A, // LF
      0x000D, // CR
      0x0020, // Space
      0x00A0, // NBSP
      0x00AD, // Soft Hyphen
      0x200B, // ZWSP
      0x200C, // ZWNJ
      0x200D, // ZWJ
      0x2028, // Line Separator
      0x2029, // Paragraph Separator
      0x2060, // Word Joiner
      0xFEFF, // ZWNBSP / BOM
      0xFFFD, // Replacement Character (.notdef fallback)
    ];

    if (isForgottenBlock) {
      for (const cp of forgottenList) {
        if (query) {
          const hex = cp.toString(16).toUpperCase().padStart(4, '0');
          if (!hex.toLowerCase().includes(query)) continue;
        }
        chars.push(cp);
      }
      return chars;
    }

    const start = block.start;
    const end = block.end;

    for (let cp = start; cp <= end; cp++) {
      const charStr = safeStringFromCodePoint(cp);
      let isMissing = false;
      
      const mappedId = glyphMap[cp];
      const displayFont = mappedId ? fonts.find(f => f.id === mappedId) : baseFont;

      if (!charStr) {
         isMissing = true; // Surrogate or unrenderable
      } else {
         if (displayFont && displayFont.parsed) {
            const glyphIndex = displayFont.parsed.charToGlyphIndex(charStr);
            if (glyphIndex === 0) {
               isMissing = true; // .notdef
            }
         } else {
            isMissing = true; // No font or no glyphs
         }
      }

      if (!charStr) continue; // Standard blocks skip unrenderables natively
      if (!showEmpty && isMissing) continue; // Standard blocks hide empty if toggled off

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

code = code.replace(targetMemo, replacementMemo);

// Let's also update the label rendering so the user knows what these are
const spanTarget = `<span className={cn(
                    "text-[9px] font-mono mt-1",
                    isMapped ? "text-blue-400/70" : "text-gray-600"
                  )}>
                    U+{cp.toString(16).toUpperCase().padStart(4, '0')}
                  </span>`;

const spanReplacement = `<span className={cn(
                    "text-[9px] font-mono mt-1",
                    isMapped ? "text-blue-400/70" : "text-gray-600"
                  )}>
                    U+{cp.toString(16).toUpperCase().padStart(4, '0')}
                    {block.name === 'Forgotten Characters' && (
                      <span className="block text-[8px] text-gray-500 text-center uppercase tracking-tighter overflow-hidden text-ellipsis whitespace-nowrap w-full">
                        {cp === 0x0000 ? 'NULL' : 
                         cp === 0x0009 ? 'TAB' :
                         cp === 0x000A ? 'LF' :
                         cp === 0x000D ? 'CR' :
                         cp === 0x0020 ? 'SPACE' :
                         cp === 0x00A0 ? 'NBSP' :
                         cp === 0x00AD ? 'SHY' :
                         cp === 0x200B ? 'ZWSP' :
                         cp === 0x200C ? 'ZWNJ' :
                         cp === 0x200D ? 'ZWJ' :
                         cp === 0x2028 ? 'LSEP' :
                         cp === 0x2029 ? 'PSEP' :
                         cp === 0x2060 ? 'WJ' :
                         cp === 0xFEFF ? 'BOM' :
                         cp === 0xFFFD ? '.NOTDEF / FFFD' : ''}
                      </span>
                    )}
                  </span>`;

code = code.replace(spanTarget, spanReplacement);

// Fix the character rendering for these specials so they have some visual footprint if they are invisible
const charTarget = `<span 
                    className="text-2xl flex items-center justify-center" 
                    style={{ 
                      fontFamily: displayFont?.fontFamilyName || 'inherit',
                      color: isMapped ? '#e5e5e5' : '#888'
                    }}
                  >
                    {safeStringFromCodePoint(cp) || ((block.name === 'Forgotten Characters') ? <span className="text-[10px] font-mono border border-dashed border-gray-600 px-1 text-gray-500">.notdef</span> : '')}
                  </span>`;

const charReplacement = `<span 
                    className="text-2xl flex items-center justify-center" 
                    style={{ 
                      fontFamily: displayFont?.fontFamilyName || 'inherit',
                      color: isMapped ? '#e5e5e5' : '#888'
                    }}
                  >
                    {(block.name === 'Forgotten Characters' && cp !== 0xFFFD && cp !== 0x0020) ? (
                       <span className="text-[10px] font-mono border border-dashed border-gray-600 px-1 text-gray-500 opacity-50">
                         {safeStringFromCodePoint(cp)}
                       </span>
                    ) : safeStringFromCodePoint(cp) || <span className="text-[10px] font-mono border border-dashed border-gray-600 px-1 text-gray-500">.notdef</span>}
                  </span>`;

code = code.replace(charTarget, charReplacement);

fs.writeFileSync('src/components/UnicodeExplorer.tsx', code);
console.log('Patched');
