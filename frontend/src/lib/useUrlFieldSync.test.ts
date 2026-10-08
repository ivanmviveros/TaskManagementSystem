import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useUrlFieldSync } from "./useUrlFieldSync";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** `write` stands in for the form field: it receives what the hook puts there. */
function setup<T>(
  initial: T,
  { strict = false, ...options }: { strict?: boolean; delayMs?: number; equals?: (a: T, b: T) => boolean } = {},
) {
  const commit = vi.fn<(value: T) => void>();
  const write = vi.fn<(value: T) => void>();
  const hook = renderHook(
    ({ committed, onCommit }: { committed: T; onCommit: (value: T) => void }) =>
      useUrlFieldSync({ committed, commit: onCommit, write, ...options }),
    { initialProps: { committed: initial, onCommit: commit }, reactStrictMode: strict },
  );
  return { commit, write, hook };
}

const sameList = (a: string[], b: string[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

describe("useUrlFieldSync: typed text, 300 ms", () => {
  it("leaves the field alone on mount: its default already is the URL value", () => {
    const { commit, write } = setup("omar");
    expect(write).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it("commits once, 300 ms after the last change", () => {
    const { commit, hook } = setup("");
    act(() => hook.result.current.onChange("o"));
    act(() => vi.advanceTimersByTime(100));
    act(() => hook.result.current.onChange("om"));
    act(() => vi.advanceTimersByTime(299));
    expect(commit).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(commit.mock.calls).toEqual([["om"]]);
  });

  it("ignores the echo of its own commit, even after more typing", () => {
    const { commit, write, hook } = setup("");
    act(() => hook.result.current.onChange("om"));
    act(() => vi.advanceTimersByTime(300));
    expect(commit).toHaveBeenCalledWith("om");
    act(() => hook.result.current.onChange("oma"));
    hook.rerender({ committed: "om", onCommit: commit });
    expect(write).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(300));
    expect(commit).toHaveBeenLastCalledWith("oma");
  });

  it("takes a value it did not write, and drops its pending commit", () => {
    const { commit, write, hook } = setup("omar");
    act(() => hook.result.current.onChange("omar x"));
    hook.rerender({ committed: "", onCommit: commit });
    expect(write).toHaveBeenCalledWith("");
    act(() => vi.advanceTimersByTime(300));
    expect(commit).not.toHaveBeenCalled();
  });

  it("drops a pending commit on unmount", () => {
    const { commit, hook } = setup("");
    act(() => hook.result.current.onChange("x"));
    hook.unmount();
    act(() => vi.advanceTimersByTime(300));
    expect(commit).not.toHaveBeenCalled();
  });

  it("cancel() drops a pending commit and puts the field back to the URL's value", () => {
    const { commit, write, hook } = setup("");
    act(() => hook.result.current.onChange("2026-10-06"));
    act(() => hook.result.current.cancel());
    expect(write).toHaveBeenCalledWith("");
    act(() => vi.advanceTimersByTime(300));
    expect(commit).not.toHaveBeenCalled();
  });

  it("calls the latest commit callback, not the one current when typing began", () => {
    const { commit, hook } = setup("");
    act(() => hook.result.current.onChange("x"));
    const later = vi.fn<(value: string) => void>();
    hook.rerender({ committed: "", onCommit: later });
    act(() => vi.advanceTimersByTime(300));
    expect(commit).not.toHaveBeenCalled();
    expect(later).toHaveBeenCalledWith("x");
  });

  it("cancel() keeps a commit already in flight recognisable, so its echo is not taken as news", () => {
    // Clear = cancel() then the URL reset; the echo of the in-flight write must
    // not briefly put the cleared date back into the field.
    const { commit, write, hook } = setup("");
    act(() => hook.result.current.onChange("2026-10-06"));
    act(() => vi.advanceTimersByTime(300));
    expect(commit).toHaveBeenCalledWith("2026-10-06");
    act(() => hook.result.current.cancel());
    expect(write.mock.calls).toEqual([[""]]);
    hook.rerender({ committed: "2026-10-06", onCommit: commit });
    expect(write.mock.calls).toEqual([[""]]);
    hook.rerender({ committed: "", onCommit: commit });
    expect(write.mock.calls).toEqual([[""], [""]]);
  });

  it("recognises the echo of a write back to the URL value while another is in flight", () => {
    const { commit, write, hook } = setup("");
    act(() => hook.result.current.onChange("om"));
    act(() => vi.advanceTimersByTime(300));
    act(() => hook.result.current.onChange(""));
    act(() => vi.advanceTimersByTime(300));
    act(() => hook.result.current.onChange("x"));
    hook.rerender({ committed: "om", onCommit: commit });
    hook.rerender({ committed: "", onCommit: commit });
    expect(write).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(300));
    expect(commit).toHaveBeenLastCalledWith("x");
  });
});

describe("useUrlFieldSync: immediate fields", () => {
  it("commits at once with delayMs 0", () => {
    const { commit, hook } = setup<string[]>([], { delayMs: 0, equals: sameList });
    act(() => hook.result.current.onChange(["PENDING"]));
    expect(commit).toHaveBeenCalledWith(["PENDING"]);
  });

  it("lets the first of two quick writes echo without reverting the second", () => {
    const { commit, write, hook } = setup<string[]>([], { delayMs: 0, equals: sameList });
    act(() => hook.result.current.onChange(["A"]));
    act(() => hook.result.current.onChange(["A", "B"]));
    hook.rerender({ committed: ["A"], onCommit: commit });
    hook.rerender({ committed: ["A", "B"], onCommit: commit });
    expect(write).not.toHaveBeenCalled();
  });

  it("treats an equal, rebuilt array as no change, and a different one as news", () => {
    const { commit, write, hook } = setup<string[]>(["A"], { delayMs: 0, equals: sameList });
    hook.rerender({ committed: ["A"], onCommit: commit });
    expect(write).not.toHaveBeenCalled();
    hook.rerender({ committed: ["B"], onCommit: commit });
    expect(write).toHaveBeenCalledWith(["B"]);
  });

  it("treats later changes as news after a write equal to the URL value", () => {
    // Writing where the URL already is changes nothing, so no echo follows. This
    // pins the outcome, not the guard: with the heading baseline an entry
    // queued for such a write is always cleared by the next URL change, so no
    // observable behaviour depends on the guard: a duplicate of the heading
    // value is dropped at the next URL change, either as news or by the later
    // echo's slice.
    const { commit, write, hook } = setup("a", { delayMs: 0 });
    act(() => hook.result.current.onChange("a"));
    expect(commit).toHaveBeenCalledWith("a");
    hook.rerender({ committed: "b", onCommit: commit });
    hook.rerender({ committed: "a", onCommit: commit });
    expect(write.mock.calls).toEqual([["b"], ["a"]]);
  });

  it("recognises that echo for immediate fields too", () => {
    const { commit, write, hook } = setup<string[]>([], { delayMs: 0, equals: sameList });
    act(() => hook.result.current.onChange(["A"]));
    act(() => hook.result.current.onChange([]));
    act(() => hook.result.current.onChange(["B"]));
    hook.rerender({ committed: ["A"], onCommit: commit });
    hook.rerender({ committed: [], onCommit: commit });
    hook.rerender({ committed: ["B"], onCommit: commit });
    expect(write).not.toHaveBeenCalled();
  });

  it("drops every write queued before the echo it matches", () => {
    const { commit, write, hook } = setup<string[]>([], { delayMs: 0, equals: sameList });
    act(() => hook.result.current.onChange(["A"]));
    act(() => hook.result.current.onChange(["A", "B"]));
    // The router skipped the [A] echo: [A, B] answers both writes.
    hook.rerender({ committed: ["A", "B"], onCommit: commit });
    // Back to [A] is news, not a late echo of the dropped first write.
    hook.rerender({ committed: ["A"], onCommit: commit });
    expect(write.mock.calls).toEqual([[["A"]]]);
  });
});

describe("useUrlFieldSync: StrictMode", () => {
  it("leaves the field alone on mount", () => {
    const { commit, write } = setup("omar", { strict: true });
    expect(write).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it("commits once, 300 ms after the last change", () => {
    const { commit, write, hook } = setup("", { strict: true });
    act(() => hook.result.current.onChange("o"));
    act(() => hook.result.current.onChange("om"));
    act(() => vi.advanceTimersByTime(300));
    expect(commit.mock.calls).toEqual([["om"]]);
    expect(write).not.toHaveBeenCalled();
  });
});
