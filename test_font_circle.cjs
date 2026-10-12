const opentype = require('opentype.js');
const Jimp = require('jimp');
const potrace = require('potrace');
const svgPathParser = require('svg-path-parser');
const { parseSVG, makeAbsolute } = svgPathParser;
const fs = require('fs');

new Jimp(100, 100, 0xFFFFFFFF, (err, image) => {
  for(let y=0; y<100; y++) {
    for(let x=0; x<100; x++) {
      let dx = x - 50; let dy = y - 50;
      if (dx*dx + dy*dy <= 40*40) {
        image.setPixelColor(0x000000FF, x, y);
      }
    }
  }
  for(let y=0; y<100; y++) {
    for(let x=0; x<100; x++) {
      let dx = x - 50; let dy = y - 50;
      if (dx*dx + dy*dy <= 20*20) {
        image.setPixelColor(0xFFFFFFFF, x, y);
      }
    }
  }
  
  potrace.trace(image, { threshold: 128, optCurve: true, turdSize: 20, optTolerance: 1.5 }, (err, svg) => {
    const match = svg.match(/d="([^"]+)"/);
    const pathData = match ? match[1] : '';
    const commands = makeAbsolute(parseSVG(pathData)).map(cmd => {
      // Map to rawCommands format like fontUtils
      if (cmd.code === 'M') return { type: 'M', x: cmd.x, y: cmd.y };
      if (cmd.code === 'C') return { type: 'C', x1: cmd.x1, y1: cmd.y1, x2: cmd.x2, y2: cmd.y2, x: cmd.x, y: cmd.y };
      if (cmd.code === 'L') return { type: 'L', x: cmd.x, y: cmd.y };
      return cmd;
    });

    const EM = 1000;
    const width = 100, height = 100;
    const scale = EM / Math.max(width, height);
    const offsetX = 0;
    const offsetY = (EM - (height * scale)) / 2;
    const newPath = new opentype.Path();
    
    const rawCommands = [];
    for (const cmd of commands) {
      const num = (v) => isNaN(v) ? 0 : v;
      if (cmd.type === 'M') rawCommands.push({ type: 'M', x: Math.round(num(offsetX + cmd.x * scale)), y: Math.round(num(offsetY + (height * scale - (cmd.y * scale)))) - 200 });
      else if (cmd.type === 'L') rawCommands.push({ type: 'L', x: Math.round(num(offsetX + cmd.x * scale)), y: Math.round(num(offsetY + (height * scale - (cmd.y * scale)))) - 200 });
      else if (cmd.type === 'C') rawCommands.push({ type: 'C', 
          x1: Math.round(num(offsetX + cmd.x1 * scale)), y1: Math.round(num(offsetY + (height * scale - (cmd.y1 * scale)))) - 200, 
          x2: Math.round(num(offsetX + cmd.x2 * scale)), y2: Math.round(num(offsetY + (height * scale - (cmd.y2 * scale)))) - 200, 
          x: Math.round(num(offsetX + cmd.x * scale)), y: Math.round(num(offsetY + (height * scale - (cmd.y * scale)))) - 200 
      });
    }

    const subpaths = [];
    let current = [];
    for(let cmd of rawCommands) {
        if (cmd.type === 'M' && current.length) {
            subpaths.push(current);
            current = [];
        }
        current.push(cmd);
    }
    if (current.length) subpaths.push(current);
    
    // Copy the logic from fontUtils.ts EXACTLY:
    const flattenSubpath = (cmds) => {
        let pts = [];
        let lastX = 0, lastY = 0;
        for (const cmd of cmds) {
            if (cmd.type === 'M' || cmd.type === 'L') {
                pts.push({x: cmd.x, y: cmd.y});
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
          else if (cmd.type === 'C') reversed.push({ type: 'C', x1: cmd.x2, y1: cmd.y2, x2: cmd.x1, y2: cmd.y1, x: prevX, y: prevY });
        }
        return reversed;
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
        const finalCmds = needsReverse ? reverseSubpath(subpaths[i]) : subpaths[i];
        
        for (const cmd of finalCmds) {
          if (cmd.type === 'M') newPath.moveTo(cmd.x, cmd.y);
          else if (cmd.type === 'L') newPath.lineTo(cmd.x, cmd.y);
          else if (cmd.type === 'C') newPath.curveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y);
        }
        newPath.close(); // Important for each subpath? Potrace doesn't use Z, so we add close() for opentype.
    }
    
    const font = new opentype.Font({
      familyName: "Test", styleName: "Regular", unitsPerEm: 1000, ascender: 800, descender: -200,
      glyphs: [
        new opentype.Glyph({ name: ".notdef", unicode: 0, advanceWidth: 500, path: new opentype.Path() }),
        new opentype.Glyph({ name: "A", unicode: 65, advanceWidth: 500, path: newPath })
      ]
    });
    fs.writeFileSync('test_circle_out.ttf', Buffer.from(font.toArrayBuffer()));
    console.log("Wrote test_circle_out.ttf");
  });
});
