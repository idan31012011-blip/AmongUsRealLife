import { useState } from 'react';
import { useGame } from '../context/GameContext';
import socket from '../socket';

export default function LobbyScreen() {
  const { state } = useGame();
  const { gameCode, players, isManager, myId, rooms } = state;
  const [copied, setCopied] = useState(false);

  const activePlayers = players.filter(p => !p.disconnected);
  const canStart = activePlayers.length >= 3;

  function copyCode() {
    const url = `${window.location.origin}/?join=${gameCode}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      navigator.clipboard.writeText(gameCode).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    });
  }

  function startGame() {
    socket.emit('start_game', { code: gameCode });
  }

  function kickPlayer(playerId) {
    socket.emit('kick_player', { code: gameCode, targetId: playerId });
  }

  return (
    <div className="screen lobby-screen">
      <div className="lobby-header">
        <h2>Waiting Room</h2>
        <div className="code-block" onClick={copyCode}>
          <span className="code-label">Game Code</span>
          <span className="code-value">{gameCode}</span>
          <span className="code-hint">{copied ? 'Copied!' : 'Tap to copy link'}</span>
        </div>
      </div>

      <div className="lobby-rooms card">
        <span className="label">Rooms: </span>
        <span className="rooms-list">{rooms.join(' · ')}</span>
      </div>

      <div className="player-list-header">
        <span className="label">Players ({activePlayers.length})</span>
        <span className="label-dim">Need 3+ to start</span>
      </div>

      <div className="player-list">
        {players.map(p => (
          <div key={p.id} className={`player-card ${p.disconnected ? 'disconnected' : ''} ${p.id === myId ? 'me' : ''}`}>
            <div className="player-dot" style={{ background: stringToColor(p.name) }} />
            <span className="player-name">
              {p.name}
              {p.id === myId && ' (you)'}
              {p.disconnected && ' 📵'}
            </span>
            {p.id === state.managerId && <span className="badge">Host</span>}
            {isManager && p.id !== myId && (
              <button
                className="btn-kick"
                onClick={() => kickPlayer(p.id)}
                title={`Kick ${p.name}`}
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      {isManager ? (
        <div className="lobby-footer">
          <button
            className={`btn btn-red btn-large ${!canStart ? 'disabled' : ''}`}
            onClick={startGame}
            disabled={!canStart}
          >
            {canStart ? 'Start Game' : `Need ${3 - activePlayers.length} more player${3 - activePlayers.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      ) : (
        <div className="lobby-footer">
          <p className="waiting-text">Waiting for the host to start…</p>
        </div>
      )}
    </div>
  );
}

function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 65%, 55%)`;
}
