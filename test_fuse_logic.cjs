const fs = require('fs');
const opentype = require('opentype.js');

const font1 = new opentype.Font({
  familyName: "Base", styleName: "Regular", unitsPerEm: 1000, ascender: 800, descender: -200,
  glyphs: [new opentype.Glyph({ name: ".notdef", unicode: 0, advanceWidth: 500, path: new opentype.Path() }),
           new opentype.Glyph({ name: "X", unicode: 88, advanceWidth: 500, path: new opentype.Path() })]
});

// simulate parsing
const parsed = opentype.parse(Buffer.from(font1.toArrayBuffer()));
// add a new glyph (simulating baseGlyphIndex === 0 missing)
const newGlyph = new opentype.Glyph({ name: "A", unicode: 65, advanceWidth: 500, path: new opentype.Path() });
parsed.glyphs.glyphs[parsed.glyphs.length] = newGlyph;
parsed.glyphs.length++;

// replace an existing glyph (X)
const newGlyph2 = new opentype.Glyph({ name: "Y", unicode: 88, advanceWidth: 500, path: new opentype.Path() });
parsed.glyphs.glyphs[parsed.charToGlyphIndex('X')] = newGlyph2;

const out = Buffer.from(parsed.toArrayBuffer());
const font2 = opentype.parse(out);

console.log("A is present:", font2.charToGlyphIndex('A') > 0);
console.log("X is present:", font2.charToGlyphIndex('X') > 0);
console.log("notdef intact:", font2.glyphs.glyphs[0].name === '.notdef' || font2.glyphs.glyphs[0].name === '.null');
