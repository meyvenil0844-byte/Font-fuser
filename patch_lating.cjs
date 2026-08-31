const fs = require('fs');
let code = fs.readFileSync('src/lib/unicodeBlocks.ts', 'utf8');

const target = "  { name: 'Sutton SignWriting', start: 0x1D800, end: 0x1DAAF },";
const replacement = "  { name: 'Sutton SignWriting', start: 0x1D800, end: 0x1DAAF },\n  { name: 'Latin Extended-G', start: 0x1DF00, end: 0x1DFFF },";

if (code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync('src/lib/unicodeBlocks.ts', code);
  console.log("Patched unicodeBlocks.ts");
} else {
  console.log("Target not found");
}
