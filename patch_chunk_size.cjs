const fs = require('fs');
let code = fs.readFileSync('src/lib/fontUtils.ts', 'utf8');

const targetChunkSize = 'const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks to safely bypass AI Studio proxy limits';
const replaceChunkSize = 'const CHUNK_SIZE = 1 * 1024 * 1024; // 1MB chunks to safely bypass all aggressive reverse proxy limits';

if (code.includes(targetChunkSize)) {
    code = code.replace(targetChunkSize, replaceChunkSize);
    fs.writeFileSync('src/lib/fontUtils.ts', code);
    console.log("Patched chunk size to 1MB!");
} else {
    console.log("Failed to patch chunk size!");
}
