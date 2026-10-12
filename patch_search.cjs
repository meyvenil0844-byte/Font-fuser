const fs = require('fs');

let code = fs.readFileSync('src/components/UnicodeExplorer.tsx', 'utf8');

const target = `      let hexQuery = query.replace(/^(u\\+|0x)/i, '').trim();
      if (/^[0-9a-f]+$/i.test(hexQuery)) {
         const cp = parseInt(hexQuery, 16);
         if (cp >= b.start && cp <= b.end) return true;
      }`;

const replace = `      // Enhanced Unicode searching
      // e.g. "0041", "U+0041", "0x0041", "\\u0041"
      let hexQuery = query.replace(/^(u\\+?|0x|\\\\u)/i, '').trim();
      if (/^[0-9a-f]{2,6}$/i.test(hexQuery)) {
         const cp = parseInt(hexQuery, 16);
         if (!isNaN(cp) && cp >= b.start && cp <= b.end) return true;
      }`;

if (code.includes(target)) {
    code = code.replace(target, replace);
    fs.writeFileSync('src/components/UnicodeExplorer.tsx', code);
    console.log("Patched hex searching!");
} else {
    console.log("Failed to patch hex searching!");
}
