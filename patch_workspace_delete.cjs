const fs = require('fs');
let content = fs.readFileSync('src/lib/workspace.ts', 'utf8');

content = content.replace(
  /await set\(SAVES_KEY, fusions\.filter\(f => f\.id !== id \|\| f\.name\.toLowerCase\(\) === 'savev' \|\| f\.name\.toLowerCase\(\) === 'mr\. savey' \|\| f\.name\.toLowerCase\(\) === 'saved'\)\);/,
  `await set(SAVES_KEY, fusions.filter(f => f.id !== id));`
);

fs.writeFileSync('src/lib/workspace.ts', content);
