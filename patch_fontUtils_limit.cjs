const fs = require('fs');
let content = fs.readFileSync('src/lib/fontUtils.ts', 'utf8');

content = content.replace(
  /if \(\!commands \|\| commands\.length === 0\) \{/,
  `if (commands && commands.length > 30000) {
    throw new Error('Image is too complex (' + commands.length + ' paths). Please use a simpler, cleaner image with less noise.');
  }
  if (!commands || commands.length === 0) {`
);

fs.writeFileSync('src/lib/fontUtils.ts', content);
