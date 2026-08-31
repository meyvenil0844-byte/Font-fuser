const fs = require('fs');
let code = fs.readFileSync('src/lib/fontUtils.ts', 'utf8');

code = code.replace(
  /const fontFace = new FontFace\(\`FontFuser_\$\{id\}\`, buffer\);\s*await fontFace\.load\(\);\s*document\.fonts\.add\(fontFace\);/g,
  `const fontFace = new FontFace(\`FontFuser_\${id}\`, buffer);
  try {
    await fontFace.load();
    document.fonts.add(fontFace);
  } catch(e) {
    console.warn("Failed to load traced fontface", e);
  }`
);

fs.writeFileSync('src/lib/fontUtils.ts', code);
console.log("Patched fontUtils.ts");
