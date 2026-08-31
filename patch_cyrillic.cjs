const fs = require('fs');
let code = fs.readFileSync('src/lib/unicodeBlocks.ts', 'utf8');

const target = "  { name: 'Cyrillic Extended-C', start: 0x1C80, end: 0x1C8F },";
const replacement = "  { name: 'Cyrillic Extended-C', start: 0x1C80, end: 0x1C8F },\n  { name: 'Cyrillic Extended-D', start: 0x1E030, end: 0x1E08F },";

if (code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync('src/lib/unicodeBlocks.ts', code);
  console.log("Patched unicodeBlocks.ts");
} else {
  console.log("Target not found");
}
