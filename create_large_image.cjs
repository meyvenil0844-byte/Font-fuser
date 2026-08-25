const Jimp = require('jimp');
new Jimp(2000, 2000, '#ffffff', (err, image) => {
  for (let i=0; i<2000; i++) {
    for (let j=0; j<2000; j++) {
      if ((i+j)%2 === 0) image.setPixelColor(0x000000ff, i, j);
    }
  }
  image.write('large.png', () => console.log('created'));
});
