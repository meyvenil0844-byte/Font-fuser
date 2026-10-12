const fs = require('fs');

let worker = fs.readFileSync('fuseWorker.cjs', 'utf8');
worker = worker.replace(
  'const { glyphMap, baseFontId, serverFontIds, uploadDir } = workerData;',
  'let { glyphMap, baseFontId, serverFontIds, uploadDir } = workerData;'
);
fs.writeFileSync('fuseWorker.cjs', worker);
console.log("Patched workerData const to let");

let vite = fs.readFileSync('vite.config.ts', 'utf8');
vite = vite.replace(
  "hmr: process.env.DISABLE_HMR !== 'true',",
  "hmr: false,"
);
fs.writeFileSync('vite.config.ts', vite);
console.log("Patched vite HMR");

