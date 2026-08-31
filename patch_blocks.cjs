const fs = require('fs');
let code = fs.readFileSync('src/lib/unicodeBlocks.ts', 'utf8');

const target = "  { name: 'Supplementary Private Use Area-B', start: 0x100000, end: 0x10FFFF },";
const replacement = "  { name: 'Forgotten Characters', start: -1, end: -1 },\n" + target;

code = code.replace(target, replacement);

fs.writeFileSync('src/lib/unicodeBlocks.ts', code);
