const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target = `const activeJobs = new Map();`;
const replacement = `const activeJobs = new Map();

// Periodic cleanup of old uploaded files (older than 1 hour)
setInterval(() => {
  try {
    const now = Date.now();
    fs.readdirSync(uploadDir).forEach(f => {
      const filePath = path.join(uploadDir, f);
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > 60 * 60 * 1000) {
        fs.unlinkSync(filePath);
        console.log('Cleaned up old file:', f);
      }
    });
  } catch(e) {
    console.error('Periodic cleanup error:', e);
  }
}, 15 * 60 * 1000); // Check every 15 minutes
`;

code = code.replace(target, replacement);

fs.writeFileSync('server.ts', code);
console.log("Patched server.ts with cleanup");
