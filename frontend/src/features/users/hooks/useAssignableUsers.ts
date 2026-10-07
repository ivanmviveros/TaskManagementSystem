import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";

import * as userService from "../services/user-service";
import { userKeys } from "./useUsers";

/**
 * Options for the assignee picker: the users a task may be assigned to that
 * match `search`, one server page at a time (D64). The server excludes Admins
 * (D17), so nothing is filtered here.
 */
export function useAssignableUsers(search: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: userKeys.assignable(search),
    queryFn: ({ pageParam }) => userService.listAssignableUsers({ search, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _pages, lastPageParam) =>
      lastPage.next === null ? undefined : lastPageParam + 1,
    // A new search keeps the current options on screen until its answer arrives,
    // rather than flashing an empty list on every pause in typing.
    placeholderData: keepPreviousData,
    enabled,
  });
}
