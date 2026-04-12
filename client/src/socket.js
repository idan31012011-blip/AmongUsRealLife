import { io } from 'socket.io-client';

// Singleton socket instance
const socket = io({
  autoConnect: true,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 10,
});

// On reconnect, attempt to rejoin the game using stored credentials
socket.on('reconnect', () => {
  const code = localStorage.getItem('gameCode');
  const name = localStorage.getItem('playerName');
  if (code && name) {
    socket.emit('rejoin_game', { code, name });
  }
});

export default socket;
