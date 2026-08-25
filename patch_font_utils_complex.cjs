const fs = require('fs');
let code = fs.readFileSync('src/lib/fontUtils.ts', 'utf8');

// 1. Fix JPEG -> PNG
code = code.replace(/'image\/jpeg'/g, "'image/png'");
code = code.replace(/", 0\.9"/g, '""'); // remove the 0.9 quality param
code = code.replace(/"\.jpg"/g, '".png"');

// 2. Add proper winding correction logic.
const insertionPointStr = `if (currentSubpath.length > 0) subpaths.push(currentSubpath);`;
const newLogic = `if (currentSubpath.length > 0) subpaths.push(currentSubpath);

  const getBounds = (cmds) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const cmd of cmds) {
      if (cmd.x !== undefined) {
        if (cmd.x < minX) minX = cmd.x;
        if (cmd.x > maxX) maxX = cmd.x;
      }
      if (cmd.y !== undefined) {
        if (cmd.y < minY) minY = cmd.y;
        if (cmd.y > maxY) maxY = cmd.y;
      }
    }
    return { minX, minY, maxX, maxY };
  };

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
    reversed.push({ type: 'Z' });
    return reversed;
  };

  const isInside = (pt, cmds) => {
    let inside = false;
    let pts = [];
    for (const cmd of cmds) {
      if (cmd.x !== undefined) pts.push({x: cmd.x, y: cmd.y});
    }
    if (pts.length === 0) return false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      let xi = pts[i].x, yi = pts[i].y;
      let xj = pts[j].x, yj = pts[j].y;
      let intersect = ((yi > pt.y) !== (yj > pt.y))
          && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  const shoelaceArea = (cmds) => {
    let area = 0;
    let pts = [];
    for (const cmd of cmds) {
      if (cmd.x !== undefined) pts.push({x: cmd.x, y: cmd.y});
    }
    if (pts.length < 3) return 0;
    for (let i = 0; i < pts.length; i++) {
      let j = (i + 1) % pts.length;
      area += (pts[i].x * pts[j].y) - (pts[j].x * pts[i].y);
    }
    return area;
  };
`;

const replaceTarget = `for (let i = 0; i < subpaths.length; i++) {
    const finalCmds = subpaths[i];`;

const replacement = `for (let i = 0; i < subpaths.length; i++) {
    let firstPt = null;
    for (const cmd of subpaths[i]) {
      if (cmd.x !== undefined) { firstPt = {x: cmd.x, y: cmd.y}; break; }
    }
    let nestCount = 0;
    if (firstPt) {
      for (let j = 0; j < subpaths.length; j++) {
        if (i === j) continue;
        const b2 = getBounds(subpaths[j]);
        // Quick bounding box check before expensive raycast
        if (firstPt.x >= b2.minX && firstPt.x <= b2.maxX && firstPt.y >= b2.minY && firstPt.y <= b2.maxY) {
          if (isInside(firstPt, subpaths[j])) nestCount++;
        }
      }
    }
    
    // In CFF fonts, outer contours should be Counter-Clockwise (Area > 0).
    // Inner contours (holes) should be Clockwise (Area < 0).
    // nestCount % 2 === 0 means it's an outer contour.
    let area = shoelaceArea(subpaths[i]);
    let isCCW = area > 0;
    let needsCCW = (nestCount % 2 === 0);
    
    const finalCmds = (isCCW !== needsCCW) ? reverseSubpath(subpaths[i]) : subpaths[i];`;

code = code.replace(insertionPointStr, newLogic);
code = code.replace(replaceTarget, replacement);
fs.writeFileSync('src/lib/fontUtils.ts', code);
console.log("Patched fontUtils.ts");
