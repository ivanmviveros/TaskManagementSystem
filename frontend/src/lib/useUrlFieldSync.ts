import { useCallback, useEffect, useRef } from "react";

export interface UrlFieldSync<TValue> {
  /** Call from the field's onChange listener: schedules (or makes) the URL write. */
  onChange: (value: TValue) => void;
  /** Drops a pending write and puts the field back to the URL's value. */
  cancel: () => void;
}

export interface UrlFieldSyncOptions<TValue> {
  /** The URL's current value for this field. */
  committed: TValue;
  /** Writes a value to the URL. */
  commit: (value: TValue) => void;
  /** Puts a value into the field WITHOUT running its listeners. */
  write: (value: TValue) => void;
  /** The quiet period before a write; 0 writes at once (checkboxes, selects). */
  delayMs?: number;
  /** How two values compare; pass one for arrays. */
  equals?: (a: TValue, b: TValue) => boolean;
}

/**
 * Keeps one filter field and its URL search value in step (D50, D82).
 *
 * The router commits search changes in a React transition after an async load,
 * so a field bound straight to the URL is reverted mid-typing. The form field
 * holds the draft; this hook writes it to the URL — after `delayMs` of quiet for
 * typed text, at once for a checkbox — and carries changes made elsewhere (Back,
 * a nav link, Clear, a dashboard card) back into the field.
 *
 * Telling the two apart: every value written is queued until its echo arrives.
 * A URL value matching a queued write is our own echo — it and every write
 * queued before it are dropped, and the field is left alone, so an echo cannot
 * overwrite newer input. Any other URL value came from elsewhere: it replaces
 * the field and drops any pending write. A queue rather than one "last written"
 * value, because two quick checkbox clicks put two writes in flight.
 *
 * A superseded navigation that returns the URL to where it started (a status
 * box checked and unchecked quickly) can leave an earlier entry queued; a later
 * external change to exactly that value is then taken for an echo. This is the
 * same limit a single last-written value has.
 */
export function useUrlFieldSync<TValue>({
  committed,
  commit,
  write,
  delayMs = 300,
  equals = Object.is,
}: UrlFieldSyncOptions<TValue>): UrlFieldSync<TValue> {
  const latest = useRef({ committed, commit, write, delayMs, equals });
  const previous = useRef(committed);
  const unechoed = useRef<TValue[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    latest.current = { committed, commit, write, delayMs, equals };
  });

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => {
    const { equals: same, write: toField } = latest.current;
    if (same(committed, previous.current)) return;
    previous.current = committed;
    const echo = unechoed.current.findIndex((value) => same(value, committed));
    if (echo !== -1) {
      unechoed.current = unechoed.current.slice(echo + 1);
      return;
    }
    unechoed.current = [];
    clearTimer();
    toField(committed);
  }, [committed, clearTimer]);

  // A late write after unmount would navigate back to a list the user left.
  useEffect(() => clearTimer, [clearTimer]);

  const send = useCallback((value: TValue) => {
    const { committed: current, commit: toUrl, equals: same } = latest.current;
    // Where the URL is heading: the newest write in flight, else where it is.
    // Writing there leaves it as it is: an entry for it would never be matched
    // before the next URL change removes it, so skipping it just keeps the queue
    // to the writes really in flight.
    const queue = unechoed.current;
    const heading = queue.length > 0 ? queue[queue.length - 1] : current;
    if (!same(value, heading)) queue.push(value);
    toUrl(value);
  }, []);

  const onChange = useCallback(
    (value: TValue) => {
      clearTimer();
      const delay = latest.current.delayMs;
      if (delay <= 0) {
        send(value);
        return;
      }
      timer.current = setTimeout(() => {
        timer.current = null;
        send(value);
      }, delay);
    },
    [clearTimer, send],
  );

  // The queue is kept: a write already in flight still echoes, and Clear
  // (cancel, then reset the URL) must not see that echo as news and bring the
  // cleared value back.
  const cancel = useCallback(() => {
    clearTimer();
    latest.current.write(latest.current.committed);
  }, [clearTimer]);

  return { onChange, cancel };
}
