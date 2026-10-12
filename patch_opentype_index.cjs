const fs = require('fs');
let code = fs.readFileSync('node_modules/opentype.js/dist/opentype.js', 'utf8');

const targetIndex = `  encode.INDEX = function(l) {
    let offset = 1;
    const offsets = [offset];
    const data = [];
    for (let i = 0; i < l.length; i += 1) {
      const v = encode.OBJECT(l[i]);
      Array.prototype.push.apply(data, v);
      offset += v.length;
      offsets.push(offset);
    }
    if (data.length === 0) {
      return [0, 0];
    }
    const encodedOffsets = [];
    const offSize = 1 + Math.floor(Math.log(offset) / Math.log(2)) / 8 | 0;
    const offsetEncoder = [void 0, encode.BYTE, encode.USHORT, encode.UINT24, encode.ULONG][offSize];
    for (let i = 0; i < offsets.length; i += 1) {
      const encodedOffset = offsetEncoder(offsets[i]);
      Array.prototype.push.apply(encodedOffsets, encodedOffset);
    }
    return Array.prototype.concat(
      encode.Card16(l.length),
      encode.OffSize(offSize),
      encodedOffsets,
      data
    );
  };`;

const replaceIndex = `  encode.INDEX = function(l) {
    let offset = 1;
    const offsets = [offset];
    const chunks = [];
    for (let i = 0; i < l.length; i += 1) {
      const v = encode.OBJECT(l[i]);
      if (Buffer.isBuffer(v)) chunks.push(v);
      else chunks.push(Buffer.from(v));
      offset += v.length;
      offsets.push(offset);
    }
    if (offset === 1) {
      return Buffer.from([0, 0]);
    }
    const encodedOffsets = [];
    const offSize = 1 + Math.floor(Math.log(offset) / Math.log(2)) / 8 | 0;
    const offsetEncoder = [void 0, encode.BYTE, encode.USHORT, encode.UINT24, encode.ULONG][offSize];
    for (let i = 0; i < offsets.length; i += 1) {
      const encodedOffset = offsetEncoder(offsets[i]);
      for (let j = 0; j < encodedOffset.length; j++) encodedOffsets.push(encodedOffset[j]);
    }
    
    return Buffer.concat([
      Buffer.from(encode.Card16(l.length)),
      Buffer.from(encode.OffSize(offSize)),
      Buffer.from(encodedOffsets),
      ...chunks
    ]);
  };`;

if (code.includes(targetIndex)) {
    code = code.replace(targetIndex, replaceIndex);
    console.log("Patched INDEX!");
} else {
    console.log("Failed to patch INDEX!");
}

fs.writeFileSync('node_modules/opentype.js/dist/opentype.js', code);
