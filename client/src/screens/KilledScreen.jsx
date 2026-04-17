import { useGame } from '../context/GameContext';

export default function KilledScreen() {
  const { dispatch } = useGame();

  function dismiss() {
    dispatch({ type: 'CONFIRM_DEATH_LOCAL' });
  }

  return (
    <div className="screen killed-screen" onClick={dismiss}>
      <div className="killed-content">
        <div className="killed-icon">💀</div>
        <h1 className="killed-title">YOU'VE BEEN KILLED</h1>
        <div className="killed-tap-hint">Tap anywhere to continue</div>
      </div>
    </div>
  );
}
