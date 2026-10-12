const fs = require('fs');
let code = fs.readFileSync('node_modules/opentype.js/dist/opentype.js', 'utf8');

const targetReturn = `    if (wmm) {
      wmm.set(ops, d);
    }
    return d;
  };
  sizeOf.CHARSTRING = function(ops) {`;

const replaceReturn = `    if (wmm) {
      wmm.set(ops, d);
    }
    const buf = Buffer.from(d);
    charstringCache.set(ops, buf);
    return buf;
  };
  sizeOf.CHARSTRING = function(ops) {`;

if (code.includes(targetReturn)) {
    code = code.replace(targetReturn, replaceReturn);
    
    // Also fix the mistake in encode.DICT
    const fixDict = `    const buf = Buffer.from(d);
    charstringCache.set(ops, buf);
    return buf;
  };
  sizeOf.DICT = function(m) {`;
    const replaceDict = `    return d;
  };
  sizeOf.DICT = function(m) {`;
    code = code.replace(fixDict, replaceDict);
    
    fs.writeFileSync('node_modules/opentype.js/dist/opentype.js', code);
    console.log("Fixed CHARSTRING cache!");
} else {
    console.log("Failed to fix CHARSTRING cache!");
}
