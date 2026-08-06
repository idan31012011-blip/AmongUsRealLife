import { useGame } from '../context/GameContext';
import { useLanguage } from '../context/LanguageContext';

export default function AnalystMenu({ onClose }) {
  const { state } = useGame();
  const { t } = useLanguage();
  const { analystProgress, myId } = state;

  return (
    <div className="monitor-overlay">
      <div className="monitor-menu">
        <div className="monitor-header">
          <span className="monitor-title analyst-title">📊 {t('analystTitle')}</span>
          <button className="monitor-close" onClick={onClose}>✕</button>
        </div>
        <div className="monitor-list">
          {analystProgress.map(p => {
            const percent = p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0;
            return (
              <div key={p.playerId} className="analyst-row">
                <span className="analyst-player-name">
                  {p.name}{p.playerId === myId ? ` ${t('monitorYou')}` : ''}
                </span>
                <div className="progress-bar-track analyst-bar-track">
                  <div className="progress-bar-fill analyst-bar-fill" style={{ width: `${percent}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
