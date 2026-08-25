const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(
  /const saved = await loadWorkspace\(\);/,
  `// Crash loop detector
        if (sessionStorage.getItem('fontfuser_loading_workspace') === 'true') {
           console.warn("Detected crash during previous workspace load. Clearing workspace to prevent crash loop.");
           sessionStorage.removeItem('fontfuser_loading_workspace');
           const { del } = await import('idb-keyval');
           await del('font-fuser-workspace');
           throw new Error("Workspace cleared due to crash loop.");
        }
        sessionStorage.setItem('fontfuser_loading_workspace', 'true');
        const saved = await loadWorkspace();
        sessionStorage.removeItem('fontfuser_loading_workspace');`
);

fs.writeFileSync('src/App.tsx', content);
