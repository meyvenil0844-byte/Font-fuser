const fs = require('fs');
let content = fs.readFileSync('src/lib/workspace.ts', 'utf8');

content = content.replace(
  /const parsed = await parseFont\(file\);\s*const fontFamilyName = `FontFuser_\$\{sf\.id\}`;/g,
  `const fontFamilyName = \`FontFuser_\${sf.id}\`;`
);

content = content.replace(
  /color: sf\.color,\s*parsed,/g,
  `color: sf.color,`
);

fs.writeFileSync('src/lib/workspace.ts', content);
