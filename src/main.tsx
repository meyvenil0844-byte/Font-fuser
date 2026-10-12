
import './polyfills';

const originalError = console.error;
console.error = function(...args) {
    if (typeof args[0] === 'string' && (args[0].includes('WebSocket') || args[0].includes('[vite] failed to connect to websocket'))) {
        return;
    }
    if (args[0] && args[0].message && args[0].message.includes('WebSocket')) return;
    originalError.apply(console, args);
};


window.addEventListener('unhandledrejection', (e) => {
  if (e.reason && typeof e.reason.message === 'string' && e.reason.message.includes('WebSocket')) {
      e.preventDefault();
      return;
  }
});

window.addEventListener('error', (e) => {
  fetch('/api/log-error', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ message: e.message, stack: e.error?.stack }) }).catch(()=>console.log(e));
});
window.addEventListener('unhandledrejection', (e) => {
  fetch('/api/log-error', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ message: e.reason?.message || String(e.reason), stack: e.reason?.stack }) }).catch(()=>console.log(e));
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
