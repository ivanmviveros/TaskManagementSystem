import { Button } from "../../../components/Button";
import { STATUS_LABEL } from "./StatusBadge";
import type { TaskFilters as Filters, TaskStatus } from "../types";

const STATUSES: TaskStatus[] = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

interface TaskFiltersProps {
  filters: Filters;
  onChange: (next: Filters) => void;
}

export function TaskFilters({ filters, onChange }: TaskFiltersProps) {
  const selected = filters.status ?? [];

  function toggleStatus(status: TaskStatus) {
    const next = selected.includes(status)
      ? selected.filter((value) => value !== status)
      : [...selected, status];
    onChange({ ...filters, status: next.length === 0 ? undefined : next });
  }

  return (
    <section aria-label="Filters" className="mb-4 rounded-lg bg-white p-4 shadow-sm">
      <fieldset className="mb-3">
        <legend className="mb-2 text-sm font-medium text-slate-700">Status</legend>
        <div className="flex flex-wrap gap-3">
          {STATUSES.map((status) => (
            <label key={status} className="flex items-center gap-1.5 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={selected.includes(status)}
                onChange={() => toggleStatus(status)}
              />
              {STATUS_LABEL[status]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div>
          <label htmlFor="due-after" className="mb-1 block text-sm font-medium text-slate-700">
            Due after
          </label>
          <input
            id="due-after"
            type="date"
            value={filters.due_date_after?.slice(0, 10) ?? ""}
            onChange={(event) =>
              onChange({
                ...filters,
                due_date_after:
                  event.target.value === ""
                    ? undefined
                    : new Date(`${event.target.value}T00:00:00Z`).toISOString(),
              })
            }
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="due-before" className="mb-1 block text-sm font-medium text-slate-700">
            Due before
          </label>
          <input
            id="due-before"
            type="date"
            value={filters.due_date_before?.slice(0, 10) ?? ""}
            onChange={(event) =>
              onChange({
                ...filters,
                due_date_before:
                  event.target.value === ""
                    ? undefined
                    : new Date(`${event.target.value}T23:59:59Z`).toISOString(),
              })
            }
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <label className="flex items-center gap-1.5 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={filters.overdue === true}
            onChange={(event) =>
              onChange({ ...filters, overdue: event.target.checked ? true : undefined })
            }
          />
          Overdue only
        </label>
        <Button variant="secondary" onClick={() => onChange({})} className="sm:ml-auto">
          Clear filters
        </Button>
      </div>
    </section>
  );
}
