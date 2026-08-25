const fs = require('fs');
let content = fs.readFileSync('src/lib/unicodeBlocks.ts', 'utf8');

// Replace wrong Saurashtra with Sora Sompeng
content = content.replace("{ name: 'Saurashtra', start: 0x110D0, end: 0x110FF },", "{ name: 'Sora Sompeng', start: 0x110D0, end: 0x110FF },");

// Add Latin Extended-C and Latin Extended-D if needed.
const extraBlocks = [
  "  { name: 'Latin Extended-C', start: 0x2C60, end: 0x2C7F },",
  "  { name: 'Latin Extended-D', start: 0xA720, end: 0xA7FF },"
].join('\n');

content = content.replace('];', extraBlocks + '\n];');
fs.writeFileSync('src/lib/unicodeBlocks.ts', content);
