const Jimp = require('jimp');
const potrace = require('potrace');

new Jimp(100, 100, 0xFFFFFFFF, (err, image) => {
  // black outer circle (radius 40, center 50,50)
  for(let y=0; y<100; y++) {
    for(let x=0; x<100; x++) {
      let dx = x - 50; let dy = y - 50;
      if (dx*dx + dy*dy <= 40*40) {
        image.setPixelColor(0x000000FF, x, y);
      }
    }
  }
  // white inner circle (radius 20, center 50,50)
  for(let y=0; y<100; y++) {
    for(let x=0; x<100; x++) {
      let dx = x - 50; let dy = y - 50;
      if (dx*dx + dy*dy <= 20*20) {
        image.setPixelColor(0xFFFFFFFF, x, y);
      }
    }
  }
  
  potrace.trace(image, (err, svg) => {
    console.log(svg);
  });
});
