import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import './index.css';
import App from './App';
import { StoreProvider } from './store';

try { document.documentElement.dataset.theme = localStorage.getItem('ciq-theme') ?? 'dark'; } catch { document.documentElement.dataset.theme = 'dark'; }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <StoreProvider><App /></StoreProvider>
    </MotionConfig>
  </StrictMode>,
);
