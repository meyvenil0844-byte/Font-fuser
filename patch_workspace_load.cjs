const fs = require('fs');
let code = fs.readFileSync('src/lib/workspace.ts', 'utf8');

const target = `  // Optimization: Fetch all buffers from IDB concurrently, which is fast and non-blocking
  const bufferPromises = saved.fonts.map(async (sf) => {
    if (!sf) return null;
    let buffer = sf.buffer;
    if (!buffer) {
      try {
        buffer = await get<ArrayBuffer>(\`font-file-\${sf.id}\`);
      } catch (e) {
        console.warn("Failed to get buffer", e);
        return null;
      }
    }
    return { sf, buffer };
  });
  const bufferResults = await Promise.all(bufferPromises);

  // Process sequentially to avoid browser crash/OOM during FontFace loading
  for (const item of bufferResults) {
    if (!item || !item.buffer) {
      if (item) console.warn(\`Font buffer not found for \${item.sf.fileName} (\${item.sf.id})\`);
      continue;
    }
    const { sf, buffer } = item;`;

const replace = `  // Process sequentially to avoid browser crash/OOM during FontFace loading AND to avoid IDB overload
  for (const sf of saved.fonts) {
    if (!sf) continue;
    let buffer = sf.buffer;
    if (!buffer) {
      try {
        buffer = await get<ArrayBuffer>(\`font-file-\${sf.id}\`);
      } catch (e) {
        console.warn("Failed to get buffer", e);
        continue;
      }
    }
    if (!buffer) {
      console.warn(\`Font buffer not found for \${sf.fileName} (\${sf.id})\`);
      continue;
    }`;

if (code.includes(target)) {
  code = code.replace(target, replace);
  fs.writeFileSync('src/lib/workspace.ts', code);
  console.log("Patched workspace load!");
} else {
  console.log("Failed to find target in workspace.ts");
}
