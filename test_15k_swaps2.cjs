const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');
const opentype = require('opentype.js');

const font1 = new opentype.Font({
  familyName: "Base", styleName: "Regular", unitsPerEm: 1000, ascender: 800, descender: -200,
  glyphs: [new opentype.Glyph({ name: ".notdef", unicode: 0, advanceWidth: 500, path: new opentype.Path() })]
});
for (let i = 1; i < 20000; i++) {
  font1.glyphs.glyphs.push(new opentype.Glyph({ name: "A"+i, unicode: i, advanceWidth: 500, path: new opentype.Path() }));
}
font1.glyphs.length = 20000;
fs.writeFileSync('base.ttf', Buffer.from(font1.toArrayBuffer()));

const font2 = new opentype.Font({
  familyName: "Target", styleName: "Regular", unitsPerEm: 1000, ascender: 800, descender: -200,
  glyphs: [new opentype.Glyph({ name: ".notdef", unicode: 0, advanceWidth: 500, path: new opentype.Path() }),
           new opentype.Glyph({ name: "X", unicode: 65, advanceWidth: 500, path: new opentype.Path() })]
});
fs.writeFileSync('target.ttf', Buffer.from(font2.toArrayBuffer()));


const glyphMap = {};
for (let i = 1; i < 15000; i++) {
  glyphMap[i] = 'target.ttf';
}

const workerPath = path.join(process.cwd(), 'fuseWorker.cjs');
const worker = new Worker(workerPath, {
  workerData: {
    glyphMap,
    baseFontId: 'base.ttf',
    serverFontIds: { 'base.ttf': 'base.ttf', 'target.ttf': 'target.ttf' },
    uploadDir: process.cwd()
  }
});
worker.on('message', msg => {
  if (msg.type !== 'progress') console.log('Message:', msg);
});
worker.on('error', err => console.log('Error:', err));
worker.on('exit', code => console.log('Exit:', code));
