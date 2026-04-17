const { generateCode } = require('./utils');

// In-memory store: Map<gameCode, GameState>
const games = new Map();

function createGame({ managerId, rooms, settings }) {
  const code = generateCode(games);

  const game = {
    code,
    phase: 'lobby',
    managerId,
    players: new Map(),
    rooms,
    tasks: new Map(),
    taskHoldStartTimes: new Map(),
    votes: new Map(),
    votingTimeout: null,
    reportedBodyId: null,
    revealedPlayers: new Set(),
    imposterKillCooldownUntil: 0,
    gameStartTime: 0,
    meetingHasOccurred: false,
    stations: new Set(),        // Set<playerId> — station devices
    stationRooms: new Map(),    // Map<playerId, roomName>
    playerCodes: new Map(),     // Map<playerId, '3-digit string'>
    doctorId: null,             // playerId of the doctor (sub-role)
    settings: {
      killCooldown:           settings?.killCooldown           ?? 20000,
      taskHoldDuration:       settings?.taskHoldDuration       ?? 20000,
      deadTaskHoldDuration:   settings?.deadTaskHoldDuration   ?? 10000,
      sabotageEnabled:        settings?.sabotageEnabled        ?? false,
      roomLockingEnabled:     settings?.roomLockingEnabled     ?? true,
      maxLockedRooms:         settings?.maxLockedRooms         ?? 2,
      roomLockDuration:       settings?.roomLockDuration       ?? 20000,
      roomLockCooldown:       settings?.roomLockCooldown       ?? 60000,
      globalLockdownEnabled:  settings?.globalLockdownEnabled  ?? true,
      globalLockdownDuration: settings?.globalLockdownDuration ?? 30000,
      globalLockdownCooldown: settings?.globalLockdownCooldown ?? 120000,
      maxGlobalLockdowns:     settings?.maxGlobalLockdowns     ?? 2,
      stationsEnabled:        settings?.stationsEnabled        ?? false,
      doctorEnabled:          settings?.doctorEnabled          ?? false,
    },
    sabotage: {
      lockedRooms: new Map(),         // roomName → { expiresAt, timeoutId }
      roomLockCooldowns: new Map(),   // roomName → cooldownUntil (ms timestamp)
      globalLockdownActive: false,
      globalLockdownExpiresAt: null,
      globalLockdownCooldownUntil: 0,
      globalLockdownUsesLeft: settings?.maxGlobalLockdowns ?? 2,
      globalLockdownTimeoutId: null,
    },
  };

  games.set(code, game);
  return game;
}

function getGame(code) {
  return games.get(code) || null;
}

function deleteGame(code) {
  const game = games.get(code);
  if (game) {
    if (game.votingTimeout) clearTimeout(game.votingTimeout);
    for (const { timeoutId } of game.sabotage.lockedRooms.values()) {
      if (timeoutId) clearTimeout(timeoutId);
    }
    if (game.sabotage.globalLockdownTimeoutId) {
      clearTimeout(game.sabotage.globalLockdownTimeoutId);
    }
  }
  games.delete(code);
}

module.exports = { games, createGame, getGame, deleteGame };
