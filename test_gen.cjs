const opentype = require('opentype.js');

const font = new opentype.Font({
    familyName: 'TestFont',
    styleName: 'Medium',
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    glyphs: [
        new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 650, path: new opentype.Path() }),
        new opentype.Glyph({ name: 'A', unicode: 65, advanceWidth: 650, path: new opentype.Path() })
    ]
});

font.glyphs.push(font.glyphs.length, new opentype.Glyph({
    name: 'B', unicode: 66, advanceWidth: 650, path: new opentype.Path()
}));

const buf = font.toArrayBuffer();
console.log("Success! size:", buf.byteLength);
