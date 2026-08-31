const fs = require('fs');
let code = fs.readFileSync('src/lib/fontUtils.ts', 'utf8');

const target = `  if (onProgress) onProgress('Uploading base font...');
  await uploadFont(baseFontInfo);

  for (let i = 0; i < fonts.length; i++) {
    const font = fonts[i];
    if (font.id !== baseFontInfo.id && font.file) {
      if (onProgress) onProgress(\`Uploading font \${i+1} of \${fonts.length}...\`);
      await uploadFont(font);
    }
  }`;

const replacement = `  if (onProgress) onProgress('Uploading fonts to server...');
  
  const allFontsToUpload = [baseFontInfo];
  for (const font of fonts) {
    if (font.id !== baseFontInfo.id && font.file) {
      allFontsToUpload.push(font);
    }
  }

  // Batch upload in chunks of 50 to avoid any limits
  const BATCH_SIZE = 50;
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
    const data = await res.json();
    for (let j = 0; j < chunk.length; j++) {
       serverFontIds[chunk[j].id] = data.fontIds[j];
    }
  }`;

code = code.replace(target, replacement);

fs.writeFileSync('src/lib/fontUtils.ts', code);
console.log("Patched fontUtils.ts with batch upload");
