const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { registerHandlers } = require('./socketHandlers');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  // Tolerate flaky mobile networks: default pingTimeout (20s) is too eager to
  // declare a socket dead when a phone's radio briefly drops signal.
  pingTimeout: 30000,
  pingInterval: 25000,
  // Lets a socket that reconnects with the same id (e.g. after a brief mobile
  // background/suspend) pick back up in its previous rooms automatically.
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true,
  },
});

// Serve the built client from client/dist
const distPath = path.join(__dirname, '../client/dist');
app.use(express.static(distPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

io.on('connection', socket => {
  registerHandlers(io, socket);
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Among Us IRL server running on port ${PORT}`);
});
