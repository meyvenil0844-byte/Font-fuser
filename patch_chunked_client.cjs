const fs = require('fs');
let code = fs.readFileSync('src/lib/fontUtils.ts', 'utf8');

const targetUpload = `    const fd = new FormData();
    fd.append('font', font.file);
    
    const res = await fetch('/api/upload-font', { method: 'POST', body: fd });
    if (!res.ok) {
       const errText = await res.text().catch(() => '');
       throw new Error(\`Failed to upload \${font.name} (\${res.status}): \${errText.substring(0, 100)}\`);
    }
    const __ct_res = res.headers.get('content-type');
    if (__ct_res && __ct_res.includes('text/html')) {
        // Fallback for AI Studio proxy if the request was still too large
        throw new Error(\`The font "\${font.name}" might be too large for the proxy, or the server is restarting.\`);
    }
    const data = await res.json();
    serverFontIds[font.id] = data.fontId;`;

const replaceUpload = `
    const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks to safely bypass AI Studio proxy limits
    const file = font.file;
    
    if (file.size > CHUNK_SIZE) {
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        const uploadId = \`\${Date.now()}-\${Math.random().toString(36).substring(2)}\`;
        
        for (let j = 0; j < totalChunks; j++) {
            if (onProgress) onProgress(\`Uploading font \${i+1} of \${allFontsToUpload.length}: \${font.name} (Chunk \${j+1} of \${totalChunks})...\`);
            const start = j * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, file.size);
            const chunk = file.slice(start, end);
            
            const fd = new FormData();
            fd.append('chunk', chunk, \`chunk-\${j}\`);
            fd.append('uploadId', uploadId);
            fd.append('chunkIndex', j.toString());
            fd.append('totalChunks', totalChunks.toString());
            fd.append('originalName', file.name);
            
            const chunkRes = await fetch('/api/upload-chunk', { method: 'POST', body: fd });
            if (!chunkRes.ok) {
                const errText = await chunkRes.text().catch(() => '');
                throw new Error(\`Failed to upload \${font.name} chunk \${j} (\${chunkRes.status}): \${errText.substring(0, 100)}\`);
            }
        }
        
        if (onProgress) onProgress(\`Finalizing \${font.name} on server...\`);
        const finishRes = await fetch('/api/upload-chunk-finish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uploadId })
        });
        
        if (!finishRes.ok) {
            const errText = await finishRes.text().catch(() => '');
            throw new Error(\`Failed to finalize \${font.name} (\${finishRes.status}): \${errText.substring(0, 100)}\`);
        }
        
        const data = await finishRes.json();
        serverFontIds[font.id] = data.fontId;
    } else {
        const fd = new FormData();
        fd.append('font', font.file);
        
        const res = await fetch('/api/upload-font', { method: 'POST', body: fd });
        if (!res.ok) {
           const errText = await res.text().catch(() => '');
           throw new Error(\`Failed to upload \${font.name} (\${res.status}): \${errText.substring(0, 100)}\`);
        }
        const __ct_res = res.headers.get('content-type');
        if (__ct_res && __ct_res.includes('text/html')) {
            throw new Error(\`The font "\${font.name}" might be too large for the proxy, or the server is restarting.\`);
        }
        const data = await res.json();
        serverFontIds[font.id] = data.fontId;
    }`;

if (code.includes("const fd = new FormData();\n    fd.append('font', font.file);")) {
    code = code.replace(targetUpload, replaceUpload);
    fs.writeFileSync('src/lib/fontUtils.ts', code);
    console.log("Patched client to support chunked uploads!");
} else {
    console.log("Failed to patch client for chunked uploads!");
}
