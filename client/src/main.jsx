import React from 'react';
import ReactDOM from 'react-dom/client';
import { LanguageProvider } from './context/LanguageContext';
import { GameProvider } from './context/GameContext';
import App from './App';
import './styles/theme.css';
import './styles/global.css';
import './styles/animations.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <LanguageProvider>
    <GameProvider>
      <App />
    </GameProvider>
  </LanguageProvider>
);
