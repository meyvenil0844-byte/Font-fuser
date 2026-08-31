const fs = require('fs');
let code = fs.readFileSync('src/lib/unicodeBlocks.ts', 'utf8');

const target1 = "  { name: 'CJK Unified Ideographs Extension F', start: 0x2CEB0, end: 0x2EBEF },";
const replacement1 = "  { name: 'CJK Unified Ideographs Extension F', start: 0x2CEB0, end: 0x2EBEF },\n  { name: 'CJK Unified Ideographs Extension I', start: 0x2EBF0, end: 0x2EE5F },";

if (code.includes(target1)) {
  code = code.replace(target1, replacement1);
} else {
  console.log("Target 1 not found");
}

const target2 = "  { name: 'CJK Unified Ideographs Extension H', start: 0x31350, end: 0x323AF },";
const replacement2 = "  { name: 'CJK Unified Ideographs Extension H', start: 0x31350, end: 0x323AF },\n  { name: 'CJK Unified Ideographs Extension J', start: 0x323B0, end: 0x3347F },";

if (code.includes(target2)) {
  code = code.replace(target2, replacement2);
} else {
  console.log("Target 2 not found");
}

fs.writeFileSync('src/lib/unicodeBlocks.ts', code);
console.log("Patched unicodeBlocks.ts");
