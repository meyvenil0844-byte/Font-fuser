const fs = require('fs');
let code = fs.readFileSync('src/lib/fontUtils.ts', 'utf8');

const targetLoop = `            const fd = new FormData();
            fd.append('chunk', chunk, \`chunk-\${j}\`);
            fd.append('uploadId', uploadId);
            fd.append('chunkIndex', j.toString());
            fd.append('totalChunks', totalChunks.toString());
            fd.append('originalName', file.name);
            
            
            let chunkRes;
            let retries = 3;
            while (retries > 0) {
                try {
                    await new Promise(r => setTimeout(r, 250)); // Delay to prevent proxy rate limiting
                    chunkRes = await fetch('/api/upload-chunk', { method: 'POST', body: fd });
                    if (chunkRes.ok) break;
                } catch (e) {
                    if (retries === 1) throw new Error(\`Network error uploading \${font.name} chunk \${j}: \${e.message}\`);
                }
                retries--;
                if (retries > 0) await new Promise(r => setTimeout(r, 1000)); // Backoff
            }`;

const replaceLoop = `            let chunkRes;
            let retries = 5;
            while (retries > 0) {
                try {
                    const fd = new FormData();
                    fd.append('chunk', chunk, \`chunk-\${j}\`);
                    fd.append('uploadId', uploadId);
                    fd.append('chunkIndex', j.toString());
                    fd.append('totalChunks', totalChunks.toString());
                    fd.append('originalName', file.name);
                    
                    await new Promise(r => setTimeout(r, 500)); // Delay to prevent proxy rate limiting
                    chunkRes = await fetch('/api/upload-chunk', { method: 'POST', body: fd });
                    if (chunkRes.ok) break;
                } catch (e) {
                    if (retries === 1) throw new Error(\`Network error uploading \${font.name} chunk \${j}: \${e.message}\`);
                }
                retries--;
                if (retries > 0) await new Promise(r => setTimeout(r, 2000)); // Backoff
            }`;

if (code.includes('let chunkRes;\n            let retries = 3;')) {
    code = code.replace(targetLoop, replaceLoop);
    fs.writeFileSync('src/lib/fontUtils.ts', code);
    console.log("Patched retry loop!");
} else {
    console.log("Failed to patch retry loop!");
}
