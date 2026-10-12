const fs = require('fs');
let code = fs.readFileSync('src/components/UnicodeExplorer.tsx', 'utf8');

const targetMemoStart = `  // Generate characters for current block
  const characters = useMemo(() => {
    const chars = [];
    const query = glyphSearchQuery.trim().toLowerCase();
    
    const isForgottenBlock = block.name === 'Forgotten Characters';`;

const replaceMemoStart = `  // Generate characters for current block
  const characters = useMemo(() => {
    const chars = [];
    const query = glyphSearchQuery.trim().toLowerCase();
    
    let exactSearchCp = -1;
    if (query) {
       const exactHexMatch = query.match(/^(u\\+?|0x|\\\\u)0*([0-9a-f]+)$/i) || 
                             (query.length >= 4 && query.match(/^0*([0-9a-f]{2,6})$/i));
       if (exactHexMatch) {
           const hexStr = exactHexMatch.length === 3 ? exactHexMatch[2] : exactHexMatch[1];
           exactSearchCp = parseInt(hexStr, 16);
       }
    }
    
    const isForgottenBlock = block.name === 'Forgotten Characters';`;

code = code.replace(targetMemoStart, replaceMemoStart);

const targetLoopChecks = `      if (!charStr) continue; // Standard blocks skip unrenderables natively
      if (!showEmpty && isMissing) continue; // Standard blocks hide empty if toggled off
      
      if (query) {
         let match = false;
         
         // Removed exact match filtering to allow autoscrolling instead`;

const replaceLoopChecks = `      const isExactTarget = (cp === exactSearchCp);
      
      if (!charStr && !isExactTarget) continue; // Standard blocks skip unrenderables natively unless it's explicitly searched
      if (!showEmpty && isMissing && !isExactTarget) continue; // Standard blocks hide empty if toggled off unless it's explicitly searched
      
      if (query && !isExactTarget) { // if it IS the exact target, it automatically matches and we skip other filters
         let match = false;
         
         // Removed exact match filtering to allow autoscrolling instead`;

code = code.replace(targetLoopChecks, replaceLoopChecks);

fs.writeFileSync('src/components/UnicodeExplorer.tsx', code);
console.log("Patched characters memo to include exact target even if missing!");
