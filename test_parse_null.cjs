const fs = require('fs');
const opentype = require('opentype.js');

const font = opentype.parse(fs.readFileSync('base.ttf'));
console.log("Missing char B:", font.charToGlyphIndex("B"));
console.log("Existing char A:", font.charToGlyphIndex("A1"));
