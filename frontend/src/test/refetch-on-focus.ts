import { focusManager, type QueryClient } from "@tanstack/react-query";
import { act, waitFor } from "@testing-library/react";
import { expect } from "vitest";

/**
 * Fires a window-focus event and resolves once the refetch it caused has
 * SETTLED and React has rendered the result, so a DOM check that follows can
 * actually see the newer data (or its absence).
 *
 * Counting requests in an MSW handler is not enough: that counter moves when
 * the handler STARTS, before the data reaches the component. This waits on the
 * query client instead: a fetch starts, the client goes idle, then one macrotask
 * for the batched notification to render.
 *
 * The test client's staleTime of 0 makes the focus event refetch every active
 * query. Restores the shared focusManager singleton before returning, so no
 * `finally` is needed at the call site.
 */
export async function refetchOnFocus(queryClient: QueryClient): Promise<void> {
  // The client starts the fetch a microtask after the focus event, so watch for it
  // rather than reading isFetching() straight away; idle-before-start would pass
  // without proving a refetch happened.
  let started = false;
  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (event.type === "updated" && event.action.type === "fetch") started = true;
  });
  try {
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await waitFor(() => expect(started).toBe(true));
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    // The result reaches observers on a timer; let that render land.
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  } finally {
    unsubscribe();
    // isFocused() then resolves to true again, which fires one more focus refetch that
    // may still be in flight when afterEach resets the MSW handlers.
    focusManager.setFocused(undefined);
  }
}
