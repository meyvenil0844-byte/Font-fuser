const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');
const opentype = require('opentype.js');

if (!fs.existsSync('/tmp/fontfuser-uploads')) fs.mkdirSync('/tmp/fontfuser-uploads');

const baseFont = new opentype.Font({ familyName: 'Base', styleName: 'Reg', unitsPerEm: 1000, ascender: 800, descender: -200, glyphs: [new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 650, path: new opentype.Path() })] });
fs.writeFileSync('/tmp/fontfuser-uploads/base.ttf', Buffer.from(baseFont.toArrayBuffer()));

const targetFont = new opentype.Font({ familyName: 'Target', styleName: 'Reg', unitsPerEm: 1000, ascender: 800, descender: -200, glyphs: [new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 650, path: new opentype.Path() })] });
for (let i = 1; i < 28400; i++) {
    const p = new opentype.Path(); p.moveTo(0,0); p.lineTo(10,10);
    const newGlyph = new opentype.Glyph({ name: 'uni'+i, unicode: i, advanceWidth: 650, path: p });
    newGlyph.index = targetFont.glyphs.length;
    targetFont.glyphs.glyphs[targetFont.glyphs.length] = newGlyph;
    targetFont.glyphs.length++;
}
fs.writeFileSync('/tmp/fontfuser-uploads/target.ttf', Buffer.from(targetFont.toArrayBuffer()));

const glyphMap = {};
for (let i = 1; i < 28400; i++) { glyphMap[String(i)] = "targetId"; }

const worker = fork(path.join(__dirname, 'fuseWorker.cjs'), [], { execArgv: ['--max-old-space-size=2048', '--expose-gc'] });
worker.on('message', msg => console.log(msg));
worker.on('exit', (code, sig) => console.log(`Exit ${code} sig ${sig}`));

worker.send({ glyphMap, baseFontId: 'baseId', serverFontIds: { 'baseId': 'base.ttf', 'targetId': 'target.ttf' }, uploadDir: '/tmp/fontfuser-uploads' });
