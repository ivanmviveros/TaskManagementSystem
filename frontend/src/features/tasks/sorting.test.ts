import { describe, expect, it } from "vitest";

import {
  DEFAULT_ORDERING,
  SORT_OPTIONS,
  isOrdering,
  nextOrdering,
  parseOrdering,
} from "./sorting";

describe("parseOrdering", () => {
  it("resolves no ordering to the API default, newest first", () => {
    expect(DEFAULT_ORDERING).toBe("-created_at");
    expect(parseOrdering(undefined)).toEqual({ field: "created_at", direction: "descending" });
  });

  it.each([
    ["due_date", "due_date", "ascending"],
    ["-due_date", "due_date", "descending"],
    ["status", "status", "ascending"],
    ["created_at", "created_at", "ascending"],
  ])("reads %s", (ordering, field, direction) => {
    expect(parseOrdering(ordering)).toEqual({ field, direction });
  });

  it("treats an unknown ordering as the default", () => {
    expect(parseOrdering("title")).toEqual({ field: "created_at", direction: "descending" });
  });
});

describe("nextOrdering", () => {
  it("starts an inactive column ascending", () => {
    expect(nextOrdering(undefined, "due_date")).toBe("due_date");
    expect(nextOrdering("-status", "due_date")).toBe("due_date");
  });

  it("flips the active column", () => {
    expect(nextOrdering("due_date", "due_date")).toBe("-due_date");
    expect(nextOrdering("-due_date", "due_date")).toBe("due_date");
  });

  it("flips the default: the first click on Created is ascending", () => {
    expect(nextOrdering(undefined, "created_at")).toBe("created_at");
  });

  it("writes no ordering when the result is the default, so the URL stays canonical (D48)", () => {
    expect(nextOrdering("created_at", "created_at")).toBeUndefined();
  });
});

describe("isOrdering", () => {
  it.each(["due_date", "-due_date", "status", "-status", "created_at", "-created_at"])(
    "accepts %s",
    (value) => expect(isOrdering(value)).toBe(true),
  );

  it.each(["title", "-title", "", "due_date,status", 3, null, undefined])("rejects %j", (value) =>
    expect(isOrdering(value)).toBe(false),
  );
});

describe("SORT_OPTIONS", () => {
  it("offers every ordering exactly once, default first", () => {
    expect(SORT_OPTIONS.map((option) => option.value)).toEqual([
      "-created_at",
      "created_at",
      "due_date",
      "-due_date",
      "status",
      "-status",
    ]);
  });
});
