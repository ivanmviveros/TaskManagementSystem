import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll, beforeEach, expect } from "vitest";

import { server } from "./msw-server";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// frontend §9: no console errors or warnings in the flows touched.
// Messages are COLLECTED and asserted in afterEach rather than thrown from
// inside console.error — throwing mid-React-render unwinds the renderer and
// produces a stack trace that hides the actual message.
const original = { error: console.error, warn: console.warn };
let captured: string[] = [];
let allowed: RegExp[] = [];

/**
 * Opt out of the console guard for one expected message.
 *
 * Needed because React itself writes to console.error for act() warnings and
 * error-boundary reports, and several planned tests deliberately render an
 * error state. Without this, those tests would fail on console noise rather
 * than on behaviour — which teaches people to delete the guard.
 */
export function allowConsole(pattern: RegExp): void {
  allowed.push(pattern);
}

beforeEach(() => {
  captured = [];
  allowed = [];
  console.error = (...args) => captured.push(`error: ${args.join(" ")}`);
  console.warn = (...args) => captured.push(`warn: ${args.join(" ")}`);
});

afterEach(() => {
  console.error = original.error;
  console.warn = original.warn;
  const unexpected = captured.filter((line) => !allowed.some((p) => p.test(line)));
  expect(unexpected, "unexpected console output").toEqual([]);
});
