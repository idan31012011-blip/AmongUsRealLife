import { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useGame } from '../context/GameContext';
import HoldButton from './HoldButton';
import Modal from './Modal';

export default function TaskList({ tasks, gameCode, isAlive, aliveDuration, deadDuration, hideFakeBadge }) {
  const { t } = useLanguage();
  const { state } = useGame();
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [showCode, setShowCode] = useState(false);

  if (!tasks || tasks.length === 0) {
    return <div className="no-tasks">{t('noTasksAssigned')}</div>;
  }

  const holdDuration = isAlive ? (aliveDuration ?? 20000) : (deadDuration ?? 10000);
  const lockedRoomNames = new Set((state.sabotage?.lockedRooms ?? []).map(r => r.roomName));
  const globalLockdown = state.sabotage?.globalLockdownActive ?? false;

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
    </>
  );
}
