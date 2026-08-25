const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace("execArgv: ['--max-old-space-size=4096'],", "");

fs.writeFileSync('server.ts', code);
