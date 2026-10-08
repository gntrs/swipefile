import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { TeamProvider } from '@/contexts/TeamContext';
import { SetupProvider } from '@/lib/setup/SetupContext';
import App from './App';
// Figtree for everything a person reads, JetBrains Mono for numbers, code and
// the one eyebrow per page. Self hosted, so nothing loads from a font CDN.
// The weight files declare every subset with its unicode-range, so a page
// fetches latin only, and latin-ext only when a name needs a glyph from it.
// (The latin-ext-400.css style files have no unicode-range: importing them
// makes every page download both files for every weight.)
import '@fontsource/figtree/400.css';
import '@fontsource/figtree/500.css';
import '@fontsource/figtree/600.css';
import '@fontsource/figtree/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <SetupProvider>
        <AuthProvider>
          <TeamProvider>
            <App />
          </TeamProvider>
        </AuthProvider>
      </SetupProvider>
    </BrowserRouter>
  </React.StrictMode>
);
