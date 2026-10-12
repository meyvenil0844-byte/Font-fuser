const isInside = (pt, pts) => {
    let inside = false;
    let testX = pt.x + 0.0000123;
    let testY = pt.y + 0.0000123;
    if (pts.length === 0) return false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      let xi = pts[i].x, yi = pts[i].y;
      let xj = pts[j].x, yj = pts[j].y;
      let intersect = ((yi > testY) !== (yj > testY))
          && (testX < (xj - xi) * (testY - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
};

const outer = [{x: 0, y: 0}, {x: 100, y: 0}, {x: 100, y: 100}, {x: 0, y: 100}];
const inner = [{x: 0, y: 0}, {x: 50, y: 0}, {x: 50, y: 50}, {x: 0, y: 50}]; // Shares boundary!

let inside = false;
for (const pt of inner) {
    if (isInside(pt, outer)) {
        inside = true; break;
    }
}
console.log("Shares boundary, is inside?", inside);

const inner2 = [{x: 25, y: 25}, {x: 75, y: 25}, {x: 75, y: 75}, {x: 25, y: 75}];
let inside2 = false;
for (const pt of inner2) {
    if (isInside(pt, outer)) {
        inside2 = true; break;
    }
}
console.log("Strictly inside, is inside?", inside2);
