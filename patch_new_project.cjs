const fs = require('fs');

let appCode = fs.readFileSync('src/App.tsx', 'utf8');

// Just to be sure, re-apply the clear logic if it somehow wasn't applied by the previous step
const targetNewProject = `const handleNewProject = (name: string) => {
    setCurrentProjectName(name);
  };`;

const replaceNewProject = `const handleNewProject = (name: string) => {
    setCurrentProjectName(name);
    setFonts([]);
    setGlyphMap({});
    setSelectedCharacters(new Set());
    
    // Clear history
    historyRef.current = [];
    historyIndexRef.current = -1;
    setHistoryLength(0);
    setCurrentHistoryIndex(-1);
  };`;

if (appCode.includes(targetNewProject)) {
    appCode = appCode.replace(targetNewProject, replaceNewProject);
    fs.writeFileSync('src/App.tsx', appCode);
    console.log("Restored workspace clearing in handleNewProject!");
} else {
    console.log("Already applied workspace clearing.");
}
