const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /\/\/ Crash loop detector[\s\S]*?localStorage\.removeItem\('fontfuser_loading_workspace'\);/m;
code = code.replace(regex, `const saved = await loadWorkspace();`);

fs.writeFileSync('src/App.tsx', code);
console.log("Patched App.tsx");
