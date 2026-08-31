const fs = require('fs');
let code = fs.readFileSync('fuseWorker.cjs', 'utf8');

const target = `    if (baseGlyphIndex >= 0) {
      baseFontParsed.glyphs.get(baseGlyphIndex); // cache it
      const oldGlyph = baseFontParsed.glyphs.glyphs[baseGlyphIndex];
      let onlyUsedByCp = false;
      if (!oldGlyph.unicodes || oldGlyph.unicodes.length <= 1) onlyUsedByCp = true;
      
      if (onlyUsedByCp || baseGlyphIndex === 0) {
        baseFontParsed.glyphs.glyphs[baseGlyphIndex] = newGlyph;
      } else {
        oldGlyph.unicodes = oldGlyph.unicodes.filter((u) => u !== cp);
        if (oldGlyph.unicode === cp) {
          oldGlyph.unicode = oldGlyph.unicodes && oldGlyph.unicodes.length > 0 ? oldGlyph.unicodes[0] : undefined;
        }
        if (baseFontParsed.glyphs.length < 65535) {
          baseFontParsed.glyphs.glyphs[baseFontParsed.glyphs.length] = newGlyph;
          baseFontParsed.glyphs.length++;
        } else {
          hitLimit = true;
        }
      }
    } else {
      if (baseFontParsed.glyphs.length < 65535) {
        baseFontParsed.glyphs.glyphs[baseFontParsed.glyphs.length] = newGlyph;
        baseFontParsed.glyphs.length++;
      } else {
        hitLimit = true;
      }
    }`;

const replacement = `    let replaceExisting = false;
    if (baseGlyphIndex > 0) {
        replaceExisting = true;
    } else if (baseGlyphIndex === 0 && (cp === 0xFFFD || cp === 0)) {
        replaceExisting = true;
    }

    if (replaceExisting) {
      baseFontParsed.glyphs.get(baseGlyphIndex); // cache it
      const oldGlyph = baseFontParsed.glyphs.glyphs[baseGlyphIndex];
      let onlyUsedByCp = false;
      if (oldGlyph && (!oldGlyph.unicodes || oldGlyph.unicodes.length <= 1)) onlyUsedByCp = true;
      
      if (onlyUsedByCp || baseGlyphIndex === 0) {
        baseFontParsed.glyphs.glyphs[baseGlyphIndex] = newGlyph;
      } else {
        oldGlyph.unicodes = oldGlyph.unicodes.filter((u) => u !== cp);
        if (oldGlyph.unicode === cp) {
          oldGlyph.unicode = oldGlyph.unicodes && oldGlyph.unicodes.length > 0 ? oldGlyph.unicodes[0] : undefined;
        }
        if (baseFontParsed.glyphs.length < 65535) {
          baseFontParsed.glyphs.glyphs[baseFontParsed.glyphs.length] = newGlyph;
          baseFontParsed.glyphs.length++;
        } else {
          hitLimit = true;
        }
      }
    } else {
      if (baseFontParsed.glyphs.length < 65535) {
        baseFontParsed.glyphs.glyphs[baseFontParsed.glyphs.length] = newGlyph;
        baseFontParsed.glyphs.length++;
      } else {
        hitLimit = true;
      }
    }`;

if(code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync('fuseWorker.cjs', code);
  console.log('Patched baseGlyphIndex logic');
} else {
  console.log('Target not found');
}
