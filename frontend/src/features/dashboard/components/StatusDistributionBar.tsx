import type { TaskStats, TaskStatus } from "../../tasks/types";

const SEGMENTS: { status: TaskStatus; label: string; className: string }[] = [
  { status: "PENDING", label: "Pending", className: "bg-status-pending" },
  { status: "IN_PROGRESS", label: "In progress", className: "bg-status-progress" },
  { status: "COMPLETED", label: "Completed", className: "bg-status-completed" },
  { status: "CANCELLED", label: "Cancelled", className: "bg-status-cancelled" },
];

/**
 * A CSS-grid distribution bar rather than a charting library (D7): the dashboard
 * presents six numbers, and Recharts would be a dependency for one bar.
 */
export function StatusDistributionBar({ stats }: { stats: TaskStats }) {
  // Guard the divisor: an all-zero response must render an empty bar, not NaN.
  const total = stats.total;
  return (
    <section aria-label="Status distribution" className="rounded-lg bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-medium text-slate-600">Status distribution</h2>
      {total === 0 ? (
        <p className="text-sm text-slate-500">No tasks yet.</p>
      ) : (
        <>
          <div className="flex h-4 overflow-hidden rounded-full">
            {SEGMENTS.map(({ status, label, className }) => {
              const count = stats.by_status[status];
              if (count === 0) return null;
              return (
                <div
                  key={status}
                  className={className}
                  style={{ width: `${(count / total) * 100}%` }}
                  role="img"
                  aria-label={`${label}: ${count} of ${total}`}
                />
              );
            })}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
            {SEGMENTS.map(({ status, label, className }) => (
              <li key={status} className="flex items-center gap-1.5">
                <span className={`inline-block h-3 w-3 rounded-sm ${className}`} aria-hidden />
                {label}: {stats.by_status[status]}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
