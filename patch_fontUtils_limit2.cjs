const fs = require('fs');
let content = fs.readFileSync('src/lib/fontUtils.ts', 'utf8');

content = content.replace(
  /if \(commands && commands\.length > 30000\) \{[\s\S]*?Please use a simpler, cleaner image with less noise\.'\);\n  \}/,
  `if (commands && commands.length > 4000) {
    throw new Error('Image is too complex, over 4000 path commands. Please use a simpler cleaner image.');
  }`
);

fs.writeFileSync('src/lib/fontUtils.ts', content);
