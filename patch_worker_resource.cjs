const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetWorker = `    const worker = new Worker(workerPath, {
      workerData: {`;

const replaceWorker = `    const worker = new Worker(workerPath, {
      resourceLimits: { maxOldGenerationSizeMb: 4096 },
      workerData: {`;

if (code.includes(targetWorker)) {
    code = code.replace(targetWorker, replaceWorker);
    fs.writeFileSync('server.ts', code);
    console.log("Patched worker resourceLimits!");
} else {
    console.log("Failed to patch worker resourceLimits!");
}
