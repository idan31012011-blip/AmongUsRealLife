import { useState, useEffect } from 'react';
import { useGame } from '../context/GameContext';
import socket from '../socket';

export default function HomeScreen() {
  const { dispatch } = useGame();
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
          <h2 className="form-title">Join Game</h2>
          <input
            className="input"
            placeholder="Game Code"
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase())}
            maxLength={6}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
          />
          <input
            className="input"
            placeholder="Your Name"
            value={joinName}
            onChange={e => setJoinName(e.target.value)}
            maxLength={20}
            autoComplete="off"
          />
          <button className="btn btn-blue" type="submit">
            Join
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => setView('main')}>
            Back
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
        <p className="logo-sub">The real-life companion app</p>
      </div>
      <div className="home-buttons">
        <button className="btn btn-red btn-large" onClick={() => dispatch({ type: 'GO_TO_SETUP' })}>
          Create Game
        </button>
        <button className="btn btn-blue btn-large" onClick={() => setView('join')}>
          Join Game
        </button>
      </div>
    </div>
  );
}
