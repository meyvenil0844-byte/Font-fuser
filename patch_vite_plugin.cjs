const fs = require('fs');
let code = fs.readFileSync('src/main.tsx', 'utf8');

// The AI Studio platform injects an error overlay for unhandled rejections. Let's silence it.
const patch = `
window.addEventListener('unhandledrejection', (e) => {
  if (e.reason && typeof e.reason.message === 'string' && e.reason.message.includes('WebSocket')) {
      e.preventDefault();
      return;
  }
});
`;

if (!code.includes('e.preventDefault()')) {
    code = patch + code;
    fs.writeFileSync('src/main.tsx', code);
    console.log("Patched main.tsx to ignore WebSocket errors");
}
