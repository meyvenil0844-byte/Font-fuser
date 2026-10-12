// Polyfill for Function.prototype.apply to prevent "Maximum call stack size exceeded"
if (typeof Function !== 'undefined') {
  const originalApply = Function.prototype.apply;
  Function.prototype.apply = function(thisArg, argsArray) {
    if (argsArray && argsArray.length > 5000) {
      const fn = this;
      if (fn === Array.prototype.push) {
        for (let i = 0; i < argsArray.length; i += 5000) {
          const chunk = Array.prototype.slice.call(argsArray, i, i + 5000);
          originalApply.call(fn, thisArg, chunk);
        }
        return thisArg.length;
      }
      if (fn === Math.min) {
        let min = Infinity;
        for (let i = 0; i < argsArray.length; i++) {
          if (argsArray[i] < min) min = argsArray[i];
        }
        return min;
      }
      if (fn === Math.max) {
        let max = -Infinity;
        for (let i = 0; i < argsArray.length; i++) {
          if (argsArray[i] > max) max = argsArray[i];
        }
        return max;
      }
      if (fn === String.fromCharCode) {
        let str = "";
        for (let i = 0; i < argsArray.length; i += 5000) {
          const chunk = Array.prototype.slice.call(argsArray, i, i + 5000);
          str += originalApply.call(fn, thisArg, chunk);
        }
        return str;
      }
    }
    return originalApply.call(this, thisArg, argsArray);
  };
}

const opentype = require('opentype.js');

function createComplexGlyph(name, unicode) {
    const p = new opentype.Path();
    for (let i=0; i<50000; i++) {
        p.moveTo(i, i);
        p.lineTo(i+1, i+1);
        p.quadraticCurveTo(i+2, i+2, i+3, i+3);
        p.curveTo(i+4, i+4, i+5, i+5, i+6, i+6);
        p.close();
    }
    const glyph = new opentype.Glyph({ name, unicode, path: p, advanceWidth: 1000 });
    
    // PRECOMPUTE METRICS
    glyph._cachedMetrics = glyph.getMetrics();
    
    // PRECOMPILE CHARSTRING
    const ops = opentype._glyphToOps(glyph, 1);
    const buf = opentype._encodeCHARSTRING(ops);
    glyph._rawCharString = buf;
    
    // FREE PATH
    glyph.path.commands = [];
    
    return glyph;
}

const glyphs = [new opentype.Glyph({ name: '.notdef', unicode: 0, path: new opentype.Path(), advanceWidth: 1000 })];
for (let i=0; i<50; i++) {
    glyphs.push(createComplexGlyph('g'+i, 65+i));
    if (global.gc) global.gc();
}

const font = new opentype.Font({
    familyName: 'Test',
    styleName: 'Medium',
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    glyphs: glyphs
});

let s = Date.now();
console.log("Compiling font with 50 massive photo glyphs...");
const buf = font.toArrayBuffer();
console.log("Done in", (Date.now() - s) / 1000, "seconds, size:", buf.byteLength);
