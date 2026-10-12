const fs = require('fs');
let serverCode = fs.readFileSync('server.ts', 'utf8');
serverCode = serverCode.replace(
    "execArgv: ['--max-old-space-size=2048', '--expose-gc']",
    "execArgv: ['--max-old-space-size=2560', '--expose-gc']"
);
fs.writeFileSync('server.ts', serverCode);
console.log("Patched to 2560MB!");
