import { useEffect, useState } from 'react';
import { useGame } from '../context/GameContext';
import { playEmergencyAlarm } from '../sounds';

function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 65%, 55%)`;
}

export default function MeetingAnimationScreen() {
  const { state, dispatch } = useGame();
  const { players, lastMeeting } = state;
  const [stage, setStage] = useState(0); // 0=slam, 1=players, 2=done

  useEffect(() => {
    playEmergencyAlarm();
    // Stage 1: title slams in immediately
    // Stage 2: players appear after 0.6s
    const t1 = setTimeout(() => setStage(1), 600);
    // Stage 3: player icons all visible after 1.4s
    const t2 = setTimeout(() => setStage(2), 1400);
    // Transition to voting after 3.5s
    const t3 = setTimeout(() => {
      dispatch({ type: 'SHOW_VOTING' });
    }, 3500);

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [dispatch]);

  const isEmergency = lastMeeting?.reason === 'emergency';

  return (
    <div className="screen meeting-screen">
      <div className={`meeting-title-wrap ${stage >= 0 ? 'meeting-slam' : ''}`}>
        <div className="meeting-siren">🚨</div>
        <h1 className="meeting-title">EMERGENCY<br />MEETING</h1>
        <p className="meeting-caller">
          {isEmergency
            ? `${lastMeeting.reporterName} called an emergency meeting!`
            : `${lastMeeting?.reporterName} found ${lastMeeting?.bodyName}'s body!`}
        </p>
      </div>

      <div className="meeting-players">
        {players.map((p, i) => (
          <div
            key={p.id}
            className={`meeting-player-dot ${!p.isAlive ? 'meeting-player-dead' : ''} ${stage >= 1 ? 'meeting-player-appear' : ''}`}
            style={{
              animationDelay: stage >= 1 ? `${i * 80}ms` : '0ms',
              background: p.isAlive ? stringToColor(p.name) : undefined,
            }}
          >
            <div className="meeting-player-avatar">
              {p.isAlive ? p.name[0].toUpperCase() : '💀'}
            </div>
            <div className="meeting-player-name">{p.name}</div>
          </div>
        ))}
      </div>

      <div className="meeting-footer">
        <div className="meeting-dots">
          <span className="meeting-dot-pulse" />
          <span className="meeting-dot-pulse" style={{ animationDelay: '0.2s' }} />
          <span className="meeting-dot-pulse" style={{ animationDelay: '0.4s' }} />
        </div>
        <p className="meeting-sub">Gathering the crew…</p>
      </div>
    </div>
  );
}
