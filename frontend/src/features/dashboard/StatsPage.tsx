
import { ButtonLink } from "../../components/ButtonLink";
import { ApiError } from "../../lib/api-error";
import { useTaskStats } from "../tasks/hooks/useTasks";
import type { TaskStatus } from "../tasks/types";
import { StatTile } from "./components/StatTile";
import { StatusDistributionBar } from "./components/StatusDistributionBar";

const STATUS_TILES: { status: TaskStatus; label: string; accent?: string }[] = [
  { status: "PENDING", label: "Pending" },
  { status: "IN_PROGRESS", label: "In progress", accent: "text-status-progress" },
  { status: "COMPLETED", label: "Completed", accent: "text-status-completed" },
  { status: "CANCELLED", label: "Cancelled" },
];

/** The statuses `due_next_7_days` counts: open ones only. */
const OPEN_STATUSES: TaskStatus[] = ["PENDING", "IN_PROGRESS"];

function isoDay(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString();
}

/**
 * Rendered in every state, so creating a task never waits on statistics. The
 * same ButtonLink as the task list's header; both dashboard roles
 * may create tasks.
 */
function DashboardHeader() {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
      <ButtonLink to="/tasks/new" className="ml-auto">
        New task
      </ButtonLink>
    </div>
  );
}

/**
 * Six figures from ONE `GET /tasks/stats/` call. The component does not branch on
 * role at all: the backend scopes the response, so a Supervisor sees global
 * numbers and an Operator sees their own through the same code.
 */
export function StatsPage() {
  const { data: stats, isPending, isError, error } = useTaskStats();

  if (isPending) {
    return (
      <section>
        <DashboardHeader />
        <p role="status" className="text-sm text-slate-500">
          Loading statistics…
        </p>
      </section>
    );
  }

  if (isError || stats === undefined) {
    return (
      <section>
        <DashboardHeader />
        <p role="alert" className="text-sm text-status-overdue">
          {error instanceof ApiError ? error.message : "Could not load statistics."}
        </p>
      </section>
    );
  }

  return (
    <section>
      <DashboardHeader />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile label="All tasks" value={stats.total} to="/tasks" />

        {STATUS_TILES.map(({ status, label, accent }) => (
          <StatTile
            key={status}
            label={label}
            value={stats.by_status[status]}
            accent={accent}
            to="/tasks"
            search={{ status: [status] }}
          />
        ))}

        <StatTile
          label="Overdue"
          value={stats.overdue}
          accent="text-status-overdue"
          to="/tasks"
          search={{ overdue: true }}
        />

        {/* wide: the six cards above divide evenly into 2 and 3 columns, so a
            full-row last card leaves no breakpoint with a lone narrow one (D42). */}
        <StatTile
          label="Due in 7 days"
          wide
          value={stats.due_next_7_days}
          to="/tasks"
          /**
           * The FULL predicate, not just a date bound. `due_next_7_days`
           * excludes nulls AND terminal statuses, so linking on
           * due_date_before alone would also pull in every past-due task and
           * every completed task with a due date — a list visibly larger than
           * the tile it came from, which reads as a bug.
           */
          search={{
            due_date_after: isoDay(0),
            due_date_before: isoDay(7),
            status: OPEN_STATUSES,
          }}
        />
      </div>

      <StatusDistributionBar stats={stats} />
    </section>
  );
}
