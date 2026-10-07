/**
 * A due date as the UTC calendar day — exactly the day TaskForm edits
 * (`due_date.slice(0, 10)`) and stores as noon UTC — with no time (D76). Local
 * formatting showed an invented time on the detail page, and shifts the day for
 * viewers far enough from UTC.
 *
 * Only for due dates: created_at and completed_at are real moments and stay in
 * local time.
 */
export function formatDueDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { timeZone: "UTC" });
}
