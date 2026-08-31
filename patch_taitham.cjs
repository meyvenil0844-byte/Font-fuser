const fs = require('fs');
let code = fs.readFileSync('src/lib/unicodeBlocks.ts', 'utf8');

const target = "  { name: 'Buginese', start: 0x1A00, end: 0x1A1F },";
const replacement = "  { name: 'Buginese', start: 0x1A00, end: 0x1A1F },\n  { name: 'Tai Tham', start: 0x1A20, end: 0x1AAF },";

if (code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync('src/lib/unicodeBlocks.ts', code);
  console.log("Patched unicodeBlocks.ts");
} else {
  console.log("Target not found");
}
