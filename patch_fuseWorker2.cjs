const fs = require('fs');
let code = fs.readFileSync('fuseWorker.cjs', 'utf8');

const target1 = `  const parsedFonts = new Map();
  let baseFontParsed = null;
  
  for (const [clientId, serverFilename] of Object.entries(serverFontIds)) {
    const filePath = path.join(uploadDir, serverFilename);
    if (!fs.existsSync(filePath)) {
      throw new Error(\`Uploaded font file missing for \${clientId}\`);
    }
    const buffer = fs.readFileSync(filePath);
    const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    
    const font = opentype.parse(ab);
    parsedFonts.set(clientId, font);
    if (clientId === baseFontId) baseFontParsed = font;
  }`;

const replacement1 = `  let baseFontParsed = null;
  {
    const serverFilename = serverFontIds[baseFontId];
    if (!serverFilename) throw new Error("Base font missing");
    const filePath = path.join(uploadDir, serverFilename);
    if (!fs.existsSync(filePath)) throw new Error("Base font file missing");
    const buffer = fs.readFileSync(filePath);
    const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    baseFontParsed = opentype.parse(ab);
  }
  
  // Cache for target fonts to avoid memory bloat
  const parsedFontsCache = new Map();
  const MAX_CACHE = 100;
  
  function getTargetFont(clientId) {
    if (parsedFontsCache.has(clientId)) return parsedFontsCache.get(clientId);
    const serverFilename = serverFontIds[clientId];
    if (!serverFilename) return null;
    const filePath = path.join(uploadDir, serverFilename);
    if (!fs.existsSync(filePath)) return null;
    
    const buffer = fs.readFileSync(filePath);
    const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const font = opentype.parse(ab);
    
    if (parsedFontsCache.size >= MAX_CACHE) {
      const firstKey = parsedFontsCache.keys().next().value;
      parsedFontsCache.delete(firstKey);
    }
    parsedFontsCache.set(clientId, font);
    return font;
  }`;

code = code.replace(target1, replacement1);

const target2 = `    const targetFont = parsedFonts.get(targetFontId);`;
const replacement2 = `    const targetFont = getTargetFont(targetFontId);`;
code = code.replace(target2, replacement2);

const target3 = `  parsedFonts.clear();`;
const replacement3 = `  parsedFontsCache.clear();`;
code = code.replace(target3, replacement3);

fs.writeFileSync('fuseWorker.cjs', code);
console.log('Patched lazy loading');
