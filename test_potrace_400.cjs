const potrace = require('potrace');
const Jimp = require('jimp');
new Jimp(400, 400, '#000000', (err, image) => {
  for (let i = 0; i < 400; i++) {
    for (let j = 0; j < 400; j++) {
      if (Math.random() > 0.5) image.setPixelColor(0xFFFFFFFF, i, j);
    }
  }
  console.log("Tracing...");
  potrace.trace(image, (err, svg) => {
    console.log(err ? err : "OK. length=" + svg.length);
  });
});
