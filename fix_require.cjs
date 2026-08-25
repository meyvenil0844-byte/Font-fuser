const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace("const { Worker } = require('worker_threads');", "");

if (!code.includes("import { Worker } from 'worker_threads'")) {
  code = "import { Worker } from 'worker_threads';\n" + code;
}

fs.writeFileSync('server.ts', code);
