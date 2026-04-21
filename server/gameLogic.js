const { shuffle, getTaskDescription } = require('./utils');

/**
 * Assign roles and generate tasks for all players.
 * Returns updated players Map and tasks Map.
 */
function assignRoles(game) {
  const playerIds = [...game.players.keys()];
  // Only non-station players can be imposter/crewmate
  const nonStationIds = playerIds.filter(id => !game.stations.has(id));
  const shuffled = shuffle(nonStationIds);
  const imposterId = shuffled[0];

  // Build a map of roomName → stationPlayerId for quick lookup
  const stationRoomMap = new Map();
  for (const [playerId, roomName] of game.stationRooms) {
    stationRoomMap.set(roomName, playerId);
  }

  const tasks = new Map();

  for (const [id, player] of game.players) {
    player.tasksAssigned = [];
    player.tasksCompleted = new Set();

    if (game.stations.has(id)) {
      player.role = 'station';
      continue;
    }

    player.role = id === imposterId ? 'imposter' : 'crewmate';

    game.rooms.forEach((room, roomIndex) => {
      const taskId = `${room.toLowerCase().replace(/\s+/g, '-')}-${id}-${roomIndex}`;
      const isStationRoom = stationRoomMap.has(room);
      const task = {
        id: taskId,
        room,
        description: isStationRoom ? `Visit the ${room} station` : getTaskDescription(room, roomIndex),
        assignedTo: id,
        completed: false,
        isFake: id === imposterId,
        type: isStationRoom ? 'station' : 'regular',
      };
      tasks.set(taskId, task);
      player.tasksAssigned.push(taskId);
    });

    if (game.settings.fileReadingEnabled) {
      const frTaskId = `file-reading-${id}`;
      tasks.set(frTaskId, {
        id: frTaskId,
        room: null,
        description: 'קריאת קבצים',
        assignedTo: id,
        completed: false,
        isFake: id === imposterId,
        type: 'file_reading',
      });
      player.tasksAssigned.push(frTaskId);
    }
  }

  return tasks;
}

/**
 * Calculate global task progress as a percentage (0–100).
 * Only non-fake tasks count.
 */
function calculateTaskProgress(tasks) {
  let total = 0;
  let completed = 0;
  for (const task of tasks.values()) {
    if (!task.isFake) {
      total++;
      if (task.completed) completed++;
    }
  }
  if (total === 0) return 0;
  return Math.round((completed / total) * 100);
}

/**
 * Tally votes and determine who (if anyone) is ejected.
 * Returns { ejected: Player | null, counts: Map<id|'skip', number> }
 */
function tallyVotes(votes, players) {
  const counts = new Map();

  for (const [, targetId] of votes) {
    counts.set(targetId, (counts.get(targetId) || 0) + 1);
  }

  // Find the max vote count
  let maxVotes = 0;
  for (const count of counts.values()) {
    if (count > maxVotes) maxVotes = count;
  }

  if (maxVotes === 0) return { ejected: null, counts };

  // Collect all candidates with max votes
  const leaders = [];
  for (const [targetId, count] of counts) {
    if (count === maxVotes) leaders.push(targetId);
  }

  // Tie or skip wins → no ejection
  if (leaders.length > 1) return { ejected: null, counts };
  if (leaders[0] === 'skip') return { ejected: null, counts };

  const ejectedPlayer = players.get(leaders[0]) || null;
  return { ejected: ejectedPlayer, counts };
}

/**
 * Check win conditions. Returns { winner, reason } or null if game continues.
 */
function checkWinConditions(game) {
  const living = [...game.players.values()].filter(p => p.isAlive && p.role !== 'station');
  const livingCount = living.length;
  const imposter = [...game.players.values()].find(p => p.role === 'imposter');

  // Imposter was voted out / is dead
  if (imposter && !imposter.isAlive) {
    return { winner: 'crewmates', reason: 'imposter_voted_out' };
  }

  // Only 2 (or fewer) living players remain and imposter is alive
  if (livingCount <= 2 && imposter && imposter.isAlive) {
    return { winner: 'imposter', reason: 'imposter_wins' };
  }

  // All crewmate tasks completed
  const progress = calculateTaskProgress(game.tasks);
  if (progress >= 100) {
    return { winner: 'crewmates', reason: 'tasks_complete' };
  }

  return null;
}

/**
 * Build the safe player list to send to clients (no role info exposed).
 */
function buildPublicPlayerList(players) {
  return [...players.values()]
    .filter(p => p.role !== 'station')
    .map(p => ({
      id: p.id,
      name: p.name,
      isAlive: p.isAlive,
      bodyFound: p.bodyFound,
      votedOut: p.votedOut,
      disconnected: p.disconnected,
    }));
}

/**
 * Build the full player list for game-end reveal (roles exposed to all).
 */
function buildRevealPlayerList(players) {
  return [...players.values()].map(p => ({
    id: p.id,
    name: p.name,
    isAlive: p.isAlive,
    votedOut: p.votedOut,
    role: p.role,
  }));
}

/**
 * Build the per-player task list to send to that specific player.
 */
function buildPlayerTasks(player, tasks) {
  return player.tasksAssigned.map(taskId => {
    const task = tasks.get(taskId);
    return {
      id: task.id,
      room: task.room,
      description: task.description,
      completed: task.completed,
      isFake: task.isFake,
      type: task.type ?? 'regular',
    };
  });
}

module.exports = {
  assignRoles,
  calculateTaskProgress,
  tallyVotes,
  checkWinConditions,
  buildPublicPlayerList,
  buildRevealPlayerList,
  buildPlayerTasks,
};
