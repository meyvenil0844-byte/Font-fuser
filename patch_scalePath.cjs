const fs = require('fs');
let code = fs.readFileSync('fuseWorker.cjs', 'utf8');

const target = `path: scalePath(sourceGlyph.path, scale, isCFF)`;
const replacement = `path: scale === 1 ? sourceGlyph.path : scalePath(sourceGlyph.path, scale, isCFF)`;

if(code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync('fuseWorker.cjs', code);
  console.log('Patched scalePath');
} else {
  console.log('Target not found');
}
