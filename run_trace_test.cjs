const Jimp = require('jimp');
const potrace = require('potrace');
const fs = require('fs');

new Jimp(200, 200, '#ffffff', (err, image) => {
  image.setPixelColor(0x000000ff, 100, 100);
  potrace.trace(image, { threshold: 128, optCurve: true, turdSize: 2 }, (err, svg) => {
    const match = svg.match(/d="([^"]+)"/);
    const pathData = match ? match[1] : '';
    console.log("Path:", pathData);
    const svgPathParser = require('svg-path-parser');
    const { parseSVG, makeAbsolute } = svgPathParser;
    const commands = makeAbsolute(parseSVG(pathData));
    console.log("Commands:", commands);
    fs.writeFileSync('test_commands.json', JSON.stringify(commands));
  });
});
