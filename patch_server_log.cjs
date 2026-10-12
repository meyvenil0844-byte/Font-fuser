const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

if (!code.includes('fs.appendFileSync')) {
  code = code.replace(/console\.log\((.*?)\);/g, "console.log($1); fs.appendFileSync('server.log', $1 + '\\n');");
  code = code.replace(/console\.error\((.*?)\);/g, "console.error($1); fs.appendFileSync('server.log', 'ERROR: ' + $1 + '\\n');");
  code = `import * as fs from 'fs';\n` + code;
  fs.writeFileSync('server.ts', code);
}
