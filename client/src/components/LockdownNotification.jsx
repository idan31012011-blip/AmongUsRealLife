import { useState, useEffect } from 'react';
import Modal from './Modal';
import { playRoomLock } from '../sounds';

// Ticking countdown for the global lockdown overlay
function LockdownCountdown({ expiresAt }) {
  const [secs, setSecs] = useState(() => Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));

  useEffect(() => {
    const tick = setInterval(() => {
      const s = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setSecs(s);
      if (s <= 0) clearInterval(tick);
    }, 250);
    return () => clearInterval(tick);
  }, [expiresAt]);

  return <div className="lockdown-countdown">{secs}</div>;
}

// Ticking countdown for the room lock modal
function RoomLockCountdown({ expiresAt }) {
  const [secs, setSecs] = useState(() => Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));

  useEffect(() => {
    const tick = setInterval(() => {
      const s = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setSecs(s);
      if (s <= 0) clearInterval(tick);
    }, 250);
    return () => clearInterval(tick);
  }, [expiresAt]);

  return <span>Unlocks in {secs}s</span>;
}

export default function LockdownNotification({ notification, onDismiss }) {
  // Play room lock sound once on mount for room-type notifications
  useEffect(() => {
    if (notification?.type === 'room') {
      playRoomLock();
    }
    // Global lockdown sound is triggered in GameContext socket listener, not here
  }, [notification?.type, notification?.roomName]); // re-trigger if a new room gets locked

  if (!notification) return null;

  // ── Global lockdown — full-screen overlay ─────────────────────────────────
  if (notification.type === 'global') {
    return (
      <div className="lockdown-overlay">
        <div className="lockdown-icon">🔒</div>
        <div className="lockdown-title">GLOBAL LOCKDOWN</div>
        <LockdownCountdown expiresAt={notification.expiresAt} />
        <div className="lockdown-subtitle">
          All rooms are locked.{'\n'}Emergency meetings are disabled.
        </div>
        <button className="lockdown-dismiss-btn" onClick={onDismiss}>
          UNDERSTOOD
        </button>
      </div>
    );
  }

  // ── Room lock — bottom-sheet modal ────────────────────────────────────────
  return (
    <Modal title="Room Locked" onClose={onDismiss}>
      <div className="room-lock-content">
        <div className="room-lock-icon">🔒</div>
        <div className="room-lock-message">
          <span>{notification.roomName}</span> is now LOCKED!
        </div>
        <div className="room-lock-countdown">
          <RoomLockCountdown expiresAt={notification.expiresAt} />
        </div>
        <button className="btn btn-ghost btn-large" onClick={onDismiss}>
          Got it
        </button>
      </div>
    </Modal>
  );
}
