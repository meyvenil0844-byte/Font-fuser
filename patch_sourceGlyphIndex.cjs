const fs = require('fs');
let code = fs.readFileSync('fuseWorker.cjs', 'utf8');

const target = `    // Explicitly handle .notdef (FFFD)
    if ((!sourceGlyphIndex || sourceGlyphIndex <= 0) && cp === 0xFFFD) {
       sourceGlyphIndex = 0; 
    }

    if (sourceGlyphIndex === undefined || sourceGlyphIndex < 0) {
        missingCount++; continue; 
    }`;

const replacement = `    let isSourceValid = false;
    if (sourceGlyphIndex > 0) {
        isSourceValid = true;
    } else if (sourceGlyphIndex === 0 && (cp === 0xFFFD || cp === 0)) {
        isSourceValid = true;
    }
    
    if (!isSourceValid) {
        missingCount++; continue; 
    }`;

if(code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync('fuseWorker.cjs', code);
  console.log('Patched sourceGlyphIndex logic');
} else {
  console.log('Target not found');
}
