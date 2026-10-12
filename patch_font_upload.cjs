const fs = require('fs');
let code = fs.readFileSync('src/lib/fontUtils.ts', 'utf8');

const targetUploadChunk = `  // Batch upload in chunks of 50 to avoid any limits
  const BATCH_SIZE = 5; // Reduced from 50 to prevent payload timeouts
  for (let i = 0; i < allFontsToUpload.length; i += BATCH_SIZE) {
    const chunk = allFontsToUpload.slice(i, i + BATCH_SIZE);
    if (onProgress) onProgress(\`Uploading fonts \${i+1} to \${Math.min(i + BATCH_SIZE, allFontsToUpload.length)} of \${allFontsToUpload.length}...\`);
    
    const fd = new FormData();
    for (const font of chunk) {
      fd.append('fonts', font.file);
    }
    
    const res = await fetch('/api/upload-fonts-batch', { method: 'POST', body: fd });
    if (!res.ok) {
       throw new Error(\`Failed to upload batch: \${res.statusText}\`);
    }
    const __ct_res = res.headers.get('content-type');
    if (__ct_res && __ct_res.includes('text/html')) {
        const text = await res.text().catch(()=>'');
        throw new Error(\`Server returned HTML instead of JSON for \${res.url} (\${res.status}). Response: \${text.substring(0, 100)}\`);
    }
    const data = await res.json();
    for (let j = 0; j < chunk.length; j++) {
       serverFontIds[chunk[j].id] = data.fontIds[j];
    }
  }`;

const replacementUploadChunk = `  // Upload sequentially to avoid proxy payload size limits and timeouts with large math fonts
  for (let i = 0; i < allFontsToUpload.length; i++) {
    const font = allFontsToUpload[i];
    if (onProgress) onProgress(\`Uploading font \${i+1} of \${allFontsToUpload.length}: \${font.name}...\`);
    
    const fd = new FormData();
    fd.append('font', font.file);
    
    const res = await fetch('/api/upload-font', { method: 'POST', body: fd });
    if (!res.ok) {
       throw new Error(\`Failed to upload \${font.name}: \${res.statusText}\`);
    }
    const __ct_res = res.headers.get('content-type');
    if (__ct_res && __ct_res.includes('text/html')) {
        // Fallback for AI Studio proxy if the request was still too large
        throw new Error(\`The font "\${font.name}" might be too large for the proxy, or the server is restarting.\`);
    }
    const data = await res.json();
    serverFontIds[font.id] = data.fontId;
  }`;

if (code.includes(targetUploadChunk)) {
    code = code.replace(targetUploadChunk, replacementUploadChunk);
    fs.writeFileSync('src/lib/fontUtils.ts', code);
    console.log("Patched font upload to be sequential!");
} else {
    console.log("Failed to patch font upload chunk!");
}
