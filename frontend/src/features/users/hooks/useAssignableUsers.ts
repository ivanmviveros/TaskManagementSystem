import { useQuery } from "@tanstack/react-query";

import * as userService from "../services/user-service";
import { userKeys } from "./useUsers";

/**
 * Options for the assignee picker: every user a task may be assigned to, as the
 * API reports them (D61). The server excludes Admins (D17), so nothing is
 * filtered here.
 */
export function useAssignableUsers(enabled = true) {
  return useQuery({
    queryKey: userKeys.assignable,
    queryFn: userService.listAssignableUsers,
    enabled,
  });
}
