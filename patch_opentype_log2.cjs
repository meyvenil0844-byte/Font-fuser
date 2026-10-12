const fs = require('fs');
const filePath = 'node_modules/opentype.js/dist/opentype.js';
let code = fs.readFileSync(filePath, 'utf8');

code = code.replace(/    const cffTable = cff_default.make\(font.glyphs/g, `    console.log("Making CFF table");
    const cffTable = cff_default.make(font.glyphs`);
code = code.replace(/    const cmapTable = cmap_default.make/g, `    console.log("Making CMAP table");
    const cmapTable = cmap_default.make`);
code = code.replace(/    const postTable = post_default.make/g, `    console.log("Making POST table");
    const postTable = post_default.make`);

fs.writeFileSync(filePath, code);
