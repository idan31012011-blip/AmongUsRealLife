// Sound effects generated via Web Audio API — no external files needed.
// Exports: playEmergencyAlarm, playRoleSuspense, playVoteResults, playGameEnd,
//          playRoomLock, playGlobalLockdownAlarm

let _ctx = null;

function ctx() {
  if (!_ctx) {
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

// 1. Emergency meeting — two-tone klaxon alarm
export function playEmergencyAlarm() {
  try {
    const ac = ctx();
    const now = ac.currentTime;

    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sawtooth';

    // Alternate 880 Hz / 440 Hz every 0.25 s (8 pulses = 2 s)
    [880, 440, 880, 440, 880, 440, 880, 440].forEach((f, i) => {
      osc.frequency.setValueAtTime(f, now + i * 0.25);
    });

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.5, now + 0.05);
    gain.gain.setValueAtTime(0.5, now + 1.9);
    gain.gain.linearRampToValueAtTime(0, now + 2.2);

    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(now);
    osc.stop(now + 2.3);
  } catch (_) {}
}

// 2. Role reveal suspense — heartbeat pulses + rising tension tone
export function playRoleSuspense() {
  try {
    const ac = ctx();
    const now = ac.currentTime;

    // Four heartbeat thumps (slightly accelerating)
    [0, 0.45, 0.85, 1.2].forEach(offset => {
      const beat = ac.createOscillator();
      const bg = ac.createGain();
      beat.type = 'sine';
      beat.frequency.value = 55; // low A1
      const t = now + offset;
      bg.gain.setValueAtTime(0, t);
      bg.gain.linearRampToValueAtTime(0.5, t + 0.03);
      bg.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      beat.connect(bg);
      bg.connect(ac.destination);
      beat.start(t);
      beat.stop(t + 0.2);
    });

    // Rising tone that builds into the card flip
    const riser = ac.createOscillator();
    const rg = ac.createGain();
    riser.type = 'triangle';
    riser.frequency.setValueAtTime(150, now);
    riser.frequency.exponentialRampToValueAtTime(480, now + 1.5);
    rg.gain.setValueAtTime(0, now);
    rg.gain.linearRampToValueAtTime(0.12, now + 0.3);
    rg.gain.linearRampToValueAtTime(0.2, now + 1.3);
    rg.gain.linearRampToValueAtTime(0, now + 1.6);
    riser.connect(rg);
    rg.connect(ac.destination);
    riser.start(now);
    riser.stop(now + 1.7);
  } catch (_) {}
}

// 3. Vote results revealed — drum roll then impact chord
export function playVoteResults() {
  try {
    const ac = ctx();
    const now = ac.currentTime;

    // 8-hit drum roll (pitched bass thuds)
    for (let i = 0; i < 8; i++) {
      const d = ac.createOscillator();
      const dg = ac.createGain();
      const t = now + i * 0.065;
      d.type = 'triangle';
      d.frequency.setValueAtTime(120, t);
      d.frequency.exponentialRampToValueAtTime(50, t + 0.06);
      dg.gain.setValueAtTime(0.35, t);
      dg.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      d.connect(dg);
      dg.connect(ac.destination);
      d.start(t);
      d.stop(t + 0.07);
    }

    // Impact: A minor chord (A2 C3 E3 A3)
    const sting = now + 0.55;
    [220, 261, 330, 440].forEach(freq => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = 'triangle';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.22, sting);
      g.gain.exponentialRampToValueAtTime(0.001, sting + 1.8);
      o.connect(g);
      g.connect(ac.destination);
      o.start(sting);
      o.stop(sting + 2.0);
    });
  } catch (_) {}
}

