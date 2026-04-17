import { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import HoldButton from './HoldButton';

export default function TaskList({ tasks, gameCode, isAlive, aliveDuration, deadDuration, hideFakeBadge }) {
  const { t } = useLanguage();
  const [activeTaskId, setActiveTaskId] = useState(null);

  if (!tasks || tasks.length === 0) {
    return <div className="no-tasks">{t('noTasksAssigned')}</div>;
  }

  const holdDuration = isAlive ? (aliveDuration ?? 20000) : (deadDuration ?? 10000);

  return (
    <div className="task-list">
      {tasks.map(task => (
        <div key={task.id} className={`task-item ${task.completed ? 'task-done' : ''}`}>
          <div className="task-info">
            <div className="task-room">{task.room}</div>
            <div className="task-desc">{task.description}</div>
            {task.isFake && !hideFakeBadge && <div className="task-fake-badge">{t('fakeBadge')}</div>}
          </div>
          <HoldButton
            taskId={task.id}
            gameCode={gameCode}
            duration={holdDuration}
            completed={task.completed}
            disabled={activeTaskId !== null && activeTaskId !== task.id}
            onHoldStart={() => setActiveTaskId(task.id)}
            onHoldEnd={() => setActiveTaskId(null)}
          />
        </div>
      ))}
    </div>
  );
}
