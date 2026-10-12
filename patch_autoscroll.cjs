const fs = require('fs');
let code = fs.readFileSync('src/components/UnicodeExplorer.tsx', 'utf8');

// 1. Add VirtuosoGridHandle import
code = code.replace(
  "import { VirtuosoGrid } from 'react-virtuoso';",
  "import { VirtuosoGrid, VirtuosoGridHandle } from 'react-virtuoso';"
);

// 2. Add ref to component
code = code.replace(
  "const [glyphSearchQuery, setGlyphSearchQuery] = useState('');",
  "const [glyphSearchQuery, setGlyphSearchQuery] = useState('');\n  const virtuosoRef = useRef<VirtuosoGridHandle>(null);"
);

// 3. Add ref to VirtuosoGrid
code = code.replace(
  "<VirtuosoGrid\n            style={{ height: '100%' }}",
  "<VirtuosoGrid\n            ref={virtuosoRef}\n            style={{ height: '100%' }}"
);

// 4. Change characters useMemo to NOT filter for exact codepoints, but let an effect handle it
const targetMemoStart = `    // =================================================================
    // GLOBAL EXACT CODEPOINT OVERRIDE
    // If the user types an exact codepoint (e.g. U+0041, 0x41) into the bottom filter,
    // we bypass the current block completely and just return that specific character!
    // =================================================================
    if (query) {
       // Match strict prefixes (u+0041, 0x41, \\u0041) OR exactly 4-6 hex digits without prefix (0041)
       const exactHexMatch = query.match(/^(u\\+?|0x|\\\\u)0*([0-9a-f]+)$/i) || 
                             (query.length >= 4 && query.match(/^0*([0-9a-f]{2,6})$/i));
       
       if (exactHexMatch) {
           // exactHexMatch[1] is the prefix if it exists, or the hex if it was the second pattern
           const hexStr = exactHexMatch.length === 3 ? exactHexMatch[2] : exactHexMatch[1];
           const searchCp = parseInt(hexStr, 16);
           if (!isNaN(searchCp) && searchCp >= 0 && searchCp <= 0x10FFFF) {
               return [searchCp];
           }
       }
       
       // Single literal character global override (e.g., typing "A" returns U+0041 immediately)
       // Only if they typed exactly 1 character that is NOT a common letter (to prevent "a" from hijacking search)
       // Actually, let's keep literal search block-scoped for now to avoid confusion when typing names like "arrow".
    }`;

code = code.replace(targetMemoStart, '');

// Also remove exact codepoint filter from the lower loop so it doesn't hide others
const targetExactMatch = `         // 1. Exact Codepoint Match (e.g., "u+0041", "0x41", "41")
         // This ensures that typing an exact codepoint finds it immediately without garbage substring matches if prefixed.
         const exactHexMatch = query.match(/^(u\\+?|0x|\\\\u)?0*([0-9a-f]+)$/i);
         if (exactHexMatch) {
             const searchCp = parseInt(exactHexMatch[2], 16);
             if (searchCp === cp) match = true;
         }`;

code = code.replace(targetExactMatch, `         // Removed exact match filtering to allow autoscrolling instead`);

fs.writeFileSync('src/components/UnicodeExplorer.tsx', code);
console.log("Patched grid ref and removed filtering!");
