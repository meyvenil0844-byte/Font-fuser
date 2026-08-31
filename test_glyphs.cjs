const fs = require('fs');
const code = fs.readFileSync('src/components/UnicodeExplorer.tsx', 'utf8');
console.log("Characters useMemo length:", code.split('characters = useMemo')[1].substring(0, 1500).split('}')[0]);
