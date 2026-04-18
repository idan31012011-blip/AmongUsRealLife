import { createContext, useContext, useReducer, useEffect } from 'react';
import socket from '../socket';
import { playRoomLock, playGlobalLockdownAlarm } from '../sounds';

const GameContext = createContext(null);

const defaultSettings = {
  killCooldown: 20000,
  taskHoldDuration: 20000,
  deadTaskHoldDuration: 10000,
  sabotageEnabled: false,
  roomLockingEnabled: true,
  maxLockedRooms: 2,
  roomLockDuration: 20000,
  roomLockCooldown: 60000,
  globalLockdownEnabled: true,
  globalLockdownDuration: 30000,
  globalLockdownCooldown: 120000,
  maxGlobalLockdowns: 2,
  stationsEnabled: false,
};

const defaultSabotage = {
  lockedRooms: [],               // [{ roomName, expiresAt }]
  roomLockCooldowns: {},         // { roomName: cooldownUntil } — imposter only
  globalLockdownActive: false,
  globalLockdownExpiresAt: null,
  globalLockdownCooldownUntil: 0,
  globalLockdownUsesLeft: 2,
};

const initialState = {
  gameCode: null,
  phase: 'home',         // 'home' | 'setup' | 'lobby' | 'role_reveal' | 'gameplay' | 'station' | 'meeting_animation' | 'voting' | 'game_end'
  myId: null,
  myRole: null,          // 'imposter' | 'crewmate' | 'station'
  myName: null,
  isManager: false,
  managerId: null,
  isAlive: true,
  players: [],           // [{ id, name, isAlive, bodyFound, votedOut, disconnected }]
  rooms: [],
  myTasks: [],           // [{ id, room, description, completed, isFake, type }]
  taskProgressPercent: 0,
  killCooldownUntil: 0,
  hasCalledEmergency: false,
  votes: {},             // { socketId: socketId | 'skip' } revealed after all vote
  voteCounts: {},        // { socketId: count } shown during/after voting
  myVote: null,
  totalVotesIn: 0,
  winner: null,
  winReason: null,
  ejectedPlayer: null,   // { id, name, wasImposter }
  lastMeeting: null,     // { reason, reporterName, bodyName }
  error: null,
  settings: { ...defaultSettings },
  sabotage: { ...defaultSabotage },
  pendingLockNotification: null, // { type: 'room'|'global', roomName?, expiresAt }
  myCode: null,              // 3-digit string, non-station players only
  stationRoom: null,         // room this device is a station for
  stationHasMeeting: false,  // whether this station device has the meeting button
  stationAssignments: [],    // [{ playerId, roomName, playerName, hasMeeting }] — lobby
  pendingStationNotice: null, // { roomName } — shown when station disconnects
  isDoctor: false,           // doctor sub-role
  reportBodyWindowEnd: null, // ms timestamp when current report window expires (null = no window)
};

