const fs = require('fs');
let code = fs.readFileSync('src/lib/fontUtils.ts', 'utf8');

const targetSize = 'const CHUNK_SIZE = 1 * 1024 * 1024; // 1MB chunks to safely bypass all aggressive reverse proxy limits';
const replaceSize = 'const CHUNK_SIZE = 512 * 1024; // 512KB chunks';
code = code.replace(targetSize, replaceSize);

const targetFetch = "chunkRes = await fetch('/api/upload-chunk', { method: 'POST', body: fd });";
const replaceFetch = "chunkRes = await fetch('/api/upload-chunk?t=' + Date.now() + '_' + Math.random(), { method: 'POST', body: fd });";
code = code.replace(targetFetch, replaceFetch);

const targetRetry = `                    if (retries === 1) throw new Error(\`Network error uploading \${font.name} chunk \${j}: \${e.message}\`);
                }
                retries--;
                if (retries > 0) await new Promise(r => setTimeout(r, 2000)); // Backoff`;

const replaceRetry = `                    if (retries === 1) throw new Error(\`Network error uploading \${font.name} chunk \${j}: \${e.message}\`);
                    console.warn(\`Chunk \${j} failed, retrying... (\${retries-1} left)\`);
                }
                retries--;
                if (retries > 0) await new Promise(r => setTimeout(r, 3000)); // Backoff`;
code = code.replace(targetRetry, replaceRetry);

fs.writeFileSync('src/lib/fontUtils.ts', code);
console.log("Patched fontUtils for chunk 8 fix!");
