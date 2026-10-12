const fs = require('fs');
let code = fs.readFileSync('fuseWorker.cjs', 'utf8');

const targetCache = 'const MAX_CACHE = 100;';
const replaceCache = 'const MAX_CACHE = 1;';

code = code.replace(targetCache, replaceCache);
fs.writeFileSync('fuseWorker.cjs', code);
console.log("Fixed max cache!");
