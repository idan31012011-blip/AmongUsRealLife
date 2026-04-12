import { useState, useEffect } from 'react';

/**
 * Red kill button with a cooldown ring that depletes over time.
 * Props:
 *   cooldownUntil (ms timestamp), onKill (fn)
 */
export default function KillButton({ cooldownUntil, onKill }) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    function tick() {
      const left = Math.max(0, cooldownUntil - Date.now());
      setRemaining(left);
    }
    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [cooldownUntil]);

  const onCooldown = remaining > 0;
  const totalCooldown = 20000;
  const progress = onCooldown ? (remaining / totalCooldown) : 0;
  const circumference = 2 * Math.PI * 26;
  const strokeOffset = circumference * (1 - progress);
  const secondsLeft = Math.ceil(remaining / 1000);

  return (
    <button
      className={`btn-action btn-kill ${onCooldown ? 'btn-cooldown' : ''}`}
      onClick={!onCooldown ? onKill : undefined}
      disabled={onCooldown}
    >
      <svg className="kill-ring" viewBox="0 0 60 60">
        <circle cx="30" cy="30" r="26" className="kill-ring-track" />
        {onCooldown && (
          <circle
            cx="30" cy="30" r="26"
            className="kill-ring-progress"
            strokeDasharray={circumference}
            strokeDashoffset={strokeOffset}
          />
        )}
      </svg>
      <div className="kill-inner">
        {onCooldown ? (
          <span className="kill-countdown">{secondsLeft}s</span>
        ) : (
          <span className="kill-icon">🔪</span>
        )}
      </div>
      <span className="btn-action-label">{onCooldown ? 'Cooldown' : 'Kill'}</span>
    </button>
  );
}
