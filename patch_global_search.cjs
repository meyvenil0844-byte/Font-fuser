const fs = require('fs');

let code = fs.readFileSync('src/components/UnicodeExplorer.tsx', 'utf8');

const target = `  // Generate characters for current block
  const characters = useMemo(() => {
    const chars = [];
    const query = glyphSearchQuery.trim().toLowerCase();
    
    const isForgottenBlock = block.name === 'Forgotten Characters';`;

const replace = `  // Generate characters for current block
  const characters = useMemo(() => {
    const chars = [];
    const query = glyphSearchQuery.trim().toLowerCase();
    
    // =================================================================
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
    }

    const isForgottenBlock = block.name === 'Forgotten Characters';`;

if (code.includes(target)) {
    code = code.replace(target, replace);
    fs.writeFileSync('src/components/UnicodeExplorer.tsx', code);
    console.log("Patched global override!");
} else {
    console.log("Failed to patch global override!");
}
