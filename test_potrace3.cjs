const Jimp = require('jimp');
const potrace = require('potrace');

new Jimp(100, 100, 0xFFFFFF00, (err, image) => {
  for(let y=20; y<80; y++) {
    for(let x=20; x<80; x++) {
      image.setPixelColor(0x000000FF, x, y);
    }
  }
  potrace.trace(image, (err, svg) => {
    console.log(svg);
  });
});
