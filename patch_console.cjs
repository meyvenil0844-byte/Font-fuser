const fs = require('fs');
const file = 'src/main.tsx';
let code = fs.readFileSync(file, 'utf8');

const patch = `
const originalError = console.error;
console.error = function(...args) {
    if (typeof args[0] === 'string' && (args[0].includes('WebSocket') || args[0].includes('[vite] failed to connect to websocket'))) {
        return;
    }
    if (args[0] && args[0].message && args[0].message.includes('WebSocket')) return;
    originalError.apply(console, args);
};
`;

if (!code.includes('originalError = console.error')) {
    code = patch + '\n' + code;
    fs.writeFileSync(file, code);
    console.log("Patched console.error in main.tsx!");
}
