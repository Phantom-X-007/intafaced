import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root missing');

// Replace static #boot shell with React — SiteLoader continues the same void paint.
createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
