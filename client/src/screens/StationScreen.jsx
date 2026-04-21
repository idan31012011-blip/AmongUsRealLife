import { useState, useEffect } from 'react';
import { useGame } from '../context/GameContext';
import { useLanguage } from '../context/LanguageContext';
import socket from '../socket';
import SimonSaysGame from './SimonSaysGame';
import StopTheBarGame from './StopTheBarGame';
import WireConnectGame from './WireConnectGame';

function CriticalCountdownTimer({ expiresAt }) {
  const [secs, setSecs] = useState(() => Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
  useEffect(() => {
    const tick = setInterval(() => {
      const s = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setSecs(s);
      if (s <= 0) clearInterval(tick);
    }, 250);
    return () => clearInterval(tick);
  }, [expiresAt]);
  return <div className="cc-overlay-timer">{secs}</div>;
}

export default function StationScreen() {
  const { state } = useGame();
  const { t } = useLanguage();
  const { gameCode, stationRoom, stationHasMeeting } = state;

  const [uiPhase, setUiPhase] = useState('idle'); // 'idle' | 'entry' | 'minigame' | 'success' | 'already_done'
  const [currentMiniGame, setCurrentMiniGame] = useState(null); // 'simon' | 'stopbar' | 'wireconnect'
  const [enteredCode, setEnteredCode] = useState('');
  const [currentPlayerId, setCurrentPlayerId] = useState(null);
  const [currentPlayerName, setCurrentPlayerName] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [abortCooldowns, setAbortCooldowns] = useState({}); // { playerId: expiresAt }

  // Critical countdown state (only populated on the designated station)
  const [criticalCode, setCriticalCode] = useState(null);
  const [ccEntered, setCcEntered] = useState('');
  const [ccError, setCcError] = useState(null);
  const [ccSubmitting, setCcSubmitting] = useState(false);

  const criticalCountdownActive = state.sabotage?.criticalCountdownActive ?? false;
  const criticalCountdownStationRoom = state.sabotage?.criticalCountdownStationRoom ?? null;

  const isRoomLocked = (state.sabotage?.lockedRooms ?? []).some(r => r.roomName === stationRoom)
    || (state.sabotage?.globalLockdownActive ?? false);

  useEffect(() => {
    function onCodeResult({ valid, reason, playerName, playerId, miniGame }) {
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
        setCurrentMiniGame(miniGame ?? 'simon');
        setUiPhase('minigame');
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

    function onCriticalCode({ criticalCode: code }) {
      setCriticalCode(code);
      setCcEntered('');
      setCcError(null);
      setCcSubmitting(false);
    }

    function onCriticalSuccess() {
      setCriticalCode(null);
      setCcEntered('');
      setCcError(null);
      setCcSubmitting(false);
    }

    function onCriticalWrongCode() {
      setCcError(t('criticalCountdownWrongCode'));
      setCcSubmitting(false);
      setCcEntered('');
    }

    socket.on('station_code_result', onCodeResult);
    socket.on('station_success', onSuccess);
    socket.on('critical_countdown_code', onCriticalCode);
    socket.on('critical_countdown_success', onCriticalSuccess);
    socket.on('critical_countdown_wrong_code', onCriticalWrongCode);
    return () => {
      socket.off('station_code_result', onCodeResult);
      socket.off('station_success', onSuccess);
      socket.off('critical_countdown_code', onCriticalCode);
      socket.off('critical_countdown_success', onCriticalSuccess);
      socket.off('critical_countdown_wrong_code', onCriticalWrongCode);
    };
  }, [t, abortCooldowns]);

  function pressCcDigit(digit) {
    if (ccEntered.length < 5) setCcEntered(c => c + digit);
  }

  function pressCcDelete() {
    setCcEntered(c => c.slice(0, -1));
  }

  function submitCriticalCode() {
    if (ccEntered.length !== 5 || ccSubmitting) return;
    setCcSubmitting(true);
    setCcError(null);
    socket.emit('critical_countdown_submit', { code: gameCode, enteredCode: ccEntered });
  }

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

  function handleMiniGameSuccess() {
    socket.emit('station_task_complete', { code: gameCode, playerId: currentPlayerId });
  }

  function abortMiniGame() {
    setAbortCooldowns(prev => ({ ...prev, [currentPlayerId]: Date.now() + 60000 }));
    setCurrentPlayerId(null);
    setCurrentPlayerName(null);
    setCurrentMiniGame(null);
    setUiPhase('idle');
    setEnteredCode('');
  }

  function callMeeting() {
    socket.emit('station_call_meeting', { code: gameCode });
  }

  // If this is the designated station during critical countdown, show code entry
  if (criticalCountdownActive && criticalCode !== null) {
    const expiresAt = state.sabotage?.criticalCountdownExpiresAt;
    return (
      <div className="screen station-screen cc-station-screen">
        <div className="cc-station-title">{t('criticalCountdownOverlayTitle')}</div>
        {expiresAt && <CriticalCountdownTimer expiresAt={expiresAt} />}
        <div className="cc-station-code-section">
          <p className="cc-station-code-label">{t('criticalCountdownCodePrompt')}</p>
          <div className="cc-code-display" dir="ltr">
            {criticalCode.split('').map((ch, i) => (
              <span key={i} className="cc-code-show-digit">{ch}</span>
            ))}
          </div>
        </div>
        <div className="cc-station-entry-section">
          <p className="cc-station-code-label">{t('criticalCountdownEntryPrompt')}</p>
          <div className="station-code-display" dir="ltr">
            {ccEntered.padEnd(5, '_').split('').map((ch, i) => (
              <span key={i} className={`station-code-digit cc-entry-digit ${ch !== '_' ? 'filled' : ''}`}>{ch}</span>
            ))}
          </div>
          {ccError && <div className="station-error">{ccError}</div>}
          <div className="station-keypad">
            {[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map((k, i) => (
              <button
                key={i}
                className={`station-key${k === '' ? ' station-key-empty' : ''}`}
                onClick={() => {
                  if (k === '⌫') pressCcDelete();
                  else if (k !== '') pressCcDigit(String(k));
                }}
                disabled={k === '' || ccSubmitting}
              >
                {k}
              </button>
            ))}
          </div>
          <button
            className="btn btn-red btn-large station-submit"
            onClick={submitCriticalCode}
            disabled={ccEntered.length !== 5 || ccSubmitting}
          >
            {t('criticalCountdownSubmit')}
          </button>
        </div>
      </div>
    );
  }

  // Non-designated station during critical countdown: show alert overlay
  if (criticalCountdownActive && criticalCode === null) {
    const expiresAt = state.sabotage?.criticalCountdownExpiresAt;
    return (
      <div className="screen station-screen cc-station-screen">
        <div className="cc-station-title">{t('criticalCountdownOverlayTitle')}</div>
        {expiresAt && <CriticalCountdownTimer expiresAt={expiresAt} />}
        <div className="cc-station-alert">
          {t('criticalCountdownStationAlert', criticalCountdownStationRoom ?? '?')}
        </div>
      </div>
    );
  }

  return (
    <div className="screen station-screen">
      <div className="station-room-title">{t('stationScreenTitle', stationRoom ?? '?')}</div>

      {stationHasMeeting && uiPhase === 'idle' && !isRoomLocked && (
        <button className="btn btn-red btn-large station-meeting-btn" onClick={callMeeting}>
          🚨 {t('stationMeetingBtn')}
        </button>
      )}

      {uiPhase === 'minigame' ? (
        <>
          {currentMiniGame === 'stopbar' && (
            <StopTheBarGame playerName={currentPlayerName} onSuccess={handleMiniGameSuccess} />
          )}
          {currentMiniGame === 'wireconnect' && (
            <WireConnectGame playerName={currentPlayerName} onSuccess={handleMiniGameSuccess} />
          )}
          {(currentMiniGame === 'simon' || !currentMiniGame) && (
            <SimonSaysGame playerName={currentPlayerName} onSuccess={handleMiniGameSuccess} />
          )}
          <button className="btn btn-ghost btn-small station-abort-btn" onClick={abortMiniGame}>
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
