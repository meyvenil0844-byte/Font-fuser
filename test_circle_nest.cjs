const svgPathParser = require('svg-path-parser');
const { parseSVG, makeAbsolute } = svgPathParser;

const pathData = "M 44.500 11.214 C 27.573 13.381, 13.503 27.487, 11.234 44.565 C 7.622 71.751, 29.177 93.285, 56.500 89.786 C 73.426 87.619, 87.606 73.386, 89.799 56.362 C 93.301 29.180, 71.772 7.722, 44.500 11.214 M 47 31.028 C 37.015 32.781, 30.857 40.209, 30.857 50.500 C 30.857 62.117, 38.888 70.143, 50.512 70.143 C 62.116 70.143, 70.143 62.107, 70.143 50.488 C 70.143 45.239, 68.365 40.329, 65.132 36.648 C 61.433 32.436, 53.312 29.919, 47 31.028";
const cmds = makeAbsolute(parseSVG(pathData)).map(cmd => {
    // Map to rawCommands format
    if (cmd.code === 'M') return { type: 'M', x: cmd.x, y: cmd.y };
    if (cmd.code === 'C') return { type: 'C', x1: cmd.x1, y1: cmd.y1, x2: cmd.x2, y2: cmd.y2, x: cmd.x, y: cmd.y };
    return cmd;
});

const subpaths = [];
let current = [];
for(let cmd of cmds) {
    if (cmd.type === 'M' && current.length) {
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
