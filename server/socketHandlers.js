const { createGame, getGame, deleteGame } = require('./gameManager');
const { generatePlayerCode, getTaskDescription } = require('./utils');
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
      managerId: game.managerId,
      stationAssignments: buildStationList(game),
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
      managerId: game.managerId,
      taskProgressPercent: calculateTaskProgress(game.tasks),
    };

    if (game.phase === 'lobby') {
      socket.emit('game_joined', base);
    } else if (player.role === 'station') {
      socket.emit('station_device_ready', { roomName: game.stationRooms.get(socket.id) });
    } else {
      const sabotageForPlayer = player.role === 'imposter'
        ? buildSabotageStatus(game)
        : {
            lockedRooms: buildLockedRoomsList(game),
            globalLockdown: {
              active: game.sabotage.globalLockdownActive,
              expiresAt: game.sabotage.globalLockdownExpiresAt,
            },
          };

      socket.emit('game_state_restored', {
        ...base,
        role: player.role,
        myTasks: buildPlayerTasks(player, game.tasks),
        isAlive: player.isAlive,
        killCooldownUntil: player.role === 'imposter' ? game.imposterKillCooldownUntil : 0,
        hasCalledEmergency: player.hasCalledEmergency,
        myCode: game.playerCodes.get(socket.id),
        sabotage: sabotageForPlayer,
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

  socket.on('update_settings', ({ code, settings } = {}) => {
    const game = getGame(code);
    if (!game) return socket.emit('error', { message: 'Game not found.' });
    if (game.phase !== 'lobby') return socket.emit('error', { message: 'Settings can only be changed in the lobby.' });
    if (socket.id !== game.managerId) return socket.emit('error', { message: 'Only the manager can change settings.' });
    if (!settings || typeof settings !== 'object') return socket.emit('error', { message: 'Invalid settings.' });

    const validated = {};

    const clampInt = (val, min, max) => {
      const n = parseInt(val, 10);
      return !isNaN(n) ? Math.min(max, Math.max(min, n)) : null;
    };

    // Timing (stored in ms; client sends seconds * 1000)
    const kc = clampInt(settings.killCooldown, 5000, 120000);
    if (kc !== null) validated.killCooldown = kc;

    const thd = clampInt(settings.taskHoldDuration, 5000, 60000);
    if (thd !== null) validated.taskHoldDuration = thd;

    const dthd = clampInt(settings.deadTaskHoldDuration, 5000, 60000);
    if (dthd !== null) validated.deadTaskHoldDuration = dthd;

    // Stations
    if (typeof settings.stationsEnabled === 'boolean') validated.stationsEnabled = settings.stationsEnabled;

    // Doctor
    if (typeof settings.doctorEnabled === 'boolean') validated.doctorEnabled = settings.doctorEnabled;

    // Sabotage booleans
    if (typeof settings.sabotageEnabled === 'boolean') validated.sabotageEnabled = settings.sabotageEnabled;
    if (typeof settings.roomLockingEnabled === 'boolean') validated.roomLockingEnabled = settings.roomLockingEnabled;
    if (typeof settings.globalLockdownEnabled === 'boolean') validated.globalLockdownEnabled = settings.globalLockdownEnabled;

    // Sabotage numerics
    const mlr = clampInt(settings.maxLockedRooms, 1, 5);
    if (mlr !== null) validated.maxLockedRooms = mlr;

    const rld = clampInt(settings.roomLockDuration, 5000, 120000);
    if (rld !== null) validated.roomLockDuration = rld;

    const rlc = clampInt(settings.roomLockCooldown, 10000, 300000);
    if (rlc !== null) validated.roomLockCooldown = rlc;

    const gld = clampInt(settings.globalLockdownDuration, 10000, 120000);
    if (gld !== null) validated.globalLockdownDuration = gld;

    const glc = clampInt(settings.globalLockdownCooldown, 30000, 600000);
    if (glc !== null) validated.globalLockdownCooldown = glc;

    const mgl = clampInt(settings.maxGlobalLockdowns, 1, 5);
    if (mgl !== null) validated.maxGlobalLockdowns = mgl;

    Object.assign(game.settings, validated);

    // Keep globalLockdownUsesLeft in sync with maxGlobalLockdowns
    if (validated.maxGlobalLockdowns !== undefined) {
      game.sabotage.globalLockdownUsesLeft = validated.maxGlobalLockdowns;
    }

    io.to(code).emit('settings_updated', { settings: game.settings });
  });

  socket.on('update_rooms', ({ code, rooms } = {}) => {
    const game = getGame(code);
    if (!game) return socket.emit('error', { message: 'Game not found.' });
    if (game.phase !== 'lobby') return socket.emit('error', { message: 'Rooms can only be changed in the lobby.' });
    if (socket.id !== game.managerId) return socket.emit('error', { message: 'Only the manager can change rooms.' });
    if (!Array.isArray(rooms)) return socket.emit('error', { message: 'Invalid rooms.' });

    const trimmed = rooms.map(r => (typeof r === 'string' ? r.trim() : '')).filter(r => r.length > 0 && r.length <= 30);
    if (trimmed.length < 2 || trimmed.length > 10) {
      return socket.emit('error', { message: 'Need between 2 and 10 rooms.' });
    }

    // Check for duplicates (case-insensitive)
    const lower = trimmed.map(r => r.toLowerCase());
    if (new Set(lower).size !== lower.length) {
      return socket.emit('error', { message: 'Room names must be unique.' });
    }

    game.rooms = trimmed;
    io.to(code).emit('rooms_updated', { rooms: game.rooms });
  });

  socket.on('assign_station', ({ code, playerId, roomName } = {}) => {
    const game = getGame(code);
    if (!game || game.phase !== 'lobby') return socket.emit('error', { message: 'Can only assign stations in lobby.' });
    if (socket.id !== game.managerId) return socket.emit('error', { message: 'Only the manager can assign stations.' });
    if (!game.settings.stationsEnabled) return socket.emit('error', { message: 'Stations not enabled.' });
    if (!game.players.has(playerId)) return socket.emit('error', { message: 'Player not found.' });
    if (game.stations.has(playerId)) return socket.emit('error', { message: 'Player already a station.' });
    if (!game.rooms.includes(roomName)) return socket.emit('error', { message: 'Invalid room.' });

    // Check room not already taken
    for (const [, r] of game.stationRooms) {
      if (r === roomName) return socket.emit('error', { message: 'Room already has a station.' });
    }

    const activePlayers = [...game.players.values()].filter(p => !p.disconnected);
    const maxStations = activePlayers.length - 3;
    if (game.stations.size >= maxStations) {
      return socket.emit('error', { message: 'Maximum stations reached.' });
    }

    game.stations.add(playerId);
    game.stationRooms.set(playerId, roomName);
    io.to(code).emit('stations_updated', { stations: buildStationList(game) });
  });

  socket.on('unassign_station', ({ code, playerId } = {}) => {
    const game = getGame(code);
    if (!game || game.phase !== 'lobby') return socket.emit('error', { message: 'Can only unassign stations in lobby.' });
    if (socket.id !== game.managerId) return socket.emit('error', { message: 'Only the manager can unassign stations.' });

    game.stations.delete(playerId);
    game.stationRooms.delete(playerId);
    game.stationMeetingEnabled.delete(playerId);
    io.to(code).emit('stations_updated', { stations: buildStationList(game) });
  });

  socket.on('set_station_meeting', ({ code, playerId, hasMeeting } = {}) => {
    const game = getGame(code);
    if (!game || game.phase !== 'lobby') return socket.emit('error', { message: 'Can only change station settings in lobby.' });
    if (socket.id !== game.managerId) return socket.emit('error', { message: 'Only the manager can change station settings.' });
    if (!game.stations.has(playerId)) return socket.emit('error', { message: 'Player is not a station.' });
    if (typeof hasMeeting !== 'boolean') return;
    game.stationMeetingEnabled.set(playerId, hasMeeting);
    io.to(code).emit('stations_updated', { stations: buildStationList(game) });
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
    game.imposterKillCooldownUntil = game.gameStartTime + game.settings.killCooldown;

    // Pre-add station players to revealedPlayers so they don't block the transition
    for (const stationId of game.stations) {
      game.revealedPlayers.add(stationId);
    }

    // Generate private 3-digit codes for non-station players
    game.playerCodes = new Map();
    const usedCodes = new Set();
    for (const [id, player] of game.players) {
      if (!game.stations.has(id)) {
        const playerCode = generatePlayerCode(usedCodes);
        usedCodes.add(playerCode);
        game.playerCodes.set(id, playerCode);
      }
    }

    // Assign doctor sub-role
    game.doctorId = null;
    if (game.settings.doctorEnabled) {
      const eligible = [...game.players.values()].filter(p => p.role !== 'station');
      if (eligible.length > 0) {
        game.doctorId = eligible[Math.floor(Math.random() * eligible.length)].id;
      }
    }

    io.to(code).emit('game_started', { players: buildPublicPlayerList(game.players) });

    // Send each player their role and tasks privately
    for (const [id, player] of game.players) {
      if (player.role === 'station') {
        io.to(id).emit('station_device_ready', {
          roomName: game.stationRooms.get(id),
          hasMeeting: game.stationMeetingEnabled.get(id) ?? false,
        });
      } else {
        io.to(id).emit('role_assigned', {
          role: player.role,
          tasks: buildPlayerTasks(player, game.tasks),
          killCooldownUntil: player.role === 'imposter' ? game.imposterKillCooldownUntil : 0,
          myCode: game.playerCodes.get(id),
        });
      }
    }

    // Notify doctor privately
    if (game.doctorId) {
      io.to(game.doctorId).emit('doctor_assigned');
    }

    // Give the imposter their initial sabotage state so globalLockdownUsesLeft
    // reflects the actual setting (not the client's hardcoded default of 2)
    const imposterPlayer = [...game.players.values()].find(p => p.role === 'imposter');
    if (imposterPlayer) {
      io.to(imposterPlayer.id).emit('sabotage_status', buildSabotageStatus(game));
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
    if (task.type === 'station') return; // station tasks completed at the station device

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
    if (task.type === 'station') return; // station tasks completed at the station device

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

  // ─── STATIONS ─────────────────────────────────────────────────────────────

  socket.on('station_validate_code', ({ code, enteredCode } = {}) => {
    const game = getGame(code);
    if (!game || game.phase !== 'gameplay') return;
    if (!game.stations.has(socket.id)) return;

    const stationRoom = game.stationRooms.get(socket.id);

    // Find which player owns this code
    let foundPlayerId = null;
    for (const [playerId, pCode] of game.playerCodes) {
      if (pCode === enteredCode) { foundPlayerId = playerId; break; }
    }

    if (!foundPlayerId) {
      return socket.emit('station_code_result', { valid: false, reason: 'invalid' });
    }

    const player = game.players.get(foundPlayerId);
    if (!player) {
      return socket.emit('station_code_result', { valid: false, reason: 'invalid' });
    }

    // Find the station task for this player in this station's room
    const stationTask = [...game.tasks.values()].find(
      t => t.assignedTo === foundPlayerId && t.room === stationRoom && t.type === 'station'
    );

    if (!stationTask) {
      return socket.emit('station_code_result', { valid: false, reason: 'no_task' });
    }

    if (stationTask.completed) {
      return socket.emit('station_code_result', { valid: false, reason: 'already_completed', playerName: player.name });
    }

    socket.emit('station_code_result', {
      valid: true,
      playerName: player.name,
      playerId: foundPlayerId,
      taskId: stationTask.id,
    });
  });

  socket.on('station_task_complete', ({ code, playerId } = {}) => {
    const game = getGame(code);
    if (!game || game.phase !== 'gameplay') return;
    if (!game.stations.has(socket.id)) return;

    const stationRoom = game.stationRooms.get(socket.id);
    const player = game.players.get(playerId);
    if (!player) return;

    // Apply the same dead-task rules as regular tasks
    if (!canDoTask(player, game)) return;

    const stationTask = [...game.tasks.values()].find(
      t => t.assignedTo === playerId && t.room === stationRoom && t.type === 'station'
    );

    if (!stationTask || stationTask.completed) return;

    stationTask.completed = true;
    player.tasksCompleted.add(stationTask.id);

    const progressPercent = calculateTaskProgress(game.tasks);
    io.to(code).emit('task_completed', { taskId: stationTask.id, progressPercent, playerId });
    socket.emit('station_success', { playerName: player.name });

    const result = checkWinConditions(game);
    if (result) endGame(io, game, result);
  });

  // ─── MOTION ───────────────────────────────────────────────────────────────

  socket.on('motion_update', ({ code, magnitude } = {}) => {
    const game = getGame(code);
    if (!game || game.phase !== 'gameplay' || !game.doctorId) return;
    io.to(game.doctorId).emit('player_motion', { playerId: socket.id, magnitude });
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
    if (game.stations.has(targetId)) return socket.emit('error', { message: 'Cannot kill a station device.' });

    const now = Date.now();
    if (now < game.imposterKillCooldownUntil) {
      return socket.emit('error', { message: 'Kill on cooldown.' });
    }

    game.imposterKillCooldownUntil = now + game.settings.killCooldown;
    socket.emit('kill_cooldown_started', { cooldownUntil: game.imposterKillCooldownUntil });

    // Kill is immediate — mark target dead right away
    target.isAlive = false;

    // Show kill screen to victim first, then broadcast death to everyone
    io.to(targetId).emit('kill_initiated', { victimId: targetId });
    io.to(code).emit('kill_confirmed', {
      victimId: targetId,
      cooldownUntil: game.imposterKillCooldownUntil,
    });

    // Open 10-second report window for impostor only (stations mode)
    if (game.settings.stationsEnabled) {
      if (game.bodyReportWindow?.timeoutId) clearTimeout(game.bodyReportWindow.timeoutId);
      const windowExpiry = Date.now() + 10000;
      const windowTimeout = setTimeout(() => {
        const g = getGame(code);
        if (g && g.bodyReportWindow?.imposterOnly) {
          g.bodyReportWindow = null;
          io.to(socket.id).emit('body_report_window_closed');
        }
      }, 10000);
      game.bodyReportWindow = { bodyId: targetId, expiresAt: windowExpiry, imposterOnly: true, timeoutId: windowTimeout };
      io.to(socket.id).emit('body_report_window_opened', { bodyId: targetId, expiresAt: windowExpiry });
    }

    const result = checkWinConditions(game);
    if (result) endGame(io, game, result);
  });

  socket.on('confirm_death', () => {
    // Death is now immediate on kill — this event is no longer used server-side
  });

  // ─── SABOTAGE ─────────────────────────────────────────────────────────────

  socket.on('lock_room', ({ code, roomName } = {}) => {
    const game = getGame(code);
    if (!game || game.phase !== 'gameplay') return socket.emit('error', { message: 'Cannot sabotage now.' });

    const imposter = game.players.get(socket.id);
    if (!imposter || imposter.role !== 'imposter' || !imposter.isAlive) {
      return socket.emit('error', { message: 'Not allowed.' });
    }
    if (!game.settings.sabotageEnabled) return socket.emit('error', { message: 'Sabotage is disabled.' });
    if (!game.settings.roomLockingEnabled) return socket.emit('error', { message: 'Room locking is disabled.' });
    if (!game.rooms.includes(roomName)) return socket.emit('error', { message: 'Invalid room.' });
    if (game.sabotage.lockedRooms.has(roomName)) return socket.emit('error', { message: 'Room already locked.' });
    if (game.sabotage.lockedRooms.size >= game.settings.maxLockedRooms) {
      return socket.emit('error', { message: 'Maximum rooms locked.' });
    }
    const cooldownUntil = game.sabotage.roomLockCooldowns.get(roomName) ?? 0;
    if (Date.now() < cooldownUntil) return socket.emit('error', { message: 'Room on cooldown.' });

    const now = Date.now();
    const expiresAt = now + game.settings.roomLockDuration;
    const timeoutId = setTimeout(() => {
      const g = getGame(code);
      if (g) unlockRoom(io, g, roomName);
    }, game.settings.roomLockDuration);

    game.sabotage.lockedRooms.set(roomName, { expiresAt, timeoutId });

    io.to(code).emit('room_locked', {
      roomName,
      expiresAt,
      lockedRooms: buildLockedRoomsList(game),
    });

    // Send full sabotage status back to imposter
    socket.emit('sabotage_status', buildSabotageStatus(game));
  });

  socket.on('trigger_global_lockdown', ({ code } = {}) => {
    const game = getGame(code);
    if (!game || game.phase !== 'gameplay') return socket.emit('error', { message: 'Cannot sabotage now.' });

    const imposter = game.players.get(socket.id);
    if (!imposter || imposter.role !== 'imposter' || !imposter.isAlive) {
      return socket.emit('error', { message: 'Not allowed.' });
    }
    if (!game.settings.sabotageEnabled) return socket.emit('error', { message: 'Sabotage is disabled.' });
    if (!game.settings.globalLockdownEnabled) return socket.emit('error', { message: 'Global lockdown is disabled.' });
    if (game.sabotage.globalLockdownActive) return socket.emit('error', { message: 'Lockdown already active.' });
    if (Date.now() < game.sabotage.globalLockdownCooldownUntil) {
      return socket.emit('error', { message: 'Global lockdown on cooldown.' });
    }
    if (game.sabotage.globalLockdownUsesLeft <= 0) {
      return socket.emit('error', { message: 'No global lockdown uses remaining.' });
    }

    const now = Date.now();
    const expiresAt = now + game.settings.globalLockdownDuration;

    game.sabotage.globalLockdownActive = true;
    game.sabotage.globalLockdownExpiresAt = expiresAt;
    game.sabotage.globalLockdownUsesLeft -= 1;
    game.sabotage.globalLockdownTimeoutId = setTimeout(() => {
      const g = getGame(code);
      if (g) endGlobalLockdown(io, g);
    }, game.settings.globalLockdownDuration);

    // Notify all non-imposter players
    for (const [id, p] of game.players) {
      if (p.role !== 'imposter') {
        io.to(id).emit('global_lockdown_started', { expiresAt });
      }
    }

    // Send full sabotage status back to imposter
    socket.emit('sabotage_status', buildSabotageStatus(game));
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

    // When stations are enabled, emergency meetings must be called from a station
    if (game.settings.stationsEnabled) {
      return socket.emit('error', { message: 'Meetings must be called from a station.' });
    }

    // Block emergency meetings during a global lockdown
    if (game.sabotage.globalLockdownActive) {
      return socket.emit('error', { message: 'Cannot call a meeting during a lockdown.' });
    }

    game.meetingHasOccurred = true;

    // Unlock all dead players whose bodies haven't been found
    for (const p of game.players.values()) {
      if (!p.isAlive) p.bodyFound = true;
    }

    startMeeting(io, game, { reason: 'emergency', reporterId: socket.id, bodyId: null });
  });

  socket.on('i_was_found', ({ code } = {}) => {
    const game = getGame(code);
    if (!game || game.phase !== 'gameplay') return;

    const player = game.players.get(socket.id);
    if (!player || player.isAlive) return;
    if (game.stations.has(socket.id)) return;

    // Block if any window is already active
    if (game.bodyReportWindow && Date.now() < game.bodyReportWindow.expiresAt) return;

    if (game.bodyReportWindow?.timeoutId) clearTimeout(game.bodyReportWindow.timeoutId);
    const expiresAt = Date.now() + 5000;
    const timeoutId = setTimeout(() => {
      const g = getGame(code);
      if (g) {
        g.bodyReportWindow = null;
        io.to(g.code).emit('body_report_window_closed');
      }
    }, 5000);
    game.bodyReportWindow = { bodyId: socket.id, expiresAt, imposterOnly: false, timeoutId };

    for (const [id, p] of game.players) {
      if (p.isAlive && !game.stations.has(id)) {
        io.to(id).emit('body_report_window_opened', { bodyId: socket.id, expiresAt });
      }
    }
  });

  socket.on('report_body_in_window', ({ code } = {}) => {
    const game = getGame(code);
    if (!game || game.phase !== 'gameplay') return socket.emit('error', { message: 'Cannot report now.' });

    const reporter = game.players.get(socket.id);
    if (!reporter || !reporter.isAlive) return socket.emit('error', { message: 'Not allowed.' });
    if (game.stations.has(socket.id)) return socket.emit('error', { message: 'Not allowed.' });

    const win = game.bodyReportWindow;
    if (!win || Date.now() > win.expiresAt) {
      return socket.emit('error', { message: 'No active report window.' });
    }
    if (win.imposterOnly && reporter.role !== 'imposter') {
      return socket.emit('error', { message: 'No active report window.' });
    }

    clearTimeout(win.timeoutId);
    game.bodyReportWindow = null;
    io.to(code).emit('body_report_window_closed');

    const body = game.players.get(win.bodyId);
    if (body) body.bodyFound = true;

    startMeeting(io, game, { reason: 'body', reporterId: socket.id, bodyId: win.bodyId });
  });

  socket.on('station_call_meeting', ({ code } = {}) => {
    const game = getGame(code);
    if (!game || game.phase !== 'gameplay') return socket.emit('error', { message: 'Cannot call meeting now.' });

    if (!game.stations.has(socket.id)) return socket.emit('error', { message: 'Not allowed.' });
    if (!(game.stationMeetingEnabled.get(socket.id) ?? false)) return socket.emit('error', { message: 'This station does not have meeting privileges.' });
    if (game.sabotage.globalLockdownActive) return socket.emit('error', { message: 'Cannot call a meeting during a lockdown.' });

    game.meetingHasOccurred = true;
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
    if (game.stations.has(socket.id)) return socket.emit('error', { message: 'Station devices cannot vote.' });
    if (game.votes.has(socket.id)) return socket.emit('error', { message: 'Already voted.' });

    // Validate target: must be a living player or 'skip'
    if (targetId !== 'skip') {
      const target = game.players.get(targetId);
      if (!target || !target.isAlive) return socket.emit('error', { message: 'Invalid vote target.' });
    }

    game.votes.set(socket.id, targetId);

    // Notify all that someone voted (but not who they voted for)
    io.to(code).emit('vote_cast', { voterId: socket.id, totalVotes: game.votes.size });

    // Check if everyone living (non-station) has voted
    const livingPlayers = [...game.players.values()].filter(p => p.isAlive && !game.stations.has(p.id));
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

    // Clear any active sabotage timeouts
    for (const { timeoutId } of game.sabotage.lockedRooms.values()) {
      if (timeoutId) clearTimeout(timeoutId);
    }
    if (game.sabotage.globalLockdownTimeoutId) {
      clearTimeout(game.sabotage.globalLockdownTimeoutId);
    }

    if (game.bodyReportWindow?.timeoutId) clearTimeout(game.bodyReportWindow.timeoutId);

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
    game.stations = new Set();
    game.stationRooms = new Map();
    game.stationMeetingEnabled = new Map();
    game.playerCodes = new Map();
    game.doctorId = null;
    game.bodyReportWindow = null;
    game.sabotage = {
      lockedRooms: new Map(),
      roomLockCooldowns: new Map(),
      globalLockdownActive: false,
      globalLockdownExpiresAt: null,
      globalLockdownCooldownUntil: 0,
      globalLockdownUsesLeft: game.settings.maxGlobalLockdowns,
      globalLockdownTimeoutId: null,
    };

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
      settings: game.settings,
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
      // If a station device disconnected, revert its room's tasks to regular
      if (game.stations.has(socket.id)) {
        const stationRoom = game.stationRooms.get(socket.id);
        if (stationRoom) revertStationTasks(io, game, stationRoom, getTaskDescription);
        game.stations.delete(socket.id);
        game.stationRooms.delete(socket.id);
        game.stationMeetingEnabled.delete(socket.id);
        // Remove station player from players entirely — they don't reconnect as station
        game.players.delete(socket.id);
        return;
      }
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

// ─── STATION HELPERS ────────────────────────────────────────────────────────

function buildStationList(game) {
  const list = [];
  for (const [playerId, roomName] of game.stationRooms) {
    const player = game.players.get(playerId);
    list.push({
      playerId,
      roomName,
      playerName: player?.name ?? '?',
      hasMeeting: game.stationMeetingEnabled.get(playerId) ?? false,
    });
  }
  return list;
}

function revertStationTasks(io, game, roomName) {
  const revertedTasks = [];
  for (const task of game.tasks.values()) {
    if (task.room === roomName && task.type === 'station' && !task.completed) {
      task.type = 'regular';
      task.description = getTaskDescription(roomName, 0);
      revertedTasks.push({ taskId: task.id, assignedTo: task.assignedTo });
    }
  }
  if (revertedTasks.length > 0) {
    io.to(game.code).emit('station_disconnected', { roomName, revertedTasks });
  }
}

// ─── SABOTAGE HELPERS ───────────────────────────────────────────────────────

function buildLockedRoomsList(game) {
  return [...game.sabotage.lockedRooms.entries()].map(([roomName, { expiresAt }]) => ({
    roomName,
    expiresAt,
  }));
}

function buildSabotageStatus(game) {
  const roomLockCooldowns = Object.fromEntries(game.sabotage.roomLockCooldowns);
  return {
    lockedRooms: buildLockedRoomsList(game),
    roomLockCooldowns,
    globalLockdown: {
      active: game.sabotage.globalLockdownActive,
      expiresAt: game.sabotage.globalLockdownExpiresAt,
      cooldownUntil: game.sabotage.globalLockdownCooldownUntil,
      usesLeft: game.sabotage.globalLockdownUsesLeft,
    },
  };
}

function unlockRoom(io, game, roomName) {
  const entry = game.sabotage.lockedRooms.get(roomName);
  if (!entry) return;
  clearTimeout(entry.timeoutId);
  game.sabotage.lockedRooms.delete(roomName);

  // Cooldown starts from when the room unlocks (not when it was locked)
  game.sabotage.roomLockCooldowns.set(roomName, Date.now() + game.settings.roomLockCooldown);

  io.to(game.code).emit('room_unlocked', {
    roomName,
    lockedRooms: buildLockedRoomsList(game),
  });

  // Tell the imposter the cooldown has started
  const imposter = [...game.players.values()].find(p => p.role === 'imposter');
  if (imposter) io.to(imposter.id).emit('sabotage_status', buildSabotageStatus(game));
}

function endGlobalLockdown(io, game) {
  if (!game.sabotage.globalLockdownActive) return;
  if (game.sabotage.globalLockdownTimeoutId) {
    clearTimeout(game.sabotage.globalLockdownTimeoutId);
    game.sabotage.globalLockdownTimeoutId = null;
  }
  game.sabotage.globalLockdownActive = false;
  game.sabotage.globalLockdownExpiresAt = null;

  // Cooldown starts from when the lockdown ends (not when it was triggered)
  game.sabotage.globalLockdownCooldownUntil = Date.now() + game.settings.globalLockdownCooldown;

  // Tell the imposter the cooldown has started BEFORE broadcasting lockdown_ended
  // so their state is correct as soon as the overlay clears
  const imposter = [...game.players.values()].find(p => p.role === 'imposter');
  if (imposter) io.to(imposter.id).emit('sabotage_status', buildSabotageStatus(game));

  io.to(game.code).emit('global_lockdown_ended', {});
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

function canDoTask(player, game) {
  if (player.isAlive) return true;
  // Dead crewmate can do tasks only if body found or meeting has occurred
  return player.bodyFound || game.meetingHasOccurred;
}

function startMeeting(io, game, { reason, reporterId, bodyId }) {
  if (game.bodyReportWindow?.timeoutId) clearTimeout(game.bodyReportWindow.timeoutId);
  game.bodyReportWindow = null;

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
    ejected.bodyFound = true; // Voted-out players can do tasks immediately after the meeting
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
