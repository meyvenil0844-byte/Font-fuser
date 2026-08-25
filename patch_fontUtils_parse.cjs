const fs = require('fs');
let content = fs.readFileSync('src/lib/fontUtils.ts', 'utf8');

const parserCode = `
function fastParseSVG(pathStr: string) {
  const commands = [];
  const regex = /([MLCZ])([^MLCZ]*)/ig;
  let match;
  while ((match = regex.exec(pathStr)) !== null) {
    const type = match[1].toUpperCase();
    if (type === 'Z') {
       commands.push({ code: 'Z' });
       continue;
    }
    const argsStr = match[2].trim();
    if (!argsStr) continue;
    const args = argsStr.split(/[\\s,]+/).map(Number);
    let i = 0;
    while (i < args.length) {
      if (type === 'M' || type === 'L') {
        if (i + 1 < args.length) {
          commands.push({ code: type, x: args[i], y: args[i+1] });
          i += 2;
        } else break;
      } else if (type === 'C') {
        if (i + 5 < args.length) {
          commands.push({ code: 'C', x1: args[i], y1: args[i+1], x2: args[i+2], y2: args[i+3], x: args[i+4], y: args[i+5] });
          i += 6;
        } else break;
      } else {
        break;
      }
    }
  }
  return commands;
}
`;

content = content.replace(/export async function traceImageToFont/, parserCode + '\nexport async function traceImageToFont');

content = content.replace(
  /const { commands, width, height } = data;/,
  'let { commands, pathData, width, height } = data;\n  if (pathData && !commands) {\n    commands = fastParseSVG(pathData);\n  }'
);

fs.writeFileSync('src/lib/fontUtils.ts', content);
