const fs = require('fs');
let code = fs.readFileSync('src/lib/fontUtils.ts', 'utf8');

const targetRegex = /const isInside = \(pt, cmds\) => \{[\s\S]*?\/\/ nestCount % 2 === 0 means it's an outer contour\.[\s\S]*?let needsCCW = \(nestCount % 2 === 0\);[\s\S]*?const finalCmds = \(isCCW !== needsCCW\) \? reverseSubpath\(subpaths\[i\]\) : subpaths\[i\];/;

const match = code.match(targetRegex);
if (match) {
    console.log("Found match!");
    const replacement = `const flattenSubpath = (cmds) => {
    let pts = [];
    let lastX = 0, lastY = 0;
    for (const cmd of cmds) {
      if (cmd.type === 'M' || cmd.type === 'L') {
        pts.push({x: cmd.x, y: cmd.y});
        lastX = cmd.x; lastY = cmd.y;
      } else if (cmd.type === 'Q') {
        for (let t = 0.2; t <= 1; t += 0.2) {
          let x = (1-t)*(1-t)*lastX + 2*(1-t)*t*cmd.x1 + t*t*cmd.x;
          let y = (1-t)*(1-t)*lastY + 2*(1-t)*t*cmd.y1 + t*t*cmd.y;
          pts.push({x, y});
        }
        lastX = cmd.x; lastY = cmd.y;
      } else if (cmd.type === 'C') {
        for (let t = 0.2; t <= 1; t += 0.2) {
          let x = Math.pow(1-t, 3)*lastX + 3*Math.pow(1-t, 2)*t*cmd.x1 + 3*(1-t)*t*t*cmd.x2 + Math.pow(t, 3)*cmd.x;
          let y = Math.pow(1-t, 3)*lastY + 3*Math.pow(1-t, 2)*t*cmd.y1 + 3*(1-t)*t*t*cmd.y2 + Math.pow(t, 3)*cmd.y;
          pts.push({x, y});
        }
        lastX = cmd.x; lastY = cmd.y;
      }
    }
    return pts;
  };

  const isInside = (pt, pts) => {
    let inside = false;
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

  const flattenedSubpaths = subpaths.map(cmds => flattenSubpath(cmds));
  const subpathBounds = subpaths.map(cmds => getBounds(cmds));

  for (let i = 0; i < subpaths.length; i++) {
    let nestCount = 0;
    const b1 = subpathBounds[i];
    const pts1 = flattenedSubpaths[i];
    
    for (let j = 0; j < subpaths.length; j++) {
      if (i === j) continue;
      const b2 = subpathBounds[j];
      const pts2 = flattenedSubpaths[j];
      
      if (b1.minX >= b2.minX && b1.maxX <= b2.maxX && b1.minY >= b2.minY && b1.maxY <= b2.maxY) {
        let inside = false;
        for (let k = 0; k < pts1.length; k += Math.max(1, Math.floor(pts1.length / 10))) {
           let testPt = { x: pts1[k].x + 0.001234, y: pts1[k].y + 0.001234 };
           if (isInside(testPt, pts2)) {
             inside = true;
             break;
           }
        }
        if (inside) nestCount++;
      }
    }
    
    let needsReverse = (nestCount % 2 !== 0);
    const finalCmds = needsReverse ? reverseSubpath(subpaths[i]) : subpaths[i];`;
    
    code = code.replace(match[0], replacement);
    fs.writeFileSync('src/lib/fontUtils.ts', code);
    console.log("Successfully replaced!");
} else {
    console.log("Could not match regex.");
}
