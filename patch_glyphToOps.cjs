const fs = require('fs');
let code = fs.readFileSync('node_modules/opentype.js/dist/opentype.js', 'utf8');

const target = `  function glyphToOps(glyph, version) {
    const ops = [];
    const path = glyph.path;
    if (version < 2) {
      ops.push({ name: "width", type: "NUMBER", value: glyph.advanceWidth });
    }`;

const replace = `
  const glyphOpsCache = new WeakMap();
  function glyphToOps(glyph, version) {
    if (glyphOpsCache.has(glyph.path)) {
       const cached = glyphOpsCache.get(glyph.path);
       if (version < 2) {
          const ops = cached.slice(); // shallow copy
          if (ops.length > 0 && ops[0].name === "width") {
             ops[0] = { name: "width", type: "NUMBER", value: glyph.advanceWidth };
          } else {
             ops.unshift({ name: "width", type: "NUMBER", value: glyph.advanceWidth });
          }
          return ops;
       }
       return cached;
    }

    const ops = [];
    const path = glyph.path;
    if (version < 2) {
      ops.push({ name: "width", type: "NUMBER", value: glyph.advanceWidth });
    }`;

if (code.includes(target)) {
    code = code.replace(target, replace);
    
    // Also we need to save to cache before return
    const returnTarget = `    return ops;
  }
  function makeCharStringsIndex(glyphs, version) {`;
    const returnReplace = `
    glyphOpsCache.set(glyph.path, ops);
    return ops;
  }
  function makeCharStringsIndex(glyphs, version) {`;
    
    if (code.includes(returnTarget)) {
        code = code.replace(returnTarget, returnReplace);
        console.log("Patched glyphToOps!");
        fs.writeFileSync('node_modules/opentype.js/dist/opentype.js', code);
    } else {
        console.log("Failed to patch return of glyphToOps");
    }
} else {
    console.log("Failed to patch glyphToOps");
}
