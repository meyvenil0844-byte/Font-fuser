const fs = require('fs');
const opentype = require('opentype.js');

const notdef = new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: new opentype.Path() });
const font = new opentype.Font({ familyName: 'TestTTF', styleName: 'Regular', unitsPerEm: 1000, ascender: 800, descender: -200, glyphs: [notdef] });
font.outlinesFormat = 'truetype';
const buf = font.toArrayBuffer();
fs.writeFileSync('test.ttf', Buffer.from(buf));
