const { createGame, getGame, deleteGame } = require('./gameManager');
const {
  assignRoles,
  calculateTaskProgress,
  tallyVotes,
  checkWinConditions,
  buildPublicPlayerList,
  buildRevealPlayerList,
  buildPlayerTasks,
} = require('./gameLogic');

// Map socketId → { gameCode, name } for disconnect recovery
const socketMeta = new Map();

function registerHandlers(io, socket) {
  // ─── LOBBY ────────────────────────────────────────────────────────────────

  socket.on('create_game', ({ rooms, settings } = {}) => {
    if (!rooms || rooms.length < 1) {
      return socket.emit('error', { message: 'At least one room required.' });
    }
    const game = createGame({ managerId: socket.id, rooms, settings });
    socket.join(game.code);
    socketMeta.set(socket.id, { gameCode: game.code, name: '__manager__' });
    socket.emit('game_created', { code: game.code });
  });

  socket.on('join_game', ({ code, name } = {}) => {
    const game = getGame(code);
    if (!game) return socket.emit('error', { message: 'Game not found.' });
    if (game.phase !== 'lobby') return socket.emit('error', { message: 'Game already started.' });
    if (!name || name.trim().length === 0) return socket.emit('error', { message: 'Name required.' });

    const trimmedName = name.trim().slice(0, 20);

    // Reject duplicate names
    for (const p of game.players.values()) {
      if (p.name.toLowerCase() === trimmedName.toLowerCase() && !p.disconnected) {
        return socket.emit('error', { message: 'Name already taken.' });
      }
    }

    const player = {
      id: socket.id,
      name: trimmedName,
      role: null,
      isAlive: true,
      bodyFound: false,
      votedOut: false,
      disconnected: false,
      tasksAssigned: [],
      tasksCompleted: new Set(),
      hasCalledEmergency: false,
    };

    game.players.set(socket.id, player);
    socket.join(code);
    socketMeta.set(socket.id, { gameCode: code, name: trimmedName });

    // Send full lobby state to the joining player
    socket.emit('game_joined', {
      code,
      players: buildPublicPlayerList(game.players),
      rooms: game.rooms,
      settings: game.settings,
      isManager: socket.id === game.managerId,
    });

    // Notify everyone else in the lobby
    socket.to(code).emit('player_joined', {
      player: { id: socket.id, name: trimmedName, isAlive: true, bodyFound: false, votedOut: false, disconnected: false },
    });
  });

  socket.on('rejoin_game', ({ code, name } = {}) => {
    const game = getGame(code);
    if (!game) return socket.emit('error', { message: 'Game not found.' });

    const trimmedName = name?.trim();
    if (!trimmedName) return socket.emit('error', { message: 'Name required.' });

    // Find the disconnected player slot
    let found = null;
    for (const [oldId, p] of game.players) {
      if (p.name.toLowerCase() === trimmedName.toLowerCase() && p.disconnected) {
        found = { oldId, player: p };
        break;
      }
    }

    if (!found) return socket.emit('error', { message: 'No disconnected player found with that name.' });

    const { oldId, player } = found;

    // Migrate player to new socket ID
    game.players.delete(oldId);
    player.id = socket.id;
    player.disconnected = false;
    game.players.set(socket.id, player);

    // Update manager if they were the manager
    if (game.managerId === oldId) game.managerId = socket.id;

    socket.join(code);
    socketMeta.set(socket.id, { gameCode: code, name: trimmedName });

    // Restore state based on current phase
    const base = {
      code,
      phase: game.phase,
      players: buildPublicPlayerList(game.players),
      rooms: game.rooms,
      settings: game.settings,
      isManager: socket.id === game.managerId,
      taskProgressPercent: calculateTaskProgress(game.tasks),
    };

    if (game.phase === 'lobby') {
      socket.emit('game_joined', base);
    } else {
      socket.emit('game_state_restored', {
        ...base,
        role: player.role,
        myTasks: buildPlayerTasks(player, game.tasks),
        isAlive: player.isAlive,
        killCooldownUntil: player.role === 'imposter' ? game.imposterKillCooldownUntil : 0,
        hasCalledEmergency: player.hasCalledEmergency,
      });
    }

    io.to(code).emit('player_reconnected', { playerId: socket.id, name: trimmedName });
  });

  socket.on('kick_player', ({ code, targetId } = {}) => {
    const game = getGame(code);
    if (!game || game.phase !== 'lobby') return socket.emit('error', { message: 'Can only kick in lobby.' });
    if (socket.id !== game.managerId) return socket.emit('error', { message: 'Only manager can kick.' });
    if (targetId === socket.id) return socket.emit('error', { message: 'Cannot kick yourself.' });

    // Remove from server state
    game.players.delete(targetId);
    socketMeta.delete(targetId);

    // Remove from Socket.IO room so they stop receiving room events
    const kickedSocket = io.sockets.sockets.get(targetId);
    if (kickedSocket) kickedSocket.leave(code);

    // player_kicked carries the playerId — clients check if it's themselves
    io.to(code).emit('player_kicked', { playerId: targetId });
    // Also tell the kicked socket directly in case they're no longer in the room
    io.to(targetId).emit('player_kicked', { playerId: targetId });
  });

  socket.on('start_game', ({ code } = {}) => {
    const game = getGame(code);
    if (!game) return socket.emit('error', { message: 'Game not found.' });
    if (socket.id !== game.managerId) return socket.emit('error', { message: 'Only the manager can start.' });
    if (game.phase !== 'lobby') return socket.emit('error', { message: 'Game already started.' });

    const activePlayers = [...game.players.values()].filter(p => !p.disconnected);
    if (activePlayers.length < 3) {
      return socket.emit('error', { message: 'Need at least 3 players.' });
    }

    game.phase = 'role_reveal';
    game.revealedPlayers.clear();
    game.tasks = assignRoles(game);
    game.gameStartTime = Date.now();
    game.imposterKillCooldownUntil = game.gameStartTime + game.settings.startKillCooldown;

    io.to(code).emit('game_started', { players: buildPublicPlayerList(game.players) });

    // Send each player their role and tasks privately
    for (const [id, player] of game.players) {
      io.to(id).emit('role_assigned', {
        role: player.role,
        tasks: buildPlayerTasks(player, game.tasks),
        killCooldownUntil: player.role === 'imposter' ? game.imposterKillCooldownUntil : 0,
      });
    }
  });

  // ─── ROLE REVEAL ──────────────────────────────────────────────────────────

  socket.on('role_reveal_done', ({ code } = {}) => {
    const game = getGame(code);
    if (!game || game.phase !== 'role_reveal') return;

    game.revealedPlayers.add(socket.id);

    const activePlayers = [...game.players.values()].filter(p => !p.disconnected);
    if (game.revealedPlayers.size >= activePlayers.length) {
      game.phase = 'gameplay';
      io.to(code).emit('all_revealed', {
        taskProgressPercent: calculateTaskProgress(game.tasks),
      });
    }
  });

  // ─── GAMEPLAY ─────────────────────────────────────────────────────────────

  socket.on('task_hold_start', ({ code, taskId } = {}) => {
    const game = getGame(code);
    if (!game || game.phase !== 'gameplay') return;

    const player = game.players.get(socket.id);
    if (!player) return;

    // Validate player can do this task
    if (!canDoTask(player, game)) return;

    const task = game.tasks.get(taskId);
    if (!task || task.assignedTo !== socket.id || task.completed) return;

    game.taskHoldStartTimes.set(taskId, Date.now());
  });

  socket.on('task_hold_cancel', ({ code, taskId } = {}) => {
    const game = getGame(code);
    if (!game) return;
    game.taskHoldStartTimes.delete(taskId);
  });

  socket.on('complete_task', ({ code, taskId } = {}) => {
    const game = getGame(code);
    if (!game || game.phase !== 'gameplay') return;

    const player = game.players.get(socket.id);
    if (!player) return;

    if (!canDoTask(player, game)) return;

    const task = game.tasks.get(taskId);
    if (!task || task.assignedTo !== socket.id || task.completed) return;

    // Validate timing: server must have recorded a hold start
    const holdStart = game.taskHoldStartTimes.get(taskId);
    if (!holdStart) return;

    const expected = player.isAlive
      ? game.settings.taskHoldDuration
      : game.settings.deadTaskHoldDuration;
    const elapsed = Date.now() - holdStart;
    if (elapsed < expected - 2000) {
      // More than 2s short → reject (generous tolerance for network lag)
      game.taskHoldStartTimes.delete(taskId);
      return socket.emit('task_rejected', { taskId, reason: 'Too fast.' });
    }

    task.completed = true;
    player.tasksCompleted.add(taskId);
    game.taskHoldStartTimes.delete(taskId);

    const progressPercent = calculateTaskProgress(game.tasks);

    io.to(code).emit('task_completed', { taskId, progressPercent, playerId: socket.id });

    // Check crewmate win by tasks
    const result = checkWinConditions(game);
    if (result) endGame(io, game, result);
  });

  // ─── KILL ─────────────────────────────────────────────────────────────────

  socket.on('kill_player', ({ code, targetId } = {}) => {
    const game = getGame(code);
    if (!game || game.phase !== 'gameplay') return socket.emit('error', { message: 'Cannot kill now.' });

    const imposter = game.players.get(socket.id);
    if (!imposter || imposter.role !== 'imposter' || !imposter.isAlive) {
      return socket.emit('error', { message: 'Not allowed.' });
    }

    const target = game.players.get(targetId);
    if (!target || !target.isAlive) return socket.emit('error', { message: 'Invalid target.' });

    const now = Date.now();
    if (now < game.imposterKillCooldownUntil) {
      return socket.emit('error', { message: 'Kill on cooldown.' });
    }

    // Start cooldown immediately on kill press, before victim confirms
    game.imposterKillCooldownUntil = now + game.settings.killCooldown;
    socket.emit('kill_cooldown_started', { cooldownUntil: game.imposterKillCooldownUntil });

    // Show kill screen to victim only
    io.to(targetId).emit('kill_initiated', { victimId: targetId });
  });

  socket.on('confirm_death', ({ code } = {}) => {
    const game = getGame(code);
    if (!game) return;

    const player = game.players.get(socket.id);
    if (!player || !player.isAlive) return;

    player.isAlive = false;

    io.to(code).emit('kill_confirmed', {
      victimId: socket.id,
      cooldownUntil: game.imposterKillCooldownUntil,
    });

    const result = checkWinConditions(game);
    if (result) endGame(io, game, result);
  });

  // ─── MEETINGS ─────────────────────────────────────────────────────────────

  socket.on('report_body', ({ code, bodyId } = {}) => {
    const game = getGame(code);
    if (!game || game.phase !== 'gameplay') return socket.emit('error', { message: 'Cannot report now.' });

    const reporter = game.players.get(socket.id);
    if (!reporter || !reporter.isAlive) return socket.emit('error', { message: 'Not allowed.' });

    const body = game.players.get(bodyId);
    if (!body || body.isAlive) return socket.emit('error', { message: 'Invalid body.' });

    body.bodyFound = true;
    startMeeting(io, game, { reason: 'body', reporterId: socket.id, bodyId });
  });

  socket.on('call_emergency', ({ code } = {}) => {
    const game = getGame(code);
    if (!game || game.phase !== 'gameplay') return socket.emit('error', { message: 'Cannot call meeting now.' });

    const caller = game.players.get(socket.id);
    if (!caller || !caller.isAlive) return socket.emit('error', { message: 'Not allowed.' });

    game.meetingHasOccurred = true;

    // Unlock all dead players whose bodies haven't been found
    for (const p of game.players.values()) {
      if (!p.isAlive) p.bodyFound = true;
    }

    startMeeting(io, game, { reason: 'emergency', reporterId: socket.id, bodyId: null });
  });

  // ─── VOTING ───────────────────────────────────────────────────────────────

  socket.on('cast_vote', ({ code, targetId } = {}) => {
    const game = getGame(code);
    if (!game || game.phase !== 'voting') return socket.emit('error', { message: 'Not in voting phase.' });

    const voter = game.players.get(socket.id);
    if (!voter || !voter.isAlive) return socket.emit('error', { message: 'Dead players cannot vote.' });
    if (game.votes.has(socket.id)) return socket.emit('error', { message: 'Already voted.' });

    // Validate target: must be a living player or 'skip'
    if (targetId !== 'skip') {
      const target = game.players.get(targetId);
      if (!target || !target.isAlive) return socket.emit('error', { message: 'Invalid vote target.' });
    }

    game.votes.set(socket.id, targetId);

    // Notify all that someone voted (but not who they voted for)
    io.to(code).emit('vote_cast', { voterId: socket.id, totalVotes: game.votes.size });

    // Check if everyone living has voted
    const livingPlayers = [...game.players.values()].filter(p => p.isAlive);
    if (game.votes.size >= livingPlayers.length) {
      resolveVoting(io, game);
    }
  });

  // ─── MANAGER CONTROLS ─────────────────────────────────────────────────────

  socket.on('end_game', ({ code } = {}) => {
    const game = getGame(code);
    if (!game) return;
    if (socket.id !== game.managerId) return socket.emit('error', { message: 'Only manager can end.' });
    endGame(io, game, { winner: 'none', reason: 'manager_ended' });
  });

  socket.on('play_again', ({ code } = {}) => {
    const game = getGame(code);
    if (!game) return;
    if (socket.id !== game.managerId) return socket.emit('error', { message: 'Only manager can reset.' });

    // Reset game back to lobby, keeping same players and rooms
    if (game.votingTimeout) clearTimeout(game.votingTimeout);

    game.phase = 'lobby';
    game.tasks = new Map();
    game.taskHoldStartTimes = new Map();
    game.votes = new Map();
    game.votingTimeout = null;
    game.reportedBodyId = null;
    game.revealedPlayers = new Set();
    game.imposterKillCooldownUntil = 0;
    game.gameStartTime = 0;
    game.meetingHasOccurred = false;

    for (const player of game.players.values()) {
      player.role = null;
      player.isAlive = true;
      player.bodyFound = false;
      player.votedOut = false;
      player.tasksAssigned = [];
      player.tasksCompleted = new Set();
      player.hasCalledEmergency = false;
    }

    io.to(code).emit('game_reset', {
      players: buildPublicPlayerList(game.players),
      rooms: game.rooms,
    });
  });

  // ─── DISCONNECT ───────────────────────────────────────────────────────────

  socket.on('disconnect', () => {
    const meta = socketMeta.get(socket.id);
    if (!meta) return;

    socketMeta.delete(socket.id);
    const game = getGame(meta.gameCode);
    if (!game) return;

    const player = game.players.get(socket.id);

    if (game.phase === 'lobby') {
      if (player) {
        game.players.delete(socket.id);
        io.to(game.code).emit('player_left', { playerId: socket.id });
      }
      // If manager left lobby with no players, clean up
      if (game.players.size === 0) deleteGame(game.code);
      return;
    }

    if (player) {
      player.disconnected = true;
      io.to(game.code).emit('player_disconnected', { playerId: socket.id });
    }

    // Give 60s for reconnect; if not, treat as dead
    setTimeout(() => {
      const g = getGame(meta.gameCode);
      if (!g) return;
      const p = g.players.get(socket.id);
      if (p && p.disconnected) {
        // If still disconnected after 60s, mark them as dead/removed in active games
        if (g.phase === 'gameplay') {
          p.isAlive = false;
          io.to(g.code).emit('player_removed', { playerId: socket.id });
          const result = checkWinConditions(g);
          if (result) endGame(io, g, result);
        }
      }
    }, 60000);
  });
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

function canDoTask(player, game) {
  if (player.isAlive) return true;
  // Dead crewmate can do tasks only if body found or meeting has occurred
  return player.bodyFound || game.meetingHasOccurred;
}

function startMeeting(io, game, { reason, reporterId, bodyId }) {
  game.phase = 'voting';
  game.votes = new Map();
  game.meetingHasOccurred = true;

  // Mark all dead players' bodies as found (they can now do tasks after meeting)
  for (const p of game.players.values()) {
    if (!p.isAlive) p.bodyFound = true;
  }

  const reporterName = game.players.get(reporterId)?.name || 'Unknown';
  const bodyName = bodyId ? game.players.get(bodyId)?.name : null;

  io.to(game.code).emit('meeting_called', {
    reason,
    reporterId,
    reporterName,
    bodyId,
    bodyName,
    players: buildPublicPlayerList(game.players),
  });

  // 2-minute voting timeout
  game.votingTimeout = setTimeout(() => {
    const g = game;
    if (g.phase === 'voting') resolveVoting(io, g);
  }, 120000);
}

function resolveVoting(io, game) {
  if (game.votingTimeout) {
    clearTimeout(game.votingTimeout);
    game.votingTimeout = null;
  }

  const { ejected, counts } = tallyVotes(game.votes, game.players);

  // Build vote counts map using names for display
  const voteCounts = {};
  for (const [targetId, count] of counts) {
    voteCounts[targetId] = count;
  }

  let ejectedInfo = null;
  if (ejected) {
    ejected.isAlive = false;
    ejected.votedOut = true;
    ejectedInfo = { id: ejected.id, name: ejected.name, wasImposter: ejected.role === 'imposter' };
  }

  io.to(game.code).emit('vote_results', {
    votes: Object.fromEntries(game.votes),
    voteCounts,
    ejected: ejectedInfo,
    players: buildPublicPlayerList(game.players),
  });

  // Check win conditions after ejection
  const result = checkWinConditions(game);
  if (result) {
    setTimeout(() => endGame(io, game, result), 4000);
    return;
  }

  // Resume gameplay after a delay
  setTimeout(() => {
    game.phase = 'gameplay';
    game.votes = new Map();
    io.to(game.code).emit('voting_ended', {
      taskProgressPercent: calculateTaskProgress(game.tasks),
      players: buildPublicPlayerList(game.players),
    });
  }, 4000);
}

function endGame(io, game, { winner, reason }) {
  game.phase = 'game_end';

  const imposter = [...game.players.values()].find(p => p.role === 'imposter');

  io.to(game.code).emit('game_over', {
    winner,
    reason,
    imposterName: imposter?.name || 'Unknown',
    imposterId: imposter?.id || null,
    players: buildRevealPlayerList(game.players), // roles exposed at game end
  });
}

module.exports = { registerHandlers };
