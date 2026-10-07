import { useCallback, useEffect, useRef, useState } from "react";

export interface SearchParamDraft {
  draft: string;
  setDraft: (value: string) => void;
  /** Drop a pending commit and return to the committed value. */
  cancel: () => void;
}

/**
 * A text field's local draft of one URL search value (D50).
 *
 * The router commits search changes in a React transition, after an async
 * load, so a controlled input bound straight to a search param is reverted by
 * React and then jumps — the cursor moves and keystrokes are at risk. The draft
 * updates synchronously and reaches the URL after `delayMs` without input.
 *
 * With that quiet period at most one write is in flight, so "did I write this
 * value?" is a single comparison: a committed value other than the last one
 * written came from elsewhere (Back, a nav link) and replaces the draft.
 */
export function useSearchParamDraft(
  committed: string,
  commit: (value: string) => void,
  delayMs = 300,
): SearchParamDraft {
  const [draft, setDraftState] = useState(committed);
  const lastWritten = useRef(committed);
  const latest = useRef({ committed, commit });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    latest.current = { committed, commit };
  });

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => {
    if (committed === lastWritten.current) return;
    clearTimer();
    lastWritten.current = committed;
    setDraftState(committed);
  }, [committed, clearTimer]);

  // A late commit after unmount would navigate back to a list the user left.
  useEffect(() => clearTimer, [clearTimer]);

  const setDraft = useCallback(
    (value: string) => {
      setDraftState(value);
      clearTimer();
      timer.current = setTimeout(() => {
        timer.current = null;
        lastWritten.current = value;
        latest.current.commit(value);
      }, delayMs);
    },
    [clearTimer, delayMs],
  );

  const cancel = useCallback(() => {
    clearTimer();
    setDraftState(latest.current.committed);
  }, [clearTimer]);

  return { draft, setDraft, cancel };
}
