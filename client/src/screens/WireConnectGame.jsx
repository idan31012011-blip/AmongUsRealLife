import { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';

const COLORS = ['red', 'blue', 'green', 'yellow'];
const COLOR_STROKE = { red: '#e8294a', blue: '#1a7fe0', green: '#1db954', yellow: '#f0c030' };

const PEG_D  = 56;
const V_GAP  = 16;
const STRIDE = PEG_D + V_GAP;          // 72
const BOARD_W = 280;
const BOARD_H = COLORS.length * PEG_D + (COLORS.length - 1) * V_GAP; // 272

const pegCY = (i) => i * STRIDE + PEG_D / 2;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function WireConnectGame({ playerName, onSuccess }) {
  const { t } = useLanguage();
  const [rightOrder] = useState(() => shuffle(COLORS));
  const [connections, setConnections] = useState({});  // leftColor → rightColor (always same)
  const [selected, setSelected] = useState(null);
  const [wrongAnim, setWrongAnim] = useState(null);

  const connectedRights = new Set(Object.values(connections));

  function handleLeft(color) {
    if (connections[color]) return;
    setSelected(prev => (prev === color ? null : color));
  }

  function handleRight(color) {
    if (!selected || connectedRights.has(color)) return;
    if (color === selected) {
      const next = { ...connections, [selected]: color };
      setConnections(next);
      setSelected(null);
      if (Object.keys(next).length === COLORS.length) setTimeout(onSuccess, 600);
    } else {
      setWrongAnim(selected);
      setTimeout(() => setWrongAnim(null), 350);
      setSelected(null);
    }
  }

  return (
    <div className="wire-game">
      <div className="simon-for">{t('simonPlayingFor', playerName)}</div>
      <div className="wire-instruction">{t('wireInstruction')}</div>
      <div className="wire-board" style={{ width: BOARD_W, height: BOARD_H }}>

        {/* Left pegs */}
        {COLORS.map((color, i) => (
          <button
            key={`L-${color}`}
            className={`wire-peg wire-peg-${color}${selected === color ? ' wire-selected' : ''}${connections[color] ? ' wire-done' : ''}${wrongAnim === color ? ' wire-wrong' : ''}`}
            style={{ left: 0, top: i * STRIDE, width: PEG_D, height: PEG_D }}
            onPointerDown={() => handleLeft(color)}
            disabled={!!connections[color]}
          />
        ))}

        {/* SVG wire lines */}
        <svg
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
          width={BOARD_W}
          height={BOARD_H}
        >
          {Object.keys(connections).map(color => {
            const leftIdx  = COLORS.indexOf(color);
            const rightIdx = rightOrder.indexOf(color);
            return (
              <line
                key={color}
                x1={PEG_D} y1={pegCY(leftIdx)}
                x2={BOARD_W - PEG_D} y2={pegCY(rightIdx)}
                stroke={COLOR_STROKE[color]}
                strokeWidth={5}
                strokeLinecap="round"
              />
            );
          })}
        </svg>

        {/* Right pegs */}
        {rightOrder.map((color, i) => (
          <button
            key={`R-${color}`}
            className={`wire-peg wire-peg-${color}${connectedRights.has(color) ? ' wire-done' : ''}${selected && !connectedRights.has(color) ? ' wire-available' : ''}`}
            style={{ right: 0, top: i * STRIDE, width: PEG_D, height: PEG_D }}
            onPointerDown={() => handleRight(color)}
            disabled={connectedRights.has(color)}
          />
        ))}
      </div>
    </div>
  );
}
