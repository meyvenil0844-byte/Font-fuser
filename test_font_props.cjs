const opentype = require('opentype.js');
const font = new opentype.Font({
  familyName: "Test",
  styleName: "Regular",
  unitsPerEm: 1000,
  ascender: 800,
  descender: -200,
  glyphs: [new opentype.Glyph({ name: ".notdef", unicode: 0, advanceWidth: 500, path: new opentype.Path() })]
});
console.log(font.glyphs.constructor.name);
console.log(Object.keys(font.glyphs));
console.log(Object.keys(font.glyphs.__proto__));
