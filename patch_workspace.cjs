const fs = require('fs');
let content = fs.readFileSync('src/lib/workspace.ts', 'utf8');

content = content.replace(
  /for \(const sf of saved\.fonts\) \{/,
  `for (const sf of saved.fonts) {\n    if (!sf) continue;`
);

fs.writeFileSync('src/lib/workspace.ts', content);
