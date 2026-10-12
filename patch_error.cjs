const fs = require('fs');
let code = fs.readFileSync('src/lib/fontUtils.ts', 'utf8');

const targetUploadErr = `    const res = await fetch('/api/upload-font', { method: 'POST', body: fd });
    if (!res.ok) {
       throw new Error(\`Failed to upload \${font.name}: \${res.statusText}\`);
    }`;

const replaceUploadErr = `    const res = await fetch('/api/upload-font', { method: 'POST', body: fd });
    if (!res.ok) {
       const errText = await res.text().catch(() => '');
       throw new Error(\`Failed to upload \${font.name} (\${res.status}): \${errText.substring(0, 100)}\`);
    }`;

if (code.includes(targetUploadErr)) {
    code = code.replace(targetUploadErr, replaceUploadErr);
    fs.writeFileSync('src/lib/fontUtils.ts', code);
    console.log("Patched font upload error handling!");
} else {
    console.log("Failed to patch font upload error handling!");
}
