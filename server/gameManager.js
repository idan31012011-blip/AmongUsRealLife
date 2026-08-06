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
    stations: new Set(),              // Set<playerId> — station devices
    stationRooms: new Map(),          // Map<playerId, roomName>
    stationMeetingEnabled: new Map(), // Map<playerId, boolean>
    playerCodes: new Map(),           // Map<playerId, '3-digit string'>
    playerMiniGameHistory: new Map(), // Map<playerId, Set<miniGame>> — completed mini-games per player
    easyModePlayers: new Set(),        // Set<playerId> — players assigned easy mode
    pendingMiniGames: new Map(),      // Map<playerId, miniGame> — assigned but not yet completed
    doctorId: null,                   // playerId of the doctor (sub-role)
    engineerId: null,                 // playerId of the engineer (sub-role)
    analystId: null,                  // playerId of the analyst (sub-role)
    progressSyncTimeouts: [],         // pending setTimeout handles for delayed task-bar reveals
    activeCameraView: null,           // { targetStationId, expiresAt, timeoutId } | null
    cameraViewCooldowns: new Map(),   // Map<stationPlayerId, cooldownUntil (ms timestamp)>
    bodyReportWindow: null,           // { bodyId, expiresAt, imposterOnly, timeoutId } | null
    lobbyCleanupTimeout: null,        // setTimeout handle — deferred cleanup when lobby empties
    settings: {
      killCooldown:           settings?.killCooldown           ?? 20000,
      taskHoldDuration:       settings?.taskHoldDuration       ?? 20000,
      deadTaskHoldDuration:   settings?.deadTaskHoldDuration   ?? 10000,
      sabotageEnabled:        settings?.sabotageEnabled        ?? false,
      roomLockingEnabled:     settings?.roomLockingEnabled     ?? true,
      maxLockedRooms:         settings?.maxLockedRooms         ?? 2,
      roomLockDuration:       settings?.roomLockDuration       ?? 20000,
      roomLockCooldown:       settings?.roomLockCooldown       ?? 60000,
      globalLockdownEnabled:        settings?.globalLockdownEnabled        ?? true,
      globalLockdownDuration:       settings?.globalLockdownDuration       ?? 30000,
      globalLockdownCooldown:       settings?.globalLockdownCooldown       ?? 120000,
      maxGlobalLockdowns:           settings?.maxGlobalLockdowns           ?? 2,
      stationsEnabled:              settings?.stationsEnabled              ?? false,
      stationMiniGames:             settings?.stationMiniGames             ?? ['simon', 'stopbar', 'wireconnect'],
      doctorEnabled:                settings?.doctorEnabled                ?? false,
      engineerEnabled:              settings?.engineerEnabled              ?? false,
      analystEnabled:               settings?.analystEnabled               ?? false,
      camerasEnabled:               settings?.camerasEnabled               ?? false,
      cameraMonitorStation:         settings?.cameraMonitorStation         ?? null,
      cameraViewDuration:           settings?.cameraViewDuration           ?? 30000,
      cameraViewCooldown:           settings?.cameraViewCooldown           ?? 30000,
      criticalCountdownEnabled:     settings?.criticalCountdownEnabled     ?? false,
      criticalCountdownDuration:    settings?.criticalCountdownDuration    ?? 40000,
      criticalCountdownCooldown:    settings?.criticalCountdownCooldown    ?? 30000,
      maxCriticalCountdowns:        settings?.maxCriticalCountdowns        ?? 1,
      criticalCountdownStation:     settings?.criticalCountdownStation     ?? null,
      taskLockdownEnabled:          settings?.taskLockdownEnabled          ?? false,
      taskLockdownCooldown:         settings?.taskLockdownCooldown         ?? 30000,
      maxTaskLockdowns:             settings?.maxTaskLockdowns             ?? 1,
      taskLockdownStation:          settings?.taskLockdownStation          ?? null,
      fileReadingEnabled:           settings?.fileReadingEnabled           ?? false,
      fileReadingTimerDuration:     settings?.fileReadingTimerDuration     ?? 90000,
      fileReadingPenaltyCooldown:   settings?.fileReadingPenaltyCooldown   ?? 30000,
    },
    sabotage: {
      lockedRooms: new Map(),         // roomName → { expiresAt, timeoutId }
      roomLockCooldowns: new Map(),   // roomName → cooldownUntil (ms timestamp)
      globalLockdownActive: false,
      globalLockdownExpiresAt: null,
      globalLockdownCooldownUntil: 0,
      globalLockdownUsesLeft: settings?.maxGlobalLockdowns ?? 2,
      globalLockdownTimeoutId: null,
      criticalCountdownActive: false,
      criticalCountdownExpiresAt: null,
      criticalCountdownCooldownUntil: 0,
      criticalCountdownUsesLeft: settings?.maxCriticalCountdowns ?? 1,
      criticalCountdownCode: null,
      criticalCountdownTimeoutId: null,
      taskLockdownActive: false,
      taskLockdownStationRoom: null,
      taskLockdownCooldownUntil: 0,
      taskLockdownUsesLeft: settings?.maxTaskLockdowns ?? 1,
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
    if (game.lobbyCleanupTimeout) clearTimeout(game.lobbyCleanupTimeout);
    if (game.votingTimeout) clearTimeout(game.votingTimeout);
    for (const timeoutId of game.progressSyncTimeouts) {
      clearTimeout(timeoutId);
    }
    if (game.activeCameraView?.timeoutId) {
      clearTimeout(game.activeCameraView.timeoutId);
    }
    for (const { timeoutId } of game.sabotage.lockedRooms.values()) {
      if (timeoutId) clearTimeout(timeoutId);
    }
    if (game.sabotage.globalLockdownTimeoutId) {
      clearTimeout(game.sabotage.globalLockdownTimeoutId);
    }
    if (game.sabotage.criticalCountdownTimeoutId) {
      clearTimeout(game.sabotage.criticalCountdownTimeoutId);
    }
  }
  games.delete(code);
}

module.exports = { games, createGame, getGame, deleteGame };
