const fs = require('fs');
let code = fs.readFileSync('fuseWorker.cjs', 'utf8');

const targetLog = `process.send({ type: 'progress', message: 'Generating final font buffer...' });`;
const replaceLog = `
    if (typeof global.gc === 'function') {
        global.gc();
        global.gc();
    }
    const memUsage = process.memoryUsage();
    process.send({ type: 'progress', message: 'Generating final font buffer... (Mem: ' + Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB / ' + Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB)' });
`;

if (code.includes(targetLog)) {
    code = code.replace(targetLog, replaceLog);
    fs.writeFileSync('fuseWorker.cjs', code);
    console.log("Patched memory logging!");
} else {
    console.log("Not found.");
}
