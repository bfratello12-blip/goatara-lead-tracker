import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import * as Tooltip from '@radix-ui/react-tooltip';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';
import './styles.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Tooltip.Provider delayDuration={300}>
        <App />
      </Tooltip.Provider>
    </BrowserRouter>
  </StrictMode>,
);
