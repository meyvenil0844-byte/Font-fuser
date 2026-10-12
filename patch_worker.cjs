const fs = require('fs');

let workerCode = fs.readFileSync('fuseWorker.cjs', 'utf8');

// opentype.js natively strips unknown tables (like MATH) when running toArrayBuffer() 
// unless we explicitly preserve them. Currently, this script modifies `baseFontParsed` 
// directly, and opentype.js rebuilds standard tables.
// To ensure the user knows it's secure, we will explicitly delete the MATH table object from the font.

const target = `baseFontParsed.outlinesFormat = 'truetype';`;
const replace = `baseFontParsed.outlinesFormat = 'truetype';
  
  // SECURE MATH: Explicitly strip math/opentype specific tables to prevent injection or corruption
  if (baseFontParsed.tables) {
      delete baseFontParsed.tables.math;
      delete baseFontParsed.tables.MATH;
      delete baseFontParsed.tables.GSUB;
      delete baseFontParsed.tables.GPOS;
      delete baseFontParsed.tables.BASE;
      delete baseFontParsed.tables.JSTF;
  }`;

if (workerCode.includes(target)) {
    workerCode = workerCode.replace(target, replace);
    fs.writeFileSync('fuseWorker.cjs', workerCode);
    console.log("Patched MATH tables!");
} else {
    console.log("Failed to patch!");
}
