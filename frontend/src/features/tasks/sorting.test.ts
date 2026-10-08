import { describe, expect, it } from "vitest";

import {
  DEFAULT_ORDERING,
  SORT_FIELDS,
  SORT_LABEL,
  SORT_OPTIONS,
  isOrdering,
  nextOrdering,
  orderingToSorting,
  parseOrdering,
  sortingToOrdering,
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

  it("stays in step with the sort fields: every option is a valid, distinct ordering", () => {
    const values = SORT_OPTIONS.map((option) => option.value);
    expect(values.every(isOrdering)).toBe(true);
    expect(new Set(values).size).toBe(SORT_FIELDS.length * 2);
  });
});

describe("orderingToSorting", () => {
  it("shows no ordering as the default, newest first, as an active sort (D48)", () => {
    expect(orderingToSorting(undefined)).toEqual([{ id: "created_at", desc: true }]);
  });

  it.each([
    ["due_date", "due_date", false],
    ["-due_date", "due_date", true],
    ["status", "status", false],
    ["-status", "status", true],
    ["created_at", "created_at", false],
  ])("reads %s", (ordering, id, desc) => {
    expect(orderingToSorting(ordering)).toEqual([{ id, desc }]);
  });

  it("treats an unknown ordering as the default", () => {
    expect(orderingToSorting("title")).toEqual([{ id: "created_at", desc: true }]);
  });
});

describe("sortingToOrdering", () => {
  it.each(["due_date", "-due_date", "status", "-status", "created_at"])(
    "round-trips %s",
    (ordering) => {
      expect(sortingToOrdering(orderingToSorting(ordering))).toBe(ordering);
    },
  );

  it("writes no ordering for the default, so the URL stays canonical (D48)", () => {
    expect(sortingToOrdering([{ id: "created_at", desc: true }])).toBeUndefined();
  });

  it("writes no ordering for an empty or unknown sort", () => {
    expect(sortingToOrdering([])).toBeUndefined();
    expect(sortingToOrdering([{ id: "title", desc: false }])).toBeUndefined();
  });
});

describe("SORT_LABEL", () => {
  it("labels every sortable field from the one sort model (D67)", () => {
    expect(SORT_LABEL).toEqual({ due_date: "Due date", status: "Status", created_at: "Created" });
  });
});
