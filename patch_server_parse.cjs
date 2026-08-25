const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

content = content.replace(
  /try \{ res\.json\(\{ commands: makeAbsolute\(parseSVG\(pathData\)\), width, height \}\); \} catch\(e\) \{ res\.json\(\{ commands: \[\], width, height \}\); \}/,
  'res.json({ pathData, width, height });'
);

// Also remove svg-path-parser import as we don't need it anymore, it might be causing memory issues
content = content.replace(/import svgPathParser from "svg-path-parser";\\nconst \\{ parseSVG, makeAbsolute \\} = svgPathParser;\\n/, '');

fs.writeFileSync('server.ts', content);
