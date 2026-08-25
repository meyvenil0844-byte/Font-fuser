
window.addEventListener('error', (e) => {
  fetch('/api/log-error', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ message: e.message, stack: e.error?.stack }) }).catch(()=>console.log(e));
});
window.addEventListener('unhandledrejection', (e) => {
  fetch('/api/log-error', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ message: e.reason?.message || String(e.reason), stack: e.reason?.stack }) }).catch(()=>console.log(e));
});
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';


createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
