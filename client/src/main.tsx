import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App as KonstaApp } from 'konsta/react';
import App from './App';
import './index.css';

// Detect platform
const getTheme = (): 'ios' | 'material' => {
  const platform = window.Telegram?.WebApp?.platform;
  if (platform === 'ios' || platform === 'macos') {
    return 'ios';
  }
  return 'material';
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <KonstaApp theme={getTheme()} safeAreas>
        <App />
      </KonstaApp>
    </BrowserRouter>
  </React.StrictMode>
);
