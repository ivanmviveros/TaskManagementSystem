import type { UserMinimal } from "../users/types";
import type { TaskDetail, TaskStatus } from "./types";

/** What the task form edits: shaped for its inputs, not for the API. */
export type TaskFormDraft = {
  title: string;
  description: string;
  /** "yyyy-mm-dd", or "" for no deadline: what <input type="date"> holds. */
  due_date: string;
  /** The whole user, not an id: the picker loads a page at a time (D64). */
  assignee: UserMinimal | null;
  status: TaskStatus;
};

/** What TaskForm hands its page: the API's shape. */
export interface TaskFormValues {
  title: string;
  description: string;
  due_date: string | null;
  /**
   * Absent when the actor may not choose an assignee (an Operator, D15/D16);
   * null means "unassigned". The two must stay distinct: the API reads an
   * omitted assignee as "leave it / default it" and null as "unassign" (D32).
   */
  assignee?: string | null;
  status?: TaskStatus;
}

/**
 * D40/D81: ONE snapshot, taken when the form opens. It seeds the draft and
 * drives the status field: the options, the read-only switch and the "did the
 * user change it?" check. The detail query refetches (30 s staleTime, refetch on
 * focus) and none of these may follow it — options from the select's own value
 * would drop the original status after a change; read-only from the live task
 * could strand a changed value; comparing with the live status would silently
 * undo a change someone else made meanwhile.
 */
export interface TaskSnapshot {
  defaults: TaskFormDraft;
  initialStatus: TaskStatus | undefined;
  initialTransitions: TaskStatus[];
}

/**
 * The form's one snapshot (D81): the draft's defaults plus the status baseline
 * (D40). A due date is seeded as the ISO string's UTC day (D76).
 */
export function taskSnapshot(task: TaskDetail | undefined): TaskSnapshot {
  return {
    defaults: {
      title: task?.title ?? "",
      description: task?.description ?? "",
      due_date: task?.due_date?.slice(0, 10) ?? "",
      assignee: task?.assignee ?? null,
      status: task?.status ?? "PENDING",
    },
    initialStatus: task?.status,
    initialTransitions: task?.allowed_transitions ?? [],
  };
}

/**
 * The draft as the page passes it on (toward TaskCreateInput / TaskUpdateInput):
 * a day goes out as noon UTC (D76), the assignee only when the actor may choose
 * one (D32), the status only on an edit that changed it (D40).
 */
export function toTaskInput(
  draft: TaskFormDraft,
  {
    canChooseAssignee,
    isEdit,
    initialStatus,
  }: { canChooseAssignee: boolean; isEdit: boolean; initialStatus: TaskStatus | undefined },
): TaskFormValues {
  return {
    title: draft.title,
    description: draft.description,
    due_date: draft.due_date === "" ? null : new Date(`${draft.due_date}T12:00:00Z`).toISOString(),
    ...(canChooseAssignee ? { assignee: draft.assignee?.id ?? null } : {}),
    // Sent only when the user changed it (D40). TaskEditPage omits an undefined
    // status from the PATCH.
    ...(isEdit && draft.status !== initialStatus ? { status: draft.status } : {}),
  };
}
