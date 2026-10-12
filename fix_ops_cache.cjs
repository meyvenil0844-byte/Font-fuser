const fs = require('fs');
const filePath = 'node_modules/opentype.js/dist/opentype.js';
let code = fs.readFileSync(filePath, 'utf8');

code = code.replace(/    if \(ops\.length < 10000\) \n    if \(ops\.length < 10000\) \n    return ops;/g, '    return ops;');
fs.writeFileSync(filePath, code);
