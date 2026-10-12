require('./test_sigabrt_polyfill.cjs'); // Just to load the apply polyfill if needed

const opentype = require('opentype.js');

function createComplexGlyph(name, unicode) {
    const p = new opentype.Path();
    for (let i=0; i<50000; i++) {
        p.moveTo(i, i);
        p.lineTo(i+1, i+1);
        p.quadraticCurveTo(i+2, i+2, i+3, i+3);
        p.curveTo(i+4, i+4, i+5, i+5, i+6, i+6);
        p.close();
    }
    const glyph = new opentype.Glyph({ name, unicode, path: p, advanceWidth: 1000 });
    
    // PRECOMPUTE METRICS
    glyph._cachedMetrics = glyph.getMetrics();
    
    // PRECOMPILE CHARSTRING
    const ops = opentype._glyphToOps(glyph, 1);
    const buf = opentype._encodeCHARSTRING(ops);
    glyph._rawCharString = buf;
    
    // FREE PATH
    glyph.path.commands = [];
    
    return glyph;
}

const glyphs = [new opentype.Glyph({ name: '.notdef', unicode: 0, path: new opentype.Path(), advanceWidth: 1000 })];
for (let i=0; i<50; i++) {
    glyphs.push(createComplexGlyph('g'+i, 65+i));
    if (global.gc) global.gc();
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
console.log("Compiling font with massive photo glyphs...");
const buf = font.toArrayBuffer();
console.log("Done in", (Date.now() - s) / 1000, "seconds, size:", buf.byteLength);
