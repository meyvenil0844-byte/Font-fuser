const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');

const glyphMap = {};
for (let i = 0; i < 15000; i++) {
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
