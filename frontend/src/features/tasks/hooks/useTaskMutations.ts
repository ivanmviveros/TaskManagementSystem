import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import * as taskService from "../services/task-service";
import type { TaskCreateInput, TaskUpdateInput } from "../types";
import { taskKeys } from "./useTasks";

/**
 * Every task write invalidates BOTH the task queries and the stats query, so
 * the dashboard cannot go stale after an edit. One helper rather than two calls
 * repeated in five hooks — which is how one of them ends up forgotten.
 */
export function invalidateTasks(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: taskKeys.all });
  void queryClient.invalidateQueries({ queryKey: taskKeys.stats });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TaskCreateInput) => taskService.createTask(input),
    onSuccess: () => invalidateTasks(queryClient),
  });
}

export function useUpdateTask(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TaskUpdateInput) => taskService.updateTask(id, input),
    onSuccess: () => invalidateTasks(queryClient),
  });
}

export function useCompleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => taskService.completeTask(id),
    onSuccess: () => invalidateTasks(queryClient),
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => taskService.deleteTask(id),
    onSuccess: () => invalidateTasks(queryClient),
  });
}
