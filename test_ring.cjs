const Jimp = require('jimp');
const potrace = require('potrace');
const svgPathParser = require('svg-path-parser');
const { parseSVG, makeAbsolute } = svgPathParser;

new Jimp(100, 100, 0xFFFFFFFF, (err, image) => {
  // black outer circle (box for simplicity here)
  for(let y=10; y<90; y++) {
    for(let x=10; x<90; x++) {
      image.setPixelColor(0x000000FF, x, y);
    }
  }
  // white inner hole
  for(let y=30; y<70; y++) {
    for(let x=30; x<70; x++) {
      image.setPixelColor(0xFFFFFFFF, x, y);
    }
  }
  
  potrace.trace(image, (err, svg) => {
    const match = svg.match(/d="([^"]+)"/);
    const pathData = match ? match[1] : '';
    console.log(pathData);
    
    // Test the frontend nesting logic exactly as it is in fontUtils.ts
    const cmds = makeAbsolute(parseSVG(pathData));
    const subpaths = [];
    let current = [];
    for(let cmd of cmds) {
        if (cmd.code === 'M' && current.length) {
            subpaths.push(current);
            current = [];
        }
        current.push(cmd);
    }
    if (current.length) subpaths.push(current);
    
    const flattenSubpath = (cmds) => {
      let pts = [];
      let lastX = 0, lastY = 0;
      for (const cmd of cmds) {
        if (cmd.code === 'M' || cmd.code === 'L') {
          pts.push({x: cmd.x, y: cmd.y});
          lastX = cmd.x; lastY = cmd.y;
        }
      }
      return pts;
    };
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
      console.log(`Subpath ${i} nestCount:`, nestCount);
    }
  });
});
