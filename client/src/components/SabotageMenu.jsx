import { useState, useEffect } from 'react';
import Modal from './Modal';
import socket from '../socket';

// Mini SVG cooldown ring — same approach as KillButton
function CooldownRing({ cooldownUntil, totalDuration, size = 44 }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, cooldownUntil - Date.now()));

  useEffect(() => {
    const tick = setInterval(() => {
      const r = Math.max(0, cooldownUntil - Date.now());
      setRemaining(r);
      if (r <= 0) clearInterval(tick);
    }, 100);
    return () => clearInterval(tick);
  }, [cooldownUntil]);

  const r = (size / 2) - 4;
  const circ = 2 * Math.PI * r;
  const fraction = totalDuration > 0 ? remaining / totalDuration : 0;
  const offset = circ * (1 - fraction);
  const secs = Math.ceil(remaining / 1000);

  return (
    <div className="cooldown-ring-wrap" style={{ width: size, height: size }}>
      <svg className="cooldown-ring-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="var(--color-border)" strokeWidth="3"
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="var(--color-text-dim)" strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.1s linear' }}
        />
      </svg>
      <div className="cooldown-ring-label">{secs > 0 ? secs : ''}</div>
    </div>
  );
}

// Countdown text for active locked rooms
function LockCountdown({ expiresAt }) {
  const [secs, setSecs] = useState(() => Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));

  useEffect(() => {
    const tick = setInterval(() => {
      const s = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setSecs(s);
      if (s <= 0) clearInterval(tick);
    }, 250);
    return () => clearInterval(tick);
  }, [expiresAt]);

  return <span className="sabotage-countdown">{secs}s</span>;
}

// Global lockdown countdown text
function GlobalCountdown({ expiresAt }) {
  const [secs, setSecs] = useState(() => Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));

  useEffect(() => {
    const tick = setInterval(() => {
      const s = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setSecs(s);
      if (s <= 0) clearInterval(tick);
    }, 250);
    return () => clearInterval(tick);
  }, [expiresAt]);

  return <span className="sabotage-countdown">{secs}s</span>;
}

export default function SabotageMenu({ rooms, sabotage, settings, gameCode, onClose }) {
  const {
    lockedRooms,
    roomLockCooldowns,
    globalLockdownActive,
    globalLockdownExpiresAt,
    globalLockdownCooldownUntil,
    globalLockdownUsesLeft,
  } = sabotage;

  function lockRoom(roomName) {
    socket.emit('lock_room', { code: gameCode, roomName });
  }

  function triggerLockdown() {
    socket.emit('trigger_global_lockdown', { code: gameCode });
  }

  return (
    <Modal title="Sabotage" onClose={onClose}>
      <div>

        {/* ── Room Locking ──────────────────────────────────────────── */}
        {settings.roomLockingEnabled && (
          <>
            <div className="settings-section-title">Room Locking</div>
            {rooms.map(roomName => {
              const lockEntry = lockedRooms.find(r => r.roomName === roomName);
              const cooldownUntil = roomLockCooldowns[roomName] ?? 0;
              const isLocked = !!lockEntry;
              const onCooldown = !isLocked && Date.now() < cooldownUntil;
              const atMax = !isLocked && lockedRooms.length >= settings.maxLockedRooms;

              return (
                <div key={roomName} className="sabotage-room-row">
                  <span className="sabotage-room-name">{roomName}</span>

                  {isLocked ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="sabotage-badge-locked">Locked</span>
                      <LockCountdown expiresAt={lockEntry.expiresAt} />
                    </div>
                  ) : onCooldown ? (
                    <CooldownRing
                      cooldownUntil={cooldownUntil}
                      totalDuration={settings.roomLockCooldown}
                      size={44}
                    />
                  ) : (
                    <button
                      className="btn btn-red btn-small"
                      onClick={() => lockRoom(roomName)}
                      disabled={atMax}
                      style={{ opacity: atMax ? 0.4 : 1 }}
                    >
                      Lock
                    </button>
                  )}
                </div>
              );
            })}
            {lockedRooms.length >= settings.maxLockedRooms && (
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8, textAlign: 'center' }}>
                Max {settings.maxLockedRooms} rooms locked at once
              </p>
            )}
          </>
        )}

        {/* ── Global Lockdown ───────────────────────────────────────── */}
        {settings.globalLockdownEnabled && (
          <div className="sabotage-global-section">
            <div className="settings-section-title" style={{ margin: 0, border: 'none' }}>
              Global Lockdown
            </div>

            <p className="sabotage-uses">
              Uses: {globalLockdownUsesLeft} / {settings.maxGlobalLockdowns}
            </p>

            {globalLockdownActive ? (
              <>
                <span className="sabotage-active-badge">⚡ ACTIVE</span>
                <GlobalCountdown expiresAt={globalLockdownExpiresAt} />
              </>
            ) : globalLockdownUsesLeft <= 0 ? (
              <button className="btn btn-red btn-large" disabled style={{ opacity: 0.3 }}>
                No Uses Left
              </button>
            ) : Date.now() < globalLockdownCooldownUntil ? (
              <>
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Cooldown</p>
                <CooldownRing
                  cooldownUntil={globalLockdownCooldownUntil}
                  totalDuration={settings.globalLockdownCooldown}
                  size={60}
                />
              </>
            ) : (
              <button className="btn btn-red btn-large" onClick={triggerLockdown}>
                🔒 Global Lockdown
              </button>
            )}
          </div>
        )}

      </div>
    </Modal>
  );
}
