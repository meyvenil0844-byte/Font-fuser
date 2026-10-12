const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const rawRoute = `
app.post('/api/upload-chunk-raw', (req, res) => {
  try {
    const { uploadId, chunkIndex, totalChunks, originalName } = req.query;
    
    if (!chunkStore.has(uploadId)) {
        chunkStore.set(uploadId, { chunks: new Array(parseInt(totalChunks)), received: 0, originalName });
    }
    
    const store = chunkStore.get(uploadId);
    const chunkPath = path.join(uploadDir, \`\${uploadId}-\${chunkIndex}.tmp\`);
    
    const fileStream = fs.createWriteStream(chunkPath);
    req.pipe(fileStream);
    
    req.on('end', () => {
        if (!store.chunks[parseInt(chunkIndex)]) {
            store.received++;
        }
        store.chunks[parseInt(chunkIndex)] = chunkPath;
        res.json({ success: true, received: store.received, total: parseInt(totalChunks) });
    });
    
    req.on('error', (err) => {
        console.error("Stream error:", err);
        res.status(500).json({ error: err.message });
    });
    
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
`;

code = code.replace("app.post('/api/upload-chunk', upload.single('chunk'), (req, res) => {", rawRoute + "\napp.post('/api/upload-chunk', upload.single('chunk'), (req, res) => {");
fs.writeFileSync('server.ts', code);
console.log("Patched server with raw upload route!");
