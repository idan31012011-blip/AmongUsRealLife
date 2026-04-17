import { useGame } from '../context/GameContext';
import { useLanguage } from '../context/LanguageContext';

export default function KilledScreen() {
  const { dispatch } = useGame();
  const { t } = useLanguage();

  function dismiss() {
    dispatch({ type: 'CONFIRM_DEATH_LOCAL' });
  }

  return (
    <div className="screen killed-screen" onClick={dismiss}>
      <div className="killed-content">
        <div className="killed-icon">💀</div>
        <h1 className="killed-title">{t('youveBeenKilled')}</h1>
        <div className="killed-tap-hint">{t('tapToContinue2')}</div>
      </div>
    </div>
  );
}
