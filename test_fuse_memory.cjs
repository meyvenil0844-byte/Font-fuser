const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');
const opentype = require('opentype.js');

const font1 = new opentype.Font({
  familyName: "Base", styleName: "Regular", unitsPerEm: 1000, ascender: 800, descender: -200,
  glyphs: [new opentype.Glyph({ name: ".notdef", unicode: 0, advanceWidth: 500, path: new opentype.Path() })]
});
for (let i = 1; i < 20000; i++) {
  const p = new opentype.Path();
  for(let j=0; j<50; j++) p.lineTo(j, j); // Some commands
  font1.glyphs.push(i, new opentype.Glyph({ name: "A"+i, unicode: i, advanceWidth: 500, path: p }));
}
fs.writeFileSync('base.ttf', Buffer.from(font1.toArrayBuffer()));
console.log("Base font generated");

const font2 = new opentype.Font({
  familyName: "Target", styleName: "Regular", unitsPerEm: 1000, ascender: 800, descender: -200,
  glyphs: [new opentype.Glyph({ name: ".notdef", unicode: 0, advanceWidth: 500, path: new opentype.Path() })]
});
for (let i = 1; i < 2000; i++) {
  const p = new opentype.Path();
  for(let j=0; j<50; j++) p.lineTo(j, j);
  font2.glyphs.push(i, new opentype.Glyph({ name: "B"+i, unicode: i, advanceWidth: 500, path: p }));
}
fs.writeFileSync('target.ttf', Buffer.from(font2.toArrayBuffer()));
console.log("Target font generated");

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
