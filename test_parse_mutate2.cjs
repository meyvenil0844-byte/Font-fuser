const opentype = require('opentype.js');
const font = new opentype.Font({
  familyName: "Test",
  styleName: "Regular",
  unitsPerEm: 1000,
  ascender: 800,
  descender: -200,
  glyphs: [
    new opentype.Glyph({ name: ".notdef", unicode: 0, advanceWidth: 500, path: new opentype.Path() }),
    new opentype.Glyph({ name: "A", unicode: 65, advanceWidth: 500, path: new opentype.Path() })
  ]
});
const buf = font.toArrayBuffer();
const parsed = opentype.parse(buf);

// Load the glyph first to cache it (in case we need to, though we are replacing it)
parsed.glyphs.get(1);

// Mutate it!
parsed.glyphs.glyphs[1] = new opentype.Glyph({ name: "B", unicode: 66, advanceWidth: 500, path: new opentype.Path() });

try {
  const buf2 = parsed.toArrayBuffer();
  console.log("toArrayBuffer worked, size:", buf2.byteLength);
} catch (e) {
  console.log("Error:", e);
}
