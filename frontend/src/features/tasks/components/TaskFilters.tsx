import { Button } from "../../../components/Button";
import { useSearchParamDraft } from "../../../lib/useSearchParamDraft";
import { STATUS_LABEL } from "./StatusBadge";
import type { TaskFilters as Filters, TaskStatus } from "../types";

const STATUSES: TaskStatus[] = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

/** What this panel edits. Paging and ordering belong to the list. */
export type FilterPatch = Partial<
  Pick<Filters, "status" | "due_date_after" | "due_date_before" | "overdue">
>;

interface TaskFiltersProps {
  filters: Filters;
  /** A patch, not a snapshot: a draft commits up to 300 ms later (D46). */
  onChange: (patch: FilterPatch) => void;
  onClear: () => void;
}

/** "" clears the bound; otherwise the day at `time`, in UTC, as before. */
function toBound(day: string, time: string): string | undefined {
  return day === "" ? undefined : new Date(`${day}T${time}Z`).toISOString();
}

export function TaskFilters({ filters, onChange, onClear }: TaskFiltersProps) {
  const selected = filters.status ?? [];
  // Drafts, not the URL directly: a date typed digit by digit would be
  // reverted mid-entry by the router's transition (D50).
  const after = useSearchParamDraft(filters.due_date_after?.slice(0, 10) ?? "", (day) =>
    onChange({ due_date_after: toBound(day, "00:00:00") }),
  );
  const before = useSearchParamDraft(filters.due_date_before?.slice(0, 10) ?? "", (day) =>
    onChange({ due_date_before: toBound(day, "23:59:59") }),
  );

  function toggleStatus(status: TaskStatus) {
    const next = selected.includes(status)
      ? selected.filter((value) => value !== status)
      : [...selected, status];
    onChange({ status: next.length === 0 ? undefined : next });
  }

  function clear() {
    // A pending date commit would otherwise land after the clear and bring
    // the date back.
    after.cancel();
    before.cancel();
    onClear();
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
            value={after.draft}
            onChange={(event) => after.setDraft(event.target.value)}
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
            value={before.draft}
            onChange={(event) => before.setDraft(event.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <label className="flex items-center gap-1.5 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={filters.overdue === true}
            onChange={(event) => onChange({ overdue: event.target.checked ? true : undefined })}
          />
          Overdue only
        </label>
        <Button variant="secondary" onClick={clear} className="sm:ml-auto">
          Clear filters
        </Button>
      </div>
    </section>
  );
}
