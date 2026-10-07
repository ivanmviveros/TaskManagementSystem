import { Link } from "@tanstack/react-router";

import { Button } from "../../../components/Button";
import type { UserDetail } from "../types";

interface UserCardProps {
  user: UserDetail;
  onDelete: (user: UserDetail) => void;
}

/**
 * The below-`md` presentation of a row. A separate component rather than a CSS
 * variant of the table, because a table that reflows into blocks loses its
 * header association and reads poorly to a screen reader — the same reasoning
 * as TaskCard (spec §5.2).
 */
export function UserCard({ user, onDelete }: UserCardProps) {
  return (
    <article className="mb-3 rounded-lg bg-white p-4 shadow-sm">
      <h3 className="mb-2 font-medium">
        {user.first_name} {user.last_name}
      </h3>
      <dl className="mb-3 grid grid-cols-2 gap-1 text-sm text-slate-600">
        <dt className="font-medium">Email</dt>
        <dd className="break-all">{user.email}</dd>
        <dt className="font-medium">Role</dt>
        <dd>{user.role}</dd>
        <dt className="font-medium">Active</dt>
        <dd>{user.is_active ? "Yes" : "No"}</dd>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Link to="/users/$userId" params={{ userId: user.id }}>
          <Button variant="secondary" aria-label={`Edit ${user.email}`}>
            Edit
          </Button>
        </Link>
        <Button
          variant="danger"
          aria-label={`Deactivate ${user.email}`}
          onClick={() => onDelete(user)}
        >
          Deactivate
        </Button>
      </div>
    </article>
  );
}
