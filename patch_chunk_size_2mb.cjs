const fs = require('fs');
let code = fs.readFileSync('src/lib/fontUtils.ts', 'utf8');

const targetSize = 'const CHUNK_SIZE = 512 * 1024; // 512KB chunks';
const replaceSize = 'const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB chunks';

if (code.includes(targetSize)) {
    code = code.replace(targetSize, replaceSize);
    fs.writeFileSync('src/lib/fontUtils.ts', code);
    console.log("Patched chunk size to 2MB!");
} else {
    console.log("Failed to patch chunk size to 2MB!");
}
