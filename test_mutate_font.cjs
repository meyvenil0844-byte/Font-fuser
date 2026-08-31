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

// Mutate it!
font.glyphs.glyphs[1] = new opentype.Glyph({ name: "B", unicode: 66, advanceWidth: 500, path: new opentype.Path() });
console.log(font.glyphs.get(1).name);

// See if toArrayBuffer still works
try {
  const buf = font.toArrayBuffer();
  console.log("toArrayBuffer worked, size:", buf.byteLength);
} catch(e) {
  console.log("Error:", e);
}
