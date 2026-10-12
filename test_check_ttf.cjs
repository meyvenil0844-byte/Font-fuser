const opentype = require('opentype.js');
const font = opentype.parse(require('fs').readFileSync('test_circle_out.ttf'));
const glyph = font.charToGlyph('A');
console.log("Commands:", glyph.path.commands.length);

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
        } else if (cmd.type === 'Q') {
            for (let t = 0.2; t <= 1; t += 0.2) {
                let x = (1-t)*(1-t)*lastX + 2*(1-t)*t*cmd.x1 + t*t*cmd.x;
                let y = (1-t)*(1-t)*lastY + 2*(1-t)*t*cmd.y1 + t*t*cmd.y;
                pts.push({x, y});
            }
            lastX = cmd.x; lastY = cmd.y;
        }
    }
    return pts;
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

let subpaths = [];
let current = [];
for(let cmd of glyph.path.commands) {
    if (cmd.type === 'M' && current.length) {
        subpaths.push(current);
        current = [];
    }
    current.push(cmd);
}
if (current.length) subpaths.push(current);

for(let i=0; i<subpaths.length; i++) {
    let pts = flattenSubpath(subpaths[i]);
    let area = shoelaceArea(pts);
    console.log(`Subpath ${i} area: ${area} (CW? ${area < 0}, CCW? ${area > 0})`);
}
