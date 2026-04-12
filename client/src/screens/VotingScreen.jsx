import { useState } from 'react';
import { useGame } from '../context/GameContext';
import socket from '../socket';

export default function VotingScreen() {
  const { state, dispatch } = useGame();
  const {
    players, myId, isAlive, gameCode,
    myVote, totalVotesIn, votes, ejectedPlayer, lastMeeting,
  } = state;

  const [pendingVote, setPendingVote] = useState(null); // { id, name } or { id: 'skip', name: 'Skip' }

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
            <span>{lastMeeting.reporterName} found {lastMeeting.bodyName}'s body!</span>
          </div>
        ) : (
          <div className="meeting-reason">
            <span className="meeting-icon">🚨</span>
            <span>{lastMeeting?.reporterName} called an emergency meeting!</span>
          </div>
        )}
        <h2>Who is the Imposter?</h2>
        <div className="vote-progress">{totalVotesIn}/{totalLiving} voted</div>
      </div>

      {!isAlive && (
        <div className="dead-vote-notice">👻 Dead players cannot vote</div>
      )}

      <div className="vote-grid">
        {livingPlayers.map(p => (
          <button
            key={p.id}
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
              {p.id === myId && ' (you)'}
            </div>
            {myVote === p.id && <div className="vote-check">✓</div>}
          </button>
        ))}

        <button
          className={`vote-card vote-skip
            ${myVote === 'skip' ? 'voted' : ''}
            ${myVote && myVote !== 'skip' ? 'dimmed' : ''}
            ${pendingVote?.id === 'skip' ? 'pending' : ''}
            ${!isAlive || myVote ? 'no-interact' : ''}`}
          onClick={() => selectVote('skip', 'Skip')}
          disabled={!isAlive || !!myVote}
        >
          <div className="vote-avatar skip-avatar">⏭</div>
          <div className="vote-name">Skip</div>
          {myVote === 'skip' && <div className="vote-check">✓</div>}
        </button>
      </div>

      {myVote && !pendingVote && (
        <div className="voted-notice">
          Vote cast! Waiting for others ({totalVotesIn}/{totalLiving})…
        </div>
      )}

      {/* Vote confirmation bar */}
      {pendingVote && !myVote && (
        <div className="vote-confirm-bar">
          <span className="vote-confirm-label">
            Vote for <strong>{pendingVote.name}</strong>?
          </span>
          <div className="vote-confirm-actions">
            <button className="btn btn-ghost btn-small" onClick={() => setPendingVote(null)}>
              Cancel
            </button>
            <button className="btn btn-red btn-small" onClick={confirmVote}>
              Confirm
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ResultsOverlay({ ejected, votes, players }) {
  const playerMap = Object.fromEntries(players.map(p => [p.id, p.name]));

  return (
    <div className="screen results-screen">
      <div className="results-content">
        {ejected ? (
          <>
            <div className="ejected-animation">
              <div className="ejected-icon">🚀</div>
            </div>
            <h2 className="ejected-name">{ejected.name} was ejected.</h2>
            <p className={`ejected-result ${ejected.wasImposter ? 'correct' : 'wrong'}`}>
              {ejected.wasImposter ? '✓ They were the Imposter.' : '✗ They were not the Imposter.'}
            </p>
          </>
        ) : (
          <>
            <div className="no-eject-icon">🤷</div>
            <h2>No one was ejected.</h2>
            <p className="ejected-result">The vote was tied or skipped.</p>
          </>
        )}

        <div className="vote-breakdown">
          {Object.entries(votes).map(([voterId, targetId]) => (
            <div key={voterId} className="vote-row">
              <span>{playerMap[voterId] || voterId}</span>
              <span>→</span>
              <span>{targetId === 'skip' ? 'Skip' : (playerMap[targetId] || targetId)}</span>
            </div>
          ))}
        </div>

        <div className="results-waiting">
          <div className="spinner" />
          Resuming game…
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
