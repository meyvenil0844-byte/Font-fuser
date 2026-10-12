const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetWorker = `    const worker = new Worker(workerPath, {
      workerData: {`;

const replaceWorker = `    const worker = new Worker(workerPath, {
      execArgv: ['--max-old-space-size=4096', '--expose-gc'],
      workerData: {`;

if (code.includes(targetWorker)) {
    code = code.replace(targetWorker, replaceWorker);
    fs.writeFileSync('server.ts', code);
    console.log("Patched worker memory!");
} else {
    console.log("Failed to patch worker memory!");
}
