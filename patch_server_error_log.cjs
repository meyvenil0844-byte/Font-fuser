const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetLog = `app.post('/api/log-error', express.json(), (req, res) => {
  console.error('Client Error:', req.body.message, req.body.stack);
  res.send('ok');
});`;

const replaceLog = `app.post('/api/log-error', express.json(), (req, res) => {
  console.error('Client Error:', req.body.message, req.body.stack);
  fs.appendFileSync('/tmp/client-errors.log', new Date().toISOString() + ' Client Error: ' + req.body.message + '\\n' + req.body.stack + '\\n\\n');
  res.send('ok');
});`;

if (code.includes(targetLog)) {
    code = code.replace(targetLog, replaceLog);
    fs.writeFileSync('server.ts', code);
    console.log("Patched server.ts to log client errors to /tmp/client-errors.log");
}
