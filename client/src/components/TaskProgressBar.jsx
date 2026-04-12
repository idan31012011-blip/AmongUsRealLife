/**
 * Global task progress bar shown at the top of GameScreen.
 * Props: percent (0–100)
 */
export default function TaskProgressBar({ percent }) {
  return (
    <div className="progress-bar-wrap">
      <div className="progress-bar-label">
        <span>Tasks</span>
        <span>{Math.round(percent)}%</span>
      </div>
      <div className="progress-bar-track">
        <div
          className="progress-bar-fill"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
