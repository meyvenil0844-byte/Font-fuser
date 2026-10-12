const Jimp = require('jimp');

function prepImage(image) {
    const w = image.bitmap.width;
    const h = image.bitmap.height;
    
    let hasTransparency = false;
    for(let y=0; y<h; y++) {
        for(let x=0; x<w; x++) {
            if (Jimp.intToRGBA(image.getPixelColor(x, y)).a < 255) {
                hasTransparency = true;
                break;
            }
        }
        if (hasTransparency) break;
    }
    
    if (hasTransparency) {
        const whiteBg = new Jimp(w, h, 0xFFFFFFFF);
        let opaqueBrightness = 0;
        let opaqueCount = 0;
        for(let y=0; y<h; y++) {
            for(let x=0; x<w; x++) {
                const rgba = Jimp.intToRGBA(image.getPixelColor(x, y));
                if (rgba.a > 128) {
                    opaqueBrightness += (rgba.r + rgba.g + rgba.b) / 3;
                    opaqueCount++;
                }
            }
        }
        if (opaqueCount > 0) opaqueBrightness /= opaqueCount;
        
        if (opaqueBrightness > 128) { // Changed to 128 to be safer
            image.invert();
        }
        
        whiteBg.composite(image, 0, 0);
        image = whiteBg;
    }

    image.greyscale();

    let cornerBrightness = 0;
    const corners = [
      image.getPixelColor(0, 0),
      image.getPixelColor(w - 1, 0),
      image.getPixelColor(0, h - 1),
      image.getPixelColor(w - 1, h - 1)
    ];
    for (let c of corners) {
      const rgb = Jimp.intToRGBA(c);
      cornerBrightness += (rgb.r + rgb.g + rgb.b) / 3;
    }
    cornerBrightness /= 4;

    if (cornerBrightness < 128) {
      image.invert();
    }
    
    image.contrast(0.8);
    return image;
}

new Jimp(10, 10, 0x00000000, (err, img) => {
    // black symbol on transparent
    for(let y=2; y<8; y++) for(let x=2; x<8; x++) img.setPixelColor(0x000000FF, x, y);
    const out = prepImage(img);
    console.log("Black on transparent -> center is black?", Jimp.intToRGBA(out.getPixelColor(5,5)).r === 0);
    console.log("Black on transparent -> corner is white?", Jimp.intToRGBA(out.getPixelColor(0,0)).r === 255);
});
