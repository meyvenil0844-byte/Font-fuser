const opentype = require('opentype.js');

function createComplexGlyph(name, unicode) {
    const p = new opentype.Path();
    // 1000 curves per glyph = ~3000 opcodes
    for (let i=0; i<1000; i++) {
        p.moveTo(i, i);
        p.lineTo(i+1, i+1);
        p.quadraticCurveTo(i+2, i+2, i+3, i+3);
        p.curveTo(i+4, i+4, i+5, i+5, i+6, i+6);
        p.close();
    }
    return new opentype.Glyph({ name, unicode, path: p, advanceWidth: 1000 });
}

const glyphs = [new opentype.Glyph({ name: '.notdef', unicode: 0, path: new opentype.Path(), advanceWidth: 1000 })];
for (let i=0; i<242; i++) {
    glyphs.push(createComplexGlyph('g'+i, 65+i));
}

const font = new opentype.Font({
    familyName: 'Test',
    styleName: 'Medium',
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    glyphs: glyphs
});

let s = Date.now();
console.log("Compiling font with 242 complex glyphs...");
font.toArrayBuffer();
console.log("Done in", (Date.now() - s) / 1000, "seconds");
