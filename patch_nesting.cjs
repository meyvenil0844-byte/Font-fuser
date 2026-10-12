const fs = require('fs');
let code = fs.readFileSync('src/lib/fontUtils.ts', 'utf8');

const target = `  const isInside = (pt, cmds) => {
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

  for (let i = 0; i < subpaths.length; i++) {
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

const replacement = `  const flattenSubpath = (cmds) => {
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

  const shoelaceArea = (pts) => {
    let area = 0;
    if (pts.length < 3) return 0;
    for (let i = 0; i < pts.length; i++) {
      let j = (i + 1) % pts.length;
      area += (pts[i].x * pts[j].y) - (pts[j].x * pts[i].y);
    }
    return area;
  };

  const flattenedSubpaths = subpaths.map(cmds => flattenSubpath(cmds));
  const subpathBounds = subpaths.map(cmds => getBounds(cmds));

  for (let i = 0; i < subpaths.length; i++) {
    let firstPt = null;
    for (const cmd of subpaths[i]) {
      if (cmd.x !== undefined) { firstPt = {x: cmd.x, y: cmd.y}; break; }
    }
    let nestCount = 0;
    if (firstPt) {
      for (let j = 0; j < subpaths.length; j++) {
        if (i === j) continue;
        const b2 = subpathBounds[j];
        if (firstPt.x >= b2.minX && firstPt.x <= b2.maxX && firstPt.y >= b2.minY && firstPt.y <= b2.maxY) {
          if (isInside(firstPt, flattenedSubpaths[j])) nestCount++;
        }
      }
    }
    
    // In TrueType fonts, outer contours should be Clockwise (Area < 0 in standard Cartesian).
    // wait, we inverted Y axis!
    // Since we want standard behavior, we ensure alternating windings based on nest count.
    let area = shoelaceArea(flattenedSubpaths[i]);
    let isCCW = area > 0;
    let needsCCW = (nestCount % 2 === 0);
    
    const finalCmds = (isCCW !== needsCCW) ? reverseSubpath(subpaths[i]) : subpaths[i];`;

if (code.includes(target.substring(0, 100))) {
  code = code.replace(target, replacement);
  fs.writeFileSync('src/lib/fontUtils.ts', code);
  console.log('Patched nesting logic');
} else {
  console.log('Target not found');
}
