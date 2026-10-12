const fs = require('fs');
const opentype = require('opentype.js');

console.log("Memory test starting...");
// Let's create a fake huge font.
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

for (let i = 1; i < 30000; i++) {
    const p = new opentype.Path();
    for (let j = 0; j < 50; j++) {
        p.lineTo(Math.random()*1000, Math.random()*1000);
    }
    const newGlyph = new opentype.Glyph({ name: 'uni'+i, unicode: i, advanceWidth: 650, path: p });
    newGlyph.index = font.glyphs.length;
    font.glyphs.glyphs[font.glyphs.length] = newGlyph;
    font.glyphs.length++;
}

console.log("Glyphs added. Serializing...");
if (typeof global.gc === 'function') global.gc();

try {
    const buf = font.toArrayBuffer();
    console.log("Success! size:", buf.byteLength);
} catch (e) {
    console.log("Error during toArrayBuffer:", e);
}
