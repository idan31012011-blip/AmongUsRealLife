import { useState, useEffect } from 'react';
import { useGame } from '../context/GameContext';
import { useLanguage } from '../context/LanguageContext';
import socket from '../socket';

export default function HomeScreen() {
  const { dispatch } = useGame();
  const { lang, setLang, t } = useLanguage();
  const [joinCode, setJoinCode] = useState('');
  const [joinName, setJoinName] = useState('');
  const [view, setView] = useState('main'); // 'main' | 'join'
  const [savedGame, setSavedGame] = useState(null); // { code, name } from localStorage

  useEffect(() => {
    // Auto-fill code from URL ?join=XXXXXX
    const params = new URLSearchParams(window.location.search);
    const code = params.get('join');
    if (code) {
      setJoinCode(code.toUpperCase());
      setView('join');
      return;
    }
    // Detect interrupted session from a previous page load
    const savedCode = localStorage.getItem('gameCode');
    const savedName = localStorage.getItem('playerName');
    if (savedCode && savedName) {
      setSavedGame({ code: savedCode, name: savedName });
    }
  }, []);

  function handleRejoin() {
    if (!savedGame) return;
    dispatch({ type: 'SET_MY_NAME', name: savedGame.name });
    socket.emit('rejoin_game', { code: savedGame.code, name: savedGame.name });
  }

  function dismissRejoin() {
    localStorage.removeItem('gameCode');
    localStorage.removeItem('playerName');
    setSavedGame(null);
  }

  function handleJoin(e) {
    e.preventDefault();
    if (!joinCode.trim() || !joinName.trim()) return;
    const name = joinName.trim();
    localStorage.setItem('gameCode', joinCode.trim().toUpperCase());
    localStorage.setItem('playerName', name);
    dispatch({ type: 'SET_MY_NAME', name });
    socket.emit('join_game', { code: joinCode.trim().toUpperCase(), name });
  }

  if (view === 'join') {
    return (
      <div className="screen center-screen">
        <div className="logo">
          <span className="logo-icon">👾</span>
          <h1 className="logo-title">Among Us IRL</h1>
        </div>
        <form className="card form-card" onSubmit={handleJoin}>
          <h2 className="form-title">{t('joinGame')}</h2>
          <input
            className="input"
            placeholder={t('gameCodePlaceholder')}
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase())}
            maxLength={6}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
          />
          <input
            className="input"
            placeholder={t('yourNamePlaceholder')}
            value={joinName}
            onChange={e => setJoinName(e.target.value)}
            maxLength={20}
            autoComplete="off"
          />
          <button className="btn btn-blue" type="submit">
            {t('joinBtn')}
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => setView('main')}>
            {t('back')}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="screen center-screen">
      <div className="logo">
        <span className="logo-icon">👾</span>
        <h1 className="logo-title">Among Us IRL</h1>
        <p className="logo-sub">{t('appSubtitle')}</p>
      </div>

      {savedGame && (
        <div className="rejoin-card card">
          <p className="rejoin-label">{t('continueGameLabel')}</p>
          <p className="rejoin-info">
            <strong>{savedGame.name}</strong> · {savedGame.code}
          </p>
          <div className="rejoin-actions">
            <button className="btn btn-blue" onClick={handleRejoin}>
              {t('continueGameBtn')}
            </button>
            <button className="btn btn-ghost btn-small" onClick={dismissRejoin}>
              {t('continueGameDismiss')}
            </button>
          </div>
        </div>
      )}

      <div className="home-buttons">
        <button className="btn btn-red btn-large" onClick={() => dispatch({ type: 'GO_TO_SETUP' })}>
          {t('createGame')}
        </button>
        <button className="btn btn-blue btn-large" onClick={() => setView('join')}>
          {t('joinGame')}
        </button>
        <button className="lang-toggle" onClick={() => setLang(l => l === 'en' ? 'he' : 'en')}>
          {t('switchLang')}
        </button>
      </div>
    </div>
  );
}
