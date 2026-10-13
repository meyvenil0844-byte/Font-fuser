/**
 * Polyfill for DataView and bounds checking to prevent
 * "RangeError: Offset is outside the bounds of the DataView"
 * and "Start offset X is outside the bounds of the buffer"
 * across browser and Node.js environments when parsing complex,
 * damaged, or non-standard font tables.
 */

export function installDataViewSafetyPolyfill(): void {
  if (typeof globalThis === 'undefined') return;

  const OriginalDataView = globalThis.DataView;
  if (!OriginalDataView || (OriginalDataView as any).__isPatched) return;

  function SafeDataView(this: any, buffer: any, byteOffset: number = 0, byteLength?: number) {
    if (!(buffer instanceof ArrayBuffer) && !(typeof SharedArrayBuffer !== 'undefined' && buffer instanceof SharedArrayBuffer)) {
      try {
        if (buffer && buffer.buffer instanceof ArrayBuffer) {
          byteOffset = (buffer.byteOffset || 0) + (byteOffset || 0);
          buffer = buffer.buffer;
        } else {
          buffer = new ArrayBuffer(0);
        }
      } catch {
        buffer = new ArrayBuffer(0);
      }
    }
    const maxLen = buffer.byteLength;
    const safeOffset = Math.max(0, Math.min(byteOffset || 0, maxLen));
    let safeLength = byteLength === undefined ? (maxLen - safeOffset) : byteLength;
    if (safeLength < 0 || safeOffset + safeLength > maxLen) {
      safeLength = Math.max(0, maxLen - safeOffset);
    }
    return new OriginalDataView(buffer, safeOffset, safeLength);
  }

  SafeDataView.prototype = OriginalDataView.prototype;
  Object.setPrototypeOf(SafeDataView, OriginalDataView);
  (SafeDataView as any).__isPatched = true;
  globalThis.DataView = SafeDataView as any;

  const getters: { name: string; size: number; def: any }[] = [
    { name: 'getInt8', size: 1, def: 0 },
    { name: 'getUint8', size: 1, def: 0 },
    { name: 'getInt16', size: 2, def: 0 },
    { name: 'getUint16', size: 2, def: 0 },
    { name: 'getInt32', size: 4, def: 0 },
    { name: 'getUint32', size: 4, def: 0 },
    { name: 'getFloat32', size: 4, def: 0 },
    { name: 'getFloat64', size: 8, def: 0 },
    { name: 'getBigInt64', size: 8, def: 0n },
    { name: 'getBigUint64', size: 8, def: 0n }
  ];

  for (const { name, size, def } of getters) {
    const orig = (OriginalDataView.prototype as any)[name];
    if (typeof orig === 'function') {
      (OriginalDataView.prototype as any)[name] = function(this: DataView, offset: number, littleEndian?: boolean) {
        if (typeof offset !== 'number' || offset < 0 || offset + size > this.byteLength) {
          return def;
        }
        try {
          return orig.call(this, offset, littleEndian);
        } catch {
          return def;
        }
      };
    }
  }

  const setters: { name: string; size: number }[] = [
    { name: 'setInt8', size: 1 },
    { name: 'setUint8', size: 1 },
    { name: 'setInt16', size: 2 },
    { name: 'setUint16', size: 2 },
    { name: 'setInt32', size: 4 },
    { name: 'setUint32', size: 4 },
    { name: 'setFloat32', size: 4 },
    { name: 'setFloat64', size: 8 },
    { name: 'setBigInt64', size: 8 },
    { name: 'setBigUint64', size: 8 }
  ];

  for (const { name, size } of setters) {
    const orig = (OriginalDataView.prototype as any)[name];
    if (typeof orig === 'function') {
      (OriginalDataView.prototype as any)[name] = function(this: DataView, offset: number, val: any, littleEndian?: boolean) {
        if (typeof offset !== 'number' || offset < 0 || offset + size > this.byteLength) {
          return;
        }
        try {
          orig.call(this, offset, val, littleEndian);
        } catch {}
      };
    }
  }
}

// Auto-install immediately on import
installDataViewSafetyPolyfill();
