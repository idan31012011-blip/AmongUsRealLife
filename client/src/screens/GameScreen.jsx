import { useState, useEffect } from 'react';
import { useGame } from '../context/GameContext';
import { useLanguage } from '../context/LanguageContext';
import socket from '../socket';
import TaskProgressBar from '../components/TaskProgressBar';
import TaskList from '../components/TaskList';
import KillButton from '../components/KillButton';
import Modal from '../components/Modal';
import SabotageMenu from '../components/SabotageMenu';
import LockdownNotification from '../components/LockdownNotification';

// Countdown for a locked room (shown on left side panel)
function RoomLockTimer({ expiresAt }) {
  const [secs, setSecs] = useState(() => Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
  useEffect(() => {
    const tick = setInterval(() => {
      const s = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setSecs(s);
      if (s <= 0) clearInterval(tick);
    }, 250);
    return () => clearInterval(tick);
  }, [expiresAt]);
  return <span className="locked-room-timer">{secs}s</span>;
}

// Countdown shown next to the Meeting button during global lockdown
function GlobalLockTimer({ expiresAt }) {
  const [secs, setSecs] = useState(() => Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
  useEffect(() => {
    const tick = setInterval(() => {
      const s = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setSecs(s);
      if (s <= 0) clearInterval(tick);
    }, 250);
    return () => clearInterval(tick);
  }, [expiresAt]);
  return <span className="btn-action-countdown">{secs}s</span>;
}

export default function GameScreen() {
  const { state, dispatch } = useGame();
  const { t } = useLanguage();
  const {
    myRole, isAlive, players, gameCode, taskProgressPercent, myId, isManager,
    settings, sabotage, pendingLockNotification, rooms,
  } = state;

  const [showKillMenu, setShowKillMenu] = useState(false);
  const [pendingKillTarget, setPendingKillTarget] = useState(null);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [disguised, setDisguised] = useState(false);
  const [showSabotageMenu, setShowSabotageMenu] = useState(false);

  const livingTargets = players.filter(p => p.isAlive && p.id !== myId);

  function openKillMenu() { setShowKillMenu(true); }

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
    if (sabotage.globalLockdownActive) return;
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
  const lockdownActive = sabotage.globalLockdownActive;
  const showAsImposter = isImposter && !disguised;

  return (
    <div className={`screen game-screen ${isDead ? 'dead-screen' : ''}`}>
      {/* Top bar */}
      <div className="game-topbar">
        <TaskProgressBar percent={taskProgressPercent} />
      </div>

      {/* Role badge */}
      <div className={`role-badge ${showAsImposter ? 'role-imposter' : 'role-crewmate'}`}>
        {isDead ? t('deadRole') : showAsImposter ? t('imposterRole') : t('crewmateRole')}
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
          <h2>{t('ghostTitle')}</h2>
          <p>{t('waitingForMeeting')}</p>
          <p className="locked-sub">{t('lockedDeadSub')}</p>
        </div>
      ) : (
        <div className="task-area">
          {isDead && (
            <div className="dead-notice">
              <span>👻 {t('deadTaskNotice')}</span>
            </div>
          )}
          <TaskList
            tasks={state.myTasks}
            gameCode={gameCode}
            isAlive={isAlive}
            aliveDuration={settings.taskHoldDuration}
            deadDuration={settings.deadTaskHoldDuration}
            hideFakeBadge={disguised}
          />
        </div>
      )}

      {/* Bottom action bar — living players only */}
      {!isDead && (
        <div className={`game-bottombar ${showAsImposter ? 'bar-imposter' : 'bar-crewmate'}`}>

          <button
            className={`btn-action btn-emergency ${lockdownActive ? 'btn-locked btn-disabled' : ''}`}
            onClick={callEmergency}
            disabled={lockdownActive}
          >
            <span className="btn-action-icon">{lockdownActive ? '🔒' : '🚨'}</span>
            <span className="btn-action-label">{lockdownActive ? t('lockedBtn') : t('meetingBtn')}</span>
            {lockdownActive && sabotage.globalLockdownExpiresAt && (
              <GlobalLockTimer expiresAt={sabotage.globalLockdownExpiresAt} />
            )}
          </button>

          {isImposter && !disguised && settings.sabotageEnabled && (
            <button
              className="btn-action btn-sabotage"
              onClick={() => setShowSabotageMenu(true)}
            >
              <span className="btn-action-icon">⚡</span>
              <span className="btn-action-label">{t('sabotageBtn')}</span>
            </button>
          )}

          {isImposter && !disguised && (
            <KillButton
              cooldownUntil={state.killCooldownUntil}
              totalCooldown={settings.killCooldown}
              onKill={openKillMenu}
            />
          )}
        </div>
      )}

      {/* Manager controls */}
      {isManager && (
        <div className="manager-controls">
          <button className="btn btn-ghost btn-small" onClick={() => setShowEndConfirm(true)}>
            {t('endGameBtn')}
          </button>
        </div>
      )}

      {/* Kill target picker */}
      {showKillMenu && (
        <Modal title={t('killWhoTitle')} onClose={() => setShowKillMenu(false)}>
          {livingTargets.length === 0 ? (
            <p style={{ color: 'var(--color-text-dim)', padding: '8px 0' }}>{t('noTargets')}</p>
          ) : (
            livingTargets.map(p => (
              <button key={p.id} className="btn btn-red modal-player-btn" onClick={() => selectKillTarget(p)}>
                {p.name}
              </button>
            ))
          )}
        </Modal>
      )}

      {/* Kill confirm */}
      {pendingKillTarget && (
        <Modal title={t('confirmKillTitle')} onClose={() => setPendingKillTarget(null)}>
          <p className="confirm-msg">{t('killConfirmMsg', pendingKillTarget.name)}</p>
          <button className="btn btn-red modal-player-btn" onClick={confirmKill}>
            {t('confirmKillTitle')}
          </button>
          <button className="btn btn-ghost modal-player-btn" onClick={() => setPendingKillTarget(null)}>
            {t('cancel')}
          </button>
        </Modal>
      )}

      {/* End game confirmation */}
      {showEndConfirm && (
        <Modal title={t('endGameTitle')} onClose={() => setShowEndConfirm(false)}>
          <p style={{ color: 'var(--color-text-dim)', marginBottom: '8px' }}>{t('endGameConfirm')}</p>
          <button className="btn btn-red" onClick={endGame}>{t('endGameBtn')}</button>
          <button className="btn btn-ghost" onClick={() => setShowEndConfirm(false)}>{t('cancel')}</button>
        </Modal>
      )}

      {/* Sabotage menu */}
      {showSabotageMenu && (
        <SabotageMenu
          rooms={rooms}
          sabotage={sabotage}
          settings={settings}
          gameCode={gameCode}
          onClose={() => setShowSabotageMenu(false)}
        />
      )}

      {/* Locked rooms panel — left side, visible to all players */}
      {sabotage.lockedRooms.length > 0 && (
        <div className="locked-rooms-panel">
          {sabotage.lockedRooms.map(({ roomName, expiresAt }) => (
            <div key={roomName} className="locked-room-entry">
              <span className="locked-room-icon">🔒</span>
              <div className="locked-room-info">
                <span className="locked-room-name">{roomName}</span>
                <RoomLockTimer expiresAt={expiresAt} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lockdown / room lock notification */}
      <LockdownNotification
        notification={pendingLockNotification}
        onDismiss={() => dispatch({ type: 'DISMISS_LOCK_NOTIFICATION' })}
      />
    </div>
  );
}
