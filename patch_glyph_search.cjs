const fs = require('fs');
let code = fs.readFileSync('src/components/UnicodeExplorer.tsx', 'utf8');

const target = `         const hex = cp.toString(16).toUpperCase().padStart(4, '0');
         if (hex.toLowerCase().includes(query)) match = true;
         if (charStr && charStr.toLowerCase() === query) match = true;
         
         if (!match) continue;`;

const replace = `         const hex = cp.toString(16).toUpperCase().padStart(4, '0');
         if (hex.toLowerCase().includes(query)) match = true;
         if (charStr && charStr.toLowerCase() === query) match = true;
         
         // Also match formats like "U+0041" or "0x0041" in the bottom filter box
         let cleanQuery = query.replace(/^(u\\+?|0x|\\\\u)/i, '').trim();
         if (cleanQuery && hex.toLowerCase().includes(cleanQuery)) match = true;
         
         if (!match) continue;`;

if (code.includes(target)) {
    code = code.replace(target, replace);
    fs.writeFileSync('src/components/UnicodeExplorer.tsx', code);
    console.log("Patched bottom glyph filter!");
} else {
    console.log("Failed to patch bottom filter!");
}
