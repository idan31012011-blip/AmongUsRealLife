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
    settings: {
      killCooldown: settings?.killCooldown ?? 20000,
      taskHoldDuration: settings?.taskHoldDuration ?? 20000,
      deadTaskHoldDuration: 10000,
      startKillCooldown: 20000,
      ...settings,
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
  if (game && game.votingTimeout) clearTimeout(game.votingTimeout);
  games.delete(code);
}

module.exports = { games, createGame, getGame, deleteGame };
