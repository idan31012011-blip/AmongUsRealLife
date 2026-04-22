import { useState, useEffect } from 'react';
import { useGame } from '../context/GameContext';
import { useLanguage } from '../context/LanguageContext';
import socket from '../socket';
import { playVoteResults } from '../sounds';
import Modal from '../components/Modal';

export default function VotingScreen() {
  const { state, dispatch } = useGame();
  const { t } = useLanguage();
  const {
    players, myId, isAlive, gameCode, isManager,
    myVote, totalVotesIn, votes, ejectedPlayer, lastMeeting,
  } = state;

  const [pendingVote, setPendingVote] = useState(null);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showForceEndVoting, setShowForceEndVoting] = useState(false);
  const [pendingKickTarget, setPendingKickTarget] = useState(null);

  function endGame() {
    socket.emit('end_game', { code: gameCode });
    setShowEndConfirm(false);
  }

  function forceEndVoting() {
    socket.emit('force_end_voting', { code: gameCode });
    setShowForceEndVoting(false);
  }

  function confirmKick() {
    if (!pendingKickTarget) return;
    socket.emit('kick_player', { code: gameCode, targetId: pendingKickTarget.id });
    setPendingKickTarget(null);
  }

  const livingPlayers = players.filter(p => p.isAlive);
  const totalLiving = livingPlayers.length;

  function selectVote(targetId, targetName) {
    if (myVote || !isAlive) return;
    setPendingVote({ id: targetId, name: targetName });
  }

  function confirmVote() {
    if (!pendingVote) return;
    socket.emit('cast_vote', { code: gameCode, targetId: pendingVote.id });
    dispatch({ type: 'MY_VOTE_CAST', targetId: pendingVote.id });
    setPendingVote(null);
  }

  const hasResults = Object.keys(votes).length > 0;

  if (hasResults) {
    return <ResultsOverlay ejected={ejectedPlayer} votes={votes} players={players} />;
  }

  return (
    <div className="screen voting-screen">
      <div className="voting-header">
        {lastMeeting?.reason === 'body' ? (
          <div className="meeting-reason">
            <span className="meeting-icon">🔍</span>
            <span>{t('foundBodyVote', lastMeeting.reporterName, lastMeeting.bodyName)}</span>
          </div>
        ) : (
          <div className="meeting-reason">
            <span className="meeting-icon">🚨</span>
            <span>{t('calledEmergencyVote', lastMeeting?.reporterName)}</span>
          </div>
        )}
        <h2>{t('whoIsImposter')}</h2>
        <div className="vote-progress">{t('votedCount', totalVotesIn, totalLiving)}</div>
      </div>

      {!isAlive && (
        <div className="dead-vote-notice">{t('deadCannotVote')}</div>
      )}

      <div className="vote-grid">
        {livingPlayers.map(p => (
          <div key={p.id} className="vote-card-wrapper">
            <button
              className={`vote-card
                ${myVote === p.id ? 'voted' : ''}
                ${myVote && myVote !== p.id ? 'dimmed' : ''}
                ${pendingVote?.id === p.id ? 'pending' : ''}
                ${!isAlive || myVote ? 'no-interact' : ''}`}
              onClick={() => selectVote(p.id, p.name)}
              disabled={!isAlive || !!myVote}
            >
              <div className="vote-avatar" style={{ background: stringToColor(p.name) }}>
                {p.name[0].toUpperCase()}
              </div>
              <div className="vote-name">
                {p.name}
                {p.id === myId && t('youSuffix')}
              </div>
              {myVote === p.id && <div className="vote-check">✓</div>}
            </button>
            {isManager && p.id !== myId && (
              <button className="btn-kick-overlay" onClick={() => setPendingKickTarget(p)}>✕</button>
            )}
          </div>
        ))}

        <button
          className={`vote-card vote-skip
            ${myVote === 'skip' ? 'voted' : ''}
            ${myVote && myVote !== 'skip' ? 'dimmed' : ''}
            ${pendingVote?.id === 'skip' ? 'pending' : ''}
            ${!isAlive || myVote ? 'no-interact' : ''}`}
          onClick={() => selectVote('skip', t('skip'))}
          disabled={!isAlive || !!myVote}
        >
          <div className="vote-avatar skip-avatar">⏭</div>
          <div className="vote-name">{t('skip')}</div>
          {myVote === 'skip' && <div className="vote-check">✓</div>}
        </button>
      </div>

      {myVote && !pendingVote && (
        <div className="voted-notice">
          {t('voteCastMsg', totalVotesIn, totalLiving)}
        </div>
      )}

      {pendingVote && !myVote && (
        <div className="vote-confirm-bar">
          <span className="vote-confirm-label">
            <strong>{t('voteForMsg', pendingVote.name)}</strong>
          </span>
          <div className="vote-confirm-actions">
            <button className="btn btn-ghost btn-small" onClick={() => setPendingVote(null)}>
              {t('cancel')}
            </button>
            <button className="btn btn-red btn-small" onClick={confirmVote}>
              {t('confirm')}
            </button>
          </div>
        </div>
      )}

      {isManager && (
        <div className="manager-controls">
          <button className="btn btn-ghost btn-small" onClick={() => setShowForceEndVoting(true)}>
            {t('forceEndVotingBtn')}
          </button>
          <button className="btn btn-ghost btn-small" onClick={() => setShowEndConfirm(true)}>
            {t('endGameBtn')}
          </button>
        </div>
      )}

      {showForceEndVoting && (
        <Modal title={t('forceEndVotingTitle')} onClose={() => setShowForceEndVoting(false)}>
          <p style={{ color: 'var(--color-text-dim)', marginBottom: '8px' }}>{t('forceEndVotingConfirm')}</p>
          <button className="btn btn-red" onClick={forceEndVoting}>{t('forceEndVotingBtn')}</button>
          <button className="btn btn-ghost" onClick={() => setShowForceEndVoting(false)}>{t('cancel')}</button>
        </Modal>
      )}

      {pendingKickTarget && (
        <Modal title={t('kickPlayerTitle')} onClose={() => setPendingKickTarget(null)}>
          <p className="confirm-msg">{t('kickPlayerConfirm', pendingKickTarget.name)}</p>
          <button className="btn btn-red modal-player-btn" onClick={confirmKick}>{t('kickPlayerBtn')}</button>
          <button className="btn btn-ghost modal-player-btn" onClick={() => setPendingKickTarget(null)}>{t('cancel')}</button>
        </Modal>
      )}

      {showEndConfirm && (
        <Modal title={t('endGameTitle')} onClose={() => setShowEndConfirm(false)}>
          <p style={{ color: 'var(--color-text-dim)', marginBottom: '8px' }}>{t('endGameConfirm')}</p>
          <button className="btn btn-red" onClick={endGame}>{t('endGameBtn')}</button>
          <button className="btn btn-ghost" onClick={() => setShowEndConfirm(false)}>{t('cancel')}</button>
        </Modal>
      )}
    </div>
  );
}

