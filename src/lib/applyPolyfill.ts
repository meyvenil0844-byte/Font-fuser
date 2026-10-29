// Polyfill for Function.prototype.apply to prevent "Maximum call stack size exceeded"
// specifically for very large arrays in opentype.js and browser font processing.

export function injectApplyPolyfill() {
  if (typeof Function !== 'undefined' && typeof Reflect !== 'undefined' && typeof Reflect.apply === 'function') {
    if ((Function.prototype.apply as any).__isPatched) return;
    
    const nativeApply = Reflect.apply;
    let inApply = false;
    
    Function.prototype.apply = function(thisArg, argsArray) {
      if (inApply || !argsArray) {
        return nativeApply(this, thisArg, argsArray || []);
      }
      
      const len = typeof argsArray.length === 'number' ? argsArray.length : 0;
      if (len > 500) {
        const fn = this;
        inApply = true;
        try {
          // 1. Array.prototype.push
          if (fn === Array.prototype.push) {
            for (let i = 0; i < len; i += 500) {
              const chunk = Array.prototype.slice.call(argsArray, i, i + 500);
              nativeApply(fn, thisArg, chunk);
            }
            return thisArg.length;
          }
          
          // 2. Math.min
          if (fn === Math.min) {
            let min = Infinity;
            for (let i = 0; i < len; i++) {
              if (argsArray[i] < min) min = argsArray[i];
            }
            return min;
          }
          
          // 3. Math.max
          if (fn === Math.max) {
            let max = -Infinity;
            for (let i = 0; i < len; i++) {
              if (argsArray[i] > max) max = argsArray[i];
            }
            return max;
          }
          
          // 4. String.fromCharCode
          if (fn === String.fromCharCode) {
            let str = "";
            for (let i = 0; i < len; i += 500) {
              const chunk = Array.prototype.slice.call(argsArray, i, i + 500);
              str += nativeApply(fn, thisArg, chunk);
            }
            return str;
          }
          
          // 5. Array.prototype.concat
          if (fn === Array.prototype.concat) {
            let res = thisArg || [];
            for (let i = 0; i < len; i += 500) {
              const chunk = Array.prototype.slice.call(argsArray, i, i + 500);
              res = nativeApply(fn, res, chunk);
            }
            return res;
          }

          // 6. Array.prototype.splice
          if (fn === Array.prototype.splice) {
            const start = argsArray[0] || 0;
            const deleteCount = argsArray[1] || 0;
            const items = Array.prototype.slice.call(argsArray, 2);
            thisArg.splice(start, deleteCount);
            for (let i = 0; i < items.length; i += 500) {
              const chunk = items.slice(i, i + 500);
              thisArg.splice(start + i, 0, ...chunk);
            }
            return [];
          }
        } finally {
          inApply = false;
        }
      }
      
      return nativeApply(this, thisArg, argsArray || []);
    };
    
    (Function.prototype.apply as any).__isPatched = true;
  }
}

// Auto-inject on import
injectApplyPolyfill();
