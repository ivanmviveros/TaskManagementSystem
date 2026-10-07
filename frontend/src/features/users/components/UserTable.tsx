
import { Button } from "../../../components/Button";
import { ButtonLink } from "../../../components/ButtonLink";
import type { UserDetail } from "../types";

interface UserTableProps {
  users: UserDetail[];
  onDelete: (user: UserDetail) => void;
}

/** The ≥`md` presentation of the user list, mirroring TaskTable. */
export function UserTable({ users, onDelete }: UserTableProps) {
  return (
    <table className="w-full border-collapse bg-white text-left text-sm shadow-sm">
      <thead>
        <tr className="border-b border-slate-200">
          <th scope="col" className="p-3 font-medium text-slate-700">
            Name
          </th>
          <th scope="col" className="p-3 font-medium text-slate-700">
            Email
          </th>
          <th scope="col" className="p-3 font-medium text-slate-700">
            Role
          </th>
          <th scope="col" className="p-3 font-medium text-slate-700">
            Active
          </th>
          <th scope="col" className="p-3 font-medium text-slate-700">
            Actions
          </th>
        </tr>
      </thead>
      <tbody>
        {users.map((user) => (
          <tr key={user.id} className="border-b border-slate-100">
            <td className="p-3">
              {user.first_name} {user.last_name}
            </td>
            <td className="p-3 text-slate-600">{user.email}</td>
            <td className="p-3 text-slate-600">{user.role}</td>
            <td className="p-3 text-slate-600">{user.is_active ? "Yes" : "No"}</td>
            <td className="p-3">
              <div className="flex flex-wrap gap-2">
                <ButtonLink
                  variant="secondary"
                  to="/users/$userId"
                  params={{ userId: user.id }}
                  aria-label={`Edit ${user.email}`}
                >
                  Edit
                </ButtonLink>
                <Button
                  variant="danger"
                  aria-label={`Deactivate ${user.email}`}
                  onClick={() => onDelete(user)}
                >
                  Deactivate
                </Button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
