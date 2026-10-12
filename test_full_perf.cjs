const opentype = require('opentype.js');

const font = new opentype.Font({
    familyName: 'Target', styleName: 'Reg', unitsPerEm: 1000, ascender: 800, descender: -200,
    glyphs: [new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 650, path: new opentype.Path() })]
});

console.log("Generating paths...");
for (let i = 1; i < 28400; i++) {
    const p = new opentype.Path(); 
    p.moveTo(0,0);
    for (let j = 0; j < 300; j++) {
        p.curveTo(j, j, j+1, j+1, j+2, j+2);
    }
    const newGlyph = new opentype.Glyph({ name: 'uni'+i, unicode: i, advanceWidth: 650, path: p });
    newGlyph.index = font.glyphs.length;
    font.glyphs.glyphs[font.glyphs.length] = newGlyph;
    font.glyphs.length++;
}

console.log("Paths generated. Calling toArrayBuffer...");
const start = Date.now();
const buf = font.toArrayBuffer();
console.log("Done in", (Date.now() - start)/1000, "seconds. Size:", buf.byteLength);
