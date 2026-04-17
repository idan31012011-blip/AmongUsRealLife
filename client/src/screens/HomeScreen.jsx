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

  // Auto-fill code from URL ?join=XXXXXX
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('join');
    if (code) {
      setJoinCode(code.toUpperCase());
      setView('join');
    }
  }, []);

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
