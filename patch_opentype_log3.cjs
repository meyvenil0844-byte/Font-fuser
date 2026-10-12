const fs = require('fs');
const filePath = 'node_modules/opentype.js/dist/opentype.js';
let code = fs.readFileSync(filePath, 'utf8');

code = code.replace(/  function makeCFFTable\(glyphs, options\) \{/g, `  function makeCFFTable(glyphs, options) {
    console.log("makeCFFTable");`);

code = code.replace(/    t.charStringsIndex = makeCharStringsIndex\(glyphs, cffVersion\);/g, `    console.log("makeCharStringsIndex");
    t.charStringsIndex = makeCharStringsIndex(glyphs, cffVersion);`);

fs.writeFileSync(filePath, code);
