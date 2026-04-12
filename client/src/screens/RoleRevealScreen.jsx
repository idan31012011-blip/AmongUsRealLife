import { useState, useEffect } from 'react';
import { useGame } from '../context/GameContext';
import socket from '../socket';

export default function RoleRevealScreen() {
  const { state } = useGame();
  const { myRole, gameCode } = state;
  const [stage, setStage] = useState('suspense'); // 'suspense' | 'flipping' | 'revealed' | 'waiting'

  useEffect(() => {
    // Start the suspense animation
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
      <div className="reveal-title">Your Role</div>

      <div className={`card-flip-container ${stage === 'flipping' || stage === 'revealed' || stage === 'waiting' ? 'flipped' : ''}`}>
        <div className="card-flip-inner">
          {/* Front: mystery */}
          <div className="card-face card-front">
            <div className="role-mystery">
              <span className="role-mystery-icon">?</span>
            </div>
          </div>
          {/* Back: role */}
          <div className={`card-face card-back ${isImposter ? 'card-imposter' : 'card-crewmate'}`}>
            <div className="role-icon">{isImposter ? '🔪' : '🚀'}</div>
            <div className="role-name">{isImposter ? 'Imposter' : 'Crewmate'}</div>
            <div className="role-desc">
              {isImposter
                ? 'Blend in. Eliminate the crew. Don\'t get caught.'
                : 'Complete your tasks. Find the imposter.'}
            </div>
          </div>
        </div>
      </div>

      {stage === 'revealed' && (
        <div className="reveal-tap-hint">Tap anywhere to continue</div>
      )}

      {stage === 'waiting' && (
        <div className="reveal-waiting">
          <div className="spinner" />
          Waiting for others…
        </div>
      )}
    </div>
  );
}
