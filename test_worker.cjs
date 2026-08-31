const { Worker } = require('worker_threads');
const path = require('path');
const fs = require('fs');

const workerPath = path.join(process.cwd(), 'fuseWorker.cjs');
const worker = new Worker(workerPath, {
  workerData: {
    glyphMap: { "65": "dummy.ttf" }, // Just a dummy
    baseFontId: "dummy_base.ttf",
    serverFontIds: { "dummy_base.ttf": "dummy_base.ttf", "dummy.ttf": "dummy.ttf" },
    uploadDir: process.cwd()
  }
});
worker.on('message', console.log);
worker.on('error', console.error);
worker.on('exit', (c) => console.log('Exit code:', c));
