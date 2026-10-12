const fs = require('fs');
const filePath = 'node_modules/opentype.js/dist/opentype.js';
let code = fs.readFileSync(filePath, 'utf8');

code = code.replace(/    for \(let i = 0; i < glyphs.length; i \+= 1\) \{\n      const glyph = glyphs.get\(i\);\n      let buf;\n      if \(glyph._rawCharString\) \{\n          buf = glyph._rawCharString;\n      \} else \{\n          let ops = glyphToOps\(glyph, version\);\n          buf = encode.CHARSTRING\(ops\);\n          ops = null;\n      \}\n      if \(global.gc\) global.gc\(\);\n      t.charStrings.push\(\{ name: glyph.name, type: "RAW_BYTES", value: buf \}\);\n    \}\n    return t;/g, `    for (let i = 0; i < glyphs.length; i += 1) {
      const glyph = glyphs.get(i);
      let buf;
      if (glyph._rawCharString) {
          buf = glyph._rawCharString;
      } else {
          let ops = glyphToOps(glyph, version);
          buf = encode.CHARSTRING(ops);
          ops = null;
      }
      if (global.gc) global.gc();
      t.charStrings.push({ name: glyph.name, type: "RAW_BYTES", value: buf });
    }
    return t;`);
fs.writeFileSync(filePath, code);
