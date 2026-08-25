const fs = require('fs');
const commands = JSON.parse(fs.readFileSync('test_commands.json', 'utf8'));

// mock frontend fontUtils logic
const opentype = require('opentype.js');

const width = 200;
const height = 200;

const notdefPath = new opentype.Path();
notdefPath.moveTo(100, 100);
notdefPath.lineTo(400, 100);
notdefPath.lineTo(400, 800);
notdefPath.lineTo(100, 800);
notdefPath.close();
const notdef = new opentype.Glyph({ name: '.notdef', unicode: undefined, advanceWidth: 500, path: notdefPath });

const EM = 1000;
const maxDim = Math.max(1, Math.max(width, height));
const scale = EM / maxDim;
const offsetX = (EM - (width * scale)) / 2;
const offsetY = (EM - (height * scale)) / 2;
const newPath = new opentype.Path();

const rawCommands = [];
for (const cmd of commands) {
  const type = cmd.code ? cmd.code.toUpperCase() : 'Z';
  const num = (v) => isNaN(v) ? 0 : v;
  if (type === 'M') rawCommands.push({ type: 'M', x: Math.round(num(offsetX + cmd.x * scale)), y: Math.round(num(offsetY + (height * scale - (cmd.y * scale)))) - 200 });
  else if (type === 'L') rawCommands.push({ type: 'L', x: Math.round(num(offsetX + cmd.x * scale)), y: Math.round(num(offsetY + (height * scale - (cmd.y * scale)))) - 200 });
  else if (type === 'Q') rawCommands.push({ type: 'Q', x1: Math.round(num(offsetX + cmd.x1 * scale)), y1: Math.round(num(offsetY + (height * scale - (cmd.y1 * scale)))) - 200, x: Math.round(num(offsetX + cmd.x * scale)), y: Math.round(num(offsetY + (height * scale - (cmd.y * scale)))) - 200 });
  else if (type === 'C') rawCommands.push({ type: 'C', x1: Math.round(num(offsetX + cmd.x1 * scale)), y1: Math.round(num(offsetY + (height * scale - (cmd.y1 * scale)))) - 200, x2: Math.round(num(offsetX + cmd.x2 * scale)), y2: Math.round(num(offsetY + (height * scale - (cmd.y2 * scale)))) - 200, x: Math.round(num(offsetX + cmd.x * scale)), y: Math.round(num(offsetY + (height * scale - (cmd.y * scale)))) - 200 });
  else if (type === 'Z') rawCommands.push({ type: 'Z' });
}

const subpaths = [];
let currentSubpath = [];
for (const cmd of rawCommands) {
  if (cmd.type === 'M' && currentSubpath.length > 0) {
    subpaths.push(currentSubpath);
    currentSubpath = [];
  }
  currentSubpath.push(cmd);
  if (cmd.type === 'Z') {
    subpaths.push(currentSubpath);
    currentSubpath = [];
  }
}
if (currentSubpath.length > 0) subpaths.push(currentSubpath);

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

const pointInPolygon = (point, vs) => {
  let x = point[0], y = point[1];
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    let xi = vs[i][0], yi = vs[i][1];
    let xj = vs[j][0], yj = vs[j][1];
    let intersect = ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

const getPathPoints = (cmds) => {
  const pts = [];
  for (const cmd of cmds) {
    if (cmd.x !== undefined && cmd.y !== undefined) pts.push([cmd.x, cmd.y]);
  }
  return pts;
};

const isClockwise = (cmds) => {
  let sum = 0;
  let pts = getPathPoints(cmds);
  if (pts.length < 3) return true;
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    sum += (p2[0] - p1[0]) * (p2[1] + p1[1]);
  }
  return sum > 0;
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

for (const sub of subpaths) {
  let depth = 0;
  const bounds = getBounds(sub);
  const pt = [(bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2];
  
  for (const other of subpaths) {
    if (other === sub) continue;
    const otherBounds = getBounds(other);
    if (bounds.minX > otherBounds.minX && bounds.maxX < otherBounds.maxX &&
        bounds.minY > otherBounds.minY && bounds.maxY < otherBounds.maxY) {
      if (pointInPolygon(pt, getPathPoints(other))) {
        depth++;
      }
    }
  }
  
  const shouldBeClockwise = depth % 2 === 0;
  const isCw = isClockwise(sub);
  
  const finalCmds = (isCw !== shouldBeClockwise) ? reverseSubpath(sub) : sub;
  for (const cmd of finalCmds) {
    if (cmd.type === 'M') newPath.moveTo(cmd.x, cmd.y);
    else if (cmd.type === 'L') newPath.lineTo(cmd.x, cmd.y);
    else if (cmd.type === 'Q') newPath.quadraticCurveTo(cmd.x1, cmd.y1, cmd.x, cmd.y);
    else if (cmd.type === 'C') newPath.curveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y);
    else if (cmd.type === 'Z') newPath.close();
  }
}

const glyphs = [notdef];
glyphs.push(new opentype.Glyph({
  name: 'uni0041',
  unicode: 65,
  advanceWidth: 800,
  path: newPath
}));

const font = new opentype.Font({
  familyName: "TracedFont",
  styleName: 'Regular',
  unitsPerEm: 1000,
  ascender: 800,
  descender: -200,
  glyphs: glyphs,
});

const buffer = font.toArrayBuffer();
fs.writeFileSync('traced_font_test.ttf', Buffer.from(buffer));
console.log("traced_font_test.ttf generated!");
