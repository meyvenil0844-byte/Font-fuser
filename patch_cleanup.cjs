const fs = require('fs');
let content = fs.readFileSync('src/lib/workspace.ts', 'utf8');

content = content.replace(
  /workspace\.fonts\.forEach\(f => activeIds\.add\(f\.id\)\);/g,
  `workspace.fonts.forEach(f => { if (f) activeIds.add(f.id); });`
);

content = content.replace(
  /fusion\.fonts\.forEach\(f => activeIds\.add\(f\.id\)\);/g,
  `fusion.fonts.forEach(f => { if (f) activeIds.add(f.id); });`
);

fs.writeFileSync('src/lib/workspace.ts', content);
