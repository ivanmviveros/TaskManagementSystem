import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as userService from "../services/user-service";
import type { UserCreateInput, UserFilters, UserUpdateInput } from "../types";

export const userKeys = {
  all: ["users"] as const,
  list: (filters: UserFilters) => ["users", filters] as const,
  detail: (id: string) => ["users", id] as const,
  assignable: ["users", "assignable"] as const,
};

export function useUsers(filters: UserFilters) {
  return useQuery({
    queryKey: userKeys.list(filters),
    queryFn: () => userService.listUsers(filters),
    // A page move keeps the current rows and the pager on screen (D53).
    placeholderData: keepPreviousData,
  });
}

export function useUser(id: string, enabled = true) {
  return useQuery({
    queryKey: userKeys.detail(id),
    queryFn: () => userService.getUser(id),
    enabled,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UserCreateInput) => userService.createUser(input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: userKeys.all }),
  });
}

export function useUpdateUser(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UserUpdateInput) => userService.updateUser(id, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: userKeys.all }),
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => userService.deleteUser(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: userKeys.all }),
  });
}
