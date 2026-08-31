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

console.log("Parsed glyphs length:", parsed.glyphs.length);
console.log("Parsed glyphs keys:", Object.keys(parsed.glyphs));
console.log("Is glyphs array?", Array.isArray(parsed.glyphs.glyphs));
console.log("Type of glyphs.glyphs:", typeof parsed.glyphs.glyphs);
if (typeof parsed.glyphs.glyphs === 'object') {
  console.log("Keys in glyphs.glyphs before get:", Object.keys(parsed.glyphs.glyphs).length);
}

// Mutate it!
parsed.glyphs.push(1, new opentype.Glyph({ name: "B", unicode: 66, advanceWidth: 500, path: new opentype.Path() }));
console.log("Pushed via push method? wait does push exist?");

try {
  const buf2 = parsed.toArrayBuffer();
  console.log("toArrayBuffer worked, size:", buf2.byteLength);
} catch (e) {
  console.log("Error:", e);
}

