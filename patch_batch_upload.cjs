const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target = `app.post('/api/upload-font', (req, res, next) => {`;
const replacement = `app.post('/api/upload-fonts-batch', (req, res, next) => {
  upload.array('fonts', 200)(req, res, (err) => {
    if (err) {
      console.error('Multer error in upload-fonts-batch:', err);
      return res.status(400).json({ error: err.message || String(err) });
    }
    next();
  });
}, (req, res) => {
  console.log('Received upload-fonts-batch request');
  if (!req.files || !Array.isArray(req.files)) return res.status(400).json({ error: 'No files uploaded' });
  const fontIds = req.files.map(f => f.filename);
  res.json({ fontIds });
});

app.post('/api/upload-font', (req, res, next) => {`;

code = code.replace(target, replacement);
fs.writeFileSync('server.ts', code);
console.log("Patched server.ts with batch upload");
