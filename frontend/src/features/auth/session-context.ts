import { createStoreContext } from "@tanstack/react-store";

import type { SessionStore } from "./session-store";

/** Carries the app's one session store from SessionProvider to useAuth (D86). */
export const { StoreProvider: SessionStoreProvider, useStoreContext: useSessionStore } =
  createStoreContext<{ session: SessionStore }>();
