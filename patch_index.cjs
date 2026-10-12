const fs = require('fs');
let code = fs.readFileSync('fuseWorker.cjs', 'utf8');

const targetNewGlyph = `    const newGlyph = new opentype.Glyph({
      name: cp === 0 ? '.null' : (sourceGlyph.name || \`uni\${cp.toString(16).toUpperCase()}\`),
      unicode: cp,
      advanceWidth: Math.round((sourceGlyph.advanceWidth || 0) * scale),
      path: scalePath(sourceGlyph.path, scale, isCFF)
    });`;

const replaceNewGlyph = `    const newGlyph = new opentype.Glyph({
      name: cp === 0 ? '.null' : (sourceGlyph.name || \`uni\${cp.toString(16).toUpperCase()}\`),
      unicode: cp,
      advanceWidth: Math.round((sourceGlyph.advanceWidth || 0) * scale),
      path: scalePath(sourceGlyph.path, scale, isCFF)
    });`;

// Wait, I can't just patch newGlyph creation because the index depends on whether we replace or append!

const targetReplace1 = `      if (onlyUsedByCp || baseGlyphIndex === 0) {
        baseFontParsed.glyphs.glyphs[baseGlyphIndex] = newGlyph;`;
const replaceReplace1 = `      if (onlyUsedByCp || baseGlyphIndex === 0) {
        newGlyph.index = baseGlyphIndex;
        baseFontParsed.glyphs.glyphs[baseGlyphIndex] = newGlyph;`;

const targetAppend1 = `        if (baseFontParsed.glyphs.length < 65535) {
          baseFontParsed.glyphs.glyphs[baseFontParsed.glyphs.length] = newGlyph;
          baseFontParsed.glyphs.length++;`;
const replaceAppend1 = `        if (baseFontParsed.glyphs.length < 65535) {
          newGlyph.index = baseFontParsed.glyphs.length;
          baseFontParsed.glyphs.glyphs[baseFontParsed.glyphs.length] = newGlyph;
          baseFontParsed.glyphs.length++;`;

const targetAppend2 = `      if (baseFontParsed.glyphs.length < 65535) {
        baseFontParsed.glyphs.glyphs[baseFontParsed.glyphs.length] = newGlyph;
        baseFontParsed.glyphs.length++;`;
const replaceAppend2 = `      if (baseFontParsed.glyphs.length < 65535) {
        newGlyph.index = baseFontParsed.glyphs.length;
        baseFontParsed.glyphs.glyphs[baseFontParsed.glyphs.length] = newGlyph;
        baseFontParsed.glyphs.length++;`;

code = code.replace(targetReplace1, replaceReplace1);
code = code.replace(targetAppend1, replaceAppend1);
code = code.replace(targetAppend2, replaceAppend2);

fs.writeFileSync('fuseWorker.cjs', code);
console.log("Patched indices!");
