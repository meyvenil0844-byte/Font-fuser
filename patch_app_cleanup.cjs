const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(
  /import \{ saveWorkspace, loadWorkspace \} from '\.\/lib\/workspace';/,
  `import { saveWorkspace, loadWorkspace, cleanupOrphanedFonts } from './lib/workspace';`
);

content = content.replace(
  /const saved = await loadWorkspace\(\);/,
  `const saved = await loadWorkspace();
        setTimeout(cleanupOrphanedFonts, 5000); // Cleanup in background after 5s`
);

fs.writeFileSync('src/App.tsx', content);
