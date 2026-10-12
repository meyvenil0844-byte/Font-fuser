const fs = require('fs');
let code = fs.readFileSync('src/components/UnicodeExplorer.tsx', 'utf8');

const targetLoop = `            if (targetBlockIndex !== -1 && targetBlockIndex !== selectedBlockIndex) {
                setSelectedBlockIndex(targetBlockIndex);
                return; // Wait for next render to get updated characters array
            }`;

const replaceLoop = `            if (targetBlockIndex !== -1 && targetBlockIndex !== selectedBlockIndex) {
                setSearchQuery(''); // Clear block filter so it doesn't fight the block change!
                setSelectedBlockIndex(targetBlockIndex);
                return; // Wait for next render to get updated characters array
            }`;

if (code.includes(targetLoop)) {
    code = code.replace(targetLoop, replaceLoop);
    fs.writeFileSync('src/components/UnicodeExplorer.tsx', code);
    console.log("Patched block conflict loop!");
} else {
    console.log("Failed to patch loop!");
}
