import { Buffer } from 'buffer';
import { injectApplyPolyfill } from './lib/applyPolyfill';
import './lib/dataViewPolyfill';

// Auto-inject apply polyfill globally on both browser and server
injectApplyPolyfill();

if (typeof window !== 'undefined') {
  (window as any).global = window;
  (window as any).Buffer = Buffer;
}
if (typeof globalThis !== 'undefined') {
  (globalThis as any).global = globalThis;
  (globalThis as any).Buffer = Buffer;
}

export { Buffer };
