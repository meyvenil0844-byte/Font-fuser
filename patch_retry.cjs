const fs = require('fs');
let code = fs.readFileSync('src/lib/fontUtils.ts', 'utf8');

const targetChunkFetch = `            // Add a tiny delay to avoid proxy rate limiting
            await new Promise(r => setTimeout(r, 100));
            const chunkRes = await fetch('/api/upload-chunk', { method: 'POST', body: fd });
            if (!chunkRes.ok) {
                const errText = await chunkRes.text().catch(() => '');
                throw new Error(\`Failed to upload \${font.name} chunk \${j} (\${chunkRes.status}): \${errText.substring(0, 100)}\`);
            }`;

const replaceChunkFetch = `            
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
            }
            
            if (chunkRes && !chunkRes.ok) {
                const errText = await chunkRes.text().catch(() => '');
                throw new Error(\`Failed to upload \${font.name} chunk \${j} (\${chunkRes.status}): \${errText.substring(0, 100)}\`);
            }`;

if (code.includes('const chunkRes = await fetch(\'/api/upload-chunk\'')) {
    code = code.replace(targetChunkFetch, replaceChunkFetch);
    fs.writeFileSync('src/lib/fontUtils.ts', code);
    console.log("Patched retry logic!");
} else {
    console.log("Failed to patch retry logic!");
}
