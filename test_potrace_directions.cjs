const Jimp = require('jimp');
const potrace = require('potrace');
const svgPathParser = require('svg-path-parser');
const { parseSVG, makeAbsolute } = svgPathParser;

new Jimp(100, 100, 0xFFFFFFFF, (err, image) => {
  for(let y=10; y<90; y++) {
    for(let x=10; x<90; x++) {
      image.setPixelColor(0x000000FF, x, y);
    }
  }
  for(let y=30; y<70; y++) {
    for(let x=30; x<70; x++) {
      image.setPixelColor(0xFFFFFFFF, x, y);
    }
  }
  
  potrace.trace(image, (err, svg) => {
    const match = svg.match(/d="([^"]+)"/);
    const pathData = match ? match[1] : '';
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
    
    console.log("Outer area:", shoelaceArea(subpaths[0]));
    console.log("Inner area:", shoelaceArea(subpaths[1]));
  });
});
