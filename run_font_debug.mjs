import opentype from 'opentype.js';
import fs from 'fs';

const width = 100;
const height = 100;
const cps = [65]; // Test with one character

const notdef = new opentype.Glyph({ name: '.notdef', unicode: undefined, advanceWidth: 1000, path: new opentype.Path() });

const newPath = new opentype.Path();
newPath.moveTo(0, 0);
newPath.lineTo(100, 0);
newPath.lineTo(100, 100);
newPath.close();

const glyphs = [notdef];
for (const cp of cps) {
  glyphs.push(new opentype.Glyph({
    name: cp === 0 ? '.null' : ('uni' + cp.toString(16).toUpperCase()),
    unicode: cp,
    advanceWidth: 800,
    path: newPath
  }));
}

const font = new opentype.Font({
  familyName: "TestFont",
  styleName: 'Regular',
  unitsPerEm: 1000,
  ascender: 800,
  descender: -200,
  glyphs: glyphs,
});

const buffer = font.toArrayBuffer();
const parsed = opentype.parse(buffer);
console.log("Parsed keys:", Object.keys(parsed.tables));
console.log("OS/2 table:", parsed.tables.os2);
console.log("head table:", parsed.tables.head);
