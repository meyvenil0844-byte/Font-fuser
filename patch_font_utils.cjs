const fs = require('fs');
let content = fs.readFileSync('src/lib/fontUtils.ts', 'utf8');

content = content.replace(
  /if \(commands\.length > 15000\) \{/g,
  `if (commands.length > 3000) {`
);
content = content.replace(
  /over 15,000 path commands/g,
  `over 3,000 path commands`
);

content = content.replace(
  /if \(commands && commands\.length > 4000\) \{/g,
  `if (commands && commands.length > 3000) {`
);
content = content.replace(
  /over 4000 path commands/g,
  `over 3,000 path commands`
);


fs.writeFileSync('src/lib/fontUtils.ts', content);
