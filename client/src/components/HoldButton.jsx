import { useState, useRef, useEffect } from 'react';
import socket from '../socket';

/**
 * Hold-to-complete button with a circular progress ring.
 * Props:
 *   taskId, gameCode, duration (ms), disabled, completed,
 *   onHoldStart(), onHoldEnd()  — callbacks for one-at-a-time enforcement in TaskList
 */
export default function HoldButton({ taskId, gameCode, duration, disabled, completed, onHoldStart, onHoldEnd }) {
  const [progress, setProgress] = useState(0); // 0–100
  const [holding, setHolding] = useState(false);
  const intervalRef = useRef(null);
  const startTimeRef = useRef(null);

  // Clean up on unmount (e.g. meeting called mid-hold)
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        if (startTimeRef.current) {
          socket.emit('task_hold_cancel', { code: gameCode, taskId });
          onHoldEnd?.();
        }
      }
    };
  }, [gameCode, taskId]); // eslint-disable-line react-hooks/exhaustive-deps

  function startHold(e) {
    e.preventDefault();
    if (disabled || completed || holding) return;

    setHolding(true);
    setProgress(0);
    startTimeRef.current = Date.now();
    onHoldStart?.();
    socket.emit('task_hold_start', { code: gameCode, taskId });

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min(100, (elapsed / duration) * 100);
      setProgress(pct);

      if (pct >= 100) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        startTimeRef.current = null;
        setHolding(false);
        onHoldEnd?.();
        socket.emit('complete_task', { code: gameCode, taskId });
      }
    }, 50);
  }

  function cancelHold(e) {
    e.preventDefault();
    if (!holding) return;

    clearInterval(intervalRef.current);
    intervalRef.current = null;
    setHolding(false);
    setProgress(0);

    if (startTimeRef.current) {
      socket.emit('task_hold_cancel', { code: gameCode, taskId });
      startTimeRef.current = null;
      onHoldEnd?.();
    }
  }

  const circumference = 2 * Math.PI * 26; // radius 26
  const strokeOffset = circumference * (1 - progress / 100);
  const seconds = holding ? Math.ceil((duration * (1 - progress / 100)) / 1000) : Math.ceil(duration / 1000);

  return (
    <button
      className={`hold-button ${completed ? 'hold-completed' : ''} ${holding ? 'hold-active' : ''} ${disabled ? 'hold-disabled' : ''}`}
      onPointerDown={startHold}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      onPointerCancel={cancelHold}
      disabled={disabled || completed}
      style={{ touchAction: 'none' }}
    >
      <svg className="hold-ring" viewBox="0 0 60 60">
        <circle cx="30" cy="30" r="26" className="hold-ring-track" />
        {!completed && (
          <circle
            cx="30" cy="30" r="26"
            className="hold-ring-progress"
            strokeDasharray={circumference}
            strokeDashoffset={strokeOffset}
            style={{ transition: holding ? 'none' : 'stroke-dashoffset 0.2s' }}
          />
        )}
        {completed && (
          <circle cx="30" cy="30" r="26" className="hold-ring-done" />
        )}
      </svg>
      <div className="hold-inner">
        {completed ? (
          <span className="hold-check">✓</span>
        ) : holding ? (
          <span className="hold-countdown">{seconds}s</span>
        ) : (
          <span className="hold-label-text">Hold</span>
        )}
      </div>
    </button>
  );
}
