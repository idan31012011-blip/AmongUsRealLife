import { useEffect, useRef, useState } from 'react';
import { useGame } from '../context/GameContext';
import { useLanguage } from '../context/LanguageContext';
import socket from '../socket';
import { startCameraBroadcast } from '../webrtc';

// Mounted on every station device that isn't the camera monitor. Sits idle
// until the monitor requests a view, then grabs the camera on-demand (no
// permission prompt, no battery drain, until someone actually watches).
export default function CameraSourceOverlay() {
  const { state } = useGame();
  const { t } = useLanguage();
  const { gameCode } = state;
  const [watching, setWatching] = useState(false);

  const streamRef = useRef(null);
  const cleanupRef = useRef(null);

  useEffect(() => {
    function stopBroadcast() {
      cleanupRef.current?.();
      cleanupRef.current = null;
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setWatching(false);
    }

    async function onBeingWatched({ viewerId }) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 320 },
            height: { ideal: 240 },
            frameRate: { ideal: 8, max: 10 },
          },
          audio: false,
        });
        streamRef.current = stream;
        cleanupRef.current = startCameraBroadcast({ gameCode, viewerId, stream });
        setWatching(true);
      } catch {
        // Camera unavailable/denied — nothing to broadcast, stay idle.
      }
    }

    function onViewEnded({ targetStationId }) {
      if (targetStationId !== state.myId) return;
      stopBroadcast();
    }

    socket.on('camera_being_watched', onBeingWatched);
    socket.on('camera_view_ended', onViewEnded);
    return () => {
      socket.off('camera_being_watched', onBeingWatched);
      socket.off('camera_view_ended', onViewEnded);
      stopBroadcast();
    };
  }, [gameCode, state.myId]);

  if (!watching) return null;

  return (
    <div className="camera-watch-dot" title={t('cameraBeingWatchedHint')}>
      <span className="camera-watch-dot-pulse" />
    </div>
  );
}
