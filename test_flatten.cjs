function flattenSubpath(cmds) {
  let pts = [];
  let lastX = 0, lastY = 0;
  for (const cmd of cmds) {
    if (cmd.type === 'M' || cmd.type === 'L') {
      pts.push({x: cmd.x, y: cmd.y});
      lastX = cmd.x; lastY = cmd.y;
    } else if (cmd.type === 'Q') {
      for (let t = 0.1; t <= 1; t += 0.1) {
        let x = (1-t)*(1-t)*lastX + 2*(1-t)*t*cmd.x1 + t*t*cmd.x;
        let y = (1-t)*(1-t)*lastY + 2*(1-t)*t*cmd.y1 + t*t*cmd.y;
        pts.push({x, y});
      }
      lastX = cmd.x; lastY = cmd.y;
    } else if (cmd.type === 'C') {
      for (let t = 0.1; t <= 1; t += 0.1) {
        let x = Math.pow(1-t, 3)*lastX + 3*Math.pow(1-t, 2)*t*cmd.x1 + 3*(1-t)*t*t*cmd.x2 + Math.pow(t, 3)*cmd.x;
        let y = Math.pow(1-t, 3)*lastY + 3*Math.pow(1-t, 2)*t*cmd.y1 + 3*(1-t)*t*t*cmd.y2 + Math.pow(t, 3)*cmd.y;
        pts.push({x, y});
      }
      lastX = cmd.x; lastY = cmd.y;
    } else if (cmd.type === 'Z') {
      // close
    }
  }
  return pts;
}

const cmds = [{type: 'M', x: 0, y: 0}, {type: 'C', x1: 50, y1: 100, x2: 100, y2: 100, x: 100, y: 0}];
console.log(flattenSubpath(cmds));
