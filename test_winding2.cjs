const opentype = require('opentype.js');

// Outer square (0 to 100) - CCW (in Y-up)
const p1 = new opentype.Path();
p1.moveTo(0,0);
p1.lineTo(100,0);
p1.lineTo(100,100);
p1.lineTo(0,100);
p1.close();

// Inner square (25 to 75) - CW (in Y-up)
const p2 = new opentype.Path();
p2.moveTo(25,25);
p2.lineTo(25,75);
p2.lineTo(75,75);
p2.lineTo(75,25);
p2.close();

const font = new opentype.Font({
  familyName: "Test", styleName: "Regular", unitsPerEm: 1000, ascender: 800, descender: -200,
  glyphs: [
    new opentype.Glyph({ name: ".notdef", unicode: 0, advanceWidth: 500, path: new opentype.Path() }),
    new opentype.Glyph({ name: "A", unicode: 65, advanceWidth: 500, path: [p1, p2].reduce((a,b)=>{a.commands.push(...b.commands); return a;}, new opentype.Path()) })
  ]
});
require('fs').writeFileSync('test_winding2.ttf', Buffer.from(font.toArrayBuffer()));
