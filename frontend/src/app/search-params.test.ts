import { describe, expect, it } from "vitest";

import { validateTaskListSearch, validateUserListSearch } from "./search-params";

describe("validateTaskListSearch", () => {
  it("keeps every value the list can use", () => {
    expect(
      validateTaskListSearch({
        status: ["PENDING", "IN_PROGRESS"],
        due_date_after: "2026-10-06T00:00:00.000Z",
        due_date_before: "2026-10-13T23:59:59.000Z",
        overdue: true,
        ordering: "due_date",
        page: 2,
        page_size: 50,
      }),
    ).toEqual({
      status: ["PENDING", "IN_PROGRESS"],
      due_date_after: "2026-10-06T00:00:00.000Z",
      due_date_before: "2026-10-13T23:59:59.000Z",
      overdue: true,
      ordering: "due_date",
      page: 2,
      page_size: 50,
    });
  });

  it("tolerates a single status rather than an array", () => {
    expect(validateTaskListSearch({ status: "PENDING" }).status).toEqual(["PENDING"]);
  });

  it("reads numbers written as strings", () => {
    const search = validateTaskListSearch({ page: "3", page_size: "50" });
    expect(search.page).toBe(3);
    expect(search.page_size).toBe(50);
  });

  it.each([0, -1, 2.5, "abc", "", true, null])("drops page %j", (page) => {
    expect(validateTaskListSearch({ page }).page).toBeUndefined();
  });

  it.each([37, 5000, 0, "abc", true])("drops page_size %j, which the select cannot show", (size) => {
    expect(validateTaskListSearch({ page_size: size }).page_size).toBeUndefined();
  });
});

describe("validateUserListSearch", () => {
  it("keeps a known role and drops an unknown one", () => {
    expect(validateUserListSearch({ role: "OPERATOR" }).role).toBe("OPERATOR");
    expect(validateUserListSearch({ role: "ROOT" }).role).toBeUndefined();
  });

  it.each([
    [true, true],
    ["true", true],
    [false, false],
    ["false", false],
    ["maybe", undefined],
  ])("reads is_active %j as %j", (raw, expected) => {
    expect(validateUserListSearch({ is_active: raw }).is_active).toBe(expected);
  });

  it("keeps a numeric search as text", () => {
    // The default parseSearch JSON-parses values, so a hand-written
    // ?search=2026 arrives as the number 2026 (spec §1.2.4).
    expect(validateUserListSearch({ search: 2026 }).search).toBe("2026");
  });

  it("validates page and page size like the task list", () => {
    const search = validateUserListSearch({ page: "2", page_size: 37 });
    expect(search.page).toBe(2);
    expect(search.page_size).toBeUndefined();
  });
});
