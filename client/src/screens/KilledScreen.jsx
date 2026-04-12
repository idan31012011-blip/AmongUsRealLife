import { useGame } from '../context/GameContext';
import socket from '../socket';

export default function KilledScreen() {
  const { state, dispatch } = useGame();

  function confirmDeath() {
    socket.emit('confirm_death', { code: state.gameCode });
    // Optimistically transition back to gameplay (dead state).
    // The server will also emit kill_confirmed to all players.
    dispatch({ type: 'CONFIRM_DEATH_LOCAL' });
  }

  return (
    <div className="screen killed-screen" onClick={confirmDeath}>
      <div className="killed-content">
        <div className="killed-icon">💀</div>
        <h1 className="killed-title">YOU'VE BEEN KILLED</h1>
        <p className="killed-sub">Show this screen to your killer to confirm</p>
        <div className="killed-tap-hint">Tap anywhere to continue</div>
      </div>
    </div>
  );
}
