import { ROLE_LABEL } from "../../auth/types";
import type { UserDetail } from "../types";
import { UserRowActions } from "./UserRowActions";

/**
 * The below-`md` presentation of a row. A separate component rather than a CSS
 * variant of the table, because a table that reflows into blocks loses its
 * header association and reads poorly to a screen reader — the same reasoning
 * as TaskCard (spec §5.2).
 */
export function UserCard({ user }: { user: UserDetail }) {
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
      <UserRowActions user={user} />
    </article>
  );
}
