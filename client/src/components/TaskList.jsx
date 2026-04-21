import { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useGame } from '../context/GameContext';
import HoldButton from './HoldButton';
import Modal from './Modal';
import socket from '../socket';
import FileReadingGame from '../screens/FileReadingGame';
import { FILE_READING_QUESTIONS } from '../data/fileReadingQuestions';

function pickRandomQuestion() {
  return Math.floor(Math.random() * FILE_READING_QUESTIONS.length);
}

export default function TaskList({ tasks, gameCode, isAlive, aliveDuration, deadDuration, hideFakeBadge }) {
  const { t } = useLanguage();
  const { state } = useGame();
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [showCode, setShowCode] = useState(false);

  // File reading task state — all client-side
  const [frState, setFrState] = useState({
    questionIndex: pickRandomQuestion(),
    timerExpiresAt: null,      // null = no active timer
    penaltyCooldownUntil: null, // null = no penalty
    tabOpen: false,
  });
  // Force re-renders every second so penalty countdown display updates
  const [, setTick] = useState(0);

  const settings = state.settings;
  const timerDuration = settings.fileReadingTimerDuration ?? 90000;
  const penaltyDuration = settings.fileReadingPenaltyCooldown ?? 30000;

  const frTask = tasks?.find(task => task.type === 'file_reading');

  // Watch for timer expiry — when it fires, rotate question and close tab (no penalty)
  useEffect(() => {
    if (!frState.timerExpiresAt || frTask?.completed) return;
    const interval = setInterval(() => {
      if (Date.now() >= frState.timerExpiresAt) {
        setFrState(s => ({
          ...s,
          questionIndex: pickRandomQuestion(),
          timerExpiresAt: null,
          tabOpen: false,
        }));
      }
    }, 500);
    return () => clearInterval(interval);
  }, [frState.timerExpiresAt, frTask?.completed]);

  // Tick for penalty countdown display
  useEffect(() => {
    if (!frState.penaltyCooldownUntil) return;
    const interval = setInterval(() => {
      if (Date.now() >= frState.penaltyCooldownUntil) {
        setFrState(s => ({ ...s, penaltyCooldownUntil: null }));
        clearInterval(interval);
      } else {
        setTick(n => n + 1);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [frState.penaltyCooldownUntil]);

  const openFileReading = useCallback(() => {
    if (!frTask || frTask.completed) return;
    const now = Date.now();
    if (frState.penaltyCooldownUntil && now < frState.penaltyCooldownUntil) return;

    if (!frState.timerExpiresAt || now >= frState.timerExpiresAt) {
      // Start fresh timer with current question
      setFrState(s => ({
        ...s,
        timerExpiresAt: now + timerDuration,
        tabOpen: true,
      }));
    } else {
      // Timer still running — just reopen tab
      setFrState(s => ({ ...s, tabOpen: true }));
    }
  }, [frTask, frState.penaltyCooldownUntil, frState.timerExpiresAt, timerDuration]);

  function handleFrCorrect() {
    socket.emit('complete_task', { code: gameCode, taskId: frTask.id });
    setFrState(s => ({ ...s, tabOpen: false, timerExpiresAt: null }));
  }

  function handleFrWrong() {
    const now = Date.now();
    setFrState(s => ({
      ...s,
      questionIndex: pickRandomQuestion(),
      timerExpiresAt: null,
      penaltyCooldownUntil: now + penaltyDuration,
      tabOpen: false,
    }));
  }

  function handleFrClose() {
    setFrState(s => ({ ...s, tabOpen: false }));
  }

  if (!tasks || tasks.length === 0) {
    return <div className="no-tasks">{t('noTasksAssigned')}</div>;
  }

  const holdDuration = isAlive ? (aliveDuration ?? 20000) : (deadDuration ?? 10000);
  const lockedRoomNames = new Set((state.sabotage?.lockedRooms ?? []).map(r => r.roomName));
  const globalLockdown = state.sabotage?.globalLockdownActive ?? false;

  const now = Date.now();
  const penaltySecs = frState.penaltyCooldownUntil
    ? Math.max(0, Math.ceil((frState.penaltyCooldownUntil - now) / 1000))
    : 0;
  const penaltyActive = penaltySecs > 0;

  return (
    <>
      {state.myCode && (
        <div className="view-code-bar">
          <button className="btn btn-ghost btn-small" onClick={() => setShowCode(true)}>
            {t('viewCodeBtn')}
          </button>
        </div>
      )}

      <div className="task-list">
        {tasks.map(task => {
          const taskLocked = !task.completed && (lockedRoomNames.has(task.room) || globalLockdown);

          if (task.type === 'file_reading') {
            return (
              <div key={task.id} className={`task-item ${task.completed ? 'task-done' : ''}`}>
                <div className="task-info">
                  <div className="task-room">—</div>
                  <div className="task-desc">{task.description}</div>
                  {task.isFake && !hideFakeBadge && <div className="task-fake-badge">{t('fakeBadge')}</div>}
                </div>
                {task.completed ? (
                  <div className="fr-task-btn fr-task-done">✓</div>
                ) : penaltyActive ? (
                  <div className="fr-task-btn fr-task-penalty">
                    {t('fileReadingPenaltyWait', penaltySecs)}
                  </div>
                ) : (
                  <button className="fr-task-btn fr-task-open" onClick={openFileReading}>
                    📄 {t('fileReadingOpenBtn')}
                  </button>
                )}
              </div>
            );
          }

          return (
            <div key={task.id} className={`task-item ${task.completed ? 'task-done' : ''}`}>
              <div className="task-info">
                <div className="task-room">{task.room}</div>
                <div className="task-desc">{task.description}</div>
                {task.isFake && !hideFakeBadge && <div className="task-fake-badge">{t('fakeBadge')}</div>}
              </div>
              {task.type === 'station' ? (
                <div className="station-task-badge">
                  {task.completed
                    ? <span className="station-task-done">✓</span>
                    : taskLocked
                      ? <span className="station-task-locked">🔒</span>
                      : <span className="station-task-info">{t('stationTaskInfo')}</span>
                  }
                </div>
              ) : (
                <HoldButton
                  taskId={task.id}
                  gameCode={gameCode}
                  duration={holdDuration}
                  completed={task.completed}
                  locked={taskLocked}
                  disabled={activeTaskId !== null && activeTaskId !== task.id}
                  onHoldStart={() => setActiveTaskId(task.id)}
                  onHoldEnd={() => setActiveTaskId(null)}
                />
              )}
            </div>
          );
        })}
      </div>

      {showCode && (
        <Modal title={t('yourCodeTitle')} onClose={() => setShowCode(false)}>
          <div className="code-reveal">
            <div className="code-reveal-digits">{state.myCode}</div>
            <p className="code-reveal-hint">{t('yourCodeHint')}</p>
          </div>
        </Modal>
      )}

      {frState.tabOpen && frTask && !frTask.completed && (
        <FileReadingGame
          question={FILE_READING_QUESTIONS[frState.questionIndex]}
          timerExpiresAt={frState.timerExpiresAt}
          timerDuration={timerDuration}
          onCorrect={handleFrCorrect}
          onWrong={handleFrWrong}
          onClose={handleFrClose}
        />
      )}
    </>
  );
}
