const fs = require('fs');
let content = fs.readFileSync('src/lib/unicodeBlocks.ts', 'utf8');

const copticBlock = "  { name: 'Coptic', start: 0x2C80, end: 0x2CFF },";
content = content.replace('];', copticBlock + '\n];');

fs.writeFileSync('src/lib/unicodeBlocks.ts', content);
