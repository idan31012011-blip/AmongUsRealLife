import { useState } from 'react';
import { useGame } from '../context/GameContext';
import socket from '../socket';
import TaskProgressBar from '../components/TaskProgressBar';
import TaskList from '../components/TaskList';
import KillButton from '../components/KillButton';
import Modal from '../components/Modal';

export default function GameScreen() {
  const { state } = useGame();
  const { myRole, isAlive, players, gameCode, taskProgressPercent, myId, isManager } = state;

  const [showKillMenu, setShowKillMenu] = useState(false);
  const [pendingKillTarget, setPendingKillTarget] = useState(null); // { id, name }
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [disguised, setDisguised] = useState(false); // imposter-only: fake crewmate appearance

  const livingTargets = players.filter(p => p.isAlive && p.id !== myId);

  function openKillMenu() {
    setShowKillMenu(true);
  }

  function selectKillTarget(player) {
    setShowKillMenu(false);
    setPendingKillTarget(player);
  }

  function confirmKill() {
    if (!pendingKillTarget) return;
    socket.emit('kill_player', { code: gameCode, targetId: pendingKillTarget.id });
    setPendingKillTarget(null);
  }

  function callEmergency() {
    socket.emit('call_emergency', { code: gameCode });
  }

  function endGame() {
    socket.emit('end_game', { code: gameCode });
    setShowEndConfirm(false);
  }

  const isDead = !isAlive;
  const isImposter = myRole === 'imposter';
  const myPlayer = players.find(p => p.id === myId);
  const isLocked = isDead && !myPlayer?.bodyFound;

  // When disguised, show crewmate colors; real imposter controls still work
  const showAsImposter = isImposter && !disguised;

  return (
    <div className={`screen game-screen ${isDead ? 'dead-screen' : ''}`}>
      {/* Top bar */}
      <div className="game-topbar">
        <TaskProgressBar percent={taskProgressPercent} />
      </div>

      {/* Role badge — disguised shows blue crewmate */}
      <div className={`role-badge ${showAsImposter ? 'role-imposter' : 'role-crewmate'}`}>
        {isDead ? '💀 Dead' : showAsImposter ? '🔪 Imposter' : '🚀 Crewmate'}
        {/* Disguise toggle (imposter only, hidden when dead) */}
        {isImposter && !isDead && (
          <button
            className={`disguise-toggle ${disguised ? 'disguise-on' : ''}`}
            onClick={() => setDisguised(d => !d)}
            title={disguised ? 'Show true screen' : 'Disguise screen'}
          >
            {disguised ? '👁' : '🎭'}
          </button>
        )}
      </div>

      {/* Task area */}
      {isLocked ? (
        <div className="locked-message">
          <div className="locked-icon">👻</div>
          <h2>You're dead</h2>
          <p>Waiting for an emergency meeting…</p>
          <p className="locked-sub">You can complete your tasks once an emergency meeting is called.</p>
        </div>
      ) : (
        <div className="task-area">
          {isDead && (
            <div className="dead-notice">
              <span>👻 You're dead — complete your tasks to help the crewmates!</span>
            </div>
          )}
          <TaskList tasks={state.myTasks} gameCode={gameCode} isAlive={isAlive} />
        </div>
      )}

      {/* Bottom action bar — living players only */}
      {!isDead && (
        <div className={`game-bottombar ${showAsImposter ? 'bar-imposter' : 'bar-crewmate'}`}>
          <button className="btn-action btn-emergency" onClick={callEmergency}>
            <span className="btn-action-icon">🚨</span>
            <span className="btn-action-label">Meeting</span>
          </button>

          {/* Kill button only visible when not disguised */}
          {isImposter && !disguised && (
            <KillButton
              cooldownUntil={state.killCooldownUntil}
              onKill={openKillMenu}
            />
          )}
        </div>
      )}

      {/* Manager controls */}
      {isManager && (
        <div className="manager-controls">
          <button className="btn btn-ghost btn-small" onClick={() => setShowEndConfirm(true)}>
            End Game
          </button>
        </div>
      )}

      {/* Step 1: pick target */}
      {showKillMenu && (
        <Modal title="Kill Who?" onClose={() => setShowKillMenu(false)}>
          {livingTargets.length === 0 ? (
            <p style={{ color: 'var(--color-text-dim)', padding: '8px 0' }}>No targets nearby.</p>
          ) : (
            livingTargets.map(p => (
              <button key={p.id} className="btn btn-red modal-player-btn" onClick={() => selectKillTarget(p)}>
                {p.name}
              </button>
            ))
          )}
        </Modal>
      )}

      {/* Step 2: confirm kill */}
      {pendingKillTarget && (
        <Modal title="Confirm Kill" onClose={() => setPendingKillTarget(null)}>
          <p className="confirm-msg">Kill <strong>{pendingKillTarget.name}</strong>?</p>
          <button className="btn btn-red modal-player-btn" onClick={confirmKill}>
            Confirm Kill
          </button>
          <button className="btn btn-ghost modal-player-btn" onClick={() => setPendingKillTarget(null)}>
            Cancel
          </button>
        </Modal>
      )}

      {/* End game confirmation */}
      {showEndConfirm && (
        <Modal title="End Game?" onClose={() => setShowEndConfirm(false)}>
          <p style={{ color: 'var(--color-text-dim)', marginBottom: '8px' }}>End the game early?</p>
          <button className="btn btn-red" onClick={endGame}>End Game</button>
          <button className="btn btn-ghost" onClick={() => setShowEndConfirm(false)}>Cancel</button>
        </Modal>
      )}
    </div>
  );
}
