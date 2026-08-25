const fs = require('fs');
let content = fs.readFileSync('src/lib/unicodeBlocks.ts', 'utf8');

const arabicBlocks = [
  "  { name: 'Arabic Supplement', start: 0x0750, end: 0x077F },",
  "  { name: 'Arabic Extended-A', start: 0x08A0, end: 0x08FF },",
  "  { name: 'Arabic Extended-B', start: 0x0870, end: 0x089F },",
  "  { name: 'Arabic Extended-C', start: 0x10EC0, end: 0x10EFF },"
].join('\n');

content = content.replace('];', arabicBlocks + '\n];');
fs.writeFileSync('src/lib/unicodeBlocks.ts', content);
