const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');

const fontPath = 'target.ttf';
const numFonts = 10;
const uploadDir = '/tmp/fontfuser-uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const baseId = 'base-id';
fs.copyFileSync(fontPath, path.join(uploadDir, baseId));

const serverFontIds = { [baseId]: baseId };
const glyphMap = {};
// Let's create multiple fonts
for(let i=0; i<numFonts; i++) {
    const id = `target-${i}`;
    fs.copyFileSync(fontPath, path.join(uploadDir, id));
    serverFontIds[id] = id;
    glyphMap[65+i] = id; // map A, B, C etc to different fonts
}

const worker = fork('fuseWorker.cjs', [], { execArgv: ['--max-old-space-size=1536', '--expose-gc'] });
worker.on('message', m => console.log('WORKER:', m));
worker.on('error', e => console.error('WORKER ERR:', e));
worker.on('exit', (code, sig) => console.log('WORKER EXIT:', code, sig));
worker.send({
    glyphMap,
    baseFontId: baseId,
    serverFontIds,
    uploadDir
});
