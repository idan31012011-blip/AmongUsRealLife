import { useState } from 'react';
import { useGame } from '../context/GameContext';
import { useLanguage } from '../context/LanguageContext';
import socket from '../socket';
import { QRCodeSVG } from 'qrcode.react';
import SettingsPanel from '../components/SettingsPanel';

export default function LobbyScreen() {
  const { state } = useGame();
  const { t } = useLanguage();
  const { gameCode, players, isManager, myId, rooms, settings, stationAssignments, easyModePlayers } = state;
  const [copied, setCopied] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
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

  const need = 3 - activePlayers.length;

  return (
    <div className="screen lobby-screen">
      <div className="lobby-header">
        <h2>{t('waitingRoom')}</h2>
        <div className="code-block" onClick={copyCode}>
          <span className="code-label">{t('gameCodeLabel')}</span>
          <span className="code-value">{gameCode}</span>
          <span className="code-hint">{copied ? t('copied') : t('tapToCopy')}</span>
        </div>

        {isManager && (
          <div className="qr-block">
            <p className="qr-label">{t('scanToJoin')}</p>
            <QRCodeSVG
              value={`${window.location.origin}/?join=${gameCode}`}
              size={160}
              bgColor="#ffffff"
              fgColor="#000000"
              level="M"
            />
          </div>
        )}

        <button
          className="btn btn-ghost btn-small lobby-settings-btn"
          onClick={() => setShowSettings(true)}
        >
          {isManager ? t('editSettings') : t('viewSettings')}
        </button>
      </div>

      <div className="lobby-rooms card">
        <span className="label">{t('roomsLabel')} </span>
        <span className="rooms-list">{rooms.join(' · ')}</span>
      </div>

      <div className="player-list-header">
        <span className="label">{t('playersLabel', activePlayers.length)}</span>
        <span className="label-dim">{t('need3ToStart')}</span>
      </div>

      <div className="player-list">
        {players.map(p => (
          <div key={p.id} className={`player-card ${p.disconnected ? 'disconnected' : ''} ${p.id === myId ? 'me' : ''}`}>
            <div className="player-dot" style={{ background: stringToColor(p.name) }} />
            <span className="player-name">
              {p.name}
              {p.id === myId && t('youSuffix')}
              {p.disconnected && ' 📵'}
            </span>
            {p.id === state.managerId && <span className="badge">{t('hostBadge')}</span>}
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
            {canStart ? t('startGame') : t('needMorePlayers', need)}
          </button>
        </div>
      ) : (
        <div className="lobby-footer">
          <p className="waiting-text">{t('waitingForHost')}</p>
        </div>
      )}

      {showSettings && (
        <SettingsPanel
          isManager={isManager}
          settings={settings}
          rooms={rooms}
          gameCode={gameCode}
          onClose={() => setShowSettings(false)}
          playerCount={activePlayers.length}
          stationAssignments={stationAssignments}
          activePlayers={activePlayers}
          myId={myId}
          easyModePlayers={easyModePlayers}
        />
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
