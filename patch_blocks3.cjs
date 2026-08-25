const fs = require('fs');
let content = fs.readFileSync('src/lib/unicodeBlocks.ts', 'utf8');

const extraBlocks = [
  "  { name: 'Sunuwar', start: 0x11BC0, end: 0x11BFF },",
  "  { name: 'Tolong Siki', start: 0x11D60, end: 0x11DAF },",
  "  { name: 'Makasar', start: 0x11EE0, end: 0x11EFF },",
  "  { name: 'Kawi', start: 0x11F00, end: 0x11F5F },",
  "  { name: 'Cypro-Minoan', start: 0x12F90, end: 0x12FFF },",
  "  { name: 'Gurung Khema', start: 0x16100, end: 0x1613F },"
].join('\n');

content = content.replace('];', extraBlocks + '\n];');
fs.writeFileSync('src/lib/unicodeBlocks.ts', content);
