const fs = require('fs');
const filePath = 'node_modules/opentype.js/dist/opentype.js';
let code = fs.readFileSync(filePath, 'utf8');

code = code.replace(/    const sfntTable = makeSfntTable\(tables\);/g, `    console.log("makeSfntTable starting");
    const sfntTable = makeSfntTable(tables);`);
code = code.replace(/    const tables = \[headTable, hheaTable, maxpTable, os2Table, nameTable, cmapTable, postTable, cffTable, hmtxTable\];/g, `    console.log("Made all tables");
    const tables = [headTable, hheaTable, maxpTable, os2Table, nameTable, cmapTable, postTable, cffTable, hmtxTable];`);

fs.writeFileSync(filePath, code);
