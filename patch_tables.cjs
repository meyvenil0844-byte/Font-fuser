const fs = require('fs');
let code = fs.readFileSync('fuseWorker.cjs', 'utf8');

const targetDelete = `  // SECURE MATH: Explicitly strip math/opentype specific tables to prevent injection or corruption
  if (baseFontParsed.tables) {
      delete baseFontParsed.tables.math;
      delete baseFontParsed.tables.MATH;
      delete baseFontParsed.tables.GSUB;
      delete baseFontParsed.tables.GPOS;
      delete baseFontParsed.tables.BASE;
      delete baseFontParsed.tables.JSTF;
  }`;

code = code.replace(targetDelete, "");

fs.writeFileSync('fuseWorker.cjs', code);
console.log("Patched tables deletion!");
