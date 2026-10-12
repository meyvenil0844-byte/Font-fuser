const Jimp = require('jimp');

function prepImage(image) {
    const w = image.bitmap.width;
    const h = image.bitmap.height;
    
    let hasTransparency = false;
    
    // Check for transparency
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
        // If there's transparency, we can assume the opaque parts are the symbol.
        // We'll turn opaque parts black, and transparent parts white.
        // Wait, what if the symbol is dark, and the background is semi-transparent?
        // Better: composite over white, then see if we need to invert.
        const whiteBg = new Jimp(w, h, 0xFFFFFFFF);
        // But if the symbol is white on transparent, composite over white makes it all white.
        // Let's check the average brightness of the opaque pixels.
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
        if (opaqueCount > 0) {
            opaqueBrightness /= opaqueCount;
        }
        
        // If the opaque parts are very light (e.g. white symbol), we should invert the rgb BEFORE compositing over white.
        // Or we just force opaque parts to be black, since we only care about the shape for the font!
        // Actually, if it's a font, we only care about the shape. But wait, what if it's a colored emoji?
        // Usually, for fonts, transparency DEFINES the shape!
        // Let's just use the alpha channel to define the shape if there is significant transparency?
        // No, some people have a black symbol on a transparent background, and the symbol has holes.
        // If we just flatten onto white:
        if (opaqueBrightness > 200) {
            // White symbol on transparent. Invert the image colors first, then composite over white.
            image.invert();
        }
        
        whiteBg.composite(image, 0, 0);
        image = whiteBg;
    }

    image.greyscale();

    // Now check corners to see if we need to invert (e.g., photo of white symbol on dark background)
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
      // Background is dark, so invert the image to make background white and symbol black
      image.invert();
    }
    
    // Maximize contrast for potrace
    image.contrast(0.8);
    return image;
}

// Test cases
new Jimp(10, 10, 0x00000000, (err, img) => {
    // white symbol on transparent
    for(let y=2; y<8; y++) for(let x=2; x<8; x++) img.setPixelColor(0xFFFFFFFF, x, y);
    const out = prepImage(img);
    console.log("White on transparent -> center is black?", Jimp.intToRGBA(out.getPixelColor(5,5)).r === 0);
    console.log("White on transparent -> corner is white?", Jimp.intToRGBA(out.getPixelColor(0,0)).r === 255);
});

new Jimp(10, 10, 0x000000FF, (err, img) => {
    // white symbol on black bg
    for(let y=2; y<8; y++) for(let x=2; x<8; x++) img.setPixelColor(0xFFFFFFFF, x, y);
    const out = prepImage(img);
    console.log("White on black bg -> center is black?", Jimp.intToRGBA(out.getPixelColor(5,5)).r === 0);
    console.log("White on black bg -> corner is white?", Jimp.intToRGBA(out.getPixelColor(0,0)).r === 255);
});

new Jimp(10, 10, 0xFFFFFFFF, (err, img) => {
    // black symbol on white bg (normal)
    for(let y=2; y<8; y++) for(let x=2; x<8; x++) img.setPixelColor(0x000000FF, x, y);
    const out = prepImage(img);
    console.log("Black on white bg -> center is black?", Jimp.intToRGBA(out.getPixelColor(5,5)).r === 0);
    console.log("Black on white bg -> corner is white?", Jimp.intToRGBA(out.getPixelColor(0,0)).r === 255);
});

