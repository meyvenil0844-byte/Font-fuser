const fs = require('fs');
let code = fs.readFileSync('src/lib/fontUtils.ts', 'utf8');

const targetLoop = `                    const fd = new FormData();
                    fd.append('chunk', chunk, \`chunk-\${j}\`);
                    fd.append('uploadId', uploadId);
                    fd.append('chunkIndex', j.toString());
                    fd.append('totalChunks', totalChunks.toString());
                    fd.append('originalName', file.name);
                    
                    await new Promise(r => setTimeout(r, 500)); // Delay to prevent proxy rate limiting
                    chunkRes = await fetch('/api/upload-chunk?t=' + Date.now() + '_' + Math.random(), { method: 'POST', body: fd });`;

const replaceLoop = `                    await new Promise(r => setTimeout(r, 500)); // Delay to prevent proxy rate limiting
                    const url = \`/api/upload-chunk-raw?uploadId=\${uploadId}&chunkIndex=\${j}&totalChunks=\${totalChunks}&originalName=\${encodeURIComponent(file.name)}&t=\${Date.now()}_\${Math.random()}\`;
                    chunkRes = await fetch(url, { 
                        method: 'POST', 
                        headers: { 'Content-Type': 'application/octet-stream' },
                        body: chunk 
                    });`;

if (code.includes('const fd = new FormData();')) {
    code = code.replace(targetLoop, replaceLoop);
    fs.writeFileSync('src/lib/fontUtils.ts', code);
    console.log("Patched client to use raw upload!");
} else {
    console.log("Failed to patch client raw upload!");
}
