const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetFork = `    const worker = fork(workerPath, [], {
      execArgv: ['--max-old-space-size=3000', '--expose-gc']
    });`;

const replaceFork = `    const worker = fork(workerPath, [], {
      execArgv: ['--max-old-space-size=2048', '--expose-gc'],
      silent: true
    });
    
    worker.stdout.on('data', (data) => fs.appendFileSync('/tmp/worker.log', data.toString()));
    worker.stderr.on('data', (data) => fs.appendFileSync('/tmp/worker.log', data.toString()));`;

if (code.includes(targetFork)) {
    code = code.replace(targetFork, replaceFork);
    fs.writeFileSync('server.ts', code);
    console.log("Patched server.ts worker fork to log to /tmp/worker.log");
} else {
    console.log("Could not find target fork block");
}
