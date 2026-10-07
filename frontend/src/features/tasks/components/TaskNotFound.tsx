import type { TaskListSearch } from "../../../app/search-params";
import { NotFoundPanel } from "../../../components/NotFoundPanel";

/**
 * A task 404 never says WHY (D72): "deleted" and "not yours" must read the same,
 * or the message would confirm the row exists (spec §7.2 rule 5).
 */
export function TaskNotFound({ backSearch }: { backSearch: TaskListSearch }) {
  return (
    <NotFoundPanel
      title="Task not found"
      message="It may have been deleted, or it isn't assigned to you."
      linkTo="/tasks"
      linkLabel="Back to tasks"
      linkSearch={backSearch}
    />
  );
}
