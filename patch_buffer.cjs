const fs = require('fs');
let code = fs.readFileSync('fuseWorker.cjs', 'utf8');

const targetBuffer = `  const outputFilename = 'FusedFont_' + Date.now() + '.ttf';
  const outputPath = path.join(uploadDir, outputFilename);
  
  // Use opentype.js download method to avoid allocating the massive arraybuffer entirely in V8 heap space
  baseFontParsed.download(outputPath);`;

const replaceBuffer = `  const buffer = baseFontParsed.toArrayBuffer();
  const outputFilename = 'FusedFont_' + Date.now() + '.ttf';
  const outputPath = path.join(uploadDir, outputFilename);
  fs.writeFileSync(outputPath, Buffer.from(buffer));`;

if (code.includes(targetBuffer)) {
    code = code.replace(targetBuffer, replaceBuffer);
    fs.writeFileSync('fuseWorker.cjs', code);
    console.log("Restored toArrayBuffer!");
} else {
    console.log("Failed to find target!");
}
