const fs = require('fs');
let content = fs.readFileSync('src/lib/fontUtils.ts', 'utf8');

content = content.replace(/3000/g, '25000');
content = content.replace(/3,000/g, '25,000');

fs.writeFileSync('src/lib/fontUtils.ts', content);
