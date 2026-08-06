import { useEffect, useRef, useState } from 'react';
import { useGame } from '../context/GameContext';
import { useLanguage } from '../context/LanguageContext';
import Modal from './Modal';
import socket from '../socket';
import { startCameraViewing } from '../webrtc';

function ViewTimer({ expiresAt }) {
  const [secs, setSecs] = useState(() => Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
  useEffect(() => {
    const tick = setInterval(() => {
      setSecs(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    }, 250);
    return () => clearInterval(tick);
  }, [expiresAt]);
  return <span className="camera-view-timer">{secs}s</span>;
}

function CooldownLabel({ cooldownUntil }) {
  const [secs, setSecs] = useState(() => Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000)));
  useEffect(() => {
    const tick = setInterval(() => {
      const s = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
      setSecs(s);
      if (s <= 0) clearInterval(tick);
    }, 250);
    return () => clearInterval(tick);
  }, [cooldownUntil]);
  return <span className="camera-cooldown-label">{secs}s</span>;
}

// Self-contained: renders its own trigger button and modal, so StationScreen
// only needs to mount it when this device is the designated camera monitor.
export default function CameraMonitorPanel() {
  const { state } = useGame();
  const { t } = useLanguage();
  const { gameCode, stationCameras, settings } = state;

  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState(null); // { stationId, roomName, expiresAt } | null
  const [cooldowns, setCooldowns] = useState({}); // { [stationId]: cooldownUntil }

  const videoRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const cleanupRef = useRef(null);

  // Re-attach the live stream whenever the <video> element (re)mounts —
  // it unmounts whenever the modal closes and a view is still in progress.
  useEffect(() => {
    if (videoRef.current && remoteStreamRef.current) {
      videoRef.current.srcObject = remoteStreamRef.current;
    }
  }, [open, viewing]);

  useEffect(() => {
    function onViewStarted({ targetStationId, expiresAt }) {
      const cam = (stationCameras ?? []).find(c => c.stationId === targetStationId);
      setViewing({ stationId: targetStationId, roomName: cam?.roomName ?? '?', expiresAt });
      cleanupRef.current = startCameraViewing({
        gameCode,
        sourceId: targetStationId,
        onTrack: (stream) => {
          remoteStreamRef.current = stream;
          if (videoRef.current) videoRef.current.srcObject = stream;
        },
      });
    }

    function onViewEnded({ targetStationId }) {
      cleanupRef.current?.();
      cleanupRef.current = null;
      remoteStreamRef.current = null;
      setViewing(null);
      setCooldowns(c => ({ ...c, [targetStationId]: Date.now() + (settings.cameraViewCooldown ?? 30000) }));
    }

    socket.on('camera_view_started', onViewStarted);
    socket.on('camera_view_ended', onViewEnded);
    return () => {
      socket.off('camera_view_started', onViewStarted);
      socket.off('camera_view_ended', onViewEnded);
    };
  }, [gameCode, stationCameras, settings.cameraViewCooldown]);

  useEffect(() => () => cleanupRef.current?.(), []);

  if (!stationCameras) return null;

  function requestView(stationId) {
    socket.emit('camera_view_request', { code: gameCode, targetStationId: stationId });
  }

  return (
    <>
      <button className="btn btn-ghost btn-small camera-open-btn" onClick={() => setOpen(true)}>
        📷 {t('cameraPanelTitle')}
      </button>

      {open && (
        <Modal title={t('cameraPanelTitle')} onClose={() => setOpen(false)}>
          {viewing ? (
            <div className="camera-view-wrap">
              <div className="camera-view-header">
                <span>{viewing.roomName}</span>
                <ViewTimer expiresAt={viewing.expiresAt} />
              </div>
              <video ref={videoRef} className="camera-view-video" autoPlay playsInline muted />
            </div>
          ) : stationCameras.length === 0 ? (
            <p style={{ color: 'var(--color-text-dim)', padding: '8px 0' }}>{t('cameraNoOthers')}</p>
          ) : (
            <div className="camera-list">
              {stationCameras.map(cam => {
                const cooldownUntil = cooldowns[cam.stationId] ?? 0;
                const onCooldown = Date.now() < cooldownUntil;
                return (
                  <div key={cam.stationId} className="camera-list-row">
                    <span className="camera-list-name">{cam.roomName}</span>
                    {onCooldown ? (
                      <CooldownLabel cooldownUntil={cooldownUntil} />
                    ) : (
                      <button className="btn btn-blue btn-small" onClick={() => requestView(cam.stationId)}>
                        {t('cameraWatchBtn')}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
