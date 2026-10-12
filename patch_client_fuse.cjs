const fs = require('fs');
let fuseCode = fs.readFileSync('src/lib/fuse.ts', 'utf8');

const target = `const newFont = new opentype.Font({
        familyName: "FusedFont",
        styleName: 'Regular',
        unitsPerEm: baseFont.unitsPerEm,
        ascender: baseFont.ascender,
        descender: baseFont.descender,
        glyphs: newGlyphs
      });`;
      
const replace = `const newFont = new opentype.Font({
        familyName: "FusedFont",
        styleName: 'Regular',
        unitsPerEm: baseFont.unitsPerEm,
        ascender: baseFont.ascender,
        descender: baseFont.descender,
        glyphs: newGlyphs
      });
      
      // SECURE MATH: Explicitly strip advanced math/layout tables to prevent corruption
      if ((newFont as any).tables) {
          delete (newFont as any).tables.math;
          delete (newFont as any).tables.MATH;
          delete (newFont as any).tables.GSUB;
          delete (newFont as any).tables.GPOS;
          delete (newFont as any).tables.BASE;
          delete (newFont as any).tables.JSTF;
      }`;

if (fuseCode.includes(target)) {
    fuseCode = fuseCode.replace(target, replace);
    fs.writeFileSync('src/lib/fuse.ts', fuseCode);
    console.log("Patched client fuse MATH!");
} else {
    console.log("Failed to patch client fuse!");
}
