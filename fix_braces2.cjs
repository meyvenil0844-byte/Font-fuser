const fs = require('fs');
let code = fs.readFileSync('fuseWorker.cjs', 'utf8');

const targetStr = `    processed++;
    if (processed % 500 === 0) parentPort.postMessage({ type: 'progress', message: \`Fused \${processed} / \${mappedCodepoints.size}\` });
  }
  
    } // End of cp loop
  } // End of targetFontId loop`;

const replaceStr = `    processed++;
    if (processed % 500 === 0) parentPort.postMessage({ type: 'progress', message: \`Fused \${processed} / \${mappedCodepoints.size}\` });
    } // End of cp loop
  } // End of targetFontId loop`;

if (code.includes(targetStr)) {
    code = code.replace(targetStr, replaceStr);
    fs.writeFileSync('fuseWorker.cjs', code);
    console.log("Fixed braces 2!");
} else {
    console.log("Failed to fix braces 2!");
}
