const fs = require('fs');
let content = fs.readFileSync('src/lib/unicodeBlocks.ts', 'utf8');

content = content.replace("end: 0xABFF }\n  { name: 'Latin Extended-C'", "end: 0xABFF },\n  { name: 'Latin Extended-C'");

fs.writeFileSync('src/lib/unicodeBlocks.ts', content);
