import { io } from 'socket.io-client';

// Singleton socket instance
const socket = io({
  autoConnect: true,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 10000,
  // Unlimited retries: this app is played in real life with phones walking
  // through dead zones and pockets — giving up after a fixed attempt count
  // just strands a player behind the reconnect overlay for no reason.
  reconnectionAttempts: Infinity,
  // Try websocket first (skip the polling handshake step) for faster/steadier
  // connections on cellular, falling back to polling if it's blocked.
  transports: ['websocket', 'polling'],
});

// On reconnect, attempt to rejoin the game using stored credentials
socket.on('reconnect', () => {
  const code = localStorage.getItem('gameCode');
  const name = localStorage.getItem('playerName');
  if (code && name) {
    socket.emit('rejoin_game', { code, name });
  }
});

// Mobile browsers can silently suspend the websocket (and its own reconnection
// timers) while the tab is backgrounded or the screen is locked. Force a
// reconnect check the moment the tab is foregrounded or the network comes
// back, instead of waiting for socket.io's own backoff to notice.
function forceReconnectCheck() {
  if (!socket.connected) socket.connect();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') forceReconnectCheck();
});

window.addEventListener('online', forceReconnectCheck);

export default socket;
