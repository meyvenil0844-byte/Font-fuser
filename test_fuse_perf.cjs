const opentype = require('opentype.js');

const font = new opentype.Font({
    familyName: 'TestFont',
    styleName: 'Medium',
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    glyphs: [
        new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 650, path: new opentype.Path() })
    ]
});

// Add 28,000 glyphs with complex paths
console.log("Generating paths...");
for (let i = 1; i < 28394; i++) {
    const p = new opentype.Path();
    // Simulate a complex path: 30 commands
    p.moveTo(0, 0);
    for (let j = 0; j < 10; j++) {
        p.lineTo(100+j, 100+j);
        p.quadraticCurveTo(100, 200, 300, 400);
        p.curveTo(1,2,3,4,5,6);
    }
    const newGlyph = new opentype.Glyph({ name: 'uni'+i, unicode: i, advanceWidth: 650, path: p });
    newGlyph.index = font.glyphs.length;
    font.glyphs.glyphs[font.glyphs.length] = newGlyph;
    font.glyphs.length++;
}

console.log("Paths generated. GCing...");
if (typeof global.gc === 'function') global.gc();

const mem = process.memoryUsage();
console.log(`Memory: Heap Used: ${Math.round(mem.heapUsed/1024/1024)}MB / Heap Total: ${Math.round(mem.heapTotal/1024/1024)}MB`);

console.log("Encoding...");
try {
    const buf = font.toArrayBuffer();
    console.log("Success! size:", buf.byteLength);
} catch (e) {
    console.log("Error:", e);
}
