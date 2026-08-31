const opentype = require('opentype.js');
const font = new opentype.Font({
  familyName: "Test", styleName: "Regular", unitsPerEm: 1000, ascender: 800, descender: -200,
  glyphs: [
    new opentype.Glyph({ name: ".notdef", unicode: 0, advanceWidth: 500, path: new opentype.Path() }),
    new opentype.Glyph({ name: "A", unicode: 65, advanceWidth: 500, path: new opentype.Path() })
  ]
});
console.log("Missing char:", font.charToGlyphIndex("B"));
console.log("Existing char:", font.charToGlyphIndex("A"));
console.log("0:", font.charToGlyphIndex(String.fromCodePoint(0)));
console.log("FFFD:", font.charToGlyphIndex(String.fromCodePoint(0xFFFD)));
