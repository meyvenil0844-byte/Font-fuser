const fs = require('fs');
let code = fs.readFileSync('src/components/UnicodeExplorer.tsx', 'utf8');

const effectTarget = `  // When block changes, clear selection
  useEffect(() => {
    setSelectedCharacters(new Set());
  }, [selectedBlockIndex, setSelectedCharacters]);`;

const effectReplacement = `  // When block changes, clear selection
  useEffect(() => {
    setSelectedCharacters(new Set());
  }, [selectedBlockIndex, setSelectedCharacters]);

  // Autoscroll to exact codepoint
  useEffect(() => {
    const query = glyphSearchQuery.trim().toLowerCase();
    if (!query) return;

    const exactHexMatch = query.match(/^(u\\+?|0x|\\\\u)0*([0-9a-f]+)$/i) || 
                          (query.length >= 4 && query.match(/^0*([0-9a-f]{2,6})$/i));
                          
    if (exactHexMatch) {
        const hexStr = exactHexMatch.length === 3 ? exactHexMatch[2] : exactHexMatch[1];
        const searchCp = parseInt(hexStr, 16);
        
        if (!isNaN(searchCp) && searchCp >= 0 && searchCp <= 0x10FFFF) {
            // First, ensure we are in the right block
            const targetBlockIndex = UNICODE_BLOCKS.findIndex(b => searchCp >= b.start && searchCp <= b.end);
            if (targetBlockIndex !== -1 && targetBlockIndex !== selectedBlockIndex) {
                setSelectedBlockIndex(targetBlockIndex);
                return; // Wait for next render to get updated characters array
            }
            
            // We are in the right block. Find the character's index in the grid.
            const idx = characters.indexOf(searchCp);
            if (idx !== -1 && virtuosoRef.current) {
                // Highlight it by selecting it
                setSelectedCharacters(new Set([searchCp]));
                
                // Scroll to it!
                virtuosoRef.current.scrollToIndex({ index: idx, align: 'center', behavior: 'smooth' });
            }
        }
    }
  }, [glyphSearchQuery, characters, selectedBlockIndex, setSelectedBlockIndex]);`;

code = code.replace(effectTarget, effectReplacement);
fs.writeFileSync('src/components/UnicodeExplorer.tsx', code);
console.log("Patched autoscroll effect!");
