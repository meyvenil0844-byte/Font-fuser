const opentype = require('opentype.js');

function createDummyPath(numCommands) {
    const p = new opentype.Path();
    for (let i=0; i<numCommands; i++) {
        p.moveTo(i, i);
        p.lineTo(i+1, i+1);
        p.quadraticCurveTo(i+2, i+2, i+3, i+3);
        p.curveTo(i+4, i+4, i+5, i+5, i+6, i+6);
        p.close();
    }
    return p;
}

function scalePath1(path, scale) {
  const newPath = new opentype.Path();
  for (const cmd of path.commands) {
     if (cmd.type === 'M') newPath.moveTo(Math.round(cmd.x * scale), Math.round(cmd.y * scale));
     else if (cmd.type === 'L') newPath.lineTo(Math.round(cmd.x * scale), Math.round(cmd.y * scale));
     else if (cmd.type === 'Q') newPath.quadraticCurveTo(Math.round(cmd.x1 * scale), Math.round(cmd.y1 * scale), Math.round(cmd.x * scale), Math.round(cmd.y * scale));
     else if (cmd.type === 'C') newPath.curveTo(Math.round(cmd.x1 * scale), Math.round(cmd.y1 * scale), Math.round(cmd.x2 * scale), Math.round(cmd.y2 * scale), Math.round(cmd.x * scale), Math.round(cmd.y * scale));
     else if (cmd.type === 'Z') newPath.close();
  }
  return newPath;
}

function scalePath2(path, scale) {
  const newPath = new opentype.Path();
  const cmds = path.commands;
  const newCmds = new Array(cmds.length);
  for (let i = 0; i < cmds.length; i++) {
     const cmd = cmds[i];
     if (cmd.type === 'M') newCmds[i] = { type: 'M', x: Math.round(cmd.x * scale), y: Math.round(cmd.y * scale) };
     else if (cmd.type === 'L') newCmds[i] = { type: 'L', x: Math.round(cmd.x * scale), y: Math.round(cmd.y * scale) };
     else if (cmd.type === 'Q') newCmds[i] = { type: 'Q', x1: Math.round(cmd.x1 * scale), y1: Math.round(cmd.y1 * scale), x: Math.round(cmd.x * scale), y: Math.round(cmd.y * scale) };
     else if (cmd.type === 'C') newCmds[i] = { type: 'C', x1: Math.round(cmd.x1 * scale), y1: Math.round(cmd.y1 * scale), x2: Math.round(cmd.x2 * scale), y2: Math.round(cmd.y2 * scale), x: Math.round(cmd.x * scale), y: Math.round(cmd.y * scale) };
     else if (cmd.type === 'Z') newCmds[i] = { type: 'Z' };
  }
  newPath.commands = newCmds;
  return newPath;
}

const p = createDummyPath(100000); // 500,000 commands
let s = Date.now();
scalePath1(p, 0.5);
console.log("Method 1:", Date.now() - s, "ms");

s = Date.now();
scalePath2(p, 0.5);
console.log("Method 2:", Date.now() - s, "ms");

