import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { TeamProvider } from '@/contexts/TeamContext';
import { SetupProvider } from '@/lib/setup/SetupContext';
import App from './App';
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
