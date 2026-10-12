const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetBlock = `    const worker = fork(workerPath, [], {
      execArgv: ['--max-old-space-size=2048', '--expose-gc'],
      silent: true
    });
    
    worker.stdout.on('data', (data) => fs.appendFileSync('/tmp/worker.log', data.toString()));
    worker.stderr.on('data', (data) => fs.appendFileSync('/tmp/worker.log', data.toString()));`;

const replaceBlock = `    const worker = fork(workerPath, [], {
      execArgv: ['--max-old-space-size=2048', '--expose-gc']
    });`;

if (code.includes(targetBlock)) {
    code = code.replace(targetBlock, replaceBlock);
    fs.writeFileSync('server.ts', code);
    console.log("Reverted logger.");
} else {
    console.log("Not found.");
}
