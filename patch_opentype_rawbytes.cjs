const fs = require('fs');

const filePath = 'node_modules/opentype.js/dist/opentype.js';
let code = fs.readFileSync(filePath, 'utf8');

// Add RAW_BYTES to encode
const rawBytesTarget = `  encode.BYTE = function(v) {`;
const rawBytesReplace = `  encode.RAW_BYTES = function(v) { return v; };
  encode.BYTE = function(v) {`;

if (code.includes(rawBytesTarget)) {
    code = code.replace(rawBytesTarget, rawBytesReplace);
    console.log("Patched RAW_BYTES encoder");
}

// Modify makeCharStringsIndex to encode immediately and discard ops!
const charStringTarget = `      const ops = glyphToOps(glyph, version);
      t.charStrings.push({ name: glyph.name, type: "CHARSTRING", value: ops });
    }
    return t;
  }`;

const charStringReplace = `      let ops = glyphToOps(glyph, version);
      let buf = encode.CHARSTRING(ops);
      ops = null; // Free ops array immediately!
      t.charStrings.push({ name: glyph.name, type: "RAW_BYTES", value: buf });
    }
    return t;
  }`;

if (code.includes(charStringTarget)) {
    code = code.replace(charStringTarget, charStringReplace);
    console.log("Patched makeCharStringsIndex for immediate encoding");
} else {
    // maybe we already patched it or something else? Let's check
    console.log("Could not find charStringTarget!");
}

fs.writeFileSync(filePath, code);
