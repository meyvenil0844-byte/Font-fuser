import { injectApplyPolyfill } from './src/lib/applyPolyfill';
import opentype from 'opentype.js';

injectApplyPolyfill();

async function run() {
  const glyphsBase = [new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: new opentype.Path() })];
  const newGlyphs = [...glyphsBase];

  for(let i=1; i<=44000; i++) {
    const p = new opentype.Path();
    for(let j=0; j<10; j++) {
       p.moveTo(0,0); p.lineTo(10,10); p.lineTo(10,0); p.close();
    }
    newGlyphs.push(new opentype.Glyph({ name: 'uni'+i, unicode: i, advanceWidth: 500, path: p }));
  }
  
  const newFont = new opentype.Font({
    familyName: "FusedFont",
    styleName: 'Regular',
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    glyphs: newGlyphs,
  });

  console.log("Generating buffer...");
  const start = Date.now();
  const buffer = newFont.toArrayBuffer();
  console.log("Generated in", Date.now() - start, "ms. size:", buffer.byteLength);
}
run();
