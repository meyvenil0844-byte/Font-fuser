const fs = require('fs');
let code = fs.readFileSync('src/lib/fontUtils.ts', 'utf8');

const oldCode = `  for (let i = 0; i < subpaths.length; i++) {
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

const newCode = `  for (let i = 0; i < subpaths.length; i++) {
    let nestCount = 0;
    const b1 = subpathBounds[i];
    const pts1 = flattenedSubpaths[i];
    
    for (let j = 0; j < subpaths.length; j++) {
      if (i === j) continue;
      const b2 = subpathBounds[j];
      const pts2 = flattenedSubpaths[j];
      
      // Quick bounding box check: b1 must be completely inside b2 (or touch)
      if (b1.minX >= b2.minX && b1.maxX <= b2.maxX && b1.minY >= b2.minY && b1.maxY <= b2.maxY) {
        // Find if ANY point of subpath i is strictly inside subpath j
        let inside = false;
        for (let k = 0; k < pts1.length; k += Math.max(1, Math.floor(pts1.length / 10))) { // Test up to 10 points for robustness
           // slightly offset test point to avoid exact boundary collisions
           let testPt = { x: pts1[k].x + 0.001234, y: pts1[k].y + 0.001234 };
           if (isInside(testPt, pts2)) {
             inside = true;
             break;
           }
        }
        if (inside) nestCount++;
      }
    }
    
    // In TrueType fonts, outer contours should be Clockwise (Area < 0 in standard Cartesian).
    // Because we inverted Y axis earlier, the shoelace area might be inverted.
    // Instead of relying on absolute CCW/CW matching to TrueType specs which can be fragile,
    // we just ensure all OUTER contours go one way, and all INNER holes go the opposite way.
    // Potrace outputs all paths in the SAME direction (using evenodd).
    // We just need to reverse the holes!
    let needsReverse = (nestCount % 2 !== 0);
    const finalCmds = needsReverse ? reverseSubpath(subpaths[i]) : subpaths[i];`;

code = code.replace(oldCode, newCode);

const oldIsInside = `  const isInside = (pt, pts) => {
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
  };`;

const newIsInside = `  const isInside = (pt, pts) => {
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
  };`;
// Actually, isInside stays the same since I added the offset in the loop above.
code = code.replace(oldIsInside, newIsInside);

fs.writeFileSync('src/lib/fontUtils.ts', code);
console.log("Patched!");
