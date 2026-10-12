const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetFinish = "app.post('/api/upload-chunk-finish', (req, res) => {";
const replaceFinish = "app.post('/api/upload-chunk-finish', express.json(), (req, res) => {";

if (code.includes(targetFinish)) {
    code = code.replace(targetFinish, replaceFinish);
    fs.writeFileSync('server.ts', code);
    console.log("Patched express.json() for finish route!");
} else {
    console.log("Failed to patch express.json()!");
}
