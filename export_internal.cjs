const fs = require('fs');
const filePath = 'node_modules/opentype.js/dist/opentype.js';
let code = fs.readFileSync(filePath, 'utf8');

const target = `  __export(opentype_exports, {`;
const replace = `  __export(opentype_exports, {
    _glyphToOps: () => glyphToOps,
    _encodeCHARSTRING: () => encode.CHARSTRING,`;

if (code.includes(target)) {
    code = code.replace(target, replace);
    fs.writeFileSync(filePath, code);
    console.log("Patched exports");
} else {
    console.log("Export target not found");
}
