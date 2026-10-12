const fs = require('fs');
let code = fs.readFileSync('src/lib/fontUtils.ts', 'utf8');

const targetLoop = `            const chunkRes = await fetch('/api/upload-chunk', { method: 'POST', body: fd });
            if (!chunkRes.ok) {`;

const replaceLoop = `            // Add a tiny delay to avoid proxy rate limiting
            await new Promise(r => setTimeout(r, 100));
            const chunkRes = await fetch('/api/upload-chunk', { method: 'POST', body: fd });
            if (!chunkRes.ok) {`;

if (code.includes(targetLoop)) {
    code = code.replace(targetLoop, replaceLoop);
    fs.writeFileSync('src/lib/fontUtils.ts', code);
    console.log("Patched chunk delay!");
} else {
    console.log("Failed to patch chunk delay!");
}
