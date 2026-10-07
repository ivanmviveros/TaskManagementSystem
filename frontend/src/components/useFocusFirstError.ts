import { useCallback, useEffect, useRef, useState } from "react";

/**
 * After a failed submit, focus the first invalid field, or else the form's
 * alert (D75). The submit button is disabled while the request is in flight, and
 * disabling the focused element drops focus to <body>; without this, keyboard
 * and screen-reader users had to hunt for the errors.
 *
 * Attach `ref` to the <form>; call `signalFailure()` in the submit's catch. A
 * counter rather than a flag, so a repeat failure with identical errors still
 * refocuses.
 */
export function useFocusFirstError<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [failures, setFailures] = useState(0);

  useEffect(() => {
    if (failures === 0) return;
    const root = ref.current;
    if (root === null) return;
    const target =
      root.querySelector<HTMLElement>('[aria-invalid="true"]') ??
      root.querySelector<HTMLElement>('[role="alert"]');
    target?.focus();
  }, [failures]);

  const signalFailure = useCallback(() => setFailures((count) => count + 1), []);
  return { ref, signalFailure };
}
