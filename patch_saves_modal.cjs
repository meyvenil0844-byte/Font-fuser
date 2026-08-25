const fs = require('fs');
let content = fs.readFileSync('src/components/SavesModal.tsx', 'utf8');

content = content.replace(
  /await saveNamedFusion\(newName\.trim\(\), currentFonts, currentGlyphMap\);\n\s*setNewName\(''\);\n\s*await loadList\(\);\n\s*setIsLoading\(false\);/,
  `try {
      await saveNamedFusion(newName.trim(), currentFonts, currentGlyphMap);
      setNewName('');
      await loadList();
    } catch (err: any) {
      alert("Failed to save: " + (err.message || "Storage limit exceeded. Try deleting old saves."));
    } finally {
      setIsLoading(false);
    }`
);

fs.writeFileSync('src/components/SavesModal.tsx', content);
