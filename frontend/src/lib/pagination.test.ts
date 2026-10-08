import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZES,
  isPageSize,
  pageWindow,
  routePaginationChange,
} from "./pagination";

/** "1 … 3 4 5" — the same notation as the spec's table, so a failure reads like it. */
function render(current: number, total: number): string {
  return pageWindow(current, total)
    .map((item) => (item === "gap" ? "…" : String(item)))
    .join(" ");
}

describe("pageWindow", () => {
  it.each([
    [1, 1, "1"],
    [1, 2, "1 2"],
    [3, 4, "1 2 3 4"],
    [1, 10, "1 2 3 … 10"],
    [2, 10, "1 2 3 4 … 10"],
    [5, 10, "1 … 3 4 5 6 7 … 10"],
    [9, 10, "1 … 7 8 9 10"],
    [10, 10, "1 … 8 9 10"],
  ])("page %i of %i shows %s", (current, total, expected) => {
    expect(render(current, total)).toBe(expected);
  });
});

describe("page sizes", () => {
  it("offers what the API's max_page_size of 100 allows, defaulting to its page_size", () => {
    expect(PAGE_SIZES).toEqual([10, 20, 50, 100]);
    expect(DEFAULT_PAGE_SIZE).toBe(20);
  });

  it.each([10, 20, 50, 100])("accepts %i", (size) => {
    expect(isPageSize(size)).toBe(true);
  });

  it.each([0, 37, 101, 5000, "20", null, undefined])("rejects %j", (size) => {
    expect(isPageSize(size)).toBe(false);
  });
});

describe("routePaginationChange (D85)", () => {
  const current = { pageIndex: 4, pageSize: 20 };

  function route(next: { pageIndex: number; pageSize: number }) {
    const to = { goToPage: vi.fn(), setPageSize: vi.fn() };
    routePaginationChange(next, current, to);
    return to;
  }

  it("turns a size change into setPageSize, ignoring the page index Table proposes", () => {
    const to = route({ pageIndex: 1, pageSize: 50 });
    expect(to.setPageSize).toHaveBeenCalledWith(50);
    expect(to.goToPage).not.toHaveBeenCalled();
  });

  it("turns a page move into goToPage, numbered from 1", () => {
    const to = route({ pageIndex: 5, pageSize: 20 });
    expect(to.goToPage).toHaveBeenCalledWith(6);
    expect(to.setPageSize).not.toHaveBeenCalled();
  });

  it("does nothing when nothing changed", () => {
    const to = route(current);
    expect(to.goToPage).not.toHaveBeenCalled();
    expect(to.setPageSize).not.toHaveBeenCalled();
  });

  it("ignores a page size the API does not offer", () => {
    const to = route({ pageIndex: 0, pageSize: 37 });
    expect(to.setPageSize).not.toHaveBeenCalled();
    expect(to.goToPage).not.toHaveBeenCalled();
  });

  it("accepts the updater-function form Table passes", () => {
    const to = { goToPage: vi.fn(), setPageSize: vi.fn() };
    routePaginationChange((old) => ({ ...old, pageIndex: 0 }), current, to);
    expect(to.goToPage).toHaveBeenCalledWith(1);
    expect(to.setPageSize).not.toHaveBeenCalled();
  });
});
