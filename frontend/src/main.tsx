import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './i18n';          // initialize i18next (side-effect import)
import App from './App.tsx';
import { Toaster } from 'react-hot-toast';
import { PreferencesProvider } from './contexts/PreferencesContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PreferencesProvider>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          className: 'dark:!bg-gray-800 dark:!text-gray-100',
          style: { fontFamily: 'Inter, system-ui, sans-serif' },
        }}
      />
    </PreferencesProvider>
  </StrictMode>,
);
