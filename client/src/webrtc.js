import socket from './socket';

// The server never inspects camera_signal payloads — it just relays them
// between whichever two station sockets are the current monitor/camera pair.
// Public STUN only (no TURN): fine for phones on the same LAN, which is the
// only supported play mode for this app.
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

/**
 * Camera-source side: adds the local stream to a new peer connection, sends
 * an offer to the viewer, and keeps exchanging ICE candidates until closed.
 * Returns a cleanup function.
 */
export function startCameraBroadcast({ gameCode, viewerId, stream }) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  stream.getTracks().forEach(track => pc.addTrack(track, stream));

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      socket.emit('camera_signal', {
        code: gameCode,
        targetId: viewerId,
        signal: { type: 'ice', candidate: e.candidate },
      });
    }
  };

  function onSignal({ fromId, signal }) {
    if (fromId !== viewerId) return;
    if (signal.type === 'answer') {
      pc.setRemoteDescription(new RTCSessionDescription(signal.description)).catch(() => {});
    } else if (signal.type === 'ice') {
      pc.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(() => {});
    }
  }
  socket.on('camera_signal', onSignal);

  pc.createOffer()
    .then(offer => pc.setLocalDescription(offer))
    .then(() => {
      socket.emit('camera_signal', {
        code: gameCode,
        targetId: viewerId,
        signal: { type: 'offer', description: pc.localDescription },
      });
    })
    .catch(() => {});

  return function cleanup() {
    socket.off('camera_signal', onSignal);
    pc.close();
  };
}

/**
 * Monitor side: waits for the offer relayed from the camera station, answers
 * it, and reports the incoming remote stream via onTrack. Returns a cleanup
 * function.
 */
export function startCameraViewing({ gameCode, sourceId, onTrack }) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  pc.ontrack = (e) => onTrack(e.streams[0]);

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      socket.emit('camera_signal', {
        code: gameCode,
        targetId: sourceId,
        signal: { type: 'ice', candidate: e.candidate },
      });
    }
  };

  function onSignal({ fromId, signal }) {
    if (fromId !== sourceId) return;
    if (signal.type === 'offer') {
      pc.setRemoteDescription(new RTCSessionDescription(signal.description))
        .then(() => pc.createAnswer())
        .then(answer => pc.setLocalDescription(answer))
        .then(() => {
          socket.emit('camera_signal', {
            code: gameCode,
            targetId: sourceId,
            signal: { type: 'answer', description: pc.localDescription },
          });
        })
        .catch(() => {});
    } else if (signal.type === 'ice') {
      pc.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(() => {});
    }
  }
  socket.on('camera_signal', onSignal);

  return function cleanup() {
    socket.off('camera_signal', onSignal);
    pc.close();
  };
}
