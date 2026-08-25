const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

content = content.replace(/const potrace = require\('potrace'\);/, 'import potrace from "potrace";');
content = content.replace(/const Jimp = require\('jimp'\);/, 'import Jimp from "jimp";');

fs.writeFileSync('server.ts', content);
