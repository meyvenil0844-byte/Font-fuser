const fs = require('fs');

let serverCode = fs.readFileSync('server.ts', 'utf8');
serverCode = serverCode.replace("import { Worker } from 'worker_threads';", "import { fork } from 'child_process';");

const targetWorker = `    // Spawn worker
    const workerPath = path.join(process.cwd(), 'fuseWorker.cjs');  
    const worker = new Worker(workerPath, {
      resourceLimits: { maxOldGenerationSizeMb: 4096 },
      workerData: {
        glyphMap,
        baseFontId,
        serverFontIds,
        uploadDir
      }
    });`;

const replaceWorker = `    // Spawn worker
    const workerPath = path.join(process.cwd(), 'fuseWorker.cjs');  
    const worker = fork(workerPath, [], {
      execArgv: ['--max-old-space-size=3584', '--expose-gc']
    });
    worker.send({
        glyphMap,
        baseFontId,
        serverFontIds,
        uploadDir
    });`;

serverCode = serverCode.replace(targetWorker, replaceWorker);
fs.writeFileSync('server.ts', serverCode);
console.log("Patched server.ts for fork!");

let workerCode = fs.readFileSync('fuseWorker.cjs', 'utf8');
workerCode = workerCode.replace("const { parentPort, workerData } = require('worker_threads');", "");
workerCode = workerCode.replace(/parentPort\.postMessage/g, "process.send");

const targetTry = `try {
  const { glyphMap, baseFontId, serverFontIds, uploadDir } = workerData;`;

const replaceTry = `process.on('message', (workerData) => {
try {
  const { glyphMap, baseFontId, serverFontIds, uploadDir } = workerData;`;

workerCode = workerCode.replace(targetTry, replaceTry);

const targetCatch = `} catch (err) {
  process.send({ type: 'error', message: err.message || String(err), stack: err.stack });
}`;

const replaceCatch = `} catch (err) {
  process.send({ type: 'error', message: err.message || String(err), stack: err.stack });
}
});`;

workerCode = workerCode.replace(targetCatch, replaceCatch);
fs.writeFileSync('fuseWorker.cjs', workerCode);
console.log("Patched fuseWorker.cjs for fork!");
