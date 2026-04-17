import { useState, useEffect } from 'react';
import { useGame } from '../context/GameContext';
import { useLanguage } from '../context/LanguageContext';
import socket from '../socket';
import { playRoleSuspense } from '../sounds';

export default function RoleRevealScreen() {
  const { state } = useGame();
  const { t } = useLanguage();
  const { myRole, gameCode } = state;
  const [stage, setStage] = useState('suspense'); // 'suspense' | 'flipping' | 'revealed' | 'waiting'

  useEffect(() => {
    playRoleSuspense();
    const t1 = setTimeout(() => setStage('flipping'), 1500);
    const t2 = setTimeout(() => setStage('revealed'), 2800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  function handleDismiss() {
    if (stage !== 'revealed') return;
    setStage('waiting');
    socket.emit('role_reveal_done', { code: gameCode });
  }

  const isImposter = myRole === 'imposter';

  return (
    <div
      className={`screen role-reveal-screen ${isImposter ? 'imposter-bg' : 'crewmate-bg'}`}
      onClick={stage === 'revealed' ? handleDismiss : undefined}
    >
      <div className="reveal-title">{t('yourRole')}</div>

      <div className={`card-flip-container ${stage === 'flipping' || stage === 'revealed' || stage === 'waiting' ? 'flipped' : ''}`}>
        <div className="card-flip-inner">
          <div className="card-face card-front">
            <div className="role-mystery">
              <span className="role-mystery-icon">?</span>
            </div>
          </div>
          <div className={`card-face card-back ${isImposter ? 'card-imposter' : 'card-crewmate'}`}>
            <div className="role-icon">{isImposter ? '🔪' : '🚀'}</div>
            <div className="role-name">{isImposter ? t('imposter') : t('crewmate')}</div>
            <div className="role-desc">
              {isImposter ? t('imposterDesc') : t('crewmateDesc')}
            </div>
          </div>
        </div>
      </div>

      {stage === 'revealed' && (
        <div className="reveal-tap-hint">{t('tapToContinue')}</div>
      )}

      {stage === 'waiting' && (
        <div className="reveal-waiting">
          <div className="spinner" />
          {t('waitingForOthers')}
        </div>
      )}
    </div>
  );
}
