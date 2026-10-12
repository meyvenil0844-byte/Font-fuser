const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetChunk = `    const store = chunkStore.get(uploadId);
    store.chunks[parseInt(chunkIndex)] = req.file.path;
    store.received++;`;

const replaceChunk = `    const store = chunkStore.get(uploadId);
    if (!store.chunks[parseInt(chunkIndex)]) {
        store.received++;
    } else {
        // We are retrying an already received chunk, clean up the old file
        try { fs.unlinkSync(store.chunks[parseInt(chunkIndex)]); } catch(e){}
    }
    store.chunks[parseInt(chunkIndex)] = req.file.path;`;

if (code.includes('store.received++;')) {
    code = code.replace(targetChunk, replaceChunk);
    fs.writeFileSync('server.ts', code);
    console.log("Patched server to handle chunk retries safely!");
} else {
    console.log("Failed to patch server chunk retry!");
}
