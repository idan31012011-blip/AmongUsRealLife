import { useState, useEffect } from 'react';
import { useGame } from '../context/GameContext';
import { useLanguage } from '../context/LanguageContext';
import socket from '../socket';
import SimonSaysGame from './SimonSaysGame';

export default function StationScreen() {
  const { state } = useGame();
  const { t } = useLanguage();
  const { gameCode, stationRoom, stationHasMeeting } = state;

  const [uiPhase, setUiPhase] = useState('idle'); // 'idle' | 'entry' | 'simon' | 'success' | 'already_done'
  const [enteredCode, setEnteredCode] = useState('');
  const [currentPlayerId, setCurrentPlayerId] = useState(null);
  const [currentPlayerName, setCurrentPlayerName] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [abortCooldowns, setAbortCooldowns] = useState({}); // { playerId: expiresAt }

  const isRoomLocked = (state.sabotage?.lockedRooms ?? []).some(r => r.roomName === stationRoom)
    || (state.sabotage?.globalLockdownActive ?? false);

  useEffect(() => {
    function onCodeResult({ valid, reason, playerName, playerId }) {
      if (valid) {
        const cooldownUntil = abortCooldowns[playerId] ?? 0;
        if (Date.now() < cooldownUntil) {
          const secs = Math.ceil((cooldownUntil - Date.now()) / 1000);
          setErrorMsg(t('simonAbortCooldown', secs));
          setEnteredCode('');
          setUiPhase('idle');
          return;
        }
        setCurrentPlayerName(playerName);
        setCurrentPlayerId(playerId);
        setUiPhase('simon');
        setErrorMsg(null);
      } else if (reason === 'already_completed') {
        setCurrentPlayerName(playerName);
        setUiPhase('already_done');
        setTimeout(() => { setUiPhase('idle'); setEnteredCode(''); }, 2500);
      } else if (reason === 'room_locked') {
        setErrorMsg(t('stationRoomLocked'));
        setEnteredCode('');
        setUiPhase('idle');
      } else {
        setErrorMsg(t('stationInvalidCode'));
        setEnteredCode('');
        setUiPhase('idle');
      }
    }

    function onSuccess({ playerName }) {
      setCurrentPlayerName(playerName);
      setUiPhase('success');
      setTimeout(() => { setUiPhase('idle'); setEnteredCode(''); setCurrentPlayerId(null); setCurrentPlayerName(null); }, 3000);
    }

    socket.on('station_code_result', onCodeResult);
    socket.on('station_success', onSuccess);
    return () => {
      socket.off('station_code_result', onCodeResult);
      socket.off('station_success', onSuccess);
    };
  }, [t, abortCooldowns]);

  function pressDigit(digit) {
    if (enteredCode.length < 3) setEnteredCode(c => c + digit);
  }

  function pressDelete() {
    setEnteredCode(c => c.slice(0, -1));
  }

  function submitCode() {
    if (enteredCode.length !== 3) return;
    setErrorMsg(null);
    setUiPhase('entry');
    socket.emit('station_validate_code', { code: gameCode, enteredCode });
  }

  function handleSimonSuccess() {
    socket.emit('station_task_complete', { code: gameCode, playerId: currentPlayerId });
  }

  function abortSimon() {
    setAbortCooldowns(prev => ({ ...prev, [currentPlayerId]: Date.now() + 60000 }));
    setCurrentPlayerId(null);
    setCurrentPlayerName(null);
    setUiPhase('idle');
    setEnteredCode('');
  }

  function callMeeting() {
    socket.emit('station_call_meeting', { code: gameCode });
  }

  return (
    <div className="screen station-screen">
      <div className="station-room-title">{t('stationScreenTitle', stationRoom ?? '?')}</div>

      {stationHasMeeting && uiPhase === 'idle' && !isRoomLocked && (
        <button className="btn btn-red btn-large station-meeting-btn" onClick={callMeeting}>
          🚨 {t('stationMeetingBtn')}
        </button>
      )}

      {uiPhase === 'simon' ? (
        <>
          <SimonSaysGame playerName={currentPlayerName} onSuccess={handleSimonSuccess} />
          <button className="btn btn-ghost btn-small station-abort-btn" onClick={abortSimon}>
            {t('simonAbortBtn')}
          </button>
        </>
      ) : uiPhase === 'success' ? (
        <div className="station-result station-result-success">
          <div className="station-result-icon">✓</div>
          <div className="station-result-text">{t('stationSuccessMsg', currentPlayerName)}</div>
        </div>
      ) : uiPhase === 'already_done' ? (
        <div className="station-result station-result-done">
          <div className="station-result-icon">✓</div>
          <div className="station-result-text">{t('stationAlreadyDone', currentPlayerName)}</div>
        </div>
      ) : isRoomLocked ? (
        <div className="station-locked-msg">
          <div className="station-locked-icon">🔒</div>
          <div className="station-locked-text">{t('stationRoomLocked')}</div>
        </div>
      ) : (
        <div className="station-entry">
          <p className="station-prompt">{t('stationEnterCode')}</p>
          <div className="station-code-display">
            {enteredCode.padEnd(3, '_').split('').map((ch, i) => (
              <span key={i} className={`station-code-digit ${ch !== '_' ? 'filled' : ''}`}>{ch}</span>
            ))}
          </div>
          {errorMsg && <div className="station-error">{errorMsg}</div>}
          <div className="station-keypad">
            {[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map((k, i) => (
              <button
                key={i}
                className={`station-key${k === '' ? ' station-key-empty' : ''}`}
                onClick={() => {
                  if (k === '⌫') pressDelete();
                  else if (k !== '') pressDigit(String(k));
                }}
                disabled={k === '' || uiPhase === 'entry'}
              >
                {k}
              </button>
            ))}
          </div>
          <button
            className="btn btn-blue btn-large station-submit"
            onClick={submitCode}
            disabled={enteredCode.length !== 3 || uiPhase === 'entry'}
          >
            {t('stationSubmitCode')}
          </button>
        </div>
      )}
    </div>
  );
}
