const fs = require('fs');
function fastParseSVG(pathStr) {
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
    // Split by comma or space
    const args = argsStr.split(/[\s,]+/).map(Number);
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
const pathData = "M -0 5.052 L -0 10.105 5.250 9.802 L 10.500 9.500 10.805 4.750 L 11.110 -0 5.555 -0 L 0 0 -0 5.052 M 0.286 5.500 C 0.294 8.250, 0.488 9.256, 0.718 7.736 C 0.947 6.216, 0.941 3.966, 0.704 2.736 C 0.467 1.506, 0.279 2.750, 0.286 5.500";
console.log(fastParseSVG(pathData));

const bigPath = pathData.repeat(100000);
const start = Date.now();
const cmds = fastParseSVG(bigPath);
console.log("Time:", Date.now() - start, "ms", cmds.length);
