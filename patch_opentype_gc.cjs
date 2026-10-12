const fs = require('fs');
const filePath = 'node_modules/opentype.js/dist/opentype.js';
let code = fs.readFileSync(filePath, 'utf8');

const target = `      let ops = glyphToOps(glyph, version);
      let buf = encode.CHARSTRING(ops);
      ops = null; // Free ops array immediately
      t.charStrings.push({ name: glyph.name, type: "RAW_BYTES", value: buf });
    }
    return t;`;

const replace = `      let ops = glyphToOps(glyph, version);
      let buf = encode.CHARSTRING(ops);
      ops = null; // Free ops array immediately
      t.charStrings.push({ name: glyph.name, type: "RAW_BYTES", value: buf });
      if (global.gc) global.gc();
    }
    return t;`;

if (code.includes(target)) {
    code = code.replace(target, replace);
    fs.writeFileSync(filePath, code);
    console.log("Patched with GC");
} else {
    console.log("Could not find target to patch for GC");
}
