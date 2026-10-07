import { useEffect, useState } from "react";

/**
 * `value`, once it has stopped changing for `delayMs`.
 *
 * For a value that only lives in component state. A value mirrored into the
 * URL needs useSearchParamDraft instead, which also handles outside changes.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
