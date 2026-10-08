import { useSelector } from "@tanstack/react-form";
import { useId, useState } from "react";

import { Button } from "../../../components/Button";
import { useAppForm } from "../../../components/form/app-form";
import { useUrlFieldSync } from "../../../lib/useUrlFieldSync";
import { TASK_STATUSES, type TaskFilters as Filters, type TaskStatus } from "../types";
import { STATUS_LABEL } from "./StatusBadge";

/** What this panel edits. Paging and ordering belong to the list. */
export type FilterPatch = Partial<
  Pick<Filters, "status" | "due_date_after" | "due_date_before" | "overdue">
>;

interface TaskFiltersProps {
  filters: Filters;
  /** A patch, not a snapshot: a date commits up to 300 ms later (D46). */
  onChange: (patch: FilterPatch) => void;
  onClear: () => void;
}

/** The panel's fields, shaped for its inputs. Dates are "yyyy-mm-dd" or "". */
type FilterDraft = {
  status: TaskStatus[];
  due_date_after: string;
  due_date_before: string;
  overdue: boolean;
};

const STATUS_OPTIONS = TASK_STATUSES.map((status) => ({
  value: status,
  label: STATUS_LABEL[status],
}));
const NO_STATUSES: TaskStatus[] = [];

/** "" clears the bound; otherwise the day at `time`, in UTC, as before. */
function toBound(day: string, time: string): string | undefined {
  return day === "" ? undefined : new Date(`${day}T${time}Z`).toISOString();
}

function sameStatuses(a: TaskStatus[], b: TaskStatus[]): boolean {
  return a.length === b.length && a.every((status, index) => status === b[index]);
}

export function TaskFilters({ filters, onChange, onClear }: TaskFiltersProps) {
  const committed: FilterDraft = {
    status: filters.status ?? NO_STATUSES,
    due_date_after: filters.due_date_after?.slice(0, 10) ?? "",
    due_date_before: filters.due_date_before?.slice(0, 10) ?? "",
    overdue: filters.overdue === true,
  };
  // D81: the URL as it was on mount. After that, useUrlFieldSync carries every
  // URL change into the fields — one path, not two.
  const [defaults] = useState(() => committed);
  const form = useAppForm({ defaultValues: defaults });

  const status = useUrlFieldSync({
    committed: committed.status,
    commit: (next: TaskStatus[]) => onChange({ status: next.length === 0 ? undefined : next }),
    write: (value) => form.setFieldValue("status", value, { dontRunListeners: true }),
    delayMs: 0,
    equals: sameStatuses,
  });
  // Dates go through a 300 ms quiet period: a date typed digit by digit would
  // otherwise be reverted mid-entry by the router's transition (D50).
  const after = useUrlFieldSync({
    committed: committed.due_date_after,
    commit: (day: string) => onChange({ due_date_after: toBound(day, "00:00:00") }),
    write: (value) => form.setFieldValue("due_date_after", value, { dontRunListeners: true }),
  });
  const before = useUrlFieldSync({
    committed: committed.due_date_before,
    commit: (day: string) => onChange({ due_date_before: toBound(day, "23:59:59") }),
    write: (value) => form.setFieldValue("due_date_before", value, { dontRunListeners: true }),
  });
  const overdue = useUrlFieldSync({
    committed: committed.overdue,
    commit: (on: boolean) => onChange({ overdue: on ? true : undefined }),
    write: (value) => form.setFieldValue("overdue", value, { dontRunListeners: true }),
    delayMs: 0,
  });

  const afterDay = useSelector(form.store, (state) => state.values.due_date_after);
  const beforeDay = useSelector(form.store, (state) => state.values.due_date_before);
  // D78: explained, not prevented — the URL keeps what was entered (D45). ISO
  // days compare correctly as strings.
  const inverted = afterDay !== "" && beforeDay !== "" && afterDay > beforeDay;
  const rangeErrorId = useId();

  function clear() {
    // A pending date commit would otherwise land after the clear and bring the
    // date back.
    status.cancel();
    after.cancel();
    before.cancel();
    overdue.cancel();
    // cancel() puts back the URL's value from before any write still in
    // flight. Clear empties every filter, so put the cleared values straight
    // in: otherwise a box unchecked just before Clear would be put back to
    // checked, and the cleared URL would then match the queued uncheck as its
    // own echo and leave it that way.
    form.setFieldValue("status", NO_STATUSES, { dontRunListeners: true });
    form.setFieldValue("due_date_after", "", { dontRunListeners: true });
    form.setFieldValue("due_date_before", "", { dontRunListeners: true });
    form.setFieldValue("overdue", false, { dontRunListeners: true });
    onClear();
  }

  return (
    <section aria-label="Filters" className="mb-4 rounded-lg bg-white p-4 shadow-sm">
      <form.AppField name="status" listeners={{ onChange: ({ value }) => status.onChange(value) }}>
        {(field) => <field.CheckboxGroupField legend="Status" options={STATUS_OPTIONS} />}
      </form.AppField>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <form.AppField
          name="due_date_after"
          listeners={{ onChange: ({ value }) => after.onChange(value) }}
        >
          {(field) => (
            <field.TextField
              id="due-after"
              label="Due after"
              type="date"
              density="compact"
              max={beforeDay || undefined}
              aria-describedby={inverted ? rangeErrorId : undefined}
            />
          )}
        </form.AppField>
        <form.AppField
          name="due_date_before"
          listeners={{ onChange: ({ value }) => before.onChange(value) }}
        >
          {(field) => (
            <field.TextField
              id="due-before"
              label="Due before"
              type="date"
              density="compact"
              min={afterDay || undefined}
              aria-invalid={inverted || undefined}
              aria-describedby={inverted ? rangeErrorId : undefined}
            />
          )}
        </form.AppField>
        <form.AppField name="overdue" listeners={{ onChange: ({ value }) => overdue.onChange(value) }}>
          {(field) => <field.CheckboxField label="Overdue only" density="compact" />}
        </form.AppField>
        <Button variant="secondary" onClick={clear} className="sm:ml-auto">
          Clear filters
        </Button>
      </div>
      {/* Always mounted: a live region is announced reliably only if it exists
          before its text changes. Not role="alert" (focus lookups use it). */}
      <p
        id={rangeErrorId}
        aria-live="polite"
        className={inverted ? "mt-2 text-sm text-status-overdue" : undefined}
      >
        {inverted ? (
          <>
            &ldquo;Due after&rdquo; is later than &ldquo;Due before&rdquo;, so no task can match.
          </>
        ) : null}
      </p>
    </section>
  );
}
