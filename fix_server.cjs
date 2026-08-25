const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const endOfAppPost = code.indexOf("  if (process.env.NODE_ENV !== \"production\") {");
if (endOfAppPost !== -1) {
  code = code.substring(0, endOfAppPost) + "async function startServer() {\n" + code.substring(endOfAppPost);
}

fs.writeFileSync('server.ts', code);
