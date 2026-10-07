import { createStoreContext } from "@tanstack/react-store";

import type { UserListStore } from "./user-list-store";

/** The user list page's store, for its rows and cards (D87). */
export const { StoreProvider: UserListProvider, useStoreContext: useUserListContext } =
  createStoreContext<{ store: UserListStore }>();
