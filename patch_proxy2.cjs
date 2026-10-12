const fs = require('fs');
let fontUtilsCode = fs.readFileSync('src/lib/fontUtils.ts', 'utf8');

const targetCatch = `                } catch (e) {
                    if (retries === 1) throw new Error(\`Network error uploading \${font.name} chunk \${j}: \${e.message}\`);
                    console.warn(\`Chunk \${j} failed, retrying... (\${retries-1} left)\`);
                }
                retries--;
                if (retries > 0) await new Promise(r => setTimeout(r, 3000)); // Backoff
            }`;
const replaceCatch = `                } catch (e) {
                    console.warn(\`Chunk \${j} failed with \${e.message}, retrying... (\${retries-1} left)\`);
                    if (retries === 1) throw new Error(\`Network error uploading \${font.name} chunk \${j}: \${e.message}. The font might be too large for the proxy, or the server is restarting.\`);
                }
                retries--;
                if (retries > 0) await new Promise(r => setTimeout(r, 5000)); // Longer backoff
            }`;

if (fontUtilsCode.includes(targetCatch)) {
    fontUtilsCode = fontUtilsCode.replace(targetCatch, replaceCatch);
    fs.writeFileSync('src/lib/fontUtils.ts', fontUtilsCode);
    console.log("Patched fontUtils catch block");
}

const targetChunkSize = `const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB chunks`;
const replaceChunkSize = `const CHUNK_SIZE = 1 * 1024 * 1024; // 1MB chunks to avoid Nginx 413/502 errors`;
if (fontUtilsCode.includes(targetChunkSize)) {
    fontUtilsCode = fontUtilsCode.replace(targetChunkSize, replaceChunkSize);
    fs.writeFileSync('src/lib/fontUtils.ts', fontUtilsCode);
    console.log("Patched fontUtils chunk size");
}

