const Jimp = require('jimp');
const potrace = require('potrace');
const fs = require('fs');

new Jimp(200, 200, '#ffffff', (err, image) => {
  for (let i = 50; i < 150; i++) {
    for (let j = 50; j < 150; j++) {
      image.setPixelColor(0x000000ff, i, j);
    }
  }
  potrace.trace(image, { threshold: 128, optCurve: true, turdSize: 2 }, (err, svg) => {
    const match = svg.match(/d="([^"]+)"/);
    const pathData = match ? match[1] : '';
    console.log("Path:", pathData);
    const svgPathParser = require('svg-path-parser');
    const { parseSVG, makeAbsolute } = svgPathParser;
    const commands = makeAbsolute(parseSVG(pathData));
    console.log("Commands:", commands.length);
    fs.writeFileSync('test_commands.json', JSON.stringify(commands));
  });
});
