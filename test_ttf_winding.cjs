const opentype = require('opentype.js');
const fs = require('fs');

// Create CW outer square
const pCW = new opentype.Path();
pCW.moveTo(0,0); pCW.lineTo(0,100); pCW.lineTo(100,100); pCW.lineTo(100,0); pCW.close();

// Create CCW outer square
const pCCW = new opentype.Path();
pCCW.moveTo(0,0); pCCW.lineTo(100,0); pCCW.lineTo(100,100); pCCW.lineTo(0,100); pCCW.close();

// Create CCW hole
const holeCCW = new opentype.Path();
holeCCW.moveTo(25,25); holeCCW.lineTo(75,25); holeCCW.lineTo(75,75); holeCCW.lineTo(25,75); holeCCW.close();

// Create CW hole
const holeCW = new opentype.Path();
holeCW.moveTo(25,25); holeCW.lineTo(25,75); holeCW.lineTo(75,75); holeCW.lineTo(75,25); holeCW.close();

const font = new opentype.Font({
  familyName: "Test", styleName: "Regular", unitsPerEm: 1000, ascender: 800, descender: -200,
  glyphs: [
    new opentype.Glyph({ name: ".notdef", unicode: 0, advanceWidth: 500, path: new opentype.Path() }),
    new opentype.Glyph({ name: "A", unicode: 65, advanceWidth: 500, path: [pCW, holeCCW].reduce((a,b)=>{a.commands.push(...b.commands); return a;}, new opentype.Path()) }), // Standard TTF
    new opentype.Glyph({ name: "B", unicode: 66, advanceWidth: 500, path: [pCCW, holeCW].reduce((a,b)=>{a.commands.push(...b.commands); return a;}, new opentype.Path()) }) // Reversed
  ]
});
fs.writeFileSync('test_ttf_winding.ttf', Buffer.from(font.toArrayBuffer()));
console.log("Generated.");
