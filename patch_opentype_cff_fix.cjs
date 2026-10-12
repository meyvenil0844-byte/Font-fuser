const fs = require('fs');
const filePath = 'node_modules/opentype.js/dist/opentype.js';
let code = fs.readFileSync(filePath, 'utf8');

const regex = /    t.charStringsIndex = makeCharStringsIndex\(glyphs, cffVersion\);\n    console.log\("makeCharStringsIndex"\);/g;
code = code.replace(regex, `    console.log("makeCharStringsIndex");
    t.charStringsIndex = makeCharStringsIndex(glyphs, cffVersion);`);

fs.writeFileSync(filePath, code);
