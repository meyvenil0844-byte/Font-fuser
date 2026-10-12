const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const chunkRoute = `
const chunkStore = new Map();

app.post('/api/upload-chunk', upload.single('chunk'), (req, res) => {
  try {
    const { uploadId, chunkIndex, totalChunks, originalName } = req.body;
    if (!req.file) return res.status(400).json({ error: 'No chunk file uploaded' });
    
    if (!chunkStore.has(uploadId)) {
        chunkStore.set(uploadId, { chunks: new Array(parseInt(totalChunks)), received: 0, originalName });
    }
    
    const store = chunkStore.get(uploadId);
    store.chunks[parseInt(chunkIndex)] = req.file.path;
    store.received++;
    
    res.json({ success: true, received: store.received, total: parseInt(totalChunks) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/upload-chunk-finish', (req, res) => {
  try {
    const { uploadId } = req.body;
    const store = chunkStore.get(uploadId);
    
    if (!store) return res.status(404).json({ error: 'Upload ID not found' });
    if (store.received !== store.chunks.length) return res.status(400).json({ error: 'Not all chunks received' });
    
    const finalPath = path.join(uploadDir, \`\${Date.now()}-\${Math.random().toString(36).substring(2,10)}.ttf\`);
    
    // Append all chunks
    for (const chunkPath of store.chunks) {
        if (!chunkPath) continue;
        const data = fs.readFileSync(chunkPath);
        fs.appendFileSync(finalPath, data);
        // Clean up chunk
        try { fs.unlinkSync(chunkPath); } catch(e){}
    }
    
    chunkStore.delete(uploadId);
    
    const filename = path.basename(finalPath);
    res.json({ fontId: filename });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/upload-font', (req, res, next) => {`;

code = code.replace("app.post('/api/upload-font', (req, res, next) => {", chunkRoute);
fs.writeFileSync('server.ts', code);
console.log("Added chunked upload routes to server!");
