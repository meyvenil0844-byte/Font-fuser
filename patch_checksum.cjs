const fs = require('fs');
let code = fs.readFileSync('node_modules/opentype.js/dist/opentype.js', 'utf8');

const target = `  function computeCheckSum(bytes) {
    while (bytes.length % 4 !== 0) {
      bytes.push(0);
    }
    let sum = 0;
    for (let i = 0; i < bytes.length; i += 4) {
      sum += (bytes[i] << 24) + (bytes[i + 1] << 16) + (bytes[i + 2] << 8) + bytes[i + 3];
    }
    sum %= Math.pow(2, 32);
    return sum;
  }`;

const replace = `  function computeCheckSum(bytes) {
    let padding = 0;
    while ((bytes.length + padding) % 4 !== 0) padding++;
    
    let sum = 0;
    for (let i = 0; i < bytes.length; i += 4) {
      let b0 = bytes[i] || 0;
      let b1 = bytes[i + 1] || 0;
      let b2 = bytes[i + 2] || 0;
      let b3 = bytes[i + 3] || 0;
      sum += (b0 << 24) + (b1 << 16) + (b2 << 8) + b3;
    }
    sum %= Math.pow(2, 32);
    
    // We shouldn't mutate the buffer or array directly if it's a buffer, 
    // but the original code appended 0s. 
    // Let's just return the sum, the padding isn't strictly necessary for the original array?
    // Wait, the original code DID mutate the array! 
    // But since it's just padding, and we write it to the final array anyway, 
    // the final array will have 0s by default if we just pad it in makeSfntTable.
    return sum;
  }`;

if (code.includes(target)) {
    code = code.replace(target, replace);
    
    // Also patch encode.CHARSTRING to cache the buffer!
    const charstringTarget = `  encode.CHARSTRING = function(ops) {
    if (wmm) {
      const cachedValue = wmm.get(ops);
      if (cachedValue !== void 0) {
        return cachedValue;
      }
    }
    let d = [];`;
    const charstringReplace = `
  const charstringCache = new WeakMap();
  encode.CHARSTRING = function(ops) {
    if (charstringCache.has(ops)) return charstringCache.get(ops);
    if (wmm) {
      const cachedValue = wmm.get(ops);
      if (cachedValue !== void 0) {
        return cachedValue;
      }
    }
    let d = [];`;
    
    const charstringReturnTarget = `    return d;
  };
  sizeOf.DICT = function(m) {`;
    const charstringReturnReplace = `
    const buf = Buffer.from(d);
    charstringCache.set(ops, buf);
    return buf;
  };
  sizeOf.DICT = function(m) {`;
  
    code = code.replace(charstringTarget, charstringReplace);
    code = code.replace(charstringReturnTarget, charstringReturnReplace);
    
    // Also patch makeSfntTable to pad the table if needed
    const sfntTableTarget = `      const table = tables[i];
      tableRecord.tag = table.tableName;
      tableRecord.offset = offset;
      tableRecord.checkSum = computeCheckSum(tableData);
      tableRecord.length = tableData.length;`;
    const sfntTableReplace = `      const table = tables[i];
      tableRecord.tag = table.tableName;
      tableRecord.offset = offset;
      
      let tableDataBuf = Buffer.isBuffer(tableData) ? tableData : Buffer.from(tableData);
      let padding = 0;
      while ((tableDataBuf.length + padding) % 4 !== 0) padding++;
      if (padding > 0) {
          const padBuf = Buffer.alloc(padding, 0);
          tableDataBuf = Buffer.concat([tableDataBuf, padBuf]);
      }
      tableData = tableDataBuf;
      
      tableRecord.checkSum = computeCheckSum(tableData);
      tableRecord.length = tableData.length;`;
      
    code = code.replace(sfntTableTarget, sfntTableReplace);

    fs.writeFileSync('node_modules/opentype.js/dist/opentype.js', code);
    console.log("Patched checksum and CHARSTRING cache!");
} else {
    console.log("Failed to patch checksum!");
}
