import { useEffect, useRef } from 'react';

const W = 220;
const H = 52;
const FPS = 60;

// ECG waveform shape — returns y-offset normalized to [-1, 1].
// `frame` = frames elapsed since this beat started.
// Positive = spike upward, negative = dip below baseline.
// Shape: flat → P wave → QRS spike → S dip → T wave → flat
function ecgShape(frame) {
  // P wave (soft pre-bump)
  if (frame === 1) return 0.08;
  if (frame === 2) return 0.14;
  if (frame === 3) return 0.10;
  // QRS complex (sharp spike)
  if (frame === 5) return -0.12;
  if (frame === 6) return 0.75;
  if (frame === 7) return 1.0;
  if (frame === 8) return -0.55;
  if (frame === 9) return -0.32;
  if (frame === 10) return -0.06;
  // T wave (smooth dome)
  if (frame === 12) return 0.16;
  if (frame === 13) return 0.27;
  if (frame === 14) return 0.24;
  if (frame === 15) return 0.14;
  if (frame === 16) return 0.05;
  return 0;
}

export default function HeartbeatLine({ getState }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let raf;
    let smoothed = 0;
    let framesSinceBeat = 999; // large so first beat fires immediately
    let beatInterval = FPS;   // frames between beat starts (smoothed)
    let wasDeadLastFrame = false;
    let wasDyingLastFrame = false;

    ctx.fillStyle = '#060d1a';
    ctx.fillRect(0, 0, W, H);

    function draw() {
      const s = getState();
      const isDead = s?.isDead ?? true;
      const isDying = s?.isDying ?? false;
      const dyingStart = s?.dyingStartTime ?? null;
      const rawMag = s?.magnitude ?? 0;

      // Reset beat state when a player is revived (transitions from dead/dying back to alive)
      if ((wasDeadLastFrame || wasDyingLastFrame) && !isDead && !isDying) {
        framesSinceBeat = 999;
        beatInterval = FPS;
        smoothed = 0;
      }
      wasDeadLastFrame = isDead;
      wasDyingLastFrame = isDying;

      // dyingFactor: 1 → 0 over 8 seconds
      let dyingFactor = 1;
      if (isDying && dyingStart) {
        dyingFactor = Math.max(0, 1 - (Date.now() - dyingStart) / 8000);
      }

      // Smooth incoming motion magnitude
      const effectiveMag = isDead ? 0 : rawMag * (isDying ? dyingFactor : 1);
      smoothed = smoothed * 0.9 + effectiveMag * 0.1;

      // norm: 0 = completely still, 1 = full sprint
      const norm = Math.min(smoothed / 6, 1);

      // BPM: 70 at rest → 150 running; slows dramatically when dying
      const rawBpm = 70 + norm * 80;
      const bpm = isDying ? rawBpm * (0.15 + dyingFactor * 0.85) : rawBpm;
      const targetInterval = isDead ? 9999 : (FPS * 60) / bpm;

      // Gently track target interval so BPM transitions smoothly
      beatInterval += (targetInterval - beatInterval) * 0.04;

      framesSinceBeat++;
      if (!isDead && framesSinceBeat >= beatInterval) {
        framesSinceBeat = 0;
      }

      // Amplitude: subtle at rest (H*0.14), full-height at sprint; fades when dying
      const restAmp = H * 0.14;
      const maxAmp = H / 2 - 4;
      const amp = isDead ? 0 : (restAmp + norm * (maxAmp - restAmp)) * (isDying ? dyingFactor : 1);

      // ECG y-value for this frame
      const ecgOffset = ecgShape(framesSinceBeat) * amp;
      const y = H / 2 - ecgOffset; // subtract so positive = upward spike

      // Scroll canvas left by 1 pixel
      const imgData = ctx.getImageData(1, 0, W - 1, H);
      ctx.putImageData(imgData, 0, 0);

      // Clear rightmost column
      ctx.fillStyle = '#060d1a';
      ctx.fillRect(W - 1, 0, 1, H);

      // Draw new rightmost pixel — green alive, dim flatline when dead
      ctx.fillStyle = isDead ? '#1a2e1a' : '#00ff88';
      ctx.fillRect(W - 1, Math.round(y) - 1, 1, 3);

      raf = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(raf);
  }, []); // eslint-disable-line

  return <canvas ref={canvasRef} width={W} height={H} className="heartbeat-canvas" />;
}
