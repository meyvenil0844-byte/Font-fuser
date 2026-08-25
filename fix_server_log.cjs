const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

content = content.replace(/fs\.appendFileSync\("server_errors\.log", String\(Array\.from\(arguments\)\.join\(" "\)\) \+ "\\n"\); console\.error\("Failed to save to disk:", fsErr\);/g, 
'fs.appendFileSync("server_errors.log", "Failed to save to disk: " + String(fsErr) + "\\n"); console.error("Failed to save to disk:", fsErr);');

content = content.replace(/fs\.appendFileSync\("server_errors\.log", String\(Array\.from\(arguments\)\.join\(" "\)\) \+ "\\n"\); console\.error\("Fusion error:", err\);/g, 
'fs.appendFileSync("server_errors.log", "Fusion error: " + String(err) + "\\n"); console.error("Fusion error:", err);');

fs.writeFileSync('server.ts', content);
