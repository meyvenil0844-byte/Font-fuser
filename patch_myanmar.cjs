const fs = require('fs');
let code = fs.readFileSync('src/lib/unicodeBlocks.ts', 'utf8');

const target = "  { name: 'Myanmar Extended-A', start: 0xAA60, end: 0xAA7F },";
const replacement = "  { name: 'Myanmar Extended-A', start: 0xAA60, end: 0xAA7F },\n  { name: 'Myanmar Extended-C', start: 0x116D0, end: 0x116FF },";

if (code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync('src/lib/unicodeBlocks.ts', code);
  console.log("Patched unicodeBlocks.ts");
} else {
  console.log("Target not found");
}
