const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(/sessionStorage/g, 'localStorage');

fs.writeFileSync('src/App.tsx', content);
