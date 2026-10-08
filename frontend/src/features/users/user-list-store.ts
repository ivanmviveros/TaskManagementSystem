import { createStore } from "@tanstack/react-store";

import { IDLE_DELETE, deleteFlowActions, type DeleteFlow } from "../../lib/delete-flow";
import type { StoreApi } from "../../lib/store-api";
import type { UserDetail } from "./types";

/** The user list's UI state (D87): its deactivate dialog. One store per page mount. */
export type UserListState = { delete: DeleteFlow<UserDetail> };

/** Frozen: every store created from it shares this one object. */
export const initialUserListState: UserListState = Object.freeze({ delete: IDLE_DELETE });

export const userListActions = (api: StoreApi<UserListState>) => deleteFlowActions(api);

/** Names the store's type. The page creates its own with useCreateStore (spec §4.0). */
export const createUserListStore = () => createStore(initialUserListState, userListActions);
export type UserListStore = ReturnType<typeof createUserListStore>;
