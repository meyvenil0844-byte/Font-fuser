const fs = require('fs');

// Patch fuseWorker.cjs for ultimate GC
let worker = fs.readFileSync('fuseWorker.cjs', 'utf8');
const targetGC = `  parsedFontsCache.clear();
  if (typeof global.gc === 'function') {
    global.gc();
  }`;
const replaceGC = `  
  // SUPER AGGRESSIVE MEMORY FREE
  parsedFontsCache.clear();
  parsedFontsCache = null;
  fontToCps = null;
  glyphMap = null;
  
  if (typeof global.gc === 'function') {
    global.gc();
    global.gc(); // Double sweep
  }`;
if (worker.includes(targetGC)) {
    worker = worker.replace(targetGC, replaceGC);
    fs.writeFileSync('fuseWorker.cjs', worker);
    console.log("Patched worker GC");
}

// Patch server.ts worker heap limit
let server = fs.readFileSync('server.ts', 'utf8');
const targetLimit = `--max-old-space-size=3072`;
const replaceLimit = `--max-old-space-size=3700`; // Push it to 3.7GB for the worker!
if (server.includes(targetLimit)) {
    server = server.replace(targetLimit, replaceLimit);
    fs.writeFileSync('server.ts', server);
    console.log("Patched worker heap limit");
}

// Patch vite.config.ts to silence websocket error
if (fs.existsSync('vite.config.ts')) {
    let vite = fs.readFileSync('vite.config.ts', 'utf8');
    if (!vite.includes('hmr: false')) {
        vite = vite.replace('plugins: [react()],', 'plugins: [react()],\n  server: { hmr: false },');
        fs.writeFileSync('vite.config.ts', vite);
        console.log("Patched vite HMR");
    }
}
