const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const targetNewProject = `const handleNewProject = (name: string) => {
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

const replaceNewProject = `const handleNewProject = (name: string) => {
    setCurrentProjectName(name);
  };`;

if (code.includes(targetNewProject)) {
    code = code.replace(targetNewProject, replaceNewProject);
    fs.writeFileSync('src/App.tsx', code);
    console.log("Patched handleNewProject in App.tsx");
} else {
    console.log("Could not find handleNewProject");
}
