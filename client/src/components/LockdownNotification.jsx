import { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import Modal from './Modal';
import { playRoomLock } from '../sounds';

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

function RoomLockCountdown({ expiresAt }) {
  const { t } = useLanguage();
  const [secs, setSecs] = useState(() => Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));

  useEffect(() => {
    const tick = setInterval(() => {
      const s = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setSecs(s);
      if (s <= 0) clearInterval(tick);
    }, 250);
    return () => clearInterval(tick);
  }, [expiresAt]);

  return <span>{t('unlocksIn', secs)}</span>;
}

export default function LockdownNotification({ notification, onDismiss }) {
  const { t } = useLanguage();

  useEffect(() => {
    if (notification?.type === 'room') {
      playRoomLock();
    }
  }, [notification?.type, notification?.roomName]);

  if (!notification) return null;

  if (notification.type === 'global') {
    const lines = t('lockdownSubtitle').split('\n');
    return (
      <div className="lockdown-overlay">
        <div className="lockdown-icon">🔒</div>
        <div className="lockdown-title">{t('globalLockdownTitle')}</div>
        <LockdownCountdown expiresAt={notification.expiresAt} />
        <div className="lockdown-subtitle">
          {lines.map((line, i) => (
            <span key={i}>{line}{i < lines.length - 1 && <br />}</span>
          ))}
        </div>
        <button className="lockdown-dismiss-btn" onClick={onDismiss}>
          {t('understood')}
        </button>
      </div>
    );
  }

  return (
    <Modal title={t('roomLockedModalTitle')} onClose={onDismiss}>
      <div className="room-lock-content">
        <div className="room-lock-icon">🔒</div>
        <div className="room-lock-message">
          <span>{notification.roomName}</span> {t('roomLockedSuffix')}
        </div>
        <div className="room-lock-countdown">
          <RoomLockCountdown expiresAt={notification.expiresAt} />
        </div>
        <button className="btn btn-ghost btn-large" onClick={onDismiss}>
          {t('gotIt')}
        </button>
      </div>
    </Modal>
  );
}
