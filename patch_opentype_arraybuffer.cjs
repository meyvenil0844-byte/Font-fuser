const fs = require('fs');
let code = fs.readFileSync('node_modules/opentype.js/dist/opentype.js', 'utf8');

// Ensure that Array.prototype.push.apply doesn't blow stack for INDEX
const targetIndex = `
    for (let i = 0; i < offsets.length; i += 1) {
      const encodedOffset = offsetEncoder(offsets[i]);
      Array.prototype.push.apply(encodedOffsets, encodedOffset);
    }
`;
const replaceIndex = `
    for (let i = 0; i < offsets.length; i += 1) {
      const encodedOffset = offsetEncoder(offsets[i]);
      for (let j=0; j<encodedOffset.length; j++) encodedOffsets.push(encodedOffset[j]);
    }
`;

if (code.includes(targetIndex)) {
    code = code.replace(targetIndex, replaceIndex);
}

// And encode.CHARSTRING
const targetCharstring = `
    for (let i = 0; i < length; i += 1) {
      const op = ops[i];
      const enc1 = encode[op.type](op.value);
      for (let j = 0; j < enc1.length; j++) {
        d.push(enc1[j]);
      }
    }
`;

// It's already looping, so that's fine.
fs.writeFileSync('node_modules/opentype.js/dist/opentype.js', code);
