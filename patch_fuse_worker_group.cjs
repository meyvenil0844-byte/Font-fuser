const fs = require('fs');
let code = fs.readFileSync('fuseWorker.cjs', 'utf8');

const targetLoop = `  const mappedCodepoints = new Set(Object.keys(glyphMap).map(Number));
  let missingCount = 0;
  let hitLimit = false;
  let processed = 0;
  
  for (const cp of mappedCodepoints) {
    const targetFontId = glyphMap[String(cp)];
    const targetFont = getTargetFont(targetFontId);
    if (!targetFont) continue;`;

const replaceLoop = `  const mappedCodepoints = new Set(Object.keys(glyphMap).map(Number));
  let missingCount = 0;
  let hitLimit = false;
  let processed = 0;
  
  // Group codepoints by targetFontId so we only load one target font into memory at a time
  const fontToCps = {};
  for (const cp of mappedCodepoints) {
      const targetFontId = glyphMap[String(cp)];
      if (!fontToCps[targetFontId]) fontToCps[targetFontId] = [];
      fontToCps[targetFontId].push(cp);
  }
  
  for (const targetFontId of Object.keys(fontToCps)) {
      const cps = fontToCps[targetFontId];
      const targetFont = getTargetFont(targetFontId);
      if (!targetFont) continue;
      
      for (const cp of cps) {`;

code = code.replace(targetLoop, replaceLoop);
fs.writeFileSync('fuseWorker.cjs', code);
console.log("Patched fuseWorker to group codepoints!");
