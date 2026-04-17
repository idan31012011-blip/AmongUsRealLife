import { useEffect, useRef } from 'react';
import { useGame } from '../context/GameContext';
import { useLanguage } from '../context/LanguageContext';
import socket from '../socket';
import HeartbeatLine from './HeartbeatLine';

export default function MonitorMenu({ onClose }) {
  const { state } = useGame();
  const { t } = useLanguage();
  const { players, myId } = state;

  // Keyed by playerId: { magnitude, isDying, isDead, dyingStartTime }
  const statesRef = useRef({});

  // Initialize state for each player
  players.forEach(p => {
    if (!statesRef.current[p.id]) {
      statesRef.current[p.id] = {
        magnitude: 0,
        isDying: false,
        isDead: !p.isAlive,
        dyingStartTime: null,
      };
    }
  });

  // Listen for motion data
  useEffect(() => {
    function onMotion({ playerId, magnitude }) {
      const s = statesRef.current[playerId];
      if (s && !s.isDead) s.magnitude = magnitude;
    }
    socket.on('player_motion', onMotion);
    return () => socket.off('player_motion', onMotion);
  }, []);

  // Watch for player deaths → trigger dying animation
  useEffect(() => {
    players.forEach(p => {
      const s = statesRef.current[p.id];
      if (!s) return;
      if (!p.isAlive && !s.isDead && !s.isDying) {
        s.isDying = true;
        s.dyingStartTime = Date.now();
        setTimeout(() => {
          s.isDead = true;
          s.isDying = false;
          s.magnitude = 0;
        }, 4000);
      }
    });
  }, [players]);

  return (
    <div className="monitor-overlay">
      <div className="monitor-menu">
        <div className="monitor-header">
          <span className="monitor-title">🩺 {t('monitorTitle')}</span>
          <button className="monitor-close" onClick={onClose}>✕</button>
        </div>
        <div className="monitor-list">
          {players.map(p => {
            const s = statesRef.current[p.id];
            const isDead = s?.isDead || !p.isAlive;
            return (
              <div key={p.id} className={`monitor-row ${isDead ? 'monitor-row-dead' : ''}`}>
                <div className="monitor-player-info">
                  <span className="monitor-player-name">
                    {p.name}{p.id === myId ? ` ${t('monitorYou')}` : ''}
                  </span>
                  <span className={`monitor-status ${isDead ? 'status-dead' : 'status-alive'}`}>
                    {isDead ? t('monitorDead') : t('monitorAlive')}
                  </span>
                </div>
                <HeartbeatLine getState={() => statesRef.current[p.id] ?? { isDead: true, magnitude: 0 }} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
