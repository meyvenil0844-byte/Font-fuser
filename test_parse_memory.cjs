const opentype = require('opentype.js');

const font = new opentype.Font({
    familyName: 'TestFont', styleName: 'Medium', unitsPerEm: 1000, ascender: 800, descender: -200,
    glyphs: [ new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 650, path: new opentype.Path() }) ]
});
for (let i = 1; i < 28394; i++) {
    const p = new opentype.Path();
    p.moveTo(0, 0);
    for (let j = 0; j < 30; j++) {
        p.lineTo(100+j+i, 100+j+i); p.quadraticCurveTo(100, 200, 300, 400); p.curveTo(1,2,3,4,5,6);
    }
    const newGlyph = new opentype.Glyph({ name: 'uni'+i, unicode: i, advanceWidth: 650, path: p });
    newGlyph.index = font.glyphs.length;
    font.glyphs.glyphs[font.glyphs.length] = newGlyph; font.glyphs.length++;
}
const buf = font.toArrayBuffer();
console.log("Buffer generated:", buf.byteLength);
if (typeof global.gc === 'function') global.gc();

console.log("Mem before parse:", Math.round(process.memoryUsage().heapUsed/1024/1024));
const parsed = opentype.parse(buf);
console.log("Parsed!");
if (typeof global.gc === 'function') global.gc();
console.log("Mem after parse:", Math.round(process.memoryUsage().heapUsed/1024/1024));
