import { useState, useEffect } from 'react';

const LETTERS = ['א', 'ב', 'ג', 'ד'];

export default function FileReadingGame({ question, timerExpiresAt, timerDuration, onCorrect, onWrong, onClose }) {
  const [secs, setSecs] = useState(() => Math.max(0, Math.ceil((timerExpiresAt - Date.now()) / 1000)));
  const [selected, setSelected] = useState(null);
  const [answered, setAnswered] = useState(false);

  useEffect(() => {
    const tick = setInterval(() => {
      const s = Math.max(0, Math.ceil((timerExpiresAt - Date.now()) / 1000));
      setSecs(s);
      if (s <= 0) clearInterval(tick);
    }, 250);
    return () => clearInterval(tick);
  }, [timerExpiresAt]);

  function handleSelect(index) {
    if (answered) return;
    setAnswered(true);
    setSelected(index);
    if (index === question.correctIndex) {
      setTimeout(onCorrect, 1200);
    } else {
      setTimeout(onWrong, 1200);
    }
  }

  const totalSecs = Math.ceil(timerDuration / 1000);
  const timerPct = Math.max(0, Math.min(100, (secs / totalSecs) * 100));
  const timerColor = timerPct > 40 ? 'var(--color-green)' : timerPct > 15 ? '#f59e0b' : 'var(--color-red)';

  return (
    <div className="fr-overlay" dir="rtl">
      <div className="fr-panel">
        <div className="fr-header">
          <div className="fr-file-badge">📄 מסמך: {question.file}</div>
          <button className="fr-close-btn" onClick={onClose} aria-label="סגור">✕</button>
        </div>

        <div className="fr-timer-row">
          <div className="fr-timer-bar-track">
            <div
              className="fr-timer-bar-fill"
              style={{ width: `${timerPct}%`, background: timerColor }}
            />
          </div>
          <span className="fr-timer-secs" style={{ color: timerColor }}>{secs}ש׳</span>
        </div>

        <div className="fr-question">{question.question}</div>

        <div className="fr-options">
          {question.options.map((opt, i) => {
            let cls = 'fr-option';
            if (answered) {
              if (i === question.correctIndex) cls += ' fr-option-correct';
              else if (i === selected) cls += ' fr-option-wrong';
              else cls += ' fr-option-dim';
            }
            return (
              <button key={i} className={cls} onClick={() => handleSelect(i)} disabled={answered}>
                <span className="fr-option-letter">{LETTERS[i]}.</span>
                <span className="fr-option-text">{opt}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