function reducer(state, action) {
  // Station devices must not be knocked out of the 'station' phase by game events
  if (state.phase === 'station') {
    if (['ALL_REVEALED', 'MEETING_CALLED', 'SHOW_VOTING', 'VOTING_ENDED', 'CONFIRM_DEATH_LOCAL'].includes(action.type)) {
      if (action.taskProgressPercent !== undefined) {
        return { ...state, taskProgressPercent: action.taskProgressPercent };
      }
      return state;
    }
  }

  switch (action.type) {
    case 'SET_MY_ID':
      return { ...state, myId: action.id };

    case 'GO_TO_SETUP':
      return { ...state, phase: 'setup' };

    case 'GAME_CREATED':
      return { ...state, gameCode: action.code, phase: 'lobby', isManager: true };

    case 'GAME_JOINED':
      return {
        ...state,
        gameCode: action.code,
        phase: 'lobby',
        players: action.players,
        rooms: action.rooms,
        settings: action.settings ?? state.settings,
        isManager: action.isManager,
        managerId: action.managerId ?? state.managerId,
        stationAssignments: action.stationAssignments ?? state.stationAssignments,
      };

    case 'SETTINGS_UPDATED':
      return { ...state, settings: action.settings };

    case 'ROOMS_UPDATED':
      return { ...state, rooms: action.rooms };

    case 'PLAYER_JOINED':
      return {
        ...state,
        players: [...state.players.filter(p => p.id !== action.player.id), action.player],
      };

    case 'PLAYER_LEFT':
      return { ...state, players: state.players.filter(p => p.id !== action.playerId) };

    case 'PLAYER_RECONNECTED':
      return {
        ...state,
        players: state.players.map(p =>
          p.id === action.playerId ? { ...p, disconnected: false } : p
        ),
      };

    case 'PLAYER_DISCONNECTED':
      return {
        ...state,
        players: state.players.map(p =>
          p.id === action.playerId ? { ...p, disconnected: true } : p
        ),
      };

    case 'GAME_STARTED':
      return { ...state, phase: 'role_reveal', players: action.players };

    case 'ROLE_ASSIGNED':
      return {
        ...state,
        myRole: action.role,
        myTasks: action.tasks,
        killCooldownUntil: action.killCooldownUntil || 0,
        myCode: action.myCode ?? null,
      };

    case 'STATION_DEVICE_READY':
      return {
        ...state,
        phase: 'station',
        myRole: 'station',
        stationRoom: action.roomName,
        stationHasMeeting: action.hasMeeting ?? false,
      };

    case 'STATIONS_UPDATED':
      return { ...state, stationAssignments: action.stations };

    case 'STATION_DISCONNECTED':
      return {
        ...state,
        myTasks: state.myTasks.map(task => {
          const reverted = action.revertedTasks.find(r => r.taskId === task.id);
          return reverted ? { ...task, type: 'regular' } : task;
        }),
        pendingStationNotice: { roomName: action.roomName },
      };

    case 'DISMISS_STATION_NOTICE':
      return { ...state, pendingStationNotice: null };

    case 'DOCTOR_ASSIGNED':
      return { ...state, isDoctor: true };

    case 'ALL_REVEALED':
      return { ...state, phase: 'gameplay', taskProgressPercent: action.taskProgressPercent };

    case 'TASK_COMPLETED':
      return {
        ...state,
        taskProgressPercent: action.progressPercent,
        myTasks: state.myTasks.map(t =>
          t.id === action.taskId ? { ...t, completed: true } : t
        ),
      };

    case 'KILL_INITIATED':
      // Only fired on the victim; show red screen
      return { ...state, phase: 'killed' };

    case 'CONFIRM_DEATH_LOCAL':
      // Victim confirmed death locally — go back to gameplay as a dead player
      return { ...state, phase: 'gameplay', isAlive: false };

    case 'KILL_CONFIRMED':
      return {
        ...state,
        players: state.players.map(p =>
          p.id === action.victimId ? { ...p, isAlive: false } : p
        ),
        isAlive: state.myId === action.victimId ? false : state.isAlive,
        killCooldownUntil: state.myRole === 'imposter' ? action.cooldownUntil : state.killCooldownUntil,
      };

    case 'BODY_REPORT_WINDOW_OPENED':
      return { ...state, reportBodyWindowEnd: action.expiresAt };

    case 'BODY_REPORT_WINDOW_CLOSED':
      return { ...state, reportBodyWindowEnd: null };

    case 'MEETING_CALLED':
      return {
        ...state,
        phase: 'meeting_animation',
        players: action.players,
        votes: {},
        voteCounts: {},
        myVote: null,
        totalVotesIn: 0,
        ejectedPlayer: null,
        lastMeeting: { reason: action.reason, reporterName: action.reporterName, bodyName: action.bodyName },
        // Clear lockdown and report window UI when a meeting starts
        sabotage: { ...state.sabotage, globalLockdownActive: false, globalLockdownExpiresAt: null },
        pendingLockNotification: null,
        reportBodyWindowEnd: null,
      };

    case 'SHOW_VOTING':
      return { ...state, phase: 'voting' };

    case 'VOTE_CAST':
      return { ...state, totalVotesIn: action.totalVotes };

    case 'MY_VOTE_CAST':
      return { ...state, myVote: action.targetId };

    case 'VOTE_RESULTS':
      return {
        ...state,
        votes: action.votes,
        voteCounts: action.voteCounts,
        ejectedPlayer: action.ejected,
        players: action.players,
      };

    case 'VOTING_ENDED':
      return {
        ...state,
        phase: 'gameplay',
        taskProgressPercent: action.taskProgressPercent,
        players: action.players,
        isAlive: action.players.find(p => p.id === state.myId)?.isAlive ?? state.isAlive,
      };

    case 'GAME_OVER':
      return {
        ...state,
        phase: 'game_end',
        winner: action.winner,
        winReason: action.reason,
        players: action.players,
        reportBodyWindowEnd: null,
      };

    case 'GAME_RESET':
      return {
        ...initialState,
        myId: state.myId,
        gameCode: state.gameCode,
        phase: 'lobby',
        players: action.players,
        rooms: action.rooms,
        settings: action.settings ?? state.settings,
        isManager: state.isManager,
        myName: state.myName,
        stationAssignments: action.stationAssignments ?? [],
        myCode: null,
        stationRoom: null,
        stationHasMeeting: false,
        pendingStationNotice: null,
        isDoctor: false,
        reportBodyWindowEnd: null,
      };

    case 'GAME_STATE_RESTORED': {
      const restoredSabotage = action.sabotage
        ? {
            lockedRooms: action.sabotage.lockedRooms ?? [],
            roomLockCooldowns: action.sabotage.roomLockCooldowns ?? {},
            globalLockdownActive: action.sabotage.globalLockdown?.active ?? false,
            globalLockdownExpiresAt: action.sabotage.globalLockdown?.expiresAt ?? null,
            globalLockdownCooldownUntil: action.sabotage.globalLockdown?.cooldownUntil ?? 0,
            globalLockdownUsesLeft: action.sabotage.globalLockdown?.usesLeft ?? state.settings.maxGlobalLockdowns,
          }
        : state.sabotage;

      // If reconnecting during an active lockdown, show the notification (no alarm replay)
      const restoredNotification = restoredSabotage.globalLockdownActive
        ? { type: 'global', expiresAt: restoredSabotage.globalLockdownExpiresAt }
        : null;

      return {
        ...state,
        phase: action.phase,
        players: action.players,
        rooms: action.rooms,
        settings: action.settings ?? state.settings,
        myRole: action.role,
        myTasks: action.myTasks,
        isAlive: action.isAlive,
        taskProgressPercent: action.taskProgressPercent,
        killCooldownUntil: action.killCooldownUntil || 0,
        hasCalledEmergency: action.hasCalledEmergency || false,
        isManager: action.isManager,
        managerId: action.managerId ?? state.managerId,
        sabotage: restoredSabotage,
        pendingLockNotification: restoredNotification,
        myCode: action.myCode ?? state.myCode,
      };
    }

    case 'KILL_COOLDOWN_STARTED':
      return { ...state, killCooldownUntil: action.cooldownUntil };

    case 'PLAYER_KICKED':
      if (action.playerId === state.myId) {
        // I was kicked — go home
        localStorage.removeItem('gameCode');
        localStorage.removeItem('playerName');
        return { ...initialState, myId: state.myId, error: 'You were removed from the game.' };
      }
      return { ...state, players: state.players.filter(p => p.id !== action.playerId) };

    case 'SET_MY_NAME':
      return { ...state, myName: action.name };

    case 'RESET_TO_HOME':
      localStorage.removeItem('gameCode');
      localStorage.removeItem('playerName');
      return { ...initialState, myId: state.myId };

    case 'SET_ERROR':
      return { ...state, error: action.message };

    case 'CLEAR_ERROR':
      return { ...state, error: null };

    case 'DEAD_TASK_UNLOCKED':
      return {
        ...state,
        players: state.players.map(p =>
          !p.isAlive ? { ...p, bodyFound: true } : p
        ),
      };

    // ─── SABOTAGE ───────────────────────────────────────────────────────────

    case 'ROOM_LOCKED':
      return {
        ...state,
        sabotage: { ...state.sabotage, lockedRooms: action.lockedRooms },
        // Only show notification to non-imposters (imposter triggered it)
        pendingLockNotification: state.myRole !== 'imposter'
          ? { type: 'room', roomName: action.roomName, expiresAt: action.expiresAt }
          : state.pendingLockNotification,
      };

    case 'ROOM_UNLOCKED':
      return {
        ...state,
        sabotage: { ...state.sabotage, lockedRooms: action.lockedRooms },
      };

    case 'GLOBAL_LOCKDOWN_STARTED':
      return {
        ...state,
        sabotage: {
          ...state.sabotage,
          globalLockdownActive: true,
          globalLockdownExpiresAt: action.expiresAt,
        },
        pendingLockNotification: { type: 'global', expiresAt: action.expiresAt },
      };

    case 'GLOBAL_LOCKDOWN_ENDED':
      return {
        ...state,
        sabotage: {
          ...state.sabotage,
          globalLockdownActive: false,
          globalLockdownExpiresAt: null,
        },
        pendingLockNotification: null,
      };

    case 'SABOTAGE_STATUS':
      return {
        ...state,
        sabotage: {
          lockedRooms: action.lockedRooms ?? [],
          roomLockCooldowns: action.roomLockCooldowns ?? {},
          globalLockdownActive: action.globalLockdown?.active ?? false,
          globalLockdownExpiresAt: action.globalLockdown?.expiresAt ?? null,
          globalLockdownCooldownUntil: action.globalLockdown?.cooldownUntil ?? 0,
          globalLockdownUsesLeft: action.globalLockdown?.usesLeft ?? 0,
        },
      };

    case 'DISMISS_LOCK_NOTIFICATION':
      return { ...state, pendingLockNotification: null };

    default:
      return state;
  }
}

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    // Set socket ID
    socket.on('connect', () => {
      dispatch({ type: 'SET_MY_ID', id: socket.id });
    });
    if (socket.id) dispatch({ type: 'SET_MY_ID', id: socket.id });

    socket.on('game_created', ({ code }) => {
      dispatch({ type: 'GAME_CREATED', code });
    });

    socket.on('game_joined', data => {
      dispatch({ type: 'GAME_JOINED', ...data });
    });

    socket.on('player_joined', ({ player }) => {
      dispatch({ type: 'PLAYER_JOINED', player });
    });

    socket.on('player_left', ({ playerId }) => {
      dispatch({ type: 'PLAYER_LEFT', playerId });
    });

    socket.on('player_reconnected', ({ playerId }) => {
      dispatch({ type: 'PLAYER_RECONNECTED', playerId });
    });

    socket.on('player_disconnected', ({ playerId }) => {
      dispatch({ type: 'PLAYER_DISCONNECTED', playerId });
    });

    socket.on('game_started', ({ players }) => {
      dispatch({ type: 'GAME_STARTED', players });
    });

    socket.on('role_assigned', ({ role, tasks, killCooldownUntil, myCode }) => {
      dispatch({ type: 'ROLE_ASSIGNED', role, tasks, killCooldownUntil, myCode });
    });

    socket.on('station_device_ready', ({ roomName, hasMeeting }) => {
      dispatch({ type: 'STATION_DEVICE_READY', roomName, hasMeeting });
    });

    socket.on('stations_updated', ({ stations }) => {
      dispatch({ type: 'STATIONS_UPDATED', stations });
    });

    socket.on('station_disconnected', ({ roomName, revertedTasks }) => {
      dispatch({ type: 'STATION_DISCONNECTED', roomName, revertedTasks });
    });

    socket.on('doctor_assigned', () => {
      dispatch({ type: 'DOCTOR_ASSIGNED' });
    });

    socket.on('all_revealed', ({ taskProgressPercent }) => {
      dispatch({ type: 'ALL_REVEALED', taskProgressPercent });
    });

    socket.on('task_completed', ({ taskId, progressPercent }) => {
      dispatch({ type: 'TASK_COMPLETED', taskId, progressPercent });
    });

    socket.on('kill_initiated', ({ victimId }) => {
      dispatch({ type: 'KILL_INITIATED', victimId });
    });

    socket.on('kill_confirmed', ({ victimId, cooldownUntil }) => {
      dispatch({ type: 'KILL_CONFIRMED', victimId, cooldownUntil });
    });

    socket.on('body_report_window_opened', ({ expiresAt }) => {
      dispatch({ type: 'BODY_REPORT_WINDOW_OPENED', expiresAt });
    });

    socket.on('body_report_window_closed', () => {
      dispatch({ type: 'BODY_REPORT_WINDOW_CLOSED' });
    });

    socket.on('meeting_called', data => {
      dispatch({ type: 'MEETING_CALLED', ...data });
    });

    socket.on('vote_cast', ({ voterId, totalVotes }) => {
      dispatch({ type: 'VOTE_CAST', voterId, totalVotes });
    });

    socket.on('vote_results', data => {
      dispatch({ type: 'VOTE_RESULTS', ...data });
    });

    socket.on('voting_ended', data => {
      dispatch({ type: 'VOTING_ENDED', ...data });
    });

    socket.on('kill_cooldown_started', ({ cooldownUntil }) => {
      dispatch({ type: 'KILL_COOLDOWN_STARTED', cooldownUntil });
    });

    socket.on('player_kicked', ({ playerId }) => {
      dispatch({ type: 'PLAYER_KICKED', playerId });
    });

    socket.on('game_over', data => {
      dispatch({ type: 'GAME_OVER', ...data });
    });

    socket.on('game_reset', data => {
      dispatch({ type: 'GAME_RESET', ...data });
    });

    socket.on('game_state_restored', data => {
      dispatch({ type: 'GAME_STATE_RESTORED', ...data });
    });

    socket.on('settings_updated', ({ settings }) => {
      dispatch({ type: 'SETTINGS_UPDATED', settings });
    });

    socket.on('rooms_updated', ({ rooms }) => {
      dispatch({ type: 'ROOMS_UPDATED', rooms });
    });

    socket.on('room_locked', data => {
      dispatch({ type: 'ROOM_LOCKED', ...data });
    });

    socket.on('room_unlocked', data => {
      dispatch({ type: 'ROOM_UNLOCKED', ...data });
    });

    socket.on('global_lockdown_started', ({ expiresAt }) => {
      dispatch({ type: 'GLOBAL_LOCKDOWN_STARTED', expiresAt });
      playGlobalLockdownAlarm();
    });

    socket.on('global_lockdown_ended', () => {
      dispatch({ type: 'GLOBAL_LOCKDOWN_ENDED' });
    });

    socket.on('sabotage_status', data => {
      dispatch({ type: 'SABOTAGE_STATUS', ...data });
    });

    socket.on('error', ({ message }) => {
      dispatch({ type: 'SET_ERROR', message });
      setTimeout(() => dispatch({ type: 'CLEAR_ERROR' }), 4000);
    });

    return () => {
      socket.off('connect');
      socket.off('game_created');
      socket.off('game_joined');
      socket.off('player_joined');
      socket.off('player_left');
      socket.off('player_reconnected');
      socket.off('player_disconnected');
      socket.off('game_started');
      socket.off('role_assigned');
      socket.off('station_device_ready');
      socket.off('stations_updated');
      socket.off('station_disconnected');
      socket.off('doctor_assigned');
      socket.off('all_revealed');
      socket.off('task_completed');
      socket.off('kill_initiated');
      socket.off('kill_confirmed');
      socket.off('kill_cooldown_started');
      socket.off('body_report_window_opened');
      socket.off('body_report_window_closed');
      socket.off('meeting_called');
      socket.off('vote_cast');
      socket.off('vote_results');
      socket.off('voting_ended');
      socket.off('player_kicked');
      socket.off('game_over');
      socket.off('game_reset');
      socket.off('game_state_restored');
      socket.off('settings_updated');
      socket.off('rooms_updated');
      socket.off('room_locked');
      socket.off('room_unlocked');
      socket.off('global_lockdown_started');
      socket.off('global_lockdown_ended');
      socket.off('sabotage_status');
      socket.off('error');
    };
  }, []);

  // Motion broadcasting — runs for all non-station players during gameplay
  useEffect(() => {
    const activePhases = ['gameplay', 'voting', 'meeting_animation'];
    if (!activePhases.includes(state.phase) || state.myRole === 'station' || !state.gameCode) return;

    let lastMagnitude = 0;

    function handleMotion(e) {
      const a = e.acceleration || e.accelerationIncludingGravity;
      if (!a) return;
      lastMagnitude = Math.sqrt((a.x || 0) ** 2 + (a.y || 0) ** 2 + (a.z || 0) ** 2);
    }

    window.addEventListener('devicemotion', handleMotion);
    const interval = setInterval(() => {
      socket.emit('motion_update', { code: state.gameCode, magnitude: lastMagnitude });
    }, 100);

    return () => {
      window.removeEventListener('devicemotion', handleMotion);
      clearInterval(interval);
    };
  }, [state.phase, state.myRole, state.gameCode]);

  return (
    <GameContext.Provider value={{ state, dispatch }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  return useContext(GameContext);
}
