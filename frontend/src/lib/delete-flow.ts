import type { StoreApi } from "./store-api";

/**
 * A confirm-before-delete dialog's state (D87): the row it is about, and the
 * last failure. The target is the object, not an id, so a refetch while the
 * dialog is open cannot make it disappear.
 */
export type DeleteFlow<T> = { pending: T | null; error: string | null };

export const IDLE_DELETE: DeleteFlow<never> = { pending: null, error: null };

/** Actions over the `delete` slice of any store whose state has one. */
export function deleteFlowActions<S extends { delete: DeleteFlow<T> }, T>({ setState }: StoreApi<S>) {
  return {
    beginDelete: (target: T) =>
      setState((state) => ({ ...state, delete: { pending: target, error: null } })),
    cancelDelete: () => setState((state) => ({ ...state, delete: { pending: null, error: null } })),
    /** Before each attempt, so a repeat failure with the same message still refocuses (D75). */
    clearDeleteError: () =>
      setState((state) => ({ ...state, delete: { ...state.delete, error: null } })),
    failDelete: (message: string) =>
      setState((state) => ({ ...state, delete: { ...state.delete, error: message } })),
  };
}
