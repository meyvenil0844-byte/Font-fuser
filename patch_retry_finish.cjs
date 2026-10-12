const fs = require('fs');
let code = fs.readFileSync('src/lib/fontUtils.ts', 'utf8');

const targetFinish = `        if (onProgress) onProgress(\`Finalizing \${font.name} on server...\`);
        const finishRes = await fetch('/api/upload-chunk-finish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uploadId })
        });
        
        if (!finishRes.ok) {
            const errText = await finishRes.text().catch(() => '');
            throw new Error(\`Failed to finalize \${font.name} (\${finishRes.status}): \${errText.substring(0, 100)}\`);
        }`;

const replaceFinish = `        if (onProgress) onProgress(\`Finalizing \${font.name} on server...\`);
        let finishRes;
        let finishRetries = 3;
        while (finishRetries > 0) {
            try {
                finishRes = await fetch('/api/upload-chunk-finish', {
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
            const errText = await finishRes.text().catch(() => '');
            throw new Error(\`Failed to finalize \${font.name} (\${finishRes.status}): \${errText.substring(0, 100)}\`);
        }`;

if (code.includes('const finishRes = await fetch(\'/api/upload-chunk-finish\'')) {
    code = code.replace(targetFinish, replaceFinish);
    fs.writeFileSync('src/lib/fontUtils.ts', code);
    console.log("Patched retry logic for finish!");
} else {
    console.log("Failed to patch retry logic for finish!");
}
