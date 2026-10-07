import { keepPreviousData, useQuery } from "@tanstack/react-query";

import * as taskService from "../services/task-service";
import type { TaskFilters } from "../types";

export const taskKeys = {
  all: ["tasks"] as const,
  list: (filters: TaskFilters) => ["tasks", filters] as const,
  detail: (id: string) => ["tasks", id] as const,
  stats: ["tasks", "stats"] as const,
};

export function useTasks(filters: TaskFilters) {
  return useQuery({
    queryKey: taskKeys.list(filters),
    queryFn: () => taskService.listTasks(filters),
    // A page move keeps the current rows and the pager on screen instead of
    // unmounting them, which would drop keyboard focus (D53).
    placeholderData: keepPreviousData,
  });
}

export function useTask(id: string) {
  return useQuery({
    queryKey: taskKeys.detail(id),
    queryFn: () => taskService.getTask(id),
  });
}

export function useTaskStats() {
  return useQuery({
    queryKey: taskKeys.stats,
    queryFn: () => taskService.getTaskStats(),
  });
}
