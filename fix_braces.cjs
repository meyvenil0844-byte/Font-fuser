const fs = require('fs');
let code = fs.readFileSync('fuseWorker.cjs', 'utf8');

const targetStr = `  parentPort.postMessage({ type: 'progress', message: 'Generating final font buffer...' });`;
const replaceStr = `    } // End of cp loop
  } // End of targetFontId loop
  
  parentPort.postMessage({ type: 'progress', message: 'Generating final font buffer...' });`;

if (code.includes(targetStr)) {
    code = code.replace(targetStr, replaceStr);
    fs.writeFileSync('fuseWorker.cjs', code);
    console.log("Fixed braces!");
} else {
    console.log("Failed to fix braces!");
}
