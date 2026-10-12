const fs = require('fs');
let code = fs.readFileSync('src/lib/fontUtils.ts', 'utf8');

const targetFinish = "finishRes = await fetch('/api/upload-chunk-finish', {";
const replaceFinish = "finishRes = await fetch('/api/upload-chunk-finish?t=' + Date.now(), {";

if (code.includes(targetFinish)) {
    code = code.replace(targetFinish, replaceFinish);
    fs.writeFileSync('src/lib/fontUtils.ts', code);
    console.log("Patched finishRes!");
} else {
    console.log("Failed to patch finishRes!");
}
