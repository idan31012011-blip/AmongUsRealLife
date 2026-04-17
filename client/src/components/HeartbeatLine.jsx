import { useEffect, useRef } from 'react';

const W = 220;
const H = 52;

export default function HeartbeatLine({ getState }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let raf;
    let smoothed = 0;
    let phase = Math.random() * Math.PI * 2;

    // Fill background once
    ctx.fillStyle = '#060d1a';
    ctx.fillRect(0, 0, W, H);

    function draw() {
      const s = getState();
      const isDead = s?.isDead ?? true;
      const isDying = s?.isDying ?? false;
      const dyingStart = s?.dyingStartTime ?? null;
      const rawMag = s?.magnitude ?? 0;

      // Compute effective magnitude
      let effectiveMag = isDead ? 0 : rawMag;
      let dyingFactor = 1;
      if (isDying && dyingStart) {
        dyingFactor = Math.max(0, 1 - (Date.now() - dyingStart) / 4000);
        effectiveMag = rawMag * dyingFactor;
      }

      // Smooth with lag (realistic delay)
      smoothed = smoothed * 0.88 + effectiveMag * 0.12;

      // Frequency: slow when still, fast when running
      const freq = isDead ? 0 : 0.04 + Math.min(smoothed / 12, 0.1) * (isDying ? dyingFactor : 1);
      phase += freq;

      // Amplitude proportional to motion
      const maxAmp = H / 2 - 5;
      const amp = isDead ? 0 : Math.min(smoothed / 14, 1) * maxAmp;

      // Scroll canvas left by 1 pixel
      const imgData = ctx.getImageData(1, 0, W - 1, H);
      ctx.putImageData(imgData, 0, 0);

      // Clear rightmost column
      ctx.fillStyle = '#060d1a';
      ctx.fillRect(W - 1, 0, 1, H);

      // Draw new point
      const y = H / 2 + Math.sin(phase) * amp;
      const color = isDead ? '#2a3a2a' : isDying ? `rgb(${Math.round(255 * dyingFactor + 80 * (1 - dyingFactor))}, ${Math.round(255 * dyingFactor)}, ${Math.round(80 * dyingFactor)})` : '#00ff88';
      ctx.fillStyle = color;
      ctx.fillRect(W - 1, Math.round(y) - 1, 1, 3);

      raf = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(raf);
  }, []); // eslint-disable-line

  return <canvas ref={canvasRef} width={W} height={H} className="heartbeat-canvas" />;
}
