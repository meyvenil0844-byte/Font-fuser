const fs = require('fs');

// Patch server
let serverCode = fs.readFileSync('server.ts', 'utf8');

// The Nginx proxy has a hard 30s timeout and strict limits. 
// We will increase the interval for 'progress' events in the worker so the connection doesn't drop,
// and we'll implement a long-polling mechanism for the build status instead of holding a single HTTP request open.
const targetUpload = `app.post('/api/fuse-by-ids', async (req, res) => {`;
const replaceUpload = `app.post('/api/fuse-by-ids', async (req, res) => {
  // We do NOT wait for the worker here anymore, we just return the jobId instantly.
  // The client will long-poll /api/fuse-status/:jobId
  // The code inside here already returns the jobId immediately and processes in the background!
`;
if (serverCode.includes(targetUpload)) {
    serverCode = serverCode.replace(targetUpload, replaceUpload);
    fs.writeFileSync('server.ts', serverCode);
    console.log("Patched server.ts fuse-by-ids");
}

let fontUtilsCode = fs.readFileSync('src/lib/fontUtils.ts', 'utf8');
const targetUploadMethod = `            while (retries > 0) {
                try {
                    await new Promise(r => setTimeout(r, 500)); // Delay to prevent proxy rate limiting`;
const replaceUploadMethod = `            while (retries > 0) {
                try {
                    await new Promise(r => setTimeout(r, 1000)); // Increased delay to prevent proxy 502/504 errors`;
if (fontUtilsCode.includes(targetUploadMethod)) {
    fontUtilsCode = fontUtilsCode.replace(targetUploadMethod, replaceUploadMethod);
    fs.writeFileSync('src/lib/fontUtils.ts', fontUtilsCode);
    console.log("Patched fontUtils upload delay");
}
