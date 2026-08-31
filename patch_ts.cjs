const fs = require('fs');
let code = fs.readFileSync('src/components/UnicodeExplorer.tsx', 'utf8');
code = code.replace("const chars = Array.from(searchQuery);", "const chars = Array.from(searchQuery as string);");
fs.writeFileSync('src/components/UnicodeExplorer.tsx', code);
