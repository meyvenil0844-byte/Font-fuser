const fs = require('fs');
const filePath = 'node_modules/opentype.js/dist/opentype.js';
let code = fs.readFileSync(filePath, 'utf8');

code = code.replace(/        ops.push\(\{ name: "rrcurveto", type: "OP", value: 8 \}\);\n        x = Math.round\(cmd.x\);\n        y = Math.round\(cmd.y\);\n      \}\n    \}\n    if \(version < 2\) \{\n      ops.push\(\{ name: "endchar", type: "OP", value: 14 \}\);\n    \}\n    return ops;/g, `        ops.push({ name: "rrcurveto", type: "OP", value: 8 });
        x = Math.round(cmd.x);
        y = Math.round(cmd.y);
      }
    }
    if (version < 2) {
      ops.push({ name: "endchar", type: "OP", value: 14 });
    }
    return ops;`);
fs.writeFileSync(filePath, code);
