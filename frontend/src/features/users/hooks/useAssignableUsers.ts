import { useQuery } from "@tanstack/react-query";

import * as userService from "../services/user-service";
import { userKeys } from "./useUsers";

/**
 * Options for the assignee picker. Admins are filtered out (D17): assigning to
 * one would create a task nobody can open, and the API rejects it with
 * assignee_not_assignable.
 */
export function useAssignableUsers(enabled = true) {
  return useQuery({
    queryKey: userKeys.assignable,
    queryFn: async () => {
      const page = await userService.listAssignableUsers();
      return page.results.filter((user) => user.role !== "ADMIN");
    },
    enabled,
  });
}
