const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { registerHandlers } = require('./socketHandlers');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
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
