const reverseSubpath = (cmds) => {
    if (cmds.length === 0) return [];
    const reversed = [];
    let startCmd = cmds[0];
    let lastCmd = cmds.length > 1 ? cmds[cmds.length - 2] : startCmd;
    if (cmds[cmds.length - 1].type !== 'Z') lastCmd = cmds[cmds.length - 1];
    let lastX = lastCmd.x !== undefined ? lastCmd.x : startCmd.x;
    let lastY = lastCmd.y !== undefined ? lastCmd.y : startCmd.y;
    
    reversed.push({ type: 'M', x: lastX, y: lastY });
    for (let i = cmds.length - 1; i > 0; i--) {
      const cmd = cmds[i];
      if (cmd.type === 'Z') continue;
      const prevCmd = cmds[i-1];
      const prevX = prevCmd.x;
      const prevY = prevCmd.y;
      if (cmd.type === 'L') reversed.push({ type: 'L', x: prevX, y: prevY });
      else if (cmd.type === 'Q') reversed.push({ type: 'Q', x1: cmd.x1, y1: cmd.y1, x: prevX, y: prevY });
      else if (cmd.type === 'C') reversed.push({ type: 'C', x1: cmd.x2, y1: cmd.y2, x2: cmd.x1, y2: cmd.y1, x: prevX, y: prevY });
    }
    // reversed.push({ type: 'Z' }); // Wait, if the original ended with Z, we should end with Z? Actually Potrace doesn't use Z, it just loops back to start.
    return reversed;
};

const cmds = [
  { type: 'M', x: 47, y: 31.028 },
  { type: 'C', x1: 37.015, y1: 32.781, x2: 30.857, y2: 40.209, x: 30.857, y: 50.5 },
  { type: 'C', x1: 30.857, y1: 62.117, x2: 38.888, y2: 70.143, x: 50.512, y: 70.143 },
  { type: 'C', x1: 62.116, y1: 70.143, x2: 70.143, y2: 62.107, x: 70.143, y: 50.488 },
  { type: 'C', x1: 70.143, y1: 45.239, x2: 68.365, y2: 40.329, x: 65.132, y: 36.648 },
  { type: 'C', x1: 61.433, y1: 32.436, x2: 53.312, y2: 29.919, x: 47, y: 31.028 }
];

console.log(reverseSubpath(cmds));
