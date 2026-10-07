import { createStoreContext } from "@tanstack/react-store";

import type { TaskActions } from "./hooks/useTaskActions";
import type { TaskActionsStore } from "./task-actions-store";

/** The list page's task-actions store and actions, for its rows and cards (D87). */
export const { StoreProvider: TaskActionsProvider, useStoreContext: useTaskActionsContext } =
  createStoreContext<{ store: TaskActionsStore; actions: TaskActions }>();
