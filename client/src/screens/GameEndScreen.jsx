import { useState, useEffect } from 'react';
import { useGame } from '../context/GameContext';
import { useLanguage } from '../context/LanguageContext';
import socket from '../socket';
import { playGameEnd } from '../sounds';

export default function GameEndScreen() {
  const { state } = useGame();
  const { t } = useLanguage();
  const { winner, winReason, players, isManager, gameCode } = state;
  const [stage, setStage] = useState(0);
  const crewmatesWin = winner === 'crewmates';

  useEffect(() => {
    const t1 = setTimeout(() => { setStage(1); playGameEnd(crewmatesWin); }, 400);
    const t2 = setTimeout(() => setStage(2), 1800);
    const t3 = setTimeout(() => setStage(3), 2800);
    const t4 = setTimeout(() => setStage(4), 4200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const imposter = players.find(p => p.role === 'imposter');

  const reasonText = {
    imposter_voted_out: t('reasonVotedOut'),
    tasks_complete: t('reasonTasksComplete'),
    imposter_wins: t('reasonImposterWins'),
    manager_ended: t('reasonManagerEnded'),
  }[winReason] || '';

  function playAgain() {
    socket.emit('play_again', { code: gameCode });
  }

  return (
    <div className={`screen game-end-screen ${crewmatesWin ? 'crewmates-win' : 'imposter-win'}`}>

      {stage >= 1 && (
        <div className="end-banner end-banner-in">
          <div className="win-icon">{crewmatesWin ? '🚀' : '🔪'}</div>
          <h1 className="win-title">{crewmatesWin ? t('crewmatesWin') : t('imposterWins')}</h1>
          <p className="win-reason">{reasonText}</p>
        </div>
      )}

      {stage >= 2 && (
        <p className="end-suspense end-suspense-in">{t('theImposterWas')}</p>
      )}

      {stage >= 3 && (
        <div className="end-reveal end-reveal-in">
          <div className="end-reveal-knife">🔪</div>
          <div className="end-reveal-name">{imposter?.name ?? '???'}</div>
        </div>
      )}

      {stage >= 4 && (
        <div className="end-player-list end-player-list-in">
          {players.map(p => (
            <div
              key={p.id}
              className={`end-player-row ${p.role === 'imposter' ? 'end-row-imposter' : 'end-row-crewmate'}`}
            >
              <span className="end-player-icon">{p.role === 'imposter' ? '🔪' : '🚀'}</span>
              <span className="end-player-name">{p.name}</span>
              <span className="end-player-role">{p.role === 'imposter' ? t('roleImposter') : t('roleCrewmate')}</span>
            </div>
          ))}

          <div className="end-actions">
            {isManager && (
              <button className="btn btn-blue btn-large" onClick={playAgain}>
                {t('playAgain')}
              </button>
            )}
            <button
              className="btn btn-ghost"
              onClick={() => {
                localStorage.removeItem('gameCode');
                localStorage.removeItem('playerName');
                window.location.reload();
              }}
            >
              {t('leaveGame')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
