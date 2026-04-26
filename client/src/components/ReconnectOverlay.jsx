import { useLanguage } from '../context/LanguageContext';
import socket from '../socket';

export default function ReconnectOverlay({ gameCode, playerName }) {
  const { t } = useLanguage();

  function handleRetry() {
    const code = localStorage.getItem('gameCode');
    const name = localStorage.getItem('playerName');
    if (code && name) {
      socket.emit('rejoin_game', { code, name });
    }
    // Also try reconnecting the transport if it's still down
    if (!socket.connected) {
      socket.connect();
    }
  }

  return (
    <div className="reconnect-overlay">
      <div className="reconnect-card">
        <div className="reconnect-icon">📶</div>
        <h2 className="reconnect-title">{t('connectionLost')}</h2>
        <p className="reconnect-sub">{t('reconnectingMsg')}</p>
        <div className="spinner reconnect-spinner" />
        {(gameCode || playerName) && (
          <div className="reconnect-info">
            {playerName && <span className="reconnect-name">{playerName}</span>}
            {gameCode && <span className="reconnect-code">{t('reconnectGameCode', gameCode)}</span>}
          </div>
        )}
        <button className="btn btn-blue" onClick={handleRetry}>
          {t('reconnectBtn')}
        </button>
      </div>
    </div>
  );
}
