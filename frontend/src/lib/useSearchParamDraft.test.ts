import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSearchParamDraft } from "./useSearchParamDraft";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function setup(initial = "") {
  const commit = vi.fn();
  const hook = renderHook(
    ({ committed, onCommit }) => useSearchParamDraft(committed, onCommit),
    { initialProps: { committed: initial, onCommit: commit } },
  );
  return { commit, hook };
}

describe("useSearchParamDraft", () => {
  it("starts from the committed value", () => {
    const { hook } = setup("omar");
    expect(hook.result.current.draft).toBe("omar");
  });

  it("updates the draft at once, and commits once after 300 ms without input", () => {
    const { commit, hook } = setup();
    act(() => hook.result.current.setDraft("o"));
    expect(hook.result.current.draft).toBe("o");
    act(() => vi.advanceTimersByTime(100));
    act(() => hook.result.current.setDraft("om"));
    act(() => vi.advanceTimersByTime(299));
    expect(commit).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(commit.mock.calls).toEqual([["om"]]);
  });

  it("ignores the echo of its own commit, even after more typing", () => {
    const { commit, hook } = setup();
    act(() => hook.result.current.setDraft("om"));
    act(() => vi.advanceTimersByTime(300));
    expect(commit).toHaveBeenCalledWith("om");
    act(() => hook.result.current.setDraft("oma"));
    hook.rerender({ committed: "om", onCommit: commit });
    expect(hook.result.current.draft).toBe("oma");
  });

  it("takes a value it did not write, and drops its pending commit", () => {
    const { commit, hook } = setup("omar");
    act(() => hook.result.current.setDraft("omar x"));
    hook.rerender({ committed: "", onCommit: commit });
    expect(hook.result.current.draft).toBe("");
    act(() => vi.advanceTimersByTime(300));
    expect(commit).not.toHaveBeenCalled();
  });

  it("drops a pending commit on unmount", () => {
    const { commit, hook } = setup();
    act(() => hook.result.current.setDraft("x"));
    hook.unmount();
    act(() => vi.advanceTimersByTime(300));
    expect(commit).not.toHaveBeenCalled();
  });

  it("cancel() drops a pending commit and returns to the committed value", () => {
    const { commit, hook } = setup();
    act(() => hook.result.current.setDraft("2026-10-06"));
    act(() => hook.result.current.cancel());
    expect(hook.result.current.draft).toBe("");
    act(() => vi.advanceTimersByTime(300));
    expect(commit).not.toHaveBeenCalled();
  });

  it("calls the latest commit callback, not the one current when typing began", () => {
    const { commit, hook } = setup();
    act(() => hook.result.current.setDraft("x"));
    const later = vi.fn();
    hook.rerender({ committed: "", onCommit: later });
    act(() => vi.advanceTimersByTime(300));
    expect(commit).not.toHaveBeenCalled();
    expect(later).toHaveBeenCalledWith("x");
  });
});
