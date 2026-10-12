const opentype = require('opentype.js');

const font = new opentype.Font({
    familyName: 'Target', styleName: 'Reg', unitsPerEm: 1000, ascender: 800, descender: -200,
    glyphs: [new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 650, path: new opentype.Path() })]
});
console.log("outlinesFormat:", font.outlinesFormat);
const sfnt = font.toTables();
console.log("tables included:", sfnt.tables ? sfnt.tables.map(t => t.tableName) : "No tables array");
