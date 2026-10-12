const fs = require('fs');

const path = 'src/lib/fontUtils.ts';
let code = fs.readFileSync(path, 'utf8');

const targetLoopStart = `  // Upload sequentially to avoid proxy payload size limits and timeouts with large math fonts
  for (let i = 0; i < allFontsToUpload.length; i++) {`;

const targetLoopEnd = `            if (finishRetries > 0) await new Promise(r => setTimeout(r, 2000));
        }
        
        serverFontIds[font.id] = finishData.fontId;
    } else {
        const formData = new FormData();
        formData.append('font', font.file);
        
        let res;
        let retries = 3;
        while (retries > 0) {
            try {
                res = await fetch('/api/upload-font', { method: 'POST', body: formData });
                if (res.ok) break;
            } catch (e) {
                if (retries === 1) throw e;
            }
            retries--;
            if (retries > 0) await new Promise(r => setTimeout(r, 2000));
        }
        
        if (!res || !res.ok) {
           const errText = res ? await res.text().catch(() => '') : '';
           throw new Error(\`Failed to upload \${font.name} (\${res?.status}): \${errText.substring(0, 100)}\`);
        }
        
        const data = await res.json();
        serverFontIds[font.id] = data.fontId;
    }
  }`;

// Actually I'll use sed or manual string replacement.
