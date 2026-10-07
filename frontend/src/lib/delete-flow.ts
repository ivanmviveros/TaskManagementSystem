import type { StoreApi } from "./store-api";

/**
 * A confirm-before-delete dialog's state (D87): the row it is about, and the
 * last failure. The target is the object, not an id, so a refetch while the
 * dialog is open cannot make it disappear.
 */
export type DeleteFlow<T> = { pending: T | null; error: string | null };

/** The idle dialog. Frozen, because every store's initial state shares this one object. */
export const IDLE_DELETE: DeleteFlow<never> = Object.freeze({ pending: null, error: null });

/**
 * Actions over the `delete` slice of any store whose state has one. The target's
 * type comes from the store's own state, so a wrong target cannot be passed.
 */
export function deleteFlowActions<S extends { delete: DeleteFlow<unknown> }>({ setState }: StoreApi<S>) {
  return {
    beginDelete: (target: NonNullable<S["delete"]["pending"]>) =>
      setState((state) => ({ ...state, delete: { pending: target, error: null } })),
    cancelDelete: () => setState((state) => ({ ...state, delete: IDLE_DELETE })),
    /** Before each attempt, so a repeat failure with the same message still refocuses (D75). */
    clearDeleteError: () =>
      setState((state) => ({ ...state, delete: { ...state.delete, error: null } })),
    failDelete: (message: string) =>
      setState((state) => ({ ...state, delete: { ...state.delete, error: message } })),
  };
}
