const fs = require('fs');
const filePath = 'node_modules/opentype.js/dist/opentype.js';
let code = fs.readFileSync(filePath, 'utf8');

const regex = /    if \(version < 2\) \{\s*ops\.push\(\{ name: "endchar", type: "OP", value: 14 \}\);\s*\}[^}]*return ops;/;

code = code.replace(regex, `    if (version < 2) {
      ops.push({ name: "endchar", type: "OP", value: 14 });
    }
    return ops;`);

fs.writeFileSync(filePath, code);
