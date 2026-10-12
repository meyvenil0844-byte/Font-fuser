const fs = require('fs');

let worker = fs.readFileSync('fuseWorker.cjs', 'utf8');

// The error was caused by my aggressive memory wipe script from the previous step trying to assign `null` to variables declared with `const`.
// Let's replace the `const` declarations with `let` so they can be nulled out for GC.

worker = worker.replace('const parsedFontsCache = new Map();', 'let parsedFontsCache = new Map();');
worker = worker.replace('const fontToCps = {};', 'let fontToCps = {};');
worker = worker.replace('const glyphMap = ', 'let glyphMap = ');

fs.writeFileSync('fuseWorker.cjs', worker);
console.log("Patched consts to let!");
