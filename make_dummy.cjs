const Jimp = require('jimp');
new Jimp(100, 100, '#ffffff', (err, img) => img.write('dummy.png', () => console.log('ok')));
