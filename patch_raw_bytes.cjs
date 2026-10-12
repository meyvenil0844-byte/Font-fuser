const fs = require('fs');
let code = fs.readFileSync('node_modules/opentype.js/dist/opentype.js', 'utf8');

const targetEncode = `  encode.CHARSTRING = function(ops) {`;
const replaceEncode = `  encode.RAW_BYTES = function(v) { return v; };
  sizeOf.RAW_BYTES = function(v) { return v.length; };
  encode.CHARSTRING = function(ops) {`;
if (!code.includes('encode.RAW_BYTES')) {
    code = code.replace(targetEncode, replaceEncode);
}

const targetLoop = `      const ops = glyphToOps(glyph, version);
      t.charStrings.push({ name: glyph.name, type: "CHARSTRING", value: ops });`;
const replaceLoop = `      const ops = glyphToOps(glyph, version);
      const bytes = encode.CHARSTRING(ops);
      t.charStrings.push({ name: glyph.name, type: "RAW_BYTES", value: bytes });`;
if (code.includes(targetLoop)) {
    code = code.replace(targetLoop, replaceLoop);
}

fs.writeFileSync('node_modules/opentype.js/dist/opentype.js', code);
console.log("Patched RAW_BYTES into opentype.js");
