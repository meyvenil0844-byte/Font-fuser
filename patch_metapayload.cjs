const fs = require('fs');
let code = fs.readFileSync('fuseWorker.cjs', 'utf8');

const target = `const metaPayload = JSON.stringify({ glyphMap: glyphMap });`;
const replacement = `const metaPayload = "Fused by AI Studio";`;

code = code.replace(target, replacement);
fs.writeFileSync('fuseWorker.cjs', code);
console.log("Patched metaPayload!");
