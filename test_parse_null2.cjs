const fs = require('fs');
const opentype = require('opentype.js');

const font = opentype.parse(fs.readFileSync('base.ttf'));
console.log("Missing char 99999:", font.charToGlyphIndex(String.fromCodePoint(99999)));
