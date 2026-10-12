const fs = require('fs');
let code = fs.readFileSync('src/components/UnicodeExplorer.tsx', 'utf8');

const targetScroll = `            if (idx !== -1 && virtuosoRef.current) {
                // Highlight it by selecting it
                setSelectedCharacters(new Set([searchCp]));
                
                // Scroll to it!
                virtuosoRef.current.scrollToIndex({ index: idx, align: 'center', behavior: 'smooth' });
            }`;

const replaceScroll = `            if (idx !== -1 && virtuosoRef.current) {
                // Highlight it by selecting it
                setSelectedCharacters(new Set([searchCp]));
                
                // Scroll to it! Use timeout to ensure grid has rendered the new layout if we just switched blocks
                setTimeout(() => {
                   virtuosoRef.current?.scrollToIndex({ index: idx, align: 'center', behavior: 'smooth' });
                }, 100);
            }`;

if (code.includes(targetScroll)) {
    code = code.replace(targetScroll, replaceScroll);
    fs.writeFileSync('src/components/UnicodeExplorer.tsx', code);
    console.log("Patched scroll timeout!");
} else {
    console.log("Failed to patch scroll timeout!");
}
