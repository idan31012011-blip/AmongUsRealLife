# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A mobile-first browser companion app for playing Among Us in real life. Players join a game on their phones, get a secret role (imposter/crewmate, optionally a station device or a doctor sub-role), walk around real rooms doing "tasks" (hold-to-complete timers, mini-games, or code entry at station devices), and the app runs kills, sabotage, meetings, and voting — no physical cards or app-free coordination needed.

## Commands

Run all commands from the repo root unless noted.

- `npm run dev` — runs the Express/Socket.IO server and the Vite dev client concurrently (needs Node on PATH)
- `npm run build` — installs client deps and builds the Vite client into `client/dist`
- `npm start` — runs the production server only, which serves the already-built `client/dist`
- Client-only dev server: `cd client && npm run dev` (Vite, `--host` so it's reachable on LAN)

There is no test suite or linter configured in this repo.

**LAN play:** the server binds `0.0.0.0:3001`; other devices on the same network join via `http://<host-LAN-IP>:3001`. In production (e.g. Railway, see `railway.json`) the server serves the built client directly — there is no separate client deployment.

## Architecture

**Everything is one Socket.IO connection driving a client-side reducer.** There is no REST API — all game actions are socket events in both directions (client emits actions like `create_game`/`cast_vote`, server emits state-changing events like `kill_confirmed`/`vote_results`). Game state lives entirely server-side, in memory; the client is a thin state-reducer synced by whatever events arrive.

### Server (`server/`)

- **`gameManager.js`** — the in-memory store: `Map<gameCode, GameState>`. `createGame`/`getGame`/`deleteGame`. A `GameState` object holds *everything* about one game: players, rooms, tasks, votes, sabotage sub-state, settings, and all pending `setTimeout` handles (so they can be cleared on cleanup/reset). There is one such object per active game code; nothing is persisted to disk.
- **`socketHandlers.js`** — the entire event surface. One large `registerHandlers(io, socket)` registers every `socket.on(...)` handler, organized under banner comments: LOBBY, ROLE REVEAL, GAMEPLAY, STATIONS, MOTION, KILL, SELF-REPORT KILL, SABOTAGE, MEETINGS, VOTING, MANAGER CONTROLS, DISCONNECT — followed by private helper functions (station/sabotage helpers, `startMeeting`, `resolveVoting`, `endGame`, `canDoTask`). When adding a new event, find the matching banner section and follow the existing validation pattern: look up the game by code, verify phase, verify the caller is authorized (correct role / is the manager), then mutate state and broadcast.
- **`gameLogic.js`** — pure functions with no I/O: `assignRoles` (imposter selection + per-player task generation), `calculateTaskProgress`, `tallyVotes`, `checkWinConditions`, and the `buildXPlayerList`/`buildPlayerTasks` view builders that strip server-only fields (like `role`) before sending state to clients who shouldn't see it yet.
- **`utils.js`** — small helpers (game code generation, shuffle, per-room task text, player codes).
- Reconnection is handled by keeping disconnected players in the game (marked `disconnected`/`isAlive` as appropriate) for a 60s grace window before finalizing removal — see the `disconnect` handler and `rejoin_game`.

### Game state model worth knowing before making changes

- **Phases** drive almost all handler validation: `lobby → role_reveal → gameplay ⇄ voting → game_end` (a game can also loop back to `lobby` via `play_again`). Most handlers early-return if `game.phase` doesn't match what they expect.
- **Roles**: `imposter` (exactly one), `crewmate`, `station` (a room's dedicated device, not a playable character — excluded from win-condition player counts, voting, and the public player list), plus an optional `doctor` sub-role layered on top of crewmate/imposter that gets motion-sensor pings (`motion_update` → `player_motion`).
- **Tasks** are generated per-player per-room in `assignRoles`; the imposter's tasks are real-looking but marked `isFake` and never count toward `calculateTaskProgress`. Task types: `regular` (hold-to-complete), `station` (completed via mini-game at a station device), `file_reading` (a timed reading/comprehension check, see `client/src/data/*Questions.js`).
- **Sabotage** (`game.sabotage`) has three independent sub-systems, each with its own active/expiry/cooldown/uses-left state and its own `setTimeout` handle that must be cleared on `play_again`/`deleteGame`: room locking, global lockdown, and "critical countdown" (a station-only defuse code puzzle that ends the game for crewmates if it expires).
- **Kills** are immediate (no separate "confirm death" step server-side). Crewmates can also self-report their own death (`self_report_kill`) with a brief undo window (`undo_self_kill`) that closes once a meeting starts.
- **Manager** is effectively the host/admin: only they can start the game, change settings/rooms/stations, kick, force-end voting, or eliminate a player mid-voting. Manager role auto-transfers to another connected player on disconnect.

### Client (`client/src/`)

- **State**: a single `GameContext` (`context/GameContext.jsx`) using `useReducer`, seeded with `initialState`/`defaultSettings`/`defaultSabotage` that mirror the server's shapes. All socket event listeners dispatch into this one reducer — check the top of `GameContext.jsx` for the full `initialState` shape before adding new server-driven fields.
- **`socket.js`** — the single shared `socket.io-client` instance.
- **Screens** (`screens/`) map 1:1 to `state.phase` values and are switched in `App.jsx`'s `screens` lookup object; add a new phase by adding both a reducer case and an entry here.
- **Mini-games** (`SimonSaysGame.jsx`, `StopTheBarGame.jsx`, `WireConnectGame.jsx`, `FileReadingGame.jsx`) are played at station devices; which ones are in rotation is controlled by `settings.stationMiniGames` and picked server-side per attempt, avoiding repeats via `playerMiniGameHistory`.
- **i18n**: `i18n/translations.js` + `context/LanguageContext.jsx`; note some in-game task text (e.g. file reading task description) is hardcoded in Hebrew server-side in `gameLogic.js`.
- Styling is plain CSS with custom properties (`styles/theme.css`, `styles/global.css`, `styles/animations.css`) — no CSS framework.
