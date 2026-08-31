const fs = require('fs');
let code = fs.readFileSync('src/lib/workspace.ts', 'utf8');

// Replace Promise.all with sequential loop in saveWorkspace
const target1 = `    const savedFonts = await Promise.all(
      fonts.map(async (f) => {
        const fileKey = \`font-file-\${f.id}\`;
        if (!existingKeys.has(fileKey)) {
          const buffer = await f.file.arrayBuffer();
          await set(fileKey, buffer);
        }
        return {
          id: f.id,
          name: f.name,
          fileName: f.fileName,
          color: f.color,
        };
      })
    );`;

const replacement1 = `    const savedFonts = [];
    for (const f of fonts) {
      const fileKey = \`font-file-\${f.id}\`;
      if (!existingKeys.has(fileKey)) {
        const buffer = await f.file.arrayBuffer();
        await set(fileKey, buffer);
      }
      savedFonts.push({
        id: f.id,
        name: f.name,
        fileName: f.fileName,
        color: f.color,
      });
    }`;

code = code.replace(target1, replacement1);

// Replace Promise.all with sequential loop in saveNamedFusion
const target2 = `    const savedFonts = await Promise.all(
      fonts.map(async (f) => {
        const fileKey = \`font-file-\${f.id}\`;
        if (!existingKeys.has(fileKey)) {
          const buffer = await f.file.arrayBuffer();
          await set(fileKey, buffer);
        }
        return {
          id: f.id,
          name: f.name,
          fileName: f.fileName,
          color: f.color,
        };
      })
    );`;

code = code.replace(target2, replacement1);

fs.writeFileSync('src/lib/workspace.ts', code);
console.log("Patched workspace.ts");
