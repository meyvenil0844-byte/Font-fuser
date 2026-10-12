const opentype = require('opentype.js');

function createOps(num) {
    const ops = [];
    for(let i=0; i<num; i++) {
        ops.push({ type: 'NUMBER', value: i % 100 });
        ops.push({ type: 'OP', value: 10 });
    }
    return ops;
}

const ops = createOps(500000); // 1,000,000 ops
console.log("Creating charstring...");
let s = Date.now();
// The internal function is not exposed directly, let's create a dummy font
const glyph = new opentype.Glyph({ name: 'A', unicode: 65, path: new opentype.Path() });
// wait, we can't easily trigger just encode.CHARSTRING. We have to compile a font.
