import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../context/LanguageContext';

const BAR_W  = 0.14;
const ZONE_L = 0.38;
const ZONE_R = 0.62;
const BASE_SPEED = 0.38;
const SPEED_STEP = 0.07;

export default function StopTheBarGame({ playerName, onSuccess }) {
  const { t } = useLanguage();

  const posRef      = useRef(0);
  const dirRef      = useRef(1);
  const speedRef    = useRef(BASE_SPEED);
  const lastTimeRef = useRef(null);
  const rafRef      = useRef(null);
  const frozenRef   = useRef(false);
  const frameRef    = useRef(null);

  const [displayPos, setDisplayPos] = useState(0);
  const [status, setStatus] = useState('playing'); // 'playing' | 'miss' | 'done'

  useEffect(() => {
    const animate = (time) => {
      if (frozenRef.current) return;
      if (lastTimeRef.current !== null) {
        const dt = (time - lastTimeRef.current) / 1000;
        let p = posRef.current + dirRef.current * speedRef.current * dt;
        const max = 1 - BAR_W;
        if (p >= max) { p = max; dirRef.current = -1; }
        if (p <= 0)   { p = 0;   dirRef.current =  1; }
        posRef.current = p;
        setDisplayPos(p);
      }
      lastTimeRef.current = time;
      rafRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = animate;
    frozenRef.current = false;
    rafRef.current = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(rafRef.current); frozenRef.current = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleTap() {
    if (status !== 'playing') return;
    frozenRef.current = true;
    cancelAnimationFrame(rafRef.current);

    const center = posRef.current + BAR_W / 2;
    if (center >= ZONE_L && center <= ZONE_R) {
      setStatus('done');
      setTimeout(onSuccess, 700);
    } else {
      setStatus('miss');
      speedRef.current = Math.min(speedRef.current + SPEED_STEP, 1.4);
      setTimeout(() => {
        posRef.current = 0;
        dirRef.current = 1;
        lastTimeRef.current = null;
        frozenRef.current = false;
        setDisplayPos(0);
        setStatus('playing');
        rafRef.current = requestAnimationFrame(frameRef.current);
      }, 1000);
    }
  }

  return (
    <div className="stopbar-game">
      <div className="simon-for">{t('simonPlayingFor', playerName)}</div>
      <div className="stopbar-status">
        {status === 'done' ? t('stopBarHit') : status === 'miss' ? t('stopBarMiss') : t('stopBarInstruction')}
      </div>
      <div className="stopbar-track">
        <div className="stopbar-zone" style={{ left: `${ZONE_L * 100}%`, width: `${(ZONE_R - ZONE_L) * 100}%` }} />
        <div
          className={`stopbar-bar${status === 'done' ? ' bar-done' : status === 'miss' ? ' bar-miss' : ''}`}
          style={{ left: `${displayPos * 100}%`, width: `${BAR_W * 100}%` }}
        />
      </div>
      <button
        className="btn btn-blue btn-large stopbar-tap-btn"
        onPointerDown={handleTap}
        disabled={status !== 'playing'}
      >
        {t('stopBarTap')}
      </button>
    </div>
  );
}
