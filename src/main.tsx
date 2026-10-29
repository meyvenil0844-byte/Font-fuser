
import './polyfills';

let isLoggingError = false;
const originalError = console.error;
console.error = function(...args) {
    if (isLoggingError) return;
    isLoggingError = true;
    try {
      if (typeof args[0] === 'string' && (args[0].includes('WebSocket') || args[0].includes('[vite] failed to connect to websocket'))) {
          return;
      }
      if (args[0] && args[0].message && typeof args[0].message === 'string' && args[0].message.includes('WebSocket')) return;
      if (typeof Reflect !== 'undefined' && typeof Reflect.apply === 'function') {
        Reflect.apply(originalError, console, args);
      } else {
        originalError(...args);
      }
    } catch (e) {
    } finally {
      isLoggingError = false;
    }
};


window.addEventListener('unhandledrejection', (e) => {
  const msg = e.reason && typeof e.reason.message === 'string' ? e.reason.message : String(e.reason || '');
  const stk = e.reason && typeof e.reason.stack === 'string' ? e.reason.stack : '';
  if (msg.includes('WebSocket') || msg.includes('websocket') || stk.includes('@vite/client')) {
    e.preventDefault();
    return;
  }
  fetch('/api/log-error', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ message: msg, stack: stk }) }).catch(() => {});
});

window.addEventListener('error', (e) => {
  const msg = typeof e.message === 'string' ? e.message : '';
  const stk = e.error && typeof e.error.stack === 'string' ? e.error.stack : '';
  if (msg.includes('WebSocket') || msg.includes('websocket') || stk.includes('@vite/client') || (e.filename && e.filename.includes('@vite/client'))) {
    e.preventDefault();
    return;
  }
  fetch('/api/log-error', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ message: msg, stack: stk }) }).catch(() => {});
});
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';


createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary fallbackTitle="Application Recovered">
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
