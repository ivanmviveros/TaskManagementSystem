import type { StoreApi } from "../../../lib/store-api";

/**
 * The assignee picker's own UI state (D87), one store per combobox instance.
 * `query` null means "not searching": the input shows the chosen user and the
 * list is unfiltered. `activeIndex` -1 means no active option, so Enter chooses
 * nothing — the state after typing, until an arrow key picks one.
 */
export type ComboboxState = { open: boolean; query: string | null; activeIndex: number };

/** Frozen: every store created from it shares this one object. */
export const initialComboboxState: ComboboxState = Object.freeze({
  open: false,
  query: null,
  activeIndex: -1,
});

export const comboboxActions = ({ setState }: StoreApi<ComboboxState>) => ({
  /** Opens the list with `index` active. */
  openAt: (index: number) => setState((state) => ({ ...state, open: true, activeIndex: index })),
  /** Closes without choosing: the input goes back to the chosen user. */
  close: () => setState(() => initialComboboxState),
  /** Typing searches, and no option is active until an arrow key picks one. */
  type: (query: string) => setState(() => ({ open: true, query, activeIndex: -1 })),
  moveTo: (index: number) => setState((state) => ({ ...state, activeIndex: index })),
});