function ResultsOverlay({ ejected, votes, players }) {
  const { t } = useLanguage();
  useEffect(() => { playVoteResults(); }, []);
  const playerMap = Object.fromEntries(players.map(p => [p.id, p.name]));

  return (
    <div className="screen results-screen">
      <div className="results-content">
        {ejected ? (
          <>
            <div className="ejected-animation">
              <div className="ejected-icon">🚀</div>
            </div>
            <h2 className="ejected-name">{t('wasEjected', ejected.name)}</h2>
            <p className={`ejected-result ${ejected.wasImposter ? 'correct' : 'wrong'}`}>
              {ejected.wasImposter ? t('wasImposterCorrect') : t('wasNotImposter')}
            </p>
          </>
        ) : (
          <>
            <div className="no-eject-icon">🤷</div>
            <h2>{t('noOneEjected')}</h2>
            <p className="ejected-result">{t('voteTied')}</p>
          </>
        )}

        <div className="vote-breakdown">
          {Object.entries(votes).map(([voterId, targetId]) => (
            <div key={voterId} className="vote-row">
              <span>{playerMap[voterId] || voterId}</span>
              <span>→</span>
              <span>{targetId === 'skip' ? t('skip') : (playerMap[targetId] || targetId)}</span>
            </div>
          ))}
        </div>

        <div className="results-waiting">
          <div className="spinner" />
          {t('resumingGame')}
        </div>
      </div>
    </div>
  );
}

function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 65%, 55%)`;
}