// 4. Game end — victory fanfare or defeat sting
export function playGameEnd(crewmatesWin) {
  try {
    const ac = ctx();
    const now = ac.currentTime;

    if (crewmatesWin) {
      // Ascending C major arpeggio then sustained chord
      [
        { f: 261, t: 0 },
        { f: 329, t: 0.12 },
        { f: 392, t: 0.24 },
        { f: 523, t: 0.36 },
        { f: 659, t: 0.48 },
        { f: 784, t: 0.60 },
      ].forEach(({ f, t }) => {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = 'triangle';
        o.frequency.value = f;
        const s = now + t;
        g.gain.setValueAtTime(0, s);
        g.gain.linearRampToValueAtTime(0.25, s + 0.04);
        g.gain.linearRampToValueAtTime(0.15, s + 0.08);
        g.gain.linearRampToValueAtTime(0, s + 0.35);
        o.connect(g);
        g.connect(ac.destination);
        o.start(s);
        o.stop(s + 0.4);
      });

      // Held final chord (C5 E5 G5)
      [523, 659, 784].forEach(freq => {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = 'sine';
        o.frequency.value = freq;
        const s = now + 0.75;
        g.gain.setValueAtTime(0.18, s);
        g.gain.exponentialRampToValueAtTime(0.001, s + 2.5);
        o.connect(g);
        g.connect(ac.destination);
        o.start(s);
        o.stop(s + 2.6);
      });
    } else {
      // Descending minor scale (G4 → G3) then ominous low drone
      [
        { f: 392, t: 0 },
        { f: 370, t: 0.18 },
        { f: 311, t: 0.36 },
        { f: 261, t: 0.54 },
        { f: 220, t: 0.72 },
        { f: 196, t: 0.90 },
      ].forEach(({ f, t }) => {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = 'sawtooth';
        o.frequency.value = f;
        const s = now + t;
        g.gain.setValueAtTime(0, s);
        g.gain.linearRampToValueAtTime(0.2, s + 0.04);
        g.gain.linearRampToValueAtTime(0, s + 0.25);
        o.connect(g);
        g.connect(ac.destination);
        o.start(s);
        o.stop(s + 0.3);
      });

      // Low ominous drone fading in after the melody
      const drone = ac.createOscillator();
      const dg = ac.createGain();
      drone.type = 'sawtooth';
      drone.frequency.setValueAtTime(98, now + 1.1);
      drone.frequency.linearRampToValueAtTime(65, now + 3.5);
      dg.gain.setValueAtTime(0, now + 1.1);
      dg.gain.linearRampToValueAtTime(0.3, now + 1.3);
      dg.gain.linearRampToValueAtTime(0, now + 3.5);
      drone.connect(dg);
      dg.connect(ac.destination);
      drone.start(now + 1.1);
      drone.stop(now + 3.6);
    }
  } catch (_) {}
}

// 5. Room lock — heavy mechanical clunk (low thud + click)
export function playRoomLock() {
  try {
    const ac = ctx();
    const now = ac.currentTime;

    // Low sine thud: 80 → 30 Hz, fast attack, exponential decay
    const thud = ac.createOscillator();
    const tg = ac.createGain();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(80, now);
    thud.frequency.exponentialRampToValueAtTime(30, now + 0.4);
    tg.gain.setValueAtTime(0, now);
    tg.gain.linearRampToValueAtTime(0.7, now + 0.02);
    tg.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    thud.connect(tg);
    tg.connect(ac.destination);
    thud.start(now);
    thud.stop(now + 0.55);

    // Short metallic click overtone
    const click = ac.createOscillator();
    const cg = ac.createGain();
    click.type = 'square';
    click.frequency.setValueAtTime(400, now);
    cg.gain.setValueAtTime(0.15, now);
    cg.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    click.connect(cg);
    cg.connect(ac.destination);
    click.start(now);
    click.stop(now + 0.1);
  } catch (_) {}
}

// 6. Global lockdown alarm — rapid urgent sawtooth klaxon (12 pulses, ~2.2 s)
export function playGlobalLockdownAlarm() {
  try {
    const ac = ctx();
    const now = ac.currentTime;

    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sawtooth';

    // Alternate 1200 / 600 Hz every 0.18 s (12 pulses)
    const pattern = [1200, 600, 1200, 600, 1200, 600, 1200, 600, 1200, 600, 1200, 600];
    pattern.forEach((f, i) => {
      osc.frequency.setValueAtTime(f, now + i * 0.18);
    });

    gain.gain.setValueAtTime(0, now);
    for (let i = 0; i < 12; i++) {
      const t = now + i * 0.18;
      gain.gain.setValueAtTime(0.55, t);
      gain.gain.setValueAtTime(0.55, t + 0.13);
      gain.gain.linearRampToValueAtTime(0, t + 0.17);
    }

    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(now);
    osc.stop(now + 12 * 0.18 + 0.1);
  } catch (_) {}
}
