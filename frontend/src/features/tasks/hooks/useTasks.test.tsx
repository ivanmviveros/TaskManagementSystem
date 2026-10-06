import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../../../lib/api-error";
import { server } from "../../../test/msw-server";
import { buildTaskQuery } from "../services/task-service";
import { invalidateTasks, useCreateTask } from "./useTaskMutations";
import { taskKeys, useTasks } from "./useTasks";

const BASE = "http://localhost:8000/api/v1";

function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function freshClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

const TASK = {
  id: "0199a0f0-0000-7000-8000-0000000000aa",
  title: "Review the brief",
  status: "PENDING" as const,
  due_date: null,
  assignee: null,
  is_overdue: false,
  created_at: "2026-10-01T09:00:00Z",
};

describe("buildTaskQuery", () => {
  it("repeats status rather than comma-joining it, matching the backend filter", () => {
    const query = buildTaskQuery({ status: ["PENDING", "IN_PROGRESS"] });
    expect(query).toBe("?status=PENDING&status=IN_PROGRESS");
  });

  it("omits the question mark entirely when there are no filters", () => {
    expect(buildTaskQuery({})).toBe("");
  });

  it("serialises overdue and paging", () => {
    expect(buildTaskQuery({ overdue: true, page: 2, page_size: 20 })).toBe(
      "?overdue=true&page=2&page_size=20",
    );
  });
});

describe("useTasks", () => {
  it("reports loading, then the page the API returned", async () => {
    server.use(
      http.get(`${BASE}/tasks/`, () =>
        HttpResponse.json({ count: 1, next: null, previous: null, results: [TASK] }),
      ),
    );
    const { result } = renderHook(() => useTasks({}), { wrapper: wrapper(freshClient()) });
    expect(result.current.isPending).toBe(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.results[0].title).toBe("Review the brief");
  });

  it("surfaces a failure as a typed ApiError rather than swallowing it", async () => {
    server.use(
      http.get(`${BASE}/tasks/`, () =>
        HttpResponse.json({ detail: "Boom.", code: "server_error" }, { status: 500 }),
      ),
    );
    const { result } = renderHook(() => useTasks({}), { wrapper: wrapper(freshClient()) });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect((result.current.error as ApiError).status).toBe(500);
  });
});

describe("task mutations", () => {
  it("invalidates both the task list and the stats so the dashboard cannot go stale", () => {
    const queryClient = freshClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    invalidateTasks(queryClient);
    expect(spy).toHaveBeenCalledWith({ queryKey: taskKeys.all });
    expect(spy).toHaveBeenCalledWith({ queryKey: taskKeys.stats });
  });

  it("creating a task invalidates the queries on success", async () => {
    server.use(
      http.post(`${BASE}/tasks/`, () => HttpResponse.json({ ...TASK, description: "" })),
    );
    const queryClient = freshClient();
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useCreateTask(), { wrapper: wrapper(queryClient) });
    result.current.mutate({ title: "Fresh" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(spy).toHaveBeenCalledWith({ queryKey: taskKeys.all });
    expect(spy).toHaveBeenCalledWith({ queryKey: taskKeys.stats });
  });

  it("reaches the caller with the assignee_immutable code intact", async () => {
    server.use(
      http.post(`${BASE}/tasks/`, () =>
        HttpResponse.json(
          {
            detail: "Your role cannot choose a task's assignee.",
            code: "assignee_immutable",
            errors: null,
          },
          { status: 400 },
        ),
      ),
    );
    const { result } = renderHook(() => useCreateTask(), { wrapper: wrapper(freshClient()) });
    result.current.mutate({ title: "Theirs", assignee: "someone-else" });
    await waitFor(() => expect(result.current.isError).toBe(true));
    const error = result.current.error as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("assignee_immutable");
  });
});
