const Jimp = require('jimp');
const potrace = require('potrace');

new Jimp(100, 100, 0x00000000, (err, image) => {
  // Add a white square in the middle
  for(let y=20; y<80; y++) {
    for(let x=20; x<80; x++) {
      image.setPixelColor(0xFFFFFFFF, x, y);
    }
  }
  potrace.trace(image, (err, svg) => {
    console.log(svg);
  });
});
