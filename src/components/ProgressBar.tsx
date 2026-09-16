interface Props {
  value: number | ""; // fraction 0-1, same shape as percentActual()
}

// Renders % Actual Complete as a filled bar instead of a bare number -
// used both in the editable Production Schedule table and the printed
// report, so the two stay visually consistent.
export default function ProgressBar({ value }: Props) {
  if (value === "") return <span className="progress-empty">—</span>;
  const pct = Math.max(0, Math.min(100, Number(value) * 100));
  return (
    <div className="progress-cell" title={`${pct.toFixed(1)}%`}>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="progress-text">{pct.toFixed(1)}%</span>
    </div>
  );
}
