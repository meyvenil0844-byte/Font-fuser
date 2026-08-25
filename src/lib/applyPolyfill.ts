// Polyfill for Function.prototype.apply to prevent "Maximum call stack size exceeded"
// specifically for very large arrays in opentype.js when generating TrueType fonts.

export function injectApplyPolyfill() {
  if (typeof Function !== 'undefined') {
    const originalApply = Function.prototype.apply;
    
    Function.prototype.apply = function(thisArg, argsArray) {
      if (argsArray && argsArray.length > 5000) { // lowered from 50000 to 5000
        const fn = this;
        
        // If this is Array.prototype.push (which opentype.js uses heavily)
        if (fn === Array.prototype.push) {
          for (let i = 0; i < argsArray.length; i += 5000) {
            const chunk = Array.prototype.slice.call(argsArray, i, i + 5000);
            originalApply.call(fn, thisArg, chunk);
          }
          return thisArg.length;
        }
        
        // For Math.min / Math.max
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
}
