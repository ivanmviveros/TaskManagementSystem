import { describe, expect, it } from "vitest";

import { DEFAULT_PAGE_SIZE, PAGE_SIZES, isPageSize, pageWindow } from "./pagination";

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
