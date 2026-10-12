const fs = require('fs');
let code = fs.readFileSync('fuseWorker.cjs', 'utf8');

const target = `    const newGlyph = new opentype.Glyph({
      name: cp === 0 ? '.null' : (sourceGlyph.name || \`uni\${cp.toString(16).toUpperCase()}\`),
      unicode: cp,
      advanceWidth: Math.round((sourceGlyph.advanceWidth || 0) * scale),
      path: scalePath(sourceGlyph.path, scale, isCFF)
    });`;

const replace = `
    let scaledPath = null;
    if (!targetFont.scaledPathCache) targetFont.scaledPathCache = new Map();
    if (targetFont.scaledPathCache.has(sourceGlyphIndex)) {
        scaledPath = targetFont.scaledPathCache.get(sourceGlyphIndex);
    } else {
        scaledPath = scalePath(sourceGlyph.path, scale, isCFF);
        targetFont.scaledPathCache.set(sourceGlyphIndex, scaledPath);
    }

    const newGlyph = new opentype.Glyph({
      name: cp === 0 ? '.null' : (sourceGlyph.name || \`uni\${cp.toString(16).toUpperCase()}\`),
      unicode: cp,
      advanceWidth: Math.round((sourceGlyph.advanceWidth || 0) * scale),
      path: scaledPath
    });`;

if (code.includes(target)) {
    code = code.replace(target, replace);
    fs.writeFileSync('fuseWorker.cjs', code);
    console.log("Patched fuseWorker.cjs!");
} else {
    console.log("Failed to patch fuseWorker.cjs!");
}
