const fs = require('fs');
const filePath = 'node_modules/opentype.js/dist/opentype.js';
let code = fs.readFileSync(filePath, 'utf8');

const targetCharString = `    for (let i = 0; i < glyphs.length; i += 1) {
      const glyph = glyphs.get(i);
      let ops = glyphToOps(glyph, version);
      let buf = encode.CHARSTRING(ops);
      ops = null; // Free ops array immediately
      t.charStrings.push({ name: glyph.name, type: "RAW_BYTES", value: buf });
    }`;

const replaceCharString = `    for (let i = 0; i < glyphs.length; i += 1) {
      const glyph = glyphs.get(i);
      let buf;
      if (glyph._rawCharString) {
        buf = glyph._rawCharString;
      } else {
        let ops = glyphToOps(glyph, version);
        buf = encode.CHARSTRING(ops);
        ops = null;
      }
      t.charStrings.push({ name: glyph.name, type: "RAW_BYTES", value: buf });
    }`;

if (code.includes(targetCharString)) {
    code = code.replace(targetCharString, replaceCharString);
    console.log("Patched charstring generation for precompiled buf");
} else {
    console.log("targetCharString not found");
}

const targetGetMetrics = `  Glyph.prototype.getMetrics = function() {`;
const replaceGetMetrics = `  Glyph.prototype.getMetrics = function() {
    if (this._cachedMetrics) return this._cachedMetrics;`;

if (code.includes(targetGetMetrics) && !code.includes('this._cachedMetrics')) {
    code = code.replace(targetGetMetrics, replaceGetMetrics);
    console.log("Patched getMetrics for caching");
}

fs.writeFileSync(filePath, code);
