import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formatDueDate } from "./dates";

/** 1 Jan 2026 in the runtime's locale, built without reference to any zone offset. */
const JAN_1 = new Intl.DateTimeFormat(undefined, { timeZone: "UTC" }).format(Date.UTC(2026, 0, 1));

// Each input crosses midnight in its zone, so formatting in LOCAL time — the bug —
// gives a different day and fails (spec §7.2, F12). The zone is stubbed in this
// file only; no suite-wide TZ.
describe.each([
  ["Asia/Tokyo", "2026-01-01T20:00:00Z", 2], // local: 2 Jan, 05:00
  ["America/Bogota", "2026-01-01T02:00:00Z", 31], // local: 31 Dec, 21:00
])("formatDueDate under %s", (zone, iso, localDay) => {
  beforeEach(() => {
    vi.stubEnv("TZ", zone);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("runs in that zone (precondition)", () => {
    expect(new Date(iso).getDate()).toBe(localDay);
  });

  it("shows the UTC day, with no time", () => {
    expect(formatDueDate(iso)).toBe(JAN_1);
    expect(formatDueDate(iso)).not.toMatch(/:/);
  });
});
