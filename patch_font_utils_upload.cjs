const fs = require('fs');

const path = 'src/lib/fontUtils.ts';
let code = fs.readFileSync(path, 'utf8');

const targetLoopStart = `  // Upload sequentially to avoid proxy payload size limits and timeouts with large math fonts
  for (let i = 0; i < allFontsToUpload.length; i++) {
    const font = allFontsToUpload[i];
    if (onProgress) onProgress(\`Uploading font \${i+1} of \${allFontsToUpload.length}: \${font.name}...\`);`;

const targetRegex = /  \/\/ Upload sequentially to avoid proxy payload size limits and timeouts with large math fonts[\s\S]*?    }\n  }\n/m;

const replacement = `  // Upload in parallel with a concurrency limit
  let completed = 0;
  const totalFonts = allFontsToUpload.length;
  const concurrency = 15; // Up to 15 concurrent uploads
  
  const uploadTasks = allFontsToUpload.slice();
  
  await Promise.all(Array.from({ length: Math.min(concurrency, totalFonts) }).map(async () => {
    while (uploadTasks.length > 0) {
        const font = uploadTasks.shift();
        if (!font) continue;
        
        if (onProgress) onProgress(\`Uploading fonts... (\${completed}/\${totalFonts})\`);
        
        const CHUNK_SIZE = 1 * 1024 * 1024; // 1MB chunks to avoid Nginx 413/502 errors
        const file = font.file;
        
        if (file.size > CHUNK_SIZE) {
            const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
            const uploadId = \`\${Date.now()}-\${Math.random().toString(36).substring(2)}\`;
            
            for (let j = 0; j < totalChunks; j++) {
                const start = j * CHUNK_SIZE;
                const end = Math.min(start + CHUNK_SIZE, file.size);
                const chunk = file.slice(start, end);
                
                let chunkRes;
                let retries = 5;
                while (retries > 0) {
                    try {
                        const url = \`/api/upload-chunk-raw?uploadId=\${uploadId}&chunkIndex=\${j}&totalChunks=\${totalChunks}&originalName=\${encodeURIComponent(file.name)}&t=\${Date.now()}_\${Math.random()}\`;
                        chunkRes = await fetch(url, { 
                            method: 'POST', 
                            headers: { 'Content-Type': 'application/octet-stream' },
                            body: chunk 
                        });
                        if (chunkRes.ok) break;
                    } catch (e) {
                        if (retries === 1) throw new Error(\`Network error uploading \${font.name} chunk \${j}: \${e.message}\`);
                    }
                    retries--;
                    if (retries > 0) await new Promise(r => setTimeout(r, 2000));
                }
                
                if (chunkRes && !chunkRes.ok) {
                    throw new Error(\`Failed to upload \${font.name} chunk \${j}\`);
                }
            }
            
            let finishRes;
            let finishRetries = 3;
            while (finishRetries > 0) {
                try {
                    finishRes = await fetch('/api/upload-chunk-finish?t=' + Date.now(), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ uploadId })
                    });
                    if (finishRes.ok) break;
                } catch (e) {
                    if (finishRetries === 1) throw new Error(\`Network error finalizing \${font.name}: \${e.message}\`);
                }
                finishRetries--;
                if (finishRetries > 0) await new Promise(r => setTimeout(r, 2000));
            }
            
            if (finishRes && !finishRes.ok) {
                throw new Error(\`Failed to finalize \${font.name}\`);
            }
            
            const data = await finishRes.json();
            serverFontIds[font.id] = data.fontId;
        } else {
            const fd = new FormData();
            fd.append('font', font.file);
            
            let res;
            let retries = 3;
            while (retries > 0) {
                try {
                    res = await fetch('/api/upload-font', { method: 'POST', body: fd });
                    if (res.ok) break;
                } catch (e) {
                    if (retries === 1) throw e;
                }
                retries--;
                if (retries > 0) await new Promise(r => setTimeout(r, 1000));
            }
            if (!res.ok) {
               throw new Error(\`Failed to upload \${font.name} (\${res.status})\`);
            }
            const data = await res.json();
            serverFontIds[font.id] = data.fontId;
        }
        
        completed++;
        if (onProgress) onProgress(\`Uploading fonts... (\${completed}/\${totalFonts})\`);
    }
  }));\n`;

if (targetRegex.test(code)) {
    code = code.replace(targetRegex, replacement);
    fs.writeFileSync(path, code);
    console.log("Patched successfully!");
} else {
    console.log("Could not find target regex.");
}
