import { Button } from "../../../components/Button";
import { ButtonLink } from "../../../components/ButtonLink";
import { useAuth } from "../../auth/hooks/useAuth";
import type { UserDetail } from "../types";
import { useUserListContext } from "../user-list-context";

/**
 * A user row's Edit and Deactivate, shared by the table and the cards.
 * Must render inside UserListProvider: it reads the page's store from it.
 */
export function UserRowActions({ user }: { user: UserDetail }) {
  const { user: currentUser } = useAuth();
  const { store } = useUserListContext();
  return (
    <div className="flex flex-wrap gap-2">
      <ButtonLink
        variant="secondary"
        to="/users/$userId"
        params={{ userId: user.id }}
        aria-label={`Edit ${user.email}`}
      >
        Edit
      </ButtonLink>
      {/* D66, the UX mirror of IsNotSelf: never offer a refusal. */}
      {user.id !== currentUser?.id && (
        <Button
          variant="danger"
          aria-label={`Deactivate ${user.email}`}
          onClick={() => store.actions.beginDelete(user)}
        >
          Deactivate
        </Button>
      )}
    </div>
  );
}
