import type { StoreActionsFactory } from "@tanstack/react-store";

/**
 * The `{ setState, get }` argument every Store actions factory receives (D87).
 * Named once so each store module types its factory the same way.
 */
export type StoreApi<T> = Parameters<StoreActionsFactory<T, Record<string, never>>>[0];
