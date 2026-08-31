const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const target = `        // Crash loop detector
        if (localStorage.getItem('fontfuser_loading_workspace') === 'true') { 
           console.warn("Detected crash during previous workspace load. Clearing workspace to prevent crash loop.");
           localStorage.removeItem('fontfuser_loading_workspace');
           const { del } = await import('idb-keyval');
           await del('font-fuser-workspace');
           throw new Error("Workspace cleared due to crash loop.");
        }
        localStorage.setItem('fontfuser_loading_workspace', 'true');`;

code = code.replace(target, `        // Removed aggressive crash detector that deletes data on refresh`);
code = code.replace(`        localStorage.removeItem('fontfuser_loading_workspace');\n`, '');

fs.writeFileSync('src/App.tsx', code);
console.log("Patched App.tsx");
