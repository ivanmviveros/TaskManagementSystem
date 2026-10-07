import { shallow, useSelector } from "@tanstack/react-store";
import { useMemo } from "react";

import { useSessionStore } from "../session-context";
import type { AuthState } from "../session-store";

/** The signed-in user and the session actions, from the session store (D86). */
export function useAuth(): AuthState {
  const { session } = useSessionStore();
  const { user, isLoading } = useSelector(
    session,
    (state) => ({ user: state.user, isLoading: state.isLoading }),
    { compare: shallow },
  );
  const { signIn, signOut } = session.actions;
  return useMemo(() => ({ user, isLoading, signIn, signOut }), [user, isLoading, signIn, signOut]);
}
