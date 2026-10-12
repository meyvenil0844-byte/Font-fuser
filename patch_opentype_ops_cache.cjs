const fs = require('fs');
const filePath = 'node_modules/opentype.js/dist/opentype.js';
let code = fs.readFileSync(filePath, 'utf8');

const target1 = `    glyphOpsCache.set(glyph.path, ops);
    return ops;`;

const replace1 = `    if (ops.length < 10000) glyphOpsCache.set(glyph.path, ops);
    return ops;`;

if (code.includes(target1)) {
    code = code.replace(target1, replace1);
    console.log("Patched glyphOpsCache length limit");
}

// Also for charstringCache!
const target2 = `    const buf = Buffer.from(d);
    charstringCache.set(ops, buf);
    return buf;`;

const replace2 = `    const buf = Buffer.from(d);
    // Don't cache massive charstrings to save RAM
    if (d.length < 10000) charstringCache.set(ops, buf);
    return buf;`;

if (code.includes(target2)) {
    code = code.replace(target2, replace2);
    console.log("Patched charstringCache length limit");
}

fs.writeFileSync(filePath, code);
