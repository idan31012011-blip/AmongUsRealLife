import { useState, useEffect, useRef, useCallback } from 'react';
import { useLanguage } from '../context/LanguageContext';

const COLORS = ['red', 'blue', 'green', 'yellow'];

function randomSequence() {
  return Array.from({ length: 5 }, () => COLORS[Math.floor(Math.random() * COLORS.length)]);
}

export default function SimonSaysGame({ playerName, onSuccess }) {
  const { t } = useLanguage();
  const [sequence, setSequence] = useState(() => randomSequence());
  const [phase, setPhase] = useState('showing'); // 'showing' | 'player_turn' | 'failed'
  const [litColor, setLitColor] = useState(null);
  const [playerIndex, setPlayerIndex] = useState(0);
  const [flashSpeed, setFlashSpeed] = useState(700);
  const [statusMsg, setStatusMsg] = useState('');
  const cancelRef = useRef(false);

  const showSequence = useCallback((seq, speed) => {
    cancelRef.current = false;
    setPhase('showing');
    setStatusMsg(t('simonWatchSeq'));
    setPlayerIndex(0);

    let i = 0;
    function flashNext() {
      if (cancelRef.current) return;
      if (i >= seq.length) {
        setLitColor(null);
        setPhase('player_turn');
        setStatusMsg(t('simonRepeatSeq'));
        return;
      }
      setLitColor(seq[i]);
      setTimeout(() => {
        if (cancelRef.current) return;
        setLitColor(null);
        i++;
        setTimeout(flashNext, speed * 0.4);
      }, speed);
    }
    flashNext();
  }, [t]);

  useEffect(() => {
    showSequence(sequence, flashSpeed);
    return () => { cancelRef.current = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handlePress(color) {
    if (phase !== 'player_turn') return;

    if (color !== sequence[playerIndex]) {
      // Wrong tap
      setPhase('failed');
      setStatusMsg(t('simonWrong'));
      cancelRef.current = true;
      const newSpeed = Math.max(200, flashSpeed - 100);
      const newSeq = randomSequence();
      setTimeout(() => {
        setSequence(newSeq);
        setFlashSpeed(newSpeed);
        showSequence(newSeq, newSpeed);
      }, 1200);
      return;
    }

    const nextIndex = playerIndex + 1;
    if (nextIndex >= sequence.length) {
      // Completed!
      setLitColor(color);
      setTimeout(() => setLitColor(null), 300);
      onSuccess();
    } else {
      setPlayerIndex(nextIndex);
      setLitColor(color);
      setTimeout(() => setLitColor(null), 200);
    }
  }

  return (
    <div className="simon-game">
      <div className="simon-for">{t('simonPlayingFor', playerName)}</div>
      <div className="simon-status">{statusMsg}</div>
      <div className="simon-grid">
        {COLORS.map(color => (
          <button
            key={color}
            className={`simon-btn simon-${color}${litColor === color ? ' simon-active' : ''}`}
            onPointerDown={() => handlePress(color)}
          />
        ))}
      </div>
    </div>
  );
}
