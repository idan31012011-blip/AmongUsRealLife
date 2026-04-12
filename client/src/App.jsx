import { useGame } from './context/GameContext';
import HomeScreen from './screens/HomeScreen';
import ManagerSetupScreen from './screens/ManagerSetupScreen';
import LobbyScreen from './screens/LobbyScreen';
import RoleRevealScreen from './screens/RoleRevealScreen';
import GameScreen from './screens/GameScreen';
import KilledScreen from './screens/KilledScreen';
import MeetingAnimationScreen from './screens/MeetingAnimationScreen';
import VotingScreen from './screens/VotingScreen';
import GameEndScreen from './screens/GameEndScreen';

export default function App() {
  const { state } = useGame();

  const screens = {
    home: <HomeScreen />,
    setup: <ManagerSetupScreen />,
    lobby: <LobbyScreen />,
    role_reveal: <RoleRevealScreen />,
    gameplay: <GameScreen />,
    killed: <KilledScreen />,
    meeting_animation: <MeetingAnimationScreen />,
    voting: <VotingScreen />,
    game_end: <GameEndScreen />,
  };

  return (
    <div className="app">
      {state.error && (
        <div className="error-toast">{state.error}</div>
      )}
      {screens[state.phase] ?? <HomeScreen />}
    </div>
  );
}
