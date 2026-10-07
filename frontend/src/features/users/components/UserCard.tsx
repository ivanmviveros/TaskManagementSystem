
import { Button } from "../../../components/Button";
import { ButtonLink } from "../../../components/ButtonLink";
import { ROLE_LABEL } from "../../auth/types";
import type { UserDetail } from "../types";

interface UserCardProps {
  user: UserDetail;
  onDelete: (user: UserDetail) => void;
  currentUserId: string | undefined;
}

/**
 * The below-`md` presentation of a row. A separate component rather than a CSS
 * variant of the table, because a table that reflows into blocks loses its
 * header association and reads poorly to a screen reader — the same reasoning
 * as TaskCard (spec §5.2).
 */
export function UserCard({ user, onDelete, currentUserId }: UserCardProps) {
  return (
    <article className="mb-3 rounded-lg bg-white p-4 shadow-sm">
      <h3 className="mb-2 font-medium">
        {user.first_name} {user.last_name}
      </h3>
      <dl className="mb-3 grid grid-cols-2 gap-1 text-sm text-slate-600">
        <dt className="font-medium">Email</dt>
        <dd className="break-all">{user.email}</dd>
        <dt className="font-medium">Role</dt>
        <dd>{ROLE_LABEL[user.role]}</dd>
        <dt className="font-medium">Active</dt>
        <dd>{user.is_active ? "Yes" : "No"}</dd>
      </dl>
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
        {user.id !== currentUserId && (
          <Button
            variant="danger"
            aria-label={`Deactivate ${user.email}`}
            onClick={() => onDelete(user)}
          >
            Deactivate
          </Button>
        )}
      </div>
    </article>
  );
}
