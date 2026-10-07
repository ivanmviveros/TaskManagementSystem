import { ROLE_LABEL } from "../../auth/types";
import type { UserDetail } from "../types";
import { UserRowActions } from "./UserRowActions";

interface UserTableProps {
  users: UserDetail[];
}

/**
 * The ≥`md` presentation of the user list. Follows TaskTable's pattern but keeps
 * the `md` breakpoint (TaskTable starts at `lg`, D69).
 */
export function UserTable({ users }: UserTableProps) {
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
            <td className="p-3 text-slate-600">{ROLE_LABEL[user.role]}</td>
            <td className="p-3 text-slate-600">{user.is_active ? "Yes" : "No"}</td>
            <td className="p-3">
              <UserRowActions user={user} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
